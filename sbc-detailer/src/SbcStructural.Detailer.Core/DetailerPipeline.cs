using System;
using System.Collections.Generic;
using System.Linq;
using Sbc.Codes;
using SbcStructural.Detailer.Contracts;
using SbcStructural.Detailer.Engine;
using SbcStructural.Detailer.Validation;

namespace SbcStructural.Detailer
{
    public static class DetailerPipeline
    {
        /// <summary>G0, G1/G6, G4, G3, arrangement, G5, G7. Blocked members return a null model and the blocking state.</summary>
        public static (DetailModel Model, MemberState State, IReadOnlyList<Finding> Findings) DetailColumn(
            CadMemberGeometry geometry, ColumnDesignRecord design, ColumnRuleSet ruleSet, OfficeSettings settings)
        {
            var f = new List<Finding>();
            f.AddRange(Gates.G0(geometry, design, ruleSet, settings));
            if (f.Any()) return (null, MemberState.Incomplete, f);
            f.AddRange(Gates.G1G6(geometry, design));
            if (f.Any(x => x.Status == Status.Incomplete)) return (null, MemberState.Incomplete, f);
            f.AddRange(Gates.G4(geometry, design));
            f.AddRange(Gates.G3(geometry, design));
            if (f.Any(x => x.Status == Status.DataConflict)) return (null, MemberState.DataConflict, f);
            if (f.Any(x => x.Status == Status.Failed)) return (null, MemberState.Review, f);

            ruleSet.Office = settings;
            Exposure ex = settings.DefaultExposure;
            if (!string.IsNullOrEmpty(geometry.ExposureClass) && !Enum.TryParse(geometry.ExposureClass, true, out ex))
            { f.Add(new Finding(Status.Incomplete, "G6", geometry.Mark, "unknown exposure class '" + geometry.ExposureClass + "'")); return (null, MemberState.Incomplete, f); }
            var env = design.Envelope;
            // cover uses the largest preferred dia as the bound (bar dia not yet known); IS 456 26.4.2.1
            double cover = Is456.ColumnCover(ex, 0).Value;
            var r = ColumnDetailer.Build(geometry.Polygon, env.AsRequired_mm2 ?? 0, design.ChosenN, design.ChosenDia, design.Fck_MPa.Value, design.Fy_MPa.Value,
                                         geometry.ClearHeight_mm.Value, env.AvsMajor_mm2_per_m.Value, env.AvsMinor_mm2_per_m.Value, cover, ruleSet);
            if (r.Error != null) { f.Add(new Finding(Status.Failed, "G5", geometry.Mark, r.Error)); return (null, MemberState.Review, f); }
            var d = r.Detail;
            if (d.Arrangement.BarDiaMax > cover) // cover >= bar dia
            { cover = Is456.ColumnCover(ex, d.Arrangement.BarDiaMax).Value; }
            d.Mark = geometry.Mark; d.StoreyId = geometry.StoreyId; d.ExposureClass = ex.ToString(); d.BeamDepthTop_mm = geometry.BeamDepthTop_mm;
            d.DesignHash = CanonicalJson.DesignHash(design, ruleSet.Id, settings.Version);
            foreach (var n in r.Notes.Where(x => !x.StartsWith("E-LAP-NOFIT"))) f.Add(new Finding(Status.Warning, "G7", geometry.Mark, n));
            f.AddRange(Gates.G5(d, design, ruleSet));
            f.AddRange(Gates.G7(d, ruleSet));
            d.Findings = f;
            var model = new DetailModel { DesignProv = design.Prov, OfficeSettingsVersion = settings.Version };
            model.Columns.Add(d);
            var state = f.Any(x => x.Status == Status.Failed) ? MemberState.Review : MemberState.Ready;
            return (model, state, f);
        }

        /// <summary>M3: wall-pier detailing. G0, G1/G6, arrangement, shear/min-steel/constructability gates.</summary>
        public static (WallDetail Detail, MemberState State, IReadOnlyList<Finding> Findings) DetailWall(
            WallPierGeometry geometry, WallPierDesignRecord design, ColumnRuleSet ruleSet, OfficeSettings settings)
        {
            var f = new List<Finding>();
            f.AddRange(Validation.WallGates.G0(geometry, design));
            if (f.Any()) return (null, MemberState.Incomplete, f);
            f.AddRange(Validation.WallGates.G1G6(geometry, design));
            if (f.Any(x => x.Status == Status.Incomplete)) return (null, MemberState.Incomplete, f);

            var ar = WallArranger.Arrange(geometry, design, ruleSet, settings);
            if (ar.Error != null) { f.Add(new Finding(Status.Failed, "G5", geometry.Key?.ToString(), ar.Error)); return (null, MemberState.Review, f); }
            var d = ar.Detail;
            d.Mark = geometry.Key?.Label ?? geometry.Key?.ToString(); d.StoreyId = geometry.Storey;
            foreach (var n in ar.Notes) f.Add(new Finding(Status.Warning, "G7", d.Mark, n));
            f.AddRange(Validation.WallGates.CheckShear(d, design));
            f.AddRange(Validation.WallGates.G6MinSteel(d));
            f.AddRange(Validation.WallGates.G7(d));
            d.Findings = f;
            var state = f.Any(x => x.Status == Status.Failed) ? MemberState.Review : MemberState.Ready;
            return (d, state, f);
        }
    }
}
