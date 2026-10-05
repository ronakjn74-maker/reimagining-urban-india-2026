# CAD Platform Research: GstarCAD + ZWCAD dual-host support for "SBC Detailer"

Prepared for the SBC Detailer planning panel (CAD-platform track). Date: 2026-10-05.
Context: existing C# .NET Framework 4.8 plugin "SbcStructural", today built for ZWCAD 2026 through a
CadCompat/CadAliases layer (with AutoCAD/pCAD variants). Hard requirement: the new Detailer module must run
on GstarCAD **and** ZWCAD.

Evidence base: official GstarCAD 2024 API Guides (downloaded and read: .NET Migration Guide, .NET Programming
Guide, .NET Upgrade Guide, Application Program Auto Load Guide), the managed assemblies inside the NuGet
packages `GstarCADNET` 21.2.0 / 22.0.0 / 23.0.0 / 24.1.1 / 25.1.0 / 26.0.0 / 27.0.0 and `ZWCAD.NetApi`
20.20.0 / 20.24.0 / 20.25.0 / 20.26.0 (unpacked; type and namespace names extracted with `strings`),
vendor web pages and forum posts. Anything I could not confirm from an artefact or an official page is marked
**(verify)**.

---

## 0. Executive findings (read this first)

1. **GstarCAD's .NET API is an AutoCAD-ObjectARX-.NET clone with a namespace rename**:
   `Autodesk.AutoCAD.*` -> `Gssoft.Gscad.*`, assemblies `GcCoreMgd.dll`, `GcDbMgd.dll`, `GcMgd.dll`
   (+ `GcDbMgdBrep.dll`). The official migration guide literally says: "Replace the 'Autodesk.AutoCAD' with
   corresponding 'Gssoft.Gscad' in .NET source codes" and "Change the Target framework to .NET Framework 4.8".
   So the existing CadAliases pattern extends to GstarCAD with one more alias set.
2. **ZWCAD's .NET API is the same story**: `Autodesk.AutoCAD.*` -> `ZwSoft.ZwCAD.*`, assemblies
   `ZwManaged.dll` (= AcMgd+AcCoreMgd), `ZwDatabaseMgd.dll` (= AcDbMgd), `ZwDatabaseMgdBrep.dll`,
   `ZcWindows.dll`/`ZdWindows.dll` (= AcWindows/AdWindows, namespace `ZwSoft.Windows`), `ZcCui.dll`.
   NuGet packages ship `lib/net47` for ZWCAD 2024/2025/2026; a net48 plugin loads fine.
3. **Both hosts expose essentially the same DB-level type surface** for what a detailer needs. Type-name
   extraction from the 2025/2026 assemblies shows identical presence of: `Polyline`, `Polyline2d/3d`, `Arc`,
   `Circle`, `DBText`, `MText`, `Hatch`/`HatchLoop`, `BlockReference`, `AttributeReference/Definition`,
   `DynamicBlockReferencePropertyCollection`, `AlignedDimension`, `RotatedDimension`, `RadialDimension`,
   `DiametricDimension`, `OrdinateDimension`, `ArcDimension`, `Leader`, `MLeader`/`MLeaderStyle`,
   `Table`/`TableStyle`, `Xrecord`, `DBDictionary`, `RegAppTable`, `Layout`/`LayoutManager`, `Viewport`,
   `PlotSettings`/`PlotEngine`, `ObjectContextManager`/`AnnotationScale`, `Wipeout`, `Field`.
   `PaletteSet` with `AddVisual`, `DockEnabled`, `KeepFocus`, `StateChanged` is present in both.
   `CommandMethodAttribute`, `CommandClassAttribute`, `LispFunctionAttribute`, `IExtensionApplication`,
   `DocumentCollection` events `CommandEnded/CommandWillStart/DocumentActivated/DocumentCreated` exist in both.
4. **The one big platform risk is the runtime split**: GstarCAD 2021-2025 .NET API targets **.NET Framework
   4.8** (`lib/net48`), but **GstarCAD 2026 and 2027 ship their managed API for .NET 8** (`lib/net8.0`) and the
   2026/2027 system requirements list ".NET 8.0 (only for custom software development)". A net48 DLL cannot
   be NETLOADed into a .NET 8 host process. ZWCAD 2024-2026 stay on .NET Framework. Therefore the
   solution must either (a) pin GstarCAD support to <= 2025, or (b) multi-target the plugin
   (`net48` for ZWCAD/GstarCAD<=2025, `net8.0-windows` for GstarCAD>=2026), which is exactly what AutoCAD 2025+
   (.NET 8) and BricsCAD V26 (.NET 8) developers do today. This is the first question for the owner.
5. **Recommendation**: keep the compile-time alias approach (one DLL per host, `CadAliases` pattern), add a
   `GSTARCAD` build configuration, and write the Detailer against a small host-neutral **ICadHost adapter** for
   the handful of things that really differ (UI hosting, ribbon, application-level services, loading/registration,
   host quirks for MLeader/Table). Draw with primitive entities (polyline/arc/line/text/mtext/dimension/block
   with attributes); do **not** build the output on `Table`, `MLeader`, dynamic-block manipulation or fields.
   Do **not** generate DXF through a neutral library and insert; that is the wrong tool for live-document
   detailing.

---

## 1. GstarCAD .NET API

### 1.1 Assemblies and namespaces by release (from the NuGet package contents and the official guides)

| GstarCAD | NuGet `GstarCADNET` | lib target | Managed assemblies in package | Root namespace |
|---|---|---|---|---|
| 2017 | 17.2.0 | net40 | `gmap.dll`, `gmdb.dll` (verify, not unpacked) | `GrxCAD.*` |
| 2021 | 21.2.0 | **net48** | `gmap.dll`, `gmdb.dll` | `GrxCAD.*` |
| 2022 | 22.0.0 | **net48** | `gmap.dll`, `gmdb.dll` | `GrxCAD.*` (`GrxCAD.ApplicationServices`, `.DatabaseServices`, `.EditorInput`, `.Geometry`, `.Runtime`, `.Windows`, `.Colors`, `.GraphicsInterface`, `.GraphicsSystem`, `.LayerManager`, `.PlottingServices`, `.Publishing`, `.Internal`) |
| 2023 | 23.0.0 | **net48** | `gmap.dll`, `gmdb.dll` | `GrxCAD.*` |
| 2024 | 24.1.1 | **net48** | `GcCoreMgd.dll`, `GcDbMgd.dll`, `GcMgd.dll`, `GcDbMgdBrep.dll` | **`Gssoft.Gscad.*`** |
| 2025 | 25.1.0 | **net48** | same four | `Gssoft.Gscad.*` |
| 2026 | 26.0.0 | **net8.0** | the four + `GcWindows.dll`, `GdWindows.dll`, `GcCUI.dll` | `Gssoft.Gscad.*`, `Gssoft.Gscad.Ribbon`, `Gssoft.Gscad.AutoLisp`, `Gssoft.Gscad.StatusBar`, `Gssoft.Gscad.Customization` |
| 2027 | 27.0.0 (May 2026) | **net8.0** | same as 2026 | `Gssoft.Gscad.*` |

Key points:
- The old `GrxCAD.*` namespace (2017-2023, assemblies `gmap.dll`/`gmdb.dll`) was **renamed to
  `Gssoft.Gscad.*` and the assemblies renamed to `GcCoreMgd/GcDbMgd/GcMgd` in GstarCAD 2024**. The 2024 ".NET
  Upgrade Guide" exists precisely for moving older GstarCAD plugins to the new names. If the owner has customers on
  GstarCAD 2023 or older, that is a third namespace flavour.
- Assembly split mirrors AutoCAD 2013+: `GcCoreMgd` (= AcCoreMgd: `ApplicationServices.Core`, `EditorInput`,
  `Runtime`, `PlottingServices`, `Publishing`), `GcDbMgd` (= AcDbMgd: `DatabaseServices`, `Geometry`, `Colors`,
  `LayerManager`, `GraphicsInterface`), `GcMgd` (= AcMgd: `ApplicationServices`, `Windows`, `Windows.ToolPalette`,
  `Internal.*`). `GcDbMgdBrep` = AcDbMgdBrep. Namespaces listed in the official 2024 .NET Programming Guide match
  what I extracted from the 25.1.0 binaries.
- Namespace mapping table printed in the official migration guide:
  `Autodesk.AutoCAD.{ApplicationServices, EditorInput, GraphicsSystem, PlottingServices, Publishing, Runtime,
  Windows, Colors, DatabaseServices, DatabaseServices.Filters, Geometry, GraphicsInterface, LayerManager}` ->
  `Gssoft.Gscad.{same}`.
- COM interop: `GrxCAD.Interop.dll` / `acax.tlb` (library `GcadVbaLib`; objects renamed `AcadXxx` -> `GcadXxx`,
  e.g. `GcadLWPolyline`, `GCAD_COLOR`, `GcSelect`). NuGet `GstarCAD.Interop.x64` 25.0.0 (net48) exists. The
  ProgID is `gcad.application`.
- GRX SDK layout: `grxsdk.zip` -> `arx\inc` (managed DLLs), `arx\inc-x64`, `lib-x64`, `utils` (BREP), samples
  `Dotnet\{Addline, Hello, Vbhello}`, `SimplePalette`. **The SDK is 64-bit only** ("inc-x64", "lib-x64"; no x86
  directories). GstarCAD 2024+ is 64-bit only (verify for 2021-2023: older releases had 32-bit installers).
- `.NET Framework 4.8 and above` is the stated minimum for 2024/2025 plugins; the 2025 managed DLLs reference
  CLR `v4.0.30319`. For 2026/2027 the vendor requirement text reads ".NET 8.0 (only for custom software
  development)" / ".NET Framework 8.0 or above" (sic) and the API package is `net8.0`.
  **Whether GstarCAD 2026 still hosts a .NET Framework 4.8 CLR as a fallback is not documented anywhere I
  could find; assume NO (verify with Gstarsoft support / by NETLOADing the current SbcStructural DLL into a 2026
  trial).** A process hosts one CLR; AutoCAD 2025 and BricsCAD V26 both dropped Framework entirely when they went
  to .NET 8, and GstarCAD's 2026 `GcWindows.dll` is a WPF-on-.NET-8 build (their 2026 ribbon was "reconstructed
  using WPF").

### 1.2 Loading and registration
- Interactive: `NETLOAD` (identical dialog "Select .Net Assembly"), `APPLOAD` Startup Suite (verify for .NET
  DLLs; documented for ZWCAD, GstarCAD similar).
- Auto load (official "Application Program Auto Load Guide" 2024):
  1. `application.ldr` in the install folder: **GRX only**, not .NET.
  2. LISP: `(command "netload" "C:\\folder\\your.dll")` from `<install>\Support\gcad2024doc.lsp` or a
     `gcaddoc.lsp` on the support path (per-document LISP autoload, like `acaddoc.lsp`).
  3. Registry: `HKEY_CURRENT_USER\SOFTWARE\Gstarsoft\GstarCAD\R24\en-WW\Applications\<MyProgram>` with
     `Managed` (DWORD, 1 = .NET) and `Loader` (string, full DLL path). Key **must** be `Applications`.
     Product key root is obtainable via `acrxProductKey()` (GRX) / `HostApplicationServices.Current.UserRegistryProductRootKey`
     (verify that the managed property exists and returns the `R24\en-WW` path). Release token: `R24` = 2024,
     `R25` = 2025 (verify), `R26` = 2026 (verify); language token `en-WW` for the English/world build (other
     locales differ, e.g. `zh-CN`). `LOADCTRLS` and `DESCRIPTION` values as in AutoCAD are **not** mentioned in the
     guide; whether `LOADCTRLS=2` (startup) vs `4` (on-demand by command) are honoured is **(verify)**; the guide
     implies "load at startup" is the only behaviour.
  4. There is no AutoCAD-style `ApplicationPlugins` / `PackageContents.xml` bundle mechanism documented for
     GstarCAD (verify). GRX apps can also be demand-loaded through the same `Applications` key with `Managed=0`.
- Commands: `[CommandMethod("NAME")]`, `[CommandMethod("GROUP","NAME", CommandFlags.Modal|UsePickSet|...)]`,
  `[assembly: CommandClass(typeof(...))]`, `[LispFunction("name")]`, `IExtensionApplication.Initialize/Terminate`
  all present (`CommandMethodAttribute`, `CommandClassAttribute`, `LispFunctionAttribute`,
  `ExtensionApplicationAttribute` found in GcCoreMgd 2025). `CommandFlags` members found include `Modal`,
  `Transparent`, `UsePickSet`, `Session`, `NoHistory`, `Redraw`; `KeepFocus`/`DocumentCollectionExtension`
  appear in the ZWCAD core but **not** in GstarCAD's 2025 core (minor).
- `Editor`: `GetPoint/GetEntity/GetSelection/GetString/GetKeywords/GetDouble/GetInteger`, `SelectionFilter`,
  `PromptSelectionResult`, `SetImpliedSelection`, `WriteMessage`, `DrawVector`, `PointMonitor`, `Regen`
  (verify), `UpdateScreen`. `Editor.Command(params object[])` and `CommandAsync` exist; the guide says to use
  `Editor.Command` instead of P/Invoking `acedCmd/acedCommand`. `Application.SetSystemVariable/GetSystemVariable`
  present. `Document.Editor.StartUserInteraction(form)` is the documented pattern for picking from a modal dialog.
- Documented API differences vs AutoCAD (official guide section 7):
  - `IdMapping` (and similar) must be wrapped in `using(...)`; GstarCAD does not tolerate relying on the finalizer.
  - `ResultBuffer.UnmanagedObject` is `GcResbuf`; use `ResultBuffer.ResbufObject` / `ResultBuffer.Create(IntPtr,bool)`.
  - COM object names change prefix `Acad` -> `Gcad`.
- Transactions/undo: `Database.TransactionManager.StartTransaction()`, `StartOpenCloseTransaction` (verify),
  `DocumentLock` (present), `Commit/Abort` are present. Undo grouping works through the command boundary as in
  AutoCAD. Nothing suggests differences.
- `DimStyleTableRecord`, `TextStyleTableRecord`, `LinetypeTableRecord`, `LayerTableRecord`, `BlockTable/
  BlockTableRecord`, `Layout`, `LayoutManager`, `Viewport`, `PlotSettings`, `PlotEngine`/`PlotSettingsValidator`
  (verify the validator) all present.
- `MText`, `DBText`, `Hatch` (`AppendLoop`, `HatchLoop`, `SetHatchPattern`, `EvaluateHatch`,
  `GetAssociatedBoundaries` not matched by name in 2025 — **verify** associative hatch boundary read-back),
  `Xrecord`, `ExtensionDictionary`/`CreateExtensionDictionary`, `XData`/`RegAppTable`, `Wipeout`, `Field` present.
- PaletteSet: `Gssoft.Gscad.Windows.PaletteSet` and `Palette` in `GcMgd.dll` with `Add(name, Control)`,
  `AddVisual(name, UIElement)`, `DockEnabled`, `Dock` (DockSides in core), `Style` (PaletteSetStyles),
  `KeepFocus`, `Visible`, `MinimumSize`, `SetSize`, `Location`, `Opacity`, `TitleBarLocation`,
  `ShowCloseButton`, `AutoRollUp`, `Snappable`, `StateChanged`, `PaletteActivated`, `Activate`. The ToolPalette
  namespace also exists. The SDK ships a `SimplePalette` sample (GRX). Known field report: OpenDCL crashed in
  GstarCAD 2023 when a docking-bar pin button was destroyed (worked around by hiding instead) — docking-bar
  lifetime handling in GstarCAD is less forgiving than AutoCAD's **(verify on 2025/2026)**.
- Ribbon: **the 2024/2025 net48 packages contain no `GcWindows.dll`/`GdWindows.dll` and no `RibbonControl` /
  `ComponentManager` types.** Only `RibbonMenuMacro`, `RibbonItemControl` and error strings appear in `GcMgd`.
  In 2026/2027 (`net8.0`) there is a full `Gssoft.Gscad.Ribbon` namespace plus `GcWindows.dll`/`GdWindows.dll`
  with `RibbonControl`, `RibbonTab`(verify), `RibbonPanel`, `RibbonButton`, `RibbonCombo`, `RibbonSplitButton`,
  `ComponentManager`, `RibbonServices` — i.e. the `Autodesk.Windows` equivalent arrives only with the .NET 8 API.
  Conclusion: for GstarCAD <= 2025 the only robust ribbon/menu route is CUI/CUIX customisation (partial CUI
  loaded with `CUILOAD`/`MENULOAD`) or `Application.MenuBar` COM, not managed Ribbon API **(verify whether
  Gstarsoft ships a separate GcWindows.dll in the 2025 install folder outside the NuGet; I could not find one)**.
- LISP interop: `[LispFunction]` present; `(command "netload" ...)` works; `gcaddoc.lsp`/`gcad2024doc.lsp`
  startup LISP; `VLISP/VLIDE` launches a VS Code debugger (2024+). `Application.Invoke`(verify) and
  `Editor.Command` cover the reverse direction. GstarCAD 2025+ also has a Python API (not relevant here).
- Events: `DocumentCollection.DocumentActivated/DocumentCreated/DocumentToBeDestroyed`, `Document.CommandEnded/
  CommandWillStart/CommandCancelled/CommandFailed`, `LispWillStart/LispEnded`, `LayoutSwitched`,
  `Application.SystemVariableChanged`, `Idle`(verify), `Database.ObjectAppended/ObjectModified/ObjectErased`
  (reactor members `ObjectModified` seen in ZWCAD core, in GstarCAD DB assembly (verify)), `BeginSave/SaveComplete`
  (verify).

### 1.3 Documentation and SDK sources
- Developer page: https://www.gstarcad.net/developer/ (links: API Guides zip
  https://ovsdownload.gstarcad.net/software/GstarCAD/2024/DOC/GstarCAD2024_API_Guides.zip — .NET Migration /
  Programming / Upgrade guides, GRX guides, Auto Load guide, LISP debugger guide; SDK
  https://ovsdownload.gstarcad.net/software/GstarCAD/2024/EN/grxsdk_2024.zip). 2025/2026 equivalents follow the
  same URL pattern (verify). Guides are thin (21 pages, mostly VS screenshots); there is **no class-by-class
  reference** — you rely on AutoCAD's ObjectARX .NET reference and the XML doc files shipped in the NuGet
  (`GcDbMgd.xml` etc.), which are AutoCAD's XML comments with namespaces renamed.
- GRX compatibility statement: ObjectARX/GRX "compatible with AutoCAD ObjectARX 2020 APIs" (2027 FAQ, verify for
  the .NET surface; the migration guide says source compatible with ".NET ObjectARX 2010 or higher").
- Community: `Sharper.GstarCAD.Extensions` (NuGet, a port of Gile.AutoCAD.Extension) proves that real-world
  AutoCAD extension code compiles 1:1 against `Gssoft.Gscad` with net48 (2022.x-2024.x) and
  `GStarCad.Net` (another unofficial package) exists. GitHub examples are scarce; most content is Chinese-language.

## 2. ZWCAD .NET API

| ZWCAD | NuGet `ZWCAD.NetApi` | lib target | Assemblies |
|---|---|---|---|
| 2020 | 20.20.0 | net46 | `ZwManaged.dll`, `ZwDatabaseMgd.dll`, `ZwDatabaseMgdBrep.dll`, `Interop.ZWCAD.dll` |
| 2024 | 20.24.0 | net47 | + `ZcWindows.dll`, `ZdWindows.dll` |
| 2025 | 20.25.0 | net47 | + `ZcCui.dll`, `ZwSoft.ZwCAD.Interop.dll`, `ZwSoft.ZwCAD.Interop.Common.dll` (replacing `Interop.ZWCAD.dll`) |
| 2026 | 20.26.0 (Jul 2025) | net47 | same as 2025 |

- Namespaces: `ZwSoft.ZwCAD.{ApplicationServices, DatabaseServices, EditorInput, Geometry, Runtime, Colors,
  GraphicsInterface, GraphicsSystem, LayerManager, PlottingServices, Publishing, Windows, Customization,
  DataExtraction, ComponentModel, Internal}`; ribbon/UI framework in `ZwSoft.Windows.*` (`RibbonControl`,
  `RibbonTab`(verify), `RibbonPanel`, `RibbonButton`, `RibbonCombo`, `RibbonSplitButton`, `RibbonGallery`,
  `RibbonMenuItem`, `ComponentManager`, `RibbonServices`, `Palettes`, `InPlaceEditor`), i.e. the
  `Autodesk.Windows` equivalent, available since ZWCAD 2021 ("new .NET interfaces allow developers to add,
  remove or edit Ribbon tabs, panels and buttons").
- Assembly mapping: `AcMgd+AcCoreMgd` -> `ZwManaged.dll`; `AcDbMgd` -> `ZwDatabaseMgd.dll`;
  `AcDbMgdBrep` -> `ZwDatabaseMgdBrep.dll`; `AcWindows` -> `ZcWindows.dll`; `AdWindows` -> `ZdWindows.dll`;
  `AcCui` -> `ZcCui.dll`. ZWCAD does **not** split Core/Mgd, so `CadAliases` for ZWCAD points both
  `ApplicationServices` and `ApplicationServices.Core` at the same assembly (presumably already handled in the
  existing project).
- .NET Framework: packages are `net47` and the ZWCAD 2024-2026 hosts are .NET Framework (4.7/4.8) processes;
  a net48 plugin is fine. No sign of a .NET 8 move for ZWCAD 2026 (verify ZWCAD 2027 plans with ZWSOFT; AutoCAD
  2025/BricsCAD V26/GstarCAD 2026 all moved, so expect ZWCAD to follow within 1-2 releases).
- 64-bit only for 2024+ (Windows 10/11 64-bit listed in 2026 requirements). ZWCAD 2023 and earlier had 32-bit
  builds (verify).
- Loading: `NETLOAD`; `APPLOAD` Startup Suite accepts lsp/zel/dll/zvb/mnl/drx (official FAQ 577); registry
  `HKLM|HKCU\SOFTWARE\ZWSOFT\ZWCAD\2025\en-US\Applications\<App>` with `LOADCTRLS` (DWORD 2 = startup),
  `LOADER`, `MANAGED` (DWORD 1) — same shape as AutoCAD (from a WiX installer thread on cadtutor; verify exact
  version/language tokens for 2026, e.g. `2026\en-US`).
- Feature surface: identical type list to GstarCAD 2025 for everything in finding 3 above, plus
  `DataExtraction`, `Customization` (CUI API) and the Ribbon namespaces in the Framework build. `Table` has
  `InsertRows/InsertColumns/MergeCells/SetTextString/SetTextHeight/GenerateLayout/Cells`; `MLeader` has
  `AddLeaderLine/AddFirstVertex/AddLastVertex/SetFirstVertex/ContentType/MText`. Same names were found in
  GstarCAD 2025.
- Known ZWCAD quirks relevant to a detailer (field reports; verify on 2026):
  - Dynamic blocks: ZWCAD's native implementation ("Flexiblocks") lacks Lookup parameters; a cadtutor report
    (ZWCAD 2024) describes dynamic blocks degrading to anonymous `*U` blocks after repeated open/save cycles.
    Reading `DynamicBlockReferencePropertyCollection` works, but do not depend on authoring dynamic blocks.
  - DATAEXTRACTION does not extract MTEXT/MLEADER content (user report) — not a .NET API issue but indicative
    of MLeader being a second-class citizen.
  - MLeader created via .NET on non-Autodesk hosts frequently differs in text height/scale/landing gap
    (Bricsys forum threads show the generic pattern; ZWCAD/GstarCAD behaviour **(verify)**).
  - COM interop DLLs must be copied next to the plugin manually (NuGet note).

## 3. Compatibility matrix (AutoCAD = reference; "=" means same managed API surface found/expected)

Legend: Y = present and expected to work; Y* = present but verify behaviour on real drawings; P = partial;
N = absent; ? = unknown.

| Capability needed by SBC Detailer | AutoCAD (.NET 4.8 <= 2024 / .NET 8 >= 2025) | ZWCAD 2024-2026 (net47) | GstarCAD 2024-2025 (net48) | GstarCAD 2026-2027 (net8.0) |
|---|---|---|---|---|
| Read closed `Polyline` (bulges, `Closed`, `Area`, `GetPoint2dAt`, `GetBulgeAt`) | Y | Y | Y | Y |
| Read `Hatch` loops / pattern / associative boundary ids | Y | Y* (`GetAssociatedBoundaryIds` verify) | Y* (verify) | Y* |
| Read `BlockReference` incl. nested (`BlockTableRecord` walk, `BlockTransform`) | Y | Y | Y | Y |
| Read attributes (`AttributeCollection`, `AttributeReference.TextString`) | Y | Y | Y | Y |
| Dynamic block properties read (`DynamicBlockReferencePropertyCollection`, `DynamicBlockTableRecord`, `IsDynamicBlock`) | Y | Y* (Flexiblocks; `*U` anonymisation reports) | Y* | Y* |
| Dynamic block authoring/modification via API | Y (limited anyway) | P/N | P/N (verify) | P/N |
| Create block definition with `AttributeDefinition`, insert with `SetAttributeFromBlock`/`SetDatabaseDefaults` | Y | Y | Y | Y |
| `Line`, `Arc`, `Circle`, `Polyline` creation with bulges, `Wipeout`, `Solid` | Y | Y | Y | Y |
| `DBText` / `MText` (formatting codes `\P`, `\H`, `\S` stacked fractions, `%%c` for diameter symbol) | Y | Y* (render of `\S` and `%%c` verify) | Y* | Y* |
| `AlignedDimension`, `RotatedDimension`, `RadialDimension`, `OrdinateDimension`, `ArcDimension`; `Dimension.DimensionText` override, `Dimscale`, `DimStyleTableRecord` | Y | Y* | Y* | Y* |
| `Leader` (classic) | Y | Y | Y | Y |
| `MLeader` / `MLeaderStyle` | Y | Y* (text height/landing quirks typical on clones) | Y* (verify) | Y* |
| `Table` entity (`Table`, `TableStyle`, `Cells`, `MergeCells`, `GenerateLayout`) | Y | Y* (verify fills/borders/plot) | Y* (verify) | Y* |
| Layers (`LayerTableRecord`, colour, linetype, lineweight, plot flag) | Y | Y | Y | Y |
| Linetypes (`LinetypeTableRecord`, `Database.LoadLineTypeFile`) | Y | Y* (`LoadLineTypeFile` verify, `.lin` path differs: `zwcad.lin`/`gcad.lin`) | Y* | Y* |
| Text styles (`TextStyleTableRecord`, SHX fonts; `simplex.shx`/`romans.shx` availability) | Y | Y | Y | Y |
| Layouts / paper space / `Viewport` creation, `LayoutManager.CurrentLayout`, `CustomScale` | Y | Y* | Y* | Y* |
| Plot via `PlotEngine`/`PlotSettingsValidator`/`PlotInfo` | Y | P (verify; many clones only support PLOT command scripting reliably) | P (verify) | P |
| XData (`RegAppTable`, `Entity.XData`, `TypedValue`, 16 KB per app limit) | Y | Y | Y | Y |
| `Xrecord` in extension dictionary / NOD (`DBDictionary`, `CreateExtensionDictionary`) | Y | Y | Y | Y |
| Fields (`Field`, `EvaluateFields`) | Y | Y* | Y* | Y* |
| Annotative scales (`ObjectContextManager`, `AnnotationScale`, `AddContext`, `Annotative`) | Y | Y* | Y* | Y* |
| INSUNITS / `Database.Insunits`, `Database.Lunits`, `Dimscale` | Y | Y | Y | Y |
| `PaletteSet` (WinForms `Add`, WPF `AddVisual`, docking, `KeepFocus`, `StateChanged`) | Y | Y | Y (docking-bar lifetime quirk reported on 2023) | Y |
| Managed Ribbon API (`RibbonControl`, `ComponentManager`) | Y (`AdWindows`) | Y (`ZwSoft.Windows`, since 2021) | **N** (not in net48 SDK; use CUIX) | Y (`Gssoft.Gscad.Ribbon`, `GcWindows`/`GdWindows`) |
| CUI/CUIX managed API (`Customization`) | Y | Y (`ZcCui.dll`, 2025+) | N / ? | Y (`GcCUI.dll`) |
| Events: `DocumentManager.DocumentActivated/Created/ToBeDestroyed`, `Document.CommandEnded/WillStart`, `Database.ObjectAppended/Modified/Erased`, `SystemVariableChanged` | Y | Y | Y | Y |
| `Editor.Command`/`CommandAsync`, `SendStringToExecute`, `[LispFunction]` | Y | Y | Y | Y |
| Transactions, `DocumentLock`, undo marks | Y | Y | Y | Y |
| `Editor.GetSelection` with `SelectionFilter`, `SelectCrossingWindow`, `SelectImplied` | Y | Y | Y | Y |
| `Database.ReadDwgFile` side databases + `WblockCloneObjects` / `Insert` of a template DWG | Y | Y* | Y* | Y* |
| ObjectOverrule / DrawableOverrule | Y | ? (verify) | ? (verify) | ? |
| .NET runtime | 4.8 (<=2024), .NET 8 (>=2025) | 4.7/4.8 | 4.8 | **.NET 8** |
| 32-bit | N | N (2024+) | N (2024+) | N |

Known differences / bug areas to budget test time for (all clones): MLeader geometry and text-height scaling;
Table cell formatting, borders and plot output; associative hatch boundary round-trip; annotative scale
representations; `Dimension` text override rendering with `<>` and `\X`; `MText` column/stacking; `Explode` of
dynamic blocks; `LoadLineTypeFile` path handling; `Database.Insunits` defaulting; `PlotEngine` reliability.

## 4. One code base on multiple hosts

### (a) Compile-time: assembly reference swap + alias layer (one DLL per host) — the current CadAliases pattern
How it works: a `Directory.Build.props`/csproj `Condition` per host (`ZWCAD`, `GSTARCAD`, `AUTOCAD`, `PCAD`)
selects the reference set (`ZwManaged/ZwDatabaseMgd` vs `GcCoreMgd/GcDbMgd/GcMgd` vs `AcCoreMgd/AcDbMgd/AcMgd`),
and a single `CadAliases.cs` (global `using` aliases with `#if`) maps `AcAp = …ApplicationServices`,
`AcDb = …DatabaseServices`, `AcEd = …EditorInput`, `AcGe = …Geometry`, `AcRx = …Runtime`, `AcWin = …Windows`,
`AcCol = …Colors`. With C# 10 `global using`, the alias file is the only place that knows the host. Because
GstarCAD's API is a namespace rename of AutoCAD's, **the existing SbcStructural code should compile against
`Gssoft.Gscad` with only the alias file and the references changed** (plus the few documented deltas:
`using` on `IdMapping`, `ResultBuffer.ResbufObject`, no `Autodesk.Windows` ribbon on <= 2025).
`extern alias` is not needed because each build references exactly one host's assemblies; it only matters if
you ever wanted both hosts' DLLs in one compilation, which you never do.
Pros: zero runtime overhead, full IntelliSense, compile errors show host incompatibilities immediately,
standard practice (BricsCAD/ZWCAD/GstarCAD vendors all document it), obfuscation and signing unchanged
per output. Cons: N build configurations and N artefacts; a GstarCAD 2026 build additionally needs a
different TargetFramework (`net8.0-windows`), so the project should become SDK-style with
`<TargetFrameworks>net48;net8.0-windows</TargetFrameworks>` and `Condition` on both TFM and host symbol
(same recipe Autodesk published for AutoCAD 2025 migration).

### (b) Run-time abstraction `ICadHost` + per-host adapters
One host-neutral core assembly compiled against an interface (`ICadHost`, `IEntityWriter`, `IUiHost`, …) and thin
adapter assemblies per host that implement it with the host's API. Pros: the detailing logic becomes unit-testable
without any CAD, host quirks are isolated, new hosts need only an adapter. Cons: you have to re-express every
CAD call you use through the interface (which for a full ObjectARX surface is a large wrapper, and leaking
`ObjectId`, `Point3d`, `Transaction` types across the boundary is the usual failure); it is also slower to write
and the existing SbcStructural code does not follow it.

### (c) Neutral DWG/DXF generation (ACadSharp / netDxf / ODA Teigha) and insertion
Generate the detail drawing as a DXF/DWG with a neutral library, then `Database.ReadDwgFile` + `Insert`/
`WblockCloneObjects` into the live document. Pros: core is completely host-independent and testable; same
geometry on every host; DXF files double as regression fixtures. Cons for a detailer: output must go into the
*live* document on the user's layers/styles with live interaction (pick a beam, place the elevation, prompt
for options, undo as one step); import adds a side-database round-trip, style/layer name clashes and
`DuplicateRecordCloning` policy headaches; no live `Editor` prompting during generation; netDxf writes DXF only
(2000-2018), ACadSharp DWG writing is young (verify maturity); ODA requires a commercial licence; hatches,
dimensions and MText created by neutral libraries rely on the host regenerating dimension blocks correctly on
import (clones often fail to recompute dimension geometry on import until DIMREGEN). Also the plugin already
lives inside the host process, so this gains little.

### Recommendation
**(a) as the backbone, with a small (b)-style `ICadHost` adapter only for genuinely host-specific concerns.**
Concretely:
1. Keep one solution, convert `SbcStructural.csproj` to SDK-style, add build configurations
   `ZWCAD-net48`, `GSTARCAD-net48` (GstarCAD 2024/2025), `GSTARCAD-net8` (GstarCAD 2026+), keep `AUTOCAD`/`PCAD`
   as today. Reference the managed assemblies from `NuGet` (`ZWCAD.NetApi`, `GstarCADNET`) with
   `ExcludeAssets="runtime"`/`Private=false` (never copy host DLLs next to the plugin).
2. Extend `CadAliases.cs` with the `Gssoft.Gscad` set. Add a `CadHost` static facade with
   `CadHost.Current : ICadHost` (per-host partial class) exposing only: product name/version/registry root,
   `ShowPalette(UserControl/UIElement)`, `AddRibbonOrMenu(...)` (ribbon on ZWCAD/GstarCAD 2026, CUIX/menu on
   GstarCAD <= 2025), `RunCommandLine(string)`, `GetSupportPath()`, `GetLinetypeFileName()`,
   `MakeLeader(...)`/`MakeTable(...)` shims, and capability flags (`SupportsMLeader`, `SupportsTable`,
   `SupportsManagedRibbon`, `SupportsPlotEngine`).
3. Write the Detailer as a pure "geometry + schedule" model (`DetailModel`: bars, shapes, labels, dimension
   requests, schedule rows) with no CAD types, then a single `DetailRenderer` that draws it with primitive entities
   through the alias layer. Rules for the renderer and all new code:
   - Use only: `Line`, `Arc`, `Circle`, `Polyline` (with bulges), `DBText`, `MText`, `AlignedDimension`,
     `RotatedDimension`, `RadialDimension`, `Leader` (classic), `Hatch` with simple loops, `BlockReference`
     with `AttributeReference`s, `Wipeout`, `LayerTableRecord`, `TextStyleTableRecord`, `DimStyleTableRecord`,
     `Xrecord`/XData.
   - Do **not** use `Table` (build schedules from lines + text — the bar-bending-schedule as a block/lines is
     what most detailing tools do anyway), `MLeader` (use `Leader` + `MText`, or a leader block), dynamic-block
     authoring, `Field`s, `Autodesk.Windows`/`ZwSoft.Windows`/`Gssoft.Gscad.Ribbon` directly, `PlotEngine`,
     Overrules, `Editor.Command` with host-specific command names, COM interop, `Internal.*` namespaces,
     P/Invoke into `accore.dll`/`zwcad.exe`/`gcad.exe`.
   - All text in MText should limit itself to `\P`, `\H`, `\S` (stacked) and `%%c/%%d/%%p`; verify rendering on
     both hosts in the regression set.
   - Persist detailer data in `Xrecord`s under an extension dictionary with an application-specific key, with a
     version number in the data; never rely on host-specific dictionary names.
   - Read input (slab/beam outlines) from closed polylines, hatches and blocks through a reader that normalises
     into the model; treat dynamic blocks read-only.
   - UI: WinForms or WPF user controls hosted in `PaletteSet` via the facade; keep WPF free of host assemblies
     so one UI assembly serves all builds (verify WPF on GstarCAD 2025 PaletteSet `AddVisual`).
   - All host entry points (`[CommandMethod]`) in one `Commands.cs`; command names identical on all hosts.
4. If the GstarCAD 2026 target is required: multi-target `net48;net8.0-windows` from day one. Code is the same;
   the .NET 8 build drops `System.Drawing`-heavy WinForms conveniences only where they changed (they mostly
   still exist on `net8.0-windows`). ConfuserEx does not support .NET 8 assemblies well — see risks.

## 5. Testing on both hosts

### Scripted launches
- Both hosts honour the AutoCAD-style startup switches: `/b <script.scr>` (run script), `/nologo`,
  `/t <template.dwt>`, `/p <profile>`, `/s <support paths>`; JTB SmartBatch documents batch processing on
  "AutoCAD, BricsCAD, ZWCAD or GstarCAD" via SCR/LSP, which relies on these switches. Exact switch list per
  host is not in the vendors' public docs (verify with `zwcad.exe /?` and `gcad.exe /?`, or by test).
  Executables: `C:\Program Files\ZWSOFT\ZWCAD 2026\ZWCAD.exe`, `C:\Program Files\Gstarsoft\GstarCAD2025\gcad.exe`
  (paths verify).
- Neither host has a true headless/console mode like `accoreconsole.exe` (verify; nothing found). "Semi-headless":
  launch the GUI with `/nologo /b run.scr`, where `run.scr` does `NETLOAD "…\SbcStructural.dll"`, opens each
  fixture DWG, runs the detailer in a non-interactive mode driven by a JSON job file
  (`SBCDETAIL_BATCH job.json`), `SAVEAS` `2018` DXF/DWG to an output folder, and `QUIT Y`. Wrap in a PowerShell
  runner with a timeout and `FILEDIA 0`, `CMDDIA 0`, `ATTDIA 0`, `EXPERT 5`, `PROXYNOTICE 0`. A `[CommandMethod(..,
  CommandFlags.Session)]` command can also drive the whole batch from inside the host once loaded.
- Alternatively use COM automation (`ZWCAD.Application` / `gcad.application` ProgIDs) from a test runner to open
  drawings and `SendCommand` — usable but flakier than `/b`.

### DXF-based regression comparison
- Every batch job saves DXF R2018 (text, diff-friendly). A normaliser (Python `ezdxf`, or ACadSharp in a .NET
  test project) strips handles, timestamps, `$FINGERPRINTGUID`, `$VERSIONGUID`, owner handles, ordering, and
  rounds coordinates to 1e-6; then compares entity counts per layer/type, polyline vertex lists, text strings,
  dimension measurements (`Dimension.Measurement`), block names and attribute values, Xrecord payloads.
- Store golden DXFs **per host** (ZWCAD and GstarCAD produce slightly different dimension block geometry and
  MText encoding) and additionally compare *across* hosts on the semantic layer only (counts, strings,
  measurements, bounding boxes with tolerance), not on raw geometry of dimension blocks.
- Pure-model unit tests (`DetailModel` -> expected bars, lengths, bending shapes, schedule rows) run in plain
  xUnit on CI without any CAD; only the renderer/reader needs the host matrix.

### Dual-host regression matrix (rows = fixtures, columns = hosts)
| Fixture | ZWCAD 2025 net48 | ZWCAD 2026 net48 | GstarCAD 2024 net48 | GstarCAD 2025 net48 | GstarCAD 2026 net8 | AutoCAD 2024 (if kept) |
|---|---|---|---|---|---|---|
| Load/NETLOAD + command registration | | | | | | |
| Read closed polyline slab, hatch region, block with attributes, nested block, dynamic block | | | | | | |
| Beam elevation + section with bars, stirrups, dims, leaders | | | | | | |
| Slab plan with bar marks, MText with `\S` and `%%c` | | | | | | |
| Bar bending schedule (lines+text) | | | | | | |
| Layer/text/dim style creation, INSUNITS mm vs m vs inch drawings | | | | | | |
| Layout + viewport placement | | | | | | |
| Xrecord persistence, re-open and re-detail (idempotence) | | | | | | |
| Undo in one step, no orphan objects | | | | | | |
| PaletteSet show/dock/float/close cycle (manual smoke) | | | | | | |
| Ribbon/menu presence (manual smoke) | | | | | | |
Automation: GitHub Actions/Jenkins cannot run these on Linux; a Windows VM with both products installed and
licensed is needed (hosts are 64-bit only). Each cell executes the `/b` script and the DXF comparator.

## 6. Risks

1. **GstarCAD runtime split (.NET 8 from 2026).** Highest impact. Either restrict support to GstarCAD <= 2025 or
   multi-target. Owner decision needed. ZWCAD will probably follow eventually.
2. **API maturity on GstarCAD.** The .NET layer is "C++/CLI, 100% integrity in core module interfaces most
   commonly used" (vendor wording), which implicitly admits gaps outside the core. Expect: missing or stubbed
   members (compile errors reveal those), behaviour differences in MLeader/Table/annotative/fields, stricter
   object-lifetime rules (`using` on `IdMapping`), and crashes on docking-bar teardown (OpenDCL 2023 report).
   Budget for a spike: compile SbcStructural against `GstarCADNET 25.1.0` and NETLOAD into a GstarCAD 2025 trial.
3. **Documentation.** GstarCAD .NET docs are thin (three short guides + sample projects, no class reference).
   ZWCAD has a ".NET Developing Guide" and an online API reference with the SDK (verify link). Both rely on
   AutoCAD's documentation by analogy. Links: GstarCAD developer page https://www.gstarcad.net/developer/,
   guides zip (above), NuGet `GstarCADNET`, `GStarCad.Net`, `Sharper.GstarCAD.Extensions`; ZWCAD NuGet
   `ZWCAD.NetApi`, ZWCAD developer site https://www.zwsoft.com/ (SDK download requires registration, verify),
   ZWCAD .NET Developing Guide (Scribd mirror).
4. **Version/namespace fragmentation.** GstarCAD 2017-2023 = `GrxCAD.*` (`gmap/gmdb`), 2024-2025 =
   `Gssoft.Gscad.*` net48, 2026+ = `Gssoft.Gscad.*` net8. Registry root tokens change per year (`R24`, `R25`, …)
   and per language (`en-WW`). ZWCAD: `Interop.ZWCAD.dll` renamed to `ZwSoft.ZwCAD.Interop*.dll` in 2025;
   registry `ZWSOFT\ZWCAD\<year>\<lang>`. Installer must enumerate installed versions and write the right keys.
5. **Licensing of the SDK.** GstarCAD managed DLLs are redistributable "in object code form" per the NuGet
   COPYRIGHT; never ship them anyway (`Private=false`). Trial licences of each host are needed for the test VM;
   GstarCAD and ZWCAD both time-limit trials (30 days, verify), so plan for paid dev seats.
6. **PaletteSet docking differences.** All three implement `PaletteSet`, but docking persistence (`Dock`,
   `DockEnabled`, size restore on reopen), `KeepFocus` behaviour with WPF, and teardown are classic sources of
   per-host bugs; keep the palette simple (one `Palette`, no nested splitters), save/restore size yourself, and
   never destroy the palette at document switch.
7. **Ribbon on GstarCAD <= 2025**: no managed ribbon API in the net48 SDK; ship a partial CUIX + menu instead
   (also works on ZWCAD; AutoCAD supports partial CUIX too), so a single customisation route works everywhere.
8. **Obfuscation.** ConfuserEx targets .NET Framework; its .NET Core/.NET 8 support is incomplete/unmaintained
   (verify current fork status: ConfuserEx2/"Neo-ConfuserEx"). Per-host builds mean N obfuscation passes with
   per-host exclusions (the command classes and `IExtensionApplication` must stay un-renamed; attributes
   preserved). Mixed-mode host assemblies must be excluded from merging. For the net8 build consider
   Obfuscar/.NET-8-capable tools or accept no obfuscation.
9. **Dimension/MText rendering variance** between hosts affects drawings handed to clients; capture per-host
   golden images in the regression set.
10. **Single-vendor forum support.** GstarCAD .NET questions get answered mostly on Chinese forums; expect slow
   vendor support for API bugs.

## 7. Questions for the owner

1. Which GstarCAD versions must be supported: 2024, 2025 only (net48), or also 2026/2027 (.NET 8 required)?
   Which do the target customers actually run today?
2. Which ZWCAD versions (2024, 2025, 2026)? Any ZWCAD 2023 or older (32-bit, different interop names)?
3. Must AutoCAD and pCAD (ProgeCAD?) builds remain supported for the Detailer, or only ZWCAD + GstarCAD?
   (pCAD/IntelliCAD derivatives have a materially different .NET API and would push towards strategy (b).)
4. Is 32-bit needed anywhere? (Both hosts are 64-bit only in the supported range; I recommend "no".)
5. Is a GstarCAD 2026 trial/licence available now for a one-week feasibility spike (compile + NETLOAD + palette)?
6. Can the Detailer output use lines+text for schedules and classic `Leader`s instead of `Table`/`MLeader`?
   (Yes recommended; confirm clients do not require editable `Table` objects.)
7. Is the UI WinForms or WPF today, and is it acceptable to replace any ribbon code with a partial CUIX for
   the GstarCAD <= 2025 builds?
8. Obfuscation: is ConfuserEx mandatory for all builds, including a future .NET 8 build?
9. Is a Windows test VM with both hosts installed available for a scripted regression matrix?
10. Language/locale of customer installs (affects registry `en-WW`/`en-US` tokens and `.lin`/`.shx` names).

## Sources

Official / vendor
- GstarCAD Developer page (SDK and API Guides links): https://www.gstarcad.net/developer/
- GstarCAD 2024 API Guides zip (read: .NET Migration Guide, .NET Programming Guide, .NET Upgrade Guide,
  Application Program Auto Load Guide): https://ovsdownload.gstarcad.net/software/GstarCAD/2024/DOC/GstarCAD2024_API_Guides.zip
- GstarCAD 2024 .NET Migration Guide (mirror): https://gstarcadaustralia.com/wp-content/uploads/2024/04/GstarCAD-2024-.NET-Migration-Guide.pdf
- GstarCAD GRX SDK 2024: https://ovsdownload.gstarcad.net/software/GstarCAD/2024/EN/grxsdk_2024.zip
- GstarCAD system requirements (".NET 8.0 only for custom software development"): https://www.gstarcad.uk/system-requirements/
- GstarCAD 2027 FAQ (".NET Framework 8.0 or above", ObjectARX 2020-compatible GRX): https://gstarcadaustralia.com/faq-gstarcad-2027/
- What's new in GstarCAD 2026 (".NET and .NET 8", WPF ribbon): https://www.gstarcad.net/cad/feature-new/
- Enhanced API in GstarCAD 2024 (C++/CLI .NET layer, LISP encodings, VS Code LISP debugger): https://blog.gstarcad.net/enhanced-api-in-gstarcad-2024/
- GstarCAD 2025 customisation / API overview: https://acad.com.sg/gstarcad-2025-customization
- ZWCAD autoload FAQ (APPLOAD Startup Suite, lsp/zel/dll/zvb/mnl/drx): https://www.zwsoft.com/support/zwcad-base-faq/577
- ZWCAD 2021 .NET Ribbon API announcement: https://www.zwsoft.com/news/corporate/customize-your-zwcad-2021-easy-peasy
- ZWCAD .NET Developing Guide (Scribd mirror): https://www.scribd.com/document/459000373/ZWCAD-NET-Developing-Guide
- Autodesk: Distribute your application (.NET), registry `LOADCTRLS/LOADER/MANAGED` reference semantics: https://help.autodesk.com/cloudhelp/2026/CSY/OARX-DevGuide-Managed/files/GUID-70D60274-57E0-4B22-8D0C-3C7F212A7CAF.htm
- Autodesk: AutoCAD 2025 .NET 8 migration (pattern reused for GstarCAD 2026): https://blog.autodesk.io/autocad-2025-dotnet8-migration/
- Bricsys: .NET plugins in BricsCAD V26 (.NET 8 only): https://help.bricsys.com/en-us/document/knowledge-base/how-to/how-to-develop-and-run-net-plugins-in-bricscad-v26
- AutoCAD command-line switches (`/b`, `/nologo`, `/t`, `/p`, `/s`; clones mirror these): https://help.autodesk.com/cloudhelp/2025/ENU/AutoCAD-Customization/files/GUID-5510017F-4656-478F-BD4C-AB6B1998BF55.htm

Packages inspected (binaries unpacked and type/namespace names extracted)
- NuGet `GstarCADNET` 21.2.0, 22.0.0, 23.0.0 (`gmap/gmdb`, `GrxCAD.*`, net48), 24.1.1, 25.1.0 (`GcCoreMgd/GcDbMgd/GcMgd/GcDbMgdBrep`, net48), 26.0.0, 27.0.0 (+`GcWindows/GdWindows/GcCUI`, net8.0): https://www.nuget.org/packages/GstarCADNET
- NuGet `GStarCad.Net` 24.1.0 (net48) / 20.26.1 (net8.0): https://www.nuget.org/packages/GStarCad.Net
- NuGet `GstarCAD.Interop.x64` 25.0.0 (COM wrapper, net48): https://packages.nuget.org/packages/GstarCAD.Interop.x64/25.0.0
- NuGet `Sharper.GstarCAD.Extensions` (Gile.AutoCAD.Extension port, net40/net48): https://www.nuget.org/packages/Sharper.GstarCAD.Extensions
- NuGet `ZWCAD.NetApi` 20.20.0 (net46), 20.24.0, 20.25.0, 20.26.0 (net47): https://www.nuget.org/packages/ZWCAD.NetApi

Forum / community
- JTB SmartBatch (batch SCR/LSP on AutoCAD, BricsCAD, ZWCAD, GstarCAD): https://blog.jtbworld.com/2021/01/batch-scripting-for-zwcad-with-jtb.html
- WiX installer for different ZWCAD versions (registry `SOFTWARE\ZWSOFT\ZWCAD\2025\en-US\Applications`): https://www.cadtutor.net/forum/topic/96496-how-to-configure-wix-installer-for-different-zwcad-versions
- ZWCAD dynamic blocks degrading to `*U` blocks: https://www.cadtutor.net/forum/topic/99022-dynamic-blocks-corrupted-after-a-while-of-usage-in-zwcad
- OpenDCL + GstarCAD 2023 docking-bar crash: https://www.opendcl.com/forum-archive/topics/2848-problem-with-opendcl-and-gstarcad-2023.html
- Bricsys: MLeaders created with .NET behave differently (generic clone issue): https://forum.bricsys.com/discussion/35607/v20-mleaders-created-with-net-behave-differently-than-v19-or-autocad
- xtracad.com "Important Notice: Transition to .NET 8 for 2026 Applications" (could not fetch; title only): https://www.xtracad.com/forum/index.php/topic,17753.0.html
