using System;
using System.Collections.Generic;

namespace Sbc.Codes
{
    /// <summary>Office defaults (D9) until the owner confirms. All adjustable.</summary>
    public sealed class OfficeSettings
    {
        public string Version { get; set; } = "office-1.0";
        public int[] PreferredDias { get; set; } = { 12, 16, 20, 25, 32 };
        public int MaxDiasPerColumn { get; set; } = 2;
        public int MinTieDia { get; set; } = 8;
        public double SpacingModule { get; set; } = 25;
        public HookType Hook { get; set; } = HookType.Deg135;
        /// <summary>1.4 per IS 456 26.2.5.1(c) on corner bars (D33); set 1.0 for "not applied (office decision)".</summary>
        public double CornerLapFactor { get; set; } = 1.4;
        public double Aggregate { get; set; } = 20;
        public double FirstTieOffset { get; set; } = 50;
        public double GravityLapTieSpacing { get; set; } = 150;
        public double GravityKicker { get; set; } = 75;
        public int MaxCrossTiesPerSet { get; set; } = 6;
        public Exposure DefaultExposure { get; set; } = Exposure.Moderate;
        /// <summary>Office lap table Fe500: (max fck, multiple of dia).</summary>
        public IList<KeyValuePair<double, double>> LapTable { get; } = new List<KeyValuePair<double, double>>
        { new KeyValuePair<double,double>(25, 50), new KeyValuePair<double,double>(30, 46), new KeyValuePair<double,double>(35, 40), new KeyValuePair<double,double>(double.MaxValue, 36) };
        /// <summary>Cover by exposure class (columns also >= 40, IS 456 Table 16).</summary>
        public IDictionary<Exposure, double> CoverClasses { get; } = new Dictionary<Exposure, double>
        { {Exposure.Mild,20},{Exposure.Moderate,30},{Exposure.Severe,45},{Exposure.VerySevere,50},{Exposure.Extreme,75} };

        public double FloorToModule(double v) { return Math.Floor(v / SpacingModule + 1e-9) * SpacingModule; }
    }
}
