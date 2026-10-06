using System;
using System.Collections.Generic;
using Sbc.Codes;

namespace SbcStructural.Detailer.Contracts
{
    // Data contract (plan section 13) as plain classes (C# 7.3 style, no records). Units: mm, mm2, mm2/m, kN, kNm, MPa, degrees.
    public static class ContractVersion
    {
        public const string Design = "sbc-detailer/design", Match = "sbc-detailer/match", Detail = "sbc-detailer/detail", CadGeometry = "sbc-detailer/cad-geometry";
        public const string Version = "1.0.0";
    }

    public enum DesignSource { SbcDesign, EtabsDesign }
    public enum Channel { TableExportExcel, TableExportCsv, SbcDesignPlugin, SbcDesignCalculator }
    public enum DesignMode { Design, Check }
    public enum DesignStatus { Ok, Overstressed, NotDesigned }
    public enum FrameType { Ductile, Ordinary, NonSway }
    public enum KeyKind { Column, Pier }
    public enum SectionShape { Rectangular, Circular, SD }
    public enum ZoneName { Confining, Mid, Lap, General, Joint }
    public enum LapGroup { A, B, C }
    public enum Status { Ok, Warning, Incomplete, DataConflict, MatchFailed, Failed }
    public enum MatchLevel { Match, MatchByGeometry, MatchPartial, Failed }
    public enum MemberState { NotRun, Matched, MatchedByGeometry, MatchPartial, MatchFailed, DataConflict, Incomplete, Review, Ready, Done, DoneWithWarnings, Approved, Exploded }

    public sealed class Pt
    {
        public Pt() { }
        public Pt(double x, double y) { X = x; Y = y; }
        public double X { get; set; }
        public double Y { get; set; }
    }

    public sealed class Polygon
    {
        public Polygon() { Verts = new List<Pt>(); }
        public Polygon(IEnumerable<Pt> v) { Verts = new List<Pt>(v); }
        public List<Pt> Verts { get; set; }
    }

    public sealed class Provenance
    {
        public DesignSource Source { get; set; }
        public string ToolVersion { get; set; }
        public string ModelFile { get; set; }
        public string FileSha256 { get; set; }
        public string ContentSha256 { get; set; }
        public Channel Channel { get; set; }
        public List<string> TablesUsed { get; set; } = new List<string>();
        public string DesignCodeFrame { get; set; }
        public string Is13920Edition { get; set; }
        public string ForceUnit { get; set; } = "kN";
        public string LengthUnit { get; set; } = "mm";
        public string DesignRunId { get; set; }
    }

    public sealed class MemberKey
    {
        public KeyKind Kind { get; set; }
        public string Story { get; set; }
        public string Label { get; set; }
        public string UniqueName { get; set; }
        public string Guid { get; set; }
        public string Tower { get; set; }
        public string SbcMark { get; set; }
        public override string ToString() { return Label + " @ " + Story; }
    }

    public sealed class ColumnStation
    {
        public double Location_mm { get; set; }
        public string PmmCombo { get; set; }
        public double? AsRequired_mm2 { get; set; }
        public double? PmmRatio { get; set; }
        public double? Pu_kN { get; set; }
        public double? Mu2_kNm { get; set; }
        public double? Mu3_kNm { get; set; }
        public string VMajorCombo { get; set; }
        public double? Vu2_kN { get; set; }
        public double? AvsMajor_mm2_per_m { get; set; }
        public string VMinorCombo { get; set; }
        public double? Vu3_kN { get; set; }
        public double? AvsMinor_mm2_per_m { get; set; }
    }

    public sealed class ColumnGeometryHint
    {
        public Pt Bottom { get; set; }
        public double BottomZ_mm { get; set; }
        public double TopZ_mm { get; set; }
        public double Angle_deg { get; set; }
        public double? B_mm { get; set; }
        public double? D_mm { get; set; }
    }

    public sealed class ColumnDesignRecord
    {
        public MemberKey Key { get; set; }
        public DesignMode Mode { get; set; }
        public DesignStatus Status { get; set; }
        public List<string> Errors { get; set; } = new List<string>();
        public List<string> Warnings { get; set; } = new List<string>();
        public Provenance Prov { get; set; }
        public DesignSource DesignSource { get; set; }
        public string DesignSection { get; set; }
        public FrameType FrameType { get; set; }
        public bool FrameTypeAssumed { get; set; }
        public double? Fck_MPa { get; set; }          // from the section definition (plan SectionDef)
        public double? Fy_MPa { get; set; }
        public bool HasRebarTemplate { get; set; }     // Check-mode columns need it
        public ColumnGeometryHint Geometry { get; set; }
        public List<ColumnStation> Stations { get; set; } = new List<ColumnStation>();
        /// <summary>Envelope over stations; AsRequired = max, Avs = max, Vu = max |V| (governing combo named).</summary>
        public ColumnStation Envelope { get; set; }
        public int? ChosenN { get; set; }
        public int? ChosenDia { get; set; }
        public bool? FullHeightConfinement { get; set; }
    }

    public sealed class CadMemberGeometry
    {
        public string Mark { get; set; }
        public string StoreyId { get; set; }
        public string EtabsStoryName { get; set; }     // explicit storey map (L0)
        public SectionShape Shape { get; set; }
        public Polygon Polygon { get; set; }           // mm, any orientation, closed implicitly
        public double Rotation_deg { get; set; }
        public double? BottomLevel_mm { get; set; }
        public double? TopLevel_mm { get; set; }
        public double? ClearHeight_mm { get; set; }    // hc, from storey levels and beam depths
        public double? BeamDepthTop_mm { get; set; }
        public string ExposureClass { get; set; }      // Mild..Extreme; null = office default
        public List<string> SourceHandles { get; set; } = new List<string>();
    }

    public sealed class MatchRecord
    {
        public string Mark { get; set; }
        public string StoreyId { get; set; }
        public MemberKey Key { get; set; }
        public MatchLevel Level { get; set; }
        public bool UserAccepted { get; set; }
        public double? CentroidDistance_mm { get; set; }
        public double? SectionDeviation_pct { get; set; }
        public double Confidence { get; set; }         // 1.0 exact, <1 geometry, 0 failed
        public string Reason { get; set; }
        public string EtabsStoryName { get; set; }
        public ColumnDesignRecord Design { get; set; } // matched record (null when failed)
    }

    public sealed class Finding
    {
        public Finding() { }
        public Finding(Status s, string gate, string member, string message, string clause = null, string hint = null)
        { Status = s; Gate = gate; Member = member; Message = message; Clause = clause; Hint = hint; }
        public Status Status { get; set; }
        public string Gate { get; set; }
        public string Member { get; set; }
        public string Message { get; set; }
        public string Clause { get; set; }
        public string Hint { get; set; }
        public override string ToString() { return (Status + " " + Gate + " " + Member + ": " + Message + (Clause != null ? " [" + Clause + "]" : "")); }
    }

    // ---- DetailModel (output of Engine, input of Render) ----
    public sealed class Bar
    {
        public Pt Centre { get; set; }
        public int Dia { get; set; }
        public string Mark { get; set; }
        public bool IsCorner { get; set; }
        public bool IsSupported { get; set; }
        public int Edge { get; set; }                  // index of the polygon edge it lies on (corner: edge starting at it)
    }

    public sealed class Hoop
    {
        public List<Pt> Path { get; set; } = new List<Pt>();
        public int Dia { get; set; }
        public HookType Hooks { get; set; }
        public bool Closed { get; set; } = true;
    }

    public sealed class CrossTie
    {
        public Pt A { get; set; }
        public Pt B { get; set; }
        public int Dia { get; set; }
        public HookType HookA { get; set; }
        public HookType HookB { get; set; }
        public bool EngagesHoopOnly { get; set; }
    }

    public sealed class SectionArrangement
    {
        public List<Bar> Bars { get; set; } = new List<Bar>();
        public List<Hoop> Hoops { get; set; } = new List<Hoop>();
        public List<CrossTie> CrossTies { get; set; } = new List<CrossTie>();
        public List<string> Diagnostics { get; set; } = new List<string>();
        public double MajorAxisAngle_deg { get; set; } // direction of D (longer side); legs parallel to it resist major shear
        public int LegsMajor { get; set; }             // tie legs parallel to D (hoop sides + cross-ties)
        public int LegsMinor { get; set; }             // tie legs parallel to B
        public double HMajor_mm { get; set; }          // max c/c gap between legs parallel to D (measured across B)
        public double HMinor_mm { get; set; }
        public double Ag_mm2 { get; set; }
        public double Ak_mm2 { get; set; }             // core to outer face of hoop
        public int BarDiaMax { get; set; }
        public int BarDiaMin { get; set; }
        public int TieDia { get; set; }
    }

    public sealed class TieZone
    {
        public double From_mm { get; set; }
        public double To_mm { get; set; }
        public double Spacing_mm { get; set; }
        public ZoneName Name { get; set; }
        public int Count { get; set; }
        public double AsvProvidedMajor_mm2_per_m { get; set; }
        public double AsvProvidedMinor_mm2_per_m { get; set; }
        public string Clause { get; set; }
        public string Governed { get; set; }           // "detailing" | "shear" | "confinement"
    }

    public sealed class LapSpec
    {
        public double Start_mm { get; set; }
        public double Length_mm { get; set; }
        public LapGroup Group { get; set; }
        public int Dia { get; set; }
        public bool Coupler { get; set; }
    }

    public sealed class ColumnDetail
    {
        public string Mark { get; set; }
        public string StoreyId { get; set; }
        public Polygon Section { get; set; }
        public double Cover_mm { get; set; }
        public string ExposureClass { get; set; }
        public SectionArrangement Arrangement { get; set; }
        public List<TieZone> Zones { get; set; } = new List<TieZone>();
        public List<LapSpec> Laps { get; set; } = new List<LapSpec>();
        public double ClearHeight_mm { get; set; }
        public double? BeamDepthTop_mm { get; set; }
        public bool Ductile { get; set; }
        public int TieDia { get; set; }
        public double Fck_MPa { get; set; }
        public double Fy_MPa { get; set; }
        public double AsRequired_mm2 { get; set; }
        public double AsProvided_mm2 { get; set; }
        public double SteelPct { get; set; }
        public string RuleSetId { get; set; }
        public List<Finding> Findings { get; set; } = new List<Finding>();
        public string DesignHash { get; set; }
    }

    public sealed class DetailModel
    {
        public string Schema { get; set; } = ContractVersion.Detail;
        public string SchemaVersion { get; set; } = ContractVersion.Version;
        public List<ColumnDetail> Columns { get; set; } = new List<ColumnDetail>();
        public Provenance DesignProv { get; set; }
        public string OfficeSettingsVersion { get; set; }
    }
}
