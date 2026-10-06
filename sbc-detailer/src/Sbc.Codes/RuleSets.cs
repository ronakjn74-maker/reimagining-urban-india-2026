using System;
using System.Collections.Generic;

namespace Sbc.Codes
{
    public sealed class ZoneLimit
    {
        public string Name { get; set; }          // Confining | Mid | Lap | General
        public double From { get; set; }          // mm from bottom of clear height
        public double To { get; set; }
        public double MaxSpacing { get; set; }    // before shear limit and module rounding
        public string Clause { get; set; }
    }

    public sealed class ZoneLayout
    {
        public List<ZoneLimit> Zones { get; } = new List<ZoneLimit>();
        public double L0 { get; set; }
        public bool LapFits { get; set; } = true;
        public double LapStart { get; set; }
        public double LapEnd { get; set; }        // end of group B
        public List<string> Notes { get; } = new List<string>();
    }

    public abstract class ColumnRuleSet
    {
        public abstract string Id { get; }
        public abstract bool Ductile { get; }
        public SeismicCategory Seismic { get; protected set; }
        public OfficeSettings Office { get; set; } = new OfficeSettings();

        public CodeValue<int> TieDia(double maxBarDia)
        {
            var d = Is456.TieDia(maxBarDia);
            int min = Math.Max(Office.MinTieDia, Ductile ? Is13920.MinHoopDia.Value : 0);
            return d.Value >= min ? d : new CodeValue<int>(min, d.Clause + "; office/IS 13920 minimum", d.Edition);
        }

        /// <summary>Zones along the clear height hc (0..hc). lapLen = governing lap length.</summary>
        public abstract ZoneLayout Layout(double leastDim, double largerDim, double hc, double minBarDia, double lapLen);
    }

    public sealed class Is456OnlyRules : ColumnRuleSet
    {
        public Is456OnlyRules(SeismicCategory s) { Seismic = s; }
        public override string Id { get { return "IS456:2000"; } }
        public override bool Ductile { get { return false; } }

        public override ZoneLayout Layout(double leastDim, double largerDim, double hc, double minBarDia, double lapLen)
        {
            var r = new ZoneLayout();
            double sGen = Is456.TiePitchLimit(leastDim, minBarDia).Value;
            double lapEnd = Math.Min(hc, Office.GravityKicker + lapLen);
            r.LapStart = Office.GravityKicker; r.LapEnd = lapEnd;
            r.Zones.Add(new ZoneLimit { Name = "Lap", From = 0, To = lapEnd, MaxSpacing = Math.Min(Office.GravityLapTieSpacing, sGen), Clause = "IS 456 26.5.3.2(c)(1); office C-S13 (verify)" });
            if (hc > lapEnd) r.Zones.Add(new ZoneLimit { Name = "General", From = lapEnd, To = hc, MaxSpacing = sGen, Clause = "IS 456 26.5.3.2(c)(1)" });
            return r;
        }
    }

    public sealed class Is456Is13920Rules : ColumnRuleSet
    {
        public Is456Is13920Rules(SeismicCategory s) { Seismic = s; }
        public override string Id { get { return "IS456:2000+IS13920:2016"; } }
        public override bool Ductile { get { return true; } }

        public override ZoneLayout Layout(double leastDim, double largerDim, double hc, double minBarDia, double lapLen)
        {
            var r = new ZoneLayout();
            double l0 = Is13920.ConfiningLength(largerDim, hc).Value;
            double sConf = Is13920.ConfiningSpacing(leastDim, minBarDia).Value;
            double sMid = Math.Min(Is13920.MidSpacing(leastDim).Value, Is456.TiePitchLimit(leastDim, minBarDia).Value);
            double sLap = Math.Min(Is13920.LapHoopSpacing.Value, sMid);
            r.L0 = l0;
            const string cc = "IS 13920:2016 8.1", cm = "IS 13920:2016 7.4.2; IS 456 26.5.3.2(c)", cl = "IS 13920:2016 7.3.2 (verify 100 vs 150)";
            if (2 * l0 >= hc)
            {
                r.LapFits = false; r.Notes.Add("full height confinement: 2 l0 >= hc (C-H13); lap needs couplers");
                r.Zones.Add(new ZoneLimit { Name = "Confining", From = 0, To = hc, MaxSpacing = sConf, Clause = cc });
                return r;
            }
            double lapStart = Math.Max(hc / 4.0, l0);
            double lapEnd = lapStart + (1.3 + 1.0) * lapLen;                 // group A + 1.3 L stagger + group B
            double limit = Math.Min(hc - hc / 4.0, hc - l0);
            r.LapStart = lapStart; r.LapEnd = lapEnd;
            r.Zones.Add(new ZoneLimit { Name = "Confining", From = 0, To = l0, MaxSpacing = sConf, Clause = cc });
            if (lapEnd <= limit + 1e-6)
            {
                if (lapStart > l0) r.Zones.Add(new ZoneLimit { Name = "Mid", From = l0, To = lapStart, MaxSpacing = sMid, Clause = cm });
                r.Zones.Add(new ZoneLimit { Name = "Lap", From = lapStart, To = lapEnd, MaxSpacing = sLap, Clause = cl });
                if (hc - l0 > lapEnd) r.Zones.Add(new ZoneLimit { Name = "Mid", From = lapEnd, To = hc - l0, MaxSpacing = sMid, Clause = cm });
            }
            else
            {
                r.LapFits = false; r.Notes.Add("E-LAP-NOFIT: staggered lap 2.3 L does not fit in central half; couplers (IS 16172) proposed");
                r.Zones.Add(new ZoneLimit { Name = "Mid", From = l0, To = hc - l0, MaxSpacing = sMid, Clause = cm });
            }
            r.Zones.Add(new ZoneLimit { Name = "Confining", From = hc - l0, To = hc, MaxSpacing = sConf, Clause = cc });
            return r;
        }
    }

    public static class RuleSetFactory
    {
        public static ColumnRuleSet For(SeismicCategory s, OfficeSettings office = null)
        {
            ColumnRuleSet r = s == SeismicCategory.ZoneII ? (ColumnRuleSet)new Is456OnlyRules(s) : new Is456Is13920Rules(s);
            if (office != null) r.Office = office;
            return r;
        }
    }
}
