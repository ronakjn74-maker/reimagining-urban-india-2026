# SBC Detailer - M1 engine core

Host-neutral C# core for the SBC Detailer (plan `docs/sbc-detailer/SBC_DETAILER_SYSTEM_PLAN_V1.md`). No CAD types, no rendering, no BBS.
It takes one column's CAD polygon plus its design record and returns a `DetailModel` (bars, hoops, cross-ties, tie zones, laps), a `MemberState` and clause-tagged `Finding`s.

## Layout (`src/`)
| Project | Target | Purpose |
|---|---|---|
| `Sbc.Codes` | netstandard2.0 | `CodeValue<T>`, `RuleResult<T>`, `Is456`, `Is13920`, `OfficeSettings`, `RuleSetFactory.For(SeismicCategory)`. No JSON, no packages. |
| `SbcStructural.Detailer.Core` | netstandard2.0 | Contracts + `CanonicalJson`, CSV import, matching, engine (polygon utils, arranger, zone/shear builder), gates G0-G7, `DetailerPipeline`. Only package: System.Text.Json 8. |
| `Detailer.Harness` | net8.0 | Prints the DetailModel JSON for a sample 300x600 Zone III column, a run with Av/s missing (`STATUS: INCOMPLETE`) and a CSV import smoke. Exit code 0 = OK. |
| `Detailer.Tests` | net8.0 | 7 xUnit smoke tests (D38). |

## Build, run, test
```
export PATH=$HOME/.dotnet:$PATH DOTNET_CLI_TELEMETRY_OPTOUT=1
cd sbc-detailer/src
dotnet build Detailer.sln
dotnet run --project Detailer.Harness
dotnet test
```

## Dropping it into SBC_Software (plugin session)
1. Copy `Sbc.Codes` and `SbcStructural.Detailer.Core` as-is (both netstandard2.0, usable from net48 hosts). Add System.Text.Json 8.x to the plugin, or swap `CanonicalJson` for Newtonsoft (contract section 13 names Newtonsoft; the canonical rules are in the file header).
2. Replace the body of `Sbc.Codes.Is456` with the `SbcCalc\Engine\Is456.cs` port, keeping the public members (D37).
3. Write the CAD adapter: fill `CadMemberGeometry` (polygon in mm, storey, clear height, exposure) from the drawing; write the design adapter: fill `ColumnDesignRecord` (from `EtabsColumnImporter` or the SbcDesign run).
4. Per column call `DetailerPipeline.DetailColumn(geometry, record, RuleSetFactory.For(seismic, office), office)`; run `MemberMatcher.Match` first. The renderer (separate, primitive entities only, D5) consumes `DetailModel`.

## Conventions and assumptions
- Units: mm, mm2, mm2/m, kN, kNm, MPa. Plain classes instead of records (C# 7.3 style; `LangVersion latest` only for tuples and local features).
- Major axis = direction of the longest polygon edge (D); legs parallel to it count towards Av/s major (D35). B = shorter side.
- Spacing per zone = floor-to-25(min(code limit, shear limit D35, Ash limit)); tie dia chosen by minimum tie weight with spacing >= 75 and Ash not governing.
- Missing Av/s, fck, fy, stations, clear height, As (Design mode) -> `STATUS: INCOMPLETE`, never defaulted (D27).
- Every code value carries its clause; `(verify)` appears in the note where Appendix C says so.

## Stubbed / not in M1
- `Is456` is a fresh clause-tagged implementation (D37); the SbcCalc port replaces it.
- SbcDesign adapter (`IDesignSource`) waits on the SbcDesign inventory; only the ETABS CSV/TSV importer exists. Header names are the App. B guesses (marked verify) and are overridable through a JSON `HeaderMap`.
- Import covers only Concrete Column Design Summary, Element Forces - Columns, Load Combinations; Pu/Mu per combo are not filled, design geometry comes only from optional B/D/X/Y/Z columns.
- Circular sections (arranger refuses), re-entrant sub-hoop decomposition (App. C C8; perimeter hoop only, W-SHAPE warning), joint hoop zone (needs beam depth), crank/dowel, footing/roof anchorage, stacks, piers/walls, G8 render gate.
- Matcher: L0 (explicit, full string, tower-numeric, elevation), L1, L3 only; L2 pier legs and L2b kind check are M2. ETABS I-point is used as the member centroid (cardinal point offset not applied).
- Pre-chosen bars (`ChosenN`/`ChosenDia`) are preferred in scoring, not forced.
