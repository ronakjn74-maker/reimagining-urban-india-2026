using System;
using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace SbcStructural.Detailer.Contracts
{
    /// <summary>Canonical JSON: sorted ordinal property names, camelCase, invariant culture, doubles rounded 0.01 (0.001 for *Ratio/*Pct), no whitespace, no timestamps.</summary>
    public static class CanonicalJson
    {
        static readonly JsonSerializerOptions Opts = Make(false);
        static readonly JsonSerializerOptions Pretty = Make(true);

        static JsonSerializerOptions Make(bool indent)
        {
            var o = new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase, WriteIndented = indent, DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull };
            o.Converters.Add(new JsonStringEnumConverter());
            return o;
        }

        /// <summary>Human-readable (indented) JSON for reports; not canonical.</summary>
        public static string ToIndented(object o) { return JsonSerializer.Serialize(o, Pretty); }

        public static string Serialize(object o)
        {
            using (var doc = JsonDocument.Parse(JsonSerializer.SerializeToUtf8Bytes(o, Opts)))
            { var sb = new StringBuilder(); Write(doc.RootElement, sb, ""); return sb.ToString(); }
        }

        public static string Sha256(object o)
        {
            using (var h = SHA256.Create())
            {
                var b = h.ComputeHash(Encoding.UTF8.GetBytes(Serialize(o)));
                var sb = new StringBuilder(); foreach (var x in b) sb.Append(x.ToString("x2")); return sb.ToString();
            }
        }

        static void Write(JsonElement e, StringBuilder sb, string name)
        {
            switch (e.ValueKind)
            {
                case JsonValueKind.Object:
                    var props = new System.Collections.Generic.List<JsonProperty>();
                    foreach (var p in e.EnumerateObject()) props.Add(p);
                    props.Sort((a, b) => string.CompareOrdinal(a.Name, b.Name));
                    sb.Append('{');
                    for (int i = 0; i < props.Count; i++)
                    { if (i > 0) sb.Append(','); sb.Append(JsonSerializer.Serialize(props[i].Name)).Append(':'); Write(props[i].Value, sb, props[i].Name); }
                    sb.Append('}'); break;
                case JsonValueKind.Array:
                    sb.Append('[');
                    int n = 0; foreach (var x in e.EnumerateArray()) { if (n++ > 0) sb.Append(','); Write(x, sb, name); }
                    sb.Append(']'); break;
                case JsonValueKind.Number:
                    int dp = (name.EndsWith("Ratio", StringComparison.Ordinal) || name.EndsWith("Pct", StringComparison.Ordinal)) ? 3 : 2;
                    double d = Math.Round(e.GetDouble(), dp, MidpointRounding.AwayFromZero);
                    if (d == 0) d = 0;
                    sb.Append(d.ToString("0.###", CultureInfo.InvariantCulture)); break;
                case JsonValueKind.String: sb.Append(JsonSerializer.Serialize(e.GetString())); break;
                case JsonValueKind.True: sb.Append("true"); break;
                case JsonValueKind.False: sb.Append("false"); break;
                default: sb.Append("null"); break;
            }
        }

        /// <summary>DesignHash: record with Prov reduced to {Source, FileSha256 ?? DesignRunId} + rule set id + office settings version.</summary>
        public static string DesignHash(ColumnDesignRecord r, string ruleSetId, string officeVersion)
        {
            var p = r.Prov;
            return Sha256(new { record = WithoutProv(r), prov = new { source = r.DesignSource.ToString(), id = p == null ? null : (p.FileSha256 ?? p.DesignRunId) }, ruleSetId, officeVersion });
        }

        static object WithoutProv(ColumnDesignRecord r)
        {
            var copy = (ColumnDesignRecord)typeof(ColumnDesignRecord).GetMethod("MemberwiseClone", System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic).Invoke(r, null);
            copy.Prov = null; return copy;
        }

        /// <summary>GeometryHash: CadMemberGeometry minus SourceHandles.</summary>
        public static string GeometryHash(CadMemberGeometry g)
        {
            var c = (CadMemberGeometry)typeof(CadMemberGeometry).GetMethod("MemberwiseClone", System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic).Invoke(g, null);
            c.SourceHandles = null; return Sha256(c);
        }
    }
}
