using System;
using System.Collections.Generic;
using System.Linq;
using Sbc.Codes;
using SbcStructural.Detailer.Contracts;

namespace SbcStructural.Detailer.Engine
{
    /// <summary>Zones along the clear height (App. C A6/C10) with spacing = min(detailing limit, shear limit D35, Ash limit), floored to the office module.</summary>
    public static class ColumnDetailer
    {
        public sealed class Result { public ColumnDetail Detail; public string Error; public List<string> Notes = new List<string>(); }

        public static Result Build(Polygon section, double asReq, int? chosenN, int? chosenDia, double fck, double fy,
                                   double hc, double avsMajor, double avsMinor, double cover, ColumnRuleSet rules)
        {
            var res = new Result(); var off = rules.Office;
            ArrangeResult ar = null; List<TieZone> zones = null; ZoneLayout lay = null; int tie = 0;
            // tie dia loop: among dias where spacing stays >= 75 and Ash does not govern, minimise tie weight (sum count x dia^2); else the largest
            var tieTry = new[] { 8, 10, 12, 16 };
            double bestCost = double.MaxValue;
            foreach (int t in tieTry)
            {
                var a = ColumnArranger.Arrange(section, asReq, chosenN, chosenDia, t, cover, rules);
                if (a.Error != null) { res.Error = a.Error; return res; }
                if (t < rules.TieDia(a.Arrangement.BarDiaMax).Value) continue;
                double llap = LapLength(a.Arrangement, fck, fy, cover, off);
                var dm = Dims(section);
                var layout = rules.Layout(Math.Min(dm.Item1, dm.Item2), Math.Max(dm.Item1, dm.Item2), hc, a.Arrangement.BarDiaMin, llap);
                var z = Zones(a.Arrangement, layout, t, fck, fy, avsMajor, avsMinor, rules);
                bool valid = z.All(q => q.Spacing_mm >= 75 && q.Governed != "confinement");
                double cost = z.Sum(q => q.Count * (double)t * t);
                if (ar == null || (valid && cost < bestCost) || (!valid && bestCost == double.MaxValue)) { ar = a; zones = z; lay = layout; tie = t; if (valid) bestCost = cost; }
            }
            if (ar == null) { res.Error = "E-TIE: no tie dia"; return res; }
            ar.Arrangement.TieDia = tie;

            double ag = ar.Arrangement.Ag_mm2;
            double asProv = ar.Arrangement.Bars.Sum(b => Math.PI * b.Dia * b.Dia / 4.0);
            var d = new ColumnDetail
            {
                Section = section, Cover_mm = cover, Arrangement = ar.Arrangement, Zones = zones, ClearHeight_mm = hc,
                Ductile = rules.Ductile, TieDia = tie, Fck_MPa = fck, Fy_MPa = fy, AsRequired_mm2 = asReq, AsProvided_mm2 = asProv,
                SteelPct = asProv / ag * 100, RuleSetId = rules.Id
            };
            // laps
            double L = LapLength(ar.Arrangement, fck, fy, cover, off);
            int ld = ar.Arrangement.BarDiaMax;
            if (rules.Ductile)
            {
                d.Laps.Add(new LapSpec { Start_mm = lay.LapStart, Length_mm = L, Group = LapGroup.A, Dia = ld, Coupler = !lay.LapFits });
                d.Laps.Add(new LapSpec { Start_mm = lay.LapStart + 1.3 * L, Length_mm = L, Group = LapGroup.B, Dia = ld, Coupler = !lay.LapFits });
            }
            else d.Laps.Add(new LapSpec { Start_mm = lay.LapStart, Length_mm = L, Group = LapGroup.A, Dia = ld, Coupler = false });
            res.Notes.AddRange(lay.Notes);
            res.Detail = d;
            return res;
        }

        public static Tuple<double, double> Dims(Polygon p)
        {   // (extent across D direction = B, extent along D)
            var md = ColumnArranger.MajorDir(p.Verts);
            double umin = double.MaxValue, umax = double.MinValue, vmin = double.MaxValue, vmax = double.MinValue;
            foreach (var q in p.Verts)
            {
                double u = q.X * md.Item1 + q.Y * md.Item2, v = -q.X * md.Item2 + q.Y * md.Item1;
                umin = Math.Min(umin, u); umax = Math.Max(umax, u); vmin = Math.Min(vmin, v); vmax = Math.Max(vmax, v);
            }
            return Tuple.Create(vmax - vmin, umax - umin);
        }

        static double LapLength(SectionArrangement a, double fck, double fy, double cover, OfficeSettings off)
        {
            double l = 0;
            foreach (var g in a.Bars.GroupBy(b => new { b.Dia, b.IsCorner }))
                l = Math.Max(l, Is456.LapLength(fck, fy, g.Key.Dia, g.Key.IsCorner, cover, off).Value);
            return l;
        }

        static List<TieZone> Zones(SectionArrangement a, ZoneLayout lay, int tie, double fck, double fy, double avsMajor, double avsMinor, ColumnRuleSet rules)
        {
            var off = rules.Office; double ast = Math.PI * tie * tie / 4.0;
            var list = new List<TieZone>();
            foreach (var zl in lay.Zones)
            {
                double s = off.FloorToModule(zl.MaxSpacing); string gov = "detailing";
                double sh = Math.Min(Limit(a.LegsMajor * ast * 1000, avsMajor), Limit(a.LegsMinor * ast * 1000, avsMinor));
                sh = off.FloorToModule(sh);
                if (sh < s) { s = sh; gov = "shear"; }
                if (rules.Ductile && zl.Name == "Confining")
                {
                    double rM = Is13920.AshOverSRect(Math.Min(a.HMajor_mm, 300), fck, fy, a.Ag_mm2, a.Ak_mm2).Value;
                    double rm = Is13920.AshOverSRect(Math.Min(a.HMinor_mm, 300), fck, fy, a.Ag_mm2, a.Ak_mm2).Value;
                    double sa = off.FloorToModule(Math.Min(Limit(a.LegsMajor * ast, rM), Limit(a.LegsMinor * ast, rm)));
                    if (sa < s) { s = sa; gov = "confinement"; }
                }
                if (s < off.SpacingModule) s = off.SpacingModule;
                var name = (ZoneName)Enum.Parse(typeof(ZoneName), zl.Name);
                list.Add(new TieZone
                {
                    From_mm = zl.From, To_mm = zl.To, Spacing_mm = s, Name = name, Clause = zl.Clause, Governed = gov,
                    Count = (int)Math.Ceiling((zl.To - zl.From) / s - 1e-9),
                    AsvProvidedMajor_mm2_per_m = a.LegsMajor * ast * 1000 / s, AsvProvidedMinor_mm2_per_m = a.LegsMinor * ast * 1000 / s
                });
            }
            return list;
        }

        // largest spacing s such that num/s >= req (num already scaled)
        static double Limit(double num, double req) { return req <= 0 ? double.MaxValue : num / req; }
    }
}
