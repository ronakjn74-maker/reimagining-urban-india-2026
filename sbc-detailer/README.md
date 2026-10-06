# SBC Detailer - M1 engine core

Host-neutral C# core for the SBC Detailer (plan `docs/sbc-detailer/SBC_DETAILER_SYSTEM_PLAN_V1.md`). No CAD types, no rendering, no BBS.
It takes one column's CAD polygon plus its design record and returns a `DetailModel` (bars, hoops, cross-ties, tie zones, laps), a `MemberState` and clause-tagged `Finding`s.

## Layout (`src/`)
| Project | Target | Purpose |
|---|---|---|
| `Sbc.Codes` | netstandard2.0 | `CodeValue<T>`, `RuleResult<T>`, `Is456`, `Is13920`, `OfficeSettings`, `RuleSetFactory.For(SeismicCategory)`. No JSON, no packages. |
| `SbcStructural.Detailer.Core` | netstandard2.0 | Contracts + `CanonicalJson`, CSV import, matching, engine (polygon utils, arranger, zone/shear builder), gates G0-G7, `DetailerPipeline`. Only package: System.Text.Json 8. |
| `Detailer.Harness` | net8.0 | Prints the DetailModel JSON for a sample 300x600 Zone III column, a run with Av/s missing (`STATUS: INCOMPLETE`), a CSV import smoke, a sample shear-wall pier (BE required, BE length supplied) and the same wall with BE length missing (`STATUS: INCOMPLETE`). Exit code 0 = OK. |
| `Detailer.Tests` | net8.0 | 15 xUnit smoke tests (D38), including 8 wall tests. |

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
- Matcher: L0 (explicit, full string, tower-numeric, elevation), L1, L3 for columns. L2 pier legs now exist (`MemberMatcher.MatchPierLegs`) but only as a simple stiffness apportionment (t x l^3 per leg, Q-B11 default) over a caller-supplied candidate set; it does not derive the candidate legs itself from area objects, which the plan's Appendix B review wanted. ETABS I-point is used as the member centroid (cardinal point offset not applied).
- Pre-chosen bars (`ChosenN`/`ChosenDia`) are preferred in scoring, not forced.

## Walls (M3)
Shear-wall pier detailing, added on top of the M1 column engine (new files: `Contracts/WallRecords.cs`, `Engine/WallArranger.cs`,
`Validation/WallGates.cs`, `Import/EtabsWallImporter.cs`; `DetailerPipeline.DetailWall`, `MemberMatcher.MatchPierLegs`).

**Implemented:**
- `WallPierGeometry` + `WallPierDesignRecord` contracts (Tw/Lw, openings as a list, Vu/Mu/Pu per combo, BE flag/length, all nullable and never defaulted — D29).
- `WallArranger`: zones BE-END / WEB / BE-END (or a single WEB zone with no BE), vertical/horizontal bar dia+spacing to meet AsVReq/AsHReq (min 0.25% each way, Appendix C §B), two-curtain rule (always, unless tw<=200mm and tau_v<=0.25*sqrt(fck)), BE given the same column-style confinement as `ColumnArranger`/`Is13920` (tie spacing min(B/4,6db,100)).
- `WallGates`: G0 geometry, G1/G6 mandatory fields (missing BE length with BE required -> `STATUS: INCOMPLETE - BE length not supplied`, D29), an approximate D35-style shear gate, min-steel and constructability (G7) checks.
- `EtabsWallImporter`: reads "Pier Forces" (required) plus optional "Pier Section Properties" and "Shear Wall Pier Design Summary - IS 456:2000" tables, same `CsvTables.cs`/`HeaderMap` mechanism as the column importer — header names are guesses marked verify, overridable via the JSON HeaderMap with no code change.
- `MemberMatcher.MatchPierLegs`: multi-leg (L2) match when a pier's design record has no single matching CAD piece but several CAD wall pieces on the same storey sum to Lw within tolerance; apportions the pier design to each leg by t*l^3 stiffness. Single-leg piers still go through L1/L3.

**Stubbed / honest gaps:**
- Openings are a text note only (`W-OPENING-NOTE`); there is no boundary-around-opening detailing, no polygon union, no trimmer-bar sizing.
- The BE confinement check reuses the *column* Ash/tie-spacing rules verbatim rather than a wall-specific BE derivation; it is a reasonable approximation (per D29's framing) but not a rule the plan's App. C §B review independently verified for walls.
- The shear check (`WallGates.CheckShear`) is an approximate D35-style capacity check (Ah,prov x 0.87fy x 0.8lw vs Vu); it is not the full IS 456 40.x / IS 13920 shear-design procedure, and no diagonal shear-reinforcement or sliding-shear check is attempted.
- `MatchPierLegs` takes the candidate CAD pieces as given by the caller; it does not itself discover which CAD wall segments belong to one pier mark (no area-object/colinearity grouping) — the full derivation App. B's review wanted is out of scope here.
- `EtabsWallImporter` fills `AsVReq`/`AsHReq`/BE fields only when the optional "Shear Wall Pier Design Summary" table is present and its header names match; Tw/Lw always come from CAD (`WallPierGeometry`), not from ETABS section properties.
