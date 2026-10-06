using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.RegularExpressions;
using SbcStructural.Detailer.Contracts;

namespace SbcStructural.Detailer.Import
{
    public sealed class WallImportResult
    {
        public List<WallPierDesignRecord> Walls { get; } = new List<WallPierDesignRecord>();
        public List<string> Warnings { get; } = new List<string>();
    }

    /// <summary>
    /// "Pier Forces" (required) + optional "Pier Section Properties" and an optional
    /// "Shear Wall Pier Design Summary - IS 456:2000" table (header names per plan §11.3/§11.3a; verify against a real export).
    /// Reuses CsvTables.cs / HeaderMap so headers can be corrected without a code change.
    /// </summary>
    public static class EtabsWallImporter
    {
        public static WallImportResult Load(ICsvTableSource src, HeaderMap map, string ulsComboRegex = ".*")
        {
            var tables = src.ReadTables(); var res = new WallImportResult();
            var prov = new Provenance { Source = DesignSource.EtabsDesign, Channel = Channel.TableExportCsv, ContentSha256 = src.ContentSha256, FileSha256 = src.ContentSha256 };
            var pf = Find(tables, map.Tables["PierForces"]);
            if (pf == null) throw new ImportException("table 'Pier Forces' not found");
            prov.TablesUsed.Add(pf.Name);
            var pm = map.Tables["PierForces"]; Check(pf, pm);
            foreach (var req in pm.Required) if (pf.Col(pm.Fields[req]) < 0) throw new ImportException("required header '" + pm.Fields[req] + "' missing in " + pf.Name);

            var sect = Find(tables, map.Tables.ContainsKey("PierSectionProperties") ? map.Tables["PierSectionProperties"] : null);
            Dictionary<string, (double Tw, double Lw)> sectLookup = new Dictionary<string, (double, double)>();
            if (sect != null)
            {
                var sm = map.Tables["PierSectionProperties"]; Check(sect, sm);
                prov.TablesUsed.Add(sect.Name);
                int cs = sect.Col(sm.Fields["Story"]), cp = sect.Col(sm.Fields["Pier"]), cw = sect.Col(sm.Fields["Width"]), ct = sect.Col(sm.Fields["Thickness"]);
                double fl = Units.Length(sect.Units != null && cw >= 0 && cw < sect.Units.Length ? sect.Units[cw] : "mm");
                foreach (var r in sect.Rows)
                {
                    if (cs < 0 || cp < 0 || cw < 0 || ct < 0) continue;
                    sectLookup[r[cs] + "|" + r[cp]] = (Num(r[ct]).GetValueOrDefault() * fl, Num(r[cw]).GetValueOrDefault() * fl);
                }
            }
            else res.Warnings.Add("table 'Pier Section Properties' absent: Tw/Lw not filled from ETABS (supply via CAD geometry)");

            var design = Find(tables, map.Tables.ContainsKey("PierDesignSummary") ? map.Tables["PierDesignSummary"] : null);
            Dictionary<string, WallPierDesignRecord> designLookup = null;
            if (design != null)
            {
                var dm = map.Tables["PierDesignSummary"]; Check(design, dm);
                prov.TablesUsed.Add(design.Name);
                designLookup = new Dictionary<string, WallPierDesignRecord>();
            }
            else res.Warnings.Add("table 'Shear Wall Pier Design Summary - IS 456:2000' absent: AsV/AsH/BE fields stay null (D29)");

            int cStory = pf.Col(pm.Fields["Story"]), cPier = pf.Col(pm.Fields["Pier"]), cCombo = pf.Col(pm.Fields["OutputCase"]), cLoc = pf.Col(pm.Fields["Location"]);
            int cP = pf.Col(pm.Fields["P"]), cV2 = pf.Col(pm.Fields["V2"]), cV3 = pf.Col(pm.Fields["V3"]), cM2 = pf.Col(pm.Fields["M2"]), cM3 = pf.Col(pm.Fields["M3"]);
            double fF = Units.Force(pf.Units != null && cV2 >= 0 && cV2 < pf.Units.Length ? pf.Units[cV2] : "kN");
            double fM = pf.Units != null && cM3 >= 0 && cM3 < pf.Units.Length ? Units.Moment(pf.Units[cM3]) : 1.0;

            var uls = new Regex(ulsComboRegex ?? ".*", RegexOptions.IgnoreCase);
            var groups = new Dictionary<string, WallPierDesignRecord>();
            foreach (var r in pf.Rows)
            {
                string story = r[cStory], pier = r[cPier], combo = cCombo >= 0 ? r[cCombo] : "";
                if (!uls.IsMatch(combo)) continue;
                string key = story + "|" + pier;
                WallPierDesignRecord rec;
                if (!groups.TryGetValue(key, out rec))
                {
                    rec = new WallPierDesignRecord { Key = new MemberKey { Kind = KeyKind.Pier, Story = story, Label = pier }, Prov = prov, DesignSource = DesignSource.EtabsDesign };
                    groups[key] = rec; res.Walls.Add(rec);
                }
                double v2 = cV2 >= 0 ? Math.Abs(Num(r[cV2]).GetValueOrDefault()) * fF : 0;
                double m3 = cM3 >= 0 ? Num(r[cM3]).GetValueOrDefault() * fM : 0;
                double pu = cP >= 0 ? Num(r[cP]).GetValueOrDefault() * fF : 0;
                double loc = cLoc >= 0 && r[cLoc].IndexOf("top", StringComparison.OrdinalIgnoreCase) >= 0 ? 1 : 0;
                var vc = new WallVuCombo { Combo = combo, Station_mm = loc, Vu_kN = v2, Mu_kNm = m3, Pu_kN = pu };
                rec.VuPerCombo.Add(vc);
                if (rec.Envelope == null || v2 > rec.Envelope.Vu_kN) rec.Envelope = vc;   // max |V2| governs shear
            }
            foreach (var rec in res.Walls)
            {
                string key = rec.Key.Story + "|" + rec.Key.Label;
                if (sectLookup.TryGetValue(key, out var sz)) { } // Tw/Lw are carried on WallPierGeometry, not here; left for the caller to cross-check (CAD is authoritative for geometry)
            }
            return res;
        }

        static RawTable Find(IReadOnlyList<RawTable> t, TableMap m) { if (m == null) return null; var re = new Regex(m.Match, RegexOptions.IgnoreCase); return t.FirstOrDefault(x => re.IsMatch(x.Name)); }

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
