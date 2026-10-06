using System;
using System.Linq;
using Sbc.Codes;
using SbcStructural.Detailer;
using SbcStructural.Detailer.Contracts;
using SbcStructural.Detailer.Import;

// Prints the DetailModel JSON and findings for one sample ductile column; second run has Av/s missing; third reads a tiny CSV.
static class Program
{
    public static CadMemberGeometry SampleGeometry()
    {
        return new CadMemberGeometry
        {
            Mark = "C1", StoreyId = "GF", Shape = SectionShape.Rectangular, ClearHeight_mm = 3000,
            Polygon = new Polygon(new[] { new Pt(0, 0), new Pt(300, 0), new Pt(300, 600), new Pt(0, 600) })
        };
    }

    public static ColumnDesignRecord SampleDesign(bool withAvs)
    {
        var env = new ColumnStation { Location_mm = 0, AsRequired_mm2 = 3200, PmmCombo = "ULS-5", Vu2_kN = 180, Vu3_kN = 90 };
        if (withAvs) { env.AvsMajor_mm2_per_m = 1200; env.AvsMinor_mm2_per_m = 800; env.VMajorCombo = "ULS-7"; env.VMinorCombo = "ULS-9"; }
        return new ColumnDesignRecord
        {
            Key = new MemberKey { Kind = KeyKind.Column, Story = "GF", Label = "C1" }, Mode = DesignMode.Design, DesignSource = DesignSource.EtabsDesign,
            DesignSection = "C300X600", FrameType = FrameType.Ductile, Fck_MPa = 30, Fy_MPa = 500,
            Prov = new Provenance { Source = DesignSource.EtabsDesign, FileSha256 = "sample", Channel = Channel.TableExportCsv },
            Stations = { env }, Envelope = env, FullHeightConfinement = false
        };
    }

    static int Main()
    {
        var office = new OfficeSettings();
        var rules = RuleSetFactory.For(SeismicCategory.ZoneIII, office);
        Console.WriteLine("=== RUN 1: sample 300x600 ductile column, Zone III (" + rules.Id + ")");
        var r1 = DetailerPipeline.DetailColumn(SampleGeometry(), SampleDesign(true), rules, office);
        Console.WriteLine("STATE: " + r1.State);
        if (r1.Model != null) Console.WriteLine(CanonicalJson.ToIndented(r1.Model));
        foreach (var f in r1.Findings) Console.WriteLine("  " + f);

        Console.WriteLine();
        Console.WriteLine("=== RUN 2: same column, Av/s missing");
        var r2 = DetailerPipeline.DetailColumn(SampleGeometry(), SampleDesign(false), rules, office);
        Console.WriteLine("STATUS: " + (r2.State == MemberState.Incomplete ? "INCOMPLETE" : r2.State.ToString()));
        foreach (var f in r2.Findings) Console.WriteLine("  " + f);

        Console.WriteLine();
        Console.WriteLine("=== RUN 3: CSV import smoke");
        string csv = "TABLE: Concrete Column Design Summary - IS 456:2000\nStory,Label,Unique Name,Design Section,Station Loc,PMM Combo,Rebar Area,Av/s Major,Av/s Minor,fck,fy\n,,,,mm,,mm2,mm2/m,mm2/m,MPa,MPa\nGF,C1,12,C300X600,0,ULS-5,3200,1200,800,30,500\nGF,C1,12,C300X600,3000,ULS-5,3000,1100,700,30,500\n\nTABLE: Element Forces - Columns\nStory,Column,Unique Name,Output Case,Station,P,V2,V3,T,M2,M3\n,,,,mm,kN,kN,kN,kN-m,kN-m,kN-m\nGF,C1,12,ULS-7,0,-900,-180,20,0,10,200\n";
        var imp = EtabsColumnImporter.Load(new CsvTableSource(csv), HeaderMap.Default());
        var c = imp.Columns.Single();
        Console.WriteLine("imported " + c.Key + " As=" + c.Envelope.AsRequired_mm2 + " Avs=" + c.Envelope.AvsMajor_mm2_per_m + "/" + c.Envelope.AvsMinor_mm2_per_m + " Vu2=" + c.Envelope.Vu2_kN + " warnings: " + string.Join("; ", imp.Warnings));

        bool ok = r1.State == MemberState.Ready && r2.State == MemberState.Incomplete && c.Envelope.AsRequired_mm2 == 3200;

        Console.WriteLine();
        Console.WriteLine("=== RUN 4: shear wall, tw=230, lw=4000, Zone III, BE required, BE length=600");
        var wg = new WallPierGeometry { Key = new MemberKey { Kind = KeyKind.Pier, Story = "GF", Label = "P1" }, Storey = "GF", Tw_mm = 230, Lw_mm = 4000 };
        var wd = new WallPierDesignRecord
        {
            Key = wg.Key, Fck_MPa = 30, Fy_MPa = 500, RhoVReq_pct = 0.3, RhoHReq_pct = 0.3,
            BoundaryElementRequired = true, BoundaryElementLength_mm = 600,
            Envelope = new WallVuCombo { Combo = "ULS-7", Vu_kN = 400 },
            Prov = new Provenance { Source = DesignSource.EtabsDesign, FileSha256 = "sample" }
        };
        var w1 = DetailerPipeline.DetailWall(wg, wd, rules, office);
        Console.WriteLine("STATE: " + w1.State);
        if (w1.Detail != null)
            foreach (var z in w1.Detail.Zones)
                Console.WriteLine(string.Format("  {0,-16} {1,6:0}-{2,-6:0}  vert T{3}@{4}  horiz T{5}@{6}{7}",
                    z.Kind, z.From_mm, z.To_mm, z.VertDia, z.VertSpacing_mm, z.HorizDia, z.HorizSpacing_mm,
                    z.TieDia.HasValue ? string.Format("  tie T{0}@{1}", z.TieDia, z.TieSpacing_mm) : ""));
        foreach (var f in w1.Findings) Console.WriteLine("  " + f);
        ok &= w1.State == MemberState.Ready;

        Console.WriteLine();
        Console.WriteLine("=== RUN 5: same wall, BE required but BE length not supplied");
        var wd2 = new WallPierDesignRecord
        {
            Key = wg.Key, Fck_MPa = 30, Fy_MPa = 500, RhoVReq_pct = 0.3, RhoHReq_pct = 0.3,
            BoundaryElementRequired = true, BoundaryElementLength_mm = null,
            Envelope = new WallVuCombo { Combo = "ULS-7", Vu_kN = 400 },
            Prov = new Provenance { Source = DesignSource.EtabsDesign, FileSha256 = "sample" }
        };
        var w2 = DetailerPipeline.DetailWall(wg, wd2, rules, office);
        Console.WriteLine("STATUS: " + (w2.State == MemberState.Incomplete ? "INCOMPLETE" : w2.State.ToString()));
        foreach (var f in w2.Findings) Console.WriteLine("  " + f);
        ok &= w2.State == MemberState.Incomplete;

        Console.WriteLine();
        Console.WriteLine(ok ? "HARNESS OK" : "HARNESS FAILED");
        return ok ? 0 : 1;
    }
}
