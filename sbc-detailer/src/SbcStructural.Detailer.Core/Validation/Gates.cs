using System;
using System.Collections.Generic;
using System.Linq;
using Sbc.Codes;
using SbcStructural.Detailer.Contracts;
using SbcStructural.Detailer.Engine;

namespace SbcStructural.Detailer.Validation
{
    /// <summary>Gates G0-G8 (plan section 17). Each returns Findings; Status.Ok = pass.</summary>
    public static class Gates
    {
        static string M(ColumnDesignRecord r, CadMemberGeometry g) { return (g != null ? g.Mark + " @ " + g.StoreyId : r != null ? r.Key.ToString() : "?"); }

        public static List<Finding> G0(CadMemberGeometry g, ColumnDesignRecord r, ColumnRuleSet rules, OfficeSettings s)
        {
            var f = new List<Finding>(); string m = M(r, g);
            if (rules == null) f.Add(new Finding(Status.Incomplete, "G0", m, "rule set not selected (seismic category missing)", "D24"));
            if (s == null) f.Add(new Finding(Status.Incomplete, "G0", m, "office settings missing"));
            if (g == null || g.Polygon == null || g.Polygon.Verts == null || g.Polygon.Verts.Count < 3) f.Add(new Finding(Status.Incomplete, "G0", m, "no CAD section polygon"));
            if (r == null) f.Add(new Finding(Status.Incomplete, "G0", m, "no design record"));
            return f;
        }

        /// <summary>G1 + G6: mandatory design data. Missing values are never defaulted (D27).</summary>
        public static List<Finding> G1G6(CadMemberGeometry g, ColumnDesignRecord r)
        {
            var f = new List<Finding>(); string m = M(r, g);
            Action<string, string> inc = (msg, hint) => f.Add(new Finding(Status.Incomplete, "G6", m, "STATUS: INCOMPLETE - " + msg, "D27", hint));
            if (!r.Fck_MPa.HasValue) inc("fck missing (section definition)", "supply fck in the design source");
            if (!r.Fy_MPa.HasValue) inc("fy missing (section definition)", "supply fy in the design source");
            if (r.Stations == null || r.Stations.Count == 0 || r.Envelope == null) inc("no design stations", "re-export the design tables");
            else
            {
                if (r.Mode == DesignMode.Design && !r.Envelope.AsRequired_mm2.HasValue) inc("As,req missing in Design mode", "re-run the column design");
                if (r.Mode == DesignMode.Check && !r.Envelope.AsRequired_mm2.HasValue && !r.HasRebarTemplate) inc("Check-mode column without rebar template", null);
                if (!r.Envelope.AvsMajor_mm2_per_m.HasValue) inc("shear reinforcement Av/s major not supplied", "export Av/s from the design source");
                if (!r.Envelope.AvsMinor_mm2_per_m.HasValue) inc("shear reinforcement Av/s minor not supplied", "export Av/s from the design source");
            }
            if (g.ClearHeight_mm == null || g.ClearHeight_mm <= 0) inc("clear height unknown", "set storey levels / beam depths");
            if (g.BeamDepthTop_mm == null) f.Add(new Finding(Status.Warning, "G6", m, "beam depth at column top unknown: joint hoop zone not generated", "IS 13920:2016 9.3 (verify)"));
            if (r.FullHeightConfinement == null && r.FrameType == FrameType.Ductile) f.Add(new Finding(Status.Warning, "G6", m, "FullHeightConfinement not stated by design source", "IS 13920:2016 8.2-8.5 (verify)"));
            return f;
        }

        public static List<Finding> G2(MatchRecord mr)
        {
            var f = new List<Finding>(); string m = mr.Mark + " @ " + mr.StoreyId;
            if (mr.Level == MatchLevel.Failed) f.Add(new Finding(Status.MatchFailed, "G2", m, mr.Reason));
            else if (mr.Level != MatchLevel.Match) f.Add(new Finding(Status.Warning, "G2", m, "matched by position: " + mr.Reason));
            return f;
        }

        public static List<Finding> G3(CadMemberGeometry g, ColumnDesignRecord r, double conflictPct = 5, double posConflict = 100, double posWarn = 50, double rotTol = 5)
        {
            var f = new List<Finding>(); string m = M(r, g); var h = r.Geometry;
            if (h == null) return f;
            var dims = ColumnDetailer.Dims(g.Polygon);
            if (h.B_mm.HasValue && h.D_mm.HasValue)
            {
                double b = Math.Min(h.B_mm.Value, h.D_mm.Value), d = Math.Max(h.B_mm.Value, h.D_mm.Value);
                double dev = Math.Max(Math.Abs(dims.Item1 - b) / b, Math.Abs(dims.Item2 - d) / d) * 100;
                if (dev > conflictPct) f.Add(new Finding(Status.DataConflict, "G3", m, string.Format("CAD {0:0}x{1:0} vs design {2:0}x{3:0} ({4:0.0} % > {5} %)", dims.Item1, dims.Item2, b, d, dev, conflictPct), "D8"));
                else if (dev > 0.5) f.Add(new Finding(Status.Warning, "G3", m, string.Format("CAD section differs from design by {0:0.0} %; As,req unverified for CAD size", dev), "D8"));
            }
            if (h.Bottom != null)
            {
                double dist = PolygonUtil.Dist(PolygonUtil.Centroid(g.Polygon.Verts), h.Bottom);
                if (dist > posConflict) f.Add(new Finding(Status.DataConflict, "G3", m, string.Format("position: CAD centroid {0:0} mm from design point", dist), "D15"));
                else if (dist > posWarn) f.Add(new Finding(Status.Warning, "G3", m, string.Format("position: CAD centroid {0:0} mm from design point", dist), "D15"));
            }
            double rot = Math.Abs(((g.Rotation_deg - h.Angle_deg) % 180 + 180) % 180); if (rot > 90) rot = 180 - rot;
            if (rot > rotTol) f.Add(new Finding(Status.DataConflict, "G3", m, string.Format("rotation differs by {0:0.0} deg", rot), "D15"));
            return f;
        }

        public static List<Finding> G4(CadMemberGeometry g, ColumnDesignRecord r)
        {
            var f = new List<Finding>(); string m = M(r, g);
            if (r.Status == DesignStatus.Overstressed) f.Add(new Finding(Status.Failed, "G4", m, "O/S - redesign (nobody can override, D22)", "D22"));
            if (r.Status == DesignStatus.NotDesigned) f.Add(new Finding(Status.Failed, "G4", m, "column not designed", "D22"));
            if (r.Envelope != null && r.Envelope.PmmRatio > 1.0) f.Add(new Finding(Status.Failed, "G4", m, "PMM ratio > 1", "D22"));
            if (r.FrameTypeAssumed) f.Add(new Finding(Status.Warning, "G4", m, "frame type assumed"));
            return f;
        }

        /// <summary>D35: Asv,prov/s >= Av/s required, both directions, every zone.</summary>
        public static List<Finding> CheckShear(ColumnDetail d, double avsMajor, double avsMinor)
        {
            var f = new List<Finding>(); string m = d.Mark;
            foreach (var z in d.Zones)
            {
                if (z.AsvProvidedMajor_mm2_per_m + 1e-6 < avsMajor)
                    f.Add(new Finding(Status.Failed, "G5", m, string.Format("{0} zone {1:0}-{2:0}: Asv/s major {3:0} < required {4:0} mm2/m", z.Name, z.From_mm, z.To_mm, z.AsvProvidedMajor_mm2_per_m, avsMajor), "IS 456 40.4; D35"));
                if (z.AsvProvidedMinor_mm2_per_m + 1e-6 < avsMinor)
                    f.Add(new Finding(Status.Failed, "G5", m, string.Format("{0} zone {1:0}-{2:0}: Asv/s minor {3:0} < required {4:0} mm2/m", z.Name, z.From_mm, z.To_mm, z.AsvProvidedMinor_mm2_per_m, avsMinor), "IS 456 40.4; D35"));
            }
            return f;
        }

        public static List<Finding> G5(ColumnDetail d, ColumnDesignRecord r, ColumnRuleSet rules)
        {
            var f = new List<Finding>(); string m = d.Mark; var a = d.Arrangement; var off = rules.Office;
            Action<Status, string, string> add = (s, msg, cl) => f.Add(new Finding(s, "G5", m, msg, cl));
            int n = a.Bars.Count;
            // 3 min bars, dia
            if (n < Is456.MinBars(false).Value) add(Status.Failed, "bars " + n + " < 4", Is456.MinBars(false).Clause);
            if (a.BarDiaMin < Is456.MinBarDia.Value) add(Status.Failed, "bar dia < 12", Is456.MinBarDia.Clause);
            if (a.BarDiaMin != a.BarDiaMax && off.MaxDiasPerColumn < 2) add(Status.Warning, "more than allowed dias", "App. C C11-16");
            // 2 steel %
            double p = d.SteelPct;
            if (p < Is456.MinSteelPct.Value) add(Status.Failed, string.Format("steel {0:0.00} % < 0.8 %", p), Is456.MinSteelPct.Clause);
            if (p > Is456.MaxSteelPct.Value) add(Status.Failed, string.Format("steel {0:0.00} % > 6 %", p), Is456.MaxSteelPct.Clause);
            else if (p > Is456.WarnSteelPct.Value) add(Status.Warning, string.Format("steel {0:0.00} % > 4 %", p), Is456.WarnSteelPct.Clause);
            double lapPct = p * (1 + (rules.Ductile ? Is13920.MaxSplicedFraction.Value : 1.0));
            if (lapPct > Is456.MaxSteelPct.Value) add(Status.Failed, string.Format("lap zone steel {0:0.00} % > 6 %", lapPct), Is456.MaxSteelPct.Clause);
            // 1,4 clear and periphery spacing
            double minClear = Is456.MinClearSpacing(a.BarDiaMax, off.Aggregate).Value;
            for (int i = 0; i < n; i++)
            {
                var b0 = a.Bars[i]; var b1 = a.Bars[(i + 1) % n];
                double cc = PolygonUtil.Dist(b0.Centre, b1.Centre);
                if (cc - (b0.Dia + b1.Dia) / 2.0 < minClear - 1e-6) add(Status.Failed, string.Format("clear spacing {0:0} < {1:0}", cc - (b0.Dia + b1.Dia) / 2.0, minClear), "IS 456 26.3.2");
                if (cc > Is456.MaxPeripherySpacing.Value + 1e-6) add(Status.Failed, string.Format("periphery spacing {0:0} > 300", cc), Is456.MaxPeripherySpacing.Clause);
            }
            // 5 support rule
            for (int i = 0; i < n; i++)
            {
                var b = a.Bars[i];
                if (b.IsCorner && !b.IsSupported) add(Status.Failed, "corner bar " + i + " not laterally supported", "IS 456 26.5.3.2(b)");
                var nx = a.Bars[(i + 1) % n];
                if (!b.IsSupported && !nx.IsSupported && !b.IsCorner && !nx.IsCorner) add(Status.Failed, "two consecutive unsupported bars at " + i, "IS 456 26.5.3.2(b)");
                if (!b.IsSupported)
                {
                    double best = double.MaxValue;
                    foreach (var o in a.Bars.Where(x => x.IsSupported)) best = Math.Min(best, PolygonUtil.Dist(b.Centre, o.Centre) - (b.Dia + o.Dia) / 2.0);
                    if (best > Is456.MaxClearToSupported.Value + 1e-6) add(Status.Failed, "bar " + i + " is " + best.ToString("0") + " mm clear from a supported bar", Is456.MaxClearToSupported.Clause);
                }
            }
            if (rules.Ductile)
            {
                foreach (var c in a.CrossTies.Where(x => x.EngagesHoopOnly)) add(Status.Failed, "cross-tie engages hoop only in a ductile member", "IS 13920:2016 7.4.2");
                foreach (var c in a.CrossTies.Where(x => x.HookA != HookType.Deg135 || x.HookB != HookType.Deg135)) add(Status.Failed, "cross-tie not 135/135", "IS 13920:2016 7.4.2");
                if (a.HMajor_mm > 300 + 1e-6 || a.HMinor_mm > 300 + 1e-6) add(Status.Failed, string.Format("tied leg spacing {0:0}/{1:0} > 300", a.HMajor_mm, a.HMinor_mm), Is13920.MaxLegSpacing.Clause);
            }
            // 6 tie dia
            var td = rules.TieDia(a.BarDiaMax);
            if (d.TieDia < td.Value) add(Status.Failed, "tie dia " + d.TieDia + " < " + td.Value, td.Clause);
            // 7 pitch per zone
            double least = Math.Min(ColumnDetailer.Dims(d.Section).Item1, ColumnDetailer.Dims(d.Section).Item2);
            double pitch = Is456.TiePitchLimit(least, a.BarDiaMin).Value;
            foreach (var z in d.Zones)
            {
                if (z.Spacing_mm > pitch + 1e-6) add(Status.Failed, z.Name + " pitch " + z.Spacing_mm + " > " + pitch, "IS 456 26.5.3.2(c)(1)");
                if (rules.Ductile && z.Name == ZoneName.Confining && z.Spacing_mm > Is13920.ConfiningSpacing(least, a.BarDiaMin).Value + 1e-6) add(Status.Failed, "confining spacing too large", "IS 13920:2016 8.1");
                if (rules.Ductile && z.Name == ZoneName.Lap && z.Spacing_mm > Is13920.LapHoopSpacing.Value + 1e-6) add(Status.Failed, "lap hoops > 100", "IS 13920:2016 7.3.2 (verify)");
                if (rules.Ductile && z.Name == ZoneName.Mid && z.Spacing_mm > Is13920.MidSpacing(least).Value + 1e-6) add(Status.Failed, "mid spacing > B/2", "IS 13920:2016 7.4.2");
            }
            // 8 Ash
            if (rules.Ductile && d.Fck_MPa > 0)
            {
                double ast = Math.PI * d.TieDia * d.TieDia / 4.0;
                foreach (var z in d.Zones.Where(x => x.Name == ZoneName.Confining))
                {
                    double reqM = Is13920.AshRect(z.Spacing_mm, Math.Min(a.HMajor_mm, 300), d.Fck_MPa, d.Fy_MPa, a.Ag_mm2, a.Ak_mm2).Value;
                    double reqm = Is13920.AshRect(z.Spacing_mm, Math.Min(a.HMinor_mm, 300), d.Fck_MPa, d.Fy_MPa, a.Ag_mm2, a.Ak_mm2).Value;
                    if (a.LegsMajor * ast + 1e-6 < reqM) add(Status.Failed, string.Format("Ash major {0:0} < {1:0} mm2", a.LegsMajor * ast, reqM), "IS 13920:2016 7.6.1(a)");
                    if (a.LegsMinor * ast + 1e-6 < reqm) add(Status.Failed, string.Format("Ash minor {0:0} < {1:0} mm2", a.LegsMinor * ast, reqm), "IS 13920:2016 7.6.1(a)");
                }
            }
            // 10 laps
            foreach (var l in d.Laps) if (l.Dia > Is456.MaxLappedDia.Value) add(Status.Failed, "lap of dia > 36", Is456.MaxLappedDia.Clause);
            // shear D35
            if (r != null && r.Envelope != null && r.Envelope.AvsMajor_mm2_per_m.HasValue && r.Envelope.AvsMinor_mm2_per_m.HasValue)
                f.AddRange(CheckShear(d, r.Envelope.AvsMajor_mm2_per_m.Value, r.Envelope.AvsMinor_mm2_per_m.Value));
            foreach (var s in a.Diagnostics) f.Add(new Finding(Status.Warning, "G5", m, s));
            if (!f.Any(x => x.Status == Status.Failed)) f.Add(new Finding(Status.Ok, "G5", m, "all rule checks passed", "App. C C11"));
            return f;
        }

        public static List<Finding> G7(ColumnDetail d, ColumnRuleSet rules)
        {
            var f = new List<Finding>(); string m = d.Mark;
            if (d.Arrangement.CrossTies.Count > rules.Office.MaxCrossTiesPerSet) f.Add(new Finding(Status.Warning, "G7", m, "congested: " + d.Arrangement.CrossTies.Count + " cross-ties in the set", "App. C C11-17"));
            foreach (var z in d.Zones.Where(x => x.Name == ZoneName.Confining && x.Spacing_mm < Is13920.ConfiningFloorOffice.Value))
            { f.Add(new Finding(Status.Warning, "G7", m, "E-CONF-TIGHT: confining spacing " + z.Spacing_mm + " < 75 (constructability)", "Office F-9")); break; }
            if (d.Laps.Any(l => l.Coupler)) f.Add(new Finding(Status.Warning, "G7", m, "E-LAP-NOFIT: lap does not fit in the central half; couplers (IS 16172) proposed", "IS 13920:2016 7.3.2"));
            return f;
        }
    }
}
