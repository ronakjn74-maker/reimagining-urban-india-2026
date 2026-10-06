using System;
using System.Collections.Generic;
using SbcStructural.Detailer.Contracts;

namespace SbcStructural.Detailer.Engine
{
    public static class PolygonUtil
    {
        public static double SignedArea(IList<Pt> p)
        {
            double a = 0;
            for (int i = 0; i < p.Count; i++) { var u = p[i]; var v = p[(i + 1) % p.Count]; a += u.X * v.Y - v.X * u.Y; }
            return a / 2;
        }
        public static double Area(IList<Pt> p) { return Math.Abs(SignedArea(p)); }

        public static Pt Centroid(IList<Pt> p)
        {
            double a = SignedArea(p), cx = 0, cy = 0;
            for (int i = 0; i < p.Count; i++)
            { var u = p[i]; var v = p[(i + 1) % p.Count]; double c = u.X * v.Y - v.X * u.Y; cx += (u.X + v.X) * c; cy += (u.Y + v.Y) * c; }
            return new Pt(cx / (6 * a), cy / (6 * a));
        }

        public static List<Pt> EnsureCcw(IList<Pt> p)
        { var l = new List<Pt>(p); if (SignedArea(l) < 0) l.Reverse(); return l; }

        public static List<Pt> RemoveCollinear(IList<Pt> p, double eps = 1e-6)
        {
            var r = new List<Pt>(p); bool ch = true;
            while (ch && r.Count > 3)
            {
                ch = false;
                for (int i = 0; i < r.Count; i++)
                {
                    var a = r[(i + r.Count - 1) % r.Count]; var b = r[i]; var c = r[(i + 1) % r.Count];
                    double cr = (b.X - a.X) * (c.Y - b.Y) - (b.Y - a.Y) * (c.X - b.X);
                    if (Math.Abs(cr) < eps * Math.Max(1, Dist(a, c))) { r.RemoveAt(i); ch = true; break; }
                }
            }
            return r;
        }

        public static double Dist(Pt a, Pt b) { return Math.Sqrt((a.X - b.X) * (a.X - b.X) + (a.Y - b.Y) * (a.Y - b.Y)); }

        /// <summary>Edge walk: (start, end) of every edge, closing back to the first vertex.</summary>
        public static IEnumerable<KeyValuePair<Pt, Pt>> Edges(IList<Pt> p)
        { for (int i = 0; i < p.Count; i++) yield return new KeyValuePair<Pt, Pt>(p[i], p[(i + 1) % p.Count]); }

        /// <summary>True if the (CCW) vertex is re-entrant (interior angle > 180).</summary>
        public static bool IsReentrant(IList<Pt> ccw, int i)
        {
            var a = ccw[(i + ccw.Count - 1) % ccw.Count]; var b = ccw[i]; var c = ccw[(i + 1) % ccw.Count];
            return (b.X - a.X) * (c.Y - b.Y) - (b.Y - a.Y) * (c.X - b.X) < 0;
        }

        /// <summary>
        /// Offset a CCW polygon inward by d with mitred corners (App. C C3). Returns null when a limb is too thin
        /// (an offset edge reverses direction: E-THIN).
        /// </summary>
        public static List<Pt> OffsetInward(IList<Pt> ccw, double d)
        {
            int n = ccw.Count;
            var lines = new double[n][]; // point (px,py) and direction (dx,dy) of each offset edge
            for (int i = 0; i < n; i++)
            {
                var a = ccw[i]; var b = ccw[(i + 1) % n];
                double dx = b.X - a.X, dy = b.Y - a.Y, len = Math.Sqrt(dx * dx + dy * dy);
                dx /= len; dy /= len;
                lines[i] = new[] { a.X - dy * d, a.Y + dx * d, dx, dy };   // left normal of CCW edge points inside
            }
            var res = new List<Pt>();
            for (int i = 0; i < n; i++)
            {
                var l1 = lines[(i + n - 1) % n]; var l2 = lines[i];
                double cr = l1[2] * l2[3] - l1[3] * l2[2];
                if (Math.Abs(cr) < 1e-12) return null;
                double t = ((l2[0] - l1[0]) * l2[3] - (l2[1] - l1[1]) * l2[2]) / cr;
                res.Add(new Pt(l1[0] + t * l1[2], l1[1] + t * l1[3]));
            }
            for (int i = 0; i < n; i++)    // direction check against the original edge
            {
                var a = res[i]; var b = res[(i + 1) % n];
                var oa = ccw[i]; var ob = ccw[(i + 1) % n];
                if ((b.X - a.X) * (ob.X - oa.X) + (b.Y - a.Y) * (ob.Y - oa.Y) <= 0) return null;
            }
            return res;
        }

        /// <summary>First crossing of a ray (origin, unit dir) with the polygon boundary beyond eps; null if none.</summary>
        public static Pt RayExit(Pt o, double dx, double dy, IList<Pt> poly, double eps = 1.0)
        {
            double best = double.MaxValue; Pt hit = null;
            foreach (var e in Edges(poly))
            {
                double ex = e.Value.X - e.Key.X, ey = e.Value.Y - e.Key.Y;
                double den = dx * ey - dy * ex;
                if (Math.Abs(den) < 1e-12) continue;
                double t = ((e.Key.X - o.X) * ey - (e.Key.Y - o.Y) * ex) / den;
                double u = ((e.Key.X - o.X) * dy - (e.Key.Y - o.Y) * dx) / den;
                if (t > eps && u >= -1e-9 && u <= 1 + 1e-9 && t < best) { best = t; hit = new Pt(o.X + t * dx, o.Y + t * dy); }
            }
            return hit;
        }
    }
}
