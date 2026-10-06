using System;

namespace Sbc.Codes
{
    /// <summary>IS 456:2000 values, implemented fresh (D37). Public API is kept so the SbcCalc port can replace the body.</summary>
    public static class Is456
    {
        const string Ed = "IS 456:2000";

        // Table 16 nominal cover (mm) by exposure; columns also >= 40 and >= bar dia (26.4.2.1).
        public static CodeValue<double> ExposureCover(Exposure e)
        {
            double v = e == Exposure.Mild ? 20 : e == Exposure.Moderate ? 30 : e == Exposure.Severe ? 45 : e == Exposure.VerySevere ? 50 : 75;
            return new CodeValue<double>(v, "IS 456 26.4.2 Table 16", Ed, "mild 20, moderate 30, severe 45, very severe 50, extreme 75");
        }

        public static CodeValue<double> ColumnCover(Exposure e, double barDia)
        {
            double v = Math.Max(40, Math.Max(barDia, ExposureCover(e).Value));
            return new CodeValue<double>(v, "IS 456 26.4.2.1; Table 16; Table 16A", Ed, "max(40, bar dia, exposure); fire 40 mm covers 0.5-4 h columns");
        }

        public static CodeValue<double> MinSteelPct { get { return new CodeValue<double>(0.8, "IS 456 26.5.3.1(a)", Ed, "of gross area"); } }
        public static CodeValue<double> MaxSteelPct { get { return new CodeValue<double>(6.0, "IS 456 26.5.3.1(a)", Ed, "hard fail above"); } }
        public static CodeValue<double> WarnSteelPct { get { return new CodeValue<double>(4.0, "IS 456 26.5.3.1(a) note; office C-L2", Ed, "practical maximum, lap zone doubles bar area"); } }
        public static CodeValue<int> MinBarDia { get { return new CodeValue<int>(12, "IS 456 26.5.3.1(d)", Ed); } }
        public static CodeValue<int> MinBars(bool circular)
        { return new CodeValue<int>(circular ? 6 : 4, "IS 456 26.5.3.1(c)", Ed, "polygonal: one bar per vertex, >= 4 (office/SP 34 interpretation)"); }
        public static CodeValue<double> MaxPeripherySpacing { get { return new CodeValue<double>(300, "IS 456 26.5.3.1(g)", Ed, "c/c along periphery (verify letter; 300 mm is certain)"); } }
        public static CodeValue<double> MaxClearToSupported { get { return new CodeValue<double>(150, "IS 456 26.5.3.2(b)", Ed, "clear distance to a laterally supported bar"); } }

        public static CodeValue<double> MinClearSpacing(double barDia, double aggregate)
        { return new CodeValue<double>(Math.Max(barDia, aggregate + 5), "IS 456 26.3.2", Ed, "max(bar dia, aggregate + 5)"); }

        /// <summary>Tie dia >= max(dia/4, 6), rounded up to 6/8/10/12/16 (26.5.3.2(c)(2)).</summary>
        public static CodeValue<int> TieDia(double maxBarDia)
        {
            double req = Math.Max(maxBarDia / 4.0, 6);
            int[] std = { 6, 8, 10, 12, 16 };
            int d = 16;
            foreach (int s in std) if (s >= req - 1e-9) { d = s; break; }
            return new CodeValue<int>(d, "IS 456 26.5.3.2(c)(2)", Ed);
        }

        /// <summary>Tie pitch <= min(least lateral dim, 16 x smallest bar, 300).</summary>
        public static CodeValue<double> TiePitchLimit(double leastDim, double minBarDia)
        { return new CodeValue<double>(Math.Min(leastDim, Math.Min(16 * minBarDia, 300)), "IS 456 26.5.3.2(c)(1)", Ed); }

        /// <summary>Bars effectively tied in two directions at <= 48 x tie dia may have intermediate bars tied by open ties.</summary>
        public static CodeValue<double> TwoDirectionTieSpan(double tieDia)
        { return new CodeValue<double>(48 * tieDia, "IS 456 26.5.3.2(b)(2)", Ed); }

        // Table 26.2.1.1 tau_bd for plain bars; x1.6 deformed (Fe500 HYSD), x1.25 compression.
        public static CodeValue<double> TauBd(double fck, bool deformed, bool compression)
        {
            double t = fck >= 50 ? 2.1 : fck >= 45 ? 2.0 : fck >= 40 ? 1.9 : fck >= 35 ? 1.7 : fck >= 30 ? 1.5 : fck >= 25 ? 1.4 : 1.2;
            if (deformed) t *= 1.6;
            if (compression) t *= 1.25;
            return new CodeValue<double>(t, "IS 456 26.2.1.1", Ed, "grade rounded down; M55+ constant at M50 value (verify)");
        }

        /// <summary>Ld = dia * 0.87 fy / (4 tau_bd), mm.</summary>
        public static CodeValue<double> DevelopmentLength(double fck, double fy, double dia, bool compression)
        {
            double ld = dia * 0.87 * fy / (4 * TauBd(fck, true, compression).Value);
            return new CodeValue<double>(ld, "IS 456 26.2.1", Ed);
        }

        /// <summary>Office lap multiple of dia for Fe500 (D9): M25 and below 50, M30 46, M35 40, M40+ 36.</summary>
        public static CodeValue<double> OfficeLapMultiple(double fck)
        {
            double m = fck <= 25 ? 50 : fck <= 30 ? 46 : fck <= 35 ? 40 : 36;
            return new CodeValue<double>(m, "IS 456 26.2.5.1(c); office table D9", "Office", "Fe500 only; tension lap, also covers compression");
        }

        public static CodeValue<double> OfficeLapMultiple(double fck, OfficeSettings office)
        {
            foreach (var kv in office.LapTable) if (fck <= kv.Key) return new CodeValue<double>(kv.Value, "IS 456 26.2.5.1(c); office table D9", "Office", "Fe500 only");
            return OfficeLapMultiple(fck);
        }

        /// <summary>
        /// Lap length (mm) = max(office table, Ld) x corner factor (D33) when the bar is a corner bar with cover &lt;= 2 dia;
        /// never below max(15 dia, 200) (26.2.5.1).
        /// </summary>
        public static CodeValue<double> LapLength(double fck, double fy, double dia, bool cornerBar, double cover, OfficeSettings office)
        {
            double basic = Math.Max(OfficeLapMultiple(fck, office).Value * dia, DevelopmentLength(fck, fy, dia, false).Value);
            bool factor = cornerBar && cover <= 2 * dia + 1e-9 && office.CornerLapFactor > 1.0;
            double l = basic * (factor ? office.CornerLapFactor : 1.0);
            l = Math.Max(l, Math.Max(15 * dia, 200));
            return new CodeValue<double>(Math.Ceiling(l / 5) * 5, "IS 456 26.2.5.1(c); 26.2.5.1(a)", Ed,
                factor ? "corner factor " + office.CornerLapFactor + " applied (D33)" : "corner factor NOT applied (not corner, cover >= 2 dia, or office factor 1.0)");
        }

        public static CodeValue<double> HookExtension(double tieDia)
        { return new CodeValue<double>(Math.Max(10 * tieDia, 75), "IS 456 26.2.2.1; IS 2502", Ed, "office 135 degree hooks; extension max(10d, 75) (verify bend radius)"); }

        public static CodeValue<double> MaxLappedDia { get { return new CodeValue<double>(36, "IS 456 26.2.5.1", Ed, "no laps above 36 mm: couplers"); } }
        public static CodeValue<double> StaggerFactor { get { return new CodeValue<double>(1.3, "IS 456 26.2.5.1(c)", Ed, "staggered if splices >= 1.3 x lap apart"); } }
    }
}
