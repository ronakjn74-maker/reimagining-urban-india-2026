using System;
using System.Collections.Generic;

namespace SbcStructural.Detailer.Contracts
{
    // Shear wall (pier) contracts, M3. Units: mm, mm2, mm2/m, kN, kNm, MPa. Field naming kept close to the real
    // plugin's ShearWallResult/BoundaryElement/ShapeLegs (Appendix E §6) where practical, for easier reconciliation later.

    public sealed class WallOpening
    {
        public double StartM { get; set; }     // distance from pier start, mm, along centerline
        public double Width { get; set; }
        public double Sill { get; set; }       // height to bottom of opening, mm
        public double Head { get; set; }       // height to top of opening, mm
    }

    public sealed class WallPierGeometry
    {
        public MemberKey Key { get; set; }
        public string Storey { get; set; }
        public double Tw_mm { get; set; }
        public double Lw_mm { get; set; }
        public double? ClearHeight_mm { get; set; }
        /// <summary>Centerline polyline (mm), two or more points; or supply EdgeA/EdgeB (two parallel edges) instead.</summary>
        public List<Pt> Centerline { get; set; }
        public Pt EdgeA_Start { get; set; }
        public Pt EdgeA_End { get; set; }
        public Pt EdgeB_Start { get; set; }
        public Pt EdgeB_End { get; set; }
        public List<WallOpening> Openings { get; set; } = new List<WallOpening>();
    }

    public sealed class WallVuCombo
    {
        public string Combo { get; set; }
        public double Station_mm { get; set; }
        public double Vu_kN { get; set; }
        public double Mu_kNm { get; set; }
        public double Pu_kN { get; set; }
    }

    public sealed class WallPierDesignRecord
    {
        public MemberKey Key { get; set; }
        public DesignSource DesignSource { get; set; }
        public Provenance Prov { get; set; }
        public double? Fck_MPa { get; set; }
        public double? Fy_MPa { get; set; }
        /// <summary>Required vertical steel ratio, % of gross area (Appendix C §B); use either the Rho* or As* pair, never both defaulted.</summary>
        public double? RhoVReq_pct { get; set; }
        public double? RhoHReq_pct { get; set; }
        public double? AsVReq_mm2_per_m { get; set; }
        public double? AsHReq_mm2_per_m { get; set; }
        public List<WallVuCombo> VuPerCombo { get; set; } = new List<WallVuCombo>();
        /// <summary>Envelope: max |Vu| combo (shear governs); null means not supplied (D29 — never defaulted).</summary>
        public WallVuCombo Envelope { get; set; }
        /// <summary>From the design source only (D29). Null = not stated -> INCOMPLETE if BE detailing is reached.</summary>
        public bool? BoundaryElementRequired { get; set; }
        public double? BoundaryElementLength_mm { get; set; }
        public double? TauV_MPa { get; set; }
        public List<string> Errors { get; set; } = new List<string>();
        public List<string> Warnings { get; set; } = new List<string>();
    }

    public enum WallZoneKind { BoundaryElement, Web }

    public sealed class WallZone
    {
        public WallZoneKind Kind { get; set; }
        public double From_mm { get; set; }     // along wall length, from edge A
        public double To_mm { get; set; }
        public int VertDia { get; set; }
        public double VertSpacing_mm { get; set; }
        public int HorizDia { get; set; }
        public double HorizSpacing_mm { get; set; }
        /// <summary>BE only: tie dia/spacing, column-style confinement (IS 13920 7.6.1(a)).</summary>
        public int? TieDia { get; set; }
        public double? TieSpacing_mm { get; set; }
        public string Clause { get; set; }
    }

    public sealed class WallDetail
    {
        public string Mark { get; set; }
        public string StoreyId { get; set; }
        public double Tw_mm { get; set; }
        public double Lw_mm { get; set; }
        public double Fck_MPa { get; set; }
        public double Fy_MPa { get; set; }
        /// <summary>Ordered BE / WEB / BE (or just WEB if no BE).</summary>
        public List<WallZone> Zones { get; set; } = new List<WallZone>();
        public bool TwoCurtains { get; set; }
        public double TauV_MPa { get; set; }
        public double AhProvided_mm2_per_m { get; set; }
        public string RuleSetId { get; set; }
        public List<Finding> Findings { get; set; } = new List<Finding>();
        public string DesignHash { get; set; }
    }
}
