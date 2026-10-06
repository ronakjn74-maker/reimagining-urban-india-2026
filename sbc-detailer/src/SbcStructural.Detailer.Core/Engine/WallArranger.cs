using System;
using System.Collections.Generic;
using System.Linq;
using Sbc.Codes;
using SbcStructural.Detailer.Contracts;

namespace SbcStructural.Detailer.Engine
{
    public sealed class WallArrangeResult
    {
        public WallDetail Detail;
        public List<string> Notes = new List<string>();
        public string Error;
    }

    /// <summary>
    /// Appendix C §B wall rules, kept deliberately simple for M3: zones along the wall length
    /// (BE-END / WEB / BE-END), min steel 0.25% each way unless two curtains are forced, and a column-style
    /// confinement check for the BE (same Ash/tie-spacing rules as IS 13920 7.6.1(a)). Openings are noted only
    /// (W-OPENING-NOTE); no boundary-around-opening detailing (out of scope for M3).
    /// </summary>
    public static class WallArranger
    {
        const double MinWallSteelPct = 0.25;   // Appendix C §B, each way, each face combined

        public static WallArrangeResult Arrange(WallPierGeometry geo, WallPierDesignRecord design, ColumnRuleSet rules, OfficeSettings office)
        {
            var res = new WallArrangeResult();
            double tw = geo.Tw_mm, lw = geo.Lw_mm;
            double fck = design.Fck_MPa.Value, fy = design.Fy_MPa.Value;

            // two curtains required unless tw <= 200 and tau_v <= 0.25 sqrt(fck) (D31 style criterion)
            double tauV = design.TauV_MPa ?? (design.Envelope != null ? design.Envelope.Vu_kN * 1000.0 / (tw * lw) : 0);
            bool twoCurtains = !(tw <= 200 && tauV <= 0.25 * Math.Sqrt(fck));

            double asVReq = design.AsVReq_mm2_per_m ?? (design.RhoVReq_pct.HasValue ? design.RhoVReq_pct.Value / 100.0 * tw * 1000.0 : 0);
            double asHReq = design.AsHReq_mm2_per_m ?? (design.RhoHReq_pct.HasValue ? design.RhoHReq_pct.Value / 100.0 * tw * 1000.0 : 0);
            double minAs = MinWallSteelPct / 100.0 * tw * 1000.0;
            asVReq = Math.Max(asVReq, minAs);
            asHReq = Math.Max(asHReq, minAs);

            var vert = PickBarDiaSpacing(asVReq, twoCurtains ? 2 : 1, office);
            var horiz = PickBarDiaSpacing(asHReq, twoCurtains ? 2 : 1, office);
            if (vert == null || horiz == null) { res.Error = "E-WALL-INFEASIBLE: no preferred dia/spacing meets required steel"; return res; }

            var d = new WallDetail
            {
                Tw_mm = tw, Lw_mm = lw, Fck_MPa = fck, Fy_MPa = fy, TwoCurtains = twoCurtains, TauV_MPa = tauV,
                AhProvided_mm2_per_m = horiz.Item1 * (twoCurtains ? 2 : 1), RuleSetId = rules.Id
            };

            bool beReq = design.BoundaryElementRequired == true;
            double beLen = design.BoundaryElementLength_mm ?? 0;
            if (beReq && beLen > 0 && beLen * 2 < lw)
            {
                d.Zones.Add(BeZone(0, beLen, fck, fy, tw, office));
                d.Zones.Add(WebZone(beLen, lw - beLen, vert, horiz));
                d.Zones.Add(BeZone(lw - beLen, lw, fck, fy, tw, office));
            }
            else
            {
                d.Zones.Add(WebZone(0, lw, vert, horiz));
            }

            if (geo.Openings != null && geo.Openings.Count > 0)
                res.Notes.Add("W-OPENING-NOTE: " + geo.Openings.Count + " opening(s) in wall; trimmer-bar detailing around openings is out of scope for M3 (text note only)");

            res.Detail = d;
            return res;
        }

        static WallZone WebZone(double from, double to, Tuple<double, int, double> vert, Tuple<double, int, double> horiz)
        {
            return new WallZone
            {
                Kind = WallZoneKind.Web, From_mm = from, To_mm = to,
                VertDia = vert.Item2, VertSpacing_mm = vert.Item3, HorizDia = horiz.Item2, HorizSpacing_mm = horiz.Item3,
                Clause = "Appendix C §B (min 0.25% each way, or two-curtains criterion)"
            };
        }

        /// <summary>BE treated with the same confinement rules as a column (D29 note): tie spacing min(B/4,6db,100), Ash per 7.6.1(a).
        /// End bars default 4-T12 two layers when geometry does not otherwise drive a bigger bar (App. C / D9).</summary>
        static WallZone BeZone(double from, double to, double fck, double fy, double tw, OfficeSettings office)
        {
            int barDia = 16;
            int tieDia = 8;
            double s = Math.Min(tw / 4.0, Math.Min(6 * barDia, 100));
            s = office.FloorToModule(s);
            return new WallZone
            {
                Kind = WallZoneKind.BoundaryElement, From_mm = from, To_mm = to,
                VertDia = barDia, VertSpacing_mm = 150, HorizDia = 10, HorizSpacing_mm = 150,
                TieDia = tieDia, TieSpacing_mm = s, Clause = "IS 13920:2016 7.6.1(a); column-style confinement (D29)"
            };
        }

        /// <summary>(barArea provided per m single curtain, dia, spacing) for the smallest preferred dia meeting asReq over `curtains` curtains.</summary>
        static Tuple<double, int, double> PickBarDiaSpacing(double asReqTotal, int curtains, OfficeSettings office)
        {
            double perCurtain = asReqTotal / curtains;
            foreach (int dia in office.PreferredDias.OrderBy(x => x))
            {
                double barArea = Math.PI * dia * dia / 4.0;
                double sMax = Math.Min(450, 3 * 150);  // IS 456 26.3.3(b)/13920 10.1.4-ish cap; office module below
                double s = Math.Min(sMax, barArea * 1000.0 / perCurtain);
                s = office.FloorToModule(s);
                if (s < 75) continue;   // too tight, try next dia
                return Tuple.Create(barArea * 1000.0 / s, dia, s);
            }
            return null;
        }
    }
}
