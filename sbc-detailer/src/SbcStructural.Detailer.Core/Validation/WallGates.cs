using System;
using System.Collections.Generic;
using System.Linq;
using SbcStructural.Detailer.Contracts;

namespace SbcStructural.Detailer.Validation
{
    /// <summary>Wall gates mirroring the column ones (plan §17): G0 geometry, G1 mandatory fields, G5 shear, G6 min steel, G7 constructability.</summary>
    public static class WallGates
    {
        static string M(WallPierDesignRecord r, WallPierGeometry g) { return g != null ? g.Key?.ToString() ?? g.Storey : r?.Key?.ToString() ?? "?"; }

        public static List<Finding> G0(WallPierGeometry g, WallPierDesignRecord r)
        {
            var f = new List<Finding>(); string m = M(r, g);
            if (g == null || g.Tw_mm <= 0 || g.Lw_mm <= 0) f.Add(new Finding(Status.Incomplete, "G0", m, "wall geometry invalid (Tw/Lw missing or non-positive)"));
            if (r == null) f.Add(new Finding(Status.Incomplete, "G0", m, "no wall design record"));
            return f;
        }

        /// <summary>G1 + G6: mandatory design data. Missing values are never defaulted (D29).</summary>
        public static List<Finding> G1G6(WallPierGeometry g, WallPierDesignRecord r)
        {
            var f = new List<Finding>(); string m = M(r, g);
            Action<string, string> inc = (msg, hint) => f.Add(new Finding(Status.Incomplete, "G6", m, "STATUS: INCOMPLETE - " + msg, "D29", hint));
            if (!r.Fck_MPa.HasValue) inc("fck missing (section definition)", "supply fck in the design source");
            if (!r.Fy_MPa.HasValue) inc("fy missing (section definition)", "supply fy in the design source");
            if (!r.AsVReq_mm2_per_m.HasValue && !r.RhoVReq_pct.HasValue) inc("RhoVReq/AsVReq missing", "export vertical steel ratio from the design source");
            if (!r.AsHReq_mm2_per_m.HasValue && !r.RhoHReq_pct.HasValue) inc("RhoHReq/AsHReq missing", "export horizontal steel ratio from the design source");
            if (!r.BoundaryElementRequired.HasValue) inc("boundary-element flag not supplied", "the Detailer never re-runs the IS 13920 10.4.1 check (D29)");
            else if (r.BoundaryElementRequired == true && !r.BoundaryElementLength_mm.HasValue)
                inc("BE length not supplied", "supply BoundaryElementLength_mm from the design source (D29)");
            return f;
        }

        /// <summary>D35 style: Ah,prov/s >= AvsHoriz per leg (approx: Av/s*0.87*fy*dw; dw~0.8 lw per Appendix C §B simplification).</summary>
        public static List<Finding> CheckShear(WallDetail d, WallPierDesignRecord r)
        {
            var f = new List<Finding>(); string m = d.Mark;
            if (r.Envelope == null) return f;
            double dw = 0.8 * d.Lw_mm;
            double vuProvided = d.AhProvided_mm2_per_m / 1000.0 * 0.87 * d.Fy_MPa * dw / 1000.0;   // kN, approx (D35)
            if (vuProvided + 1e-6 < r.Envelope.Vu_kN)
                f.Add(new Finding(Status.Failed, "G5", m, string.Format("shear check: provided {0:0.0} kN < Vu {1:0.0} kN ({2})", vuProvided, r.Envelope.Vu_kN, r.Envelope.Combo), "D35"));
            return f;
        }

        public static List<Finding> G6MinSteel(WallDetail d)
        {
            var f = new List<Finding>(); string m = d.Mark;
            foreach (var z in d.Zones.Where(x => x.Kind == WallZoneKind.Web))
            {
                double provV = Math.PI * z.VertDia * z.VertDia / 4.0 / z.VertSpacing_mm * 1000.0 * (d.TwoCurtains ? 2 : 1);
                double minAs = 0.25 / 100.0 * d.Tw_mm * 1000.0;
                if (provV + 1e-6 < minAs) f.Add(new Finding(Status.Failed, "G6", m, string.Format("vertical steel {0:0} < min 0.25% ({1:0} mm2/m)", provV, minAs), "Appendix C §B"));
            }
            return f;
        }

        public static List<Finding> G7(WallDetail d)
        {
            var f = new List<Finding>(); string m = d.Mark;
            foreach (var z in d.Zones)
            {
                if (z.VertSpacing_mm < 75) f.Add(new Finding(Status.Warning, "G7", m, "vertical bar spacing " + z.VertSpacing_mm + " < 75 (constructability)"));
                if (z.HorizSpacing_mm < 75) f.Add(new Finding(Status.Warning, "G7", m, "horizontal bar spacing " + z.HorizSpacing_mm + " < 75 (constructability)"));
                if (z.TieSpacing_mm.HasValue && z.TieSpacing_mm.Value < 75) f.Add(new Finding(Status.Warning, "G7", m, "BE tie spacing " + z.TieSpacing_mm + " < 75 (constructability)"));
            }
            return f;
        }
    }
}
