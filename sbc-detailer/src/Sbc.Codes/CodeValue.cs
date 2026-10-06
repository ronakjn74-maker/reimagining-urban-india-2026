using System;

namespace Sbc.Codes
{
    /// <summary>A code-derived value that always carries where it came from.</summary>
    public sealed class CodeValue<T>
    {
        public CodeValue(T value, string clause, string edition, string note = "")
        { Value = value; Clause = clause; Edition = edition; Note = note ?? ""; }
        public T Value { get; }
        public string Clause { get; }
        public string Edition { get; }
        /// <summary>Free text; contains "(verify)" where Appendix C says the clause number/value needs the BIS copy.</summary>
        public string Note { get; }
        public override string ToString() { return Value + " [" + Clause + "]"; }
    }

    public enum Severity { Pass, Warn, Fail }

    public sealed class RuleResult<T>
    {
        public RuleResult(Severity severity, T value, string clause, string message)
        { Severity = severity; Value = value; Clause = clause; Message = message ?? ""; }
        public Severity Severity { get; }
        public T Value { get; }
        public string Clause { get; }
        public string Message { get; }
        public static RuleResult<T> Pass(T v, string clause) { return new RuleResult<T>(Severity.Pass, v, clause, ""); }
        public static RuleResult<T> Warn(T v, string clause, string msg) { return new RuleResult<T>(Severity.Warn, v, clause, msg); }
        public static RuleResult<T> Fail(T v, string clause, string msg) { return new RuleResult<T>(Severity.Fail, v, clause, msg); }
    }

    public enum SeismicCategory { ZoneII, ZoneIII, ZoneIV, ZoneV }
    public enum Exposure { Mild, Moderate, Severe, VerySevere, Extreme }
    public enum HookType { Deg135, Deg90 }
}
