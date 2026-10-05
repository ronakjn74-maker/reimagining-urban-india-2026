# SBC DETAILER — SYSTEM PLAN V1

Date: 2026-10-06. Status: V1 for owner review. Audience: the owner (structural engineer) and the developer agents.

> **The one principle.** ETABS / SBC Calculator says **WHAT** reinforcement is required. CAD says **WHERE** it goes and in **WHAT actual geometry**. The Detailer **combines** both. It never guesses one side from the other and never silently picks one side when they disagree — it stops, names the conflict, and waits.

**How to read this document.** Sections 0–25 follow the owner's master prompt numbering. Facts about the existing code (sections 1–6) come only from Appendix A (the plugin-session audit). Anything about existing code that Appendix A does not reveal is marked **(assumed — verify in inventory)**. The plugin session is writing `Docs\notes\detailer_inventory.md`; it is still pending. When it arrives, every "(assumed)" row is reconciled and this plan is re-issued as **V1.1**.

**Design source rule (binding, from OWNER_DECISIONS 2026-10-06 and D13).** The office mostly uses ETABS for **forces only** and designs in SBC; sometimes it uses **ETABS concrete design**. So the "required reinforcement" for any project comes from ONE of two sources, selected per project:

| DesignSource | Meaning | When used |
|---|---|---|
| `SbcDesign` | Plugin / Calculator design (`ColumnDesign`, wall design) run on forces imported from ETABS. | The usual case. |
| `EtabsDesign` | ETABS concrete design tables (column summary, pier summary). | Sometimes. |

Both feed the same `ColumnDesignRecord` / `WallPierDesignRecord` through one interface, `IDesignSource`. The Detailer engine is source-agnostic. Sections 11, 13, 14, 15 and 22 show both paths.

**Status words used throughout (verbatim, owner's formats):** `MATCH FAILED`, `DATA CONFLICT`, `STATUS: INCOMPLETE`, `COMPLETED WITH WARNINGS`.

---

## 0. Executive summary

**What it is.** SBC Detailer is a new module inside the existing SbcStructural plugin (D2), not a separate application. It takes the reinforcement *requirement* that the selected design source has already calculated (SbcDesign from ETABS forces, or EtabsDesign tables — D13), takes the *actual* member geometry from the CAD drawing, applies IS 456 / IS 13920 detailing rules, and draws the column (later the shear wall) the way the office already draws it: section per zone, elevation, schedule row, link details. It runs in **ZWCAD and GstarCAD** through the existing compatibility layer only (owner hard rule).

**What exists today (Appendix A).** Numbering (C1, SW1, LW …) with per-storey plans in ProjectPanel; `Guard.cs` keeping every command from crashing; the docked Concept 2 panel (ui_a); the `SBCETABS` .e2k export (1.14.2) and the Phase 2.5 plan to import ETABS tables; the office lap table (`Detailing\Laps.cs`); the IS 456 engine in SbcCalc (`Is456.cs`); `ColumnDesign`, `Details`, `Diagrams`, `Bbs` modules; the Table Plugin for schedules; `LAYERS.dwg`; the regression harness; and about 20 finished office drawings as the answer key (1071/1153 column link details, 1162 column schedule).

**What is new.** (1) An import layer that reads ETABS tables (and SbcDesign output) into one typed design record with provenance. (2) A host-neutral rule library `Sbc.Codes` (IS 456 ported from the Calculator + new IS 13920) — the only place code numbers live (D4). (3) A polygon-based bar-arrangement engine (corner bars, edge bars, tie path, cross-tie solver, zones along height). (4) A renderer that draws with primitive entities only (D5) so one output is identical on both hosts. (5) A match table and a review state per member with the four status words above. (6) One new "Detail" step in the existing panel.

**First milestone (M1).** One rectangular ductile column, end to end: pick it in CAD → matched to its design record → bars and ties chosen → section + elevation + schedule row inserted → validated → identical on ZWCAD and GstarCAD 2025. Nothing else until this is clean (owner decision 2026-10-05).

**Scope fence for V1.** No BBS (owner hard rule — bar marks as drawing text only). No beams, slabs, foundations (SAFE), coupling beams. No live ETABS API (table export only, D3). No GstarCAD 2026+/.NET 8 build (D6). Ductile (IS 13920) detailing ON by default — Mumbai, Zone III (D14) — switchable off per project.

**Schedule.** M0 spike 5 days → M1 one column 12 days → M2 all columns + L/T/C 12 days → M3 shear walls 10 days → M4 complete system 10 days. About 49 working days of one developer lane plus about one owner evening per milestone.

**The asks (owner, five minutes each).** (a) One real ETABS 22 export of the ~12 tables from a live model so headers can be frozen. (b) GstarCAD version on the test machine. (c) Yes/no to the office defaults in D9 (bars, cover, hooks). (d) Two evenings for testing M1 on both hosts. (e) Answers to the blocking questions in §25(a) — or silence, in which case the listed 60-second defaults apply and are logged in DECISIONS_TAKEN_BY_CLAUDE.md.

---

## 1. Existing code discovered

Source: Appendix A §1. All facts below are from the plugin session's transcript, not verified against code.

**Repository.** `C:\Users\admin\Desktop\SBC_Software` (git). Main tree on branch `1.14.1` during the audit window. 1.14.1 is published (tag `v1.14.1`); 1.14.2 is the work branch (integration worktree `C:\Users\admin\sbc1142\wt\int`). SbcCalc is at release 1.3.0 (2026-10-06).

**Projects.** `SbcStructural` (the plugin, net48 C#, ZWCAD 2026 host), `LicenseServer`, `Loader`, `LoaderOffline`, `Setup`, `Installer`, `Build\ReflectHarness`, `Build\CadCompat`, `Build\Net8Smoke`. `SbcCalc` + `SbcCalc.Check` = the separate SBC Calculator WinForms app.

**Plugin files named.** `Commands.cs` (41 command entry points; `DoNumber()`, `ShowPanel()`), `Numbering.cs`, `Analysis.cs` (`Analysis.Supports`, `Analysis.SpanBreaks`), `Gravity.cs`, `BeamDesign.cs`, `ColumnDesign`, `SlabDesign`, `Footings`, `RetainingWalls`, `Stairs`, `Bbs`, `Details`, `Diagrams`, `Report`, `Standard`, `Detailing\Laps.cs`, `Ribbon.cs`, `SbcUiHost.cs`, `ProjectPanel.cs`, `SchedulePanel.cs`, `Model.Load`, `Sheets.Run`, `CadCompat.cs`, `CadAliases.cs`, `CadPcad.cs`. New on lanes: `Guard.cs` (perf_0), `StructuralBlocks.cs` (num_1), `SbcTheme.cs`, `InlineStrip.cs`, `Workspace.cs` (ui_a).

**Lanes.** `Lanes\SbcEtabs\` (`E2kTemplate.cs`, `E2kWriter.cs`, `EtabsResults.cs`, `EtabsTables.cs`, `LabelMap.cs`, `SbcModel.cs` shown deleted, `Templates\etabs_UNVERIFIED.e2k`); `Lanes\SbcLateralLoads` (`Irregularity.cs`, `Seismic.cs`, `TierA.cs`); `Lanes\SbcModel` (`ModelHelpers.cs`, `SbcAnalysisModel.cs`); `Lanes\SbcPiles`, `Lanes\SbcFrame3D`.

**Branches / lanes seen.** `1.14.1`, `1.14.2`, `l3_bis` (merged), `l3_etabs_export` (SBCETABS, merged in 1.14.2), `perf_0`, `num_1`, `num_2`, `ui_a`, `beta_1142` (merges ui_a + num_2), "verifyqa", "GUTTER track G9".

**Build and test.** `Build\build_release.ps1` builds all projects, obfuscates with ConfuserEx, builds per-CAD obfuscated variants (`$probes[$cad]`, `plugin_out_$cad`), embeds `LAYERS.dwg`, ships Table Plugin 3.3, builds the installer. `Build\regression\run_regression.ps1` drives ZWCAD with `SBTNUMBER`, `SBTDESIGN`, `SBTSCHEDULE/TABLE`, `SBTSHEETS` (test-build "SBT" twins of the SBC commands); 22+ cases with JSON baselines; `handcalc\` ~830 hand-calc checks; `checks_ext.py`, `compare.py`, `perf_check.py`, `perf_baseline.json`; env `SBC_CMDTIME=1` writes `[SBC-TIME]` lines.

**Docs.** `Docs\SBC_Command_Reference.md` (~52 commands), `Docs\release\MASTER_PLAN.md` (phases 0–7, §16 Phase 2.5 ETABS, §17 BBS rule, §18 owner answers), `Docs\notes\*` (engineering review F1–F13, BIS table, lane notes, calculator audits), `books\` (IS code PDFs incl. IS 456, 13920:2016 + Amd 1, 1893-1:2016, SP 34), `Guide\SBC_Structural_User_Guide_1.14.1`.

**Owner-side answer key.** `Desktop\01 Drawings (CAD)\Sheet & details\` — ~20 finished office RCC drawings, including column link details 1071/1153 and column schedule 1162. Brand kit: navy #1F3B73, gold #C2A620, Poppins/Lato.

**Known gaps (Appendix A §10).** Not revealed: CadCompat/CadAliases/CadPcad contents; XData/NOD keys; storey schema; section polygons for L/T/C; text/dimension standards; everything inside the ETABS lane; column/wall design output types; any existing column/wall reinforcement drawing; Workflow-tab API; `CmdGuard.Safe` signature. All of these are **(assumed — verify in inventory)** wherever they appear below.

---

## 2. Existing CAD functionality

Source: Appendix A §2.

| Area | What exists | Detailer relevance |
|---|---|---|
| Host | ZWCAD 2026 primary; net48 plugin. Per-CAD obfuscated builds and `CadCompat.cs` / `CadAliases.cs` / `CadPcad.cs` imply AutoCAD (2020/2025 SDK folders exist) and pCAD support. Contents not in transcript. | The alias layer is where the GstarCAD set is added (§7, §21). |
| Layers | Office standard `LAYERS.dwg` embedded in the installer (built-in copy if absent). Structural input layers configured as `...Layers` settings; user guide mentions C, SW, LW, RW, BEAM, SLAB-EDGE, OPENING. | Detailer reads the same layers; adds `SBC-DET-*` output layers (§16). |
| Geometry reading | Walls/columns read from closed polylines on structural layers. `Analysis.Supports` also treats two parallel OPEN polylines (e.g. 450 mm apart) as a wall. `Model.Load` does a full model-space scan per command (known hot spot). Units check via `INSUNITS` / column sizes ("NUMBERING STOPPED - WRONG UNITS"). Snap tolerance in settings. | Detailer must reuse these readers; no second scan (§10). |
| Blocks | `StructuralBlocks.cs` (num_1): opens INSERTs on structural layers, handles nested/scaled/rotated/mirrored blocks, copies read pieces into model space tagged `SBC_BLK` (cache refreshed by `SBTNUMBER`), reports "UNREAD ON STRUCTURAL LAYERS: n", xrefs must be bound. Dynamic blocks untested. | Provenance of a column read from a block (§10). |
| Numbering | Marks C1…, SW1…, B1…, BC1…, S1…, RW, LW (planned). Column/wall boundary: aspect ratio ≥ 3.95 = wall. Lift-wall rule: "LIFT" text + cut-out → enclosing walls are LW. Numbering is per plan/storey via ProjectPanel ("no storey set" is a RED health item). Mark stability / freeze / "marks changed" diff planned in Phase 2. | Matching keys on marks; the numbering lock is a hard prerequisite (owner decision). |
| Commands | `SBCNUMBER`, `SBCPANEL`, `SBCDESIGN`, `SBCSHEETS`, `SBCREPORT`, `SBCSET`, `SBCETABS` (1.14.2), `SBCWORKSPACE`; planned `SBCHEALTH`, `SBCREPORTBUG`, `EXPLAIN`. Test twins `SBT*`. Other groups: Details, Section, 3D, Issue GFC, QA waive, Clear marks, Renumber. | New `SBCDETAIL*` commands follow the same pattern (§21). |
| Outputs | Marked plans; schedules via Table Plugin 3.3 (`TPIMPORT` from a text file; known comma-value crash); sheets/layouts (`Sheets.Run`, O(n²) text overlap); GFC issue; HOLD items (planned `SBC-HOLD` layer, tags "HOLD-07"); "DRAFTING CLEANUP LIST"; BBS (rebuilt by 4 commands); 3D; design report PDF. | Detailer V1 draws into model space with its own blocks; sheets later (§16). |
| Persistence | Not revealed. Only `SBC_BLK` tag, `%APPDATA%\SbcStructural\workspace_backup\`, `crash.log`, `perf.log`, `result.json` mentioned. XData app names / NOD keys unknown. | **(assumed — verify in inventory)**. Detailer uses its own namespaced Xrecords (§9). |

---

## 3. Existing ETABS functionality

Source: Appendix A §3. Only file names and git state are revealed.

- `Lanes\SbcEtabs\E2kTemplate.cs`, `E2kWriter.cs`, `Templates\etabs_UNVERIFIED.e2k` — SBC → .e2k export (model written to ETABS text format). Shipped as the 1.14.2 `SBCETABS` command from branch `l3_etabs_export`.
- `Lanes\SbcEtabs\EtabsResults.cs`, `EtabsTables.cs`, `LabelMap.cs` — imply reading ETABS tables/results back and a mark → label map. Table names, columns, record types and which design results are read are **not in the transcript** (**assumed — verify in inventory**).
- `Lanes\SbcModel\ModelHelpers.cs`, `SbcAnalysisModel.cs` — analysis model used by the export.
- `Build\tools\E2kViewer` exists.
- No COM API mention anywhere.
- Owner decision 2026-10-06 (MASTER_PLAN §16 Phase 2.5): SBC exports a ready-to-run .e2k (gravity + IS 1893 seismic + IS 875-3 wind + combos + pier labels + mark→label map); the owner runs ETABS 22; SBC imports results (forces, concrete design results, drifts, reactions) from exported tables and maps them to SBC marks. Import always reads forces; optionally reads ETABS design results; the choice is a per-project setting.

Consequence: the Detailer does **not** write its own ETABS reader if Phase 2.5 already has one. It adds the mappers that turn the imported tables into the Detailer's design records (§11). What ETABS can and cannot give is in Appendix B §3.

---

## 4. Existing design functionality

Source: Appendix A §4 and §8.

**Plugin modules.** `BeamDesign` (IS 456 Table 19 τc via `TauC`; `kLim`, `xulim` constants; `FyStirrup` cap 415; `Stirrups(...)` returning `(Sd, Sen, Smid, SpcFace, TooHigh)`; `ductile` flag; deflection check), `ColumnDesign` (emin, slenderness, Pb, biaxial), `SlabDesign`, `Footings`, `RetainingWalls.DesignEarth`, `Stairs`, `Detailing\Laps.cs` (office lap table: Fe500 ≤ M25 = 50Ø, M30 = 46Ø, M35 = 40Ø, M40+ = 36Ø, never below IS 456), `Bbs`, `Details`, `Diagrams`, `Report`, `Standard`. Lateral lane: `Seismic.cs`, `Irregularity.cs`, `TierA.cs`.

**Code values today.** Live as C# constants / inline tables. IS 456 Table 19 τc is DUPLICATED between plugin and calculator (XC-7); plan is one shared table with `SbcCalc\Engine\Is456.cs` as the single source (Phase 4), each value tagged with its clause. BIS lane `l3_bis` fixed IS 13920 6.3.5 (100 mm cap; 1.14.1 had the 1993 "need not be less than 100" floor), IS 13920 7.6.1(c) circular Ash 0.024 term, IS 875-2 stair load, IS 3370-2 minimum. Column confinement in the calculator uses min(b/4, 6Ø, 100). Plugin uses compression lap for non-ductile columns (XC-8 open).

**Reinforcement result structure.** Only the beam stirrup tuple and `r.BsN`, `r.BsD` (bar count/dia) are visible. **Column/wall output types are NOT revealed** (**assumed — verify in inventory**). This is the single most important inventory item for the `SbcDesign` source (§11, §22).

**SBC Calculator (`SbcCalc`).** Ported from SbcStructural, independently audited. `Engine\Is456.cs` (single τc table, τc,max, KLim/xu,max incl. fy > 500, Fig 4 MF, Ld, laps), `ColumnCalc.cs` (port of office `ColumnDesign1.xls` VBA, NOT the plugin's ColumnDesign), `ColumnExtra.cs`, `BeamCalc.cs`, `RetainingWallCalc.cs`, `WallDiagrams.cs`, `OneWaySlabCalc.cs`, `SlabExtra.cs`, `Bars.cs` (`Laps.OfficeTable`), `Charts.cs`; `UI\{ReportHtml, Theme, TablePlugin, CadLink, Validation}.cs`; `SbcCalc.Check` with 144 Excel cases (~3100 values). Rule (memory `shared-code-plugin-calculator.md`): **port, never edit the other's files**; exchange paths only.

**Regression.** 22+ cases with JSON baselines (currently stale: 1.14.2 baselines still 1.14.1), `handcalc\` ~830 checks, ReflectHarness, Net8Smoke, `checks_ext` WARN/FAIL.

---

## 5. Existing detailing functionality

Source: Appendix A §5. Not described in the transcript beyond:

- Module names `Details`, `Diagrams`, `Section`, `3D`, `Bbs`. Contents unknown (**assumed — verify in inventory**: there may be helpers for drawing bars/ties/dimensions that the renderer can reuse).
- `Docs\notes\detailing_review.md` exists (contents not seen).
- Office drawings 1071/1153 (column link details) and 1162 (column schedule) are the reference format.
- Schedules go through the Table Plugin text format (`SbcCalc\UI\TablePlugin.cs` writes it).
- BBS exists and is rebuilt by four commands (~1.5 s); explicitly out of scope until the owner says otherwise.

Conclusion: there is **no existing column/wall reinforcement detailing pipeline** visible. The Detailer engine and renderer are new (§8).

---

## 6. Reusable modules

From Appendix A, in order of value to the Detailer:

| Module | Reuse | Condition |
|---|---|---|
| `Guard.cs` (perf_0) | Wrap every Detailer command and UI event; crash.log; "results are NOT complete" line; `[SBC-TIME]`. | Needs typed outcomes (§7). |
| `Numbering.cs` / `Analysis.cs` | Marks, kinds (C/SW/LW/RW), outline ↔ mark association, wall-from-two-polylines rule, aspect-ratio rule, lift-wall rule. | Numbering lock (1.14.2) must land first. Needs a query API (§7). |
| `Model.Load` | The per-storey entity set. | Expose a cached snapshot; Detailer must not rescan (§7, assumed). |
| `StructuralBlocks.cs` | `SBC_BLK` copies and provenance of members read from blocks. | Expose source-handle map (§7). |
| ProjectPanel storeys/plans | Storey list, plan ↔ storey. | Needs levels and `EtabsStoryName` (§7, assumed schema). |
| `CadAliases.cs` / `CadCompat.cs` | The only path to host APIs. | Add GstarCAD alias set (§21). |
| `Lanes\SbcEtabs\EtabsTables.cs`, `EtabsResults.cs`, `LabelMap.cs` | Table reader and mark→label map (Phase 2.5). | Contents unverified; mappers added on top (§11). |
| `ColumnDesign`, wall design | The `SbcDesign` source. | Output types unknown; adapter (§22). |
| `SbcCalc\Engine\Is456.cs`, `Bars.cs` lap table | Ported into `Sbc.Codes` (D4). | Port, never edit. |
| `Detailing\Laps.cs` | Office lap table. | Moves to `Sbc.Codes.OfficeSettings`, forwarding call left behind. |
| ui_a panel (`SbcUiHost.cs`, `InlineStrip.cs`, `SbcTheme.cs`, `Workspace.cs`) | Detail step, strips, chips, theme tokens. | Workflow-tab API for adding a step is unknown (assumed). |
| `LAYERS.dwg` | Office layers, text/dim styles. | Add `SBC-DET-*`, `SBC-HOLD`. |
| Regression harness, ReflectHarness, `buildcheck.ps1` | Cases, perf gate, dependency scan. | New `detail_*` cases, DXF comparator (§21). |
| `SBCSET` INI settings | `[Detailer]` section. | — |
| QA RED/AMBER, HOLD items, Waive modal, "NOT FOR GFC" | Status integration. | — |
| `SbcCalc.Check` pattern, `excel_cases.ps1` | Off-host test harness style. | Reused as pattern; 144 cases re-run for ported functions. |
| `Details`, `Diagrams`, `Section` | Possibly drawing helpers. | **(assumed — verify in inventory)**. |

Not reused in V1: `Bbs` (owner hard rule), `Sheets.Run` (V1 draws in model space), Table Plugin for Detailer schedules (lines + text block instead; Table Plugin text may still be written for the Members grid row).

---

## 7. Modules that need modification

Existing files only. New code is in §8.

| File (`SbcStructural\`) | Change | Why |
|---|---|---|
| `Commands.cs` | Add the `SBCDETAIL*` entry points (§21) and their `SBTDETAIL*` twins, each wrapped in `Guard`. No logic in Commands.cs. | All host entry points in one file (App. D §4); test-build `SBT` convention (App. A §1). |
| `Guard.cs` | Extend the result so a command can end with a typed outcome (`Completed / CompletedWithWarnings / Blocked / Failed`) instead of only the "FAILED – unexpected error" path; `[SBC-TIME]` for new commands. | MATCH FAILED / DATA CONFLICT / INCOMPLETE are *normal* outcomes, not crashes; the >10 % perf gate applies to new commands. |
| `Model.Load` (**assumed — verify in inventory**) | Expose a read-only cached `CadModelSnapshot` (members per storey with handles, polygons, SBC_BLK provenance). | Full scan is the known hot spot; Detailer must not add a second scan. |
| `Numbering.cs` / `Analysis.cs` | Public stable query `MembersOf(storey, kind)` → mark, kind, outline handles, storey id. "Marks changed" diff event (already planned in Phase 2). | Detailer keys everything on marks; it must be told when marks move (§12). |
| `StructuralBlocks.cs` | Expose the SBC_BLK copy → source INSERT handle map. | Provenance in MATCH FAILED reports ("source: block XYZ"). |
| `ProjectPanel.cs` / storey schema (**assumed**) | Storey carries top/bottom level (mm), slab thickness, optional `EtabsStoryName`; import of the ETABS story list to pre-fill names. **Project setting `DesignSource = SbcDesign | EtabsDesign`** (D13) and `Ductile = on/off` (D14, default on). | Storey mapping is the first matching key; design source selects the adapter. |
| `ColumnDesign` / wall design (output types **assumed**) | Wrap outputs in the Detailer `DesignRecord` contract via the `SbcDesignSource` adapter; must expose As,req (or chosen n×Ø), Av/s or tie spacing + legs, Pu envelope, ductile flag, section, fck, fy. | The `SbcDesign` path (D13) is the office's usual case. |
| `Lanes\SbcEtabs\EtabsTables.cs`, `LabelMap.cs` (**assumed**) | Header normaliser, units-row parser, A1 title read; expose the mark→label map to Matching. | §11. |
| `Detailing\Laps.cs` | Office lap table moves to `Sbc.Codes.OfficeSettings`; forwarding call stays. | D4; two copies today (plugin + `SbcCalc\Bars.cs`). |
| `BeamDesign.cs` τc / `kLim` / `xulim` | Replace with calls into `Sbc.Codes.Is456`. | XC-7; Phase 4 already plans this; prerequisite for the rule library. |
| `CadAliases.cs`, `CadCompat.cs` | Add `GSTARCAD` alias set (`Gssoft.Gscad.*`) and a minimal `ICadHost` facade (`CadHost.Current`) with capability flags. | Owner: GstarCAD + ZWCAD hard requirement; D5/D6. |
| `SbcStructural.csproj` + `Build\build_release.ps1` | SDK-style project; configurations `ZWCAD-net48`, `GSTARCAD-net48`; `$probes["gstarcad"]`; obfuscation pass per host. | App. D §4; one DLL per host. |
| Workflow tab (`ui_a`), `Workspace.cs` | Add step "Detail" after "Design"; inline strips only. | Concept 2 rules. |
| `SBCSET` / settings INI | `[Detailer]` section (§21). | Regression cases pin defaults. |
| `Build\regression\run_regression.ps1`, `checks_ext.py`, `compare.py` | `detail_*` case family, DXF comparator, per-host goldens, `result.json` `detail` key. | §21. |
| `LAYERS.dwg` | Add `SBC-DET-*` and `SBC-HOLD` layers. | §16. |
| `Sheets.Run`, `Details`, `Diagrams` | **Not modified in V1.** | Avoid the sheet pipeline's known issues. |
| `Bbs` | **No change.** | Owner hard rule; D12. |

---

## 8. New modules required

All new code lives under `SbcStructural\Detailer\` (one project in V1, namespaces below, so the obfuscation/loader pipeline is unchanged) **except** `Sbc.Codes`, a separate netstandard2.0 class library consumed by both the plugin and SbcCalc.

| Namespace / folder | Purpose | Key classes |
|---|---|---|
| `Sbc.Codes` (separate project) | Host-neutral IS 456 / IS 13920 values and rule functions; pure functions over plain data. | `Is456` (ported from SbcCalc), `Is13920`, `CodeValues`, `Clause`, `RuleResult<T>`, `IColumnRules`, `IWallRules`, `IRuleSet`, `RuleSet_IS456_2000_IS13920_2016A1`, `RuleSet_IS456_Only`, `OfficeSettings` (JSON, versioned). See App. C §E. |
| `Detailer.Contracts` | The data contract (§13). No CAD types, no ETABS types. | `CadMemberGeometry`, `DesignRecord` (+`ColumnDesignRecord`, `WallPierDesignRecord`), `MemberKey`, `MatchRecord`, `DetailModel`, `Status`, `Finding`, `Provenance`, `ContractVersion`, `DesignSource` enum. |
| `Detailer.Import` | The two design sources behind one interface (D13). | `IDesignSource`, `EtabsDesignSource` (reads the Phase 2.5 tables → records), `SbcDesignSource` (adapts plugin/calculator design output → records), `ITableSource`, `ExcelTableSource` (OpenXML), `CsvTableSource`, `TableHeaderNormaliser`, `UnitsRowParser`, `ColumnSummaryMapper`, `PierSummaryMapper`, `StoryTableMapper`, `SectionTableMapper`, `E2kGeometryHints` (optional), `DesignSet`. |
| `Detailer.CadRead` | Existing plugin model → `CadMemberGeometry` (§10). The only namespace besides Render allowed to see CAD types. | `CadMemberReader`, `PolygonExtractor`, `StoreyBandResolver`, `OpeningFinder`, `MemberProvenance`. |
| `Detailer.Matching` | CAD ↔ design-record matching with confidence levels (§12). | `IMatcher`, `LabelMatcher`, `GeometryMatcher`, `StoreyMapper`, `MatchTable`, `MatchTolerances`, `MatchReport`, `MatchPersistence`. |
| `Detailer.Engine` | Geometry + requirement → `DetailModel`. No CAD types. Implements App. C §C. | `SectionClassifier`, `PolygonOffset`, `BarSelector`, `EdgeDistributor`, `LateralSupportSolver`, `HoopDecomposer`, `ZoneLayout`, `WallArranger`, `BoundaryElementArranger`, `ColumnDetailer`, `WallDetailer`, `DetailBuilder`, `Explain`. |
| `Detailer.Validation` | Ordered gates (§17) producing `Finding`s. | `GatePipeline`, `IGate`, `InputGate`, `MatchGate`, `GeometryConflictGate`, `DesignStatusGate`, `RuleGate`, `CompletenessGate`, `ConstructabilityGate`, `RenderGate`, `ValidationReport`. |
| `Detailer.Render` | `DetailModel` → primitive CAD entities via `CadAliases` only (§16). | `IDetailRenderer`, `PrimitiveRenderer`, `LayerMap`, `TextStyleMap`, `DimStyleMap`, `SectionDrawer`, `ElevationDrawer`, `WallDrawer`, `ScheduleDrawer` (lines + text), `DetailBlockWriter`, `DetailPlacer`. |
| `Detailer.Persistence` | Xrecord read/write of match table and detail state (§9). | `DetailStore`, `XrecordCodec`, `DetailStateRecord`. |
| `Detailer.Ui` | Detail step, member list, match/detail card, progress list, EXPLAIN drawer; no host assemblies. | `DetailStepControl`, `MatchGridModel`, `FindingsStrip`, `ProgressList`, `DetailCard`, `ExplainDrawer`, `DetailSettingsPage`. |
| `Detailer.Commands` (partial of `Commands`) | Thin command bodies. | `DetailWorkflow`, `DetailBatchJob` (JSON-driven, used by regression). |
| Tests | `Sbc.Codes.Tests`, `Detailer.Tests` (xUnit, net48, no CAD). One test per RuleId; golden `DetailModel` JSON per fixture. | — |

---

## 9. Proposed architecture

```
 ┌──────────────────────────────────────────────────────────────────────────┐
 │  HOST (ZWCAD 2024–26 / GstarCAD 2024–25, net48)                           │
 │  Commands.cs ─► Guard ─► Detailer.Commands.DetailWorkflow                 │
 │     ▲ PaletteSet (SbcUiHost)      ▲ CadAliases / CadCompat / ICadHost     │
 └─────┼──────────────────────────────┼─────────────────────────────────────┘
       │                              │
 ┌─────┴───────────┐        ┌─────────┴───────────┐        ┌────────────────┐
 │ Detailer.Ui     │        │ Detailer.Render     │        │ Detailer.CadRead│
 │ (no host asm)   │        │ (CadAliases only)   │        │ (CadAliases +   │
 └─────┬───────────┘        └─────────▲───────────┘        │ Model/Numbering)│
       │                              │                    └───────┬────────┘
       │                   ┌──────────┴───────────┐                │
       │                   │ Detailer.Persistence │                │
       │                   │ (Xrecord codec)      │                │
       │                   └──────────▲───────────┘                │
       ▼                              │                            ▼
 ┌──────────────────────────────────────────────────────────────────────────┐
 │  Detailer.Contracts  (records only: CadMemberGeometry, DesignRecord,       │
 │                       MatchRecord, DetailModel, Finding, Status)           │
 └──────────▲────────────────▲──────────────────▲──────────────────▲────────┘
            │                │                  │                  │
 ┌──────────┴─────┐ ┌────────┴────────┐ ┌───────┴────────┐ ┌───────┴────────┐
 │ Detailer.Import│ │ Detailer.Matching│ │ Detailer.Engine│ │ Detailer.Valid.│
 │ IDesignSource: │ │ (label, storey, │ │ (arrangement,  │ │ (gates G0–G8)  │
 │  SbcDesign     │ │  geometry)      │ │  zones)        │ │                │
 │  EtabsDesign   │ └─────────────────┘ └───────┬────────┘ └───────┬────────┘
 └──────────┬─────┘                             │                  │
            │                      ┌────────────┴──────────────────┴──────┐
            │                      │  Sbc.Codes  (netstandard2.0)         │
            │                      │  Is456 · Is13920 · OfficeSettings    │
            │                      │  shared with SbcCalc                 │
            │                      └──────────────────────────────────────┘
            ▼
   SbcDesign : plugin ColumnDesign / wall design (run on imported ETABS forces)   ← usual
   EtabsDesign: ETABS table export (.xlsx/.csv) — owner runs ETABS; SBC never starts it
```

**Dependency rules (enforced by project references and a ReflectHarness scan).**
1. `Sbc.Codes` references nothing but the BCL.
2. `Contracts`, `Import`, `Matching`, `Engine`, `Validation` reference `Sbc.Codes` and `Contracts` only. Zero `ZwSoft.*` / `Gssoft.*` / `Autodesk.*` types — verified by the harness; `buildcheck.ps1 -Label det` fails if one appears.
3. `Render` and `CadRead` use CAD types through `CadAliases` only, and only the primitive whitelist of App. D §4.
4. `Ui` has no host assemblies; it receives view-models from `DetailWorkflow`.
5. `Persistence` is the only writer of Xrecords; all keys namespaced `SBC_DETAIL_*`.
6. Nothing in `Detailer.*` references `Bbs`.
7. The Engine never asks "which design source"; it reads `DesignRecord` only. The source is visible solely in `Provenance.Source` and in the drawing notes.

**Data flow.** Design source (`SbcDesignSource` or `EtabsDesignSource`, per project) → `DesignSet` (records + provenance) → `Matching` (with `CadMemberGeometry` from `CadRead`) → `MatchTable` → `Engine` (`DetailBuilder` per matched member) → `DetailModel` → `Validation.GatePipeline` → `Render` → CAD entities + `Persistence`.

**Persistence: Xrecords in the drawing (primary) + sidecar JSON (secondary).**
- Match table: Xrecord `SBC_DETAIL_MATCH` under NOD dictionary `SBC_DETAILER`, one per matched member keyed by mark+storey, payload compact JSON (≤ 255-char string chunks reassembled). The match is a property of *this drawing*; it must travel with the DWG and work on both hosts (Xrecord/DBDictionary present on both, App. D §3).
- Detail state: Xrecord `SBC_DETAIL_STATE` on each inserted detail block's extension dictionary (version, member key, design provenance hash, model hash, timestamp, status, approver). Lets regeneration know what is stale.
- Import snapshot: **not** written into the DWG (can be MB-sized); only provenance + SHA-256; source file path stored relative to the DWG. Sidecar `<dwg>.sbcdetail.json` written on every successful run for QA diff (`compare.py`) and as a recovery path.
- Rejected: XData (16 KB per app limit), sidecar-only (gets separated from the DWG).

**Position in the SBC roadmap.** MASTER_PLAN: Phase 2 numbering lock → 1.14.2; Phase 2.5 ETABS export/import; Phase 4 design stages locked → 1.15; Phase 5 foundations/stairs → 1.16; Phase 6 sheets; Phase 7 pilot → 1.17 "office-ready". The Detailer sits **after the numbering lock and on top of Phase 2.5**, is built **alongside 1.15** in its own lane, and is a **1.17 deliverable** for columns and walls. It must not enter the 1.15 release train until M1 passes on both hosts. Long term the platform reads CAD/MODEL → ETABS INTEGRATION → ANALYSIS DATA → DESIGN → CALCULATOR → **DETAILER** → DRAWING GEN → BAR SCHEDULE → BBS → DOCUMENTATION; the Detailer's typed input/output records are built so it becomes that native stage without rewrite.

---

## 10. CAD → Detailer data flow

What CAD contributes: **WHERE** the member is and **WHAT actual geometry** it has. Nothing about reinforcement is read from CAD.

```csharp
namespace SbcStructural.Detailer.Contracts
{
  public enum MemberKind { Column, ShearWall, LiftWall, RetainingWall }     // C / SW / LW / RW marks
  public readonly record struct Pt(double X, double Y);                     // mm, world coords
  public sealed record Polygon(IReadOnlyList<Pt> Verts, bool IsCircle = false, double? Radius = null); // CCW, closed

  public sealed record StoreyBand(string StoreyId, string StoreyName, double BottomLevel_mm, double TopLevel_mm,
                                  double? SlabThickness_mm, string? EtabsStoryName);

  public sealed record Opening(Polygon Plan, double? SillLevel_mm, double? HeadLevel_mm, string SourceHandle);

  public sealed record CadMemberGeometry(
      string Mark,                       // "C12", "SW3", "LW1" – from Numbering
      MemberKind Kind,
      StoreyBand Storey,
      Polygon Plan,                      // outer outline, mm, world coords
      IReadOnlyList<Polygon> Legs,       // wall legs as rectangles; empty for columns
      Pt Centroid,
      (Pt Min, Pt Max) BoundingBox,
      double Rotation_deg,               // principal axis angle vs world X
      double B_mm, double D_mm,          // least / largest lateral dimension (walls: thickness / length)
      IReadOnlyList<Opening> Openings,
      IReadOnlyList<string> SourceHandles,   // polylines, SBC_BLK copies
      string? SourceBlockHandle,             // INSERT handle when read via StructuralBlocks
      string? NumberingTextHandle,
      string? ArchLabel,                     // free label text inside the outline – hint only
      bool FromParallelLines)                // wall detected by the two-open-polyline rule
}
```

How it is obtained, reusing existing code and adding no model-space scan:
1. `Model.Load` snapshot (**assumed API — verify in inventory**) gives the entities per structural layer including `SBC_BLK` copies from `StructuralBlocks.cs`.
2. `Numbering`/`Analysis` give mark ↔ outline association and kind. `CadMemberReader` asks `Numbering.MembersOf(storey, kind)` and never re-derives marks. Marks must be locked first (owner decision 2026-10-06).
3. `PolygonExtractor` flattens the closed polyline (bulges → ≥ 16 arc segments; circle entity → `IsCircle`), removes collinear vertices, forces CCW, converts to mm using the units check numbering already did ("NUMBERING STOPPED - WRONG UNITS" is reused as gate G0 input).
4. `StoreyBandResolver` reads the ProjectPanel storey list. For a plan used by several storeys, the same geometry is emitted once per storey with a different `Storey` — this is how "one physical column, many storeys" starts on the CAD side.
5. Walls drawn as two open parallel polylines (`Analysis.Supports`) → `Legs` built from the pair, `Plan` = their hull, `FromParallelLines = true` (lower geometric confidence in §12).
6. `OpeningFinder` reuses the OPENING layer and the lift cut-out detection. Sill/head heights are unknown from a plan → `null` → gate `STATUS: INCOMPLETE` ("wall opening heights") unless entered in the Detailer UI.
7. Provenance: handles from the `SBC_BLK` copy and its source INSERT.

Clear height of a column comes from storey levels and beam depths at each end. Beam depths come from the CAD BEAM layer (plugin beam model, assumed) or from the imported beam section table; if neither is available, `STATUS: INCOMPLETE` for that column (gate G6).

---

## 11. ETABS / SBC design → Detailer data flow

What the design source contributes: **WHAT** reinforcement is required (As,req, Av/s, ρ, boundary-element flags, ductile flag, overstress status). Nothing about actual CAD geometry is trusted from this side; ETABS geometry is used only as a *hint* for matching and as a *check* for conflicts.

### 11.1 The two sources (D13)

```
                         ┌──────────────────────────┐
  ETABS forces tables ──►│ Phase 2.5 import (plugin) │──► forces on SBC marks
                         └────────────┬─────────────┘
                                      │
              DesignSource = SbcDesign│                DesignSource = EtabsDesign
                                      ▼                            ▼
                     ┌────────────────────────┐       ┌────────────────────────┐
                     │ plugin ColumnDesign /   │       │ ETABS design tables     │
                     │ wall design (SBC rules) │       │ (column / pier summary) │
                     └───────────┬────────────┘       └───────────┬────────────┘
                                 │  SbcDesignSource                │  EtabsDesignSource
                                 ▼                                 ▼
                      ┌──────────────────────────────────────────────────┐
                      │  IDesignSource.Load() → DesignSet                 │
                      │  ColumnDesignRecord / WallPierDesignRecord        │
                      │  Provenance.Source = "SbcDesign" | "EtabsDesign"  │
                      └──────────────────────────────────────────────────┘
```

Rules:
- The project setting selects exactly one source. The Detailer never merges two sources for one member. If records from the other source also exist, they are shown as a **check value** in the schedule remarks and the detail card, never used for sizing.
- Both adapters must produce records that pass the same gate G1 (§17). A record is a record; the engine does not care who made it.

### 11.2 `EtabsDesign` path (table export, D3)

Channel: the ETABS **table export** (Excel preferred; CSV accepted) read by the Phase 2.5 import (`EtabsTables.cs`, `LabelMap.cs` — contents **assumed — verify in inventory**). No live API in V1; `ITableSource` leaves the seam for V1.5.

Pipeline:
1. `ITableSource.Open(path)` → list of `(title, headers[], units[], rows[][])`. Title taken from cell A1 (sheet names truncate at 31 chars, App. B §1a). Headers normalised (remove spaces, case-insensitive); table title matched by regex `IS\s*456[:\- ]?2000`.
2. `UnitsRowParser` converts to contract units (mm, mm², mm²/m, kN, kN·m, MPa, deg). Units are **parsed, never assumed** (App. B §4 pitfall 9). Numbers parsed with InvariantCulture; mixed separators fail loudly.
3. Required tables (missing mandatory table → `STATUS: INCOMPLETE` for the run):
   - `Story Definitions` → story list.
   - `Frame Assignments - Summary` (+ `- Section Properties`, `- Local Axes`), `Frame Sections`, `Frame Section Property Definitions - Concrete Rectangular/Circle` → sections, Design-vs-Check flag, angle.
   - `Point Object Connectivity` + `Frame Object Connectivity` → column end coordinates (geometry hints).
   - `Concrete Column Design Summary - IS 456:2000` → `ColumnDesignRecord.Stations` (all rows kept; envelope derived).
   - `Pier Section Properties`, `Area Assignments - Pier Labels`, `Shear Wall Pier Design Summary - IS 456:2000` (+ Details when present) → `WallPierDesignRecord`.
   - Optional: `Concrete Column Shear Details`, `Concrete Joint Design Summary`, `Concrete Beam Design Summary` (beam depths).
   All header spellings are App. B §2 and carry its "(verify)" marks until one real ETABS 22 export freezes them.
4. `LabelMap` (written when SBC generated the .e2k) attaches `MemberKey.SbcMark`. When the ETABS model was built by hand, `SbcMark = null` and §12 geometry matching does the work.
5. Provenance per App. B §5: source, etabsVersion, modelFile, exportDate, channel, tablesUsed, design codes, is13920Edition, sourceUnits, sha256. Stored in the DWG NOD and printed in the notes block.
6. Blank / "N/A" → `null`, never 0. `PMM Ratio` present and `Rebar Area` blank → `Mode = Check`. `Status "O/S"` → `Overstressed = true`, which **blocks** auto-detailing of that member.
7. What ETABS does NOT give (App. B §3) and the Detailer therefore computes: bar count/dia/arrangement, tie spacing/legs/dia, confinement Ash and l0, laps, hooks, cover, curtains, BE tie layout, openings, junctions, continuity between storeys. Every such value is tagged `source: Detailer` in the EXPLAIN text.

### 11.3 `SbcDesign` path (usual case)

The Phase 2.5 import brings ETABS **forces** (frame, pier, reactions, drifts) onto SBC marks; the plugin's `ColumnDesign` / wall design runs on them (or the Calculator does). `SbcDesignSource` adapts that output into the same records:

| Record field | From SbcDesign |
|---|---|
| `Key` | SBC mark + storey directly (no label mapping needed — `SbcMark = Mark`). |
| `Mode` | `Design` always. |
| `DesignSection`, `Fck`, `Fy` | The section and materials the design used. |
| `Stations[].AsRequired_mm2` | As,req from the design, or the design's chosen n×Ø (honoured if geometry allows, App. C §C6). |
| `AvsMajor/Minor` | From the shear design; or tie spacing + legs converted to mm²/m by the adapter. |
| `Pu/Mu` | Envelope, for the lap tension check and the wall stress trigger. |
| `FrameType` | Project ductile setting (D14). |
| `Status` | `Overstressed` when the design reports a failing section. |
| Wall: `PierShear`, `PierBoundary` | ρh, BE required flag + length from the wall design or the Calculator's 0.2 fck check. |
| `Provenance.Source` | `"SbcDesign"`, tool version = plugin/calculator version, hash of the design run. |

Output types of `ColumnDesign` and wall design are **not revealed** (**assumed — verify in inventory**). The adapter is the first thing reconciled in V1.1. For the Calculator app, `SbcCalc\UI\CadLink.cs` (contents assumed) can write the same `DesignSet` JSON (`sbc-detailer/etabs-import/v1` schema, source `SbcDesign`).

### 11.4 Matching on the SbcDesign path

Because SbcDesign records already carry SBC marks, matching is L1 (mark) in every case; geometry verification (L3) still runs against the design section so a drawing changed after the design run is caught as DATA CONFLICT.

---

## 12. CAD ↔ ETABS member matching strategy

Keys in order. The first level that produces a unique hit wins; every lower level is only *verification* of a higher one, never a silent override. Prerequisite: numbering locked (owner decision).

| Level | Rule | Result |
|---|---|---|
| L0 Storey | CAD `StoreyBand` ↔ ETABS story via `StoreyMapper`: explicit `EtabsStoryName`; else name equality after normalisation (`"3F"`, `"Story3"`, `"STOREY 3"` → `3`); else elevation match (`|TopLevel − Elevation| ≤ 50 mm`). Unmapped storey → every member on it is `MATCH FAILED (storey)`. | Required for everything below |
| L1 Mark/label | `MemberKey.SbcMark == Mark` (from LabelMap, or always on the SbcDesign path), or ETABS `Label == Mark` when the office draws ETABS labels, or `ArchLabel`. Unique Name / GUID stored once matched and preferred on re-match (labels renumber on delete — App. B §4). | **MATCH** — geometry still verified at L3; a disagreement downgrades to DATA CONFLICT, never to a silent rematch |
| L2 Pier legs | Pier (Story, PierLabel) with N legs ↔ CAD wall `Legs`: a leg matches if it overlaps the CAD leg centreline ≥ 70 % and thickness within 10 % or 25 mm. Pier matches when all legs match one CAD wall mark (or a connected set sharing a junction). | MATCH if all legs; `MATCH PARTIAL` (amber) if ≥ 1 leg unmatched → member blocked |
| L3 Geometry fallback (D7) | Same storey AND centroid distance ≤ 100 mm AND section within 10 % in B and D after applying angle AND same shape class. Must be unique both ways; otherwise ambiguous → MATCH FAILED listing the candidates. | **MATCH-BY-GEOMETRY** (amber, listed; drawing note "matched by position") |
| L4 | None of the above. | **MATCH FAILED** (red) — member blocked; everything else proceeds |

**Stacks.** One physical column over many storeys = chain of per-storey matches whose centroids coincide (≤ 100 mm) across consecutive storeys. The stack drives the elevation, laps and termination. A storey where the stack has a CAD member but no design record (or vice versa) → `DATA CONFLICT (stack gap)`. Section changes along the stack are allowed and drive the crank/dowel detail. Columns split within a storey (App. B pitfall 3): envelope of both segments, WARNING "two segments merged". Piers changing label between storeys: stacks are built on geometry; a label change is a WARNING only.

Tolerances are settings (`[Detailer]` INI: centroid 100, section 10 %, conflict 5 %, storey 50) and are printed in the match report.

**Report format** (command line, Findings strip, `match_report.txt` beside the DWG):
```
MATCH FAILED  C14 @ 3F      no ETABS column within 100 mm of (12450, 6500); nearest: C7 @ Story3 at 260 mm (section 300x600 vs 300x600)
MATCH FAILED  SW2 @ GF      pier P4 leg 2 (1550 mm along Y) has no CAD wall on layer SW; CAD SW2 has 1 leg
MATCH FAILED  C3 @ 5F       storey "5F" not mapped to an ETABS story (set EtabsStoryName in Project)
MATCH-BY-GEOMETRY  C9 @ 2F  matched to C9 @ Story2 by position (41 mm, 300x450 vs 300x450); no label map
DATA CONFLICT  C2 @ GF      CAD 300x600, ETABS design section C300X700 (D differs 16.7 % > 5 %) – review required
MATCH SUMMARY: 48 columns: 40 MATCH, 5 MATCH-BY-GEOMETRY, 2 MATCH FAILED, 1 DATA CONFLICT; 6 piers: 5 MATCH, 1 PARTIAL. Results are NOT complete.
```

**Persistence and re-match.** The `MatchTable` lives in the NOD (§9) keyed by (Mark, StoreyId) with UniqueName/GUID and CAD handles. On re-run: (a) if numbering raised "marks changed", each entry is re-validated by *handle* (entity still exists, mark changed → re-keyed and reported "C12 → C13 renamed, match kept"); (b) if the import hash changed, entries are re-validated UniqueName/GUID → label → geometry; any drop in level is downgraded, never silently kept. A match is never auto-upgraded from MATCH-BY-GEOMETRY to MATCH; the user can "accept" it (`UserAccepted = true`, still amber).

---

## 13. Data contract

Units fixed: mm, mm², mm²/m, kN, kN·m, MPa, degrees. `double?` means "unknown — a gate decides"; non-nullable means mandatory at construction (constructor throws → `STATUS: INCOMPLETE` with the field name). All records immutable; serialised with one JSON serializer for the whole plugin (System.Text.Json NuGet or Newtonsoft — decide at inventory). Every top-level document carries `$schema` and `schemaVersion`.

```csharp
namespace SbcStructural.Detailer.Contracts
{
  public static class ContractVersion { public const string Design = "sbc-detailer/design/v1";   // both sources
                                        public const string Match  = "sbc-detailer/match/v1";
                                        public const string Detail = "sbc-detailer/detail/v1";
                                        public const string CadGeometry = "sbc-detailer/cad-geometry/v1"; }

  public enum DesignSource { SbcDesign, EtabsDesign }                       // D13 — per project

  public sealed record Provenance(DesignSource Source, string? ToolVersion, string? ModelFile, string? FileSha256,
                                  DateTimeOffset ExportDate, string Channel, IReadOnlyList<string> TablesUsed,
                                  string? DesignCodeFrame, string? DesignCodeWall, string? Is13920Edition,
                                  (string Force, string Length) SourceUnits);

  public sealed record MemberKey(string Kind /*Column|Pier*/, string Story, string Label, string? UniqueName, string? Guid,
                                 string? Tower, string? SbcMark /*LabelMap; == Label on SbcDesign*/);

  public sealed record SectionDef(string Name, string Shape /*Rectangular|Circular|SD*/, string Material,
                                  double? Fck_MPa, double? Fy_MPa, double? B_mm, double? D_mm, double? Diameter_mm,
                                  RebarTemplate? Template, IReadOnlyList<Polygon>? SdPolygons);
  public sealed record RebarTemplate(string Mode /*Design|Check*/, string Pattern, double ClearCover_mm, int NBars3, int NBars2,
                                     int BarSize_mm, int TieSize_mm, double TieSpacing_mm, int NTies2, int NTies3);

  public sealed record ColumnStation(double Location_mm, string? PmmCombo, double? AsRequired_mm2, double? RhoRequired_pct,
                                     double? PmmRatio, double? Pu_kN, double? Mu2_kNm, double? Mu3_kNm,
                                     string? VMajorCombo, double? AvsMajor_mm2_per_m, string? VMinorCombo, double? AvsMinor_mm2_per_m,
                                     bool? CapacityShearGoverns);
  public sealed record ColumnGeometryHint(Pt Bottom, Pt Top, double BottomZ_mm, double TopZ_mm, double Angle_deg,
                                          int? CardinalPoint, double? B_mm, double? D_mm, double? Diameter_mm);

  public abstract record DesignRecord(MemberKey Key, string Mode /*Design|Check*/, string Status /*OK|Overstressed|NotDesigned*/,
                                      IReadOnlyList<string> Errors, IReadOnlyList<string> Warnings, Provenance Prov);

  public sealed record ColumnDesignRecord(MemberKey Key, string Mode, string Status, IReadOnlyList<string> Errors,
      IReadOnlyList<string> Warnings, Provenance Prov,
      string DesignSection, string? AnalysisSection, string FrameType /*Ductile|Ordinary|NonSway*/, bool FrameTypeAssumed,
      ColumnGeometryHint? Geometry, IReadOnlyList<ColumnStation> Stations /*≥1*/, ColumnStation Envelope,
      (int N, int Dia)? ChosenBars /*SbcDesign may pre-choose; honoured if geometry allows*/,
      double? AshOverS_major_mm2_per_m, double? AshOverS_minor_mm2_per_m /*null → Detailer computes IS 13920 8.1*/)
      : DesignRecord(Key, Mode, Status, Errors, Warnings, Prov);

  public sealed record PierLeg(string Id, Pt P1, Pt P2, double Length_mm, double Thickness_mm);
  public sealed record PierFlexure(string? Combo, double? AsRequired_mm2, double? RhoRequired, double? RhoCurrent,
                                   double? Pu_kN, double? Mu2_kNm, double? Mu3_kNm, double? DcRatio);
  public sealed record PierShear(string Leg, string? Combo, double? AvsHoriz_mm2_per_m, bool Overstressed, double? Vu_kN, double? Vc_kN);
  public sealed record PierBoundary(string Leg, string Edge /*Left|Right*/, double? EdgeLengthChecked_mm, double? StressComp_MPa,
                                    double? StressLimit_MPa, bool? Required, double? RequiredLength_mm, double? RequiredRho);
  public sealed record PierStation(string Location /*Top|Bottom*/, PierFlexure Flexure, IReadOnlyList<PierShear> Shear,
                                   IReadOnlyList<PierBoundary> Boundary);
  public sealed record WallPierDesignRecord(MemberKey Key, string Mode, string Status, IReadOnlyList<string> Errors,
      IReadOnlyList<string> Warnings, Provenance Prov,
      string PierType /*UniformReinforcing|SimplifiedCT|GeneralSD|SbcWall*/, string WallType /*Special|Ordinary*/, bool WallTypeAssumed,
      double? Fck_MPa, double? Fy_MPa, double AxisAngle_deg, IReadOnlyList<PierLeg> Legs /*≥1*/,
      Pt CgBot, Pt CgTop, double? Ag_mm2, IReadOnlyList<PierStation> Stations /*Top & Bottom*/)
      : DesignRecord(Key, Mode, Status, Errors, Warnings, Prov);

  public sealed record DesignSet(string Schema, string SchemaVersion, Provenance Prov, IReadOnlyList<StoreyBand> Stories,
                                 IReadOnlyList<SectionDef> Sections, IReadOnlyList<ColumnDesignRecord> Columns,
                                 IReadOnlyList<WallPierDesignRecord> Piers);

  public interface IDesignSource { DesignSource Kind { get; } DesignSet Load(ProjectContext ctx); }   // D13

  public enum MatchLevel { Match, MatchByGeometry, MatchPartial, Failed }
  public sealed record MatchRecord(string Mark, string StoreyId, MemberKey? Key, MatchLevel Level, bool UserAccepted,
                                   double? CentroidDistance_mm, double? SectionDeviation_pct, string Reason,
                                   IReadOnlyList<string> CadHandles, string? StackId);

  public enum Status { Ok, Warning, Incomplete, DataConflict, MatchFailed, Failed }
  public sealed record Finding(Status Status, string Gate, string Member, string Message, string? Clause, string? Hint);

  // DetailModel (output of Engine, input of Render) — App. C §C1 records plus:
  public sealed record TieZone(double From_mm, double To_mm, double Spacing_mm, string Name /*Confining|Mid|Lap|General|Joint*/, int Count);
  public sealed record LapSpec(double Start_mm, double Length_mm, string Group /*A|B*/, int Dia);
  public sealed record ColumnDetail(string Mark, string StackId, StoreyBand Storey, Polygon Section, double Cover_mm,
                                    SectionArrangement Arrangement, IReadOnlyList<TieZone> Zones, IReadOnlyList<LapSpec> Laps,
                                    double ClearHeight_mm, double? BeamDepthTop_mm, bool Ductile, string RuleSetId,
                                    IReadOnlyList<Finding> Findings, string DesignHash);
  public sealed record WallDetail(string Mark, StoreyBand Storey, IReadOnlyList<Polygon> Legs, int Curtains,
                                  BarSpec VerticalWeb, BarSpec HorizontalWeb, IReadOnlyList<BoundaryElementDetail> Bes,
                                  IReadOnlyList<Opening> Openings, IReadOnlyList<LapSpec> Laps, bool Special, string RuleSetId,
                                  IReadOnlyList<Finding> Findings, string DesignHash);
  public sealed record BarSpec(int Dia, double Spacing_mm, int Faces);
  public sealed record DetailModel(string Schema, string SchemaVersion, IReadOnlyList<ColumnDetail> Columns,
                                   IReadOnlyList<WallDetail> Walls, Provenance DesignProv, string OfficeSettingsVersion);
}
```

Mandatory per column record: key, designSection, mode, stations ≥ 1 with (location, asRequired **or** pmmRatio per mode, avsMajor, avsMinor). `Mode = Check` with `asRequired = null` → the section's `RebarTemplate` must be present → else `STATUS: INCOMPLETE "Check-mode column without rebar template"`. `avs*` missing → Detailer computes minimum ties per IS 456 26.5.3.2 + IS 13920 and flags "shear from code minimum". Geometry hints missing → match by storey + label only, flag "unverified geometry". fck/fy missing → project defaults with a warning.

Mandatory per pier record: key, pierType, legs ≥ 1, stations with flexure.asRequired (or dcRatio) and shear[] (avs or overstressed flag). `boundary[]` empty → Detailer runs the IS 13920 10.4.1 stress check itself from Pu/Mu if present; else "boundary element undetermined" → INCOMPLETE. `overstressed = true` blocks that pier.

Versioning: `schemaVersion` is semver; readers accept same major, warn on newer minor, refuse higher major with `STATUS: INCOMPLETE: file written by newer Detailer`. Xrecord payloads carry the same version in the first `TypedValue`. Adding an optional field = minor; renaming/removing = major. JSON property names camelCase.

---

## 14. Column detailing workflow

### 14.1 One column (the M1 story)

Inputs the engineer must already have: a numbered plan (SBCNUMBER run, numbering locked for this storey); the design source for the current revision (**SbcDesign**: design stage run on the imported ETABS forces; **EtabsDesign**: the ETABS table export .xlsx); project settings (zone — Mumbai III default, fck, fy, exposure/cover, bar preferences, `DesignSource`, `Ductile` on/off).

1. **Load the design once per revision.** Panel → Detail step → "Load design". On `EtabsDesign` the engineer picks the .xlsx; Detailer reads the ~12 fixed tables, parses the units row, and prints one line: "148 column rows, 36 pier rows, 0 unreadable; revision R3; units kN,mm". On `SbcDesign` the Detailer reads the plugin's last design run for the plan and prints "42 columns designed (SbcDesign, plugin 1.15.0, run 2026-10-06 18:40)". Missing table / field / design run → refused with the name shown (`STATUS: INCOMPLETE`).
2. **Match.** For every CAD column mark on every storey, §12 runs. Members grid gets a "Detail" column with the state. On `SbcDesign` every column is L1 MATCH unless the drawing changed after the design run (then DATA CONFLICT at L3).
3. **Pick the column.** Engineer clicks C7 (or selects it in the drawing) and presses "Detail". Detailer gathers: polygon from CAD (B × D, orientation); clear height from storey levels and beam depths; cover from settings; As,req and Av/s major/minor from the design record (envelope over stations); frame type (Ductile per D14 unless switched off); design section.
4. **Geometry check (D8).** CAD section vs design section: > 5 % in any dimension or a different shape → `DATA CONFLICT`, column to REVIEW with both values shown, nothing drawn. ≤ 5 % → warning in the strip, proceed with the CAD size.
5. **Arrange bars.** `Sbc.Codes` + Engine choose bar count and diameter from As,req with the office list (12/16/20/25/32, max two dias, corners the larger — D9; a pre-chosen n×Ø from SbcDesign is honoured if geometry allows), check 0.8–6 % (warn > 4 %), min 4 bars, periphery spacing ≤ 300 mm, place bars on the polygon (App. C §C4–C6). Then tie path, cross-ties so every bar is within 150 mm clear of a supported corner, tie dia ≥ 8 mm, 135° hooks (App. C §C7).
6. **Zones along height (App. C §A6, §C10).** Ductile: l0 = max(D, hc/6, 450) top and bottom at s = min(B/4, 6Ø, 100) with Ash per IS 13920 7.6.1(a) (computed by the Detailer — ETABS does not export it); lap zone in the central half, hoops ≤ 100 mm, two staggered groups ≥ 1.3 Llap apart; mid zone s = min(B/2, 16Ø, 300); joint hoops continued. If 2·l0 + 2.3·Llap > hc → "confined full height" flag. Gravity (ductile off): lap above floor or central half per setting; ties at min(B, 16Ø, 300). Spacing rounded down to the 25 mm module; 75 mm constructability floor with a warning.
7. **Validate.** Every rule returns Pass/Warn/Fail with its clause (App. C §C11 checks 1–18). Any Fail → REVIEW, drawing not inserted. Warnings listed, not blocking.
8. **Draw (§16).** One click gives: a section per zone (bars as dots, closed hoops with hooks, cross-ties with hooks, bar-mark labels, B/D dimensions, cover note); a column elevation (levels, hc, l0 zones "6-T8@100", lap zone with Llap and stagger, mid zone, joint hoops, first hoop at 50 mm); a schedule row (mark, grid, storey band, B×D, "8-T20", %, "T8@100/150/100", lap, grade, DD/G tag, remarks) written to the Members grid and the schedule block. Placement: model space "SBC-DETAILS" area next to the plan on LAYERS.dwg layers (default until §25 Q-A4 answers). Every entity carries an Xrecord with mark, storey, design revision, source (`SbcDesign`/`EtabsDesign`), rule-library version.
9. **Engineer checks.** (i) The amber/red list (geometry matches, conflicts, warnings); (ii) the section against what they would draw by hand; (iii) the elevation zones against beam depths. Then "Approve" → APPROVED, detail frozen (re-detailing an approved member asks first).

What is blocked when: no numbering lock → whole Detail step disabled with the reason. No design loaded → "Detail" disabled. MATCH FAILED or DATA CONFLICT → that member only. Validation Fail → that member only. Overstressed → that member only ("O/S — redesign"). ETABS *Check*-mode row (no As,req) → REVIEW with "designed in Check mode — bars read from ETABS template, confirm" (§25 Q-A1 default).

### 14.2 All columns (M2)

"Detail all" runs the same pipeline per storey over every column in state READY, in mark order, skipping blocked ones and listing them at the end: `COMPLETED WITH WARNINGS — 3 MEMBERS REQUIRE ATTENTION` (C7 conflict, C19 match failed, C31 O/S). Identical columns (same polygon, bars, zones, storey band) are grouped into one schedule row and one typical section, as drawing 1162 groups by storey band ("GF to 3F"). Stitching across storeys follows the CAD mark (stack, §12), not the ETABS label. Size change between storeys → crank 1:6 up to 75 mm offset, else dowels (§25 default); never crank in ductile columns' l0. L/T/C/+ columns: polygon decomposition into overlapping hoops (App. C §C8) with the IS 13920 Amd 1 note and state REVIEW. Time budget: linear, no model-space rescan per column (§20 perf).

### 14.3 Fit with office practice

Drawings 1071/1153 show each hoop shape as a separate dimensioned piece with hook type and a tie-set table; 1162 shows one column-group per storey band with a section sketch per band and "T8@100/150" callouts. The Detailer copies this format: section sketch per band in the schedule, separate link-detail output from the same tie shapes, and the notes block (codes, cover, lap table, hook rule, l0 rule, design source and revision) from App. C §D6. Bar marks appear as drawing text only; BBS is not touched (D12).

---

## 15. Shear wall detailing workflow

### 15.1 What the design source gives vs what the Detailer computes

From the design source, per (storey, pier):
- `EtabsDesign`: required vertical rebar area / ρv at top and bottom, horizontal rebar mm²/m per leg, O/S flag, boundary-element check per edge (stress vs 0.2 fck → BE yes/no; v18+ may also give BE length and ρ — to confirm from the owner's export), pier geometry per leg, Special/Ordinary flag (v22.6+). ETABS does *not* give bar diameters/spacing, curtains, BE tie size/spacing/legs, confinement height, laps, U-bars, opening trimmers, junction detailing, vertical continuity (App. B §3).
- `SbcDesign`: tw, lw, ρv/ρh required (or bars), BE required flag + length from the wall design / Calculator 0.2 fck check, Pu/Mu for the trigger, ductile flag. Mapped by `SbcDesignSource` into the same `WallPierDesignRecord` (`PierType = SbcWall`).

From CAD: the wall polygon per storey (SW/LW closed polylines or the two-parallel-polyline rule), thickness, openings (cut-out polylines), storey heights, adjoining columns and walls.

The Detailer (`Sbc.Codes` wall rules + `WallArranger`) computes: curtains (two for tw ≥ 200 by default — §25), vertical and horizontal bar dia and spacing each face (ρ ≥ 0.25 %; spacing ≤ min(lw/5, 3tw, 450); dia ≤ tw/10), BE layout at each end that needs one (detailed exactly as a ductile column by the column engine), end bars where no BE (4-T12 two layers, office practice), U-bars at free ends, horizontal-bar anchorage into BE cores and columns, laps (two groups, stagger ≥ 600 mm, not in the base plastic-hinge zone), extra bars at openings (area equal to interrupted bars + 2-T12 diagonals, extended Ld), zone layout along height. Ordinary (non-ductile) walls use the IS 456 32.5 table (App. C W-R7).

### 15.2 One wall

1. **Load** the same design set as for columns; pier records are read in the same pass.
2. **Match.** CAD SW/LW mark + storey → (Story, Pier label) via §12 L2. Piers with several legs (L/C/T cores) match as one pier to N CAD wall segments by geometry union; each CAD leg must land on one pier leg (70 % overlap, thickness 10 %/25 mm). A leg that does not match blocks the whole pier. Label changes between storeys are handled by stitching on the CAD mark; the label is shown, not trusted. On `SbcDesign` the mark matches directly.
3. **Pick and "Detail".** Inputs: polygon with openings, tw, lw, storey levels, ρv/ρh per leg, BE flags per edge (+ length if given, else the §25 rule), Special/Ordinary, fck/fy, cover (walls 25 internal / 30 external default).
4. **Geometry check.** CAD thickness or leg length vs design pier geometry > 5 % → `DATA CONFLICT`.
5. **Web steel.** Bars and spacing per face, vertical and horizontal, rounded down to 25 mm; ρv ≥ ρh; same dia both faces.
6. **Boundary elements.** Where required: BE length from the source (or rule), BE bars 0.8–6 % (warn > 4 %), confining ties at s_conf full storey height, cross-ties, hooks — a BE is literally a column section inside the wall polygon. Where not required: concentrated end bars + links at web spacing.
7. **Openings.** Each opening wider than the office threshold (300 mm default) gets trimmer bars both faces, both directions, Ld extensions dimensioned; a lintel between two piers that the source designed as a coupling beam is marked "coupling beam — not detailed" and listed (out of scope).
8. **Junctions.** L/C/T walls are one polygon: corner bars both faces, horizontal bars of each leg lapped into the other, U-bars at free ends. A column embedded in or touching the wall is detailed as a column; wall horizontals anchored Ld into its core; separate marks.
9. **Validate, draw, check, approve** as for columns. Deliverables: a section per storey band (tw, curtains, "T12@150 c/c EF", "T10@200 c/c EF", BE box with bars and links, U-bars, cover); a wall elevation (levels, two lap groups, BE link zones, opening trimmers with Ld, horizontal laps staggered); a BE schedule row in the column-schedule format; mark, lw and a plan key showing flange relations.
10. **All walls** = the same batch command; multi-leg cores are one item.

What the engineer checks: the BE decision per end per storey (the one place where ETABS versions differ in what they export), the opening threshold, whether a lintel is a coupling beam. What is blocked: everything in 14.1 plus "BE required but length unknown and no rule chosen" (`STATUS: INCOMPLETE`), and any pier whose legs did not all match.

---

## 16. Drawing generation workflow

1. `DetailBuilder` produces the `DetailModel`; `GatePipeline` runs; only members with `Status ≤ Warning` are rendered.
2. `LayerMap` resolves Detailer layers from `LAYERS.dwg` (embedded; built-in copy if absent). New layers to add: `SBC-DET-CONC` (outline), `SBC-DET-BAR`, `SBC-DET-LINK`, `SBC-DET-TEXT`, `SBC-DET-DIM`, `SBC-DET-LEVEL`, `SBC-DET-HATCH`, `SBC-DET-NOTE`, `SBC-HOLD` (already planned). Text and dim styles: the office ones from LAYERS.dwg, created if missing. Only `LayerTableRecord/TextStyleTableRecord/DimStyleTableRecord` creation.
3. **Blocks per detail.** Each detail is a block definition `SBC_DET_<KIND>_<MARK>_<BAND>_<VIEW>` (e.g. `SBC_DET_COL_C12_GF-3F_SEC`, `..._ELV`; walls `SBC_DET_WALL_SW2_GF_SEC`/`_ELV`) with attributes `MARK`, `BAND`, `STATUS`, `DESIGN_HASH`, `GEN_DATE` (only `MARK` visible). A block is the unit of regeneration: redefine the definition, keep the reference and its position.
4. **Insertion: model space "SBC-DETAILS" area, not a layout, for V1.** Reasons: `Sheets.Run` has the O(n²) issue; office drawings (1071/1153/1162) are model-space details composed onto sheets; layouts/viewports are "verify" on both clone hosts while model-space primitives are solid (App. D §3). Area origin is a setting (default: right of the plan bounding box + 2 × plan width), grid cells per detail sized by storey count; the position is stored in the block's Xrecord so updates keep manual placement. A later version can `Sheets.Run` these blocks into layouts.
5. **What is drawn.**
   - *Column section* (one per storey band of a stack; identical bands merged): outline polygon; bars as filled circles (`Circle` + simple-loop `Hatch`) with mark text; hoops as closed polylines on the tie path with 135° hooks drawn as short `Arc`+`Line` (hook geometry from `Sbc.Codes.HoopHook`); cross-ties as lines with hooks; cover note; `AlignedDimension` B and D; callout "8-T20 / T8@100 (l0) / T8@150 (mid)" (App. C §D1); "DD"/"G" tag; band label.
   - *Column elevation* (per stack): storey levels (`SBC-DET-LEVEL` lines + text), beam soffit, hc, l0 zones dimensioned with "6-T8@100", lap zone start at hc/4 with Llap and group A/B stagger, mid zone, joint hoops note, first hoop at 50, crank/dowel at section change (1:6), termination at roof, starter note at foundation ("per foundation drawing"). Bars as lines; ties as short lines per zone (beyond 40 ties, a broken-line symbol and the count, office style).
   - *Wall section* (per storey): leg outlines, curtains, vertical bars as circles, horizontal bars as lines, BE boxes with bars + links (same `SectionDrawer` as a column), U-bars, cover, "T12@150 c/c EF" callouts, lw/tw dims.
   - *Wall elevation*: levels, web spacing text, lap groups, BE link zones, opening trimmers with Ld, horizontal lap stagger.
   - *Mini schedule block* (lines + text, no `Table` entity): mark, band, size, bars, ties per zone, lap, grade, remarks — same rows as the Members grid; block `SBC_DET_SCHEDULE`.
   - *Notes block*: codes, cover, lap table, hook rule, l0 rule, "detailed from <SbcDesign run | ETABS export Tower-A_R3 2026-10-05> sha …", office settings version, tolerances used (App. C §D6).
6. **Primitive whitelist (D5).** `Line`, `Arc`, `Circle`, `Polyline` (bulges), `DBText`, `MText` (only `\P`, `\H`, `\S`, `%%c/%%d/%%p`), `AlignedDimension`, `RotatedDimension`, `RadialDimension`, classic `Leader`, `Hatch` simple loops, `BlockReference` + `AttributeReference`, `Wipeout`, `Xrecord`/XData. **Never** `Table`, `MLeader`, dynamic-block authoring, `Field`, managed Ribbon, `PlotEngine`, Overrules, COM, `Internal.*`, P/Invoke (App. D §4).
7. **Regeneration policy.** Every detail block stores `DesignHash` (design record envelope + section + rule set + office settings version + source) and `GeometryHash`. On `SBCDETAILUPDATE`: unchanged → untouched; changed → definition redefined in place; member now MATCH FAILED / DATA CONFLICT → block **not deleted**, `STATUS` attribute set and a red `SBC-HOLD` tag "HOLD-D07 DATA CHANGED" placed on it; hand-edited blocks (entity count/hash of the definition differs) → never overwritten, reported "C12 section edited by hand — skipped (use SBCDETAILFORCE)". All generation of one command runs in one transaction with one undo mark.

---

## 17. Validation system

Gates run in order. A `fail` blocks *that member* (never the whole run) except G0/G1 which block the run. Each gate yields `Finding`s with Pass / Warn / Fail and the clause tag where applicable.

| # | Gate | Checks | Fail blocks | Who can override |
|---|---|---|---|---|
| G0 Prerequisites | numbering locked (marks exist, no "marks changed" pending), units OK, storeys defined with levels, rule set selected, `DesignSource` set, LAYERS.dwg layers available | whole run | nobody |
| G1 Design input | source loaded; mandatory tables (EtabsDesign) or design run (SbcDesign) present; units row parsed; schema version; design code = IS 456:2000; per-record mandatory fields | whole run (missing table/run) / member (missing field → `STATUS: INCOMPLETE`) | nobody |
| G2 Match | §12 levels; ambiguous geometry; stack gaps | member (`MATCH FAILED`) | user may *accept* MATCH-BY-GEOMETRY; cannot accept FAILED |
| G3 Geometry conflict (D8) | CAD section vs design section > 5 % any dimension or different shape → `DATA CONFLICT`; ≤ 5 % → Warn; rotation mismatch > 5° → DATA CONFLICT; storey height CAD vs ETABS > 50 mm → Warn | member | engineer (role setting) with recorded reason, stored in Xrecord and printed in notes |
| G4 Design status | Overstressed / "O/S", PMM ratio > 1, NotDesigned, Check-mode without template, FrameType assumed, WallType assumed | member (fail) / Warn (assumed) | nobody for O/S; assumed flags Warn only |
| G5 Rules | App. C §C11 checks 1–18 via `IColumnRules.Validate` / `IWallRules.Validate`: clear spacing, %, min bars, periphery spacing, support rule, tie Ø, pitch, Ash provided ≥ required, hooks, lap window/fraction/stagger, crank, parity, limb thickness, cover; wall dia/spacing/ρ/curtains | member on code `Fail`; office-rule breaches Warn | code fails: nobody; office warnings: engineer |
| G6 Completeness | beam depth at column top unknown, wall opening heights unknown, fck/fy from defaults, confinement Ash computed by Detailer, BE length unknown | member → `STATUS: INCOMPLETE` when a drawn dimension depends on it; else Warn | user supplies the value in settings/grid |
| G7 Constructability | cross-ties per set > office max, confining spacing < 75, lap does not fit (E-LAP-NOFIT → couplers), lap-zone congestion, > 2 dias | Warn (configurable to Fail) | engineer |
| G8 Render | block name collision, hand-edited block, DETAILS area overlap, text style missing, host capability flag missing | member (skipped) | user via SBCDETAILFORCE |

Outputs: Findings strip in the panel (red / amber counts), `MATCH SUMMARY` line, `detail_report.txt` + `<dwg>.sbcdetail.json`, and HOLD tags in the drawing for anything blocking GFC. Integration with existing QA: any `Fail` makes the drawing NOT FOR GFC until resolved or waived through the existing Waive modal. Hand-calc verification: three test columns (low/typical/high As) in `handcalc\` with clause references; bar count, tie spacing per zone, l0, Llap and Ash must agree.

---

## 18. Error handling

- **Guard pattern.** Every command body is `Guard.Run("SBCDETAIL", () => DetailWorkflow.X(...))`. Unexpected exceptions keep the current behaviour (crash.log, "SBCDETAIL FAILED - unexpected error ... results are NOT complete"). Expected outcomes are *returned*, not thrown: `RunResult(Status Overall, IReadOnlyList<Finding> Findings, Stats)`; the guard prints the summary and the perf line.
- **Status precedence** per member: `Failed > MatchFailed > DataConflict > Incomplete > Warning > Ok`. Per run: the worst member status plus counts.
- **Message formats** (one line, fixed prefix, member, storey, reason, then the action) — identical in command line, strip and report file:
  ```
  MATCH FAILED   <MARK> @ <STOREY>   <reason>                      → <what to do>
  DATA CONFLICT  <MARK> @ <STOREY>   CAD <value> vs <SOURCE> <value>   → review required (SBCDETAILACCEPT to override with reason)
  INCOMPLETE     <MARK> @ <STOREY>   missing <field> (<source>)     → <where to supply it>
  WARNING        <MARK> @ <STOREY>   <rule/clause> <message>
  OK             <MARK> @ <STOREY>   <summary e.g. 8-T20, T8@100/150, lap 1000>
  SBCDETAIL DONE: <n> OK, <n> WARNING, <n> INCOMPLETE, <n> DATA CONFLICT, <n> MATCH FAILED   [results are NOT complete]   TIME: x s
  ```
  The "results are NOT complete" suffix appears whenever any member was blocked, mirroring the Guard wording.
- **Per-member card formats** (panel and report):
  ```
  STATUS: MATCH FAILED
  Missing: no ETABS frame label for C103 at storey 3
  ACTION:  check the mark→label map (Project tab ▸ ETABS data) or re-export the ETABS tables

  STATUS: DATA CONFLICT
  CAD:     450 × 600   ETABS: 450 × 750   (depth differs 25 %)
  ACTION:  correct the drawing or the ETABS section, then re-run SBCDETAILMATCH

  STATUS: INCOMPLETE
  Missing: ETABS design table "Concrete Column Design Summary" has no row for C204
  ACTION:  run concrete design in ETABS and re-export
  ```
- **End states** (exact strings, also in `result.json`): `COMPLETED ✓`; `COMPLETED WITH WARNINGS — n MEMBERS REQUIRE ATTENTION` followed by one member per line; `FAILED — <phase> — <reason>` (nothing inserted).
- No MessageBox anywhere in the Detailer (Concept 2). Modal only for `SBCDETAILACCEPT` reason entry (reuses the Waive modal) and the two destructive confirmations ("Remove inserted details for n members?", "Re-detail will replace n existing details — continue?"), default No.
- Every `Finding` carries `Hint` (actionable) and `Clause`; the EXPLAIN drawer shows the rule value and clause from `CodeValues`.
- Import errors name table, sheet, row and column (`"Concrete Column Design Summary" row 37 col "Rebar Area": "N/A" → null (Check mode?)`).
- Render errors roll back the whole transaction (one undo mark) and report `FAILED`; never half-inserted blocks.
- Esc at any prompt cancels cleanly (`SBCDETAIL cancelled`).

---

## 19. UI / workflow

### 19.1 Where the Detailer lives

Not a new window. One more step inside the approved Concept 2 docked panel (340 px, right, auto-hide, dark-first, tabs Workflow / Members / Project). Rules carried over from ui_a: no auto-popups, inline strips only (`InlineStrip.cs`: amber = confirm, red = error), `Guard.cs` around every command and UI event, modals only for destructive actions.

| Tab | What the Detailer adds |
|---|---|
| Workflow | New step **"Detail"** after Design (Number → Design → QA → **Detail** → Sheets → Issue GFC). State chip (NOT STARTED / RUNNING 67% / DONE / 3 ATTENTION); expands into the Detailer sub-view. |
| Members | One extra column **Detail** with the member's status chip; row action "Detail this member". Nothing else changes. |
| Project | Group **Detailer defaults** under Settings (19.7); row **Design source** (`SbcDesign` / `EtabsDesign`, loaded file or run, date, mark→label map status); `Ductile` on/off (default on). |
| Status bar | Existing "SBC Step n/7", "QA n RED", "NOT FOR GFC" plus **"DET n/N · k ATTN"**. Click opens the Detail step. |

The Detail step is **locked** (grey; strip "Numbering not locked — run SBCNUMBER and lock marks first (Project tab)") until the 1.14.2 numbering lock is set.

### 19.2 Detailer sub-view

Five regions, top to bottom: (1) **Source strip** — `CAD  review.dwg  storey 3  ✓ 42 columns 6 walls` and `DESIGN  SbcDesign run 2026-10-06 18:40  ✓ 42 columns` or `DESIGN  ETABS results_2026-10-04.xlsx  ✓ 48 frames  map 42/42`; amber if older than the DWG save, red if missing. (2) **Action row** — `[ Detail selected ] [ Detail all ] [ Match only ] [ Report ]`. (3) **Progress list** (19.5). (4) **Attention list** — only after COMPLETED WITH WARNINGS or FAILED; click selects, zooms, opens the card. (5) **Member list** — one row per column/wall of the current storey: mark, size, status chip, filter bar (All / Attention / Done / Not run / Walls / Columns, text filter).

### 19.3 Commands and ribbon

See §21 for the command table. **Ribbon**: one button **"Detail"** added to the 6-button "SBC" tab (becomes 7; obeys the "ribbon off" setting). On GstarCAD ≤ 2025 there is no managed ribbon API, so the button comes from the partial CUIX/menu route App. D recommends for all hosts.

### 19.4 One-column milestone flow

1. User types `SBCDETAIL` and picks a column (or `SBCDETAIL C7`).
2. Command line `Select column:` — pick the closed polyline or `SBC_BLK` copy on the COLUMN layer. Esc cancels cleanly.
3. Panel switches to the Detail step; progress list runs READING CAD ✓ → READING GEOMETRY ✓ → READING DESIGN DATA ✓ → MATCHING MEMBERS ✓.
4. Panel shows the **match card** (CAD vs design side by side, 19.6). On MATCH FAILED or DATA CONFLICT the flow stops; the card shows the ACTION lines; nothing inserted.
5. If matched, `[ Detail ]` is live (Enter). GENERATING COLUMN LINKS → GENERATING DRAWINGS → VALIDATING → COMPLETED ✓.
6. The detail block (section + elevation + schedule as lines/text) is inserted at the office detail location (setting: default area / ask). Drawing zooms to it; the row chip becomes DONE; the card gains `[ Zoom ] [ Explain ] [ Re-detail ] [ Approve ]`.
7. Undo is one step — tested on both hosts.

The whole flow works without the mouse after the pick: Tab cycles buttons, Enter activates, Esc returns.

### 19.5 Progress list and status language

```
READING CAD            ✓
READING GEOMETRY       ✓
READING DESIGN DATA    ✓
MATCHING MEMBERS       ✓
GENERATING COLUMN LINKS   67%  ▓▓▓▓▓▓▓░░░
GENERATING DRAWINGS        –
VALIDATING                 –
COMPLETED                  –
```

Rows are fixed and never reorder. Pending = dash, running = percentage + bar, done = ✓, failed = ✗ red. The same lines echo to the command line (`[SBC-DET] GENERATING COLUMN LINKS 67% (28/42)`). Member chips: `NOT RUN` (grey), `MATCHED` (navy), `MATCH BY GEOMETRY` (amber), `MATCH FAILED` (red), `DATA CONFLICT` (red), `INCOMPLETE` (amber), `DONE` (gold tick on navy), `DONE · WARN`, `APPROVED`. Colours are the existing brand ones (navy #1F3B73, gold #C2A620, amber, red); no green is introduced. Status is never conveyed by colour alone — every chip carries its word.

### 19.6 Detail card and EXPLAIN drawer

```
┌ C103  450×600  storey 3            [ ← ] ┐
│ STATUS: DATA CONFLICT                     │  (red strip)
│                                           │
│            CAD            ETABS           │
│ Section    450 × 600      450 × 750   ◄!  │
│ Shape      RECT           RECT            │
│ Centroid   12.450,8.300   12.452,8.301    │
│ Storey     3              Story3          │
│ Label      C103           C103-S3   ✓     │
│ Ast req    –              3 216 mm²       │
│ Pu / Mu    –              2 140 / 118     │
│ Ductile    zone III       DUCTILE  ✓      │
│                                           │
│ ACTION: correct drawing or ETABS section, │
│         then re-run SBCDETAILMATCH        │
│ [ Re-match ]  [ Explain ]  [ Zoom CAD ]   │
└───────────────────────────────────────────┘
```

The right column header reads `ETABS` or `SBC DESIGN` per project source. Conflict rows are highlighted (`◄!`); agreeing rows get a gold ✓. After a successful detail a **Reinforcement** block appears: main bars, links per zone, confinement length, lap length and location, cover — each with its clause in muted text. `[ Explain ]` opens the EXPLAIN drawer (slides inside the panel, never a popup): numbered lines citing clauses, e.g. `3. End link spacing = min(b/4, 6Ø, 100) = min(112, 96, 100) = 96 → 75 mm (rounded down to 25) — IS 13920:2016 cl. 8.1`; `5. Lap 50Ø = 800 mm, office table (Fe500, M25) ≥ IS 456 cl. 26.2.5`. The same text goes to the report.

### 19.7 Settings (Project tab ▸ Detailer defaults)

All persisted in the existing INI so regression cases can pin them: `DesignSource` (SbcDesign/EtabsDesign), `Ductile` (on by default), match tolerances (centroid 100 mm, section 10 %), conflict threshold (5 %), preferred dias `12/16/20/25/32`, max dias 2, min tie dia 8, hook 135°, spacing module 25 mm, confining floor 75, cover default 40 (by exposure), lap table (office), lap location (gravity), crank/dowel policy, curtains rule, opening threshold 300, detail insertion (default / ask), area origin, scale, text/dim style, results folder, role (draughtsman/engineer). Changing a setting after a run marks affected members `NOT RUN` with an amber strip "Defaults changed — re-detail 42 members".

### 19.8 Panel wireframes

Idle, numbering locked, nothing run:
```
┌ SBC ───────────────── Workflow | Members | Project ┐
│ ▸ 1 Number      DONE  42 C · 6 SW                  │
│ ▸ 2 Design      DONE                               │
│ ▸ 3 QA          2 AMBER                            │
│ ▾ 4 Detail      NOT STARTED                        │
│   CAD     review.dwg · storey 3       ✓ 42 C 6 W   │
│   DESIGN  (none loaded)               ✗            │
│   ▌Load design: Project ▸ Design source        ▐   │ (amber strip)
│   [ Detail selected ] [ Detail all ] [ Match ] [⋯] │
│   ── Members ─────────── All ▾  ⌕ ───────────────  │
│   C101  300×600   NOT RUN                          │
│   C102  300×600   NOT RUN                          │
│ ▸ 5 Sheets                                          │
│ ▸ 6 Issue GFC   NOT FOR GFC                        │
└──────────────────────────────────────────────────────┘
```
Completed with warnings:
```
│ ▾ 4 Detail      DONE · 3 ATTENTION                 │
│   COMPLETED WITH WARNINGS                          │
│   ▌3 MEMBERS REQUIRE ATTENTION                  ▐  │ (amber strip)
│   C103  Missing ETABS design data        ▸         │
│   C204  Invalid CAD geometry             ▸         │
│   W12   Boundary data missing            ▸         │
│   [ Report ]  [ Re-detail attention ]              │
```

### 19.9 Accessibility, logging, modality

Theme via `SbcTheme.cs` tokens only; dark-first, light variant follows the host theme. Minimum 12 px text; contrast checked for navy-on-dark and amber-on-dark. Font fallback Poppins/Lato → Segoe UI (never ship fonts). Command-line log: start line, phase lines, attention lines, end state, `DETAIL TIME: x s`, and under `SBC_CMDTIME=1` the `[SBC-TIME]` line. Nothing in the log that is not in the panel and vice versa. Selection sync: selecting a row highlights the CAD outline; picking an outline selects the row. No automatic zoom except after a successful insert.

---

## 20. Indian Standard / code architecture

**Principle (D4, App. C §E1).** Rules are pure functions over plain data. No CAD, ETABS or UI types. Every numeric constant lives in one table (`CodeValues`) keyed by `RuleId` with `Clause`, `Edition`, `Amendment`, `Value`, `Note`, `Verified`. Rule functions read constants by RuleId; they never embed numbers. Every rule output is a `RuleResult` carrying its clause so the UI, EXPLAIN and the drawing notes can print "IS 13920:2016 cl. 8.1" beside any value.

**Library.** `Sbc.Codes` (netstandard2.0): `Is456.cs` ported from `SbcCalc\Engine\Is456.cs` (τbd, Ld, lap table, cover Tables 16/16A, min/max steel, τc) with a `PortedFrom` comment and commit hash; new `Is13920.cs` (confinement spacing, Ash, l0, hooks, leg spacing, lap window, wall clauses); `OfficeSettings` (JSON, versioned, printed in the notes block); `CodeValueCatalogue` that enumerates every constant for a "rules in force" sheet.

**Interfaces** (App. C §E2): `IColumnRules` (MinSteelPct, MaxSteelPct, MinBars, MinBarDia, MaxPeripherySpacing, MinClearSpacing, NominalCover, MinTieDia, TiePitchGeneral/Mid, MaxClearToSupportedBar, MaxHoopLegSpacing, ConfiningZoneLength, ConfiningSpacing, AshRect, AshCirc, HoopHook, LapLength, LapHoopSpacing, MaxLappedFraction, LapWindow, StaggerDistance, Crank, JointHoops, FullHeightConfinement, Validate); `IWallRules` (MinThickness, MinReinfPct, Curtains, MaxBarDia, MaxSpacing, BoundaryElementRequired, BeSteelPct, HorizontalBarAnchorage, MaxLappedFraction, LapStagger, OpeningReinforcement, Validate); `IRuleSet` (editions, values, columns, walls, office). Implementations: `RuleSet_IS456_2000_IS13920_2016A1` (default, D14) and `RuleSet_IS456_Only` (ductile off). The arrangement algorithm takes `ArrangementLimits` built from `IRuleSet`; it never calls rules directly.

**Core values** (copied from Appendix C §E3; "(verify)" preserved — not invented here):

| RuleId | Clause | Value | V |
|---|---|---|---|
| COL.MIN_PCT / MAX_PCT / WARN_PCT | IS 456 26.5.3.1(a) / office | 0.8 % / 6 % / 4 % | V |
| COL.MIN_BARS_RECT / CIRC | IS 456 26.5.3.1(c) | 4 / 6 | V |
| COL.MIN_BAR_DIA | IS 456 26.5.3.1(d) | 12 mm | V |
| COL.MAX_PERIPHERY_SPACING | IS 456 26.5.3.1(g) | 300 mm | (verify letter) |
| BAR.MIN_CLEAR | IS 456 26.3.2 | max(Ø, agg + 5) | V |
| COV.COLUMN_MIN / EXPOSURE / FIRE | IS 456 26.4.2.1 / Table 16 / Table 16A | 40 (25 for ≤ 200/≤ 12) / 20/30/45/50/75 / 40 | V |
| TIE.MIN_DIA_FRACTION | IS 456 26.5.3.2(c)(2) | Ø/4, ≥ 6 | V |
| TIE.MIN_DIA_OFFICE | office | 8 mm | decision |
| TIE.PITCH | IS 456 26.5.3.2(c)(1) | min(B, 16Ø, 300) | V |
| TIE.MAX_CLEAR_TO_SUPPORTED | IS 456 26.5.3.2(b) | 150 mm | V |
| DUCT.MIN_COL_DIM | IS 13920 7.1.1 | 300; 20 × beam bar | V |
| DUCT.ASPECT | IS 13920 7.1.2 | 0.45 | (verify) |
| DUCT.SHAPE_NOTE | IS 13920 Amd 1 | T/X/+ specialist | V (Calc) |
| DUCT.LAP_WINDOW / LAP_MAX_FRACTION | IS 13920 7.3.2 | central half / 50 % | V |
| DUCT.LAP_HOOP_SPACING | IS 13920 7.3.2 | 100 mm (1993: 150) | (verify) |
| HOOP.HOOK_ANGLE / HOOK_EXT | IS 13920 7.4.1 | 135° / 10Øt ≥ 75 | V |
| HOOP.MIN_DIA | IS 13920 6.3.2 / 7.4.1 | 8 mm | (verify) |
| HOOP.MAX_LEG_SPACING | IS 13920 7.4.2 | 300 mm | V |
| HOOP.MID_SPACING | IS 13920 7.4.2 | B/2 | (verify sub-clause) |
| CONF.L0 | IS 13920 8.1 | max(D, hc/6, 450) | V |
| CONF.SPACING | IS 13920 8.1 | min(B/4, 6Ø, 100) | V (Calc) |
| CONF.SPACING_MIN_OFFICE | office | 75 mm | decision |
| CONF.ASH_RECT_K / ASH_H_MAX | IS 13920 7.6.1(a) | 0.18 / 0.05; 300 mm | V |
| CONF.ASH_CIRC_K | IS 13920 7.6.1(b)(c) | 0.09 / 0.024 | V (Calc) |
| CONF.FOOTING_EXT | IS 13920 8.x | 300 mm | (verify number) |
| JOINT.CONFINED_SPACING / BEAM_WIDTH_FRACTION | IS 13920 9.3 | 150 mm, half Ash / 3/4 | (verify) |
| LAP.OFFICE_TABLE | office | 50/46/40/36 Ø | V (Calc) |
| LAP.FACTOR_TOP / CORNER / BOTH | IS 456 26.2.5.1(c) | 1.4 / 1.4 / 2.0 | V; application F-10 |
| LAP.MIN / MAX_DIA / STAGGER | IS 456 26.2.5.1 | 15Ø, 200 mm / 36 mm / 1.3 Llap | V |
| CRANK.SLOPE / MAX_OFFSET | SP 34 / ACI | 1:6 / 75 mm | (verify) |
| WALL.MIN_T | IS 13920 10.1.1 | 150 mm | V |
| WALL.MIN_PCT | IS 13920 10.1.4 | 0.25 % each way | V |
| WALL.TWO_CURTAIN_T / TAU | IS 13920 10.1.5 | 200 mm / 0.25√fck | V value, (verify number) |
| WALL.MAX_BAR_DIA | IS 13920 10.1.6 | tw/10 | V value |
| WALL.MAX_SPACING | IS 13920 10.1.7 | min(lw/5, 3tw, 450) | V value |
| WALL.IS456_MIN_V / MIN_H / MAX_DIA | IS 456 32.5 | 0.12/0.15 %; 0.20/0.25 %; tw/8 | V |
| BE.TRIGGER | IS 13920 10.4.1 | 0.2 fck / 0.15 fck | V |
| BE.MIN_PCT / MAX_PCT / WARN | IS 13920 10.4.3 | 0.8 / 6 / 4 % | V values, (verify number) |
| BE.CONFINE | IS 13920 10.4.4 → 7.6 | as column | (verify number) |
| WALL.LAP_MAX_FRACTION / LAP_STAGGER | IS 13920 10.9.x | 1/3 / 600 mm | (verify) |
| WALL.OPENING_REINF | IS 13920 10.6.1 | = interrupted As, + Ld | (verify number) |
| WALL.END_BARS_MIN | SP 34 / 13920 10.1.x | 4-T12 two layers | (verify) |

The full catalogue, the "(verify against BIS copy)" list (App. C §G, 21 items) and the engineering questions F-1…F-23 are in Appendix C. Every "(verify)" value is implemented with the stated number and carried as a pending unit test; the release note lists what is still unverified. IS 13920 Amendment 2 (2021) is not reviewed until the BIS copy is supplied.

**Ductile policy (D10, D14).** `Ductile = on` by default (Mumbai, Zone III, IS 13920 cl. 1.1.1). Per project it can be switched off for gravity-only small buildings → `RuleSet_IS456_Only`. ETABS "Ductile" frame type, when present, is shown as a check against the project setting; a mismatch is a WARNING.

**Testing.** One xUnit test per RuleId with the value above (the test file doubles as the human-readable catalogue); the Calculator's 144 Excel cases re-run for the ported functions to prove byte-equivalence; a failing test after a code update says exactly which drawing outputs change.

---

## 21. Integration with the existing CAD / plugin

**Commands** (in `Commands.cs`, `SBT*` twins for the test build, all through `Guard`):

| Command | Does |
|---|---|
| `SBCDETAILIMPORT [file]` | Loads the design source (ETABS export on `EtabsDesign`; last design run on `SbcDesign`), runs G1, stores provenance; prints tables/records found. |
| `SBCDETAILMATCH` | Runs §12, writes the MatchTable, prints MATCH SUMMARY + report. |
| `SBCDETAIL [mark … | ALL]` | Match (if stale) → engine → gates → render for the selected marks. With no argument, prompts `Select column:` (the M1 pick flow, 19.4). Walls in M3. |
| `SBCDETAILUPDATE` | Regeneration policy §16.7 for all stored details. |
| `SBCDETAILACCEPT <mark>` | Accept MATCH-BY-GEOMETRY / override DATA CONFLICT with reason (engineer role). |
| `SBCDETAILREPORT` | Writes `detail_report.txt`, the HTML report (same style as SBCREPORT), the sidecar JSON and the notes block. |
| `SBCDETAILBATCH job.json` | Non-interactive driver for regression (`/b` script, App. D §5). No UI; prints the same progress lines; writes `result.json`. |

SBT twins skip the panel, never prompt, and write `result.json`, exactly as `SBTNUMBER`/`SBTDESIGN` do.

**Workflow tab.** Step "Detail" between "Design" and "Sheets/Issue GFC": buttons Import / Match / Detail / Update, status chip, inline strips. Members grid gets columns `Design key`, `Match`, `Detail status`. The status-bar "QA n RED" counts Detailer fails.

**Settings.** `SBCSET` INI section `[Detailer]` (19.7), also per regression case INI.

**Lane, branch, worktree.** Lane `det_0` (M0–M1), then `det_1` (M2), `det_2` (M3–M4); worktree `C:\Users\admin\sbc_det\wt`, like `perf_0` → `sbc_perf\wt`. Base: `beta_1142` (ui_a + num_2 over 1.14.2) because the Detail step needs the Concept 2 panel and matching needs the numbering lock. If `beta_1142` is rebased before M1 ends, `det_0` rebases with it. Lane note `Docs\notes\lane_det_0.md` written from day one (the audit records that `lane_num1.md` was never written). Commits `det_0: <area>: <what>`; merge commit `Merge lane det_0 (M1 one column)`.

**Project layout added by the lane.**
```
SbcStructural\Detailer\        (one plugin project; namespaces per §8; CadRead/Render/Ui/Commands are the only CAD-aware folders)
Sbc.Codes\                     (netstandard2.0, no CAD refs; Is456.cs ported, Is13920.cs, OfficeSettings)
Sbc.Codes.Tests\, Detailer.Tests\   (xUnit, net48, off-host; golden JSON)
Build\regression\inputs\det_*.dxf|.xlsx|.csv, baseline\{zw,gs}\det_*.json, check_det_*.py, settings_det.ini
```
`buildcheck.ps1 -Label det` fails if `Sbc.Codes` or any of `Contracts/Import/Matching/Engine/Validation` references a host assembly; ReflectHarness scans referenced types per namespace.

**Regression harness additions.** Cases: `det_col1` (M1: one 450×600 rectangular ductile column; `Pre = "SBTNUMBER"`; `inputs\det_col1.dxf` from `make_det_col1.py` + `det_col1_etabs.xlsx` fixture; `settings_det.ini`), `det_col_fail` (MATCH FAILED path, nothing inserted, correct ACTION lines), `det_col_conflict` (DATA CONFLICT 25 % depth), `det_col_sbcdesign` (same column on the `SbcDesign` path; must give the identical `DetailModel`), `det_cols_all` (12 columns, two attention, M2), `det_stack` (3-storey stack with section change), `det_col_L/T/C` (M2), `det_wall1`, `det_wall_opening` (M3), `realworld` extended with `SBTDETAILBATCH` (M4). `result.json` gains `detail: {ok, warn, incomplete, conflict, failed, blocks, perf}`; `compare.py` compares these (`perf` ignored); `checks_ext.py` WARN check `detail_notes_present`. Each case saves DXF R2018; a normaliser strips handles/timestamps/GUIDs and rounds coordinates; baselines stored **per host** (`baseline\zw\`, `baseline\gs\`) for raw geometry and compared **across** hosts on the semantic layer only (`compare.py --semantic`: counts per layer/type, strings, dimension measurements, attribute values, Xrecord payloads, bounding boxes ± 0.5 mm). `det_*` baselines are approved only in the merge commit with the diff pasted into the lane note (the 1.14.2 stale-baseline lesson).

**Unit tests (off-host, < 10 s).** Golden `DetailModel` JSON per fixture; rule tests named by clause (`Is13920_8_1_EndSpacing_min_b4_6db_100`); matcher tests at 99/101 mm, 9/11 %, 4.9/5.1 %, storey mismatch; validator tests (every attention string produced by exactly one condition; end-state string derived, never hand-set); polygon tests for rectangle, L, T, C from day one (D11); Explain tests (every line cites a clause that exists in `Sbc.Codes`); `IDesignSource` tests (the same column through both adapters yields one `ColumnDesignRecord` envelope).

**Dual-host build.** Configurations `ZWCAD-net48` (today's), `GSTARCAD-net48` (GstarCAD 2024/2025, D6), `AUTOCAD`/`PCAD` unchanged. `CadAliases.cs` + `Gssoft.Gscad` references via NuGet `GstarCADNET 25.1.0`, `Private=false` (never ship host DLLs). `build_release.ps1` loops hosts for obfuscation (`plugin_out_gs2024`, `plugin_out_gs2025`) and installer payloads; ConfuserEx exclusions for `[CommandMethod]` classes and JSON-serialised model types (`[Obfuscation(Exclude=true)]`; ReflectHarness check that serialises a model after obfuscation). Installer enumerates GstarCAD `R24/R25` and ZWCAD 2025/2026 registry roots and writes loader keys; ships the partial CUIX for the Detail button. Ribbon on GstarCAD ≤ 2025 via CUIX (no managed ribbon API, App. D §1). One-week spike (M0): compile the current plugin against GstarCAD 2025 and NETLOAD before any Detailer code is merged.

**Dual-host matrix.** `run_regression.ps1 -Host zw2026|zw2025|gs2024|gs2025` runs each `det_*` case via `/nologo /b run.scr` (NETLOAD, open fixture, `SBTDETAILBATCH`, SAVEAS DXF, QUIT). GstarCAD 2026+ has an empty column so nobody forgets. Owner manual sheet `Docs\HOW TO TEST - DETAILER M1.md` in the style of `HOW TO TEST - 1.14.2 BETA.md`: PaletteSet dock/float/close/reopen, ribbon/menu presence, the keyboard flow, a real office drawing against 1071/1153, light theme, Esc at every prompt, Undo once removes everything.

**Performance budget (from perf_0).** Zero unhandled exceptions. `SBTDETAIL` one column ≤ 1.0 s wall, ≤ +50 MB private; `SBTDETAILBATCH` 42 columns ≤ 15 s (≤ 0.3 s/member); `SBTDETAILMATCH` ≤ 2 s; at most one `Model.Load` scan per run (asserted by a counter in regression). > 10 % slower than baseline fails the gate (MASTER_PLAN §10); perf judged on the median of three runs. One transaction per member, one undo group per command, no `Regen` in loops, details placed on a grid (no collision solving). BBS byte-identical before and after (`git diff --stat` shows nothing under `Bbs`).

**Definition of done (every milestone).** (1) `buildcheck.ps1 -Label det` clean on both configurations; (2) unit tests green; (3) the milestone's `det_*` cases pass on all four host cells with approved baselines; (4) perf within budget, numbers in the lane note; (5) zero Guard FAILED lines; (6) owner test sheet executed and signed on at least ZWCAD 2026 and GstarCAD 2025; (7) lane note and D-rows updated; (8) release build + installer in `3 BETA\`; (9) no BBS file touched.

---

## 22. Integration with SBC Calculator

- **Shared `Sbc.Codes` library (D4).** Created by *porting* `SbcCalc\Engine\Is456.cs` (τc, τc,max, kLim/xu,max, Ld, lap table, cover tables, min/max steel) into `Sbc.Codes\Is456.cs` with clause tags, plus new `Is13920.cs` (confinement spacing min(b/4, 6Ø, 100) and Ash — currently in the Calculator — l0, hooks, leg spacing, lap window, wall clauses) and `OfficeSettings`. The Calculator references `Sbc.Codes` at its own release cadence; the plugin's `BeamDesign` duplicates (XC-7) are removed in the same step.
- **Port-not-edit rule** (memory `shared-code-plugin-calculator.md`). The Detailer lane never edits `SbcCalc\*`. `Sbc.Codes\Is456.cs` is byte-for-byte traceable to the source (`PortedFrom` + commit hash); `Sbc.Codes.Tests` re-runs the relevant values of the 144-case Excel check (`excel_cases.ps1` reused, not edited) to prove equivalence. SbcCalc 1.3.0 is code-frozen; adoption of the library is the Calculator session's decision.
- **The `SbcDesign` source (D13) — the office's usual path.** Two producers feed it through the same adapter contract: (a) the plugin's own `ColumnDesign` / wall design run on imported ETABS forces (inside the CAD session; output types **assumed — verify in inventory**); (b) the Calculator app, which writes a `DesignSet` JSON (`sbc-detailer/design/v1`, `Provenance.Source = SbcDesign`) through `SbcCalc\UI\CadLink.cs` (contents **assumed — verify**) for the plugin to read with `SBCDETAILIMPORT <file>`. Needed per column per storey: section (B, D or Ø), fck, fy, cover, `AsRequired_mm2` (or chosen n×Ø — honoured if geometry allows), `AvsMajor/Minor` (or tie spacing + legs), Pu envelope (lap tension check F-10), ductile flag. Per wall: tw, lw, ρv/ρh required or bars, BE required flag + length, Pu/Mu for the stress trigger.
- **The `EtabsDesign` source** never passes through the Calculator; the Calculator may still be used as a *check* (its numbers appear in the schedule remarks when both exist). The per-project setting names the one source used for sizing; the Detailer never merges the two for one member.
- **Calculator cross-check findings** XC-2…XC-8 (App. A §9) stay with the design sessions; the Detailer only consumes As and Av/s and is not affected except XC-7 (duplicated τc, removed by `Sbc.Codes`) and XC-8 (column lap rule — the Detailer uses the office tension-lap table for all column laps, so XC-8 is moot on the drawing).

---

## 23. Dependencies (ordered)

1. **Numbering lock (1.14.2 Phase 2)** — stable marks, "marks changed" diff, `MembersOf()` API. Nothing in Matching is trusted before this (owner decision 2026-10-06). Until it lands, M0 and the pure engine proceed on fixed test marks in `inputs\det_col1.dxf`; nothing is persisted against live marks.
2. **Phase 2.5 ETABS import** (`EtabsTables.cs`, `LabelMap.cs`, SBCETABS with mark→label map) — the `EtabsDesign` mappers sit on it; header freeze requires one real ETABS 22 export from the owner.
3. **Column/wall design output types** (plugin `ColumnDesign`, wall design; Calculator `CadLink.cs`) — the `SbcDesign` adapter needs them; first item in the inventory reconciliation (V1.1).
4. **`Is456.cs` port into `Sbc.Codes`** (+ `Is13920.cs`, `OfficeSettings`) — Engine and Validation compile against it; removes XC-7.
5. **Dual-host build** (`GSTARCAD-net48`, CadAliases extension, GstarCAD 2025 NETLOAD spike) — must pass before Render is written so the primitive whitelist is proven on both hosts. Needs a GstarCAD 2024/2025 licence or trial and NuGet `GstarCADNET 25.1.0`.
6. **LAYERS.dwg detail layers** (`SBC-DET-*`, `SBC-HOLD`) + text/dim style names confirmed from the office answer-key drawings (1071/1153/1162).
7. **Storey schema** in ProjectPanel with levels + `EtabsStoryName`; project settings `DesignSource` and `Ductile`.
8. **Office settings confirmation** (D9, App. C §F) — Engine runs with defaults but drawings stay "NOT FOR GFC" until confirmed.
9. **Regression fixtures**: one DWG + one ETABS export + one SbcDesign run for the milestone column; a Windows machine with ZWCAD and GstarCAD for the matrix.
10. **External packages**: OpenXML SDK for .xlsx (no ACE driver), one JSON serializer for the plugin, xUnit for off-host tests. No ETABS interop in V1.

---

## 24. Risks (ranked)

| # | Risk | Type | L / I | Mitigation | Owner |
|---|---|---|---|---|---|
| R1 | GstarCAD net48 API gaps (PaletteSet with WPF, `IdMapping` lifetime, dimension regen, docking teardown) stall M0 or push host-specific code into the Detailer. | Technical | Med / High | M0 is a bounded 5-day spike with go/no-go; capability flags in `CadHost`; renderer limited to the primitive list; a missing feature falls back on **both** hosts (Leader+MText not MLeader; lines+text not Table) so output stays identical. | Dev lead |
| R2 | Numbering lock slips in `beta_1142`; mark↔label mapping cannot be trusted. | Process | Med / High | Detail step hard-locked in UI until the lock exists; M1 persistence stubbed behind a flag; engine and tests on fixed marks; weekly check of num_2 in the lane note. | Owner + num lane |
| R3 | ETABS table format (Phase 2.5) not final; headers partly "(verify)". | Technical | High / Med | V1 reads one documented layout marked UNVERIFIED until the owner's real export is in `inputs\`; every missing column maps to `STATUS: INCOMPLETE` with an ACTION, never a guess; reader isolated with its own tests. | Dev lead / owner (export) |
| R4 | `SbcDesign` output types turn out not to carry what the adapter needs (As,req, Av/s, Pu). | Technical | Med / High | Inventory reconciliation first; adapter contract defined now (§13); if a field is missing the gate says INCOMPLETE and names it; design lane adds the field. | Dev lead + design lane |
| R5 | Silent wrong detailing (spacing, lap, cover) reaches a GFC drawing. | Safety | Low / Very high | All values from `Sbc.Codes` with clause ids; golden JSON; Calculator Excel cases reused; EXPLAIN per member; gates block on any Fail/INCOMPLETE; "NOT FOR GFC" until clean; answer-key drawings compared in M1/M4; hand-calc for three columns. | Dev lead + owner |
| R6 | Regression baselines stale again; perf noise ±15–30 % masks a real slowdown. | Process | High / Med | `det_*` baselines approved only in the merge commit with the diff in the lane note; median of three runs; +10 % gate; `compare.py --semantic`. | Release eng |
| R7 | Two hosts × two versions = four cells; licences/trials expire; test time doubles. | Time | High / Med | Only `det_*` cases on all four cells per milestone; the full suite nightly on ZWCAD 2026 and at merge on GstarCAD 2025; paid GstarCAD seat before M0 ends; scripted `/b` launches. | Owner (licences), release eng |
| R8 | Panel scope creep away from Concept 2 and the no-popup rule. | UX | Med / Med | Everything lives in the 340 px column; two modals only; reuse `InlineStrip`, chips, `SbcTheme`; UI review against wireframes each milestone. | UI lead |
| R9 | Shear-wall and L/T/C edge cases (openings, BE, two-polyline walls, mirrored blocks) consume M2/M3. | Technical | Med / Med | Polygon engine from M0 with unit tests on all shapes; walls reuse `Analysis.Supports`; anything unreadable becomes `Invalid CAD geometry`, never a crash. | Dev lead |
| R10 | Obfuscation breaks JSON model types or the GstarCAD variant. | Release | Med / Med | Exclusion attributes; ReflectHarness serialises a model after obfuscation; per-host pass added in M0. | Release eng |
| R11 | Owner time: manual sheets on two hosts per milestone plus two live projects in M4; 60-second defaults may need rework. | People | Med / Med | Sheets ≤ 20 min each; D-rows kept current; office defaults are settings, so a changed decision is an INI edit. | Owner |
| R12 | Single-developer lane pre-empted by another lane. | People | Med / Med | Lane note daily; engine fully unit-tested; milestones independently mergeable. | Dev lead |
| R13 | `Model.Load` hot spot gets worse when the Detailer reads geometry. | Technical | Med / Low | Detailer takes members from the numbering model in memory; one scan per command asserted in regression. | Dev lead |
| R14 | GstarCAD 2026+/.NET 8 demand arrives mid-V1. | Process | Low / High | D6 scope; SDK-style csproj from M0 so multi-targeting is a configuration change; ConfuserEx limitation noted. | Owner |
| R15 | IS 13920 "(verify)" values or Amendment 2 differ from what is implemented. | Code | Med / Med | Each "(verify)" value is a pending unit test; release note lists unverified items; BIS copy diff before GFC use. | Owner (BIS copies) + dev |

---

## 25. Questions that genuinely require the owner's decision

Rule: no reply within 60 seconds → the default below is used and logged in DECISIONS_TAKEN_BY_CLAUDE.md. Already answered and therefore **not** asked again: ETABS version (22), forces vs design (per-project `DesignSource`, D13), Mumbai defaults and ductile default (D14), SAFE for foundations, BBS last, GstarCAD + ZWCAD.

### (a) Blocking for M1

| # | Question | Options | Default if silent |
|---|---|---|---|
| Q-A1 | On the `EtabsDesign` path, when a column was run in ETABS *Check* mode (ratio only, no As,req): detail from the ETABS template bars, or refuse? | Accept template bars / refuse | Row goes to REVIEW with template bars shown and "designed in Check mode — confirm"; never auto-detailed. |
| Q-A2 | GstarCAD version on the test machine? | 2024 / 2025 (net48) / 2026+ (.NET 8) | 2025 net48 (D6). 2026+ is a later build. |
| Q-A3 | Office bar preferences: 12/16/20/25/32, max two dias, corners the larger, 12 mm allowed in ductile columns? Pairings 20+16, 25+20, 32+25 only? | Any list | D9 list; ≥ 16 mm in lateral-system columns; 12 in gravity columns; 28/36 not stocked; one-step pairings only. |
| Q-A4 | Cover set: columns 40 (mild/moderate), 45 (severe), 50 (very severe/marine); walls 25 internal / 30 external; cover to the tie? | Values | As stated; cover to outermost steel (tie), per IS 456. |
| Q-A5 | Hook/tie conventions: 135° everywhere, tie min 8 mm, 10 mm when main Ø ≥ 32, spacing rounded down to 25 mm, confining floor 75 mm? | Values; 90° hooks in gravity members? | All yes (D9); 75 mm floor with a warning; no 90° hooks. |
| Q-A6 | Detail placement: model space next to the plan, a layout, or a separate DWG? | Model space "SBC-DETAILS" / layout / separate DWG | Model space, fixed offset right of the plan, LAYERS.dwg layers (1071/1162 look like model-space sheets — confirm). |
| Q-A7 | One real ETABS 22 export (the ~12 tables, units kN,mm, all combos, no "selection only") and one SbcDesign run for the same model — can you send them this week? | — | Until then the parser uses App. B headers marked "(verify)" and refuses files whose headers differ; the SbcDesign adapter waits for the inventory. |

### (b) Needed before M2 / M3

| # | Question | Options | Default if silent |
|---|---|---|---|
| Q-B1 | Overstressed members (O/S, PMM > 1): block, warn, or detail with a flag? | Block / warn / detail + flag | Block; listed as "O/S — redesign". |
| Q-B2 | L/T/C/+ columns in the lateral system (IS 13920 Amd 1): auto-detail with overlapping hoops and the Amd 1 note, or refuse? | Auto + note / refuse | Auto-detail with the note, state REVIEW (never READY). Needs the SD polygon from the .e2k on the EtabsDesign path. |
| Q-B3 | Approval: one state set by any engineer, or two (checked by / approved by) with names? | One / two | One state, Windows user name and time in the Xrecord; two-step is a setting for later. |
| Q-B4 | Sheet standards: title block, text height, dimension style, which LAYERS.dwg layers for rebar/ties/text? | — | Reuse SBCSHEETS title block; text 2.5 mm at sheet scale; dim style from the drawing; `SBC-DET-*` layers created if absent. |
| Q-B5 | Lap location for gravity (non-ductile) columns, crank vs dowel at size change, kicker height. | Above floor / central half; crank 1:6 / dowel; 75/100/150 | Central half (uniform with ductile); crank 1:6 up to 75 mm offset else dowel; never crank in ductile l0; kicker 150. |
| Q-B6 | BE length when the source gives only the flag; lap fraction in BE bars (1/3 wall vs 1/2 column). | Rule choice | lbe = max(0.15 lw, 2 tw, 450) rounded up to the spacing module; 1/3 (stricter). |
| Q-B7 | Walls: two curtains always for tw ≥ 200? single curtain allowed at 150–180? opening threshold? | Values | Two curtains ≥ 200; single allowed below with a warning; openings < 300 mm ignored. |
| Q-B8 | Corner-bar lap factor 1.4 (IS 456 26.2.5.1(c)): apply, or office table only? | Apply / table | Office table, visible setting; 1.4 forced if the design reports net tension in that bar. |
| Q-B9 | Clear height hc when beams of different depth frame in: shallowest soffit (one l0) or l0 from each beam face? | One / each | Shallowest soffit (larger hc, conservative l0), with the deeper beam's face noted. |
| Q-B10 | Shear-wall end bars where no BE: enforce 4-T12 in two layers (SP 34 practice)? | Yes / no | Yes. |

### (c) Later

| # | Question | Options | Default if silent |
|---|---|---|---|
| Q-C1 | AutoCAD / pCAD continued support for the Detailer output? | Yes / later / drop | Not tested in V1; renderer uses only the primitive surface so it should work; no promise. |
| Q-C2 | Test machines: one machine with both hosts, or two? ETABS seat on the detailing machine? | — | One machine, both hosts, owner tests; no ETABS on the detailing seat (table file only). |
| Q-C3 | Joint hoops: continue confining spacing through all joints, or the 150 mm relaxation when four beams confine? | — | Continue through joints (simple, conservative). |
| Q-C4 | Steel grade note and bar-mark prefix ("T", "Y", "#"). | — | Fe500D, prefix "T". |
| Q-C5 | IS 13920 Amendment 2 (2021): can you supply the BIS copy for a diff before release? | — | Release note "Amd 2 not reviewed" until supplied. |
| Q-C6 | Live ETABS API path (V1.5)? | — | Not before M3. |
| Q-C7 | Bundled bars (needed only above ~4 %): permitted? | Yes / no | No; warn > 4 % and propose a larger section. |

---

## STATUS TABLE

### ALREADY EXISTS (Appendix A)
- `Guard.cs` command guard, crash.log, `[SBC-TIME]` perf lines.
- `Commands.cs` registry (41 entry points), `SBT*` test-build twins.
- `Model.Load` model-space reader; `INSUNITS` units check.
- `StructuralBlocks.cs` block reader with `SBC_BLK` cache.
- `Numbering.cs` / `Analysis.cs` marks (C/SW/LW/RW/B/BC/S), wall-from-two-polylines, aspect-ratio and lift-wall rules.
- ProjectPanel storeys/plans; SchedulePanel Members grid.
- `CadAliases.cs` / `CadCompat.cs` / `CadPcad.cs` compat layer; per-CAD obfuscated builds.
- ui_a Concept 2 panel: `SbcUiHost.cs`, `InlineStrip.cs`, `SbcTheme.cs`, `Workspace.cs`, 6-button ribbon.
- `Lanes\SbcEtabs` (.e2k export `SBCETABS`, `EtabsTables.cs`, `EtabsResults.cs`, `LabelMap.cs`); MASTER_PLAN §16 Phase 2.5 import plan.
- `ColumnDesign`, wall design, `BeamDesign`, `Detailing\Laps.cs` (office lap table).
- `SbcCalc\Engine\Is456.cs`, `Bars.cs` lap table, `SbcCalc.Check` 144 Excel cases.
- `Details`, `Diagrams`, `Section`, `3D`, `Bbs`, `Report` modules (contents not seen).
- `LAYERS.dwg`, Table Plugin 3.3, `Sheets.Run`, HOLD items, QA RED/AMBER, Waive modal, "NOT FOR GFC".
- Regression harness (`run_regression.ps1`, `compare.py`, `checks_ext.py`, `perf_*`), `handcalc\`, ReflectHarness, Net8Smoke, `buildcheck.ps1`.
- Office answer-key drawings 1071/1153 (link details), 1162 (column schedule); brand kit.
- Owner-decided settings: Mumbai Zone III defaults, ETABS 22, per-project forces/design.

### CAN BE REUSED (as is or by port)
- `Guard`, `Commands` pattern, `SBT` twins, `result.json` / `perf.log` conventions.
- `Numbering`/`Analysis` readers and rules; `StructuralBlocks` provenance; `Model.Load` entity set; units check.
- ProjectPanel storey list; Members grid; inline strips, chips, theme tokens; Waive modal; HOLD layer; "NOT FOR GFC" integration.
- `CadAliases` pattern (extended); `build_release.ps1` per-CAD loop; ConfuserEx pipeline; installer.
- Phase 2.5 table reader and `LabelMap` (contents unverified).
- `ColumnDesign` / wall design outputs as the `SbcDesign` source (via adapter).
- `Is456.cs` (ported into `Sbc.Codes`), the calculator's confinement spacing and Ash functions (moved to `Is13920.cs`), office lap table, 144 Excel cases (re-run for ported functions), `excel_cases.ps1`.
- `LAYERS.dwg` layers and text/dim styles.
- Regression harness, DXF fixtures pattern (`make_*.py` / `check_*.py`), `handcalc\` for three test columns, ReflectHarness, `buildcheck.ps1`.
- `SBCREPORT` HTML style for the detail report; `SbcCalc\UI\CadLink.cs` as the file exchange (assumed).
- Possibly drawing helpers in `Details` / `Diagrams` / `Section` (assumed — verify in inventory).

### NEEDS MODIFICATION
- `Commands.cs` (+ `SBCDETAIL*` / `SBTDETAIL*`); `Guard.cs` (typed outcomes).
- `Model.Load` (cached snapshot — assumed); `Numbering.cs` / `Analysis.cs` (`MembersOf()`, marks-changed event); `StructuralBlocks.cs` (source-handle map).
- `ProjectPanel.cs` / storey schema (levels, `EtabsStoryName`, `DesignSource`, `Ductile`) — assumed schema.
- `ColumnDesign` / wall design output exposure for the `SbcDesign` adapter; `EtabsTables.cs` / `LabelMap.cs` (normaliser, units row, map exposure).
- `Detailing\Laps.cs` (move to `Sbc.Codes`), `BeamDesign.cs` constants (call `Sbc.Codes`).
- `CadAliases.cs` / `CadCompat.cs` (GstarCAD set, `ICadHost`); `SbcStructural.csproj` (SDK-style, configurations); `build_release.ps1` (GstarCAD probes, obfuscation per host); installer registry keys; CUIX.
- Workflow tab (Detail step), Members grid (columns), status bar item; `SBCSET` `[Detailer]` section.
- `LAYERS.dwg` (`SBC-DET-*`, `SBC-HOLD`).
- Regression: `run_regression.ps1` (cases, `-Host`), `compare.py` (`detail` key, `--semantic`), `checks_ext.py`, `perf_baseline.json`; ReflectHarness (dependency scan, obfuscation serialisation check); `Build\SbcStructural.crproj`.

### NEEDS TO BE CREATED
- `Sbc.Codes` project: `Is456.cs` (port), `Is13920.cs`, `CodeValues`, `Clause`, `RuleResult<T>`, `IColumnRules`, `IWallRules`, `IRuleSet`, two rule sets, `OfficeSettings` JSON, `CodeValueCatalogue`; `Sbc.Codes.Tests`.
- `Detailer.Contracts` (all of §13 incl. `DesignSource`, `IDesignSource`).
- `Detailer.Import`: `EtabsDesignSource`, `SbcDesignSource`, `ITableSource`, `ExcelTableSource`, `CsvTableSource`, normaliser, units parser, mappers, `DesignSet`.
- `Detailer.CadRead`: `CadMemberReader`, `PolygonExtractor`, `StoreyBandResolver`, `OpeningFinder`, `MemberProvenance`.
- `Detailer.Matching`: label/geometry/storey matchers, `MatchTable`, tolerances, report, persistence, stacks.
- `Detailer.Engine`: classifier, polygon offset, bar selector, edge distributor, lateral-support solver, hoop decomposer, zone layout, wall arranger, BE arranger, `DetailBuilder`, `Explain`.
- `Detailer.Validation`: gates G0–G8, `ValidationReport`.
- `Detailer.Render`: primitive renderer, layer/text/dim maps, section/elevation/wall/schedule drawers, block writer, placer.
- `Detailer.Persistence`: `SBC_DETAILER` NOD, block Xrecords, codec; sidecar `<dwg>.sbcdetail.json`, `detail_report.txt`, HTML report.
- `Detailer.Ui`: Detail step, source strip, progress list, attention list, member list, match/detail card, EXPLAIN drawer, settings page.
- `Detailer.Commands`: `DetailWorkflow`, `DetailBatchJob`.
- `Detailer.Tests` (xUnit, golden JSON); regression cases `det_*` with fixtures, per-host baselines, DXF normaliser/comparator, `check_det_*.py`, `settings_det.ini`.
- `Docs\notes\lane_det_0.md`, `Docs\HOW TO TEST - DETAILER M1.md`, user-guide chapter, release note.
- Partial CUIX for the Detail button; `GSTARCAD-net48` build configuration.

### NEEDS MY DECISION (owner)
- §25(a): Q-A1 Check-mode columns; Q-A2 GstarCAD version; Q-A3 bar preferences; Q-A4 cover set; Q-A5 hook/tie conventions; Q-A6 detail placement; Q-A7 send one ETABS export + one SbcDesign run.
- §25(b): Q-B1 O/S policy; Q-B2 L/T/C auto-detail; Q-B3 approval states; Q-B4 sheet standards; Q-B5 gravity lap/crank/kicker; Q-B6 BE length and BE lap fraction; Q-B7 curtains and opening threshold; Q-B8 corner lap factor; Q-B9 hc with unequal beams; Q-B10 wall end bars.
- §25(c): Q-C1 AutoCAD/pCAD; Q-C2 test machines; Q-C3 joint hoops; Q-C4 grade/prefix; Q-C5 Amd 2 copy; Q-C6 live API; Q-C7 bundles.
- Review of D1–D14 in DECISIONS_TAKEN_BY_CLAUDE.md (any row can be reversed with the stated phrase).

---

## Milestones M0–M4

| M | Scope | Exit criteria | Days | Depends on |
|---|---|---|---|---|
| **M0 Spike** | `SbcStructural` compiles under `GSTARCAD-net48` with the `Gssoft.Gscad` alias set; NETLOAD on GstarCAD 2025 and ZWCAD 2026; `SBTDETAIL` stub reads one closed column polygon (vertices, centroid, bbox) and inserts one block with two attributes and one aligned dimension on both hosts; PaletteSet shows the Concept 2 panel on GstarCAD. `Sbc.Codes` project created and `Is456.cs` ported; `Is13920.cs` seeded with App. C A1–A6; typed records (§13) defined; `ITableSource` with Excel source. | Same `result.json` semantic content on both hosts for `det_col1.dxf`; alias deltas listed in the lane note; go/no-go on GstarCAD API gaps written as D-rows. | 5 | GstarCAD 2024/2025 licence or trial; `beta_1142` buildable in a worktree; NuGet `GstarCADNET 25.1.0`. Owner evening: send the ETABS export and the SbcDesign run (Q-A7); confirm Q-A2. |
| **M1 One rectangular column** | Week 2 import + match (parse the ~12 tables with frozen headers, units row, per-station aggregation; `SbcDesignSource` adapter on the inventory's types; matcher with D7 tolerances; Members grid "Detail" column). Week 3 arrangement engine (polygon API, corner/edge bars, tie path, cross-tie solver, dia/count selection, zone layout, validation with clauses; hand-calc for three columns; console harness). Week 4 renderer + `SBCDETAIL` command (section per zone, elevation, schedule row; placement per Q-A6). Week 5 both hosts and hardening (entity-diff script, 50-run exception soak with bad inputs: missing table, wrong units, mismatched section, Check-mode row, O/S row; regression and BBS byte-check green). Week 6 buffer / sign-off. Cases `det_col1`, `det_col_fail`, `det_col_conflict`, `det_col_sbcdesign`. | Pick → match → Detail → zoom works on both hosts; detail < 10 s wall-clock, < 2 s in the engine; entity-for-entity identical on ZWCAD and GstarCAD 2025 (script-checked, 0.1 mm); zero unhandled exceptions in 50 runs; matches drawing 1071/1162 style (owner judgement, cosmetic remarks only); every number traceable to a clause; hand-calc agreement; no regression beyond the 10 % gate; BBS byte-identical; unit tests ≥ 40; owner signs the sheet with ≤ 3 open items, none blocking. | 12 | M0; numbering lock on `beta_1142` (else live persistence stubbed and M1 ends "engine-complete, persistence pending"); ETABS table format agreed or App. B layout used and marked UNVERIFIED; inventory for the SbcDesign types. Budget guard: if week 3 slips > 3 days, M1 drops the elevation and ships section + schedule row only; the elevation moves to M2. |
| **M2 All columns + L/T/C** | `Detail all`, batch driver, attention list, COMPLETED WITH WARNINGS flow, Members-grid column, re-detail/remove with the two modals, L/T/C polygon hoop layouts with the Amd 1 note, stacks with crank/dowel, non-ductile branch (`RuleSet_IS456_Only`), settings page, `SBCDETAILREPORT`, `SBCDETAILUPDATE`. | `det_cols_all`, `det_stack`, `det_col_L/T/C` green on four cells; 42-column run within budget; report opens; Stop-after-current works; idempotence passes. | 12 | M1; office defaults confirmed (D9) or kept as assumed. |
| **M3 Shear walls** | Wall geometry (two-polyline walls, openings, BE), pier records from both sources, pier labels from the mark→label map, `SBCDETAIL` for walls, wall elevation + section renderer, "W12 Boundary data missing" path, junctions, lift walls. | `det_wall1`, `det_wall_opening` green on four cells; owner sheet M3 signed; LW detailed or listed as INCOMPLETE with ACTION. | 10 | M2; pier label export in SBCETABS (Phase 2.5); SW/LW numbering stable. |
| **M4 Complete system** | `realworld` and one live office project through the full flow; sheets integration (details placed on the layout the Sheets step owns); status-bar item; light-theme pass; per-host golden DXFs; installer with GstarCAD variants; user-guide chapter; backlog of BBS findings handed over (not implemented). | `realworld` + all `det_*` green; two owner projects detailed with zero FAILED and attention list understood; beta installer in `3 BETA\`; HOW TO TEST sheet complete; perf table in `BUDGET_LOG.md`. | 10 | M3; Sheets step API from ui_a Phase B/C; owner time for two project runs. |

Total ≈ 49 working days of one developer lane plus about one owner evening per milestone (two for M1). Lanes `det_0` (M0–M1), `det_1` (M2), `det_2` (M3–M4), each from a freshly merged base.

---

## Source of truth table

| Information | Source of truth | Never taken from | Rule on conflict |
|---|---|---|---|
| Member existence, mark, storey | CAD numbering (locked) | ETABS labels | ETABS label is a hint; CAD mark wins; unmapped → MATCH FAILED |
| Actual section geometry (polygon, B × D, orientation) | CAD drawing | ETABS / design section | > 5 % or shape differs → DATA CONFLICT; ≤ 5 % → warning, CAD size used |
| Storey levels, clear height, beam depths | CAD (ProjectPanel + beam layer) | ETABS story table alone | ETABS story used to map names; height mismatch > 50 mm → warning |
| Wall openings (plan) | CAD | ETABS | Heights unknown → INCOMPLETE until entered |
| Required reinforcement: As,req, Av/s, ρv/ρh | Selected `DesignSource` (**SbcDesign** = plugin/calculator design from ETABS forces, the usual case; **EtabsDesign** = ETABS design tables) | CAD; the other design source | The project setting names ONE source; the other, if present, is a check value in remarks only; both sources for one member are never merged |
| Boundary-element required flag, BE length | Selected `DesignSource`; else Detailer stress check from Pu/Mu | CAD | Flag missing and no Pu/Mu → INCOMPLETE |
| Ductile / Special flag | Project setting (default ON, Mumbai Zone III) | ETABS alone | ETABS flag shown as a check; mismatch → WARNING |
| Overstress / O/S | Selected `DesignSource` | — | Blocks that member |
| Bar count, dia, arrangement, ties, legs, Ash, l0, laps, hooks, cover, curtains, trimmers, junctions | Detailer engine (`Sbc.Codes` rules + office settings) | ETABS template bars (except Check-mode REVIEW) | Every value shows its clause; Fail blocks the member |
| Code constants and clause numbers | `Sbc.Codes` (`CodeValues`), seeded from `SbcCalc\Engine\Is456.cs` and Appendix C | Inline constants in plugin or Detailer | "(verify)" values are pending tests; BIS copy wins |
| Office conventions (bars, cover, hooks, lap table, module) | `OfficeSettings` JSON (owner-confirmed, D9) | Code defaults | Printed in the notes block; drawings "NOT FOR GFC" until confirmed |
| Match table, detail state, approvals | Xrecords in the DWG (`SBC_DETAILER` NOD, block extension dictionaries) | Sidecar JSON alone | Sidecar is QA/recovery only |
| Design revision identity | Provenance block (source, file/run, date, sha256) | File name alone | Hash change → re-validate every match; drop never silent |
| Drawing format | Office answer-key drawings 1071/1153/1162 | Generic templates | Owner judgement at M1/M4 |
| CAD API surface | `CadAliases` + primitive whitelist (App. D §4) | Host-specific namespaces, Table/MLeader/Fields | Missing on one host → fallback on both |
| BBS | Untouched (owner hard rule) | — | Findings go to the backlog |
| Decisions | OWNER_DECISIONS.md, then DECISIONS_TAKEN_BY_CLAUDE.md (D1–D14), then this plan | Panel sections | Owner row always wins |

---

## Appendices

- **Appendix A** — `APPENDIX_A_plugin_session_audit.md`: facts about the existing plugin, lanes, harness, calculator relation and gaps (basis of §1–6). To be reconciled with `Docs\notes\detailer_inventory.md` → V1.1.
- **Appendix B** — `APPENDIX_B_etabs_research.md`: ETABS channels, table names and headers (with "(verify)" marks), what ETABS gives vs does not, member identity pitfalls, recommended contract (basis of §11, §12, §13).
- **Appendix C** — `APPENDIX_C_is_code_rules.md`: IS 456 / IS 13920 rule catalogue for columns (A1–A6) and walls (B0–B6), geometry-driven arrangement algorithm (§C), drawing content standard (§D), code-rule module design (§E), owner engineering questions (§F), "verify against BIS copy" list (§G) (basis of §14, §15, §16, §17, §20).
- **Appendix D** — `APPENDIX_D_cad_platform_research.md`: GstarCAD and ZWCAD .NET APIs, compatibility matrix, one-code-base strategy, dual-host testing, risks (basis of §9, §16, §21, §24).
- **OWNER_DECISIONS.md** — binding owner decisions (GstarCAD + ZWCAD, WHAT/WHERE principle, one column first, ETABS 22 and Phase 2.5, SAFE, BBS last, numbering lock, forces vs design per project, Mumbai Zone III).
- **DECISIONS_TAKEN_BY_CLAUDE.md** — D1–D14 (review list; each row reversible with the stated phrase).
