using System;
using System.Collections.Generic;
using System.Linq;
using Sbc.Codes;
using SbcStructural.Detailer.Contracts;

namespace SbcStructural.Detailer.Engine
{
    public sealed class ArrangeResult
    {
        public SectionArrangement Arrangement;
        public string Error;                         // E-THIN, E-INFEASIBLE ...
    }

    /// <summary>App. C section C3-C7 for polygonal sections (rectangular fully exercised; re-entrant: perimeter hoop only, sub-hoop split stubbed).</summary>
    public static class ColumnArranger
    {
        sealed class Cand { public int Ec, Ee, Nc, Ne; public double[] Nseg; public double As, Score; }

        public static ArrangeResult Arrange(Polygon section, double asReq, int? chosenN, int? chosenDia, int tieDia,
                                            double cover, ColumnRuleSet rules)
        {
            var off = rules.Office;
            var P = PolygonUtil.EnsureCcw(PolygonUtil.RemoveCollinear(section.Verts));
            var res = new ArrangeResult();
            var arr = new SectionArrangement { TieDia = tieDia };
            double ag = PolygonUtil.Area(P);
            arr.Ag_mm2 = ag;
            int n = P.Count;
            // ---- bar count / dia selection (C6) on a uniform bar line sized for the largest dia of the candidate
            Cand best = null;
            int[] dias = off.PreferredDias.Where(d => d >= Is456.MinBarDia.Value).OrderBy(d => d).ToArray();
            var maxPct = Is456.MaxSteelPct.Value;
            foreach (int ee in dias)
            {
                foreach (int ec in dias.Where(d => d == ee || (off.MaxDiasPerColumn >= 2 && IdxOf(dias, d) == IdxOf(dias, ee) + 1)))
                {
                    int dmax = Math.Max(ee, ec);
                    var line = PolygonUtil.OffsetInward(P, cover + tieDia + dmax / 2.0);
                    if (line == null) { res.Error = "E-THIN: section limb thinner than 2(c+t)+dia"; return res; }
                    double minClear = Is456.MinClearSpacing(dmax, off.Aggregate).Value;
                    var lens = PolygonUtil.Edges(line).Select(e => PolygonUtil.Dist(e.Key, e.Value)).ToArray();
                    var seen = new HashSet<string>();
                    for (double s = Is456.MaxPeripherySpacing.Value; s >= minClear + dmax - 1e-9; s -= 5)
                    {
                        var seg = lens.Select(l => Math.Max(1.0, Math.Ceiling(l / s - 1e-9))).ToArray();
                        string key = string.Join(",", seg);
                        if (!seen.Add(key)) continue;
                        bool feas = true;
                        for (int i = 0; i < n; i++) if (lens[i] / seg[i] - dmax < minClear - 1e-9) feas = false;
                        if (!feas) break;
                        int total = (int)(n + seg.Sum(x => x - 1));
                        double a = n * Area(ec) + (total - n) * Area(ee);
                        if (total < (IsCircle(P) ? 6 : Is456.MinBars(false).Value) || a < asReq) continue;
                        if (a / ag * 100 > maxPct) break;
                        double sc = (a - asReq) / asReq + 0.05 * total + (ec != ee ? 0.3 : 0) + (rules.Ductile && ee < 16 ? 0.5 : 0)
                                    - ((chosenN == total && chosenDia == ee && ec == ee) ? 10 : 0);
                        if (best == null || sc < best.Score) best = new Cand { Ec = ec, Ee = ee, Nc = n, Ne = total - n, Nseg = seg, As = a, Score = sc };
                        break; // first (largest) spacing that satisfies As for this dia pair
                    }
                }
            }
            if (best == null) { res.Error = "E-INFEASIBLE: no bar arrangement with preferred dias satisfies As_req within 6 % and clear spacing"; return res; }
            if (chosenN.HasValue && !(best.Ec == best.Ee && best.Ee == chosenDia && best.Nc + best.Ne == chosenN))
                arr.Diagnostics.Add("pre-chosen " + chosenN + "T" + chosenDia + " not honoured (geometry or As); selected by the detailer");

            int dm = Math.Max(best.Ec, best.Ee);
            arr.BarDiaMax = dm; arr.BarDiaMin = Math.Min(best.Ec, best.Ee);
            var barLine = PolygonUtil.OffsetInward(P, cover + tieDia + dm / 2.0);
            var tiePath = PolygonUtil.OffsetInward(P, cover + tieDia / 2.0);
            // ---- corners (C4) then edge bars (C5)
            var bars = arr.Bars;
            var edgeBars = new List<List<int>>();   // indices of bars per edge incl. start corner
            for (int i = 0; i < n; i++)
            {
                var a = barLine[i]; var b = barLine[(i + 1) % n];
                int ns = (int)best.Nseg[i];
                var idx = new List<int>();
                bars.Add(new Bar { Centre = new Pt(a.X, a.Y), Dia = best.Ec, IsCorner = true, Edge = i, Mark = "T" + best.Ec });
                idx.Add(bars.Count - 1);
                for (int k = 1; k < ns; k++)
                {
                    bars.Add(new Bar { Centre = new Pt(a.X + (b.X - a.X) * k / ns, a.Y + (b.Y - a.Y) * k / ns), Dia = best.Ee, Edge = i, Mark = "T" + best.Ee });
                    idx.Add(bars.Count - 1);
                }
                edgeBars.Add(idx);
            }
            // ---- hoop
            arr.Hoops.Add(new Hoop { Path = tiePath.Select(p => new Pt(p.X, p.Y)).ToList(), Dia = tieDia, Hooks = off.Hook });
            // ---- support (C7)
            for (int i = 0; i < n; i++)
            {
                var a = P[(i + n - 1) % n]; var b = P[i]; var c = P[(i + 1) % n];
                bool convex = !PolygonUtil.IsReentrant(P, i);
                double ang = Math.Abs(Math.Atan2((b.X - a.X) * (c.Y - b.Y) - (b.Y - a.Y) * (c.X - b.X), -((b.X - a.X) * (c.X - b.X) + (b.Y - a.Y) * (c.Y - b.Y))));
                // interior angle of polygon at b (CCW): pi - turn angle
                double turn = Math.Atan2((b.X - a.X) * (c.Y - b.Y) - (b.Y - a.Y) * (c.X - b.X), (b.X - a.X) * (c.X - b.X) + (b.Y - a.Y) * (c.Y - b.Y));
                double interior = Math.PI - turn;
                bars[edgeBars[i][0]].IsSupported = convex && interior <= 135 * Math.PI / 180 + 1e-9;
            }
            double clearMax = Is456.MaxClearToSupported.Value;
            for (int i = 0; i < n; i++)
            {
                var idx = edgeBars[i]; int m = idx.Count - 1;           // intermediates are idx[1..m]
                var a = barLine[i]; var b = barLine[(i + 1) % n]; double L = PolygonUtil.Dist(a, b), ns = m + 1, pitch = L / ns;
                bool[] sup = new bool[m + 2];
                sup[0] = bars[idx[0]].IsSupported;
                sup[m + 1] = bars[edgeBars[(i + 1) % n][0]].IsSupported;
                for (int k = 1; k <= m; k++) sup[k] = (k % 2 == 0) || ((m + 1 - k) % 2 == 0);   // corner + alternate bars, symmetric
                bool ch = true;
                while (ch)
                {
                    ch = false;
                    for (int k = 1; k <= m; k++)
                    {
                        if (sup[k]) continue;
                        int j = k - 1; while (j > 0 && !sup[j]) j--; int q = k + 1; while (q < m + 1 && !sup[q]) q++;
                        double dl = sup[j] ? (k - j) * pitch - dm : double.MaxValue, dr = sup[q] ? (q - k) * pitch - dm : double.MaxValue;
                        if (Math.Min(dl, dr) > clearMax + 1e-9) { sup[k] = true; ch = true; }
                    }
                    if (rules.Ductile)
                    {
                        double maxLeg = Is13920.MaxLegSpacing.Value;
                        int prev = 0;
                        for (int k = 1; k <= m + 1; k++)
                        {
                            if (!sup[k]) continue;
                            if ((k - prev) * pitch > maxLeg + 1e-9 && k - prev > 1) { sup[(prev + k) / 2] = true; ch = true; break; }
                            prev = k;
                        }
                    }
                }
                for (int k = 1; k <= m; k++) bars[idx[k]].IsSupported = sup[k];
            }
            // ---- cross-ties: every supported intermediate bar and every unsupported corner bar (re-entrant)
            var done = new HashSet<string>();
            int count = bars.Count;
            for (int bi = 0; bi < count; bi++)
            {
                var bar = bars[bi];
                bool needs = bar.IsCorner ? !bar.IsSupported : bar.IsSupported;
                if (!needs) continue;
                var a = barLine[bar.Edge]; var b = barLine[(bar.Edge + 1) % n];
                double dx = b.X - a.X, dy = b.Y - a.Y, len = Math.Sqrt(dx * dx + dy * dy); dx /= len; dy /= len;
                double nx = -dy, ny = dx;                                  // inward normal
                if (bar.IsCorner) { var pv = barLine[(bar.Edge + n - 1) % n]; double ex = a.X - pv.X, ey = a.Y - pv.Y, el = Math.Sqrt(ex * ex + ey * ey); nx = (nx + (-ey / el)) ; ny = (ny + ex / el); double nl = Math.Sqrt(nx * nx + ny * ny); nx /= nl; ny /= nl; }
                var far = PolygonUtil.RayExit(bar.Centre, nx, ny, barLine);
                if (far == null) continue;
                int fi = -1;
                for (int j = 0; j < count; j++) if (PolygonUtil.Dist(bars[j].Centre, far) < 2.0) { fi = j; break; }
                string key = fi >= 0 ? Math.Min(bi, fi) + "-" + Math.Max(bi, fi) : bi + "-h";
                if (!done.Add(key)) continue;
                arr.CrossTies.Add(new CrossTie { A = new Pt(bar.Centre.X, bar.Centre.Y), B = new Pt(far.X, far.Y), Dia = tieDia, HookA = off.Hook, HookB = off.Hook, EngagesHoopOnly = fi < 0 });
                bar.IsSupported = true;
                if (fi >= 0) bars[fi].IsSupported = true;
            }
            if (n != 4 || PolygonUtil.IsReentrant(P, 0) || Enumerable.Range(0, n).Any(i => PolygonUtil.IsReentrant(P, i)))
                arr.Diagnostics.Add("W-SHAPE: non-rectangular section; perimeter hoop only, IS 13920 sub-hoop decomposition (App. C C8) is stubbed in M1");
            Legs(arr, P, tiePath, cover, ag);
            arr.MajorAxisAngle_deg = MajorDir(P).Item3;
            res.Arrangement = arr;
            return res;
        }

        static double Area(int d) { return Math.PI * d * d / 4.0; }
        static int IdxOf(int[] a, int v) { return Array.IndexOf(a, v); }
        static bool IsCircle(IList<Pt> P) { return false; }

        /// <summary>Unit vector along the longest edge (direction of D) and its angle in degrees.</summary>
        public static Tuple<double, double, double> MajorDir(IList<Pt> P)
        {
            double bl = -1, dx = 1, dy = 0;
            foreach (var e in PolygonUtil.Edges(P))
            { double l = PolygonUtil.Dist(e.Key, e.Value); if (l > bl + 1e-6) { bl = l; dx = (e.Value.X - e.Key.X) / l; dy = (e.Value.Y - e.Key.Y) / l; } }
            double ang = Math.Atan2(dy, dx) * 180 / Math.PI; if (ang < 0) ang += 180; if (ang >= 180 - 1e-9) ang -= 180;
            return Tuple.Create(dx, dy, ang);
        }

        static void Legs(SectionArrangement arr, IList<Pt> P, IList<Pt> tiePath, double cover, double ag)
        {
            var md = MajorDir(P); double mx = md.Item1, my = md.Item2;
            var posMajor = new List<double>(); var posMinor = new List<double>();   // coordinate across the legs
            Action<Pt, Pt> add = (a, b) =>
            {
                double dx = b.X - a.X, dy = b.Y - a.Y, l = Math.Sqrt(dx * dx + dy * dy); if (l < 1e-6) return;
                double cr = Math.Abs((dx * my - dy * mx) / l), dt = Math.Abs((dx * mx + dy * my) / l);
                var c = new Pt((a.X + b.X) / 2, (a.Y + b.Y) / 2);
                if (cr < 0.02) posMajor.Add(-c.X * my + c.Y * mx);          // leg parallel to D: position across B
                else if (dt < 0.02) posMinor.Add(c.X * mx + c.Y * my);      // leg parallel to B: position across D
            };
            foreach (var e in PolygonUtil.Edges(tiePath)) add(e.Key, e.Value);
            foreach (var c in arr.CrossTies) add(c.A, c.B);
            arr.LegsMajor = posMajor.Count; arr.LegsMinor = posMinor.Count;
            arr.HMajor_mm = MaxGap(posMajor); arr.HMinor_mm = MaxGap(posMinor);
            var core = PolygonUtil.OffsetInward(P, cover);
            arr.Ak_mm2 = core == null ? ag : PolygonUtil.Area(core);
        }

        static double MaxGap(List<double> v)
        {
            v.Sort(); double g = 0;
            for (int i = 1; i < v.Count; i++) if (v[i] - v[i - 1] > g + 1e-9 && v[i] - v[i - 1] > 1.0) g = v[i] - v[i - 1];
            // legs at (almost) the same position (e.g. a cross-tie beside a hoop side) do not form a gap
            return g;
        }
    }
}
