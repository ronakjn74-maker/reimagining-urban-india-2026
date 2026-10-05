# ETABS → SBC Detailer: Design-Data Research Note

Prepared for the SBC Detailer planning panel (RCC column + shear-wall detailing module; C#, .NET Framework 4.8, ZWCAD/GstarCAD plugin; IS 456:2000 + IS 13920:2016).

Legend for confidence:
- **[V]** verified against CSI documentation / a real ETABS output document fetched during this research.
- **[K]** from working knowledge of ETABS and widely reported in forums; not re-verified this session.
- **(verify)** inferred, or header text that is known to vary by version; must be confirmed against the owner's own ETABS installation before being hard-coded.

Research constraints: no ETABS install or model was available. Several CSI API help pages, the CSI IS 456 concrete-frame manual (ETABS 2016 edition, ISO ETA122815M29), the ETABS v22.6.0 release notes, the CSI Export / Labels-and-Unique-Names help pages, and a real ETABS 18.1.1 IS 456 Shear Wall Design report were fetched. Scribd-hosted sample exports were blocked (403), so some exported table headers are reconstructed from memory and marked accordingly.

---

## 1. Channels for getting design data out of ETABS

### 1(a) Interactive table export (Display > Show Tables → File > Export)

**[V]** `Display > Show Tables` opens the *Choose Tables* form, a tree with three roots: **MODEL**, **ANALYSIS RESULTS**, **DESIGN**. CSI states there are 500+ table types. Load cases/combinations to include, "Selection Only", and units are set in the *Table Options* / *Choose Tables* form.

**[V]** From the table viewer the data can be exported; `File > Export` at the main menu also offers "ETABS Tables to Excel" and "ETABS Tables to Access" ("select the table types to be saved in a format compatible with Microsoft Excel / Access"). **[K]** The table viewer's own File menu additionally offers "Export Current Table / All Tables to Excel, Access, Text (CSV-like, tab/comma), XML". **[K]** In Excel export, each table becomes one worksheet; the worksheet name is the table name (truncated to Excel's 31-char limit, which **mangles long design-table names such as "Concrete Column Design Summary - IS 456:2000"**); row 1 = table title, row 2 = headers, row 3 = units, data from row 4 (verify exact row layout per version, it changed between v17 and v18+).

**[K]** Design tables only appear in the tree after the corresponding design has been run (Design > Concrete Frame Design > Start Design/Check; Design > Shear Wall Design > Start Design/Check) in the current session or the design results are saved in the .EDB. If the model is re-analysed, design results are invalidated and the tables disappear until design is re-run.

**[K]** Exported design tables contain **only the members that were designed and only for the selection filter** in effect. "Selection Only" is a common cause of partial exports.

Practical consequence: the Excel/Access export is a "file hand-off" channel — the designer runs the design, exports once, and the detailer consumes the file without ETABS present.

### 1(b) The .e2k / $et text model file

**[V]** `File > Export > ETABS .e2k Text File` "saves the model as text input; it can be re-imported". The CSI Export help lists it only as a model-input format. **[V]** CSI release notes (v22.6.0, ticket 11383) describe .e2k round-trip of *material properties*, i.e. model data. **[K]** The `$et` file is the same format auto-written beside the .EDB when the model is saved (controlled by a preference), with the same content.

What the .e2k **does** contain (all **[K]**, consistent with the format's purpose):
- `$ STORIES` (story names, heights, elevations, master/similar), `$ GRIDS`, units line (`$ UNITS` e.g. `kN m C`), `$ MATERIAL PROPERTIES`
- `$ FRAME SECTIONS` (incl. `SHAPE "Concrete Rectangular"`, `D`, `B`, `MATERIAL`) and **concrete rebar data for the section** (`REBARMATL`, `COVER`/`CLEARCOVER`, `NUMBARS3DIR`/`NUMBARS2DIR` or `R3BARS`/`R2BARS`, `BARSIZE`, `TIEBARSIZE`, `TIESPACING`, `CONFIGURATION "Rectangular"/"Circular"`, `DESIGN "Design"` or `"Check"` ← this is the design-vs-check flag per section)
- `$ SECTION DESIGNER SECTIONS` (shape polygons and reinforcing for SD sections)
- `$ WALL/SLAB/DECK PROPERTIES` (`WALL "W200" ... THICKNESS 0.2 ...`)
- `$ POINT COORDINATES` (plan X,Y per point label with per-story Z via story elevation), `$ LINE CONNECTIVITIES` (`LINE "C12" COLUMN "1" "1" 1` ← label, type, point i, point j, story offset), `$ AREA CONNECTIVITIES`
- `$ LINE ASSIGNS` (`LINEASSIGN "C12" "Story3" SECTION "C300X600" ANG 90 ...`), `$ AREA ASSIGNS` (`AREAASSIGN "W1" "Story3" SECTION "W200" PIER "P1" ...`)
- `$ PIER/SPANDREL NAMES`, `$ CONCRETE DESIGN PREFERENCES`/`OVERWRITES`, load patterns/cases/combos

What it does **NOT** contain:
- **[V by omission / K]** No analysis results, **no design results** of any kind — no required rebar areas, no ratios, no Av/s. It is a pure input deck.
- Unique names of objects are not stored in older versions (objects are Label + Story); **[K]** newer versions (v17+) write `$ ... UNIQUE NAMES` blocks or `GUID` keys in some tables (verify per version).

Use for the detailer: the .e2k is the cheapest machine-readable source of **geometry, section, rebar-template, pier-label, story** data when no API is available, and it is produced by every ETABS version. It cannot replace the design tables.

### 1(c) ETABS OAPI (COM)

**Assemblies / ProgIDs** [V/K]
- ETABS 2013–2016: `ETABS2013.dll … ETABS2016.dll` (namespace `ETABS2016`, interface `cOAPI`, `cSapModel`, `cHelper`/`Helper`).
- ETABS 17+ (v17, v18, v19, v20, v21, v22): single **`ETABSv1.dll`** (namespace `ETABSv1`), kept backward compatible across versions. **[V]** CSI API docs for ETABS 2015/2016 and the v1 docs share the same method names and parameter lists for all functions cited below (checked for `GetSummaryResultsColumn` on the 2015 and 2016 pages). Also `CSiAPIv1.dll` is the cross-product (SAP2000/ETABS/CSiBridge) wrapper with the same interfaces [K].
- ProgID for a running instance: **`"CSI.ETABS.API.ETABSObject"`** [V]. Attach pattern (C#):
  ```csharp
  // 1) Running instance (recommended for a plugin that only reads)
  var etabs = (ETABSv1.cOAPI)System.Runtime.InteropServices.Marshal.GetActiveObject("CSI.ETABS.API.ETABSObject");
  // or, cleaner since ETABS 2015: 
  ETABSv1.cHelper helper = new ETABSv1.Helper();
  ETABSv1.cOAPI etabs = helper.GetObject("CSI.ETABS.API.ETABSObject");   // [V] cHelper has GetObject(string)
  // 2) New instance
  ETABSv1.cOAPI etabs = helper.CreateObjectProgID("CSI.ETABS.API.ETABSObject"); etabs.ApplicationStart();
  ETABSv1.cSapModel m = etabs.SapModel;
  ```
  `Marshal.GetActiveObject` is **removed in .NET 5+/.NET Core** but exists in **.NET Framework 4.8** — fine for this plugin [K]. Note: `GetActiveObject` only finds an instance registered in the Running Object Table (ROT); ETABS registers itself on start, but a UAC-elevation mismatch (ETABS as admin, CAD as user, or vice-versa) makes the ROT lookup fail [K].

**Bitness / process** [K]: ETABS 2015+ is 64-bit only; the API is in-process COM, so the calling process must be **x64**. ZWCAD/GstarCAD 64-bit plugins are x64 → compatible. Calling from a 32-bit host would require an out-of-process broker.

**Licensing** [V/K]: API calls go through a running ETABS (`ApplicationStart` or an already-running instance), and that instance **consumes a normal ETABS licence**. There is no "API-only" or read-only licence. CSI's API help notes the API is available in all licence levels (Plus and above—verify: older docs restricted the API to the Plus/Nonlinear/Ultimate levels). Reading design results through the API additionally requires that the design has been run in that instance (or saved in the .EDB opened in it).

**Units** [K]: `SapModel.GetPresentUnits()` / `SetPresentUnits(eUnits.kN_mm_C)` set the units for all API numeric values and for `DatabaseTables` output. Set `kN_mm_C` explicitly before reading anything.

**Relevant functions and signatures** (ETABS v1 API; `ret` is `int`, 0 = success):

*Database tables* (`SapModel.DatabaseTables`) — signatures reconstructed from the CSI API help as paraphrased by forum code and the EtabSharp wrapper [V for names/arg lists, verify exact order]:
```csharp
int GetAvailableTables(ref int NumberTables, ref string[] TableKey, ref string[] TableName, ref int[] ImportType);
int GetAllTables(ref int NumberTables, ref string[] TableKey, ref string[] TableName, ref int[] ImportType, ref bool[] IsEmpty);
int GetAllFieldsInTable(string TableKey, ref int TableVersion, ref int NumberFields, ref string[] FieldKey, ref string[] FieldName, ref string[] Description, ref string[] UnitsString, ref bool[] IsImportable);
int GetTableForDisplayArray(string TableKey, ref string[] FieldKeyList, string GroupName, ref int TableVersion, ref string[] FieldsKeysIncluded, ref int NumberRecords, ref string[] TableData);
int GetTableForDisplayCSVFile(string TableKey, ref string[] FieldKeyList, string GroupName, string csvFilePath);
int GetTableForDisplayCSVString(string TableKey, ref string[] FieldKeyList, string GroupName, ref string csvString);
int SetLoadCasesSelectedForDisplay(ref string[] LoadCaseList);
int SetLoadCombinationsSelectedForDisplay(ref string[] LoadCombinationList);
int SetLoadPatternsSelectedForDisplay(ref string[] LoadPatternList);
```
- `TableKey` is the table's **name as shown in Show Tables** (e.g. `"Frame Assignments - Summary"`, `"Concrete Column Design Summary - IS 456:2000"`) [V: forum examples use the display name]. `GetAvailableTables` returns only tables that currently have data; `GetAllTables` returns everything with `IsEmpty`.
- `FieldKeyList`: pass an empty array to get all fields. `GroupName` = `"All"` or a defined group to filter.
- `TableData` is a **flattened row-major** string array: `TableData[r*nFields + f]` [V]. All values are strings in the **present units**; parse with `InvariantCulture`.
- `DatabaseTables` exists since **ETABS 2017 (v17)** [K]; absent in 2013–2016. For older versions only the typed functions below exist.

*Concrete frame design* (`SapModel.DesignConcrete`) [V from CSI help]:
```csharp
int GetSummaryResultsColumn(string Name, ref int NumberItems, ref string[] FrameName, ref int[] MyOption,
    ref double[] Location, ref string[] PMMCombo, ref double[] PMMArea, ref double[] PMMRatio,
    ref string[] VMajorCombo, ref double[] AVMajor, ref string[] VMinorCombo, ref double[] AVMinor,
    ref string[] ErrorSummary, ref string[] WarningSummary, eItemType ItemType = eItemType.Objects);
```
  - `MyOption`: **1 = Check, 2 = Design** per frame. `PMMArea` [L²] "total longitudinal rebar area for axial + biaxial moment" **valid only when MyOption = 2**; `PMMRatio` **valid only when MyOption = 1**. `AVMajor`/`AVMinor` [L²/L] = required shear reinforcement area per unit length (the Av/s). `Location` [L] from I-end. One record per design station per member (so several rows per column). `ItemType`: Objects(0) / Group(1) / SelectedObjects(2).
```csharp
int GetSummaryResultsBeam(string Name, ref int NumberItems, ref string[] FrameName, ref double[] Location,
    ref string[] TopCombo, ref double[] TopArea, ref string[] BotCombo, ref double[] BotArea,
    ref string[] VMajorCombo, ref double[] VMajorArea, ref string[] TLCombo, ref double[] TLArea,
    ref string[] TTCombo, ref double[] TTArea, ref string[] ErrorSummary, ref string[] WarningSummary, eItemType ItemType);
int GetSummaryResultsJoint(string Name, ref int NumberItems, ref string[] FrameName,
    ref string[] LCJSRatioMajor, ref double[] JSRatioMajor, ref string[] LCJSRatioMinor, ref double[] JSRatioMinor,
    ref string[] LCBCCRatioMajor, ref double[] BCCRatioMajor, ref string[] LCBCCRatioMinor, ref double[] BCCRatioMinor,
    ref string[] ErrorSummary, ref string[] WarningSummary, eItemType ItemType);   // [V page exists; arg names verify]
int GetCode(ref string CodeName); int SetCode(string CodeName);          // "IS 456:2000"
int StartDesign(); int GetResultsAvailable(ref bool ResultsAvailable);   // [K]
int GetDesignSection(string Name, ref string PropName);                  // [K] design section may differ from analysis section
int SetDesignSection(string Name, string PropName, bool LastAnalysis);   // [V page exists]
int GetOverwrite/SetOverwrite(...)  // code-specific item numbers [K]
```
  These summary functions give **no joint-shear/confinement/boundary data for columns** beyond PMM + Av/s; details only via database tables.

*Shear wall design* [K, verify]: there is **no `cDesignShearWall` interface** with `GetSummaryResults` in the public API through v22 (the API exposes `DesignShearWall` only for code/preferences setting in recent versions — `SapModel.DesignShearWall.GetCode/SetCode/StartDesign` (verify) ). **Pier design results must be read via `DatabaseTables`** ("Shear Wall Pier Design Summary - IS 456:2000") or from the report.

*Pier / spandrel labels* (`SapModel.PierLabel`, `SapModel.SpandrelLabel`) [V]:
```csharp
int GetNameList(ref int NumberNames, ref string[] MyName);
int GetPier(string Name);                 // exists? 0 = yes [V page exists]
int GetSectionProperties(string Name, ref int NumberStories, ref string[] StoryName, ref double[] AxisAngle,
    ref int[] NumAreaObjs, ref int[] NumLineObjs, ref double[] WidthBot, ref double[] ThicknessBot,
    ref double[] WidthTop, ref double[] ThicknessTop, ref string[] MatProp,
    ref double[] CGBotX, ref double[] CGBotY, ref double[] CGBotZ, ref double[] CGTopX, ref double[] CGTopY, ref double[] CGTopZ);
```
  `GetSectionProperties` is the single most useful call for walls: per story it gives the pier's **axis angle, equivalent width (length) and thickness at top/bottom, CG coordinates**, and counts of area/line objects.

*Frame objects* (`SapModel.FrameObj`) [V]:
```csharp
int GetLabelFromName(string Name, ref string Label, ref string Story);
int GetNameFromLabel(string Label, string Story, ref string Name);
int GetLabelNameList(ref int NumberNames, ref string[] MyName, ref string[] MyLabel, ref string[] MyStory);
int GetNameList(ref int NumberNames, ref string[] MyName);
int GetPoints(string Name, ref string Point1, ref string Point2);
int GetSection(string Name, ref string PropName, ref string SAuto);
int GetLocalAxes(string Name, ref double Ang, ref bool Advanced);        // rotation about local 1 (deg)
int GetDesignOrientation(string Name, ref eFrameDesignOrientation DesignOrientation); // Column/Beam/Brace/Null/Other [K]
int GetGUID(string Name, ref string GUID); int SetGUID(string Name, string GUID = "");  // [K]
int GetPier(string Name, ref string PierName);  // frame objects can carry pier labels too [V page exists]
int GetInsertionPoint(string Name, ref int CardinalPoint, ref bool Mirror2, ref bool Mirror3, ref bool StiffTransform, ref double[] Offset1, ref double[] Offset2, ref string CSys); // [K] cardinal point affects where the section sits vs the line
```
*Point objects* (`SapModel.PointObj`) [V/K]:
```csharp
int GetCoordCartesian(string Name, ref double X, ref double Y, ref double Z, string CSys = "Global");
int GetLabelFromName(string Name, ref string Label, ref string Story);
int GetNameFromLabel(string Label, string Story, ref string Name);
```
*Stories* (`SapModel.Story`) [V]:
```csharp
int GetStories(ref int NumberStories, ref string[] StoryNames, ref double[] StoryElevations, ref double[] StoryHeights,
    ref bool[] IsMasterStory, ref string[] SimilarToStory, ref bool[] SpliceAbove, ref double[] SpliceHeight);
int GetStories_2(ref double BaseElevation, ref int NumberStories, ref string[] StoryNames, ref double[] StoryElevations,
    ref double[] StoryHeights, ref bool[] IsMasterStory, ref string[] SimilarToStory, ref bool[] SpliceAbove,
    ref double[] SpliceHeight, ref int[] Color);    // v17+ [K]
int GetElevation(string Name, ref double Elevation); int GetHeight(string Name, ref double Height);  // [V]
```
*Frame section properties* (`SapModel.PropFrame`) [K, standard across SAP/ETABS]:
```csharp
int GetRectangle(string Name, ref string FileName, ref string MatProp, ref double T3, ref double T2, ref int Color, ref string Notes, ref string GUID);   // T3 = depth (along local 3), T2 = width
int GetCircle(string Name, ref string FileName, ref string MatProp, ref double T3, ...);
int GetRebarColumn(string Name, ref string MatPropLong, ref string MatPropConfine, ref int Pattern, ref int ConfineType,
    ref double Cover, ref int NumberCBars, ref int NumberR3Bars, ref int NumberR2Bars, ref string RebarSize, ref string TieSize,
    ref double TieSpacingLongit, ref int Number2DirTieBars, ref int Number3DirTieBars, ref bool ToBeDesigned);
    // Pattern 1=rectangular 2=circular; ConfineType 1=ties 2=spiral; ToBeDesigned = true → "Design", false → "Check"
int GetTypeOAPI(string Name, ref eFramePropType PropType);   // eFramePropType.SD = Section Designer
int GetSDSection(string Name, ref string MatProp, ref int NumberItems, ref string[] ShapeName, ref int[] MyType, ref int DesignType, ref int Color, ref string Notes, ref string GUID);
    // DesignType: 0 = no design, 1 = design as general steel, 2 = design as concrete column (check only, rebar as drawn) [K]
// SapModel.PropFrame.SDShape.GetPolygon / GetReinfSingle / GetReinfLine / GetReinfCorner ... for SD shape geometry & bars [K; release note 11268 confirms GetReinfLine exists]
```
*Area objects / wall sections* [V/K]:
```csharp
int AreaObj.GetPier(string Name, ref string PierName);                                   // [V]
int AreaObj.GetSpandrel(string Name, ref string SpandrelName);
int AreaObj.GetPoints(string Name, ref int NumberPoints, ref string[] Point);            // [K]
int AreaObj.GetProperty(string Name, ref string PropName);                               // wall section name [K]
int AreaObj.GetLabelFromName / GetNameFromLabel / GetLabelNameList                       // [V]
int AreaObj.GetDesignOrientation(string Name, ref eAreaDesignOrientation Orientation);   // Wall / Floor / Ramp / Null [K]
int AreaObj.GetThickness(...)  // NOTE: this is the *thickness overwrite* per object (ThicknessType, ThicknessPattern, values at points) [K], not the section thickness
int PropArea.GetWall(string Name, ref eWallPropType WallPropType, ref eShellType ShellType, ref string MatProp, ref double Thickness, ref int Color, ref string Notes, ref string GUID);  // [K]
```

**API version matrix** [K, verify against owner's installation]:
| ETABS | API dll | DatabaseTables | IS 13920 edition in design | Notes |
|---|---|---|---|---|
| 2015 / 2016 | ETABS2015.dll / ETABS2016.dll | no | 1993 | summary functions only |
| 17 | ETABSv1.dll | yes (introduced) | 2016 (from v17.0.1, verify) | first "v1" API |
| 18, 19 | ETABSv1.dll | yes | 2016 | design-table keys stabilised; sample pier report above is v18.1.1 |
| 20, 21, 22 | ETABSv1.dll | yes | 2016 | v22.6 adds "Ordinary Wall" overwrite for IS 456 piers (previously *all* piers designed as Special Wall per IS 13920) [V] |

---

## 2. Database table names and column headers

Table **names** below are the Show Tables display names (= `TableKey`). Header casing: in the **table viewer and Excel export headers are the "display names" with spaces** (e.g. "Unique Name", "PMM Ratio"); the **API `FieldKey` and the Access/CSV exports use the compact key without spaces** (e.g. `UniqueName`, `PMMRatio`) [K]. The detailer's importer should normalise by removing spaces and comparing case-insensitively.

### 2.1 Model tables (stable across v17–v22) [K; headers verify]

**"Story Definitions"** — `Tower` (only if towers enabled) | `Name` | `Height` | `Elevation` (v18+ includes Elevation; older has Height only, compute elevation by cumulative sum — verify) | `Master Story` | `Similar To` | `Splice Story` | `Splice Height` | `Color` | `GUID`.

**"Frame Assignments - Summary"** — `Story` | `Label` | `Unique Name` | `Design Type` (Column/Beam/Brace) | `Design Procedure`? (Concrete Frame / Steel Frame / None) | `Analysis Section` | `Design Section` | `Length` | `Angle` (local-axis rotation, deg) | `Cardinal Point`/`Insertion Point` | `Offset`… (exact set varies; `Design Section` ≠ `Analysis Section` after a design-section change or auto-select).

**"Frame Assignments - Section Properties"** — `Story` | `Label` | `Unique Name` | `Shape`? | `Auto Select` | `Section` [V-ish from search snippet: "Story, Label, UniqueName, Shape, Auto Select, Section"].

**"Frame Assignments - Local Axes"** — `Story` | `Label` | `Unique Name` | `Angle` | `Advanced` [K].

**"Frame Sections"** — `Name` | `Material` | `Shape` ("Concrete Rectangular", "Concrete Circle", "SD Section", …) | `t3` (depth) | `t2` (width) | `Area` | `J` | `I22` | `I33` | … | `Color` | `GUID` [K]. Rebar template per concrete section is in **"Frame Section Property Definitions - Concrete Rectangular"** (and "- Concrete Circle") with fields `Name` | `Material` | `Depth (t3)` | `Width (t2)` | `Rebar Material` | `Rebar Confine Material` | `Rebar Pattern` | `Clear Cover` | `# Bars 3-dir` | `# Bars 2-dir` | `Bar Size` | `Tie Size` | `Tie Spacing` | `# Ties 2-dir`/`3-dir` | `Design Type`/`Reinforcement Type` = **"Design"/"Check"** [K; this is the design-vs-check flag; header text (verify)].

**"Section Designer Properties"** / "Frame Section Property Definitions - Section Designer" (v20+ has "SD Section Data" group of tables: shapes, polygons, rebar) [K].

**"Point Object Connectivity"** — `Story` | `Label` | `Unique Name` | `X` | `Y` | `Z` | `Is Special`/`Is Auto Point` | `GUID` [K].
**"Frame Object Connectivity"** (older: "Line Connectivity") — `Story` | `Label` | `Unique Name` | `Design Type`/`Type` | `Point I`/`UniquePtI` | `Point J`/`UniquePtJ` | `Length` | `GUID` [K; v17 used "Line Object Connectivity"/"Beam/Column Object Connectivity" split tables — verify].
**"Area Object Connectivity"** — `Story` | `Label` | `Unique Name` | `Object Type` (Wall/Floor/…) | `Number of Points` | `Point 1 … Point n` (`UniquePt1…`) | `Area`/`Perimeter` | `GUID` [K].

**"Area Assignments - Pier Labels"** — `Story` | `Label` | `Unique Name` | `Pier Name` [K]. ("Area Assignments - Spandrel Labels" same shape.) "Frame Assignments - Pier Labels" exists for line-element piers.

**"Area Assignments - Section Properties"** (or "- Summary") — `Story` | `Label` | `Unique Name` | `Section` (wall section name) [K].
**"Wall Property Definitions"** / "Area Section Properties - Wall" (older "Wall/Slab/Deck Properties") — `Name` | `Material` | `Thickness` | `Type` (Specified/Auto-select) | `Modelling Type`? | `Color` | `GUID` [K].

**"Pier Section Properties"** — one row per pier per story [V semantics via API `GetSectionProperties`; header text K]: `Story` | `Pier` | `Axis Angle` | `# Area Objs` | `# Line Objs` | `Width Bot` | `Thick Bot` | `Width Top` | `Thick Top` | `Material` | `CG Bot X/Y/Z` | `CG Top X/Y/Z`. This is the best wall "geometry hint" table.

**"Pier Labels"** / "Pier Names" — list of defined pier labels [K].

### 2.2 Concrete column design tables (IS 456:2000)

**"Concrete Column Design Summary - IS 456:2000"** (table viewer title; in exported reports it prints as "Concrete Column Summary - IS 456-2000" — colon vs hyphen varies between report and table, **match with a regex `IS\s*456[:\- ]?2000`**) [V title fragment from search snippet; headers K/(verify)]:

| Header (display) | Key | Units | Meaning |
|---|---|---|---|
| Story | Story | | |
| Label | Label | | e.g. C12 |
| Unique Name | UniqueName | | integer-like string |
| Design Section (or "Section") | DesignSect | | design section name |
| Design Type | DesignType | | "Column" (some versions) |
| Status (or "Design/Check") | Status | | "Design"/"Check"/"No messages"/"O/S …" (verify) |
| PMM Combo | PMMCombo | | controlling combo |
| Station Loc (or "Station") | Location | mm | from I-end |
| PMM Ratio | PMMRatio | | **Check mode only**, else blank |
| Rebar Area (or "PMM Area" / "Longitudinal Rebar Area") | PMMArea / RebarArea | mm² | **Design mode only** |
| Rebar % | RebarPct | % | ratio of gross area |
| V Major Combo | VMajorCombo | | |
| Av/s Major (or "Shear Rebar Major" / "AvMajor") | AVMajor | mm²/m | required stirrup area per unit length, major |
| V Minor Combo | VMinorCombo | | |
| Av/s Minor | AVMinor | mm²/m | |
| Joint Shear Combo / Ratio (Major, Minor) | JointShear… | | informational (IS 13920 Draft/2016 joint check); may be in a separate "Concrete Joint Design Summary" table (verify) |
| B/C Ratio (Major, Minor) | BCCRatio… | | beam/column capacity ratio (ductile frames only) |
| Error / Warning | ErrorSummary / WarningSummary | | text |

**[V]** The report counterpart (sample ETABS report, IS 456) has blocks "Design Pu, Design Mu2, Design Mu3, Minimum M2, Minimum M3, Rebar Area (mm²), Rebar %" and "Design Vu, Station Loc, Controlling Combo" — confirming the data items even where table header spelling is unverified.

**"Concrete Column PMM Details - IS 456:2000"** [K/(verify) — in v18+ the name is "Concrete Column Design Details"/"… PMM Details"]: `Story` | `Label` | `Unique Name` | `Section` | `Combo` | `Station` | `Pu` | `Mu2` | `Mu3` | `Pu Capacity`? | `Mu2 Capacity` | `Mu3 Capacity` | `PMM Ratio` | `Rebar Area` | `Rebar %` | `Min M2`/`Min M3` (min eccentricity moments) | `δns`/`δs` magnification factors | `Le/D` slenderness … Exact set varies; one row per combo per station (large).

**"Concrete Column Shear Details - IS 456:2000"** [K/(verify)]: `Story` | `Label` | `Unique Name` | `Combo` | `Station` | direction (`Major`/`Minor` or two row-sets) | `Vu` (design shear) | `Vp`/`Capacity Shear` (ductile: 1.4(MuBL+MuBR)/H) | `Pu` | `τv` | `τc`/`Vc` | `Vs` | `Av/s` (mm²/m) | `Combo`. Confirms whether capacity shear governs.

**"Concrete Joint Design Summary - IS 456:2000"** (or "… Joint Shear …") [K]: `Story` | `Label` | `Unique Name` | `Joint Shear Ratio Major/Minor` + combos | `B/C Ratio Major/Minor` + combos. Only reported for Ductile frames with seismic combos [V from manual].

### 2.3 Shear wall pier design tables (IS 456:2000)

**"Shear Wall Pier Design Summary - IS 456:2000"** [K/(verify); older versions titled "Pier Design Summary"]. Content mirrors the verified report [V, ETABS 18.1.1 "IS 456:2000 Pier Design" report]:

| Header | Units | Meaning |
|---|---|---|
| Story | | |
| Pier (or "Pier Label"/"Label") | | e.g. P14 |
| Station (Location) | | "Top"/"Bottom" |
| Design Type / Pier Type | | "Uniform Reinforcing", "Simplified C and T", "General Reinforcing" (SD) (verify header) |
| Edge Bar / End Bar (Uniform piers) | | bar size designation, e.g. "16d"/"#5"; only for Uniform Reinforcing piers (verify) |
| Edge Spacing / End Spacing | mm | |
| Required Reinf Ratio | | ρ required (flexure PMM) **[V in report]** |
| Current Reinf Ratio | | ρ provided by the pier's uniform template **[V in report]** |
| Required Rebar Area | mm² | total vertical rebar required **[V in report, 2163 mm² e.g.]** |
| Flexural Combo | | controlling combo **[V]** |
| Pu, Mu2, Mu3 | kN, kN·m | at controlling combo **[V]** |
| Pier Ag | mm² | gross area **[V]** |
| Shear Rebar | mm²/m | horizontal shear reinforcement per unit height per leg; "OS" if overstressed (`Vu > Vmax`) **[V: "Rebar mm²/m … OS"]** |
| Shear Combo, Pu, Mu, Vu, Vc, Vc+Vs | | **[V]** |
| D/C or Status | | (verify) |
| Boundary Element (BZone) Length / "Edge Length" | mm | per edge (Top-Left, Top-Right, Bottom-Left, Bottom-Right); **[V in report: "Boundary Element Check … Edge Length (mm) … Stress Comp, Stress Limit"]** |
| Governing Combo, Pu, Mu, Stress Comp (MPa), Stress Limit (MPa) | | compressive-stress check: `Stress Comp > Stress Limit (0.2 fck)` ⇒ boundary element required (IS 13920 10.4.1) **[V data; interpretation K]** |

Notes [V from report]: piers have **Legs** (`Leg 1`, `Leg 2`…) for non-planar piers; the report gives per-leg `Left X1, Left Y1, Right X2, Right Y2, Length, Thickness` at Top and Bottom — this is the pier geometry in global coords and is the best geometry hint when available (table "Shear Wall Pier Design Details …" (verify) or "Pier Section Properties").

**"Shear Wall Pier Design Details - IS 456:2000"** (verify name; may be split into "… Flexural Details", "… Shear Details", "… Boundary Element Details" in v20+) — one row per combo per station per leg, with the fields above plus `Design Pu/Mu/Vu`, `LLRF`, material `fck/fy/fys`, `IPMAX/IPMIN/PMAX` design parameters [V items present in report, table naming K].

**Simplified C&T piers** (not in the sample report) [K from the Shear Wall Design manual]: output is `DB1` (edge member length along wall), `DB2` (edge member thickness), `Left/Right Edge Rebar Area` (As required at each end), `Required/Current Reinf Ratio`, and `Boundary Zone Length` per edge. These exist only when the pier overwrite "Design is Simplified C and T" is chosen.

**"Shear Wall Spandrel Design Summary - IS 456:2000"** — coupling beams; out of scope for V1 but same shape (top/bottom flexural area, shear rebar, diagonal rebar) [K].

### 2.4 Report tables vs database tables
The *Design Report* (Design > … > Display Design Info / Create Report) prints "detail" sheets like the one fetched, in a fixed per-member layout. Report PDFs/RTFs are **not** a good machine channel; the same numbers exist in the database tables. Prefer tables.

---

## 3. What ETABS provides vs does NOT provide for detailing

### Columns
Provides [V]:
- **Design mode** ("reinforcement to be designed", `ToBeDesigned = true`, MyOption = 2): required **total longitudinal area As,req (mm²)** and **ρ (%)** at each design station, with controlling combo and Pu/Mu2/Mu3; interaction surface generated for 0.8–6 % (IS 26.5.3.1) — i.e. the reported As is bounded below by **0.8 % Ag** [V manual].
- **Check mode** (`ToBeDesigned = false`, MyOption = 1): **PMM capacity ratio (D/C)** for the rebar actually drawn in the section (number of bars × size), no As,req.
- Shear: **Av/s (mm²/m)** major and minor — the required *area of all stirrup legs per metre*, not a spacing, not a leg count, not a bar size. For **Ductile** element type the design shear is max(factored Vu, capacity shear 1.4·(MuBL+MuBR)/H) [V IS 13920 7.3.4 / 2016 7.5], so Av/s already embeds capacity design.
- Joint shear ratio and beam/column capacity ratio (ductile frames, informational) [V].
- Design section name, overwrites (element type Ductile/Ordinary/Non-sway, unbraced length ratios, K, LLRF, rebar areas for capacity) [V Appendix E].

Does NOT provide [V/K]:
- Bar **count, diameter, arrangement** in Design mode (the section's rebar template is an *input* pattern; the design output is an area). In Check mode the arrangement is known but comes from the section definition, not from the design result.
- **Tie/link spacing, number of legs, tie diameter** — only Av/s. The IS 13920 **special confining reinforcement Ash (7.6 / 8.1 in 2016 numbering; 7.4 in 1993)** is *not* a reported quantity in the summary tables. **[K, verify]** Newer versions (v18+ with IS 13920:2016) do compute the confinement check and show it in the detail report as "Special Confining Reinforcement" with `Ash/s` values; the ETABS 2016 manual fetched here (IS 13920:1993) does not list it as an output at all. Treat confinement Ash as **detailer-computed** unless the owner's version demonstrably exports it.
- **Confinement zone length lo** (max(D, hc/6, 450 mm)), **lap length / lap location**, **hook geometry (135°, 10d/75 mm)**, **cover** actually used for drawing, **bar curtailment**, **splice staggering**, **cranking** — none.
- Column **clear height** vs centre-line height; ETABS stations are along the analysis line (joint to joint) — the detailer needs beam depths to get clear height.
- Development lengths, dowels into footing, starter bars.
- Circular column spiral pitch (only Av/s equivalent).

### Shear walls (piers)
Provides [V from report + manual]:
- Flexure: **required vertical rebar area (mm²) and ρ required** vs ρ current, at Top and Bottom stations, with combo and Pu/Mu2/Mu3.
- Shear: **horizontal rebar mm²/m per leg** (and "OS" flag), Vc, Vc+Vs.
- **Boundary element check** per edge: edge length checked, compressive stress vs limit (0.2 fck) → whether a boundary element is *required* (IS 13920:2016 10.4.1). **[K/verify]** v18+ also reports the *required boundary element length* and the *boundary element vertical steel ratio (≥0.8 %)* in the details table; the sample report shows only the stress check and the checked "Edge Length" (= wall thickness 200 mm here, i.e. the program's default edge-zone probe width).
- Pier geometry per leg (coordinates, length, thickness), material, LLRF, design parameters.
- From v22.6 [V]: pier can be flagged "Ordinary Wall" to bypass IS 13920; earlier *all* piers are designed as Special Walls (IS 13920 applied) when the IS 456 wall code is selected.

Does NOT provide:
- Bar diameters/spacing for distributed vertical or horizontal steel (only ρ and mm²/m; "Edge Bar/End Bar" for Uniform piers echo the *input* template).
- Number of curtains, boundary element tie size/spacing/legs, confinement zone height, lap zones, U-bars at ends, corner/junction detailing of L/T/C cores, dowels.
- A pier that spans several stories is reported story by story; no continuity logic.
- For **General Reinforcing (Section Designer) piers**: only a **D/C ratio** (check) — or, if "design" is selected for the SD pier, a required ρ scaling the drawn pattern uniformly [K]. No per-bar output.

### Design vs Check and rebar overrides
- Column sections carry the flag in *Define > Section Properties > Frame Sections > Modify/Show Rebar: "Reinforcement to be Checked / Designed"* [V article]. Mixed models are common (typical office practice: *Design* first, then set bars and *Check*).
- The detailer must branch on `MyOption`/Status: Design → size bars from As,req; Check → read the template bars (from Frame Section Property Definitions) and treat ETABS as verification.
- "Rebar overrides" in ETABS concrete frame overwrites are beam-end areas for capacity shear [V Appendix E]; there is no per-column As override in IS 456 (verify in v20+: "Longitudinal Rebar Area Overwrite" exists for some codes).
- Section Designer sections for **L/T/C/+ columns**: ETABS treats an SD section with "Design as concrete column" as **Check** by default (uses bars as drawn) [K]. Design tables then give PMM ratio only; the required As is not solved for a general SD shape unless the "design" option (uniform scaling of drawn bars) is on (verify: `GetSDSection.DesignType` and the SD form's "Reinforcement to be Designed" checkbox, available since v2016 for concrete SD sections). The detailer therefore needs the SD polygon + drawn bars (via `SDShape.*` API or the e2k `$ SECTION DESIGNER SECTIONS` block) to detail such columns.

### IS 13920 ductile options summary
- **Frame type overwrite** `Element Type = Ductile | Ordinary | Non-sway` (default Ductile) [V]. Ductile → capacity shear for columns/beams, ρ limits 0.8–6 %, joint shear & B/C ratios reported. The output *fields* are the same; values differ.
- **IS 13920 edition**: ETABS 2016 manual implements 1993 (+ "Draft" for joints); v17+ implement **IS 13920:2016** (verify exact first version). Clause numbering in warnings/reports changes accordingly (7.3.4 → 7.5; 7.4 → 8.1).
- Walls: all piers Special (IS 13920 cl. 10) until v22.6 "Ordinary Wall" overwrite [V].

---

## 4. ETABS member identity

**[V, CSI "Labels and Unique Names"]**
- **Label**: assigned by ETABS from *plan position*; the same plan position carries the same label on every story (C12 on Story1…StoryN). Labels are **not user-editable** and are **renumbered automatically when objects are deleted** ("if B4 is deleted on every story, beams B5–B10 become B4–B9"). With towers enabled, the story is prefixed (`T1-Story4`).
- **Unique Name**: user-editable string, unique within object class (frames: beams+columns+braces together; shells: floors+walls together; joints separate). **Does not change** when other objects are deleted → the stable key for API/table joins. Defaults are integers ("147"), but users *can* rename ("COL-A1-L3").
- **GUID**: every object also carries a GUID (visible in Connectivity / Assignments tables, `GetGUID`) [K]; survives relabel and rename, but **is regenerated on copy/paste and on e2k re-import** [K].
- **Piers**: identified by **Story + Pier label** (P1, P14…) — the pier label is a *name* assigned to one or more area (and/or frame) objects; uniqueness of the design result row is (Story, Pier). Pier labels are user-defined and can be reused on every story (same P1 top to bottom) [V-ish from API `GetSectionProperties` returning per-story arrays].

Relation to geometry:
- A column is a **frame object between two point objects** (I = bottom, J = top for columns by convention [K]); its ends are at the story elevations unless the column is offset/spliced. Plan coordinates from "Point Object Connectivity" X,Y; Z = story elevation (or the table's Z). The section's position relative to the line depends on the **insertion (cardinal) point** and **local-axis angle** (default cardinal point 10 = centroid for columns; 8 = top-centre for beams [K]).
- A pier is the **set of area objects on one story with the same pier label**; its design section is the composite of those legs; axis angle = longest leg direction [V release note 11414].

Common pitfalls:
1. **Relabel** (Edit > Relabel / "Auto relabel all") renumbers labels; two exports from different model versions may not share labels. Match on Unique Name + GUID where available; fall back to geometry.
2. **One physical column = many story segments**: one design row-set per story. Detailing must stitch segments by plan position (continuous X,Y) and decide splice/termination per story.
3. **Columns split within a story** (mid-height joint, e.g. at a mezzanine or where a beam frames in at mid-height): two frame objects with different labels on the same story; stations overlap.
4. **Piers with multiple legs** (L/T/C cores): one pier label, N legs; shear reinforcement is per leg; boundary element edges per leg; CAD geometry will be N wall segments.
5. **Walls split into multiple area objects** vertically or horizontally in one story (meshing, openings): all carry the same pier label; design is for the combined pier, but geometry must be unioned.
6. **Piers that change label between stories** (P1 at L1 is P3 at L2) — common in rushed models; detailer cannot assume vertical continuity by label.
7. **"Auto" and "None" labels**: area objects without a pier label are not designed as walls; columns with design procedure "None"/"No Design" produce no rows.
8. **Design section ≠ analysis section** after Design > Change Design Section; use the *Design Section* column for sizing bars.
9. **Units**: tables export in the *current display units* at export time (often kN-m in Indian offices, giving As in m² or mm² depending on the length unit chosen for "section dimensions"; ETABS has separate *consistent units* — force/length/temperature — and the Table Options form can set "mm, kN"). The units row (row 3 in Excel) **must be parsed, never assumed**. API: set `kN_mm_C` explicitly.
10. **Culture**: numbers in Excel export follow Windows regional settings (decimal comma risk); CSV from the API uses invariant format.
11. **Duplicate rows**: summary tables have one row per station (typically 2–3 per column); "Details" tables one per combo per station. Importer must aggregate (max As, max Av/s) or keep per-station.
12. **Check-mode blanks**: `PMM Ratio` present and `Rebar Area` blank (or vice versa). Importer must treat blank/"N/A" as null, not zero.
13. **Towers**: story names prefixed by tower; keep the full string.

---

## 5. Recommended data contract (ETABS → Detailer)

Principles: SI units fixed in the contract (**mm, mm², mm²/m, kN, kN·m, MPa, degrees**), all values converted at import; every record carries provenance; mandatory fields fail the import loudly, optional fields degrade gracefully.

```jsonc
{
  "$schema": "sbc-detailer/etabs-import/v1",
  "provenance": {
    "source": "ETABS",                            // mandatory
    "etabsVersion": "20.3.0",                     // mandatory (from "Program Control" table or API GetVersion)
    "modelFile": "Tower-A_R3.EDB",                // mandatory
    "modelGuidOrHash": "…",                       // optional, sha256 of e2k or EDB
    "exportDate": "2026-10-05T11:20:00+05:30",    // mandatory
    "channel": "TableExport-Excel | TableExport-Access | API-DatabaseTables | API-Summary | E2K",
    "tablesUsed": ["Concrete Column Design Summary - IS 456:2000", "Frame Assignments - Summary", "..."],
    "designCodeFrame": "IS 456:2000",             // mandatory for columns
    "designCodeWall": "IS 456:2000",              // mandatory for walls
    "is13920Edition": "2016",                     // optional (verify-able from version)
    "sourceUnits": { "force": "kN", "length": "mm", "temp": "C" },   // as read from the export
    "exportedBy": "user@office", "notes": ""
  },
  "stories": [ { "name": "Story3", "elevation_mm": 9600, "height_mm": 3200, "tower": null, "isMaster": false } ],
  "sections": [
    { "name": "C300X600", "shape": "Rectangular|Circular|SD", "material": "M30", "fck_MPa": 30, "fy_MPa": 500,
      "b_mm": 300, "D_mm": 600, "diameter_mm": null,
      "rebarTemplate": { "mode": "Design|Check", "pattern": "Rectangular|Circular", "clearCover_mm": 40,
        "nBars3": 3, "nBars2": 3, "barSize": "20", "tieSize": "8", "tieSpacing_mm": 150, "nTies2": 2, "nTies3": 2 },   // optional
      "sdGeometry": null }   // optional: polygon(s) + bars for SD sections
  ],
  "columns": [ /* ColumnDesignRecord */ ],
  "piers":   [ /* WallPierDesignRecord */ ]
}
```

**MemberKey** (shared):
```jsonc
{ "kind": "Column|Pier", "story": "Story3", "label": "C12", "uniqueName": "147", "guid": "…|null", "tower": null }
```
- `story`, `label`, `kind` **mandatory**. `uniqueName` mandatory for columns (always present in v17+ tables); for piers `uniqueName` = null and `label` = pier label. `guid` optional.

**ColumnDesignRecord**
```jsonc
{
  "key": { "kind": "Column", "story": "Story3", "label": "C12", "uniqueName": "147", "guid": null },
  "designSection": "C300X600",            // mandatory
  "analysisSection": "C300X600",          // optional
  "mode": "Design|Check",                 // mandatory (from MyOption / template flag)
  "frameType": "Ductile|Ordinary|NonSway", // optional, default Ductile (ETABS default) with a warning
  "geometry": {                           // "hints" for CAD matching; optional but strongly recommended
    "bottom": { "x_mm": 12000, "y_mm": 6500, "z_mm": 6400 },
    "top":    { "x_mm": 12000, "y_mm": 6500, "z_mm": 9600 },
    "length_mm": 3200,
    "angle_deg": 90,                      // local-axis rotation (Frame Assignments - Local Axes / Summary "Angle")
    "cardinalPoint": 10, "offset2_mm": 0, "offset3_mm": 0,   // optional
    "b_mm": 300, "D_mm": 600, "diameter_mm": null,
    "pointI": "23", "pointJ": "58"        // unique names of end joints, optional
  },
  "stations": [                           // mandatory ≥1; keep all, detailer takes envelope
    { "location_mm": 0,    "pmmCombo": "DCon12", "asRequired_mm2": 3120, "rhoRequired_pct": 1.73, "pmmRatio": null,
      "pu_kN": 1450.2, "mu2_kNm": 35.1, "mu3_kNm": 210.4,
      "vMajorCombo": "DCon7", "avsMajor_mm2_per_m": 1260, "vMinorCombo": "DCon8", "avsMinor_mm2_per_m": 980,
      "vuMajor_kN": null, "vuMinor_kN": null, "capacityShearGoverns": null },
    { "location_mm": 3200, "...": "..." }
  ],
  "envelope": { "asRequired_mm2": 3120, "rhoRequired_pct": 1.73, "pmmRatio": null,
                "avsMajor_mm2_per_m": 1260, "avsMinor_mm2_per_m": 980 },   // derived at import
  "joint": { "jointShearRatioMajor": 0.62, "jointShearRatioMinor": 0.48, "bcRatioMajor": 1.31, "bcRatioMinor": 1.42 }, // optional
  "confinement": { "ashOverS_major_mm2_per_m": null, "ashOverS_minor_mm2_per_m": null, "source": "ETABS|Detailer" }, // optional; null → detailer computes IS 13920 8.1
  "messages": { "errors": [], "warnings": [] },
  "status": "OK|Overstressed|NotDesigned"
}
```
Mandatory: key, designSection, mode, stations[≥1] with (location, asRequired **or** pmmRatio per mode, avsMajor, avsMinor). If `mode = Check` and `asRequired` is null → detailer uses the section's `rebarTemplate` (must be present → else error "Check-mode column without rebar template"). If `avs*` missing → detailer computes minimum ties per IS 456 26.5.3.2 + IS 13920 and flags "shear from code minimum". If geometry hints missing → match by Story + Label only, flag "unverified geometry". If `fck/fy` missing → take from section material or project defaults with a warning.

**WallPierDesignRecord**
```jsonc
{
  "key": { "kind": "Pier", "story": "Story3", "label": "P14", "uniqueName": null, "guid": null },
  "pierType": "UniformReinforcing|SimplifiedCT|GeneralSD",   // mandatory
  "mode": "Design|Check",
  "wallType": "Special|Ordinary",             // optional; default Special (pre-v22.6 always Special)
  "material": { "fck_MPa": 27.58, "fy_MPa": 500, "fys_MPa": 500 },   // optional
  "geometry": {
    "axisAngle_deg": 90,
    "legs": [ { "id": "Leg 1", "x1_mm": 0, "y1_mm": 11900, "x2_mm": 0, "y2_mm": 13450, "length_mm": 1550, "thickness_mm": 200 } ],   // from pier details / Pier Section Properties
    "widthBot_mm": 1550, "thickBot_mm": 200, "widthTop_mm": 1550, "thickTop_mm": 200,
    "cgBot": { "x_mm": 0, "y_mm": 12675, "z_mm": 6400 }, "cgTop": { "x_mm": 0, "y_mm": 12675, "z_mm": 9600 },
    "ag_mm2": 310000,
    "areaObjectUniqueNames": ["311", "312"]    // optional, from Area Assignments - Pier Labels
  },
  "stations": [
    { "location": "Top",
      "flexure": { "combo": "DL+L.LL+EQY ULS", "asRequired_mm2": 2163, "rhoRequired": 0.0070, "rhoCurrent": 0.0013,
                   "pu_kN": 87.3, "mu2_kNm": 2.15, "mu3_kNm": -584.8, "dcRatio": null },
      "shear": [ { "leg": "Leg 1", "combo": "DL+L.LL-EQY ULS", "avsHoriz_mm2_per_m": null, "overstressed": true,
                   "pu_kN": 585.7, "mu_kNm": 491.5, "vu_kN": -872.0, "vc_kN": 124.5, "vcPlusVs_kN": 348.3 } ],
      "boundary": [ { "leg": "Leg 1", "edge": "Left",  "combo": "…", "edgeLengthChecked_mm": 200, "stressComp_MPa": 6.44, "stressLimit_MPa": 5.52, "required": true,  "requiredLength_mm": null, "requiredRho": null },
                    { "leg": "Leg 1", "edge": "Right", "...": "..." } ] },
    { "location": "Bottom", "...": "..." }
  ],
  "uniformTemplate": { "edgeBar": "16", "edgeSpacing_mm": 150, "endBar": "16", "clearCover_mm": 25 },  // optional (Uniform piers)
  "simplifiedCT": { "db1Left_mm": null, "db2Left_mm": null, "asLeft_mm2": null, "db1Right_mm": null, "db2Right_mm": null, "asRight_mm2": null },  // optional
  "messages": { "errors": [], "warnings": [] },
  "status": "OK|Overstressed|NotDesigned"
}
```
Mandatory: key, pierType, geometry.legs[≥1] (or widthBot/thickBot), stations with flexure.asRequired (or dcRatio for Check/SD) and shear[] (avs or overstressed flag), boundary[] (may be empty → detailer runs IS 13920 10.4 stress check itself from Pu/Mu if provided; else flags "boundary element undetermined"). `overstressed = true` must block automatic detailing of that pier (section must be revised in ETABS).

Matching to CAD: the detailer should match a CAD column outline to a ColumnDesignRecord by (1) story elevation band, (2) centroid distance ≤ tolerance (e.g. 50 mm, user-settable), (3) b×D within ±10 mm after applying `angle_deg`, then (4) label text in the drawing if present. Walls: match CAD wall polylines to pier legs by overlap of the leg segment with the wall centreline (≥ 70 % length) at the story.

---

## 6. Recommended primary channel for V1

**Primary: the table-export file** (Excel .xlsx preferred; Access .mdb/.accdb or the API-written CSV accepted), produced by a documented one-click "SBC export" procedure in ETABS: *run design → Display > Show Tables → tick the fixed set of ~12 tables (Section 2) → Table Options: units kN,mm; all combos; no "selection only" → File > Export All Tables to Excel*. Optionally, supply the .e2k as well for geometry/section/rebar-template redundancy.

Reasons:
1. **No ETABS licence or installation needed at detailing time.** Detailers in Indian offices often work on CAD seats without ETABS; the design engineer runs ETABS. The file is the natural hand-off and can be archived with the drawing (traceability of "which design version was detailed").
2. **Robustness**: no COM/ROT/UAC/bitness/version-binding issues; no risk of the CAD plugin hanging ETABS; no need to ship `ETABSv1.dll` interop bound to a specific version; works for ETABS 2016 (no DatabaseTables API) as well as v22.
3. **Reviewability**: the engineer can inspect the Excel before it is consumed; QA can diff two exports.
4. **The design tables are the only place where the full pier/boundary-element data lives** anyway (no typed API for walls), so an API path would use `DatabaseTables` and produce exactly the same strings — the parser is shared.

Design the importer around a **table abstraction** (`ITableSource` → `ExcelTableSource`, `AccessTableSource`, `CsvTableSource`, `ApiDatabaseTableSource`) with header normalisation and a units row. The Excel worksheet-name truncation issue is handled by reading the title in cell A1 instead of the sheet name.

**Fallback / V1.5: live API via `DatabaseTables`** on a machine that has ETABS open with the model, using `Helper.GetObject("CSI.ETABS.API.ETABSObject")`, `SetPresentUnits(kN_mm_C)`, `GetTableForDisplayArray` for the same table keys, plus `PierLabel.GetSectionProperties` and `FrameObj.GetPoints/PointObj.GetCoordCartesian` for geometry. Advantages: zero manual steps, exact unique names/GUIDs, can trigger `StartDesign`. Keep it behind the same `ITableSource` so the pipeline is identical. Bind the interop with `Embed Interop Types = true` against ETABSv1.dll (v17+) so one build serves v17–v22.

**Not recommended as primary:** e2k-only (no design data), report PDFs/RTF parsing, Access when the office lacks the ACE OLEDB driver on x64 (common blocker: 32-bit Office installed on 64-bit Windows → ACE x64 driver missing; Excel via OpenXML has no such dependency).

---

## 7. Risks and open questions for the owner

1. **ETABS version(s) in use** (2016? 18? 20? 22?) — decides table names/headers, DatabaseTables availability, IS 13920 edition, "Ordinary Wall" availability. *Need: one real export of all listed tables from the owner's version to freeze headers; our header tables above are partly (verify).*
2. **Design vs Check practice**: does the office export after a *Design* run (As,req) or after assigning bars and *Check* (ratios only)? V1 should support Design-mode as the main path; decide whether Check-mode columns are detailed from the ETABS template bars or rejected.
3. **Who runs the design and when**: design results are invalidated by re-analysis; the export must be re-done after every model change. Define the hand-off protocol (file naming with revision, provenance block).
4. **Unit system in exports** (kN-m vs kN-mm vs N-mm): mandate kN,mm in the procedure and still parse the units row.
5. **Member identity policy**: rely on Unique Name + Story, with geometry match as verification? What to do when labels in the CAD drawing (C12) and ETABS (C7) differ — detailer re-labels CAD or maps?
6. **Pier label conventions** across stories; L/T/C cores modelled as one pier or several; walls modelled as frame "line piers". Multi-leg piers need a decision on per-leg vs per-pier shear steel.
7. **Section Designer columns**: are L/T columns common in the owner's projects? If yes, V1 must read SD geometry (e2k or API) and accept Check-mode ratios only.
8. **Confinement (IS 13920 8.1) and boundary element lengths**: confirm whether the owner's ETABS version exports Ash/s and required BE length; otherwise the detailer computes them (needs fck, fy, cover, bar sizes, Ag/Ak) — this makes the detailer a *design* tool for those items, with liability implications; owner to confirm acceptability.
9. **Capacity-shear and joint checks**: ETABS joint-shear ratios are "informational"; does the office want them surfaced/blocked?
10. **Licensing of the API path**: a live-API fallback needs an ETABS licence on the detailing seat; Plus-level or higher for API (verify current CSI policy).
11. **Access export dependency** (ACE OLEDB x64) — decide Excel-only for V1.
12. **Overstressed members** ("O/S", `overstressed = true`, PMM ratio > 1): block, warn, or detail anyway with a flag?
13. **Multiple towers / split models** (podium + towers in separate EDBs): story name collisions.
14. **Beam data**: V1 scope excludes beams, but clear height for lo and joint confinement needs beam depths at each column end — import "Concrete Beam Design Summary"/beam sections too, or take beam depths from CAD?

---

## Sources

Fetched / verified during this research:
- CSI API help, ETABS 2016: cDesignConcrete.GetSummaryResultsColumn — https://docs.csiamerica.com/help-files/etabs-api-2016/html/d85059d5-a38c-d7d7-69dc-4bdc7fe21b56.htm (full signature; MyOption 1=Check 2=Design; PMMArea only for Design, PMMRatio only for Check; AVMajor/AVMinor [L²/L])
- CSI API help, ETABS 2015: GetSummaryResultsColumn — https://docs.csiamerica.com/help-files/etabs-api-2015/html/d67b732b-f5f1-529e-5703-0414d33df2ee.htm ; GetSummaryResultsBeam — https://docs.csiamerica.com/help-files/etabs-api-2016/html/c3556046-fd3f-4559-7659-966eb731ea4c.htm ; GetSummaryResultsJoint — https://docs.csiamerica.com/help-files/etabs-api-2016/html/4ee9986a-cac3-5a64-3ef6-1dfb8e7fd453.htm
- CSI API help: cPierLabel interface and GetSectionProperties — https://docs.csiamerica.com/help-files/etabs-api-2016/html/79fc5170-1e3d-17eb-e457-c419b5ec4a45.htm , https://docs.csiamerica.com/help-files/etabs-api-2016/html/04d412b6-b2d0-4600-11c8-0ee456497919.htm ; cAreaObj.GetPier — https://docs.csiamerica.com/help-files/etabs-api-2015/html/b22c4f89-a5bf-69ad-2c31-158f9c655ed3.htm
- CSI API help: FrameObj.GetNameFromLabel — https://docs.csiamerica.com/help-files/etabs-api-2015/html/0e2432fd-1b77-2628-b270-37b99022442a.htm ; GetLabelNameList — https://docs.csiamerica.com/help-files/etabs-api-2016/html/427e3068-586b-116d-ec1e-23a67d22627b.htm ; cStory.GetStories — https://docs.csiamerica.com/help-files/etabs-api-2016/html/3f804fa8-9fef-a9f0-8517-87676c0ea8ef.htm ; cHelper — https://docs.csiamerica.com/help-files/etabs-api-2015/html/8e76489c-9048-9f13-57e5-81fde616f8a7.htm ; SetDesignSection — https://docs.csiamerica.com/help-files/etabs-api-2015/html/d8144a33-acab-f4a5-f747-27d3391dbc22.htm
- CSI ETABS help: Labels and Unique Names — https://docs.csiamerica.com/help-files/etabs/Keyboard_Commands_and_Special_Features/Labels_and_Unique_Names.htm
- CSI ETABS help: File > Export options — https://docs.csiamerica.com/help-files/etabs/Menus/File/Export/Export.htm ; Display > Show Tables — https://docs.csiamerica.com/help-files/etabs/Menus/Display/Show_Tables.htm ; Table Options form — https://docs.csiamerica.com/help-files/etabs/Keyboard_Commands_and_Special_Features/Table_Options_form.htm
- CSI Concrete Frame Design Manual IS 456:2000 for ETABS 2016 (ISO ETA122815M29) — https://docs.csiamerica.com/manuals/etabs/Concrete%20Frame%20Design/CFD-IS-456-2000.pdf (column design vs check, 0.8–6 % range, capacity shear IS 13920 7.3.4, joint shear informational, Table 3-1, Appendix E overwrites)
- CSI Shear Wall Design Manual IS 456:2000 / IS 13920 (index page) — https://www.scribd.com/document/239400699/SWD-IS-456-00 and https://pdfcoffee.com/swd-is-456-2000-4-pdf-free.html (Simplified C&T / Uniform / Section Designer pier modes; design at top and bottom stations)
- Real ETABS 18.1.1 IS 456:2000 Pier Design report (Multistory RCC Office Building2.EDB, 2021) — https://files.engineering.com/files/5ae02683-1e42-4cbe-91b0-598a515c896f/Shear_Wall_Design_Report_ETABS.pdf (pier details, leg geometry, flexural Required Rebar Area / Required & Current Reinf Ratio, shear mm²/m with "OS", Boundary Element Check with Edge Length / Stress Comp / Stress Limit)
- ETABS v22.6.0 Release Notes (14-May-2025) — https://www.csiamerica.com/software/ETABS/22/ReleaseNotesETABSv2260.pdf ("Ordinary Wall" overwrite for IS 456 piers; "Concrete Beam Design Summary - IS 456-2000" table name; PropFrame.SDShape.GetReinfLine API; pier local axes = longest leg; e2k round-trip)
- EtabSharp wrapper documentation of cDatabaseTables (GetTableForDisplayArray flattened row-major layout) — https://deepwiki.com/tadodev/EtabSharp/6-database-tables-system , https://deepwiki.com/tadodev/EtabSharp/6.3-editing-tables
- Eng-Tips threads on DatabaseTables usage and attaching to a running instance — https://www.eng-tips.com/viewthread.cfm?qid=502839 , https://www.eng-tips.com/viewthread.cfm?qid=497218 , https://www.eng-tips.com/viewthread.cfm?qid=481065 ; Grasshopper forum attach example — https://www.grasshopper3d.com/forum/topics/attach-to-current-open-etabs-using-ghpython
- "Column Design and Check Options in ETABS" — https://www.thestructuralworld.com/2020/06/14/column-design-and-check-options-in-etabs/
- CSI Interactive Concrete Frame Design help — https://docs.csiamerica.com/help-files/etabs/Menus/Design/Concrete_Frame_Design/CF_Interactive_Concrete_Frame_Design.htm ; Design Input and Output — https://docs.csiamerica.com/help-files/etabs/Introduction/Design_Input_and_Output.htm ; SD Section form — https://docs.csiamerica.com/help-files/etabs/Menus/Define/Section_Properties/Frame_Sections/SD_Section.htm ; Change Design Section — https://docs.csiamerica.com/help-files/etabs/Menus/Design/Change_Design_Section.htm
- Sample exports referenced by title only (Scribd blocked content fetch): "TABLE: Concrete Column Summary - IS 456-2000" — https://www.scribd.com/document/420122822/Column-Design-29072019 ; ETABS Concrete Column Design Summary — https://www.scribd.com/document/470148719/COL ; https://www.scribd.com/document/811597440/Collllll
- IS 13920:2016 clause references (confinement 8.1, lo, boundary elements 10.4) — https://infralens.in/code/IS-13920-2016 , https://infralens.in/handbook/ductile-detailing
