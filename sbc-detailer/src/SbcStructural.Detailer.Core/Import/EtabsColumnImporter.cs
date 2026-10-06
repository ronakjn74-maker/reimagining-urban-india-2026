using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.RegularExpressions;
using SbcStructural.Detailer.Contracts;

namespace SbcStructural.Detailer.Import
{
    public sealed class ImportResult
    {
        public List<ColumnDesignRecord> Columns { get; } = new List<ColumnDesignRecord>();
        public List<string> Combos { get; } = new List<string>();
        public List<string> Warnings { get; } = new List<string>();
    }

    /// <summary>Concrete Column Design Summary + Element Forces - Columns + Load Combinations to ColumnDesignRecord (App. B 2.2).</summary>
    public static class EtabsColumnImporter
    {
        public static ImportResult Load(ICsvTableSource src, HeaderMap map, string ulsComboRegex = ".*")
        {
            var tables = src.ReadTables(); var res = new ImportResult();
            var prov = new Provenance { Source = DesignSource.EtabsDesign, Channel = Channel.TableExportCsv, ContentSha256 = src.ContentSha256, FileSha256 = src.ContentSha256 };
            var summary = Find(tables, map.Tables["ColumnSummary"]);
            if (summary == null) throw new ImportException("table 'Concrete Column Design Summary' not found");
            var forces = Find(tables, map.Tables["ElementForcesColumns"]);
            var combos = Find(tables, map.Tables["LoadCombinations"]);
            prov.TablesUsed.Add(summary.Name);
            if (forces != null) prov.TablesUsed.Add(forces.Name); else res.Warnings.Add("table 'Element Forces - Columns' absent: Vu not filled");
            if (combos != null)
            {
                var m = map.Tables["LoadCombinations"]; Check(combos, m); prov.TablesUsed.Add(combos.Name);
                int c = combos.Col(m.Fields["Name"]);
                foreach (var r in combos.Rows) if (c < r.Length && r[c].Length > 0 && !res.Combos.Contains(r[c])) res.Combos.Add(r[c]);
            }
            else res.Warnings.Add("table 'Load Combinations' absent: combo names not verified");

            var sm = map.Tables["ColumnSummary"]; Check(summary, sm);
            Func<string, int> sc = f => sm.Fields.ContainsKey(f) ? summary.Col(sm.Fields[f]) : -1;
            foreach (var req in sm.Required) if (sc(req) < 0) throw new ImportException("required header '" + sm.Fields[req] + "' missing in " + summary.Name);
            Func<string, string> unit = f => { int i = sc(f); return i < 0 || summary.Units == null || i >= summary.Units.Length ? null : summary.Units[i]; };
            double fLen = Units.Length(unit("Station"));
            prov.LengthUnit = unit("Station");

            var groups = new Dictionary<string, ColumnDesignRecord>();
            foreach (var r in summary.Rows)
            {
                Func<string, string> g = f => { int i = sc(f); return i < 0 || i >= r.Length ? null : r[i]; };
                string key = g("Story") + "|" + g("Label");
                ColumnDesignRecord rec;
                if (!groups.TryGetValue(key, out rec))
                {
                    rec = new ColumnDesignRecord
                    {
                        Key = new MemberKey { Kind = KeyKind.Column, Story = g("Story"), Label = g("Label"), UniqueName = g("UniqueName") },
                        DesignSection = g("DesignSection"), Prov = prov, DesignSource = DesignSource.EtabsDesign, Mode = DesignMode.Design,
                        FrameType = FrameType.Ductile, FrameTypeAssumed = true
                    };
                    string st = g("Status") ?? "";
                    if (st.IndexOf("O/S", StringComparison.OrdinalIgnoreCase) >= 0 || st.IndexOf("Overstress", StringComparison.OrdinalIgnoreCase) >= 0) rec.Status = DesignStatus.Overstressed;
                    double? fck = Num(g("Fck")), fy = Num(g("Fy")); rec.Fck_MPa = fck; rec.Fy_MPa = fy;
                    double? gb = Num(g("B")), gd = Num(g("D")), gx = Num(g("X")), gy = Num(g("Y"));
                    if (gx.HasValue && gy.HasValue)
                        rec.Geometry = new ColumnGeometryHint { Bottom = new Pt(gx.Value * fLen, gy.Value * fLen), B_mm = gb * fLen, D_mm = gd * fLen, BottomZ_mm = (Num(g("BottomZ")) ?? 0) * fLen, TopZ_mm = (Num(g("TopZ")) ?? 0) * fLen };
                    groups[key] = rec; res.Columns.Add(rec);
                }
                var s = new ColumnStation { Location_mm = (Num(g("Station")) ?? 0) * fLen, PmmCombo = g("PmmCombo"), VMajorCombo = g("VMajorCombo"), VMinorCombo = g("VMinorCombo") };
                s.PmmRatio = Num(g("PmmRatio"));
                if (Num(g("AsRequired")).HasValue) s.AsRequired_mm2 = Num(g("AsRequired")) * Units.Area(unit("AsRequired"));
                if (Num(g("AvsMajor")).HasValue) s.AvsMajor_mm2_per_m = Num(g("AvsMajor")) * Units.AreaPerLength(unit("AvsMajor"));
                if (Num(g("AvsMinor")).HasValue) s.AvsMinor_mm2_per_m = Num(g("AvsMinor")) * Units.AreaPerLength(unit("AvsMinor"));
                rec.Stations.Add(s);
            }
            var uls = new Regex(ulsComboRegex ?? ".*");
            var fm = map.Tables["ElementForcesColumns"];
            if (forces != null) Check(forces, fm);
            foreach (var rec in res.Columns)
            {
                rec.Stations.Sort((a, b) => a.Location_mm.CompareTo(b.Location_mm));
                var env = new ColumnStation { Location_mm = rec.Stations[0].Location_mm };
                foreach (var s in rec.Stations)
                {
                    if (s.AsRequired_mm2.HasValue && s.AsRequired_mm2 > (env.AsRequired_mm2 ?? -1)) { env.AsRequired_mm2 = s.AsRequired_mm2; env.PmmCombo = s.PmmCombo; }
                    if (s.AvsMajor_mm2_per_m.HasValue && s.AvsMajor_mm2_per_m > (env.AvsMajor_mm2_per_m ?? -1)) { env.AvsMajor_mm2_per_m = s.AvsMajor_mm2_per_m; env.VMajorCombo = s.VMajorCombo; }
                    if (s.AvsMinor_mm2_per_m.HasValue && s.AvsMinor_mm2_per_m > (env.AvsMinor_mm2_per_m ?? -1)) { env.AvsMinor_mm2_per_m = s.AvsMinor_mm2_per_m; env.VMinorCombo = s.VMinorCombo; }
                    if (s.PmmRatio.HasValue && s.PmmRatio > (env.PmmRatio ?? -1)) env.PmmRatio = s.PmmRatio;
                }
                rec.Envelope = env;
                if (forces == null) continue;
                int cs = forces.Col(fm.Fields["Story"]), cl = forces.Col(fm.Fields["Label"]), cc = forces.Col(fm.Fields["Combo"]);
                int c2 = forces.Col(fm.Fields["V2"]), c3 = forces.Col(fm.Fields["V3"]);
                if (cs < 0 || cl < 0 || cc < 0 || c2 < 0 || c3 < 0) throw new ImportException("Element Forces - Columns lacks Story/Column/Output Case/V2/V3");
                double f2 = Units.Force(forces.Units?[c2]), f3 = Units.Force(forces.Units?[c3]);
                foreach (var r in forces.Rows)
                {
                    if (r[cs] != rec.Key.Story || r[cl] != rec.Key.Label || !uls.IsMatch(r[cc])) continue;
                    double v2 = Math.Abs(Num(r[c2]) ?? 0) * f2, v3 = Math.Abs(Num(r[c3]) ?? 0) * f3;
                    if (v2 > (env.Vu2_kN ?? -1)) env.Vu2_kN = v2;
                    if (v3 > (env.Vu3_kN ?? -1)) env.Vu3_kN = v3;
                }
            }
            return res;
        }

        static RawTable Find(IReadOnlyList<RawTable> t, TableMap m) { var re = new Regex(m.Match, RegexOptions.IgnoreCase); return t.FirstOrDefault(x => re.IsMatch(x.Name)); }

        /// <summary>Refuse headers that are neither mapped nor explicitly ignored.</summary>
        static void Check(RawTable t, TableMap m)
        {
            var known = new HashSet<string>(m.Fields.Values.Concat(m.Ignore), StringComparer.OrdinalIgnoreCase);
            var bad = t.Headers.Where(h => h.Length > 0 && !known.Contains(h)).ToList();
            if (bad.Count > 0) throw new ImportException("unknown header(s) in '" + t.Name + "': " + string.Join(", ", bad) + " (extend the header map)");
        }

        static double? Num(string s)
        {
            double d; if (string.IsNullOrWhiteSpace(s)) return null;
            return double.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out d) ? (double?)d : null;
        }
    }
}
