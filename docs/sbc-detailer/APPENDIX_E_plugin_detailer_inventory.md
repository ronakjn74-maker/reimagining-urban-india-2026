# detailer_inventory - read-only code inventory for the SBC Detailer planning session (2026-10-06)

Made by reading the code only. Nothing was changed or committed. Paths are relative to `C:\Users\admin\Desktop\SBC_Software` unless they are absolute.
Branches: the working tree is `1.14.1`. Files that exist only on `1.14.2` or `beta_1142` are marked **[1.14.2]** or **[beta]** (read with `git show <branch>:<path>`).

## 1. Repo layout
- **Top-level folders.** `SbcStructural\` (the CAD plugin), `SbcCalc\` + `SbcCalc.Check\` (the standalone WinForms calculator and its checker), `Lanes\` (offline lanes), `Build\` (release, regression and harnesses), `Docs\` (notes and release docs), `Installer\`, `Loader\`, `LoaderOffline\`, `Licensing\`, `LicenseServer\`, `LicenseShared\`, `Setup\`, `SbcCalcSetup\`, `SbcPayroll\`, `Studio\` (parked), `CAD_SDK\` (AutoCAD 2020 and 2025 reference DLLs), and `LAYERS.dwg` (the office standard).
- **Projects (.csproj).**
  - `SbcStructural\SbcStructural.csproj`: Version 1.14.1. Targets net48, or net8.0-windows for `CadTarget=ACAD8|GCAD` (lines 36-56). `CmdPrefix` defaults to SBC and is generated into `Cmd.P` (lines 88-93); test builds use SBT, HCK and others.
  - Build tools: `Build\CadCompat`, `Build\ReflectHarness`, `Build\Net8Smoke`, `Build\tests\colsw\colsw_test.csproj`.
  - Lanes: `Lanes\SbcEtabs\Tests`, `Lanes\SbcModel` (+Tests), `Lanes\SbcLateralLoads\SbcLateralLoads` (+Tests), `Lanes\SbcPiles\SbcPiles` (+Tests), `Lanes\SbcFrame3D` (+Tests).
  - Others: `SbcCalc`, `SbcCalc.Check`, `Installer\SbcInstaller`, `Loader`, `LoaderOffline`, `Studio\*`.
- **Released and active.**
  - Released: v1.14.1 (tag), branch `1.14.1`.
  - Work branch: `1.14.2`, which adds `Guard.cs`, `EtabsE2k.cs` and `EtabsExport.cs`.
  - `beta_1142` is 9 commits ahead of 1.14.2 (1.14.2 is its ancestor). It lives in the worktree `C:\Users\admin\sbc1142\wt\int` and adds `StructuralBlocks.cs` (NUM-1), the NUM-2 split rule in `Numbering.cs`, and UI-A (`SbcTheme.cs`, `InlineStrip.cs`, `Workspace.cs`, single docked panel).
  - Older lane worktrees: `C:\Users\admin\sbc1141\wt2\*` (l2_dbbbs, l2_dbgate, l2_dbstair, l2_dbwall, l2_gate, l2_gutter2, l2_m7, l2_section).
  - The lanes under `Lanes\*` are partly uncommitted and belong to another session. `Lanes\SbcEtabs\SbcModel.cs` is deleted in the working tree.
- **CAD hosts.** One source compiles for every host (details in §11). `CadAliases.cs` holds the global usings per symbol ZWCAD / ACAD / GCAD / PCAD. `CadHost` partials live in `CadZw.cs`, `CadAcad.cs`, `CadGcad.cs` and `CadPcad.cs` (PCAD is not compiled because there is no SDK; it has a stub `SbcRibbon`). `Build\CadCompat\Program.cs` checks the plugin's API references against each CAD's DLLs using metadata only.

## 2. CAD geometry (how members are read)
- **Layers.** These are `Settings` string properties named `*Layers`, comma separated (`Settings.cs:30-59`):
  - Input layers: `ColumnLayers`="COLUMN" (columns and shear walls), `BeamLayers`="BEAM", `OpeningLayers`="void", `BoundaryLayers`, `SupportWallLayers`="RET WALL,RET WALL HATCH", `SlabOutlineLayers`="SLAB", `SunkLayers`="SUNK" (hatches), `ChajjaLayers`, `StairLayers`, `RampLayers`, `LiftLayers`, `SlabDataLayers`="SLAB DATA" (key texts such as `THK=`).
  - Podium layers: `PodiumColumnLayers`="P COLUMN", `PodiumBeamLayers`="PO BEAM", `PodiumSlabLayers`.
  - Membership test: `Settings.OnLayer(layer, list)`.
- **Detection.** All of it is in `Numbering.RunOne` (`Numbering.cs:48-490`):
  - Columns and walls: closed polylines on the column layers (lines 93-187). A circle becomes an equal-area square (line 165) and is designed as circular through `Details.ColumnShape`.
  - `Model.Classify(poly, rect, s.ShearWallRatio)` (default 4.0) decides COL or SW.
  - Beams: an `Mline`, or a pair of parallel LINEs whose spacing is between `MinBeamWidth` and `MaxBeamWidth`.
  - Hatch loops: `Numbering.HatchLoops(Hatch)` (line 1650). Generic curves: `Numbering.Shape(Entity, out pts, out closed)` (line 1629).
- **Blocks [beta].** `StructuralBlocks.Sync(Database)` opens every INSERT whose own layer is a structural `*Layers` layer (nested to depth 8; pieces on layer 0 take the INSERT's layer). Each piece is materialised as a model-space copy with xdata `SBC_BLK`=key. Copies are kept, added or erased on each SBCNUMBER.
  - INSERTs on other layers, xrefs and SBC blocks are never opened.
  - Also on beta: `UnitsProblem(db)` refuses drawings in m or cm, `XrefNotes(db)` prints "bind it first", and an UNREAD audit runs.
  - On 1.14.1/1.14.2, blocks are not read.
- **Member object.** `Model.cs`:
  - `Element { Kind; Id; PartnerId; Plan; Data (xdata dict); Poly List<Point2d>; Rect; BeamGeom Beam; Mark; Anchor; Sunk; Drop; AreaM2 }`.
  - `Model.Load(db,tr)` returns every member in model space. `Model.Build(ent, kind, data, tr)` builds one.
  - `Kinds.Column="COL"`, `Wall="SW"`, `Beam="BEAM"`, `Slab="SLAB"`, `Tag`, `Table`.
- **Geometry helpers.** `Geo.cs`:
  - Shapes: `Polygon(Entity,tr)` (Polyline / 2d / 3d, arcs sampled 8x), `TryRect(pts,out Rect)`, `Centroid`, `Area`, `Bounds`, `Inside`, `OffsetPolygon`.
  - Beams: `MlineGeom(Mline)`, `PairGeom(a,b,p,q)`, `TrySegment`.
  - Orientation: `Rect` holds the centre `C` and the axes. `Element.Anchor` is the centroid or rect centre for columns and walls, and the mid-point of the longest segment for beams.
- **Sizes.** `Details.ColumnSize(el)` gives the bounding (B, D). `Details.DesignSize(el)` gives (B, D, Designable, MinBars, Shape). `Details.ColumnShape(el)` gives (Shape, Dia, Area). `Details.IsHelical(el)` tests for helical ties.
- **Irregular sections.** All in `ColumnShapes.cs` and pure (no CAD types):
  - `ShapeSection` holds Outer and Holes in mm, plus Area, Cx/Cy, Ixx/Iyy/Ixy, Bx/By and Rx/Ry. Shape generators: `Rect`, `L`, `T`, `C`, `Z`, `Plus`, `Stepped`, `Box`.
  - `ShapeLegs.Decompose(s)` returns `List<Leg>` (rectangular legs). `ShapeLegs.Classify` returns the shape name.
  - `ColumnShapeText.Section(Element)` builds the ShapeSection from a drawn outline.
  - Irregular columns are designed by `ShapeColumn.Design` (called from `Gravity.cs:1931`). Walls go through `ShearWallDesign.Design`.
- **Storey of a member.** A member belongs to a plan through `Project.PlanOf(anchor)`, which tests the plan window. Storeys reference plans (`Storey.PlanId`). Stacks across storeys are built by `Stacks.Build(project, all)`; each `Stack` has `ByPlan`, `Storeys`, `Pos` relative to the plan base, and `At(storey)`.
- **Wall openings.** In the plan, openings are only slab voids (`OpeningLayers`, LIFT). Elevation openings in walls are modelled as `ShearWall.cs:145 WallOpening {Start, Width, Sill, Head, Leg}` with `ShearWallDesign.Openings(...)` and `ShearWallDesign.Piers(...)`. **Nothing calls these**: no reader creates a `WallOpening` from the drawing.

## 3. Member identity and numbering
- **Mark storage.** XData app `SBC_STRUCT` (`Store.App`), stored as ASCII strings `key=value`. Read with `Store.Read(obj)` and write with `Store.Write(obj, dict, tr)`.
  - Keys: `kind`, `mark`, `tag` (handle of the mark text), `for` (on the tag: the element's handle), `tp` (tag position), `pair` (the partner line of a two-line beam), `podium`, plus design data such as `thk`, `depth`, `sunk`, `type` and `lock`.
- **Mark texts.** These are DBText items on office layers (`Tags.TextLayer`): `colno` / `P COL NO`, `SLAB NO` / `PO SLAB NO`, and `BEAM NO (H)` / `BEAM NO (V)` (and the PO variants). Fallback layer: `Tags.Layer="SBC-MARK"`. `Tags.Text(el)` hides the C prefix unless `ColumnMarkShowsPrefix` is set.
- **Prefixes.** All in `Settings.cs:116-120`, 85, 90 and 149: `ColumnPrefix` C, `WallPrefix` SW, `BeamPrefix` B, `CantileverPrefix` BC, `SlabPrefix` S, `ChajjaPrefix` CH, `GutterPrefix` SC, `FlatSlabPrefix` FS.
- **Scheme.** `Numbering.Run(db, renumberAll)`:
  - Each plan is numbered on its own (`RunOne(db, renumber, plan)`), so marks restart on every plan.
  - `Stacks.Harmonize(db)` then aligns C and SW marks across plans so a stack keeps one mark from bottom to top.
  - C and SW are numbered in plan order (`Model.PlanOrder(..., 300)`), from max+1, skipping used marks (`NextFree`).
  - Podium members get their own series when `PodiumSeparate` is set (`SeriesStart`).
  - Beams: `MarkBeams` uses `SpanGroups`. On [beta] NUM-2, only a column, shear wall or wall-layer wall starts a new span (`Numbering.cs:863`). BC is used for cantilevers.
  - Slabs: `MarkSlabs` (SlabNaming GROUPED / per panel).
  - `Numbering.MarkNumber(mark, prefix)` parses a mark.
- **Storeys and plans.**
  - `Project` (`Project.cs`) is stored as one Xrecord in the NOD entry `SBC_PROJECT`, with `key=value` strings.
  - `Plan` record: `Id|Name|minx,miny,maxx,maxy|basex,basey` (a window and a base point).
  - `Storey` record: `Name|Height|PlanId|Use|ColumnGrade|BeamSlabGrade|Terrace`.
  - Results go in `res.<key>`. Edited through `ProjectPanel` and the SBCSTOREY / SBCPLANADD commands.
- **Lookup by mark.** There is no central index.
  - In the drawing: `Model.Load` then filter with `e.Kind==k && e.Plan==planId && e.Mark==m` (`Element.SameAs`).
  - In results: `ResultSet.BeamsOf(plan, mark, storey)`, `ResultSet.Columns` (`RColumn.Mark`, `.Storeys`), and `Explain.cs:43-55`, which matches by handle or mark.
  - In project results: the keys `col.<storey>.<mark>` and `wall.<storey>.<mark>`.

## 4. Persistence
- **NOD entries.**
  - `SBC_PROJECT` (one Xrecord: project, storeys, plans, `res.*` strings).
  - `SBC_RESULTS` (`Results.cs:305`; DBDictionary with one Xrecord per record: `[SBCR1, kind, key, JSON chunks of ≤1000 chars]`; kinds META BLDG BEAM COL SWALL SLAB FTG RW STAIR RAMP, plus ETBS on [1.14.2]).
  - `SBC_BARMARKS` (`Detailing\BarMarkStore.cs`).
  - `SBC_QA_WAIVERS` (`QA.cs:1489`).
  - `SBC_GFC_HOLD` (`GfcHold.cs:263`).
  - `SBC_UI` (UiState step stamps: `step.<ID>`=time|fingerprint).
  - `TABLEPLUGIN` and `SBC_TABLEPLUGIN` (`TableFormatDb.cs:17-18`; the Table Plugin DB and registry).
- **`ResultSet`.** Holds `RMeta`, `RBuilding`, `Beams` (`RBeamLine`), `Columns` (`RColumn {Key, Kind COL/SW, Mark, PosX, PosY, Storeys: RColStorey}`), `Slabs`, `Footings`, `RetWalls`, `Stairs`, `Ramps`.
  - `RColStorey` (`Results.cs:160`) holds: Storey, Plan, Handle, Mark, Shape, Status, Links, H, B, D, Dia, N, BarDia, Ldia, Lspc, Lo, Lsc, Pt, P, Pu, Mux, Muy, Ash*, and for walls T, Lw, Vertical and Horizontal. It also has Util, Gov and Checks.
  - Use `Results.Load(db[,tr])` and `Results.Save(db,tr,set)`, with the `Json` helper.
- **Per-member project strings.** `project.Results["col.<storey>.<mark>"]` = `b=;d=;p=;pu=;nbar=;dia=;ldia=;lspc=;pt=;...;lo=;lsc=;links=;shape=;util=;pitch=;method=;st=` (`Gravity.cs:1941-2019`). `wall.<storey>.<mark>` = `t=;l=;pu=;...;v=;h=;shape=;be=E3 16-T20 T8@100 L600|...;lat=;sbe=` (`Gravity.cs:2121`). `lat.<storey>.<mark>` holds the lateral import (`WallHooks.Lateral`).
- **%APPDATA%\SbcStructural.** `settings.ini` (`Settings.cs:290`; overridden by the env var `SBC_SETTINGS_FILE`), `ui.ini` (`SbcUiHost.cs:756` / [beta] `SbcUiPrefs`), `qa_benchmarks.json`, and on [beta] `workspace_backup\`.
- **%LOCALAPPDATA%\SbcStructural.** `Standard\LAYERS.dwg`, `TablePlugin\TablePlugin.lsp`, `crash.log` [1.14.2].

## 5. ETABS lane (Lanes\SbcEtabs, Lanes\SbcModel: offline, not wired into the plugin)
- **Direction SBC to ETABS.**
  - `Lanes\SbcModel\SbcAnalysisModel.cs` is the FROZEN schema (2026-10-02; additive changes only), in namespace SbcModel. Types: Story, Material, FrameSection, Node, Frame (`Mark`, Label = Mark + Story), Wall (`Mark` = pier label), Slab, LoadPattern / Case / Combination, Diaphragm, MassSource.
  - `SbcJson.LoadModel` and `SbcJson.SaveModel` read and write it. `GridModelBuilder` builds a test grid.
  - `AnalysisModelAdapter.From(SbcAnalysisModel, E2kOptions)` returns (E2kModel, opts, warnings).
  - `E2kWriter.Write(E2kModel, E2kOptions)` returns `E2kResult` with the text and `List<MapRecord>`.
  - `E2kTemplate.Filter`, `Missing` and `IsVerified` guard keywords against `Templates\etabs_UNVERIFIED.e2k`. No golden e2k exists yet.
- **Direction ETABS to SBC.**
  - `EtabsTableReader.ReadFile` reads CSV, ETABS key=value text or XLSX into `List<EtabsTable>`. Headers are normalised (`EtabsTable.Norm`) and units come from `EtabsUnits`.
  - `EtabsResults.Add(tables)` reads these tables (normalised names):
    - Element Forces - Beams / Columns (columns Story, Label|Frame, Unique Name, Output Case, Case Type, Step Type, Station, P, V2, V3, T, M2, M3)
    - Pier Forces (Story, Pier, Output Case, Location, P, V2, V3, M2, M3)
    - Story Drifts
    - Story Forces
    - Joint Reactions
    - Modal Participating Mass Ratios
  - **No ETABS concrete-design tables are read.**
  - Output records: `BeamEnvelopes(map)` gives `BeamEnvelope` / `BeamCaseForces {MFaceI, MFaceJ, MSag, VFaceI, VFaceJ, Tmax}`. `ColumnEnvelopes(map)` gives `ColumnEnvelope` / `ColumnCaseForces {PBot, PTop, M2/M3 Bot/Top, Mx/My, V2, V3}`. Also `PierEnvelopes()`, `DriftChecks(0.004)`, `StoreyShears()`, `FoundationLoads(map, lowest)`, `ModalSummary()`.
  - Signs: `SignAdapter` (Axial = -P; beam reversal; column global moments from ANG).
  - Raw rows: `FrameForceRow`, `PierForceRow`, `StoryDriftRow`, `StoryForceRow`, `JointReactionRow`, `ModalRow`.
- **Label mapping.**
  - `MapRecord {Kind COL|BEAM|WALL|SLAB, Mark, Storey, EtabsLabel, Guid, EtabsUnique, Point, Fingerprint, Span, Reversed, X1, Y1, X2, Y2}` (`E2kWriter.cs:38`), stored as map.csv (`MapIo`).
  - `LabelMatcher` order: GUID, then Unique Name, then Label+Story, then geometry within TolMm, then unmatched.
  - `Fingerprint.Of(member)` and `Compare` (SHA-256/16) detect stale results.
- **Back into SBC design.** Only the `lat.<storey>.<mark>` project strings (mu, vu, c, muv, pumin) are read, by `WallHooks.Lateral` / `Options` for walls. There is no importer command in 1.14.x.
- **SBCETABS [1.14.2]** (merge 41e11ed of lane `etabs_export`; files `SbcStructural\EtabsExport.cs` and `EtabsE2k.cs`, namespace `SbcStructural.Etabs`).
  - It exports a gravity model only, from SBC_RESULTS plus the drawing outlines.
  - Files written next to the DWG: `<dwg>_ETABS.e2k`, `<dwg>_ETABS_ref.json` and `<dwg>_ETABS_map.csv` (`E2kMapRow {Kind COLUMN|BEAM|SLAB|SHEARWALL|WALL, Mark, Storey, Label, Section}`).
  - Labels are `Safe(mark)` (letters, digits, `-`, `_`), made unique per geometry with `_2`, `_3` (`LabelTable`).
  - Capture records: `REtabsStorey`, `REtabsPanel`, `REtabsLoad`, `REtabsWall` (Results kind ETBS).
  - Checked by `Build\regression\check_e2k.py`. Viewer: `Build\tools\E2kViewer\e2k_viewer.html`.
  - ETABS is never started. Every keyword is UNVERIFIED.

## 6. Design engine output for column and wall reinforcement
- **Rectangular and circular columns.** `ColumnDesign.Design(b, D, pu, lu, fck, fy, cover, ...)` and `DesignCircular` return `ColumnResult` (`ColumnDesign.cs:7`): N, Dia, N2/Dia2 (mixed), Ldia, Lspc (normal-zone tie spacing), **Lo / Lsc** (IS 13920 confining length and spacing), Ash*, Helical, `BarsText`, `LinkText`.
  - Bar positions: `ColumnDesign.Layout(b, D, n, dia, cover, tie)`.
  - Lap zones: `LapZones(lc, lap, lo, dia)`. `LapLinkSpacing` = 100 over laps. `ConfiningSpacing(least, dMin)`.
- **Irregular columns.** `ShapeColumnResult` (`ColumnShapes.cs:850`): Layout, N, Dia, Pitch, Ldia, Lspc, Lo, Lsc, LapSpc, Ash*, Checks.
  - `ShapeLayout {Bars: ShapeBar(X, Y, Dia, Zone COL|BE|WEB, Leg, Mid); Links: ShapeLink(Kind MASTER RING|CLOSED LINK|END BOX|JUNCTION BOX|OPEN LINK|CROSS TIE, Path, Closed, Dia, Leg, Zone, HookExt, CutLength)}`.
  - Built by `ShapeLayout.Make(sec, legs, cover, linkDia, dia, pitch, wall, ...)`.
- **Shear walls.**
  - Simple wall: `ColumnDesign.DesignWall` returns `WallResult` (VDia/VSpc, HDia/HSpc, Curtains).
  - Leg-designed wall: `ShearWallDesign.Design(ShapeSection, pu, h, fck, fy, ShearWallOptions, muIn, vuIn)` returns `ShearWallResult`: Legs, Zones (`WallZone` BE-END / BE-JUNCTION / WEB), **Boundaries** (`BoundaryElement`: Length, Rows, Bars, DiaOuter/DiaInner graded, HoopDia/HoopSpc, Ash*, OfficeType E3/E5/J5...), Layout, web VDia/VPitch/HDia/HSpc, WebLinkSpc, OpenLinkSpc, SpecialConfining, LateralChecked.
  - Also `ShearWallStack.Ranges(...)` (floor ranges) and `ShearWallDesign.BbsRows(r, h, ...)`.
  - Hooks: `WallHooks.Governing(e)`, `IrregularColumn(e)`, `Redesign(...)`.
- **Where the code rules live.**
  - IS 456 / IS 13920 rules are inline in `ColumnDesign.cs` (constants: EconomicPt 2.5, MaxPt 4.0, LapLinkSpacing 100, MinColB/D, MinWallThk 200, lines 65-73), `ColumnShapes.cs` (`ShapeColumn.Design` doc lists the clauses), `ShearWall.cs`, `Detailing\Laps.cs` (Ld, laps, lap zones) and `Detailing\CutRules.cs` (hooks, cutting lengths).
  - Switches are Settings category "7 Columns & shear walls" (`Settings.cs:231-246`: ColumnEminOneAxis, ColumnSlenderK, WallBoundary rule, WallPitch, WallWebMinDia, ShearWallCover, ...). Covers: `ColumnCover`, `WallCover` (`Settings.cs:134-151`).
  - **There is no single code-table file.** MASTER_PLAN Phase 4 asks for one. Changing a code value means editing the constant or method in that file.
  - Verification tables against the books are in `Docs\notes\bis\`.
- **SbcCalc.** It ports the code; it does not reference it. `SbcCalc\Engine\Is456.cs` ("ported from the SbcStructural plugin") and `ColumnCalc.cs` (ColumnDesign1.xls logic) are separate copies. MASTER_PLAN XC-7 proposes Is456.cs as the single source. XC-8 is open: the column lap is compression in SBC and tension in the calculator.

## 7. Existing drawing and detailing output
- **Column and wall details.**
  - `Details.Column(el)` and `Details.Wall(el)` return a `Sketch` (section with bars and links; `Details.cs:123, 314`).
  - `LinkDetailSketch.Column(e)` and `Wall(e)`, plus `RangeDetails(project, all, scale)` and `RangeSheets(project, all)` (floor-range link details).
  - `ShearWallDetail.cs`: `LinkDetail.FromWall(mark, r)` / `FromColumn(mark, r, sec)`, `LinkDetailGroup.Ranges`, `LinkDetailDraw.Emit(d, ILinkDetailSink, ox, oy)` / `EmitRange` (`DetailDim` tiers 1-3).
- **Elevations and sections.** In `Detailing\`:
  - `ColumnElevation.cs` + `ColumnElevationDraw.cs` (SBCCOLELEV: laps in the middle half, lo zones, 1:6 crank).
  - `FrameElevation*` (SBCELEVATION), `SectionCut` / `SectionDraw` / `BuildingSection*` / `SectionCallouts` (SBCSECTION).
  - `GeneralNotes*` (SBCGENNOTES).
  - `DetailCommands.ColumnSketch(db, tr, project, all, col, scale, alongY, bars, ...)`.
- **Bar marks and BBS.** Bar marks are numbers in circles, from `Detailing\BarMarks.cs` (`BarList`) and `Bar.cs` (`Bar`, `BarShapes`, `Notation`), persisted by `BarMarkStore` (SBC_BARMARKS).
  - BBS: `Bbs.Build(db, tr, p, all)` returns `(List<BarRow>, List<QtyRow>)`, with `Bbs.WriteCsv`, `BbsSketch` and `QuantitySketch`. The COLUMNS group is at `Bbs.cs:768`.
  - BBS is **held** (MASTER_PLAN §10.4).
- **Schedules.** `Schedule.cs` (Simple tables) and `ScheduleRows.cs`. The Table Plugin path is `TableRun.Run` / `SheetItems` with `TableFormat*.cs` (a C# port of TablePlugin.lsp).
  - `TableRun.LspPath()` finds `TablePlugin.lsp` (`TableRun.cs:39-55`). The frozen 3.3 copy is in `Build\tools` on beta.
- **Sheets and GFC.**
  - `Sheets.Run(db, size, scale[, IssueInfo])`: A0-A3 sheets, office frame, layouts (`Sheets.cs:836-879`).
  - `SheetSplit`, and `SheetQa` (overlap count).
  - `Gfc` (SBCGFC: QA gate, Wblock copy, revision, PDF through its own `SheetPdf.Write`).
  - `GfcHold` (non-waivable HOLD).
- **Drawing standard.** `OfficeStd` (`Standard.cs`) imports layers, text styles (`ARIAL`, `TIMES NEW ROMAN`), dim styles (`SBC-100`, `SBC 25`) and blocks from LAYERS.dwg (`TemplatePath()`, `Import`, `EnsureImported`, `Layer`, `TextStyleId`, `DimStyle`). Layer constants: `MAIN TEXT`, `TEXT`, `NOTES`, `DIM`, `LINE- 1/2`, `SBC COMMENTS`.
  - `Sketch.LayerOf` maps logical layers to office layers: OUT→CONCRETE, BAR→REINF, TXT→TEXT, DIM→DIM, HATCH, TBL→LINE- 2, bar dots→DONUT, MAIN, NOTE (`Sketch.cs:248`).
  - `DrawKit` conventions: full size in mm, text height = paper mm × scale, layers `REINF T` / `REINF B`, `STPS.`, `LINKS`.
- **How drawings are inserted.**
  - Everything is built as a CAD-free `Sketch` (Line, Path, Box, Dot, Donut, Text, DimH/DimV, Leader, Level, SecMark), previewed with `Sketch.Paint(Graphics)`, then drawn with `Sketch.Draw(db, tr, origin, tagData)`.
  - The output is loose model-space entities tagged with xdata kind `SKETCH` (or the given tag). No blocks are used.
  - SBCDETAIL (`Commands.cs:874`) asks for a selection and an insertion point, runs `Bbs.Build` for the marks, then draws.

## 8. UI plumbing
- **Commands.** `Commands.cs` (1.14.1) has PANEL, PROJECT, NUMBER, RENUMBER, SCHEDULE, STANDARD, VERSION, RIBBON, SETTINGS, CLEARMARKS, TABLE, SHEETS, TIDYMARKS, PLANADD, STOREY, PROJECTSET, DESIGN, RESULTS, DIAGRAMS, 3D, 3DEXPORT, 3DWEB, BBS, DESIGNTABLES, CHECKS, BEAMINFO, DESIGNSLABS, GENDETAIL, SET, SECTION, ELEVATION, COLELEV, GENNOTES, QA, QAWAIVE, EXPLAIN and DETAIL.
  - GFC and GFCHOLD are in `Gfc.cs` / `GfcHold.cs`. REPORT is also a command.
  - [1.14.2] adds ETABS.
- **Guards [1.14.2].** In `Guard.cs`:
  - `CmdGuard.Run(name, body)` wraps every command (`public void DesignCmd() => CmdGuard.Run("DESIGN", DesignCmdBody);`). On failure it prints "FAILED" and appends to crash.log.
  - `CmdGuard.Safe(what, Action)` guards event handlers.
  - `CmdTime` reports per-command time and memory when `SBC_CMDTIME=1`.
- **Panel [beta].** `SbcUiHost` has tabs `TabWorkflow=0`, `TabMembers=1`, `TabProject=2`.
  - The Workflow tab is built from `UiStep(Id, Num, Title, Description, State todo|stale|done, Actions)` and `UiAction(label, glyph, command-without-prefix, tip, primary)`. The steps are SETUP, NUMBER, CHECK, DESIGN, QA, SHEETS and DIAGRAMS (`SbcUiHost.cs:557-620`).
  - Staleness comes from `UiState` (`SBC_UI` step stamps and the drawing fingerprint) plus the `Upstream` dictionary (line 101).
  - Buttons raise `CommandRequested("DESIGN")`, which the host sends as `SBC<cmd>`.
- **Other UI [beta].** `InlineStrip` (Info, Warn, Confirm, Ask, Error; non-modal; buttons run inside CmdGuard.Safe), `SbcTheme` (brand tokens, dark first), `SbcWorkspace` (layout applied on install, backup and restore).
- **Progress.** Progress is text: `ed.WriteMessage` plus the returned report strings. There is no progress bar API.
- **How a Detailer step would plug in.**
  1. Add a `[CommandMethod(Cmd.P+"DETAILER")]` wrapper with `CmdGuard.Run` in `Commands.cs`.
  2. Add `Upstream["DETAILER"]=new[]{"DESIGN"}` and a `Title` case.
  3. Add a `Step("DETAILER", "…")` or a `UiAction` inside the SHEETS step in `SbcUiHost`.
  4. Read `Results.Load` plus `Model.Load`, build `Sketch` objects, then call `Sketch.Draw`.

## 9. Test harness
- **Regression.** `Build\regression\run_regression.ps1`:
  - Cases: reference, dataplan, dataplan_perspan, edge2, rw_*, framing_v2, slab_types, flat_slab, sloping_roof, verify_edge, beams, stairs, columns_sw, foundations, and others. There are 22 baselines in `baseline\*.json` and 23 inputs.
  - It builds an SBT test DLL, runs ZWCAD 2026 `/b` scripts with a fixed `settings_<case>.ini`, and compares `summary.py` output with `compare.py`.
  - Switches: `-Ext` runs `checks_ext.py` (report, tables, bbs, overlaps, gfc, load_slab, load_storey...); `-Quick`, `-Parallel`, `-Approve` (integrator only).
  - Per-feature checks: `check_*.py`, with generators `make_*.py`.
- **Hand calcs.** `Build\regression\handcalc\run_handcalcs.ps1` is CAD-free. It compiles the plugin `*.cs` plus `Detailing\*.cs`, `HcCore.cs` and `Cases_*.cs` into one exe (prefix HCK). Tolerances: forces ±2 %, steel ±3 %. Column and wall cases: `Cases_Columns.cs`, `Cases_WallsStairs.cs`, `Cases_DbGate.cs`, `Cases_DBBBS.cs`.
- **Other tests.**
  - `Build\tests\colsw\` (colsw_test with `detail_columns.png`, `detail_walls.png`, `expected_output.txt`).
  - `Build\master_check\run_master.ps1`.
  - `Build\stage_signoff\stage1_baseline.json`.
- **Harnesses.** `Build\ReflectHarness` (dnlib metadata check of the obfuscated DLL, `--family`). `Build\Net8Smoke` (loads the ACAD8/GCAD DLL on .NET 8 and .NET 10 and runs pure engine calls). Both are run by `Build\build_release.ps1`.
- **Testing a new module.** Keep the engine PURE (no CAD types, like `Detailing\*.cs` and `ColumnShapes.cs`) so the hand-calc exe compiles it. Add `Cases_<X>.cs`, a small regression case or check script, and an `-Ext` check if it draws. The owner tests the big drawings (MASTER_PLAN §12).

## 10. Docs\release\MASTER_PLAN.md: what it says on detailing, BBS, ETABS and stages
- **Stage order.**
  - Stages: 1 read the drawing, 2 support model, 3 numbering, 4 slab, 5 beam, 6 column/wall, 7 stairs, 8 foundations, 9 special elements, 11 sheets/GFC. Stage 10 is not named in the plan.
  - Releases: 1.14.2 = Phases 0-2 with Stages 1-3 locked and the e2k export marked UNVERIFIED. 1.15.0 = Phase 3 safety plus Stages 4-6. 1.16.0 = Stages 8, 7, 9. 1.17.0 = Stage 11 plus the pilot (OFFICE-READY).
  - Locked stages are frozen tests and change only on the owner's order.
- **Detailing.** Phase 4 column/wall: D-M12/13/14, Fe 500D option, confining hoops, **D-M11 link detail in office format**. Phase 4 beam: TOB on elevations, IS 13920 lap location, merge ELEV.
  - Phase 6 covers sheets/GFC without BBS: layer audit (every object on a LAYERS.dwg layer, BYLAYER), plot test, Table Plugin clean edit (comma crash), HOLD clouds on SBC-HOLD.
  - The release gate includes a DETAILER review (§7).
  - §10.3: small drafting (labels, overlaps, cosmetics) is out of scope for now.
- **BBS.** "BBS is out of this version", probably last (§10.4). It is listed first under Later (1.18+): lap multipliers, shape codes, rounding. The BBS lane is parked as an archive tag.
- **ETABS.** It comes under Later (1.18+) item 3, "ETABS round-trip (export proven first)". The 1.14.2 export is UNVERIFIED. Lateral loads are item 4 and piles item 5.
- **Other rules.**
  - §10.5: never crash, plus a time and memory budget (a slowdown over 10 % fails).
  - §13: XC findings from SbcCalc (XC-7 shared Is456, XC-8 lap question).
  - §14: branding.
  - §15: UI Concept 2 (step-flow, dark first).

## 11. Multi-CAD support as it exists today
**(a) Hosts that are built and tested.**

| Target | Host | Framework | State |
|---|---|---|---|
| ZW (default) | ZWCAD 2020-2026 (built against 2026) | net48 | **Released; the only host the owner allows now** (`PROJECT_STATUS.md:31`: "ZWCAD ONLY until everything is sorted"). Run-tested and regression-tested on ZWCAD 2026 only. Versions 2020-2025 are not API-checked: there is no `Desktop\CAD_DLLs` folder (`notes_multicad.md:107,121,159`). |
| ACAD | AutoCAD 2020-2024 | net48 | Built, obfuscated, packaged, HARNESS PASS, CadCompat 541/541. **Never run in a real AutoCAD**; its in-memory registration is untested (`notes_acad.md:148-153`). Paused. |
| ACAD8 | AutoCAD 2025-2026 | net8.0-windows (compiled against the R23.1 refs) | Same as ACAD, plus Net8Smoke on .NET 8 and .NET 10. Not run in AutoCAD. Paused. |
| GCAD | GstarCAD 2026+ | net8.0-windows | Built, obfuscated, packaged, and **run-tested once in GstarCAD 2026 (trial)**: the full pipeline gave identical results to ZWCAD (`notes_gstar.md` §4). Shipped in the installer since 1.14.0 (`CadGcad.cs` first in commit 5dc6b75, tags v1.14.0 and v1.14.1). Paused by the owner, so experimental. GstarCAD ≤2025 (net48) is **not built** because there are no DLLs (`notes_gstar.md:10`). |
| PCAD | progeCAD | net48, `NO_RIBBON` | Code only (`CadPcad.cs`). Never compiled ("no SDK"); `build_release.ps1` skips it. |

**(b) How the host API is abstracted.**
- `SbcStructural\CadAliases.cs` is the only file with vendor namespaces: `#if ZWCAD` (line 8), `#elif ACAD` (32), `#elif GCAD` (56), `#elif PCAD` (81), and `#error` otherwise (98).
  - It declares global usings for ApplicationServices, DatabaseServices, EditorInput, Geometry, Runtime and Windows.
  - It declares the aliases `CadApp`, `CadColor`, `CadColorMethod`, `CadGeom`, `SpatialFilter`, the ribbon types and `CadRibbonServices`, plus `Exception = System.Exception`.
- `CadZw.cs`, `CadAcad.cs`, `CadGcad.cs` and `CadPcad.cs` each define a `static partial class CadHost` with `Family` and the sysvar names `SvColorTheme`, `SvDwgTitled`, `SvCmdActive` and `SvViewCtr` (all const, so they are inlined). `CadPcad.cs` also has a stub `SbcRibbon`; `Ribbon.cs` is wrapped in `#if !NO_RIBBON`.
- `SbcStructural.csproj:36-56` maps `CadTarget` to the framework, the symbol and the reference DLLs. A build without the probe DLL is SKIPPED. Each non-ZW target gets its own `obj\<CadTarget>\`.
- `Build\CadCompat\Program.cs` has three modes:
  - `refs`: lists every CAD member used.
  - `check <dll> <cadDir> [--map From=To]`: checks exact signatures.
  - `ildump`: proves two builds are IL-identical.
  - It is driven by `Build\check_cad_compat.ps1` (ZWCAD year folders) and `build_release.ps1`.
- `build_release.ps1:187-236`: `$refDirs`, `$apiDirs` (CadCompat targets), `$probes[$cad]` (ConfuserEx probe folders: AutoCAD 2020, AutoCAD 2025 + net8 refs, GstarCAD 2026 + net8 refs, progeCAD) and `$loaderNames`.
  - Steps: obfuscate the plugin and loader per CAD (line 213-214), `FixNet8Module` for ACAD8/GCAD (215), Net8Smoke for ACAD8/GCAD (221-227), ReflectHarness `--family`.
  - It prints "Connectors in this installer: ZW …" (236).
- `LoaderOffline\OfflineLoader.cs`: `#if ZWCAD/ACAD/GCAD/PCAD` (lines 7-21, 39-49). `#if ACAD || GCAD` shares the AutoCAD-style path (69) with the `CadNs`/`CadName` constants, and `#if NET` uses LoadFromStream (84).
  - `SbcLoaderOffline.csproj` builds `SbcLoaderOffline.Acad.dll`, `.Acad8.dll`, `.Gcad.dll` and `.Pcad.dll`, with payloads `plugin_<cad>.dat`.
- **Rules for a new module to stay host-neutral.**
  - Never write `using ZwSoft…`, `Autodesk…`, `Gssoft…` or `Teigha…`. Use only what CadAliases imports.
  - Put any vendor-only member in `CadHost`.
  - Keep the engine pure (no CAD types) and draw through `Sketch`.
  - Never sort marks or text with the culture comparer. .NET 8 (ICU) and .NET Framework sort differently: see `Bbs.BarOrder`, `#if NET`, `Bbs.cs:1860-1867`, and `notes_gstar.md:62`.
  - Re-run CadCompat. Every new CAD member must exist in all targets (541 members today).

**(c) Known GstarCAD gaps.**
- **Ribbon:** the SBC tab is added but **not visible** in GstarCAD 2026. It needs a CUIX partial menu, which is an owner decision (`notes_gstar.md:45,64`; `PROJECT_STATUS.md:1146`). The WPF palette (SBC panel) works (`notes_gstar.md:44`).
- **.NET API:** no differences were found: 541/541 members match with `--map Autodesk.AutoCAD=Gssoft.Gscad` (`notes_gstar.md:6`). The only runtime difference is the .NET 8 sort order (fixed with `Bbs.BarOrder`). Autoload uses the `HKCU\Software\Gstarsoft\GstarCAD\R26\<lang>\Applications` key (`notes_gstar.md:9`).
- **Layouts:** SBTSHEETS made 49 A1 layouts, the same as ZWCAD. GstarCAD writes the default paper-space viewport only when a layout is opened (`notes_gstar.md:34,40`).
- **Plotting:** PDF output is SBC's own writer (`Gfc.cs:676 SheetPdf.Write`), not the host plot engine, so it should not depend on the host. The GFC/PDF path has not been tested in GstarCAD.
- **Blocks and xrefs:** `StructuralBlocks` [beta] uses the shared API, but it has **not been run** in GstarCAD. The GstarCAD test predates NUM-1.
- **Table Plugin LISP:** it is loaded with `doc.SendStringToExecute("(load …TablePlugin.lsp)")` (`TableRun.cs:73-74`). There is **no record** of TablePlugin.lsp being tested in GstarCAD (it is not mentioned in notes_gstar or notes_multicad).
- **WinForms on .NET 8** uses a different default font, so palette layout may shift (`notes_acad.md:152`).
- **Regression harness:** it drives **ZWCAD 2026 only**: `run_regression.ps1:34,199` (`$ZwCad` = ZWCAD.exe) and `master_check\run_master.ps1:22`. The GstarCAD comparison was a one-off manual `/b` script run with `dxfcmp.py` (`notes_gstar.md` §4). Hand calcs and Net8Smoke do not need a CAD.

**(d) How drawing output stays the same across hosts.**
- The same source and the same `Sketch.Draw` path (`Sketch.cs:268`) create the entities, with layers, text styles and dim styles taken from LAYERS.dwg through `OfficeStd.Import` (`Standard.cs:116-192`: `ReadDwgFile`, then `WblockCloneObjects` of text styles, dim styles and blocks; layers through `OfficeStd.Layer`).
- Logical layers map to office layers in `Sketch.LayerOf` (`Sketch.cs:248-266`). No host-specific drawing code exists.
- Verified once: the ZWCAD and GstarCAD DESIGNED.dxf files (198k entities) matched within 0.1 mm for MLINE, hatches, text alignment, dimensions and blocks (`notes_gstar.md:40`).
