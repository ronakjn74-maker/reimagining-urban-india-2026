using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace SbcStructural.Detailer.Import
{
    public sealed class ImportException : Exception { public ImportException(string m) : base(m) { } }

    public sealed class RawTable
    {
        public string Name { get; set; }
        public string[] Headers { get; set; }
        public string[] Units { get; set; }
        public List<string[]> Rows { get; } = new List<string[]>();
        public int Col(string header) { return Array.IndexOf(Headers, header); }
    }

    /// <summary>Source of ETABS-style exported tables (App. B). Swappable: CSV/TSV text now, xlsx or API later.</summary>
    public interface ICsvTableSource { IReadOnlyList<RawTable> ReadTables(); string ContentSha256 { get; } }

    /// <summary>
    /// Text export: a line "TABLE: &lt;name&gt;", then a header line, then a units line, then rows until a blank line or the next TABLE.
    /// Delimiter (tab or comma) is detected from the header line.
    /// </summary>
    public sealed class CsvTableSource : ICsvTableSource
    {
        readonly string _text;
        public CsvTableSource(string text) { _text = text ?? ""; }
        public CsvTableSource(TextReader r) : this(r.ReadToEnd()) { }

        public string ContentSha256
        {
            get { using (var h = System.Security.Cryptography.SHA256.Create()) return string.Concat(h.ComputeHash(Encoding.UTF8.GetBytes(_text)).Select(b => b.ToString("x2"))); }
        }

        public IReadOnlyList<RawTable> ReadTables()
        {
            var lines = _text.Replace("\r\n", "\n").Split('\n');
            var tables = new List<RawTable>(); RawTable cur = null; int state = 0; char delim = ',';
            foreach (var raw in lines)
            {
                string line = raw.TrimEnd();
                if (line.StartsWith("TABLE:", StringComparison.OrdinalIgnoreCase)) { cur = new RawTable { Name = line.Substring(6).Trim().Trim('"') }; tables.Add(cur); state = 1; continue; }
                if (cur == null) continue;
                if (line.Trim().Length == 0 || line.Trim(delim, ' ').Length == 0) { if (state == 3) { cur = null; state = 0; } continue; }
                if (state == 1) { delim = line.Contains('\t') ? '\t' : ','; cur.Headers = Split(line, delim); state = 2; }
                else if (state == 2) { cur.Units = Split(line, delim); state = 3; }
                else cur.Rows.Add(Split(line, delim));
            }
            return tables;
        }

        static string[] Split(string line, char d)
        {
            var res = new List<string>(); var sb = new StringBuilder(); bool q = false;
            foreach (char c in line)
            {
                if (c == '"') q = !q;
                else if (c == d && !q) { res.Add(sb.ToString().Trim()); sb.Clear(); }
                else sb.Append(c);
            }
            res.Add(sb.ToString().Trim());
            return res.ToArray();
        }
    }

    /// <summary>Configurable header names (JSON). Unknown headers in a mapped table are refused (no silent column drift).</summary>
    public sealed class TableMap
    {
        public string Match { get; set; }
        public Dictionary<string, string> Fields { get; set; } = new Dictionary<string, string>();   // logical -> exported header
        public List<string> Ignore { get; set; } = new List<string>();
        public List<string> Required { get; set; } = new List<string>();
    }

    public sealed class HeaderMap
    {
        public Dictionary<string, TableMap> Tables { get; set; } = new Dictionary<string, TableMap>();

        public static HeaderMap FromJson(string json)
        { return JsonSerializer.Deserialize<HeaderMap>(json, new JsonSerializerOptions { PropertyNameCaseInsensitive = true }); }

        /// <summary>Default names from App. B 2.2 (verify against a real export; override with a JSON file).</summary>
        public static HeaderMap Default()
        {
            return FromJson(@"{ ""tables"": {
 ""ColumnSummary"": { ""match"": ""^Concrete Column (Design )?Summary"",
   ""fields"": { ""Story"":""Story"", ""Label"":""Label"", ""UniqueName"":""Unique Name"", ""DesignSection"":""Design Section"", ""Status"":""Status"",
     ""PmmCombo"":""PMM Combo"", ""Station"":""Station Loc"", ""PmmRatio"":""PMM Ratio"", ""AsRequired"":""Rebar Area"",
     ""VMajorCombo"":""V Major Combo"", ""AvsMajor"":""Av/s Major"", ""VMinorCombo"":""V Minor Combo"", ""AvsMinor"":""Av/s Minor"",
     ""Fck"":""fck"", ""Fy"":""fy"", ""B"":""B"", ""D"":""D"", ""X"":""X"", ""Y"":""Y"", ""BottomZ"":""Bottom Z"", ""TopZ"":""Top Z"" },
   ""ignore"": [""Design Type"",""Rebar %"",""Error"",""Warning""],
   ""required"": [""Story"",""Label"",""Station"",""DesignSection""] },
 ""ElementForcesColumns"": { ""match"": ""^Element Forces - Columns"",
   ""fields"": { ""Story"":""Story"", ""Label"":""Column"", ""UniqueName"":""Unique Name"", ""Combo"":""Output Case"", ""Station"":""Station"", ""P"":""P"", ""V2"":""V2"", ""V3"":""V3"", ""T"":""T"", ""M2"":""M2"", ""M3"":""M3"" },
   ""ignore"": [""Case Type"",""Step Type""],
   ""required"": [""Story"",""Label"",""Combo"",""V2"",""V3""] },
 ""LoadCombinations"": { ""match"": ""^Load Combinations"",
   ""fields"": { ""Name"":""Name"", ""Type"":""Type"", ""Case"":""Load Name"", ""SF"":""SF"" },
   ""ignore"": [""Auto"",""Notes"",""Is Auto""],
   ""required"": [""Name""] } } }");
        }
    }

    /// <summary>Unit conversion from the units row; unknown or missing units are refused, never guessed.</summary>
    public static class Units
    {
        static string N(string u) { return (u ?? "").Replace("²", "2").Replace(" ", "").Replace("·", "-").Trim().ToLowerInvariant(); }
        public static double Length(string u) { switch (N(u)) { case "mm": return 1; case "cm": return 10; case "m": return 1000; default: throw new ImportException("unknown length unit '" + u + "'"); } }
        public static double Force(string u) { switch (N(u)) { case "kn": return 1; case "n": return 0.001; case "mn": return 1000; default: throw new ImportException("unknown force unit '" + u + "'"); } }
        public static double Area(string u) { switch (N(u)) { case "mm2": return 1; case "cm2": return 100; case "m2": return 1e6; default: throw new ImportException("unknown area unit '" + u + "'"); } }
        /// <summary>Area per length to mm2/m.</summary>
        public static double AreaPerLength(string u)
        {
            switch (N(u)) { case "mm2/m": return 1; case "cm2/m": return 100; case "m2/m": return 1e6; case "mm2/mm": return 1000; case "cm2/cm": return 1000; default: throw new ImportException("unknown area/length unit '" + u + "'"); }
        }
        /// <summary>Moment (force-length) to kN.m.</summary>
        public static double Moment(string u)
        {
            var p = N(u).Split('-'); if (p.Length != 2) throw new ImportException("unknown moment unit '" + u + "'");
            return Force(p[0]) * Length(p[1]) / 1000.0;
        }
    }
}
