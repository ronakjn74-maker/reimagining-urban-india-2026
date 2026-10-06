using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using SbcStructural.Detailer.Contracts;
using SbcStructural.Detailer.Engine;

namespace SbcStructural.Detailer.Matching
{
    /// <summary>Tolerances are settings (D7, D15) and are printed in the match report.</summary>
    public sealed class MatchSettings
    {
        public double CentroidTol_mm { get; set; } = 100;
        public double SectionTol_pct { get; set; } = 10;
        public double StoreyElevationTol_mm { get; set; } = 50;
        public double RotationTol_deg { get; set; } = 5;
        public bool HasTowerColumn { get; set; }
        public string Tower { get; set; }
        public override string ToString() { return string.Format("centroid {0} mm, section {1} %, storey {2} mm, rotation {3} deg", CentroidTol_mm, SectionTol_pct, StoreyElevationTol_mm, RotationTol_deg); }
    }

    /// <summary>Plan section 12: L0 storey, L1 mark/label, L3 geometry fallback, else MATCH FAILED. (Pier legs L2 are M2.)</summary>
    public static class MemberMatcher
    {
        public static MatchRecord Match(CadMemberGeometry cad, IList<ColumnDesignRecord> design, MatchSettings s, IList<CadMemberGeometry> allCad = null)
        {
            var mr = new MatchRecord { Mark = cad.Mark, StoreyId = cad.StoreyId };
            // L0 storey
            var stories = design.Select(d => d.Key.Story).Distinct().ToList();
            string story = MapStorey(cad, design, stories, s);
            mr.EtabsStoryName = story;
            if (story == null) return Fail(mr, "storey \"" + cad.StoreyId + "\" not mapped to an ETABS story (set EtabsStoryName)");
            var inStory = design.Where(d => d.Key.Story == story).ToList();
            // L1 mark / label, exact
            var l1 = inStory.Where(d => string.Equals(d.Key.SbcMark ?? "", cad.Mark, StringComparison.Ordinal) || string.Equals(d.Key.Label, cad.Mark, StringComparison.Ordinal)).ToList();
            if (l1.Count == 1) return Hit(mr, l1[0], MatchLevel.Match, 1.0, cad, "label match");
            if (l1.Count > 1) return Fail(mr, "mark " + cad.Mark + " ambiguous: " + l1.Count + " design records in " + story);
            // L3 geometry fallback
            var cen = PolygonUtil.Centroid(cad.Polygon.Verts); var dims = ColumnDetailer.Dims(cad.Polygon);
            Func<CadMemberGeometry, ColumnDesignRecord, bool> within = (c, d) =>
                d.Geometry != null && d.Geometry.Bottom != null && Dev(c, d) != null
                && PolygonUtil.Dist(PolygonUtil.Centroid(c.Polygon.Verts), d.Geometry.Bottom) <= s.CentroidTol_mm && Dev(c, d) <= s.SectionTol_pct;
            var cands = inStory.Where(d => within(cad, d)).ToList();
            if (cands.Count == 1)
            {
                var d = cands[0];
                if (allCad != null && allCad.Count(o => o != cad && o.StoreyId == cad.StoreyId && within(o, d)) > 0)
                    return Fail(mr, "ambiguous both ways: another CAD member also fits " + d.Key);
                double dist = PolygonUtil.Dist(cen, d.Geometry.Bottom);
                return Hit(mr, d, MatchLevel.MatchByGeometry, Math.Max(0.5, 0.9 - 0.4 * dist / s.CentroidTol_mm), cad, string.Format("matched by position ({0:0} mm)", dist));
            }
            if (cands.Count > 1) return Fail(mr, "ambiguous geometry match, candidates: " + string.Join(", ", cands.Select(c => c.Key.Label)));
            var near = inStory.Where(d => d.Geometry != null && d.Geometry.Bottom != null).OrderBy(d => PolygonUtil.Dist(cen, d.Geometry.Bottom)).FirstOrDefault();
            return Fail(mr, "no ETABS column within " + s.CentroidTol_mm + " mm of (" + cen.X.ToString("0") + ", " + cen.Y.ToString("0") + ")"
                + (near != null ? "; nearest: " + near.Key.Label + " at " + PolygonUtil.Dist(cen, near.Geometry.Bottom).ToString("0") + " mm" : ""));
        }

        /// <summary>Largest relative deviation (%) in B and D after rotation/90-degree swap; null if shape class differs or sizes unknown.</summary>
        static double? Dev(CadMemberGeometry c, ColumnDesignRecord d)
        {
            var h = d.Geometry; if (!h.B_mm.HasValue || !h.D_mm.HasValue) return null;
            var dm = ColumnDetailer.Dims(c.Polygon);          // (B, D) with D the longer side
            double b = Math.Min(h.B_mm.Value, h.D_mm.Value), dd = Math.Max(h.B_mm.Value, h.D_mm.Value);
            return Math.Max(Math.Abs(dm.Item1 - b) / b, Math.Abs(dm.Item2 - dd) / dd) * 100;
        }

        static string MapStorey(CadMemberGeometry cad, IList<ColumnDesignRecord> design, IList<string> stories, MatchSettings s)
        {
            if (!string.IsNullOrEmpty(cad.EtabsStoryName)) return stories.Contains(cad.EtabsStoryName) ? cad.EtabsStoryName : null;
            var full = stories.Where(x => string.Equals(x, cad.StoreyId, StringComparison.OrdinalIgnoreCase)).ToList();
            if (full.Count == 1) return full[0];
            if (s.HasTowerColumn)   // numeric normaliser only on the part after the last '-' and the tower token must match
            {
                Func<string, string> tok = x => { int i = x.LastIndexOf('-'); return i < 0 ? null : x.Substring(0, i); };
                Func<string, string> num = x => { var m = Regex.Match(x.Substring(x.LastIndexOf('-') + 1), @"\d+"); return m.Success ? int.Parse(m.Value).ToString() : null; };
                var mine = cad.StoreyId.Contains("-") ? num(cad.StoreyId) : num("-" + cad.StoreyId);
                var hit = stories.Where(x => x.Contains("-") && tok(x) == s.Tower && num(x) == mine && mine != null).ToList();
                if (hit.Count == 1) return hit[0];
            }
            if (cad.TopLevel_mm.HasValue)   // elevation match against the design records' top Z
            {
                var el = design.Where(d => d.Geometry != null && Math.Abs(d.Geometry.TopZ_mm - cad.TopLevel_mm.Value) <= s.StoreyElevationTol_mm).Select(d => d.Key.Story).Distinct().ToList();
                if (el.Count == 1) return el[0];
            }
            return null;
        }

        static MatchRecord Hit(MatchRecord mr, ColumnDesignRecord d, MatchLevel lv, double conf, CadMemberGeometry cad, string why)
        {
            mr.Key = d.Key; mr.Design = d; mr.Level = lv; mr.Confidence = conf; mr.Reason = why;
            if (d.Geometry != null && d.Geometry.Bottom != null) mr.CentroidDistance_mm = PolygonUtil.Dist(PolygonUtil.Centroid(cad.Polygon.Verts), d.Geometry.Bottom);
            mr.SectionDeviation_pct = d.Geometry != null ? Dev(cad, d) : null;
            return mr;
        }

        static MatchRecord Fail(MatchRecord mr, string why) { mr.Level = MatchLevel.Failed; mr.Confidence = 0; mr.Reason = why; return mr; }

        /// <summary>
        /// L2 pier-leg match (plan §12): when a wall pier's design record has no single CAD piece whose length
        /// matches Lw (within tolerance), accept a match against several CAD wall pieces on the same storey whose
        /// lengths sum to Lw, apportioning the pier's design to each leg by stiffness t*l^3 (Q-B11 default).
        /// Confidence is lower than an L1/L3 single-leg match. Single-leg piers reuse L1/L3 and are not touched here.
        /// </summary>
        public static List<Tuple<CadMemberGeometry, double>> MatchPierLegs(IList<CadMemberGeometry> legsOnStorey, double lwReq, double tw, double tolPct = 5)
        {
            // legsOnStorey: candidate CAD wall pieces (same storey, same Tw) ordered along the pier; caller has already
            // grouped them (e.g. by proximity/colinearity) as the candidate set for one pier mark.
            double sum = legsOnStorey.Sum(c => ColumnDetailer.Dims(c.Polygon).Item2);
            if (Math.Abs(sum - lwReq) / lwReq * 100 > tolPct) return null;    // not a match: lengths don't add up
            double totalStiff = legsOnStorey.Sum(c => tw * Math.Pow(ColumnDetailer.Dims(c.Polygon).Item2, 3));
            var result = new List<Tuple<CadMemberGeometry, double>>();
            foreach (var c in legsOnStorey)
            {
                double l = ColumnDetailer.Dims(c.Polygon).Item2;
                double frac = totalStiff > 0 ? (tw * Math.Pow(l, 3)) / totalStiff : 1.0 / legsOnStorey.Count;
                result.Add(Tuple.Create(c, frac));
            }
            return result;
        }
    }
}
