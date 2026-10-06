using System;
using System.Linq;
using Sbc.Codes;
using SbcStructural.Detailer;
using SbcStructural.Detailer.Contracts;
using SbcStructural.Detailer.Engine;
using SbcStructural.Detailer.Matching;
using SbcStructural.Detailer.Validation;
using Xunit;

public class SmokeTests
{
    static CadMemberGeometry Geo(double cx = 150, double cy = 300, double b = 300, double d = 600, string mark = "C1", string story = "GF")
    {
        return new CadMemberGeometry
        {
            Mark = mark, StoreyId = story, ClearHeight_mm = 3000,
            Polygon = new Polygon(new[] { new Pt(cx - b / 2, cy - d / 2), new Pt(cx + b / 2, cy - d / 2), new Pt(cx + b / 2, cy + d / 2), new Pt(cx - b / 2, cy + d / 2) })
        };
    }

    static ColumnDesignRecord Design(bool avs = true, double? fck = 30)
    {
        var env = new ColumnStation { AsRequired_mm2 = 3200 };
        if (avs) { env.AvsMajor_mm2_per_m = 1200; env.AvsMinor_mm2_per_m = 800; }
        return new ColumnDesignRecord
        {
            Key = new MemberKey { Kind = KeyKind.Column, Story = "GF", Label = "C1" }, Fck_MPa = fck, Fy_MPa = 500, FrameType = FrameType.Ductile,
            Prov = new Provenance { FileSha256 = "x" }, Stations = { env }, Envelope = env
        };
    }

    static (DetailModel Model, MemberState State, System.Collections.Generic.IReadOnlyList<Finding> Findings) Run(ColumnDesignRecord d)
    {
        var office = new OfficeSettings();
        return DetailerPipeline.DetailColumn(Geo(), d, RuleSetFactory.For(SeismicCategory.ZoneIII, office), office);
    }

    [Fact]
    public void Rule_values_match_appendix_c()
    {
        Assert.Equal(600, Is13920.ConfiningLength(400, 3600).Value);                 // max(D, hc/6, 450) = hc/6
        Assert.Equal(75, Is13920.ConfiningSpacing(300, 20).Value);                   // min(B/4, 6db, 100)
        Assert.Equal(1610, Is456.LapLength(30, 500, 25, true, 40, new OfficeSettings()).Value);   // 46 x 25 x 1.4 corner factor
        Assert.Equal(1150, Is456.LapLength(30, 500, 25, false, 40, new OfficeSettings()).Value);
    }

    [Fact]
    public void Offset_of_rectangle_is_inward_rectangle()
    {
        var o = PolygonUtil.OffsetInward(Geo().Polygon.Verts, 48);
        Assert.Equal(204, PolygonUtil.Dist(o[0], o[1]), 6);
        Assert.Equal(504, PolygonUtil.Dist(o[1], o[2]), 6);
        Assert.Null(PolygonUtil.OffsetInward(Geo(b: 90).Polygon.Verts, 48));         // limb too thin
    }

    [Fact]
    public void Sample_column_arrangement_is_supported_and_zones_ordered()
    {
        var r = Run(Design());
        Assert.Equal(MemberState.Ready, r.State);
        var d = r.Model.Columns[0];
        Assert.True(d.Arrangement.Bars.Count >= 4);
        Assert.True(d.Arrangement.Bars.All(b => b.IsSupported));
        Assert.True(d.AsProvided_mm2 >= 3200);
        Assert.Equal(0, d.Zones.First().From_mm);
        Assert.Equal(3000, d.Zones.Last().To_mm);
        for (int i = 1; i < d.Zones.Count; i++) Assert.Equal(d.Zones[i - 1].To_mm, d.Zones[i].From_mm);
    }

    [Fact]
    public void Shear_gate_passes_then_fails_when_spacing_is_widened()
    {
        var d = Run(Design()).Model.Columns[0];
        Assert.Empty(Gates.CheckShear(d, 1200, 800));
        d.Zones[1].Spacing_mm *= 3;
        d.Zones[1].AsvProvidedMajor_mm2_per_m /= 3;
        Assert.Contains(Gates.CheckShear(d, 1200, 800), f => f.Status == Status.Failed && f.Gate == "G5");
    }

    [Fact]
    public void Matching_exact_fallback_and_failed()
    {
        var ms = new MatchSettings();
        ColumnDesignRecord Rec(string label, double x, double y) => new ColumnDesignRecord
        {
            Key = new MemberKey { Story = "GF", Label = label },
            Geometry = new ColumnGeometryHint { Bottom = new Pt(x, y), B_mm = 300, D_mm = 600 }
        };
        var db = new[] { Rec("C1", 150, 300), Rec("C2", 5150, 300) };
        Assert.Equal(MatchLevel.Match, MemberMatcher.Match(Geo(), db, ms).Level);
        var fb = MemberMatcher.Match(Geo(mark: "X9", cx: 190), db, ms);                  // 40 mm off, no label
        Assert.Equal(MatchLevel.MatchByGeometry, fb.Level);
        Assert.Equal("C1", fb.Key.Label);
        Assert.Equal(MatchLevel.Failed, MemberMatcher.Match(Geo(mark: "X9", cx: 2500), db, ms).Level);
        Assert.Equal(MatchLevel.Failed, MemberMatcher.Match(Geo(story: "9F"), db, ms).Level);   // storey not mapped
    }

    [Fact]
    public void Missing_data_gives_incomplete_never_a_default()
    {
        var a = Run(Design(avs: false));
        Assert.Equal(MemberState.Incomplete, a.State);
        Assert.Null(a.Model);
        Assert.Contains(a.Findings, f => f.Status == Status.Incomplete && f.Message.Contains("STATUS: INCOMPLETE"));
        Assert.Equal(MemberState.Incomplete, Run(Design(fck: null)).State);
    }

    [Fact]
    public void Canonical_hash_is_stable_and_sensitive()
    {
        var o1 = new { b = 1.004, a = new[] { 2.0, 3.0 }, name = "x" };
        var o2 = new { name = "x", a = new[] { 2.0, 3.0 }, b = 1.0 };                    // property order and sub-0.01 noise do not matter
        Assert.Equal(CanonicalJson.Sha256(o1), CanonicalJson.Sha256(o2));
        Assert.NotEqual(CanonicalJson.Sha256(o1), CanonicalJson.Sha256(new { name = "x", a = new[] { 2.0, 3.0 }, b = 1.02 }));
        var h1 = CanonicalJson.DesignHash(Design(), "r", "o"); var h2 = CanonicalJson.DesignHash(Design(), "r", "o");
        Assert.Equal(h1, h2); Assert.Equal(64, h1.Length);
    }
}
