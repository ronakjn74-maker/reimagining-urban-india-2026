using System;

namespace Sbc.Codes
{
    /// <summary>IS 13920:2016 ductile column rules (App. C A2/A4). Clause numbers marked (verify) need the BIS copy.</summary>
    public static class Is13920
    {
        const string Ed = "IS 13920:2016";

        public static CodeValue<int> MinHoopDia { get { return new CodeValue<int>(8, "IS 13920:2016 6.3.2, 7.4.1", Ed, "(verify) whether 7.4.x states 8 mm for columns or inherits 6.3.2; office 8 mm"); } }

        public static CodeValue<double> HookExtension(double hoopDia)
        { return new CodeValue<double>(Math.Max(10 * hoopDia, 75), "IS 13920:2016 7.4.1", Ed, "135 degree hook, 10d but >= 75 mm"); }

        public static CodeValue<double> MaxLegSpacing { get { return new CodeValue<double>(300, "IS 13920:2016 7.4.2; 7.6.1(a) note on h", Ed, "cross-tie needed if any hoop side > 300 (verify sub-clause)"); } }

        /// <summary>l0 = max(D, hc/6, 450) from the joint face.</summary>
        public static CodeValue<double> ConfiningLength(double largerDim, double clearHeight)
        { return new CodeValue<double>(Math.Max(largerDim, Math.Max(clearHeight / 6.0, 450)), "IS 13920:2016 8.1", Ed); }

        /// <summary>Confining spacing = min(B/4, 6 db, 100). Floor 75 is an office constructability limit, not code.</summary>
        public static CodeValue<double> ConfiningSpacing(double leastDim, double minBarDia)
        { return new CodeValue<double>(Math.Min(leastDim / 4.0, Math.Min(6 * minBarDia, 100)), "IS 13920:2016 8.1", Ed, "75 mm floor is office rule F-9, not code"); }

        public static CodeValue<double> ConfiningFloorOffice { get { return new CodeValue<double>(75, "Office F-9 (1993 cl. 7.4.6)", "Office", "constructability, warn below"); } }

        /// <summary>Mid-height spacing B/2 (IS 456 16 db and 300 still apply, applied by the rule set).</summary>
        public static CodeValue<double> MidSpacing(double leastDim)
        { return new CodeValue<double>(leastDim / 2.0, "IS 13920:2016 7.4.2", Ed, "(verify sub-clause; 1993 was 7.3.3)"); }

        public static CodeValue<double> LapHoopSpacing { get { return new CodeValue<double>(100, "IS 13920:2016 7.3.2", Ed, "(verify 100 vs 150 in 2016 text)"); } }
        public static CodeValue<double> MaxSplicedFraction { get { return new CodeValue<double>(0.5, "IS 13920:2016 7.3.2", Ed, "at most 50 % of bars at a section"); } }
        public static CodeValue<double> JointSpacing { get { return new CodeValue<double>(150, "IS 13920:2016 9.3", Ed, "(verify) half-area vs 150 mm wording"); } }
        public static CodeValue<double> FootingExtension { get { return new CodeValue<double>(300, "IS 13920:2016 8.5", Ed, "(verify numbering) confining hoops into footing"); } }

        /// <summary>Ash per unit spacing (mm2/mm) for rectangular hoops, 7.6.1(a): max(0.18 h fck/fy (Ag/Ak-1), 0.05 h fck/fy). h &lt;= 300.</summary>
        public static CodeValue<double> AshOverSRect(double h, double fck, double fy, double ag, double ak)
        {
            double r = fck / fy;
            double v = Math.Max(0.18 * h * r * (ag / ak - 1.0), 0.05 * h * r);
            return new CodeValue<double>(v, "IS 13920:2016 7.6.1(a)", Ed, "Ak = core to outer face of hoop; h = c/c leg spacing <= 300");
        }

        /// <summary>Ash = sv x AshOverSRect.</summary>
        public static CodeValue<double> AshRect(double sv, double h, double fck, double fy, double ag, double ak)
        { var o = AshOverSRect(h, fck, fy, ag, ak); return new CodeValue<double>(o.Value * sv, o.Clause, o.Edition, o.Note); }

        /// <summary>Circular/spiral, 7.6.1(c): max(0.09 Dk fck/fy (Ag/Ak-1), 0.024 Dk fck/fy) per unit spacing.</summary>
        public static CodeValue<double> AshOverSCircular(double dk, double fck, double fy, double ag, double ak)
        {
            double r = fck / fy;
            double v = Math.Max(0.09 * dk * r * (ag / ak - 1.0), 0.024 * dk * r);
            return new CodeValue<double>(v, "IS 13920:2016 7.6.1(c)", Ed, "Dk = core dia to outer face of spiral");
        }
        public static CodeValue<double> AshCircular(double sv, double dk, double fck, double fy, double ag, double ak)
        { var o = AshOverSCircular(dk, fck, fy, ag, ak); return new CodeValue<double>(o.Value * sv, o.Clause, o.Edition, o.Note); }
    }
}
