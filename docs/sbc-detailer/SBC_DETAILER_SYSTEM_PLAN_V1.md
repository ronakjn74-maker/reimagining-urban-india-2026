# SBC DETAILER — SYSTEM PLAN V1

Date: 2026-10-06. Status: V1 for owner review (reviewed and corrected 2026-10-07). Audience: the owner (structural engineer) and the developer agents.

**Review record (2026-10-07).** Five reviewers (structural, CAD, ETABS, architect, owner's advocate) read V1 without editing it. Applied in this issue: **12 blockers** (every one), **59 majors** (every one), and 46 of the 48 minors; the two minors applied only in part, plus the residue of the others, are listed under "Review backlog" at the end. New defaults adopted while applying the review are logged as D15–D35 in DECISIONS_TAKEN_BY_CLAUDE.md. A "Words used" glossary is at the end of the document.

> **The one principle.** ETABS / SBC Calculator says **WHAT** reinforcement is required. CAD says **WHERE** it goes and in **WHAT actual geometry**. The Detailer **combines** both. It never guesses one side from the other and never silently picks one side when they disagree — it stops, names the conflict, and waits.

**How to read this document.** Sections 0–25 follow the owner's master prompt numbering. Facts about the existing code (sections 1–6) come only from Appendix A (the plugin-session audit) and Appendix E (the plugin session's own `detailer_inventory.md`, received 2026-10-06 — V1.1). Most rows marked **(assumed — verify in inventory)** are now resolved against Appendix E; where a phrase below still carries that mark, check Appendix E §1–§11 first — it is usually already answered there and the mark is leftover text.

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

**What is new.** (1) An import layer that reads ETABS tables (and SbcDesign output) into one tidy record per column that also says where every number came from. (2) One shared rulebook (IS 456 ported from the Calculator + new IS 13920), the library `Sbc.Codes` — the only place code numbers live (D4), used by plugin and Calculator. (3) A polygon-based bar-arrangement engine (corner bars, edge bars, tie path, cross-tie solver, zones along height). (4) A renderer that draws with only basic CAD lines, arcs, text and dimensions (D5) so the output means the same on both hosts. (5) A match table and a review state per member with the four status words above. (6) One new "Detail" step in the existing panel.

**What you are approving by saying "go".** (1) Detailer is a module inside the existing plugin, not a separate app (D2). (2) Code rules move into one shared library used by plugin and Calculator (D4). (3) Drawings use only basic CAD entities so ZWCAD and GstarCAD output is equivalent (D5); no Table entity / MLeader. (4) GstarCAD 2026 (.NET 8, the owner's actual test machine) using the plugin's existing GCAD build target, reusing the GCAD alias set already in CadAliases.cs (D6, corrected per Appendix F). (5) ETABS via exported tables, never the live API (D3). (6) A project "seismic design category" (D24) decides ductile vs non-ductile detailing from the zone; Mumbai = Zone III = ductile, not switchable. (7) The M1 scope, the ≈ 62-working-day budget and the owner-time budget below. (8) The office defaults in D9, which stay "NOT FOR GFC" until you confirm them (§25 Q-A3). (9) Missing design data is never replaced by a code minimum or a default; the member stops as INCOMPLETE (D27). Anything else in this document is implementation detail you may skip.

**First milestone (M1).** One rectangular ductile column, end to end: pick it in CAD → matched to its design record → bars and ties chosen → section + elevation + schedule row inserted → validated → equivalent on ZWCAD 2026 and GstarCAD 2026 (GCAD target). Nothing else until this is clean (owner decision 2026-10-05).

**Scope fence for V1.** No BBS (owner hard rule — bar marks as drawing text only). No beams, slabs, foundations (SAFE), coupling beams, retaining walls. No live ETABS API (table export only, D3). No AutoCAD/pCAD testing in V1 (those targets exist but are paused by the owner). No placing of details on layouts/sheets (model space only, §16.4). Ductile (IS 13920) detailing is selected by the project seismic design category (D24): Zones III–V → ductile, locked; Zone II → non-ductile permitted (IS 13920:2016 cl. 1.1.1, IS 1893-1:2016 cl. 6.4 **(verify)**).

**Schedule.** M0 spike 5 days → M1 one column 25 days (weeks 2–6, including one buffer week) → M2 all columns + L/T/C 12 days → M3 shear walls 10 days → M4 complete system 10 days. **About 62 working days** of one developer lane (D23). The earlier "49 days" counted M1 as 12 days while describing five weeks of work; 62 is the honest figure, and no scope was cut to reach it.

**Your time.** About 8–10 evenings in total: M0 one (send export, confirm version), M1 two (one per host), M2 one, M3 two (one per host), M4 two to three (two live projects). Each test sheet is ≤ 20 minutes per host.

**The asks (owner, five minutes each).** (a) One real ETABS 22 export (the fixed table set in §25 Q-A7, incl. the force tables and `Program Control`) from a live model so headers can be frozen, plus one SbcDesign run for the same model. (b) GstarCAD version on the test machine — ANSWERED: GstarCAD 2026, net8 GCAD target (Appendix F). (c) Confirm or amend the office defaults in D9 — one row, §25 Q-A3. (d) Two evenings for testing M1 on both hosts. (e) Answers to the blocking questions in §25(a) — or silence, in which case the listed 60-second defaults apply and are logged in DECISIONS_TAKEN_BY_CLAUDE.md. (f) **Budget.** No new GstarCAD seat needed — GstarCAD 2026 is already installed and already has a working GCAD build target (Appendix F). The GstarCAD .NET package, OpenXML SDK and xUnit are free. ETABS is not needed on the detailing machine. (g) Confirm details go in model space next to the plan, as in your drawings 1071/1162 (a layout or a separate DWG is possible later).

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

**Resolved by Appendix E (V1.1).** XData app `SBC_STRUCT` (key=value strings; keys `kind`, `mark`, `tag`, `for`, `tp`, `pair`, `podium`); NOD entries `SBC_PROJECT`, `SBC_RESULTS`, `SBC_BARMARKS`, `SBC_QA_WAIVERS`, `SBC_GFC_HOLD`, `SBC_UI`; storey/plan schema (`Project`, `Plan`, `Storey` records, `Stacks.Build`); section polygons for L/T/C via `ColumnShapes.cs` (`ShapeSection`, `ShapeLegs.Decompose`, generators `Rect/L/T/C/Z/Plus/Stepped/Box`); the ETABS lane in full (`EtabsTableReader`, `EtabsResults`, `LabelMatcher`, `E2kWriter`, SBCETABS export — App. E §5); column/wall design output types (`ColumnResult`, `ShapeColumnResult`, `WallResult`, `ShearWallResult`, `BoundaryElement` — App. E §6); existing column/wall drawing (`Details.Column/Wall`, `LinkDetailSketch`, `ColumnElevation*`, `ShearWallDetail.cs` — App. E §7); the Workflow-tab API (`UiStep`/`UiAction`, `Upstream` dependency map — App. E §8); `CmdGuard.Run(name, body)` / `CmdGuard.Safe` (App. E §8); the Details/Section/3D command names (App. E §8 lists the full `Commands.cs` set, so §21's collision check runs against that list directly); how `Numbering` joins wall pieces (plan-local `RunOne`, `Stacks.Harmonize` across plans — no cross-piece join is done today, confirming §10's wall-opening detection is new, not reused); and `Circle` entities ARE read as columns (equal-area square, `Details.ColumnShape` for circular design — corrects the earlier guess in the `PolygonExtractor` note below). Text/dimension standard: `OfficeStd`/`Standard.cs` (text styles `ARIAL`/`TIMES NEW ROMAN`, dim styles `SBC-100`/`SBC 25`) imported from LAYERS.dwg. **Still not revealed even by Appendix E:** whether units-m drawings are converted before Detailer sees them (App. E does not describe a conversion step; treat `units_m` as **(assumed — verify in M0)**, not resolved); the exact SBT-vs-SBC twin behaviour beyond "SBT builds use the SBT/HCK prefix" (App. E §1).

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
| Commands | `SBCNUMBER`, `SBCPANEL`, `SBCDESIGN`, `SBCSHEETS`, `SBCREPORT`, `SBCSET`, `SBCETABS` (1.14.2), `SBCWORKSPACE`; planned `SBCHEALTH`, `SBCREPORTBUG`, `EXPLAIN`. Test twins `SBT*`. Other groups: Details, Section, 3D, Issue GFC, QA waive, Clear marks, Renumber. | New Detailer commands follow the same pattern; names are **provisional** until the collision check in §21 (fallback family `SBCRD*`). |
| Outputs | Marked plans; schedules via Table Plugin 3.3 (`TPIMPORT` from a text file; known comma-value crash); sheets/layouts (`Sheets.Run`, O(n²) text overlap); GFC issue; HOLD items (planned `SBC-HOLD` layer, tags "HOLD-07"); "DRAFTING CLEANUP LIST"; BBS (rebuilt by 4 commands); 3D; design report PDF. | Detailer V1 draws into model space with its own blocks; sheets later (§16). |
| Persistence | **Resolved (App. E §4):** XData app `SBC_STRUCT` on each member; NOD entries `SBC_PROJECT`, `SBC_RESULTS` (one Xrecord per record, JSON chunked ≤1000 chars), `SBC_BARMARKS`, `SBC_QA_WAIVERS`, `SBC_GFC_HOLD`, `SBC_UI`; `%APPDATA%\SbcStructural\settings.ini`/`ui.ini`; `%LOCALAPPDATA%\SbcStructural\crash.log`. | Detailer uses its own namespaced NOD entry `SBC_DETAILER` (§9), matching the existing one-Xrecord-per-record pattern used by `SBC_RESULTS`, not a new mechanism. |

---

## 3. Existing ETABS functionality

Source: Appendix A §3. Only file names and git state are revealed.

- `Lanes\SbcEtabs\E2kTemplate.cs`, `E2kWriter.cs`, `Templates\etabs_UNVERIFIED.e2k` — SBC → .e2k export (model written to ETABS text format). Shipped as the 1.14.2 `SBCETABS` command from branch `l3_etabs_export`.
- `Lanes\SbcEtabs\EtabsResults.cs`, `EtabsTables.cs`, `LabelMap.cs` — **resolved (App. E §5).** `EtabsTableReader.ReadFile` reads CSV / ETABS key=value text / XLSX into normalised `EtabsTable`s. `EtabsResults.Add` currently reads Element Forces (Beams/Columns), Pier Forces, Story Drifts, Story Forces, Joint Reactions, Modal Participating Mass Ratios — **no concrete-design table is read today**, confirming the EtabsDesign path (§11.3b) is genuinely new code, while the SbcDesign path's force import (§11.3a) can reuse `EtabsTableReader`/`EtabsResults` directly instead of writing a new CSV reader. Mark↔label mapping is `LabelMatcher` (order: GUID → Unique Name → Label+Story → geometry within tolerance → unmatched), which §12's matcher should call rather than reimplement (D39e).
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

**Reinforcement result structure — resolved (App. E §6), the single most important inventory item for the `SbcDesign` source.** Rectangular/circular: `ColumnResult` (N, Dia, mixed N2/Dia2, Ldia, Lspc, **Lo/Lsc** — the IS 13920 confining length/spacing — Ash*, Helical, BarsText, LinkText) with `ColumnDesign.Layout` for bar positions and `LapZones`/`LapLinkSpacing`/`ConfiningSpacing` already implemented. Irregular: `ShapeColumnResult` with a full `ShapeLayout` (`ShapeBar{X,Y,Dia,Zone,Leg,Mid}`, `ShapeLink{Kind: MASTER RING|CLOSED LINK|END BOX|JUNCTION BOX|OPEN LINK|CROSS TIE, Path, HookExt, CutLength}`) built by `ShapeLayout.Make`. Walls: `WallResult` (simple) and `ShearWallResult` (leg-designed: Legs, Zones incl. BE-END/BE-JUNCTION/WEB, **Boundaries**: `BoundaryElement{Length, Rows, Bars, DiaOuter/Inner, HoopDia/Spc, Ash*, OfficeType}`). **This means the arrangement engine in §8/§9/App. C §C does not need to be built from a bare polygon for the SbcDesign path — it should call the existing `ColumnDesign`/`ShapeColumn`/`ShearWallDesign` methods and consume their typed results, reserving the new polygon-arrangement code (App. C §C, this plan's Engine namespace) for the EtabsDesign path, where no such typed result exists upstream (D39c).**

**SBC Calculator (`SbcCalc`).** Ported from SbcStructural, independently audited. `Engine\Is456.cs` (single τc table, τc,max, KLim/xu,max incl. fy > 500, Fig 4 MF, Ld, laps), `ColumnCalc.cs` (port of office `ColumnDesign1.xls` VBA, NOT the plugin's ColumnDesign), `ColumnExtra.cs`, `BeamCalc.cs`, `RetainingWallCalc.cs`, `WallDiagrams.cs`, `OneWaySlabCalc.cs`, `SlabExtra.cs`, `Bars.cs` (`Laps.OfficeTable`), `Charts.cs`; `UI\{ReportHtml, Theme, TablePlugin, CadLink, Validation}.cs`; `SbcCalc.Check` with 144 Excel cases (~3100 values). Rule (memory `shared-code-plugin-calculator.md`): **port, never edit the other's files**; exchange paths only.

**Regression.** 22+ cases with JSON baselines (currently stale: 1.14.2 baselines still 1.14.1), `handcalc\` ~830 checks, ReflectHarness, Net8Smoke, `checks_ext` WARN/FAIL.

---

## 5. Existing detailing functionality

Source: Appendix A §5. Not described in the transcript beyond:

- Module names `Details`, `Diagrams`, `Section`, `3D`, `Bbs`. **Resolved (App. E §7):** `Details.Column(el)`/`Details.Wall(el)` return a `Sketch` (bars + links); `LinkDetailSketch.Column/Wall`, `ColumnElevation(Draw)`, `ShearWallDetail.cs` (`LinkDetail.FromWall/FromColumn`), `SectionCut`/`SectionDraw`/`BuildingSection*`. Everything draws through the CAD-free `Sketch` type (Line/Path/Box/Dot/Donut/Text/DimH/DimV/Leader), drawn with `Sketch.Draw(db,tr,origin,tag)`. **The renderer should build `Sketch` objects and reuse `Sketch.Draw`, not invent a parallel primitive-entity writer** — this is a direct, large reuse opportunity the original plan did not know about (D39d).
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
| Regression harness, ReflectHarness, `buildcheck.ps1` | Cases, perf gate, dependency scan. | New `det_*` cases, DXF comparator (§21). |
| Table Plugin 3.3 (`TPIMPORT`, `SbcCalc\UI\TablePlugin.cs` writer) | Detailer schedule rows written in the Table Plugin text format and imported exactly as the existing schedules. | M0 verifies `TPIMPORT` on GstarCAD 2026 (GCAD target); lines + text is the fallback only if that check fails (D32). |
| `SBCSET` INI settings | `[Detailer]` section. | — |
| QA RED/AMBER, HOLD items, Waive modal, "NOT FOR GFC" | Status integration. | — |
| `SbcCalc.Check` pattern, `excel_cases.ps1` | Off-host test harness style. | Reused as pattern; 144 cases re-run for ported functions. |
| `Details`, `Diagrams`, `Section`, `Sketch` | Confirmed drawing helpers (App. E §7): `Details.Column/Wall` → `Sketch`; `Sketch.Draw` writes to the drawing; `ColumnElevation*`, `ShearWallDetail.cs`, `SectionCut/Draw`. | **Reuse directly** — the renderer (§16) targets `Sketch`, not raw entity creation (D39d). |

Not reused in V1: `Bbs` (owner hard rule), `Sheets.Run` (V1 draws in model space; layouts are V1.5), `BeamDesign.cs` (not touched by the Detailer lane).

---

## 7. Modules that need modification

Existing files only. New code is in §8.

| File (`SbcStructural\`) | Change | Why |
|---|---|---|
| `Commands.cs` | Add the Detailer entry points (§21; names provisional, collision check against `Commands.cs` and `Docs\SBC_Command_Reference.md` §1 before registration, fallback family `SBCRD*` — D26) and their `SBT*` twins, each wrapped in `Guard`. No command takes inline arguments (prompts / keywords / pick set only). No logic in Commands.cs. | All host entry points in one file (App. D §4); test-build `SBT` convention (App. A §1); a duplicate `[CommandMethod]` name throws at NETLOAD or shadows the existing command. |
| `Guard.cs` (entry point **confirmed, App. E §8:** `CmdGuard.Run(name, body)` — e.g. `public void DesignCmd() => CmdGuard.Run("DESIGN", DesignCmdBody);` — and `CmdGuard.Safe(what, Action)` for event handlers) | Extend the result so a command can end with a typed outcome (`Completed / CompletedWithWarnings / Blocked / Failed`) instead of only the "FAILED – unexpected error" path; `CmdTime`/`SBC_CMDTIME=1` already exists for the perf line, reused as-is. | MATCH FAILED / DATA CONFLICT / INCOMPLETE are *normal* outcomes, not crashes; the >10 % perf gate applies to new commands. |
| `Model.Load` (**confirmed, App. E §2:** `Model.Load(db,tr)` returns every `Element{Kind,Id,PartnerId,Plan,Data,Poly,Rect,BeamGeom,Mark,Anchor,Sunk,Drop,AreaM2}` in model space; `Model.Build` constructs one) | Expose a read-only cached `CadModelSnapshot` built from one `Model.Load` call per run (members per storey, with `Element.Poly`, `Element.Mark`, `Element.Plan`), not a second scan. | Full scan is the known hot spot (App. E §9); Detailer must not add a second scan — it reads the same `Element` list numbering already loaded. |
| `Numbering.cs` / `Analysis.cs` | Public stable query `MembersOf(storey, kind)` → mark, kind, outline handles, storey id. "Marks changed" diff event (already planned in Phase 2). | Detailer keys everything on marks; it must be told when marks move (§12). |
| `StructuralBlocks.cs` | Expose the SBC_BLK copy → source INSERT handle map. | Provenance in MATCH FAILED reports ("source: block XYZ"). |
| `ProjectPanel.cs` / storey schema (**assumed**) | Storey carries top/bottom level (mm), slab thickness, optional `EtabsStoryName`; import of the ETABS story list to pre-fill names. **Project setting `DesignSource = SbcDesign | EtabsDesign`** (D13) and **`SeismicCategory`** (seismic zone II/III/IV/V → rule set, D24; replaces the free `Ductile` toggle of D14). Per-member `Exposure` attribute in the Members grid (D28). | Storey mapping is the first matching key; design source selects the adapter; the zone selects the rule set. |
| `ColumnDesign` / wall design (output types **assumed**) | Wrap outputs in the Detailer `DesignRecord` contract via `Detailer.Adapters.SbcDesignSourceAdapter`; must expose As,req (or chosen n×Ø), Av/s major/minor **and** Vu2/Vu3 per (combo, station), the governing combo names, ductile flag, section, fck, fy; walls: BE required flag + length. | The `SbcDesign` path (D13) is the office's usual case. |
| `Lanes\SbcEtabs\EtabsTables.cs`, `LabelMap.cs` (**assumed**) | Expose the mark→label map (and the Unique Name / GUID write-back) to Matching; expose the table rows and the Phase 2.5 import record (forces file sha256, export date). Wrapped by `Detailer.Adapters.EtabsTablesAdapter`; not edited from the Detailer lane. | §11.2 decision rule. |
| `Detailing\Laps.cs` | Office lap table moves to `Sbc.Codes.OfficeSettings`; forwarding call stays. | D4; two copies today (plugin + `SbcCalc\Bars.cs`). |
| `BeamDesign.cs` | **Not modified in V1.** XC-7 (duplicate τc) is removed by the design lane after `Sbc.Codes` ships; the Detailer only adds the library. | Beam design is working, regression-covered code outside the Detailer; editing it here is scope creep. |
| `CadAliases.cs`, `CadCompat.cs` | Add `GSTARCAD` alias set (`Gssoft.Gscad.*`) and a minimal `ICadHost` facade (`CadHost.Current`) with capability flags. **Inventory item:** list every file referencing `ZwSoft.Windows`, `ZcWindows`, `ZdWindows`, `ZcCui`, `KeepFocus`, `Customization` (App. A §6 names `Ribbon.cs`, the ui_a ribbon tab, status-bar items, `SbcTheme.cs`). Each goes behind `#if !GSTARCAD` or behind `ICadHost.SupportsManagedRibbon`; on GstarCAD the ribbon tab and status-bar items are replaced by the partial CUIX + `(command "_.CUILOAD")`/`MENULOAD`, loaded once from `IExtensionApplication.Initialize`. The CUIX also serves ZWCAD so the Detail button has one route (D20). | GstarCAD 2026's net8 GCAD target already compiles under `Gssoft.Gscad`; Appendix F confirms the ribbon tab is built but not visible, needing a CUIX partial menu. The `#if !GSTARCAD` exclusion is for the ribbon/status-bar code only, not a from-scratch port. |
| `SbcStructural.csproj` + `Build\build_release.ps1` | **Reuse the existing `GCAD` configuration** (net8.0-windows, `CadTarget=GCAD`, `CadGcad.cs`, `#elif GCAD` in `CadAliases.cs`) rather than building a new net48 GstarCAD target — GstarCAD 2026 is net8 only and the plugin already builds and has run once-tested for it (Appendix F §2). No SDK-style conversion needed since `SbcStructural.csproj` already supports a net8.0-windows `CadTarget` (App. A/E §1, §11a). `$probes["gcad"]` already exists in `build_release.ps1`. | The GCAD target, Net8Smoke and the net8 obfuscation path already exist and were run-tested once (Appendix F); M0 only has to add the Detailer stub to that existing target, not build a new one. |
| `Build\SbcStructural.crproj` | ConfuserEx exclusions for Detailer model types, `[CommandMethod]` classes, `Sbc.Codes.dll` and `SbcStructural.Detailer.Core.dll`. | Obfuscation must not break JSON (R10). |
| Workflow tab (`ui_a`), `Workspace.cs` | Add step 4 "Detail", after QA and before Sheets (Number → Design → QA → Detail → Sheets → Issue GFC); inline strips only. | Concept 2 rules. |
| `SBCSET` / settings INI | `[Detailer]` section (§19.7, §21). | Regression cases pin defaults. |
| `Build\regression\run_regression.ps1`, `checks_ext.py`, `compare.py` | `det_*` case family, DXF comparator, per-host goldens, `result.json` `detail` key. | §21. |
| `LAYERS.dwg` | Add `SBC-DET-*` and `SBC-HOLD` layers. | §16. |
| `Sheets.Run`, `Details`, `Diagrams` | **Not modified in V1.** | Avoid the sheet pipeline's known issues. |
| `Bbs` | **No change.** | Owner hard rule; D12. |

---

## 8. New modules required

New code is split into **three assemblies** (D25): (a) `Sbc.Codes` (netstandard2.0, BCL only); (b) `SbcStructural.Detailer.Core` (net48 class library referencing `Sbc.Codes` and Newtonsoft.Json only) holding Contracts, Import (file readers + mappers + `IDesignSource` implementations), Matching, Engine, Validation; (c) the plugin project `SbcStructural`, holding `Detailer.CadRead`, `Detailer.Render`, `Detailer.Persistence`, `Detailer.Ui`, `Detailer.Commands` and `Detailer.Adapters`. `Detailer.Adapters` is the ONLY place that touches plugin types. Core never sees a plugin or host type because the compiler cannot let it; the ReflectHarness scan remains as a backstop for the plugin-side namespaces. `Detailer.Core.dll` joins `Sbc.Codes.dll` in the ConfuserEx/loader list (§21).

| Namespace / folder | Purpose | Key classes |
|---|---|---|
| `Sbc.Codes` (separate project, netstandard2.0) | Host-neutral IS 456 / IS 13920 values and rule functions; pure functions over plain data. | `Is456` (ported from SbcCalc), `Is13920`, `CodeValues`, `CodeValueCatalogue`, `Clause`, `RuleResult<T>`, `IColumnRules`, `IWallRules`, `IRuleSet`, `RuleSet_IS456_2000_IS13920_2016A1`, `RuleSet_IS456_Only`, `HoopHook`, `OfficeSettings` (plain immutable record with `Default`, `Version`, `Validate()`; JSON parsing lives in Core, D21). See App. C §E. |
| `Detailer.Contracts` (Core) | The data contract (§13). No CAD types, no ETABS types. | `CadMemberGeometry`, `DesignRecord` (+`ColumnDesignRecord`, `WallPierDesignRecord`), `MemberKey`, `MatchRecord`, `DetailModel`, `Status`, `MemberState`, `Finding`, `Provenance`, `ContractVersion`, `DesignSource` enum, `IDesignSource`, `ProjectContext`, `RunStats`, `DesignStory`. |
| `Detailer.Import` (Core) | The two design sources behind one interface (D13); pure over rows and records. | `EtabsDesignSource` (rows from `ITableSource` → records), `SbcDesignSource` (`DesignSet` JSON / adapter output → records), `ITableSource`, `ExcelTableSource` (OpenXML), `CsvTableSource`, `TableHeaderNormaliser`, `UnitsRowParser`, `ForceTableMapper`, `ColumnSummaryMapper`, `PierSummaryMapper`, `PierLegDeriver`, `StoryTableMapper`, `SectionTableMapper`, `E2kGeometryHints` (optional), `DesignSet`, `CanonicalJson`. |
| `Detailer.Adapters` (plugin) | The only code that references plugin types. | `SbcDesignSourceAdapter` (plugin `ColumnDesign` / wall design → `DesignSet`), `EtabsTablesAdapter` (Phase 2.5 `EtabsTables`/`LabelMap` → `ITableSource` / LabelMap records), `NumberingAdapter` (`MembersOf` → `CadMemberGeometry` input). |
| `Detailer.CadRead` (plugin) | Existing plugin model → `CadMemberGeometry` (§10). CAD types through `CadAliases` only. | `CadMemberReader`, `PolygonExtractor`, `StoreyBandResolver`, `OpeningFinder`, `MemberProvenance`. |
| `Detailer.Matching` (Core) | CAD ↔ design-record matching with confidence levels (§12). | `IMatcher`, `LabelMatcher`, `GeometryMatcher`, `StoreyMapper`, `MatchTable`, `MatchTolerances`, `MatchReport`, `StackBuilder`. |
| `Detailer.Engine` (Core) | Geometry + requirement → `DetailModel`. No CAD types. Implements App. C §C. | `SectionClassifier`, `PolygonOffset`, `BarSelector`, `EdgeDistributor`, `LateralSupportSolver`, `HoopDecomposer`, `ShearLegCheck`, `ZoneLayout`, `WallArranger`, `BoundaryElementArranger`, `ColumnDetailer`, `WallDetailer`, `DetailBuilder`, `Explain`. |
| `Detailer.Validation` (Core) | Ordered gates (§17) producing `Finding`s. | `GatePipeline`, `IGate`, `InputGate`, `MatchGate`, `GeometryConflictGate`, `DesignStatusGate`, `RuleGate`, `CompletenessGate`, `ConstructabilityGate`, `RenderGate`, `ValidationReport`. |
| `Detailer.Render` (plugin) | `DetailModel` → primitive CAD entities via `CadAliases` only (§16). Holds no code or office constant. | `IDetailRenderer`, `PrimitiveRenderer`, `LayerMap`, `TextStyleMap`, `DimStyleMap`, `SectionDrawer`, `ElevationDrawer`, `WallDrawer`, `ScheduleWriter` (Table Plugin text; lines + text fallback), `DetailBlockWriter`, `DetailPlacer`. |
| `Detailer.Persistence` (plugin) | Xrecord read/write of match table and detail state (§9); CAD types through `CadAliases` (`Xrecord`, `DBDictionary`, `ResultBuffer`). | `DetailStore`, `XrecordCodec`, `DetailStateRecord`, `SidecarWriter`. |
| `Detailer.Ui` (plugin) | Detail step, member list, match/detail card, progress list, EXPLAIN drawer; no host assemblies. | `DetailStepControl`, `MatchGridModel`, `FindingsStrip`, `ProgressList`, `DetailCard`, `ExplainDrawer`, `DetailSettingsPage`. |
| `Detailer.Commands` (plugin, partial of `Commands`) | Thin command bodies. | `DetailWorkflow`, `DetailBatchJob` (JSON-driven, used by regression). |
| Tests | `Sbc.Codes.Tests`, `Detailer.Core.Tests` (xUnit, net48; load `Sbc.Codes.dll` and `Detailer.Core.dll` only — no host assembly in the manifest). One test per RuleId; golden `DetailModel` JSON per fixture. | — |

---

## 9. Proposed architecture

```
 ┌──────────────────────────────────────────────────────────────────────────┐
 │  HOST (ZWCAD 2025–26, net48  /  GstarCAD 2026, net8 GCAD target)                           │
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
 │  Detailer.Adapters (plugin): SbcDesignSourceAdapter · EtabsTablesAdapter · │
 │                              NumberingAdapter  — the only plugin-type users │
 └──────────▲────────────────▲──────────────────▲──────────────────▲────────┘
            │                │                  │                  │
 ═══════════╪════════════════╪══ SbcStructural.Detailer.Core (net48 lib) ══╪═══
 ┌──────────┴─────┐ ┌────────┴────────┐ ┌───────┴────────┐ ┌───────┴────────┐
 │ Detailer.Import│ │ Detailer.Matching│ │ Detailer.Engine│ │ Detailer.Valid.│
 │ IDesignSource: │ │ (label, storey, │ │ (arrangement,  │ │ (gates G0–G8)  │
 │  SbcDesign     │ │  geometry)      │ │  zones)        │ │                │
 │  EtabsDesign   │ └─────────────────┘ └───────┬────────┘ └───────┬────────┘
 └──────────┬─────┘   Detailer.Contracts (records only)  │                  │
            │                      ┌────────────┴──────────────────┴──────┐
            │                      │  Sbc.Codes  (netstandard2.0)         │
            │                      │  Is456 · Is13920 · OfficeSettings    │
            │                      │  shared with SbcCalc                 │
            │                      └──────────────────────────────────────┘
            ▼
   SbcDesign : plugin ColumnDesign / wall design (run on imported ETABS forces)   ← usual
   EtabsDesign: ETABS table export (.xlsx/.csv) — owner runs ETABS; SBC never starts it
```

**Dependency rules (compiler-enforced by the three-assembly split, D25; ReflectHarness scan as backstop).**
1. `Sbc.Codes` references the BCL only. `OfficeSettings` is a plain immutable record with a static `Default`; parsing JSON into it is done by `Detailer.Core` (and by SbcCalc with its own serializer). `Sbc.Codes` exposes `OfficeSettings.Version` and `OfficeSettings.Validate()` only (D21).
2. `SbcStructural.Detailer.Core` (`Contracts`, `Import`, `Matching`, `Engine`, `Validation`) references `Sbc.Codes` and Newtonsoft.Json 13.x only — compiler-enforced; it cannot name a `ZwSoft.*` / `Gssoft.*` / `Autodesk.*` or plugin type. `buildcheck.ps1 -Label det` additionally fails if the Core manifest references a host assembly. Serializer decided now, not at inventory: Newtonsoft.Json 13.x plugin-wide (net48; System.Text.Json on net48 pulls six support packages that ConfuserEx must exclude).
3. `Render`, `CadRead`, `Persistence` use CAD types through `CadAliases` only, limited to the App. D §4 primitive whitelist plus `Xrecord`, `DBDictionary`, `ResultBuffer`.
4. `Ui` has no host assemblies; it receives view-models from `DetailWorkflow`.
5. `Persistence` is the only writer of Xrecords; all keys namespaced `SBC_DETAIL_*`. One Xrecord per detail *block reference*; individual entities carry nothing.
6. Nothing in `Detailer.*` references `Bbs`.
7. The Engine never asks "which design source"; it reads `DesignRecord` only. The source is visible solely in `Provenance.Source` and in the drawing notes.
8. `Adapters` is the only namespace that references plugin types (`ColumnDesign`, `EtabsTables`, `LabelMap`, `Numbering`); it is scanned by ReflectHarness for host types like `Render`.
9. No reference to `ETABSv1.dll`, `CSI.ETABS.API.ETABSObject` or `Marshal.GetActiveObject` may appear in Detailer code in V1 (grep-guarded in `buildcheck.ps1`, like the host-API rule).

**Data flow.** Design source (`SbcDesignSource` or `EtabsDesignSource`, per project, fed through `Adapters`) → `DesignSet` (records + provenance) → `Matching` (with `CadMemberGeometry` from `CadRead`) → `MatchTable` → `Engine` (`DetailBuilder` per matched member) → `DetailModel` → `Validation.GatePipeline` → `Render` → CAD entities + `Persistence`.

**Persistence: Xrecords in the drawing (primary) + sidecar JSON (secondary) (D16).**
- Match table: Xrecord `SBC_DETAIL_MATCH` under NOD dictionary `SBC_DETAILER`, one per matched member keyed by mark+storey, payload compact canonical JSON (§13 Hashing), strings chunked at 255 chars in group codes 300–309, one Xrecord ≤ 8 KB, `XrecordMergeStyle` left default. The match is a property of *this drawing*; it must travel with the DWG and work on both hosts (Xrecord/DBDictionary present on both, App. D §3).
- Detail state: Xrecord `SBC_DETAIL_STATE` on the inserted detail **`BlockReference`** (not the definition, so WBLOCK/COPYCLIP of one detail carries its state): version, member key (Mark, StackId, View), `DesignHash`, `GeometryHash`, `DefinitionHash` (hash of entity types, layers, rounded coordinates and strings of the block definition at generation time — hand-edit detection), `MemberState`, approver, accepted values and override reasons, grid cell at first insertion. No timestamp enters any hash. The NOD entry `SBC_DETAILER` lists the managed reference's handle per detail; any other reference of the same definition is "user copy — not managed" (§16.7).
- Import snapshot: **not** written into the DWG (can be MB-sized); only provenance + SHA-256; source file path stored relative to the DWG. Sidecar `<dwg>.sbcdetail.json` written on every successful run for QA diff (`compare.py`) and as a recovery path. Sidecar and reports go to `<results folder>` from `[Detailer] ResultsFolder` (default beside the DWG); a write failure or an unsaved drawing is a WARNING line, never a failed command.
- Rejected: XData (16 KB per app limit), per-entity Xrecords (bloat, slow SAVE/OPEN), sidecar-only (gets separated from the DWG).

**Position in the SBC roadmap.** MASTER_PLAN: Phase 2 numbering lock → 1.14.2; Phase 2.5 ETABS export/import; Phase 4 design stages locked → 1.15; Phase 5 foundations/stairs → 1.16; Phase 6 sheets; Phase 7 pilot → 1.17 "office-ready". The Detailer sits **after the numbering lock and on top of Phase 2.5**, is built **alongside 1.15** in its own lane, and is a **1.17 deliverable** for columns and walls (D17). It must not enter the 1.15 release train until M1 passes on both hosts. Long term the platform reads CAD/MODEL → ETABS INTEGRATION → ANALYSIS DATA → DESIGN → CALCULATOR → **DETAILER** → DRAWING GEN → BAR SCHEDULE → BBS → DOCUMENTATION; the Detailer's typed input/output records are built so it becomes that native stage without rewrite.

---

## 10. CAD → Detailer data flow

What CAD contributes: **WHERE** the member is and **WHAT actual geometry** it has. Nothing about reinforcement is read from CAD.

```csharp
namespace SbcStructural.Detailer.Contracts
{
  public enum MemberKind { Column, ShearWall, LiftWall }     // C / SW / LW marks. RW out of V1 scope; add when retaining-wall detailing is planned
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
3. `PolygonExtractor` accepts `Polyline`, `Polyline2d` and `Circle` (**Circle support assumed — verify in inventory**: Appendix A says walls/columns are "closed polylines"); flattens bulges (≥ 16 arc segments; circle → `IsCircle`); treats first == last vertex within snap tolerance as closed; drops vertices closer than tolerance; removes collinear vertices; forces CCW; rejects self-intersecting polygons with `Invalid CAD geometry: self-intersecting`; unions two overlapping rectangles of the same mark into one polygon (L/T/C) and reports "composed from n outlines". Unit tests for each case from M0 (D11). Units: the Detailer runs only on drawings that passed the numbering units check (mm); G0 fails with the same "WRONG UNITS" wording otherwise. Whether numbering converts m-drawings (`units_m` case) is **(assumed — verify in inventory)**; if it does, `PolygonExtractor` reuses that factor, never `Database.Insunits` alone.
4. `StoreyBandResolver` reads the ProjectPanel storey list. For a plan used by several storeys, the same geometry is emitted once per storey with a different `Storey` — this is how "one physical column, many storeys" starts on the CAD side.
5. Walls drawn as two open parallel polylines (`Analysis.Supports`) → `Legs` built from the pair, `Plan` = their hull, `FromParallelLines = true` (lower geometric confidence in §12).
6. `OpeningFinder`. **OPENING-layer entities are slab cut-outs** (lift, ducts — Appendix A ties the layer to the lift-wall rule); they are used only for the lift-wall rule and for "wall touches a slab opening" notes, never as wall openings. Wall openings (doors, windows) are detected as (a) a gap between two collinear wall pieces of the same mark/thickness whose ends are ≤ the opening threshold apart, with a BEAM-layer entity or lintel spanning the gap; (b) a closed polyline on a new `SBC-WALL-OPEN` layer lying inside the wall outline (sill/head as optional attributes of a small block, else `null`). Both detections are **(assumed — verify in inventory: how Numbering joins wall pieces)**. Sill/head heights unknown → `null` → gate `STATUS: INCOMPLETE` ("wall opening heights") unless entered in the Detailer UI.
7. Provenance: the source INSERT handle (+ index of the piece inside the block definition) and the drawn polyline handle; `SBC_BLK` copy handles are never stored (they are deleted/recreated by `SBTNUMBER`).

Clear height of a column comes from storey levels and beam depths at each end. Beam depths come from the plugin beam design/schedule size per mark **(assumed — verify in inventory; a plan line does not carry depth)** or from the imported beam section table; if neither is available, `STATUS: INCOMPLETE` for that column (gate G6).

`Model.Load` impact: once details are inserted, the existing full model-space scan sees thousands more primitives. Detail entities live only on `SBC-DET-*` layers and inside `SBC_DET_*` block definitions, so the scan must skip them by layer / block-name prefix — **(verify Model.Load filter)**; regression case `det_after_number` (§21) proves `SBTNUMBER`/`SBTSHEETS` stay inside their +10 % budget after a full `SBTDETAILBATCH`.

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

Channel: the ETABS **table export** (Excel preferred; CSV accepted) read by the Phase 2.5 import, reusing `EtabsTableReader`/`EtabsResults`/`LabelMatcher` directly (contents confirmed, App. E §5 — see D39e). No live API in V1; `ITableSource` leaves the seam for V1.5 (no `API-*` channel value exists in V1).

**Decision rule — one table reader, not two (resolved in V1.1 from the inventory).** If `EtabsTables.cs` already opens .xlsx/.csv and returns rows, `Detailer.Adapters.EtabsTablesAdapter` wraps it as `ITableSource` and `ExcelTableSource`/`CsvTableSource` are NOT written. `TableHeaderNormaliser` and `UnitsRowParser` are written in Core either way because they are pure functions over strings and the Phase 2.5 lane must not be edited from the Detailer lane. Until the inventory arrives, M1 week 2 uses `ExcelTableSource` (OpenXML) behind `ITableSource` so M1 is not blocked; if Phase 2.5 has not landed when M1 starts, the Detailer's reader is written in `Lanes\SbcEtabs\` so it *becomes* the Phase 2.5 reader, not a second one. `SBCDETAILIMPORT` never parses tables itself; it calls the reader and maps the result.

Pipeline:
1. `ITableSource.Open(path)` → list of `(title, headers[], units[], rows[][])`. Title = first non-empty cell of the sheet with any leading `TABLE:` and whitespace stripped **(verify)**; the header row is the first row whose normalised cells contain both `Story` and (`Label` | `Pier` | `Name`); the units row is the row immediately after it when ≥ 1 cell matches a known unit token, else absent (→ step 2). Row offsets are logged; nothing is hard-coded to a row number (the layout changed between v17 and v18+, App. B §1a; sheet names truncate at 31 chars). Headers normalised (remove spaces, case-insensitive); table title matched by regex `IS\s*456[:\- ]?2000`.
2. **Units, per column.** `UnitsRowParser` reads the units row **per column**, maps each header to a contract quantity (force, length, area, area/length, moment, stress, angle, ratio) and converts with a fixed table (`kN-mm→kN·m ×0.001`, `N→kN`, `m→mm`, `m²→mm²`, `mm²/mm→mm²/m ×1000`, `N/mm²=MPa`; `kgf`/`tonf`/`lb` refused). With length = mm, ETABS moments export as kN·mm, not kN·m; `Rebar Area` may be mm² even in kN-m exports; `Av/s` may be mm²/m or mm²/mm. An unknown unit string, a blank units cell on a numeric column, or a units row absent (CSV channel) → `STATUS: INCOMPLETE "units unknown for column <Rebar Area> in <table>"`; never defaulted. `Provenance.SourceUnits` records the force/length pair from `Program Control` (`CurrUnits`, **verify**); the per-column strings are kept in the import log. **Culture:** for .xlsx, numeric cells are read as doubles; a numeric column whose cells are *strings* is parsed only if every value matches `^-?\d+(\.\d+)?([eE][-+]?\d+)?$`, else `INCOMPLETE "text numbers in <column> — re-export with English (US) number format"`. For CSV/text the delimiter is detected from the header row (tab preferred; comma accepted only when no cell contains a comma-decimal pattern `\d,\d`); any `\d,\d` in a numeric column → refuse the file with the same ACTION. The import log prints the detected delimiter and culture decision.
3. Required tables (missing mandatory table → `STATUS: INCOMPLETE` for the run):
   - `Program Control` (`ProgramName`, `Version`, `CurrUnits`, model/file name if present — headers **verify**) → provenance; **mandatory**.
   - `Story Definitions` (+ `Tower` column when present) → `DesignStory` list.
   - `Frame Assignments - Summary` (+ `- Section Properties`, `- Local Axes`), `Frame Sections`, `Frame Section Property Definitions - Concrete Rectangular/Circle` → sections, Design-vs-Check flag, angle. Orientation: `D_mm = t3` (depth, along local 3), `B_mm = t2` (width, along local 2); plan orientation of local 2 = global X rotated by `Angle` (deg, anticlockwise); `Diameter_mm = t3` for `Concrete Circle`. G3 compares after applying this rotation and also tries the 90° swap; a match only under the swap → `DATA CONFLICT (rotation)`, not a silent pass.
   - `Point Object Connectivity` + `Frame Object Connectivity` → column end coordinates (geometry hints, position check in G3).
   - `Concrete Frame Design Preferences - IS 456:2000` / `Shear Wall Design Preferences` (names **verify**) → `Design Code` must equal `IS 456:2000`; `Is13920Edition` = 2016 when `ToolVersion` ≥ 17 (App. B §1c matrix), stored as "(derived)". A different code → run blocked `FAILED — design code <x> not supported`.
   - `Concrete Column Design Summary - IS 456:2000` → `ColumnDesignRecord.Stations` (all rows kept; envelope derived per §11.3a).
   - **Pier legs (both paths).** `PierLegs` are **derived** by the importer: `Area Assignments - Pier Labels` (Story, Label, Unique Name, Pier Name) → the set of wall area objects per (Story, Pier); `Area Object Connectivity` + `Point Object Connectivity` → each object's corner points; project to plan, take the two long edges, collapse to a centreline segment with thickness from `Area Section Properties`/`Wall Property Definitions`; merge collinear segments sharing an endpoint (tolerance 25 mm) into one leg; number legs in the order ETABS reports them (longest first = pier local axis, release note 11414 **(verify)**). `Pier Section Properties` is used only to cross-check `Width Bot ≈ Σ leg lengths` (± 5 %) and to take `AxisAngle_deg`, `CgBot/CgTop`, `Ag_mm2`; it does **not** give per-leg coordinates. When `Shear Wall Pier Design Details` is present its leg coordinates override the derived ones and a mismatch > 25 mm is a WARNING. A pier whose area objects cannot be reduced to straight legs (curved or meshed walls with openings) → `INCOMPLETE "pier legs not derivable"`.
   - `Shear Wall Pier Design Summary - IS 456:2000` (+ Details when present) → `WallPierDesignRecord`.
   - SD sections: polygons and drawn bars are read from `Frame Section Property Definitions - Section Designer` / "SD Section Data" tables when present (headers **verify**); else from the model's .e2k (`$ SECTION DESIGNER SECTIONS`) if the user supplies it beside the .xlsx; else every column on an SD section is `INCOMPLETE "SD section <name>: polygon not in export — tick the SD tables or supply the .e2k"`.
   - Optional: `Concrete Column Shear Details`, `Concrete Joint Design Summary`, `Concrete Beam Design Summary` (beam depths).
   - **Completeness (G1):** the count of rows with `Design Type = Column` and `Design Procedure = Concrete Frame` in `Frame Assignments - Summary` must equal the distinct (Story, Unique Name) in `Concrete Column Design Summary`; same for piers between `Area Assignments - Pier Labels` and `Shear Wall Pier Design Summary`. A shortfall → G1 Warn for the run with the list of missing members, each member `INCOMPLETE "no design row — export was Selection Only, design not run after last analysis, or design procedure None"`; a shortfall > 50 % → run blocked (the export is almost certainly partial).
   All header spellings are App. B §2 and carry its "(verify)" marks until one real ETABS 22 export freezes them.
4. `LabelMap` (written when SBC generated the .e2k) attaches `MemberKey.SbcMark`. When the ETABS model was built by hand, `SbcMark = null` and §12 geometry matching does the work.
5. **Provenance** (App. B §5, **table-channel columns only**; no API fields): `ToolVersion` and `SourceUnits` from `Program Control`; `ModelFile` from `Program Control`'s model/file column if present **(verify)**, else the import prompts for a revision tag (`Tower-A_R3`) which is stored instead; `ExportDate` = the .xlsx `dcterms:modified` core property, fallback file mtime, always shown to the user at load (never hashed); `FileSha256` = sha256 of the file **and** `ContentSha256` = sha256 of the canonicalised rows of the tables used (sorted, trimmed, numbers normalised). Staleness per member is decided by the member's `DesignHash` (§13 Hashing, §16.7), not by the file hash; a new file whose `ContentSha256` equals the previous one is reported "re-import: no change" and nothing is rewritten. Stored in the DWG NOD and printed in the notes block.
6. Blank / "N/A" → `null`, never 0. `PMM Ratio` present and `Rebar Area` blank → `Mode = Check`. `Status "O/S"` → `Overstressed = true`, which **blocks** auto-detailing of that member (D22).
7. What ETABS does NOT give (App. B §3) and the Detailer therefore computes: bar count/dia/arrangement, tie spacing/legs/dia, confinement Ash and l0, laps, hooks, cover, curtains, BE tie layout, openings, junctions, continuity between storeys. Every such value is tagged `source: Detailer` in the EXPLAIN text. What the Detailer does **not** compute: the BE required flag and BE length (design source only, D29), Av/s (design source only, D27).

### 11.3 `SbcDesign` path (usual case)

The Phase 2.5 import brings ETABS **forces** onto SBC marks; the plugin's `ColumnDesign` / wall design runs on them (or the Calculator does). `SbcDesignSourceAdapter` adapts that output into the same records.

**Force tables consumed on the SbcDesign path** (ANALYSIS RESULTS branch of Show Tables; header spellings "(verify)" until the owner's ETABS 22 export is in `inputs\`):
- `Element Forces - Columns` **(verify)** — `Story` | `Column` (= Label) | `Unique Name` | `Output Case` | `Case Type` | `Step Type` (Max/Min/blank) | `Station` | `P` | `V2` | `V3` | `T` | `M2` | `M3`. One row per column per combo per station; `P` compression negative in the ETABS sign convention — the adapter flips to SBC's convention and records the flip in Provenance.
- `Pier Forces` **(verify)** — `Story` | `Pier` | `Output Case` | `Case Type` | `Step Type` | `Location` (Top/Bottom) | `P` | `V2` | `V3` | `T` | `M2` | `M3`. Forces are for the whole pier (all legs), in pier local axes (axis angle from `Pier Section Properties`).
- `Load Combinations` (+ `Load Combination Definitions`) **(verify)** — combo name, type (Linear Add / Envelope / Abs Add), case list and factors → used to classify ULS vs SLS combos (§11.3a).
- `Program Control` **(verify)** — version, units (provenance; mandatory).
- `Story Drifts`, `Joint Reactions` — read by Phase 2.5 for other purposes; not needed by the Detailer.
Missing `Element Forces - Columns` or `Pier Forces` → `STATUS: INCOMPLETE` for the run (G1). A column present in `Frame Assignments - Summary` with `Design Type = Column` but absent from the force table → INCOMPLETE for that member with ACTION "export was Selection Only or analysis not run".

### 11.3a Design combinations and envelopes

The Phase 2.5 import hands `ColumnDesign` / wall design the **full per-combo, per-station force set** (`ForceStation(Story, Label, UniqueName, Combo, StepType, Location_mm, P, V2, V3, M2, M3)`), never a pre-enveloped Pu/Mu. Design combos = every `Load Combination` whose name matches the project's ULS filter (default regex `^(U|ULS|DCon|COMB)` and `Case Type = Combination`, setting `[Detailer] UlsComboRegex`), expanded so that an Envelope-type combo contributes its Max and Min rows as two load sets. SLS/drift combos are excluded. The design routine iterates every (combo, station), checks biaxial PMM per combo (IS 456 39.6 — P and M2/M3 of the *same* combo at the *same* station) and the IS 13920 capacity shear, and reports the **governing combo name** in `ColumnStation.PmmCombo` / `VMajorCombo` / `VMinorCombo`; `Pu_kN, Mu2_kNm, Mu3_kNm, Vu2_kN, Vu3_kN` on the record are the values *of that governing combo*, not component-wise maxima. `ColumnDesignRecord.Envelope` is the station with the largest `AsRequired_mm2` (and separately the max `Avs*`), tagged with its combo. The wall stress trigger (IS 13920 10.4.1) likewise runs per combo on `Pier Forces` inside the wall design and reports the governing one. If zero combos pass the ULS filter → `STATUS: INCOMPLETE "no ULS combination recognised — set UlsComboRegex"`.

| Record field | From SbcDesign |
|---|---|
| `Key` | `(Story, Label)` from the force table, joined to the SBC mark through `LabelMap` (mark → Story, Label, X, Y, B, D written at .e2k export). The join is **verified by geometry**: `Point Object Connectivity` X/Y of the column's I-point must be within 100 mm of the LabelMap X/Y and the `Design Section` B×D within 10 %; otherwise the row is `MATCH FAILED "label C14 no longer at (12450, 6500) — ETABS labels renumbered; re-export the .e2k or accept by geometry"`. On the first successful import the `Unique Name` (and `GUID` from the connectivity table) is written back into LabelMap and preferred on every later import (the .e2k cannot carry Unique Names, App. B §1b). **Recommended .e2k convention:** SBC writes the ETABS *pier label* equal to the SBC wall mark (`PIER "SW2"`), and the column Unique Name equal to the SBC mark where the e2k version supports it (**verify in E2kWriter**), so that on a fresh ETABS import no label mapping is needed for walls. |
| `Mode` | `Design` always. |
| `DesignSection`, `Fck`, `Fy` | The section and materials the design used. Missing → INCOMPLETE (D27). |
| `Stations[].AsRequired_mm2` | As,req from the design, or the design's chosen n×Ø (honoured if geometry allows, App. C §C6). |
| `AvsMajor/Minor`, `Vu2/Vu3` | From the shear design per (combo, station); or tie spacing + legs converted to mm²/m by the adapter. Missing → INCOMPLETE; never code minimum (D27). |
| `Pu/Mu` | Of the governing combo per station (§11.3a), for the lap tension check and the wall stress trigger. |
| `FrameType` | From the project seismic category (D24): Zone III–V → `Ductile`. |
| `Status` | `Overstressed` when the design reports a failing section. |
| Wall: `PierShear`, `PierBoundary` | ρh per leg, BE `Required` flag + `RequiredLength_mm` from the wall design or the Calculator's 0.2 fck check (run per combo inside the design, never in the Detailer — D29). Missing → INCOMPLETE. |
| `Provenance` | `Source = SbcDesign`; `ToolVersion` = plugin/Calculator version; `FileSha256` = sha256 of the ETABS **forces** export the design consumed (from the Phase 2.5 import record); `Channel = SbcDesignPlugin` or `SbcDesignCalculator`; `TablesUsed` = the force tables above; `ExportDate` = ETABS export date carried through the import record; `DesignRunId` = hash of design inputs + settings + code version (the design-run time lives here, never in a hash). G1 compares `FileSha256` of the design run with the *latest* Phase 2.5 import in the drawing: different → every member `INCOMPLETE "design run older than the current ETABS import — re-run SBC design"`. |

Output types of `ColumnDesign` and wall design are confirmed (App. E §6: `ColumnResult`, `ShapeColumnResult`, `WallResult`, `ShearWallResult`) — see D39c for how the adapter should wrap them directly rather than re-deriving bars from As_req. For the Calculator app, `SbcCalc\UI\CadLink.cs` (contents still unread) can write the same `DesignSet` JSON (`sbc-detailer/design` schema v1, source `SbcDesign`).

### 11.4 Matching on the SbcDesign path

SbcDesign records carry SBC marks through `LabelMap`, so matching is normally L1 (mark); the LabelMap join is geometry-verified as in the `Key` row above, and L3/G3 verification still runs against the design section and position so a drawing changed after the design run is caught as DATA CONFLICT.

---

## 12. CAD ↔ ETABS member matching strategy

Keys in order. The first level that produces a unique hit wins; every lower level is only *verification* of a higher one, never a silent override. Prerequisite: numbering locked (owner decision).

| Level | Rule | Result |
|---|---|---|
| L0 Storey | CAD `StoreyBand` ↔ `DesignStory` via `StoreyMapper`: explicit `EtabsStoryName`; else story names matched on the **full string** first; the numeric normaliser (`"3F"`, `"Story3"`, `"STOREY 3"` → `3`) runs only on the part after the last `-` when `Story Definitions` has a `Tower` column, and the tower token must equal `Project.EtabsTower` (setting; default = the only tower); else elevation match (`|TopLevel − Elevation| ≤ 50 mm`). Two ETABS stories normalising to the same SBC storey → `MATCH FAILED (storey ambiguous)` for that storey, never first-wins. `Base` is mapped to the foundation level and produces no members. `StoreyMapper` writes the resolved `EtabsStoryName` into the match record, never into the design set. Unmapped storey → every member on it is `MATCH FAILED (storey)`. | Required for everything below |
| L1 Mark/label | `MemberKey.SbcMark == Mark` (from LabelMap, geometry-verified per §11.3), or ETABS `Label == Mark` when the office draws ETABS labels, or `ArchLabel`. Unique Name / GUID stored once matched and preferred on re-match (labels renumber on delete — App. B §4). | **MATCH** — section, rotation and **position** still verified at G3; a disagreement downgrades to DATA CONFLICT, never to a silent rematch |
| L2 Pier legs | Pier (Story, PierLabel) with N derived legs (§11.2) ↔ CAD wall `Legs`: a leg matches if it overlaps the CAD leg centreline ≥ 70 % and thickness within 10 % or 25 mm (D15). Pier matches when all legs match one CAD wall mark (or a connected set sharing a junction). | MATCH if all legs; `MATCH PARTIAL` (amber) if ≥ 1 leg unmatched → member blocked |
| L2b Kind check | CAD kind (C/SW/LW) vs record kind (Column/Pier) differ with a unique geometry hit (the plugin calls aspect ratio ≥ 3.95 a wall; ETABS/SbcDesign may model the same 300×1200 member as a frame column, or a CAD column as a pier). | `DATA CONFLICT (kind)` with both kinds shown, never `MATCH FAILED`; user resolves by renumbering or in the ETABS model |
| L3 Geometry fallback (D7) | Same storey AND centroid distance ≤ 100 mm AND section within 10 % in B and D after applying angle AND same shape class. Must be unique both ways; otherwise ambiguous → MATCH FAILED listing the candidates. | **MATCH-BY-GEOMETRY** (amber, listed; drawing note "matched by position") |
| L4 | None of the above. | **MATCH FAILED** (red) — member blocked; everything else proceeds |

**Stacks.** One physical column over many storeys = chain of per-storey matches whose centroids coincide (≤ 100 mm) across consecutive storeys. Stack hint: equal ETABS `Label` (or equal SBC mark) across consecutive storeys joins the stack even when the centroid offset is 100–300 mm, with WARNING `stack offset 180 mm at 4F — crank/dowel detail required`; > 300 mm, or a different label with ≤ 100 mm, are allowed only as reported stack breaks. The stack drives the elevation, laps and termination. A storey where the stack has a CAD member but no design record (or vice versa) → `DATA CONFLICT (stack gap)`. Section changes along the stack are allowed and drive the crank/dowel detail. Columns split within a storey (App. B pitfall 3): envelope of both segments, WARNING "two segments merged". Piers changing label between storeys: stacks are built on geometry; a label change is a WARNING only.

Tolerances are settings (`[Detailer]` INI: centroid 100, section 10 %, conflict 5 %, storey elevation 50 mm, rotation 5°, pier leg overlap 70 % / thickness 10 % or 25 mm — D7, D8, D15) and are printed in the match report.

**Report format** (command line, Findings strip, `match_report.txt` beside the DWG):
```
MATCH FAILED  C14 @ 3F      no ETABS column within 100 mm of (12450, 6500); nearest: C7 @ Story3 at 260 mm (section 300x600 vs 300x600)
MATCH FAILED  SW2 @ GF      pier P4 leg 2 (1550 mm along Y) has no CAD wall on layer SW; CAD SW2 has 1 leg
MATCH FAILED  C3 @ 5F       storey "5F" not mapped to an ETABS story (set EtabsStoryName in Project)
MATCH-BY-GEOMETRY  C9 @ 2F  matched to C9 @ Story2 by position (41 mm, 300x450 vs 300x450); no label map
DATA CONFLICT  C2 @ GF      CAD 300x600, ETABS design section C300X700 (D differs 16.7 % > 5 %) – review required
MATCH SUMMARY: 48 columns: 40 MATCH, 5 MATCH-BY-GEOMETRY, 2 MATCH FAILED, 1 DATA CONFLICT; 6 piers: 5 MATCH, 1 PARTIAL. Results are NOT complete.
```

**Persistence and re-match.** The `MatchTable` lives in the NOD (§9) keyed by (Mark, StoreyId) with UniqueName/GUID and CAD handles. `CadHandles` stores, in order of preference: the source INSERT handle + the index of the piece inside the block definition (from the StructuralBlocks map, §7), then the drawn polyline handle. **`SBC_BLK` copy handles are never stored** (they are deleted/recreated by `SBTNUMBER`). The durable key is mark + storey + centroid (≤ 100 mm) + section; handles are a fast path only. On re-run: (a) if numbering raised "marks changed", each entry is re-validated by the source INSERT / polyline handle (entity still exists, mark changed → re-keyed and reported "C12 → C13 renamed, match kept"); a missing INSERT or polyline (not a missing copy) is what downgrades the match, and the mark + geometry key is tried before downgrading; a CAD entity whose handle no longer exists and no geometry hit → entry removed and reported "C12 @ 3F: CAD member deleted — detail block orphaned (HOLD)". (b) If the import content hash changed: for each entry, look up the stored `UniqueName` (then `GUID`). Found → re-verify centroid ≤ 100 mm and section ≤ 10 %; pass = match kept, fail = `DATA CONFLICT (member moved/resized in ETABS)`. **Not found** → the member was deleted or the export is partial: the entry is set `MATCH FAILED "UniqueName 147 absent from export — deleted in ETABS or Selection Only"`, and the detail block gets the HOLD tag (§16.7). Label equality is **never** used to re-match an entry that previously had a UniqueName; it may only propose a candidate in the report ("label C14 now at UniqueName 212, 0 mm away — run SBCDETAILMATCH to accept"). Any drop in level is downgraded, never silently kept. A match is never auto-upgraded from MATCH-BY-GEOMETRY to MATCH; an engineer can "accept" it (`UserAccepted = true`, still amber; D18).

---

## 13. Data contract

Units fixed: mm, mm², mm²/m, kN, kN·m, MPa, degrees. `double?` means "unknown — a gate decides"; non-nullable means mandatory. Mappers validate before construction and emit a `Finding(Incomplete, "G1", member, "missing <field> (<table/row>)")`; a record is constructed only when every non-nullable argument is present. Record constructors contain `ArgumentNullException` guards as a last line of defence; reaching one is a bug, handled by Guard. All records immutable; serialised with Newtonsoft.Json 13.x plugin-wide (D21), enums as strings (`StringEnumConverter`). Every top-level document carries `$schema` and `schemaVersion`.

```csharp
namespace SbcStructural.Detailer.Contracts
{
  public static class ContractVersion { public const string Design = "sbc-detailer/design";   // both sources
                                        public const string Match  = "sbc-detailer/match";
                                        public const string Detail = "sbc-detailer/detail";
                                        public const string CadGeometry = "sbc-detailer/cad-geometry";
                                        public const string Version = "1.0.0";   // "$schema" = Schema + "/v" + major; "schemaVersion" = full semver
                                      }

  public enum DesignSource { SbcDesign, EtabsDesign }                       // D13 — per project
  public enum Channel { TableExportExcel, TableExportCsv, SbcDesignPlugin, SbcDesignCalculator }   // API values reserved for V1.5, not implemented
  public enum DesignMode { Design, Check }
  public enum DesignStatus { Ok, Overstressed, NotDesigned }
  public enum FrameType { Ductile, Ordinary, NonSway }
  public enum PierType { UniformReinforcing, SimplifiedCT, GeneralSD, SbcWall }
  public enum WallType { Special, Ordinary }
  public enum KeyKind { Column, Pier }
  public enum SectionShape { Rectangular, Circular, SD }
  public enum ZoneName { Confining, Mid, Lap, General, Joint }
  public enum LapGroup { A, B, C }          // C used by walls (three alternating groups, §15.1)
  public enum Edge { Left, Right }
  public enum SeismicCategory { ZoneII, ZoneIII, ZoneIV, ZoneV }   // D24 — selects the rule set; never a free "ductile off"

  public sealed record Provenance(DesignSource Source, string? ToolVersion, string? ModelFile, string? FileSha256, string? ContentSha256,
                                  DateTimeOffset? ExportDate, Channel Channel, IReadOnlyList<string> TablesUsed,
                                  string? DesignCodeFrame, string? DesignCodeWall, string? Is13920Edition,
                                  (string Force, string Length) SourceUnits, string? DesignRunId /*SbcDesign only*/);

  public sealed record MemberKey(KeyKind Kind, string Story, string Label, string? UniqueName, string? Guid,
                                 string? Tower, string? SbcMark /*LabelMap; geometry-verified (§11.3)*/);

  public sealed record SectionDef(string Name, SectionShape Shape, string Material,
                                  double? Fck_MPa, double? Fy_MPa, double? B_mm, double? D_mm, double? Diameter_mm,
                                  RebarTemplate? Template, IReadOnlyList<Polygon>? SdPolygons);
  public sealed record RebarTemplate(DesignMode Mode, string Pattern, double ClearCover_mm, int NBars3, int NBars2,
                                     int BarSize_mm, int TieSize_mm, double TieSpacing_mm, int NTies2, int NTies3);

  public sealed record ColumnStation(double Location_mm, string? PmmCombo, double? AsRequired_mm2, double? RhoRequired_pct,
                                     double? PmmRatio, double? Pu_kN, double? Mu2_kNm, double? Mu3_kNm,
                                     string? VMajorCombo, double? Vu2_kN, double? AvsMajor_mm2_per_m,
                                     string? VMinorCombo, double? Vu3_kN, double? AvsMinor_mm2_per_m,
                                     bool? CapacityShearGoverns);   // Pu/Mu/Vu are the values of the governing combo (§11.3a)
  public sealed record ColumnGeometryHint(Pt Bottom, Pt Top, double BottomZ_mm, double TopZ_mm, double Angle_deg,
                                          int? CardinalPoint, double? B_mm, double? D_mm, double? Diameter_mm);

  public abstract record DesignRecord(MemberKey Key, DesignMode Mode, DesignStatus Status,
                                      IReadOnlyList<string> Errors, IReadOnlyList<string> Warnings, Provenance Prov);

  public sealed record ColumnDesignRecord(MemberKey Key, DesignMode Mode, DesignStatus Status, IReadOnlyList<string> Errors,
      IReadOnlyList<string> Warnings, Provenance Prov,
      string DesignSection, string? AnalysisSection, FrameType FrameType, bool FrameTypeAssumed,
      ColumnGeometryHint? Geometry, IReadOnlyList<ColumnStation> Stations /*≥1*/, ColumnStation Envelope,
      (int N, int Dia)? ChosenBars /*SbcDesign may pre-choose; honoured if geometry allows*/,
      double? AshOverS_major_mm2_per_m, double? AshOverS_minor_mm2_per_m /*null → Detailer computes IS 13920 7.6.1*/,
      bool? FullHeightConfinement /*design condition, IS 13920 8.2–8.5 (verify); null = not stated*/)
      : DesignRecord(Key, Mode, Status, Errors, Warnings, Prov);

  public sealed record PierLeg(string Id, Pt P1, Pt P2, double Length_mm, double Thickness_mm, bool Derived /*from area objects, §11.2*/);
  public sealed record PierFlexure(string? Combo, double? AsRequired_mm2, double? RhoRequired, double? RhoCurrent,
                                   double? Pu_kN, double? Mu2_kNm, double? Mu3_kNm, double? DcRatio);
  public sealed record PierShear(string Leg, string? Combo, double? AvsHoriz_mm2_per_m, bool Overstressed, double? Vu_kN, double? Vc_kN,
                                 double? TauV_MPa /*Vu/(0.8·lw·tw); needed for the single-curtain path*/);
  public sealed record PierBoundary(string Leg, Edge Edge, double? EdgeLengthChecked_mm, double? StressComp_MPa,
                                    double? StressLimit_MPa, bool? Required, double? RequiredLength_mm, double? RequiredRho);
  public sealed record PierStation(string Location /*Top|Bottom*/, PierFlexure Flexure, IReadOnlyList<PierShear> Shear,
                                   IReadOnlyList<PierBoundary> Boundary);
  public sealed record WallPierDesignRecord(MemberKey Key, DesignMode Mode, DesignStatus Status, IReadOnlyList<string> Errors,
      IReadOnlyList<string> Warnings, Provenance Prov,
      PierType PierType, WallType WallType, bool WallTypeAssumed,
      double? Fck_MPa, double? Fy_MPa, double AxisAngle_deg, IReadOnlyList<PierLeg> Legs /*≥1*/,
      Pt CgBot, Pt CgTop, double? Ag_mm2, IReadOnlyList<PierStation> Stations /*Top & Bottom*/)
      : DesignRecord(Key, Mode, Status, Errors, Warnings, Prov);

  public sealed record DesignStory(string Name, double Elevation_mm, double? Height_mm, string? Tower);   // what a design source can supply
  public sealed record DesignSet(string Schema, string SchemaVersion, Provenance Prov, IReadOnlyList<DesignStory> Stories,
                                 IReadOnlyList<SectionDef> Sections, IReadOnlyList<ColumnDesignRecord> Columns,
                                 IReadOnlyList<WallPierDesignRecord> Piers);

  public sealed record ProjectContext(string DwgPath, string? DesignFile, DesignSource Source, SeismicCategory Seismic,
                                      string RuleSetId, string OfficeSettingsVersion, IReadOnlyList<StoreyBand> Storeys,
                                      string? EtabsTower, string UlsComboRegex);
  public interface IDesignSource { DesignSource Kind { get; } DesignSet Load(ProjectContext ctx); }   // D13

  public enum MatchLevel { Match, MatchByGeometry, MatchPartial, Failed }
  public sealed record MatchRecord(string Mark, string StoreyId, MemberKey? Key, MatchLevel Level, bool UserAccepted,
                                   double? CentroidDistance_mm, double? SectionDeviation_pct, string Reason,
                                   IReadOnlyList<string> CadHandles /*source INSERT(+piece index) or polyline; never SBC_BLK*/,
                                   string? StackId, string? EtabsStoryName);

  public enum Status { Ok /*== gate Pass*/, Warning, Incomplete, DataConflict, MatchFailed, Failed }
  public sealed record Finding(Status Status, string Gate, string Member, string Message, string? Clause, string? Hint);
  public sealed record RunStats(int Members, int Rendered, int Blocked, double Seconds, long PrivateBytes, int ModelLoadScans);
  public sealed record RunResult(Status Overall, IReadOnlyList<Finding> Findings, RunStats Stats);

  // DetailModel (output of Engine, input of Render) — App. C §C1 records plus:
  public sealed record TieZone(double From_mm, double To_mm, double Spacing_mm, ZoneName Name, int Count,
                               double AsvProvidedMajor_mm2_per_m, double AsvProvidedMinor_mm2_per_m);   // for the G5 shear-leg check
  public sealed record LapSpec(double Start_mm, double Length_mm, LapGroup Group, int Dia, bool Coupler /*IS 16172, when lap does not fit*/);
  public sealed record CrankSpec(double Level_mm, double Offset_mm, double Slope /*1:6*/, bool Dowel, int ExtraHoopsEachSide);
  public sealed record ColumnDetail(string Mark, string StackId, StoreyBand Storey, Polygon Section, double Cover_mm, string ExposureClass,
                                    SectionArrangement Arrangement, IReadOnlyList<TieZone> Zones, IReadOnlyList<LapSpec> Laps,
                                    CrankSpec? Crank, double ClearHeight_mm, double? BeamDepthTop_mm, bool Ductile, string RuleSetId,
                                    IReadOnlyList<Finding> Findings, string DesignHash);
  public sealed record WallDetail(string Mark, StoreyBand Storey, IReadOnlyList<Polygon> Legs, int Curtains,
                                  BarSpec VerticalWeb, BarSpec HorizontalWeb, IReadOnlyList<BoundaryElementDetail> Bes,
                                  IReadOnlyList<Opening> Openings, IReadOnlyList<LapSpec> Laps, double NoLapZoneHeight_mm,
                                  bool Special, string RuleSetId, IReadOnlyList<Finding> Findings, string DesignHash);
  public sealed record BarSpec(int Dia, double Spacing_mm, int Faces);
  public sealed record DetailModel(string Schema, string SchemaVersion, IReadOnlyList<ColumnDetail> Columns,
                                   IReadOnlyList<WallDetail> Walls, Provenance DesignProv, string OfficeSettingsVersion);
}
```

`SectionArrangement`, `BarPlacement`, `HoopShape`, `CrossTie`, `BoundaryElementDetail` are the App. C §C1 records, copied verbatim into `Detailer.Contracts` in M1 week 2 (they are part of the `sbc-detailer/detail` schema and versioned with it).

**Mandatory per column record (D27 — never silently use wrong or missing design data):** key, designSection, mode, `Fck`, `Fy`, stations ≥ 1 each with location and (asRequired when `Mode = Design` | pmmRatio when `Mode = Check`), and `AvsMajor`/`AvsMinor`. `Mode = Check` with `asRequired = null` → the section's `RebarTemplate` must be present → else `STATUS: INCOMPLETE "Check-mode column without rebar template"`. `AvsMajor/Minor` missing → `STATUS: INCOMPLETE "shear reinforcement not supplied by <source> — supply Av/s or tie spacing from the design"`; **the Detailer never substitutes code-minimum ties for a missing shear design** (for ductile columns Av/s is the capacity-design shear of IS 13920 7.5). `Fck`/`Fy` missing → `STATUS: INCOMPLETE "material grade not in design record (lap length and Ash depend on it)"`; project defaults may be *offered* in the card for a pre-match preview but are used for an inserted detail only when an engineer accepts them explicitly (`SBCDETAILACCEPT`-style: value, name, time and reason recorded in the `SBC_DETAIL_STATE` Xrecord and printed in the notes block). Optional with a defined fallback: Pu/Mu (null → lap tension check skipped, Warning), geometry hint (null → L3 unavailable, "unverified geometry", Warning), `FullHeightConfinement` (null → not applied, Warning "full-height confinement not stated by design").

**Mandatory per pier record:** key, pierType, legs ≥ 1, `Fck`, `Fy`, stations with flexure.asRequired (or dcRatio) and shear[] (avs or overstressed flag). `boundary[]` empty and no `Required` flag → `STATUS: INCOMPLETE "boundary element decision not supplied by <source>"` → ACTION: run the pier design / Calculator wall check and re-import. **The Detailer does not run the IS 13920 10.4.1 stress check** (the record's Pu/Mu are per-combo values that only the design routine holds for every combination; whether a BE exists is a design decision — D29). `Required = true` with `RequiredLength_mm = null` → `STATUS: INCOMPLETE "BE length not supplied"`. `overstressed = true` blocks that pier (D22).

**Member state (one enum, used identically by the panel chip, the Members grid, the block `STATUS` attribute, the `SBC_DETAIL_STATE` Xrecord and `result.json`):**
```csharp
public enum MemberState { NotRun, Matched, MatchedByGeometry, MatchPartial, MatchFailed, DataConflict, Incomplete, Review, Ready, Done, DoneWithWarnings, Approved, Exploded }
```
Chip words: `NOT RUN`, `MATCHED`, `MATCH-BY-GEOMETRY`, `MATCH PARTIAL`, `MATCH FAILED`, `DATA CONFLICT`, `INCOMPLETE`, `REVIEW`, `READY`, `DONE`, `DONE · WARN`, `APPROVED`, `EXPLODED`. Mapping from gate outcome (§17) to `Finding.Status` and `MemberState`:

| Gate | Pass | Warn | Fail |
|---|---|---|---|
| G0 / G1 | – | `Warning` | `Incomplete` (run blocked) |
| G2 | `Matched` → `Ready` | `MatchedByGeometry` / `MatchPartial` (`Warning`) → `Review` | `MatchFailed` |
| G3 | – | `Warning` | `DataConflict` |
| G4 | – | `Warning` | `Failed` → `Review` ("O/S — redesign" / "Check mode — confirm") |
| G5 | – | `Warning` | `Failed` → `Review` (rule fail, nothing drawn) |
| G6 | – | `Warning` | `Incomplete` |
| G7 | – | `Warning` | `Failed` → `Review` (only when configured to Fail) |
| G8 | – | – | `Failed` → `Review` (block skipped) |

`Status.Ok` == gate Pass (no rename). `result.json` `detail` counts: `{ok, warn, incomplete, conflict, matchFailed, review, blocks, perf}` — the key `failed` is reserved for the Guard crash path (`<CMD> FAILED - unexpected error`) and is always 0 in a passing case; a G5 rule `Fail` is counted under `review`, never under `failed`.

**Versioning.** `schemaVersion` is semver; readers accept same major, warn on newer minor, refuse higher major with `STATUS: INCOMPLETE: file written by newer Detailer`. Xrecord payloads carry the same version in the first `TypedValue`. Adding an optional field = minor; renaming/removing = major. JSON property names camelCase.

**Hashing.** All hashes are SHA-256 over canonical JSON (`CanonicalJson` in Core): properties sorted ordinally, camelCase, InvariantCulture, doubles rounded to 0.01 (mm, mm², kN, MPa) and 0.001 (ratios, %), no whitespace, UTF-8. `DesignHash` = hash(`ColumnDesignRecord` / `WallPierDesignRecord` with `Prov` replaced by `{Source, FileSha256 ?? DesignRunId}`) + `RuleSetId` + `OfficeSettingsVersion`. `GeometryHash` = hash(`CadMemberGeometry` minus `SourceHandles`, `SourceBlockHandle`, `NumberingTextHandle`). `DesignRunId` (SbcDesign) = hash of the design inputs + settings + code version with every timestamp removed. `ExportDate` and `GEN_DATE` never enter a hash, so the same column re-imported on the other host, or on another day, gives the same hash and `SBCDETAILUPDATE` touches nothing. Golden `DetailModel` JSON files are written with the same canonical writer so unit-test diffs are byte-stable.

---

## 14. Column detailing workflow

### 14.1 One column (the M1 story)

Inputs the engineer must already have: a numbered plan (SBCNUMBER run, numbering locked for this storey); the design source for the current revision (**SbcDesign**: design stage run on the imported ETABS forces; **EtabsDesign**: the ETABS table export .xlsx); project settings (seismic category — Mumbai Zone III default, D24; exposure per face, bar preferences, `DesignSource`). fck and fy come from the design record, not from settings (D27).

1. **Load the design once per revision.** Panel → Detail step → "Load design". On `EtabsDesign` the engineer picks the .xlsx; Detailer reads the ~12 fixed tables, parses the units row, and prints one line: "148 column rows, 36 pier rows, 0 unreadable; revision R3; units kN,mm". On `SbcDesign` the Detailer reads the plugin's last design run for the plan and prints "42 columns designed (SbcDesign, plugin 1.15.0, run 2026-10-06 18:40)". Missing table / field / design run → refused with the name shown (`STATUS: INCOMPLETE`).
2. **Match.** For every CAD column mark on every storey, §12 runs. Members grid gets a "Detail" column with the state. On `SbcDesign` every column is L1 MATCH unless the drawing changed after the design run (then DATA CONFLICT at L3).
3. **Pick the column.** Engineer clicks C7 (or selects it in the drawing) and presses "Detail". Detailer gathers: polygon from CAD (B × D, orientation); clear height from storey levels and beam depths; cover from the member's exposure class (D28); As,req, Av/s major/minor, Vu2/Vu3 and fck/fy from the design record (envelope over stations, governing combo named); frame type from the seismic category (D24); design section.
4. **Geometry check (D8).** CAD section vs design section: > 5 % in any dimension or a different shape → `DATA CONFLICT`, column to REVIEW with both values shown, nothing drawn. ≤ 5 % → warning in the strip, proceed with the CAD polygon; As,req is taken unchanged from the design (conservative when CAD is larger; when CAD is smaller by ≤ 5 % the warning text says "design section larger — As,req unverified for CAD size"); min/max % are computed on the CAD Ag.
5. **Arrange bars.** `Sbc.Codes` + Engine choose bar count and diameter from As,req with the office list (12/16/20/25/32, max two dias, corners the larger — D9; a pre-chosen n×Ø from SbcDesign is honoured if geometry allows), check 0.8–6 % (warn > 4 %), min 4 bars, periphery spacing ≤ 300 mm, place bars on the polygon (App. C §C4–C6). Then the tie path and cross-ties so that every corner and every alternate bar sits at a tie corner, no bar is more than 150 mm clear from a *laterally supported bar* [IS 456 26.5.3.2(b)], and in ductile columns consecutive tied legs are ≤ 300 mm c/c with every cross-tie hooked 135°/135° around a *peripheral longitudinal bar* [IS 13920 7.4.x, 7.6.1 note **(verify sub-clause)**]; a cross-tie that engages the hoop only is a code Fail in a ductile member. Tie dia ≥ 8 mm (office; code minimum Ø/4), 135° hooks (App. C §C7). Lap-zone congestion (step 6) → warning "lap-zone congestion → propose couplers or larger section".
6. **Zones along height (App. C §A6, §C10).** Ductile: l0 = max(D, hc/6, 450) top and bottom at s_conf = min(B/4, 6Ø, 100) with Ash per IS 13920 7.6.1(a) (computed by the Detailer — ETABS does not export it); lap zone in the central half with s_lap = min(100 **(verify vs 150)**, s_mid, shear limit) — IS 13920 7.3.2 — two staggered groups ≥ 1.3 Llap apart; mid zone s_mid = min(B/2, 16Ø, 300); joint hoops continued. **Shear check in every zone (D35):** Asv,prov/s = (number of tie legs crossing the shear direction × tie area)/s must be ≥ the governing Av/s from the design record for that direction (major: legs parallel to D; minor: legs parallel to B). Zone spacing = min(detailing limit, shear limit), rounded down to the module; if the shear limit cannot be met with the office max legs → G5 Fail "shear legs insufficient — add legs or redesign". **Lap window** = [max(z0 + hc/4, z0 + l0,bot), min(z1 − hc/4, z1 − l0,top)], with l0 at the top from the *shallowest* soffit (longest hc) and the window from the *deepest* soffit (shortest hc) when beams of different depth frame in (§25 Q-B9). If 2.3·Llap (two groups) does not fit → `E-LAP-NOFIT`: try single-stagger 1.0·Llap offset (still ≤ 50 % at any section); if still no fit → member to REVIEW with ACTION "use mechanical couplers (IS 16172) in the central half — IS 13920 7.3.3" and the elevation shows the coupler level (`LapSpec.Coupler`). Full-height confinement is applied only when `FullHeightConfinement = true` in the design record (IS 13920 8.2–8.5 **(verify)**); a lap that does not fit is never relabelled "confined full height". Non-ductile (Zone II only): lap above floor or central half per setting; ties at min(B, 16Ø, 300). Spacing rounded down to the 25 mm module; 75 mm constructability floor with a warning.
7. **Validate.** Every rule returns Pass/Warn/Fail with its clause (App. C §C11 checks 1–18 plus the shear-leg check). Any Fail → REVIEW, drawing not inserted. Warnings listed, not blocking.
8. **Draw (§16).** One click gives: a section per zone (bars as solid donuts, closed hoops with hooks, cross-ties with hooks, bar-mark labels, B/D dimensions, cover note with exposure class); a column elevation (levels, hc, l0 zones "6-T8@100", lap zone with Llap and stagger, mid zone, joint hoops, first hoop at 50 mm, starter note at foundation); a schedule row (mark, grid, storey band, B×D, "8-T20", %, "T8@100/150/100", lap, grade, DD/G tag, remarks) written to the Members grid and to the Table Plugin schedule. Placement: model space "SBC-DETAILS" area next to the plan on LAYERS.dwg layers (§0 ask (g)). Only the inserted `BlockReference` carries the `SBC_DETAIL_STATE` Xrecord (mark, storey, design hash, source `SbcDesign`/`EtabsDesign`, rule-library version — §9); primitives inside the definition carry nothing; a bar that must be traceable is identified by layer and mark text.
9. **Engineer checks.** (i) The amber/red list (geometry matches, conflicts, warnings); (ii) the section against what they would draw by hand; (iii) the elevation zones against beam depths. Then "Approve" → APPROVED, detail frozen (re-detailing an approved member asks first).

What is blocked when: no numbering lock → whole Detail step disabled with the reason (test builds: §23 dep 1). No design loaded → "Detail" disabled. MATCH FAILED or DATA CONFLICT → that member only. INCOMPLETE (missing Av/s, fck/fy, BE flag/length, beam depth) → that member only. Validation Fail → that member only. Overstressed → that member only ("O/S — redesign", nobody can override, D22). ETABS *Check*-mode row (no As,req) → REVIEW with "designed in Check mode — bars read from ETABS template, confirm" (§25 Q-A1 default).

### 14.2 All columns (M2)

"Detail all" runs the same pipeline per storey over every column in state READY, in **natural mark order (C2 < C10), storeys bottom-up**, skipping blocked ones and listing them at the end: `COMPLETED WITH WARNINGS — 3 MEMBERS REQUIRE ATTENTION` (C7 conflict, C19 match failed, C31 O/S). Identical columns (same polygon, bars, zones, storey band) are grouped into one schedule row and one typical section, as drawing 1162 groups by storey band ("GF to 3F"); the typical-section block belongs to the lowest mark in natural order, its `MEMBERS` attribute lists all grouped marks, and the other marks' schedule rows reference it ("as C2"). Stitching across storeys follows the CAD mark (stack, §12), not the ETABS label. **Size change between storeys:** crank at slope ≤ 1:6, located within the lap window of the lower column, upper bars straight; two extra hoops within 150 mm each side of the bend (SP 34, App. C C-S9); offset > 75 mm → separate dowels lapped Llap into the upper column with Ld (tension, ductile) into the lower; never crank in ductile columns' l0. The crank/dowel geometry is a `CrankSpec` in `DetailModel`, drawn on the elevation and listed in the schedule remarks. L/T/C/+ columns: polygon decomposition into overlapping hoops (App. C §C8) with the IS 13920 Amd 1 note and state REVIEW. Time budget: linear, no model-space rescan per column (§21 perf).

### 14.3 Fit with office practice

Drawings 1071/1153 show each hoop shape as a separate dimensioned piece with hook type and a tie-set table; 1162 shows one column-group per storey band with a section sketch per band and "T8@100/150" callouts. The Detailer copies this format: section sketch per band in the schedule, separate link-detail output from the same tie shapes, and the notes block (codes, cover, lap table, hook rule, l0 rule, design source and revision) from App. C §D6. Bar marks appear as drawing text only; BBS is not touched (D12).

---

## 15. Shear wall detailing workflow

### 15.1 What the design source gives vs what the Detailer computes

From the design source, per (storey, pier):
- `EtabsDesign`: required vertical rebar area / ρv at top and bottom, horizontal rebar mm²/m per leg, O/S flag, boundary-element check per edge (stress vs 0.2 fck → BE yes/no; v18+ may also give BE length and ρ — to confirm from the owner's export), pier geometry per leg, Special/Ordinary flag (v22.6+). ETABS does *not* give bar diameters/spacing, curtains, BE tie size/spacing/legs, confinement height, laps, U-bars, opening trimmers, junction detailing, vertical continuity (App. B §3).
- `SbcDesign`: tw, lw, ρv/ρh required (or bars), BE required flag **and length** from the wall design / Calculator 0.2 fck check (run per combo inside the design, D29), Vu per leg (for τv), ductile flag. Mapped by `SbcDesignSourceAdapter` into the same `WallPierDesignRecord` (`PierType = SbcWall`). On the SbcDesign path a **single-leg** pier is designed as a rectangular wall from `Pier Forces` directly. A **multi-leg** pier is designed as one composite section (legs unioned, axis per `Pier Section Properties`) for flexure/axial and the stress trigger; shear per leg is taken as `V2`/`V3` apportioned by leg stiffness (`t·l³` about the relevant axis) — the apportioning rule is printed in EXPLAIN and the pier is set to REVIEW (never READY) until the owner confirms the rule (§25 Q-B11). If the SBC wall design cannot handle the composite shape in V1, the record is produced with `Status = NotDesigned` and the pier is `INCOMPLETE "multi-leg pier needs ETABS design (set DesignSource=EtabsDesign for walls) or manual input"`.

From CAD: the wall polygon per storey (SW/LW closed polylines or the two-parallel-polyline rule), thickness, wall openings (§10 step 6 — not the OPENING slab cut-outs), storey heights, adjoining columns and walls.

The Detailer (`Sbc.Codes` wall rules + `WallArranger`) computes: curtains (two always, office default — a single curtain only when tw ≤ 200 **and** τv = Vu/(0.8·lw·tw) ≤ 0.25√fck from the design record's Vu; Vu absent → two curtains with the note "τv not supplied" — IS 13920:2016 10.1.5, §25 Q-B7), vertical and horizontal bar dia and spacing each face (ρ ≥ 0.25 %; spacing ≤ min(lw/5, 3tw, 450); dia ≤ tw/10), BE layout at each end the design source flags (detailed exactly as a ductile column by the column engine; BE length from the source only), end bars where no BE (4-T12 two layers, office practice), U-bars at free ends, horizontal-bar anchorage Ld into BE cores and columns (U-bar or 135° hook around the BE corner bar; web horizontals are never counted as BE confinement), **laps in three alternating groups (≤ 1/3 at a section), adjacent splices offset ≥ max(600 mm, Llap); no laps within the no-lap zone of height lw above the wall base (IS 13920 10.9.2 (verify))** — if the first lap level would fall inside that zone the Detailer emits `E-WALL-LAP-HINGE` and proposes either starter bars from the raft of length lw + Llap or couplers (IS 16172); it never silently laps in the hinge zone (D34), extra bars at openings (area equal to interrupted bars + 2-T12 diagonals, extended Ld), horizontal-bar shear check per leg (Ah,prov/s ≥ `AvsHoriz_mm2_per_m`, G5 — D35), zone layout along height. Ordinary (non-ductile, Zone II only) walls use the IS 456 32.5 table (App. C W-R7).

### 15.2 One wall

1. **Load** the same design set as for columns; pier records are read in the same pass.
2. **Match.** CAD SW/LW mark + storey → (Story, Pier label) via §12 L2. Piers with several legs (L/C/T cores) match as one pier to N CAD wall segments by geometry union; each CAD leg must land on one pier leg (70 % overlap, thickness 10 %/25 mm). A leg that does not match blocks the whole pier. Label changes between storeys are handled by stitching on the CAD mark; the label is shown, not trusted. On `SbcDesign` the mark matches directly.
3. **Pick and "Detail".** Inputs: polygon with openings, tw, lw, storey levels, ρv/ρh and Vu per leg, BE flags per edge **with length** (either missing → `STATUS: INCOMPLETE`, D29), Special/Ordinary, fck/fy from the record, cover from the member's exposure class per face (internal → moderate: walls 30; external/coastal-facing → severe: walls 45; below ground / water-retaining → 50 — IS 456 Table 16, D28).
4. **Geometry check.** CAD thickness or leg length vs design pier geometry > 5 % → `DATA CONFLICT`.
5. **Web steel.** Bars and spacing per face, vertical and horizontal, rounded down to 25 mm; ρv ≥ ρh **(verify IS 13920:2016 10.2.x; applies at least for hw/lw ≤ 2)**; same dia both faces; Ah,prov/s ≥ required per leg.
6. **Boundary elements.** Where the source flags one: BE length from the source (never derived by the Detailer; an office rule for lbe may be entered in OfficeSettings only after explicit owner confirmation, never as a silent default, and is then printed in the notes — §25 Q-B6), BE bars 0.8–6 % (warn > 4 %), confining ties at s_conf full storey height, cross-ties, hooks — a BE is literally a column section inside the wall polygon with its own closed hoops. BE bars are separate marks; web vertical bars terminate at the BE face with Ld into the BE core unless `PierType = UniformReinforcing`, in which case the uniform bars continue through and the BE adds only the extra bars needed to reach `RequiredRho` over lbe·tw. Where not required: concentrated end bars + links at web spacing.
7. **Openings.** Each opening wider than the office threshold (300 mm default) gets trimmer bars both faces, both directions, Ld extensions dimensioned; a lintel between two piers that the source designed as a coupling beam is marked "coupling beam — not detailed" and listed (out of scope).
8. **Junctions.** L/C/T walls are one polygon: corner bars both faces, horizontal bars of each leg lapped into the other, U-bars at free ends. A column embedded in or touching the wall is detailed as a column; wall horizontals anchored Ld into its core; separate marks.
9. **Validate, draw, check, approve** as for columns. Deliverables: a section per storey band (tw, curtains, "T12@150 c/c EF", "T10@200 c/c EF", BE box with bars and links, U-bars, cover); a wall elevation (levels, three lap groups, no-lap zone above base, BE link zones, opening trimmers with Ld, horizontal laps staggered); a BE schedule row in the column-schedule format; mark, lw and a plan key showing flange relations.
10. **All walls** = the same batch command; multi-leg cores are one item.

What the engineer checks: the BE decision per end per storey (the one place where ETABS versions differ in what they export), the opening threshold, whether a lintel is a coupling beam, the multi-leg shear apportioning (REVIEW until Q-B11 is answered). What is blocked: everything in 14.1 plus "BE required but length not supplied" (`STATUS: INCOMPLETE`), "BE decision not supplied" (`STATUS: INCOMPLETE`), and any pier whose legs did not all match.

---

## 16. Drawing generation workflow

1. `DetailBuilder` produces the `DetailModel`; `GatePipeline` runs; only members with `Status ≤ Warning` are rendered.
2. `LayerMap` resolves Detailer layers from `LAYERS.dwg` (embedded; built-in copy if absent). New layers to add: `SBC-DET-CONC` (outline), `SBC-DET-BAR`, `SBC-DET-LINK`, `SBC-DET-TEXT`, `SBC-DET-DIM`, `SBC-DET-LEVEL`, `SBC-DET-HATCH`, `SBC-DET-NOTE`, `SBC-WALL-OPEN` (input, §10), `SBC-HOLD` (already planned). The `SBC-DET-*` prefix is what the `Model.Load` scan filter skips **(verify Model.Load filter)**. Text and dim styles: the office ones from LAYERS.dwg, created if missing. Only `LayerTableRecord/TextStyleTableRecord/DimStyleTableRecord` creation.
3. **Blocks per detail.** Each detail is a block definition `SBC_DET_<KIND>_<MARK>_<VIEW>_<NNN>` (e.g. `SBC_DET_COL_C12_SEC_001`, `SBC_DET_COL_C12_ELV_001`; walls `SBC_DET_WALL_SW2_SEC_001`) where `NNN` is a per-mark sequence stored in the NOD. **The storey band is not part of the name**: band, storey ids and grouped member list are attributes `BAND`, `STOREYS`, `MEMBERS` plus `MARK`, `STATUS` (only `MARK` visible); `DESIGN_HASH` and `GEN_DATE` live in the Xrecord, not in attributes. Names are sanitised to `[A-Z0-9_-]`, ≤ 64 chars (storey text like "STOREY 3" would otherwise be illegal in a block name). Regeneration locates blocks by the `SBC_DETAIL_STATE` Xrecord key (Mark, StackId, View) and the NOD entry, never by name, so a band change (GF–3F becoming GF–2F) redefines in place instead of orphaning a block. A block is the unit of regeneration: redefine the definition, keep the reference and its position.
4. **Insertion: model space "SBC-DETAILS" area, not a layout, for V1.** Reasons: `Sheets.Run` has the O(n²) issue; office drawings (1071/1153/1162) are model-space details composed onto sheets; layouts/viewports are "verify" on both clone hosts while model-space primitives are solid (App. D §3). Area origin is a setting (default: right of the plan bounding box + 2 × plan width), grid cells per detail sized by storey count. On update the existing reference is kept in place (its current `Position`/`Rotation`/`ScaleFactors` are read, not the Xrecord); the Xrecord stores only the grid cell used at first insertion so a re-insert after removal lands in the same cell. Placing detail blocks on layouts is V1.5, after the Sheets step exposes its API; nothing in V1 calls `Sheets.Run`.
5. **What is drawn.** Every dimension and spacing in the section/elevation is read from `DetailModel`; the renderer holds no code constant and no office constant (ReflectHarness scans `Detailer.Render` for numeric literals > 10 except line weights/text heights). The items below describe *what is printed*, not where the numbers come from.
   - *Column section* (one per storey band of a stack; identical bands merged): outline polygon; bars as **solid donuts** — a closed `Polyline` of two arc segments (bulge 1) with constant width = bar radius, on `SBC-DET-BAR`; no `Hatch` per bar — with mark text; hoops as closed polylines on the tie path with 135° hooks drawn as short `Arc`+`Line` (hook geometry from `Sbc.Codes.HoopHook`); cross-ties as lines with hooks; cover note with exposure class; `AlignedDimension` B and D; callout "8-T20 / T8@100 (l0) / T8@150 (mid)" (App. C §D1); "DD"/"G" tag; band label. `Hatch` is used only for concrete shading if the office standard needs it, one hatch per section.
   - *Column elevation* (per stack): storey levels (`SBC-DET-LEVEL` lines + text), both beam faces where depths differ, hc, l0 zones dimensioned with "6-T8@100", lap zone (from `LapSpec`) with Llap and group A/B stagger or the coupler level, mid zone, joint hoops note, first hoop position, crank/dowel at section change (from `CrankSpec`, incl. the extra hoops at the bend), termination at roof, starter note at foundation: "Starter bars: embed Ld,tension = <value> + 90° leg ≥ 16Ø on mat; confining hoops @ <s_conf> continued 300 mm into footing (IS 13920 8.x **(verify)**) — coordinate with foundation drawing". Bars as lines; ties as short lines per zone (beyond 40 ties, a broken-line symbol and the count, office style).
   - *Wall section* (per storey): leg outlines, curtains, vertical bars as donuts, horizontal bars as lines, BE boxes with bars + links (same `SectionDrawer` as a column), U-bars, cover, "T12@150 c/c EF" callouts, lw/tw dims.
   - *Wall elevation*: levels, web spacing text, three lap groups, no-lap zone above base, BE link zones, opening trimmers with Ld, horizontal lap stagger.
   - *Schedule row*: written in the **Table Plugin text format** (`SbcCalc\UI\TablePlugin.cs` writer reused by port) and imported with `TPIMPORT`, exactly as the existing schedules — mark, band, size, bars, ties per zone, lap, grade, remarks, same rows as the Members grid (D32). The lines + text fallback (`SBC_DET_SCHEDULE` block) is used only if the M0 check of `TPIMPORT` on GstarCAD 2026 (GCAD) fails (logged as a D-row).
   - *Notes block*: codes, cover set by exposure, lap table with the line "corner-bar factor 1.4 applied / NOT applied (office decision, IS 456 26.2.5.1(c))", hook rule, l0 rule, seismic category and rule set, "detailed from <SbcDesign run | ETABS export Tower-A_R3 2026-10-05> sha …", office settings version, tolerances used, every accepted value / override with name and reason (App. C §D6).
6. **Primitive whitelist (D5).** `Line`, `Arc`, `Circle`, `Polyline` (bulges, constant width), `DBText`, `MText` (only `\P`, `\H`, `\S`, `%%c/%%d/%%p`), `AlignedDimension`, `RotatedDimension`, `RadialDimension`, classic `Leader`, `Hatch` simple loops (≤ 1 per section), `BlockReference` + `AttributeReference`, `Wipeout`, `Xrecord`/`DBDictionary` (no XData, §9). **Never** `Table` entity, `MLeader`, dynamic-block authoring, `Field`, managed Ribbon, `PlotEngine`, Overrules, COM, `Internal.*`, P/Invoke (App. D §4).
7. **Regeneration policy.** Every detail block stores `DesignHash`, `GeometryHash` and `DefinitionHash` (§13 Hashing, §9). On `SBCDETAILUPDATE`: unchanged → untouched; changed → definition redefined in place, then `RecordGraphicsModified(true)` on every reference and its attributes re-synced (attribute references are not updated by a redefinition on either host); member now MATCH FAILED / DATA CONFLICT → block **not deleted**, `STATUS` attribute set and a red `SBC-HOLD` tag "HOLD-D07 DATA CHANGED" placed on it; hand-edited blocks (`DefinitionHash` differs) → never overwritten, reported "C12 section edited by hand — skipped (use SBCDETAILFORCE)". **Exploded or missing references:** if the `SBC_DETAILER` NOD lists a detail whose `BlockReference` handle no longer exists: (a) if the definition still exists and is referenced 0 times → state `EXPLODED` — never re-insert, report "C12 section exploded by hand — skipped (SBCDETAILFORCE re-inserts next to it)", keep the NOD entry; (b) if another reference of the same definition exists (user COPY) → the reference named in the NOD is managed; if that one is gone, the lowest-handle remaining one becomes managed and the rest are "user copy — not managed". Orphaned `*D`/`*U` anonymous blocks created by dimension regeneration are purged at the end of the command. **Transaction model (one rule for the whole plan):** one transaction per member, committed when that member's entities are complete; a render error aborts *that member's* transaction (nothing half-inserted for it), the member gets a G8 finding and state REVIEW, and the run continues with the next member, ending `COMPLETED WITH WARNINGS`. Each member's commit is its own undo group (`SBCDETAIL` on one column = one undo step, tested on both hosts; a batch of 42 = 42 undo steps, listed in the report). Never `Editor.Command`; no `Regen` until the end of the command.

---

## 17. Validation system

Gates run in order. A `fail` blocks *that member* (never the whole run) except G0/G1 which block the run. Each gate yields `Finding`s with Pass / Warn / Fail and the clause tag where applicable.

| # | Gate | Checks | Fail blocks | Who can override |
|---|---|---|---|---|
| G0 Prerequisites | numbering locked (marks exist, no "marks changed" pending), units OK, storeys defined with levels, rule set selected, `DesignSource` set, LAYERS.dwg layers available | whole run | nobody |
| G1 Design input | source loaded; mandatory tables (EtabsDesign, incl. `Program Control` and the force tables on SbcDesign) or design run (SbcDesign) present; units row parsed per column; schema version; design code read from the design-preferences tables = IS 456:2000; completeness (design rows vs assignments, §11.2 step 3; shortfall > 50 % blocks the run); SbcDesign run not older than the latest ETABS import; per-record mandatory fields (§13: Av/s, fck, fy, BE flag + length) | whole run (missing table/run, wrong code, > 50 % shortfall) / member (missing field → `STATUS: INCOMPLETE`) | nobody; an engineer may *accept* an offered value explicitly (recorded, §13) |
| G2 Match | §12 levels; kind mismatch (L2b); ambiguous geometry; stack gaps | member (`MATCH FAILED`) | engineer may *accept* MATCH-BY-GEOMETRY (D18); cannot accept FAILED |
| G3 Geometry conflict (D8) | CAD section vs design section > 5 % any dimension or different shape → `DATA CONFLICT`; ≤ 5 % → Warn; rotation mismatch > 5° (or a match only under the 90° swap) → DATA CONFLICT; **position**: centroid of the CAD section vs ETABS I-point (after cardinal-point offset, `Frame Assignments - Summary` `Cardinal Point`/`Offset`, **verify**) > 100 mm → `DATA CONFLICT (position)`, 50–100 mm → Warn — applies to every match level including L1 and the SbcDesign path (LabelMap X/Y when connectivity tables are absent); storey height CAD vs ETABS > 50 mm → Warn | member | engineer (role setting) with recorded reason, stored in Xrecord and printed in notes (D18) |
| G4 Design status | Overstressed / "O/S", PMM ratio > 1, NotDesigned, Check-mode without template, FrameType assumed, WallType assumed | member (fail) / Warn (assumed) | nobody for O/S (D22); assumed flags Warn only |
| G5 Rules | App. C §C11 checks 1–18 via `IColumnRules.Validate` / `IWallRules.Validate`: clear spacing (including the lapped pair treated as 2Ø wide), steel % including lap-zone % = p·(1 + lapped fraction) ≤ 6 % [IS 456 26.5.3.1(a)], min bars, periphery spacing, support rule (corner + alternate bars at a tie corner, ≤ 150 mm to a supported bar), **ductile: tied legs ≤ 300 mm c/c and cross-ties 135°/135° around a peripheral bar — `EngagesHoopOnly` cross-tie in a ductile member → Fail**, tie Ø, pitch, **Asv/s provided ≥ Av/s required, both directions, every zone [IS 456 40.4 / IS 13920 7.5] — Fail blocks the member (D35)**, Ash provided ≥ required, hooks, lap window/fraction/stagger, laps outside l0 and outside the wall no-lap zone, crank in the lower lap window with extra hoops, parity, limb thickness, cover vs exposure class; walls: dia/spacing/ρ/curtains (τv criterion), Ah/s provided ≥ `AvsHoriz_mm2_per_m` per leg, lap fraction ≤ 1/3 | member on code `Fail`; office-rule breaches Warn | code fails: nobody; office warnings: engineer |
| G6 Completeness | beam depth at column top unknown, wall opening heights unknown, **Av/s absent, fck/fy absent, BE flag or BE length absent, SD polygon absent** → `STATUS: INCOMPLETE` (never defaulted, D27); confinement Ash computed by Detailer, `FullHeightConfinement` not stated → Warn | member → `STATUS: INCOMPLETE` | user supplies the value in the design source or (beam depth, opening heights, exposure) in settings/grid; design values only via explicit accept (§13) |
| G7 Constructability | cross-ties per set > office max, confining spacing < 75, lap does not fit (E-LAP-NOFIT → couplers), lap-zone congestion, > 2 dias | Warn (configurable to Fail) | engineer |
| G8 Render | block name collision, hand-edited block (`DefinitionHash`), exploded reference, SBC-DETAILS area overlap, text style missing, host capability flag missing, member render error | member (skipped; run continues) | user via SBCDETAILFORCE |

Outputs: Findings strip in the panel (red / amber counts), `MATCH SUMMARY` line, `detail_report.txt` + `<dwg>.sbcdetail.json` (results folder, §9), and HOLD tags in the drawing for anything blocking GFC. Integration with existing QA: any `Fail` makes the drawing NOT FOR GFC until resolved or waived through the existing Waive modal. Hand-calc verification: three test columns (low/typical/high As) in `handcalc\` with clause references; bar count, tie spacing per zone, l0, Llap and Ash must agree.

---

## 18. Error handling

- **Guard pattern.** Every command body goes through the existing guard, confirmed as `CmdGuard.Run(name, body)` / `CmdGuard.Safe(what, Action)` (App. E §8), written here as `CmdGuard.Run("SBCDETAIL", () => DetailWorkflow.X(...))`. Unexpected exceptions keep the current behaviour (crash.log, "SBCDETAIL FAILED - unexpected error ... results are NOT complete"). Expected outcomes are *returned*, not thrown: `RunResult(Status Overall, IReadOnlyList<Finding> Findings, RunStats Stats)` (§13); the guard prints the summary and the perf line.
- **Guard outcome → end-state string** (exact strings, also in `result.json`):

  | Guard outcome | Printed | result.json |
  |---|---|---|
  | `Completed` | `COMPLETED ✓` | exit 0 |
  | `CompletedWithWarnings` | `COMPLETED WITH WARNINGS — n MEMBERS REQUIRE ATTENTION` followed by one member per line | exit 0, counts |
  | `Blocked` (G0/G1 fail, nothing done) | `STATUS: INCOMPLETE — <gate> — <reason>` (nothing inserted) | exit 2 |
  | `Failed` (unexpected exception) | `<CMD> FAILED - unexpected error ... results are NOT complete` (existing Guard wording) | exit 1, `failed` = 1 |

  `SBCDETAIL DONE: …` is the counts line printed *before* the end state, never instead of it.
- **Status precedence** per member: `Failed > MatchFailed > DataConflict > Incomplete > Warning > Ok` (`Finding.Status`); the member's `MemberState` follows the §13 mapping table. Per run: the worst member status plus counts.
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
- No MessageBox anywhere in the Detailer (Concept 2). Modal only for `SBCDETAILACCEPT` reason entry (reuses the Waive modal) and the two destructive confirmations (`SBCDETAILREMOVE` "Remove inserted details for n members?", `SBCDETAILFORCE` "Re-detail will replace n existing details — continue?"), default No.
- Every `Finding` carries `Hint` (actionable) and `Clause`; the EXPLAIN drawer shows the rule value and clause from `CodeValues`.
- Import errors name table, sheet, row and column (`"Concrete Column Design Summary" row 37 col "Rebar Area": "N/A" → null (Check mode?)`).
- Render errors abort *that member's* transaction (§16.7) — never a half-inserted block for that member — produce a G8 finding, and the run continues; the end state is `COMPLETED WITH WARNINGS`, not `FAILED`.
- Esc at any prompt cancels cleanly (`SBCDETAIL cancelled`).

---

## 19. UI / workflow

### 19.1 Where the Detailer lives

Not a new window. One more step inside the approved Concept 2 docked panel (340 px, right, auto-hide, dark-first, tabs Workflow / Members / Project). Rules carried over from ui_a: no auto-popups, inline strips only (`InlineStrip.cs`: amber = confirm, red = error), `Guard.cs` around every command and UI event, modals only for destructive actions.

| Tab | What the Detailer adds |
|---|---|
| Workflow | New step 4 **"Detail"**, after QA and before Sheets (Number → Design → QA → **Detail** → Sheets → Issue GFC). State chip (NOT STARTED / RUNNING 67% / DONE / 3 ATTENTION); expands into the Detailer sub-view. |
| Members | One extra column **Detail** with the member's state chip (§13 `MemberState`) and an **Exposure** column (internal / external / below-ground, pre-filled from the plan's perimeter test, D28); row action "Detail this member". Nothing else changes. |
| Project | Group **Detailer defaults** under Settings (19.7); row **Design source** (`SbcDesign` / `EtabsDesign`, loaded file or run, date, mark→label map status); row **Seismic category** (Zone II / III / IV / V; default III, Mumbai — D24) showing the rule set it selects; "non-ductile" is shown only for Zone II. |
| Status bar | Existing "SBC Step n/7", "QA n RED", "NOT FOR GFC" plus **"DET n/N · k ATTN"**. Click opens the Detail step. (Status-bar items are ZWCAD-only until the GstarCAD route is verified; on GstarCAD the count is shown in the panel strip.) |

The Detail step is **locked** (grey; strip "Numbering not locked — run SBCNUMBER and lock marks first (Project tab)") until the 1.14.2 numbering lock is set (test-build exception: §23 dep 1).

### 19.2 Detailer sub-view

Five regions, top to bottom: (1) **Source strip** — `CAD  review.dwg  storey 3  ✓ 42 columns 6 walls` and `DESIGN  SbcDesign run 2026-10-06 18:40  ✓ 42 columns` or `DESIGN  ETABS results_2026-10-04.xlsx  ✓ 48 frames  map 42/42`; amber if older than the DWG save, red if missing. (2) **Action row** — `[ Detail selected ] [ Detail all ] [ Match only ] [ Report ]`. (3) **Progress list** (19.5). (4) **Attention list** — only after COMPLETED WITH WARNINGS or FAILED; click selects, zooms, opens the card. (5) **Member list** — one row per column/wall of the current storey: mark, size, status chip, filter bar (All / Attention / Done / Not run / Walls / Columns, text filter).

### 19.3 Commands and ribbon

See §21 for the command table (names provisional). **Ribbon**: one button **"Detail"** added to the 6-button "SBC" tab (becomes 7; obeys the "ribbon off" setting). On GstarCAD ≤ 2025 there is no managed ribbon API, so the button comes from the partial CUIX/menu route, which also serves ZWCAD so there is one route (D20). The CUIX and installer keys ship in M4; M0–M3 owner testing uses NETLOAD from `3 BETA\` and the command line.

### 19.4 One-column milestone flow

1. User types `SBCDETAIL`, picks a column (or answers `M` and types the mark). No command takes inline arguments on either host (D26).
2. Command line `Select column outline or [All/Mark/Storey] <pick>:` — accept a polyline, an `SBC_BLK` copy, or an INSERT on a structural layer; an INSERT (which is what the pick returns for a block-drawn column, by draw order) is resolved through the StructuralBlocks source-handle map (§7) to the member under the pick point; an INSERT with several members under the cursor prompts `Several members in block: [C7/C8]`. Esc cancels cleanly.
3. Panel switches to the Detail step; progress list runs READING CAD ✓ → READING GEOMETRY ✓ → READING DESIGN DATA ✓ → MATCHING MEMBERS ✓.
4. Panel shows the **match card** (CAD vs design side by side, 19.6). On MATCH FAILED or DATA CONFLICT the flow stops; the card shows the ACTION lines; nothing inserted.
5. If matched, `[ Detail ]` is live (Enter). GENERATING COLUMN LINKS → GENERATING DRAWINGS → VALIDATING → COMPLETED ✓.
6. The detail blocks (section + elevation) and the schedule row are inserted at the office detail location (setting: default area / ask). Drawing zooms to it; the row chip becomes DONE; the card gains `[ Zoom ] [ Explain ] [ Re-detail ] [ Approve ]`.
7. Undo is one step for the one-column command — tested on both hosts.

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

Rows are fixed and never reorder. Pending = dash, running = percentage + bar, done = ✓, failed = ✗ red. The same lines echo to the command line (`[SBC-DET] GENERATING COLUMN LINKS 67% (28/42)`). Member chips (the §13 `MemberState` words, no others): `NOT RUN` (grey), `MATCHED` (navy), `MATCH-BY-GEOMETRY` (amber), `MATCH PARTIAL` (amber), `MATCH FAILED` (red), `DATA CONFLICT` (red), `INCOMPLETE` (amber), `REVIEW` (amber), `READY` (navy), `DONE` (gold tick on navy), `DONE · WARN`, `APPROVED`, `EXPLODED` (grey). Colours are the existing brand ones (navy #1F3B73, gold #C2A620, amber, red); no green is introduced. Status is never conveyed by colour alone — every chip carries its word.

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

All persisted in the existing INI so regression cases can pin them. Key list (`settings_det.ini` uses exactly these):

```
[Detailer]
DesignSource=SbcDesign|EtabsDesign ; DesignFile= ; SeismicCategory=ZoneII|ZoneIII|ZoneIV|ZoneV (default ZoneIII)
RuleSet=IS456_2000_IS13920_2016A1 (derived from SeismicCategory; IS456_Only only for ZoneII)
EtabsTower= ; UlsComboRegex=^(U|ULS|DCon|COMB)
MatchCentroidMm=100 ; MatchSectionPct=10 ; ConflictPct=5 ; StoreyTolMm=50 ; RotationTolDeg=5 ; PierLegOverlapPct=70 ; PierLegThickPct=10 ; PierLegThickMm=25 ; PositionTolMm=100
PreferredDias=12,16,20,25,32 ; MaxDias=2 ; MinTieDia=8 ; TieDiaAtMain32=10 ; HookDeg=135 ; SpacingModuleMm=25 ; ConfiningFloorMm=75
CoverColumnModerateMm=40 ; CoverColumnSevereMm=45 ; CoverWallModerateMm=30 ; CoverWallSevereMm=45 ; CoverBelowGroundMm=50 (IS 456 Table 16; a bare project cover number does not exist — D28)
LapTable=office ; CornerLapFactor=1.4 ; GravityLapLocation=CentralHalf ; CrankMaxOffsetMm=75 ; KickerMm=150
CurtainsPolicy=TwoAlways ; CurtainsMinTwMm=200 ; WallLapFraction=0.333 ; OpeningThresholdMm=300 ; BeLengthRule= (empty = none; set only after owner confirmation, Q-B6)
Placement=Default|Ask ; AreaOriginX= ; AreaOriginY= ; Scale=1 ; TextStyle= ; DimStyle= ; ResultsFolder= ; ScheduleWriter=TablePlugin|LinesText
Role=Draughtsman|Engineer ; AllowUnlockedMarks=0 (test builds only, §23 dep 1)
```

Changing a setting after a run marks affected members `NOT RUN` with an amber strip "Defaults changed — re-detail 42 members".

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

**Library.** `Sbc.Codes` (netstandard2.0, BCL only — D21): `Is456.cs` ported from `SbcCalc\Engine\Is456.cs` (τbd, Ld, lap table, cover Tables 16/16A, min/max steel, τc) with a `PortedFrom` comment and commit hash; new `Is13920.cs` (confinement spacing, Ash, l0, hooks, leg spacing, lap window, wall clauses); `OfficeSettings` (plain record, versioned, printed in the notes block; JSON parsing in Core); `CodeValueCatalogue` that enumerates every constant for a "rules in force" sheet. τbd / lap values stop at the last grade verified in `Is456.cs` (M40); for higher grades (M50–M70 towers) the M40 value (36Ø) is used and the notes print "lap per M40 (τbd for > M40 not verified)" — never extrapolated.

**Interfaces** (App. C §E2): `IColumnRules` (MinSteelPct, MaxSteelPct, MinBars, MinBarDia, MaxPeripherySpacing, MinClearSpacing, NominalCover(exposure), MinTieDia, TiePitchGeneral/Mid, MaxClearToSupportedBar, MaxHoopLegSpacing, ConfiningZoneLength, ConfiningSpacing, AshRect, AshCirc, HoopHook, LapLength, LapHoopSpacing, MaxLappedFraction, LapWindow, StaggerDistance, Crank, JointHoops, FullHeightConfinementSpacing, ShearLegsRequired(AvsRequired, tieArea, s), Validate); `IWallRules` (MinThickness, MinReinfPct, Curtains(tw, tauV, fck — `tauV` non-nullable on the single-curtain path), MaxBarDia, MaxSpacing, BeSteelPct, HorizontalBarAnchorage, MaxLappedFraction, LapStagger, NoLapZoneHeight(lw, hw), OpeningReinforcement, Validate); `IRuleSet` (editions, values, columns, walls, office). **`IWallRules.BoundaryElementRequired` is deliberately absent** — the BE trigger (IS 13920 10.4.1) belongs to the design routine / Calculator wall check, not to the Detailer (D29). Implementations: `RuleSet_IS456_2000_IS13920_2016A1` (Zones III–V, default) and `RuleSet_IS456_Only` (Zone II only). The arrangement algorithm takes `ArrangementLimits` built from `IRuleSet`; it never calls rules directly.

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
| WALL.LAP_MAX_FRACTION / LAP_STAGGER | IS 13920 10.9.x | 1/3 / max(600 mm, Llap) | (verify) |
| WALL.NO_LAP_ZONE | IS 13920 10.9.2 (1993: 9.9.2) | lw above base | (verify) |
| COL.SHEAR_LEGS | IS 456 40.4 / IS 13920 7.5 | Asv,prov/s ≥ Av/s required, each direction, each zone | V (design value from source) |
| WALL.OPENING_REINF | IS 13920 10.6.1 | = interrupted As, + Ld | (verify number) |
| WALL.END_BARS_MIN | SP 34 / 13920 10.1.x | 4-T12 two layers | (verify) |

The full catalogue, the "(verify against BIS copy)" list (App. C §G, 21 items) and the engineering questions F-1…F-23 are in Appendix C. Every "(verify)" value is implemented with the stated number and carried as a pending unit test; the release note lists what is still unverified. IS 13920 Amendment 2 (2021) is not reviewed until the BIS copy is supplied.

**Ductile policy (D24, which replaces D14 and the superseded D10).** IS 13920:2016 cl. 1.1.1 and IS 1893-1:2016 cl. 6.4 **(verify)** make IS 13920 mandatory for all RC structures in Zones III–V; there are no "gravity-only small buildings" in Mumbai for which `RuleSet_IS456_Only` is lawful. So there is no free `Ductile` toggle: the project carries a **seismic design category** (`SeismicCategory`, default Zone III for Mumbai) and the rule set follows from it — Zones III–V → `RuleSet_IS456_2000_IS13920_2016A1`, locked; Zone II → `RuleSet_IS456_Only` permitted. An override in Zone III–V requires the engineer role, a recorded reason stored in the Xrecord, and a notes-block line "DETAILED TO IS 456 ONLY — ENGINEER OVERRIDE <name/date>"; the drawing stays NOT FOR GFC. 12 mm main bars and 90° hooks are Zone II options only. ETABS "Ductile" frame type, when present, is shown as a check against the project category; a mismatch is a WARNING.

**Testing.** One xUnit test per RuleId with the value above (the test file doubles as the human-readable catalogue); the Calculator's 144 Excel cases re-run for the ported functions to prove byte-equivalence; a failing test after a code update says exactly which drawing outputs change.

---

## 21. Integration with the existing CAD / plugin

**Commands** (in `Commands.cs`, `SBT*` twins for the test build, all through `Guard`).

**Names provisional (D26).** Before any command is registered, grep `Commands.cs` and `Docs\SBC_Command_Reference.md` §1 for `DETAIL`, `SECT`, `LINK` (Appendix A names a "Details" command group whose command names are unknown). If any existing command starts with `SBCDETAIL`, the Detailer family is renamed `SBCRD*` (`SBCRDIMPORT`, `SBCRDMATCH`, `SBCRD`, `SBCRDUPDATE`, `SBCRDACCEPT`, `SBCRDREPORT`, `SBCRDFORCE`, `SBCRDREMOVE`, `SBCRDBATCH`) and the `SBT*` twins follow; the decision is recorded as a D-row in V1.1. Every Detailer `[CommandMethod]` uses the explicit command group `SBCDET` so the host's command table reports it as such. **No command takes inline arguments** — a `[CommandMethod]` receives none, and `SBCDETAIL C7` typed on the command line would run `SBCDETAIL` and then try `C7` as a command on both hosts. Arguments come from `Editor.GetString` / `GetKeywords` / `GetEntity` or `CommandFlags.UsePickSet` (a pre-selected outline), which also keeps the `SBT` twins scriptable via `/b` scripts (each prompt answer on its own line).

| Command | Does | Milestone |
|---|---|---|
| `SBCDETAILIMPORT` | Prompts `Design file:` (`FILEDIA 0` in scripts; blank = last design run on `SbcDesign`). Loads the design source through the Phase 2.5 reader (never its own parser), runs G1, stores provenance; prints tables/records found. | M1 |
| `SBCDETAILMATCH` | Runs §12, writes the MatchTable, prints MATCH SUMMARY + report. | M1 |
| `SBCDETAIL` | `[CommandMethod("SBCDET","SBCDETAIL", CommandFlags.Modal|CommandFlags.UsePickSet)]`; prompt `Select column outline or [All/Mark/Storey] <pick>:`; `Mark` → `GetString`. Match (if stale) → engine → gates → render for the selected members. Walls in M3. | M1 |
| `SBCDETAILBATCH` | Non-interactive driver for regression (`/b` script, App. D §5): prompts `Job file:` or reads the `SBC_DET_JOB` environment variable when set. No UI; prints the same progress lines; writes `result.json`. M1 ships the minimal driver (import + match + detail for listed marks); M2 completes it (Detail all, Stop-after-current, attention list). `job.json` schema: `{ schemaVersion, designSource, designFile, settingsIni, marks: [ ] | "ALL", outputs: { resultJson, dxf } }`. | M1 (minimal) / M2 |
| `SBCDETAILUPDATE` | Regeneration policy §16.7 for all stored details. | M2 |
| `SBCDETAILACCEPT` | Prompts `Mark to accept:` then the reason (Waive modal). Accept MATCH-BY-GEOMETRY / override DATA CONFLICT / accept an offered value for a missing design field (§13) — engineer role, recorded in the Xrecord and the notes (D18). | M2 |
| `SBCDETAILFORCE` | Prompts for marks (`[All/Mark]`); re-detail even when the block was hand-edited, exploded or STATUS is APPROVED; asks the destructive confirmation; engineer role. | M2 |
| `SBCDETAILREMOVE` | Prompts for marks (`[All/Mark]`); deletes inserted detail blocks and their `SBC_DETAIL_STATE` Xrecords; match table untouched; asks the destructive confirmation. | M2 |
| `SBCDETAILREPORT` | Writes `detail_report.txt`, the sidecar JSON and the notes block. (HTML report in the SBCREPORT style: M4 if time remains, else backlog.) | M2 |

SBT twins skip the panel, never prompt beyond scripted answers, and write `result.json`, as `SBTNUMBER`/`SBTDESIGN` are assumed to do **(assumed — verify in inventory: how SBT twins differ from SBC commands)**.

**Workflow tab.** Step 4 "Detail", after QA and before Sheets (Number → Design → QA → Detail → Sheets → Issue GFC): buttons Import / Match / Detail / Update, state chip, inline strips. Members grid gets columns `Design key`, `Match`, `Detail status`, `Exposure`. The status-bar "QA n RED" counts Detailer fails.

**Settings.** `SBCSET` INI section `[Detailer]` (19.7), also per regression case INI.

**Lane, branch, worktree (D17).** Lane `det_0` (M0–M1), then `det_1` (M2), `det_2` (M3–M4); worktree `C:\Users\admin\sbc_det\wt`, like `perf_0` → `sbc_perf\wt`. Base: `beta_1142` (ui_a + num_2 over 1.14.2) because the Detail step needs the Concept 2 panel and matching needs the numbering lock; `Guard.cs`, `StructuralBlocks.cs` and the ui_a panel exist for the Detailer only through this base. If `beta_1142` is rebased before M1 ends, `det_0` rebases with it. Lane note `Docs\notes\lane_det_0.md` written from day one (the audit records that `lane_num1.md` was never written). Commits `det_0: <area>: <what>`; merge commit `Merge lane det_0 (M1 one column)`.

**Project layout added by the lane (D25).**
```
Sbc.Codes\                          (netstandard2.0, BCL only; Is456.cs ported, Is13920.cs, OfficeSettings record)
SbcStructural.Detailer.Core\        (net48 class library; refs Sbc.Codes + Newtonsoft.Json; Contracts/Import/Matching/Engine/Validation)
SbcStructural\Detailer\             (plugin folders: Adapters/CadRead/Render/Persistence/Ui/Commands — the only CAD-aware code)
Sbc.Codes.Tests\, Detailer.Core.Tests\   (xUnit, net48, off-host; golden JSON; no host assembly in the manifest)
Build\regression\inputs\det_*.dxf|.xlsx|.csv, baseline\{zw,gs}\det_*.json, check_det_*.py, settings_det.ini
```
`buildcheck.ps1 -Label det` fails if `Sbc.Codes.dll` or `SbcStructural.Detailer.Core.dll` references a host assembly or the plugin assembly, or if any Detailer file names an ETABS API type; ReflectHarness scans referenced types per plugin-side namespace.

**Regression harness additions.** Cases: `det_col1` (M1: one 450×600 rectangular ductile column; `Pre = "SBTNUMBER"`; `inputs\det_col1.dxf` from `make_det_col1.py` + `det_col1_etabs.xlsx` fixture; `settings_det.ini`), `det_col_fail` (MATCH FAILED path, nothing inserted, correct ACTION lines), `det_col_conflict` (DATA CONFLICT 25 % depth), `det_col_incomplete` (Av/s and fck removed from the record → INCOMPLETE, nothing inserted, no default used), `det_col_sbcdesign` (same column on the `SbcDesign` path; must give the identical `DetailModel`), `det_cols_all` (12 columns, two attention, M2), `det_stack` (3-storey stack with section change), `det_col_L/T/C` (M2), `det_after_number` (M2: `SBTNUMBER` and `SBTSHEETS` on `realworld` after `SBTDETAILBATCH` inserted all details; both must stay within their existing perf baselines +10 %, else `Model.Load` gains a layer-filtered `SelectAll` on structural layers instead of iterating the model-space BlockTableRecord, or the details move into a single container block `SBC_DETAILS` referenced once — checked in M2, not M4), `det_wall1`, `det_wall_opening`, `det_wall_hinge` (first lap inside the no-lap zone → `E-WALL-LAP-HINGE`) (M3), `realworld` extended with `SBTDETAILBATCH` (M4). `result.json` gains `detail: {ok, warn, incomplete, conflict, matchFailed, review, blocks, perf}` (§13; `failed` is the Guard crash path); `compare.py` compares these (`perf` ignored); `checks_ext.py` WARN check `detail_notes_present`. Each case saves DXF R2018; a normaliser strips handles/timestamps/GUIDs and rounds coordinates; baselines stored **per host** (`baseline\zw\`, `baseline\gs\`) for raw geometry and compared **across** hosts on the semantic layer only (`compare.py --semantic`: entity counts per layer/type, polyline vertices ± 0.1 mm, text strings, attribute values, `Dimension.Measurement`, Xrecord payloads, bounding boxes ± 0.5 mm) — the hosts produce different dimension-block geometry and MText encoding (App. D §5), so raw identity across hosts is never a criterion. `det_*` baselines are approved only in the merge commit with the diff pasted into the lane note (the 1.14.2 stale-baseline lesson).

**Unit tests (off-host, < 10 s).** Golden `DetailModel` JSON per fixture; rule tests named by clause (`Is13920_8_1_EndSpacing_min_b4_6db_100`); matcher tests at 99/101 mm, 9/11 %, 4.9/5.1 %, storey mismatch; validator tests (every attention string produced by exactly one condition; end-state string derived, never hand-set); polygon tests for rectangle, L, T, C from day one (D11); Explain tests (every line cites a clause that exists in `Sbc.Codes`); `IDesignSource` tests (the same column through both adapters yields one `ColumnDesignRecord` envelope).

**Dual-host build (D30, corrected per Appendix F).** The legacy net48 csproj stays for the `ZWCAD` configuration; for GstarCAD the plugin **already has** a separate net8.0-windows `GCAD` configuration (`CadTarget=GCAD`, run-tested once against GstarCAD 2026 — App. E §1/§11). M0 adds the Detailer stub to that existing `GCAD` configuration; no new build configuration is created. `AUTOCAD`/`PCAD`/`ACAD8` unchanged (paused by the owner). Every existing file that uses `ZwSoft.Windows` / managed ribbon / `KeepFocus` goes behind `#if !GSTARCAD` (§7 `CadAliases` row); the M0 exit criterion includes the list of excluded files and their GstarCAD replacement (the CUIX ribbon gap, App. F §2). `build_release.ps1` already loops the `gcad` host for obfuscation and installer payloads (App. E §11b); ConfuserEx exclusions for `[CommandMethod]` classes, JSON-serialised model types, `Sbc.Codes.dll` and `Detailer.Core.dll` (`[Obfuscation(Exclude=true)]`; ReflectHarness check that serialises a model after obfuscation). Installer enumerates the GstarCAD `R26` and ZWCAD 2025/2026 registry roots and writes loader keys per detected release (App. E §11b; App. D §1.2); ships the partial CUIX for the Detail button. **Installer registry keys and the CUIX ship in M4; M0–M3 owner testing uses NETLOAD from `3 BETA\`.** One-week spike (M0): build the current plugin under the existing `GCAD` configuration for GstarCAD 2026 and NETLOAD before any Detailer code is merged.

**Dual-host matrix (D31, corrected).** `run_regression.ps1 -Host zw2026|gcad2026` per milestone; `-Host zw2025` once at the M4 merge only (no second GstarCAD release to test against, since the office runs 2026 only). Each `det_*` case runs via `/nologo /b run.scr` (NETLOAD, open fixture, `SBTDETAILBATCH` with `SBC_DET_JOB` set, SAVEAS DXF, QUIT). GstarCAD 2026+ has an empty column so nobody forgets. Owner manual sheet `Docs\HOW TO TEST - DETAILER M1.md` in the style of `HOW TO TEST - 1.14.2 BETA.md`: PaletteSet dock/float/close/reopen, menu presence, the keyboard flow, a real office drawing against 1071/1153, light theme, Esc at every prompt, Undo once removes the one-column detail.

**Performance budget (from perf_0).** Zero unhandled exceptions. `SBTDETAIL` one column ≤ 1.0 s wall-clock, engine ≤ 0.3 s, ≤ +50 MB private; `SBTDETAILBATCH` 42 columns ≤ 15 s (≤ 0.3 s/member); `SBTDETAILMATCH` ≤ 2 s; at most one `Model.Load` scan per run (asserted by the `ModelLoadScans` counter in `RunStats`); `SBTNUMBER`/`SBTSHEETS` after details inserted within their own baselines (+10 %, case `det_after_number`). > 10 % slower than baseline fails the gate (MASTER_PLAN §10); perf judged on the median of three runs with `SBC_CMDTIME=1`. One transaction per member committed when complete, one undo group per member (§16.7), no `Regen` in loops, no `Editor.Command`, details placed on a grid (no collision solving). BBS byte-identical before and after (`git diff --stat` shows nothing under `Bbs`).

**Definition of done (every milestone).** (1) `buildcheck.ps1 -Label det` clean on the `ZWCAD` and `GCAD` configurations; (2) unit tests green; (3) the milestone's `det_*` cases pass on **ZWCAD 2026 and GstarCAD 2026 (GCAD target)** with approved baselines (zw2025 run once at the M4 merge only); (4) perf within budget, numbers in the lane note; (5) zero Guard FAILED lines; (6) owner test sheet executed and signed on ZWCAD 2026 and GstarCAD 2026 (GCAD target); (7) lane note and D-rows updated; (8) release build in `3 BETA\` (installer from M4); (9) no BBS file touched.

---

## 22. Integration with SBC Calculator

- **Shared `Sbc.Codes` library (D4).** Created by *porting* `SbcCalc\Engine\Is456.cs` (τc, τc,max, kLim/xu,max, Ld, lap table, cover tables, min/max steel) into `Sbc.Codes\Is456.cs` with clause tags, plus new `Is13920.cs` (confinement spacing min(b/4, 6Ø, 100) and Ash — ported from the Calculator — l0, hooks, leg spacing, lap window, wall clauses) and `OfficeSettings`. The Calculator references `Sbc.Codes` at its own release cadence. The plugin's `BeamDesign` duplicates (XC-7) are **not** touched by the Detailer lane; the design lane removes them after `Sbc.Codes` ships.
- **Port-not-edit rule** (memory `shared-code-plugin-calculator.md`). The Detailer lane never edits `SbcCalc\*`. `Sbc.Codes\Is456.cs` is byte-for-byte traceable to the source (`PortedFrom` + commit hash); `Sbc.Codes.Tests` re-runs the relevant values of the 144-case Excel check (`excel_cases.ps1` reused, not edited) to prove equivalence. SbcCalc 1.3.0 is code-frozen; adoption of the library is the Calculator session's decision.
- **The `SbcDesign` source (D13) — the office's usual path.** Two producers feed it through the same adapter contract: (a) the plugin's own `ColumnDesign` / wall design run on imported ETABS forces (inside the CAD session; output types **assumed — verify in inventory**); (b) the Calculator app, which writes a `DesignSet` JSON (`sbc-detailer/design/v1`, `Provenance.Source = SbcDesign`) through `SbcCalc\UI\CadLink.cs` (contents **assumed — verify**) for the plugin to read with `SBCDETAILIMPORT <file>`. Needed per column per storey: section (B, D or Ø), fck, fy, `AsRequired_mm2` (or chosen n×Ø — honoured if geometry allows), `AvsMajor/Minor` and `Vu2/Vu3` (or tie spacing + legs) per (combo, station) with the governing combo named (§11.3a), Pu/Mu of the governing combo (lap tension check F-10), ductile flag. Per wall: tw, lw, ρv/ρh required or bars, Vu per leg, BE required flag **and** length (the 0.2 fck trigger runs in the design, D29). Any of these missing → INCOMPLETE, never a default (D27).
- **The `EtabsDesign` source** never passes through the Calculator; the Calculator may still be used as a *check* (its numbers appear in the schedule remarks when both exist). The per-project setting names the one source used for sizing; the Detailer never merges the two for one member.
- **Calculator cross-check findings** XC-2…XC-8 (App. A §9) stay with the design sessions; the Detailer only consumes As and Av/s and is not affected except XC-7 (duplicated τc — `Sbc.Codes` makes the fix possible; the design lane applies it) and XC-8 (column lap rule — the Detailer uses the office tension-lap table for all column laps, with the corner-bar factor 1.4 applied unless the office sets `CornerLapFactor = 1.0` (D33), so XC-8 is moot on the drawing).

---

## 23. Dependencies (ordered)

1. **Numbering lock (1.14.2 Phase 2)** — stable marks, "marks changed" diff, `MembersOf()` API. Nothing in Matching is trusted before this (owner decision 2026-10-06). Until it lands, M0 and the pure engine proceed on fixed test marks in `inputs\det_col1.dxf`; nothing is persisted against live marks. Until the lock lands, `[Detailer] AllowUnlockedMarks=1` (honoured by SBT builds, and by SBC builds only when the DWG is under `Build\regression\inputs\` or the owner enables it per session) lets G0 pass with a permanent amber strip "marks not locked — detail is NOT FOR GFC"; nothing is written to the NOD, only the sidecar JSON. M1 is signed off in this mode if necessary; the lock is then a V1.1 gate before `det_0` merges into `beta_1142`.
2. **Phase 2.5 ETABS import** (`EtabsTables.cs`, `LabelMap.cs`, SBCETABS with mark→label map, the force tables of §11.3) — both design paths sit on it; header freeze requires one real ETABS 22 export from the owner (§25 Q-A7).
3. **Column/wall design output types** (plugin `ColumnDesign`, wall design; Calculator `CadLink.cs`) — the `SbcDesign` adapter needs them, incl. per-combo Av/s, Vu, governing combo and the BE flag + length; first item in the inventory reconciliation (V1.1).
4. **`Is456.cs` port into `Sbc.Codes`** (+ `Is13920.cs`, `OfficeSettings`) — Engine and Validation compile against it. Done in M1 week 2, not in the M0 spike. (XC-7 removal in `BeamDesign.cs` belongs to the design lane.)
5. **Dual-host build** (reuse the existing `GCAD` configuration, `#if !GSTARCAD` exclusions, GstarCAD 2026 NETLOAD spike) — must pass before Render is written so the primitive whitelist is proven on both hosts. No new seat or NuGet package needed (Appendix F).
6. **LAYERS.dwg detail layers** (`SBC-DET-*`, `SBC-WALL-OPEN`, `SBC-HOLD`). Text height, dimension style, layer names, steel-grade note and bar-mark prefix are **read from `LAYERS.dwg` and drawings 1071/1153/1162 during M0** and recorded as a D-row; they are not asked of the owner.
7. **Storey schema** in ProjectPanel with levels + `EtabsStoryName`; project settings `DesignSource` and `SeismicCategory`; per-member `Exposure` in the Members grid.
8. **Office settings confirmation** (D9, App. C §F, §25 Q-A3) — Engine runs with defaults but drawings stay "NOT FOR GFC" until confirmed.
9. **Regression fixtures**: one DWG + one ETABS export + one SbcDesign run for the milestone column; one Windows machine with ZWCAD 2026 and GstarCAD 2026 (GCAD target) for the matrix (zw2025 once at the M4 merge).
10. **External packages**: OpenXML SDK for .xlsx (no ACE driver), Newtonsoft.Json 13.x (D21), xUnit for off-host tests. No ETABS interop in V1 (grep-guarded, §9 rule 9).
11. **Table Plugin 3.3 on GstarCAD** — `TPIMPORT` verified in M0 (D32); if it fails, `ScheduleWriter` falls back to lines + text and a D-row says so.

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
| R7 | Two hosts; test time doubles for a single lane. (Licence risk is lower than first assessed: both hosts are already installed on the test machine, Appendix F.) | Time | Med / Med | Per milestone only ZWCAD 2026 + GstarCAD 2026 (GCAD target) (D31); zw2025 once at the M4 merge; the full suite nightly on ZWCAD 2026 and at merge on GstarCAD 2026; scripted `/b` launches. | Owner (licence), release eng |
| R8 | Panel scope creep away from Concept 2 and the no-popup rule. | UX | Med / Med | Everything lives in the 340 px column; two modals only; reuse `InlineStrip`, chips, `SbcTheme`; UI review against wireframes each milestone. | UI lead |
| R9 | Shear-wall and L/T/C edge cases (openings, BE, two-polyline walls, mirrored blocks) consume M2/M3. | Technical | Med / Med | Polygon engine from M0 with unit tests on all shapes; walls reuse `Analysis.Supports`; anything unreadable becomes `Invalid CAD geometry`, never a crash. | Dev lead |
| R10 | Obfuscation breaks JSON model types or the GstarCAD variant. | Release | Med / Med | Exclusion attributes; ReflectHarness serialises a model after obfuscation; per-host pass added in M0. | Release eng |
| R11 | Owner time: manual sheets on two hosts per milestone plus two live projects in M4; 60-second defaults may need rework. | People | Med / Med | Sheets ≤ 20 min each; D-rows kept current; office defaults are settings, so a changed decision is an INI edit. | Owner |
| R12 | Single-developer lane pre-empted by another lane. | People | Med / Med | Lane note daily; engine fully unit-tested; milestones independently mergeable. | Dev lead |
| R13 | `Model.Load` hot spot gets worse when the Detailer reads geometry, and again once thousands of detail primitives sit in model space (the plugin's own +10 % gate on `SBTNUMBER`/`SBTSHEETS` trips). | Technical | Med / Med | Detailer takes members from the numbering model in memory; one scan per command asserted in regression; detail entities only on `SBC-DET-*` layers / `SBC_DET_*` blocks so the scan can skip them **(verify Model.Load filter)**; case `det_after_number` in M2 with the layer-filtered `SelectAll` or single container block as the fallback (§21). | Dev lead |
| R14 | ~~GstarCAD 2026+/.NET 8 demand arrives mid-V1~~ — **superseded**: the test machine already runs GstarCAD 2026/.NET 8 (Appendix F), and the plugin's existing `GCAD` target already builds for it, so this risk did not materialise. Remaining residual risk: GstarCAD <2026 (net48) is unsupported if the office later needs it. | Process | Low / Low | Use the existing GCAD target; revisit only if the office needs GstarCAD ≤2025. | Owner |
| R16 | Command-name collision with the existing `Details` group; inline-argument habit. | Technical | Med / Low | Collision check before registration, `SBCRD*` fallback, no inline arguments (D26). | Dev lead |
| R15 | IS 13920 "(verify)" values or Amendment 2 differ from what is implemented. | Code | Med / Med | Each "(verify)" value is a pending unit test; release note lists unverified items; BIS copy diff before GFC use. | Owner (BIS copies) + dev |

---

## 25. Questions that genuinely require the owner's decision

Rule: no reply within 60 seconds → the default below is used and logged in DECISIONS_TAKEN_BY_CLAUDE.md. **Not asked** because already answered or answerable without the owner: ETABS version (22), forces vs design (per-project `DesignSource`, D13), Mumbai defaults and ductile detailing (D24: Zone III → ductile, locked), SAFE for foundations, BBS last, GstarCAD + ZWCAD, GstarCAD version (§0 ask (b)), detail placement (§0 ask (g)), O/S members (always blocked, D22), live ETABS API (closed by D3), text height / dim style / layer names / grade note / bar prefix (read from LAYERS.dwg and drawings 1071/1153/1162 in M0, §23 dep 6), 90° hooks and 12 mm bars (Zone II only, D24). Type: **E** = engineering decision, **P** = project / IT decision.

### (a) Blocking for M1

| # | Type | Question | Options | Default if silent |
|---|---|---|---|---|
| Q-A1 | E | On the `EtabsDesign` path, when a column was run in ETABS *Check* mode (ratio only, no As,req): detail from the ETABS template bars, or refuse? | Accept template bars / refuse | Row goes to REVIEW with template bars shown and "designed in Check mode — confirm"; never auto-detailed. |
| Q-A3 | E | Confirm or amend the office defaults in D9: bar list 12/16/20/25/32 and one-step pairings, max two dias, tie min 8 mm (10 mm when main Ø ≥ 32 — office; the code minimum for Ø32 is 8 mm, IS 456 26.5.3.2(c)(2)), 135° hooks, 25 mm module, 75 mm confining floor, office lap table, cover to the outermost steel (tie). | Any value | D9 as written; drawings stay NOT FOR GFC until confirmed. |
| Q-A4 | E | **Cover by exposure, per face** (replaces a flat 40). IS 456 Table 3 classes "exposed to coastal environment" as *severe* (Table 16: 45 mm); Mumbai external columns and periphery/podium shear walls are routinely detailed at 45–50 mm. Proposed: internal → moderate (columns 40, walls 30); external / coastal-facing → severe (columns 45, walls 45); below ground / water-retaining → 50. The Detailer reads an `Exposure` attribute per member (Members grid, pre-filled from the plan's perimeter test) and prints the class in the schedule remarks; cover is never a bare number in OfficeSettings. | Values per class | As proposed (D28). |
| Q-A7 | P | One real ETABS 22 export — the fixed table set: `Program Control`, `Story Definitions`, frame assignments / sections / connectivity, design preferences, column and pier design summaries, `Area Assignments - Pier Labels`, `Area Object Connectivity`, `Point Object Connectivity`, SD Section Data (if any SD section exists), **and the force tables** `Element Forces - Columns`, `Pier Forces`, `Load Combinations`, `Story Drifts`, `Joint Reactions` — units kN,mm, all combos, no "selection only" — plus one SbcDesign run for the same model. Can you send them this week? | — | Until then the parser uses App. B headers marked "(verify)" and refuses files whose headers differ; the SbcDesign adapter waits for the inventory. |

### (b) Needed before M2 / M3

| # | Type | Question | Options | Default if silent |
|---|---|---|---|---|
| Q-B2 | E | L/T/C/+ columns in the lateral system (IS 13920 Amd 1): auto-detail with overlapping hoops and the Amd 1 note, or refuse? | Auto + note / refuse | Auto-detail with the note, state REVIEW (never READY). Needs the SD polygon (SD tables or .e2k, §11.2) on the EtabsDesign path. |
| Q-B3 | P | Approval: one state set by any engineer, or two (checked by / approved by) with names? | One / two | One state, Windows user name and time in the Xrecord; two-step is a setting for later. |
| Q-B5 | E | Lap location for non-ductile (Zone II) columns, crank vs dowel at size change, kicker height. | Above floor / central half; crank 1:6 / dowel; 75/100/150 | Central half (uniform with ductile); crank 1:6 up to 75 mm offset within the lower lap window with two extra hoops each side of the bend, else dowel; never crank in ductile l0; kicker 150. |
| Q-B6 | E | **BE length policy.** The BE extent is the length over which σ > 0.2 fck (IS 13920 10.4.1) — a design quantity. Do you want an office rule for lbe when the design source gives only the flag, or should such piers stop as INCOMPLETE until the design supplies the length? Also: lap fraction in BE bars (1/3 as for walls, or 1/2 as for columns). | INCOMPLETE / office rule (state it) ; 1/3 or 1/2 | `RequiredLength_mm` absent → `STATUS: INCOMPLETE "BE length not supplied"` (D29); no office rule; BE lap fraction 1/3 (stricter). |
| Q-B7 | E | Walls: two curtains always (office), or single curtain when tw ≤ 200 **and** τv ≤ 0.25√fck (IS 13920:2016 10.1.5 — both conditions)? Opening threshold? | Two always / code criterion ; mm | Two curtains always. A single curtain only if tw ≤ 200 and the design source supplies Vu such that τv = Vu/(0.8·lw·tw) ≤ 0.25√fck; Vu absent → two curtains, note "τv not supplied". Openings < 300 mm ignored. |
| Q-B8 | E | Corner-bar lap factor 1.4 (IS 456 26.2.5.1(c), corner bars with cover < 2Ø — true for Ø ≥ 25 at 40 cover): apply on top of the office table, or office table only? | Apply / table only | Apply 1.4 to corner bars with cover < 2Ø **unless** you set `CornerLapFactor = 1.0`; either way the notes block prints "corner-bar factor 1.4 applied / NOT applied (office decision, IS 456 26.2.5.1(c))" (D33). |
| Q-B9 | E | Clear height hc when beams of different depth frame in: which soffit sets l0 and which sets the lap window? | One / each | l0 at the top from the shallowest soffit (longest hc); the lap window from the deepest soffit (shortest hc): window = [z0 + max(hc,deep/4, l0,bot), z1,deep − max(hc,deep/4, l0,top)]. Both beam faces drawn on the elevation. |
| Q-B10 | E | Shear-wall end bars where no BE: enforce 4-T12 in two layers (SP 34 practice)? | Yes / no | Yes. |
| Q-B11 | E | **Multi-leg piers on the SbcDesign path** (L/C/T cores): `Pier Forces` are for the whole pier. Accept shear per leg apportioned by leg stiffness (t·l³ about the relevant axis), or require ETABS design (`DesignSource = EtabsDesign` for walls) for multi-leg piers? | Stiffness rule / ETABS design / manual | Stiffness rule, printed in EXPLAIN; such piers stay REVIEW (never READY) until you answer. |
| Q-B12 | E | **Wall vertical-bar laps.** Three alternating groups (≤ 1/3 at a section, IS 13920 10.9.x (verify)) and no laps within lw above the base (10.9.2 (verify)); where the first lap would fall in that zone: starter bars from the raft of length lw + Llap, or couplers (IS 16172)? | Starters / couplers | Report `E-WALL-LAP-HINGE` and propose both; never lap in the zone (D34). |

### (c) Later

| # | Type | Question | Options | Default if silent |
|---|---|---|---|---|
| Q-C1 | P | AutoCAD / pCAD continued support for the Detailer output? | Yes / later / drop | Not tested in V1; renderer uses only the primitive surface so it should work; no promise. |
| Q-C2 | P | Test machines: one machine with both hosts, or two? | — | One machine, both hosts, owner tests; no ETABS on the detailing seat (table file only). |
| Q-C3 | E | Joint hoops: continue confining spacing through all joints, or the 150 mm relaxation when four beams confine? | — | Continue through joints (simple, conservative). |
| Q-C5 | P | IS 13920 Amendment 2 (2021): can you supply the BIS copy for a diff before release? | — | Release note "Amd 2 not reviewed" until supplied. |
| Q-C7 | E | Bundled bars (needed only above ~4 %): permitted? | Yes / no | No; warn > 4 % and propose a larger section. |

---

## STATUS TABLE

### ALREADY EXISTS (Appendix A)
- `Guard.cs` command guard, crash.log, `[SBC-TIME]` perf lines (on lane perf_0 — unmerged; available via `beta_1142`, §21).
- `Commands.cs` registry (41 entry points), `SBT*` test-build twins.
- `Model.Load` model-space reader; `INSUNITS` units check.
- `StructuralBlocks.cs` block reader with `SBC_BLK` cache (on lane num_1 — unmerged; available via `beta_1142`).
- `Numbering.cs` / `Analysis.cs` marks (C/SW/LW/RW/B/BC/S), wall-from-two-polylines, aspect-ratio and lift-wall rules.
- ProjectPanel storeys/plans; SchedulePanel Members grid.
- `CadAliases.cs` / `CadCompat.cs` / `CadPcad.cs` compat layer; per-CAD obfuscated builds.
- ui_a Concept 2 panel: `SbcUiHost.cs`, `InlineStrip.cs`, `SbcTheme.cs`, `Workspace.cs`, 6-button ribbon (on lane ui_a — unmerged; available via `beta_1142`).
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
- `Is456.cs` (ported into `Sbc.Codes`), the calculator's confinement spacing and Ash functions (ported into `Is13920.cs`), office lap table, 144 Excel cases (re-run for ported functions), `excel_cases.ps1`.
- `LAYERS.dwg` layers and text/dim styles (read in M0, recorded as a D-row).
- Table Plugin 3.3 `TPIMPORT` + `SbcCalc\UI\TablePlugin.cs` writer (ported) for the Detailer schedule rows (D32).
- Regression harness, DXF fixtures pattern (`make_*.py` / `check_*.py`), `handcalc\` for three test columns, ReflectHarness, `buildcheck.ps1`.
- `SBCREPORT` HTML style for the detail report (M4 if time remains); `SbcCalc\UI\CadLink.cs` as the file exchange (assumed).
- Confirmed drawing helpers in `Details` / `Diagrams` / `Section`, all via `Sketch` (App. E §7) — reused directly by the renderer (D39d).

### NEEDS MODIFICATION
- `Commands.cs` (+ Detailer commands / `SBT*` twins, provisional names, collision check); `Guard.cs` (typed outcomes).
- `Model.Load` (cached snapshot; `SBC-DET-*` layer skip — assumed); `Numbering.cs` / `Analysis.cs` (`MembersOf()`, marks-changed event); `StructuralBlocks.cs` (source-handle map).
- `ProjectPanel.cs` / storey schema (levels, `EtabsStoryName`, `DesignSource`, `SeismicCategory`, per-member `Exposure`) — assumed schema.
- `ColumnDesign` / wall design output exposure for the `SbcDesign` adapter (per-combo Av/s, Vu, governing combo, BE flag + length); `EtabsTables.cs` / `LabelMap.cs` (map exposure, Unique Name write-back, import record) — wrapped by `Detailer.Adapters`, not edited from this lane.
- `Detailing\Laps.cs` (move to `Sbc.Codes`). (`BeamDesign.cs` is **not** modified in V1.)
- `CadAliases.cs` / `CadCompat.cs` (the `GCAD` alias set already exists, `ICadHost`, `#if !GSTARCAD` exclusions of `ZwSoft.Windows` users); `SbcStructural.csproj` (the `GCAD` net8.0-windows configuration already exists — reused, not created); `build_release.ps1` (GstarCAD `gcad` probe already exists); installer registry keys and CUIX (M4).
- Workflow tab (Detail step), Members grid (columns incl. `Exposure`), status bar item; `SBCSET` `[Detailer]` section.
- `LAYERS.dwg` (`SBC-DET-*`, `SBC-WALL-OPEN`, `SBC-HOLD`).
- Regression: `run_regression.ps1` (cases, `-Host`), `compare.py` (`detail` key, `--semantic`), `checks_ext.py`, `perf_baseline.json`; ReflectHarness (dependency scan, obfuscation serialisation check, numeric-literal scan of `Detailer.Render`); `Build\SbcStructural.crproj` (exclusions for `Sbc.Codes.dll`, `Detailer.Core.dll`, model types, command classes).

### NEEDS TO BE CREATED
- `Sbc.Codes` project (netstandard2.0, BCL only): `Is456.cs` (port), `Is13920.cs`, `CodeValues`, `CodeValueCatalogue`, `Clause`, `RuleResult<T>`, `IColumnRules`, `IWallRules`, `IRuleSet`, two rule sets, `HoopHook`, `OfficeSettings` record; `Sbc.Codes.Tests`.
- `SbcStructural.Detailer.Core` project (net48 class library, refs `Sbc.Codes` + Newtonsoft.Json): `Detailer.Contracts` (all of §13 incl. `DesignSource`, `IDesignSource`, `MemberState`, `ProjectContext`, `RunStats`, `DesignStory`, `CanonicalJson`), `Detailer.Import` (`EtabsDesignSource`, `SbcDesignSource`, `ITableSource`, `ExcelTableSource`/`CsvTableSource` only if the inventory shows Phase 2.5 has no reader, normaliser, units parser, mappers incl. `ForceTableMapper` and `PierLegDeriver`, `DesignSet`), `Detailer.Matching` (label/geometry/storey matchers, `MatchTable`, tolerances, report, stacks), `Detailer.Engine` (classifier, polygon offset, bar selector, edge distributor, lateral-support solver, hoop decomposer, shear-leg check, zone layout, wall arranger, BE arranger, `DetailBuilder`, `Explain`), `Detailer.Validation` (gates G0–G8, `ValidationReport`).
- Plugin-side folders under `SbcStructural\Detailer\`: `Detailer.Adapters` (`SbcDesignSourceAdapter`, `EtabsTablesAdapter`, `NumberingAdapter`); `Detailer.CadRead` (`CadMemberReader`, `PolygonExtractor`, `StoreyBandResolver`, `OpeningFinder`, `MemberProvenance`); `Detailer.Render` (primitive renderer, layer/text/dim maps, section/elevation/wall drawers, `ScheduleWriter` Table Plugin text + lines/text fallback, block writer, placer); `Detailer.Persistence` (`SBC_DETAILER` NOD, block-reference Xrecords, codec; sidecar `<dwg>.sbcdetail.json`, `detail_report.txt`); `Detailer.Ui` (Detail step, source strip, progress list, attention list, member list, match/detail card, EXPLAIN drawer, settings page); `Detailer.Commands` (`DetailWorkflow`, `DetailBatchJob`).
- `Detailer.Core.Tests` (xUnit, golden JSON); regression cases `det_*` with fixtures (incl. `det_col_incomplete`, `det_after_number`, `det_wall_hinge`), per-host baselines, DXF normaliser/comparator, `check_det_*.py`, `settings_det.ini`, `job.json` schema.
- `Docs\notes\lane_det_0.md`, `Docs\HOW TO TEST - DETAILER M1.md`, user-guide chapter, release note.
- Partial CUIX for the Detail button (M4); HTML detail report (M4 if time remains, else backlog). (The GstarCAD build configuration itself already existed — nothing to create there.)

### NEEDS MY DECISION (owner)
- §0 asks (a)–(g), in particular (c) D9 defaults, (g) model-space placement. (Ask (f), the GstarCAD seat, is answered: none needed.)
- §25(a): Q-A1 Check-mode columns; Q-A3 confirm D9 defaults; Q-A4 cover by exposure per face; Q-A7 send one ETABS export (with force tables) + one SbcDesign run.
- §25(b): Q-B2 L/T/C auto-detail; Q-B3 approval states; Q-B5 Zone II lap/crank/kicker; Q-B6 BE length policy and BE lap fraction; Q-B7 curtains and opening threshold; Q-B8 corner lap factor; Q-B9 hc with unequal beams; Q-B10 wall end bars; Q-B11 multi-leg pier shear; Q-B12 wall lap hinge zone.
- §25(c): Q-C1 AutoCAD/pCAD; Q-C2 test machines; Q-C3 joint hoops; Q-C5 Amd 2 copy; Q-C7 bundles.
- Review of D1–D35 in DECISIONS_TAKEN_BY_CLAUDE.md (any row can be reversed with the stated phrase); D18 (engineer override of DATA CONFLICT) and D24 (seismic category) deserve a deliberate look.

---

## Milestones M0–M4

| M | Scope | Exit criteria | Days | Depends on |
|---|---|---|---|---|
| **M0 Spike** | `SbcStructural` compiles under the existing `GCAD` configuration (already `Gssoft.Gscad`-aliased, App. E §1/§11) with every `ZwSoft.Windows` / managed-ribbon / `KeepFocus` user behind `#if !GSTARCAD`; NETLOAD on GstarCAD 2026 and ZWCAD 2026; `SBTDETAIL` stub reads one closed column polygon (vertices, centroid, bbox) and inserts one block with two attributes and one aligned dimension on both hosts; PaletteSet shows the Concept 2 panel on GstarCAD; **Table Plugin 3.3 `TPIMPORT` run on GstarCAD 2026 with one schedule text file**; command-name collision check (§21); text height / dim style / layer names / grade note / bar prefix read from LAYERS.dwg and drawings 1071/1153/1162 and logged as a D-row. Nothing else — the spike must stay a spike. | Same `result.json` semantic content on both hosts for `det_col1.dxf`; alias deltas and the list of excluded files with their GstarCAD replacement in the lane note; `TPIMPORT` result on GstarCAD 2026; go/no-go on the CUIX ribbon gap written as a D-row. | 5 | `beta_1142` buildable in a worktree; the existing `GCAD` target and GstarCAD 2026 install (no new seat or NuGet package needed — Appendix F). Owner evening: send the ETABS export incl. force tables and the SbcDesign run (Q-A7) — GstarCAD version question is answered. |
| **M1 One rectangular column** | **Week 2** `Sbc.Codes` project created and `Is456.cs` ported (D4); `Is13920.cs` seeded with App. C A1–A6; `SbcStructural.Detailer.Core` project; typed records (§13) incl. `MemberState` and `CanonicalJson`; `ITableSource` (Phase 2.5 reader wrapped, or `ExcelTableSource` per the §11.2 decision rule); import + match (force tables and design tables with frozen headers, units row per column, per-(combo, station) force set, `SbcDesignSourceAdapter` on the inventory's types; matcher with D7/D15 tolerances incl. the position check; Members grid "Detail" and "Exposure" columns). **Week 3** arrangement engine (polygon API, corner/edge bars, tie path, cross-tie solver with the 300 mm leg rule, dia/count selection, shear-leg check per zone, zone layout, lap window, validation with clauses; hand-calc for three columns; console harness). **Week 4** renderer + `SBCDETAIL` command + minimal `SBTDETAILBATCH` driver (section per zone with donut bars, elevation, schedule row via Table Plugin text; model-space placement). **Week 5** both hosts and hardening (semantic-diff script, 50-run exception soak with bad inputs: missing table, wrong units, mismatched section, Check-mode row, O/S row, missing Av/s, missing fck; regression and BBS byte-check green). **Week 6** buffer / sign-off. Cases `det_col1`, `det_col_fail`, `det_col_conflict`, `det_col_incomplete`, `det_col_sbcdesign`. | Pick → match → Detail → zoom works on both hosts; **one column ≤ 1.0 s wall-clock on both hosts, engine ≤ 0.3 s** (§21 budget; median of three runs with `SBC_CMDTIME=1`); **semantic equality on both hosts per `compare.py --semantic`** (entity counts per layer/type, polyline vertices ± 0.1 mm, text strings, attribute values, `Dimension.Measurement`, Xrecord payloads, bounding boxes ± 0.5 mm) with raw geometry compared only against each host's own `baseline\{zw,gs}\` golden; zero unhandled exceptions in 50 runs; a missing Av/s or fck never produces a drawing; matches drawing 1071/1162 style (owner judgement, cosmetic remarks only); every number traceable to a clause; hand-calc agreement; no regression beyond the 10 % gate; BBS byte-identical; unit tests ≥ 40; owner signs the sheet with ≤ 3 open items, none blocking. | 25 | M0; numbering lock on `beta_1142` (else `AllowUnlockedMarks` mode per §23 dep 1 and M1 ends "engine-complete, persistence pending"); ETABS table format agreed or App. B layout used and marked UNVERIFIED; inventory for the SbcDesign types. Budget guard (D19): if week 3 slips > 3 days, M1 drops the elevation and ships section + schedule row only; the elevation moves to M2. |
| **M2 All columns + L/T/C** | `Detail all`, batch driver completed (Detail all, Stop-after-current, attention list), COMPLETED WITH WARNINGS flow, Members-grid column, `SBCDETAILFORCE` / `SBCDETAILREMOVE` with the two modals, `SBCDETAILACCEPT`, L/T/C polygon hoop layouts with the Amd 1 note, stacks with crank/dowel (`CrankSpec`), Zone II branch (`RuleSet_IS456_Only`), settings page, `SBCDETAILREPORT`, `SBCDETAILUPDATE` with the exploded/user-copy policy, `det_after_number` perf case. | `det_cols_all`, `det_stack`, `det_col_L/T/C`, `det_after_number` green on ZWCAD 2026 + GstarCAD 2026 (GCAD target); 42-column run within budget; report opens; Stop-after-current works; idempotence passes (second `SBCDETAILUPDATE` changes nothing). | 12 | M1; office defaults confirmed (D9) or kept as assumed. |
| **M3 Shear walls** | Wall geometry (two-polyline walls, wall openings per §10, BE), pier legs derived from area objects, pier records from both sources incl. multi-leg handling (§15.1), `SBCDETAIL` for walls, wall elevation + section renderer with three lap groups and the no-lap zone, "W12 Boundary data missing" path, junctions, lift walls. | `det_wall1`, `det_wall_opening`, `det_wall_hinge` green on ZWCAD 2026 + GstarCAD 2026 (GCAD target); owner sheet M3 signed (both hosts); LW detailed or listed as INCOMPLETE with ACTION. | 10 | M2; pier label export in SBCETABS (Phase 2.5); SW/LW numbering stable; Q-B6, Q-B7, Q-B11, Q-B12 answered or defaults logged. |
| **M4 Complete system** | `realworld` and one live office project through the full flow; status-bar item; light-theme pass; per-host golden DXFs; installer with the GCAD variant and the partial CUIX; zw2025 run once; user-guide chapter; HTML report if time remains; backlog of BBS findings handed over (not implemented). No sheet/layout integration (V1.5, §16.4). | `realworld` + all `det_*` green; two owner projects detailed with zero FAILED and attention list understood; beta installer in `3 BETA\`; HOW TO TEST sheet complete; perf table in `BUDGET_LOG.md`. | 10 | M3; owner time for two project runs. |

**Total ≈ 62 working days** of one developer lane (5 + 25 + 12 + 10 + 10; D23) plus 8–10 owner evenings in all (§0 "Your time"). Lanes `det_0` (M0–M1), `det_1` (M2), `det_2` (M3–M4), each from a freshly merged base.

---

## Source of truth table

| Information | Source of truth | Never taken from | Rule on conflict |
|---|---|---|---|
| Member existence, mark, storey | CAD numbering (locked) | ETABS labels | ETABS label is a hint; CAD mark wins; unmapped → MATCH FAILED |
| Actual section geometry (polygon, B × D, orientation) | CAD drawing | ETABS / design section | > 5 % or shape differs → DATA CONFLICT; ≤ 5 % → warning, CAD size used |
| Storey levels, clear height, beam depths | CAD (ProjectPanel + beam layer) | ETABS story table alone | ETABS story used to map names; height mismatch > 50 mm → warning |
| Wall openings (plan) | CAD | ETABS | Heights unknown → INCOMPLETE until entered |
| Required reinforcement: As,req, Av/s (+ Vu), ρv/ρh, fck, fy | Selected `DesignSource` (**SbcDesign** = plugin/calculator design from ETABS forces, the usual case; **EtabsDesign** = ETABS design tables) | CAD; the other design source; code minimums; project defaults | The project setting names ONE source; the other, if present, is a check value in remarks only; both sources for one member are never merged. **Any of these missing → `STATUS: INCOMPLETE`; the Detailer never substitutes a code minimum or a default** (D27); an engineer may accept an offered value explicitly, which is recorded and printed |
| Boundary-element required flag, BE length | Selected `DesignSource` only (the 0.2 fck trigger runs inside the design routine / Calculator wall check, per combo) | CAD; a Detailer stress check; an office length rule not confirmed by the owner | Flag or length missing → INCOMPLETE (D29) |
| Ductile / Special flag | Project seismic design category (default Zone III, Mumbai → ductile, locked; D24) | ETABS alone; a free toggle | ETABS flag shown as a check; mismatch → WARNING; Zone III–V override only by an engineer with a recorded reason, NOT FOR GFC |
| Overstress / O/S | Selected `DesignSource` | — | Blocks that member; nobody overrides (D22) |
| Cover | Member exposure class per face (Members grid) → IS 456 Table 16 via `Sbc.Codes` | A single project number | Class printed in the schedule remarks (D28) |
| Bar count, dia, arrangement, ties, legs, Ash, l0, laps, hooks, cover, curtains, trimmers, junctions | Detailer engine (`Sbc.Codes` rules + office settings) | ETABS template bars (except Check-mode REVIEW) | Every value shows its clause; Fail blocks the member |
| Code constants and clause numbers | `Sbc.Codes` (`CodeValues`), seeded from `SbcCalc\Engine\Is456.cs` and Appendix C | Inline constants in plugin or Detailer | "(verify)" values are pending tests; BIS copy wins |
| Office conventions (bars, cover, hooks, lap table, module) | `OfficeSettings` JSON (owner-confirmed, D9) | Code defaults | Printed in the notes block; drawings "NOT FOR GFC" until confirmed |
| Match table, detail state, approvals, accepted values | Xrecords in the DWG (`SBC_DETAILER` NOD, Xrecord on each managed `BlockReference`) | Sidecar JSON alone; per-entity Xrecords; SBC_BLK handles | Sidecar is QA/recovery only; re-match by mark + geometry, not by copy handles (D16) |
| Design revision identity | Provenance block (source, file/run, content sha256, `DesignRunId`) and the per-member `DesignHash` over canonical JSON | File name alone; timestamps | Hash change → re-validate every match; drop never silent; equal content hash → "no change" |
| Drawing format | Office answer-key drawings 1071/1153/1162 | Generic templates | Owner judgement at M1/M4 |
| CAD API surface | `CadAliases` + primitive whitelist (App. D §4) | Host-specific namespaces, Table/MLeader/Fields | Missing on one host → fallback on both |
| BBS | Untouched (owner hard rule) | — | Findings go to the backlog |
| Decisions | OWNER_DECISIONS.md, then DECISIONS_TAKEN_BY_CLAUDE.md (D1–D35), then this plan | Panel sections | Owner row always wins |

---

## Appendices

- **Appendix A** — `APPENDIX_A_plugin_session_audit.md`: facts about the existing plugin, lanes, harness, calculator relation and gaps (basis of §1–6). To be reconciled with `Docs\notes\detailer_inventory.md` → V1.1.
- **Appendix B** — `APPENDIX_B_etabs_research.md`: ETABS channels, table names and headers (with "(verify)" marks), what ETABS gives vs does not, member identity pitfalls, recommended contract (basis of §11, §12, §13).
- **Appendix C** — `APPENDIX_C_is_code_rules.md`: IS 456 / IS 13920 rule catalogue for columns (A1–A6) and walls (B0–B6), geometry-driven arrangement algorithm (§C), drawing content standard (§D), code-rule module design (§E), owner engineering questions (§F), "verify against BIS copy" list (§G) (basis of §14, §15, §16, §17, §20).
- **Appendix D** — `APPENDIX_D_cad_platform_research.md`: GstarCAD and ZWCAD .NET APIs, compatibility matrix, one-code-base strategy, dual-host testing, risks (basis of §9, §16, §21, §24).
- **OWNER_DECISIONS.md** — binding owner decisions (GstarCAD + ZWCAD, WHAT/WHERE principle, one column first, ETABS 22 and Phase 2.5, SAFE, BBS last, numbering lock, forces vs design per project, Mumbai Zone III).
- **DECISIONS_TAKEN_BY_CLAUDE.md** — D1–D35 (review list; each row reversible with the stated phrase; D15–D35 added while applying the review panel's findings).
- **Review inputs (scratchpad, not shipped)** — REVIEW_STRUCTURAL.md, REVIEW_CAD.md, REVIEW_ETABS.md, REVIEW_ARCH.md, REVIEW_OWNER.md; their blockers and majors are applied in this issue, their deferred minors are listed below.

---

## Review backlog (minor, not applied)

Each line: reviewer, finding, and where it would land. None blocks M1.

- STRUCTURAL 16 (§25 split into separate E/P tables) — applied as a Type column instead of two tables; a full split can be done in V1.1.
- ETABS 19 (stack hint by label) — applied in §12; the 100–300 mm WARNING wording may need owner review of the threshold values.
- ARCH 16/17/18/19 (naming slips: `IDesignSource` location, `det_*`, `MATCH-BY-GEOMETRY`, Detail step position) — applied; a final consistency grep for "SBC-DETAILS area" vs "DETAILS area" remains for V1.1.
- ARCH 25 (App. C §C1 records copied into Contracts) — pointer added in §13; the verbatim copy itself happens in M1 week 2.
- CAD 15 (`units_m` handling) — **still open after Appendix E**: it describes a refusal ("NUMBERING STOPPED - WRONG UNITS" on 1.14.x; a different UnitsProblem refusal on beta) but no conversion step, so whether Detailer ever sees a converted drawing remains unconfirmed; resolve in M0 by testing the `units_m` regression case directly rather than asking the owner.
- CAD 17 (INSERT pick resolution) — applied in §19.4; the "several members in block" prompt UX is not wireframed.
- CAD 22 (results folder) — applied in §9; the `[Detailer] ResultsFolder` default for unsaved drawings (`%TEMP%` vs. prompt) is open.
- CAD 25 (polygon robustness cases) — applied in §10; the unit-test list for `Polyline2d` and self-touching outlines is written in M1 week 3, not here.
- OWNER 21(b) (`Build\SbcStructural.crproj` row in §7) — applied; obfuscation exclusion list for `Detailer.Core` to be confirmed after the first ConfuserEx run.
- OWNER 24 (installer/CUIX only in M4) — applied in §21 and milestones; the M4 installer still needs the GstarCAD R24/R25 registry "verify" token resolved from App. D.
- OWNER 25 (HTML report deferred) — applied; if dropped entirely, STATUS TABLE "CAN BE REUSED — SBCREPORT HTML style" is removed in V1.1.
- OWNER 14 (plain language throughout) — §0 rewritten and a glossary added; the body sections keep developer vocabulary on purpose (they are the developer's spec); V1.1 may add one-line explanations at the first use of NOD, PaletteSet, ReflectHarness.
- STRUCTURAL 17/19/20/21/22/23 and ARCH 20–24 — applied where they appear (ρv ≥ ρh verify, τbd > M40, web horizontals not BE confinement, s_lap verify, G3 ≤ 5 % wording, tie 10 mm office note, natural order, `DefinitionHash`, enums, nullability) — listed here only so the owner can see that no minor was silently dropped.
- Not applied: nothing else. Every minor either landed in the text or is listed above.

---

## Words used (glossary)

- **Xrecord** — a hidden note stored inside the DWG that travels with the file; the Detailer keeps its match table and each detail's state in them.
- **NOD** — the drawing's "named object dictionary": the place where such hidden notes are filed under a name (`SBC_DETAILER`).
- **XData** — an older kind of hidden note with a 16 KB limit; not used here.
- **Block / block reference** — a reusable group of drawing entities (the definition) and one placed copy of it (the reference); each detail is one block.
- **Primitive entities** — plain lines, arcs, circles, polylines, text and classic dimensions; the only things the Detailer draws, so both CAD hosts show the same thing.
- **Compat layer (`CadAliases` / `CadCompat`)** — the existing code that hides ZWCAD-vs-GstarCAD differences; all CAD access goes through it.
- **NETLOAD** — the CAD command that loads the plugin DLL for a session (how testing is done before the installer exists).
- **PaletteSet** — the dockable panel window the SBC panel lives in.
- **CUIX** — a menu/toolbar definition file; used to add the Detail button on GstarCAD, which has no programmable ribbon.
- **Design record / provenance** — one tidy record per column or wall with the required reinforcement, plus a note of which file or run it came from and when.
- **Rule library (`Sbc.Codes`)** — the one shared rulebook of IS 456 / IS 13920 values and formulas used by the plugin and the Calculator.
- **Gate** — a numbered check (G0–G8) that a member must pass before anything is drawn; a failed gate names the reason and the action.
- **Golden JSON / baseline** — a saved "known good" result that every test run is compared against; a change must be approved on purpose.
- **Hash (SHA-256) / canonical JSON** — a fingerprint of a record, written in a fixed way so the same data always gives the same fingerprint; used to know whether a detail is stale.
- **Semantic equivalence** — two drawings count as the same when their entity counts, texts, dimension values and attribute values agree, even if the two CAD hosts build dimension graphics slightly differently.
- **Lane / worktree** — an isolated branch and folder in which one developer works without disturbing the others; `det_0` is the Detailer's.
- **ReflectHarness / `buildcheck.ps1`** — build-time checks that scan the compiled DLLs for forbidden references (host APIs in pure code, ETABS API anywhere).
- **Obfuscation (ConfuserEx)** — scrambling of the shipped DLL against copying; model types must be excluded so JSON still works.
- **Seismic design category** — the project's seismic zone (II–V) as the single switch that decides ductile (IS 13920) or non-ductile (IS 456 only) detailing.
