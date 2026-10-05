# CAD REVIEWER findings — SBC_DETAILER_SYSTEM_PLAN_V1.md

Reviewed against APPENDIX_A_plugin_session_audit.md (what exists) and APPENDIX_D_cad_platform_research.md (dual-host facts). Scope: §1–§7, §9, §10, §16, §18, §19.3, §21, milestones. Ordered most severe first. "Fix" = text to insert/replace in the plan.

---

## BLOCKER

**1. [§2, §21 Commands] `SBCDETAIL*` names may collide with the existing `Details` module; collision is unverifiable from Appendix A.**
Appendix A §2 lists a "Details" command group and ~52 documented commands but names only 8 of them; the `Details` module's command names (likely `SBCDETAIL`, `SBCDETAILS` or similar) are unknown. A duplicate `[CommandMethod]` name in the same assembly throws at NETLOAD ("duplicate command") or silently shadows the existing one; a near-duplicate (`SBCDETAIL` vs existing `SBCDETAILS`) is a daily usability trap. The plan presents the names as settled.
Fix (add to §21 Commands, first paragraph): "**Names provisional.** Before any command is registered, grep `Commands.cs` and `Docs\SBC_Command_Reference.md` §1 for `DETAIL`, `SECT`, `LINK`. If any existing command starts with `SBCDETAIL`, the Detailer family is renamed `SBCRD*` (`SBCRDIMPORT`, `SBCRDMATCH`, `SBCRD`, `SBCRDUPDATE`, `SBCRDACCEPT`, `SBCRDREPORT`, `SBCRDBATCH`) and the `SBT*` twins follow. Decision recorded as a D-row in V1.1. Every Detailer `[CommandMethod]` uses an explicit command group `SBCDET` so the host's command table reports it as such." Add to §1 Known gaps: "exact command names of the Details/Section/3D groups".

---

## MAJOR

**2. [§21 Commands, §19.4] `SBCDETAIL [mark … | ALL]`, `SBCDETAILACCEPT <mark>`, `SBCDETAILBATCH job.json`, `SBCDETAIL C7` are not a valid command syntax on any host.**
A `[CommandMethod]` receives no arguments; typing `SBCDETAIL C7` on the command line runs `SBCDETAIL` and then tries to run `C7` as a command on both ZWCAD and GstarCAD. Arguments must be obtained with `Editor.GetString/GetKeywords/GetEntity` (or `CommandFlags.UsePickSet` for a pre-selected outline), which also keeps the SBT twins scriptable via `/b` scripts (each prompt answer on its own line).
Fix (replace the §21 command table rows): "`SBCDETAIL` — `[CommandMethod("SBCDET","SBCDETAIL", CommandFlags.Modal|CommandFlags.UsePickSet)]`; prompt `Select column outline or [All/Mark/Storey] <pick>:`; `Mark` → `GetString`. `SBCDETAILACCEPT` prompts `Mark to accept:` then the reason. `SBCDETAILBATCH` prompts `Job file:` (`FILEDIA 0` in scripts) or reads `SBC_DET_JOB` env var when set. No command takes inline arguments; §19.4 step 1 reads 'User types `SBCDETAIL`, picks a column (or answers `M` and types the mark)'."

**3. [§14.1 step 8 vs §16.3, §9 Persistence] "Every entity carries an Xrecord with mark, storey, design revision …" multiplies extension dictionaries per entity and contradicts the block-level design.**
A 42-column run produces several thousand primitives; an extension dictionary + Xrecord on each one bloats the DWG (each is an object with its own handle), slows SAVE/OPEN on both hosts, and §16.3 already makes the block the unit of identity with `SBC_DETAIL_STATE` on the block.
Fix (§14.1 step 8, last sentence): replace with "Only the inserted `BlockReference` carries `SBC_DETAIL_STATE` (§9); primitives inside the definition carry nothing. Lines inside the definition that must be traceable (e.g. a bar) are identified by layer and mark text, not by Xrecord." Remove "XData" from the §16.6 whitelist sentence (XData already rejected in §9).

**4. [§10 step 7, §12 Persistence and re-match] `SBC_BLK` copy handles are not durable; they are deleted/recreated by SBTNUMBER.**
Appendix A §2: SBC_BLK copies are "refreshed/removed by SBTNUMBER when the block changes". §12 re-validates match entries "by handle (entity still exists …)". After any renumber on a block-based plan every match whose `CadHandles` point to SBC_BLK copies silently fails the handle check and is downgraded — exactly the "drop" the plan wants to avoid, on every run.
Fix (§12, "Persistence and re-match"): "`CadHandles` stores, in order of preference: the source INSERT handle + the index of the piece inside the block definition (from the StructuralBlocks map, §7), then the drawn polyline handle. SBC_BLK copy handles are never stored. Re-validation by handle uses the source INSERT; a missing INSERT (not a missing copy) is what downgrades the match. Marks + storey + centroid (≤ 100 mm) is the fallback key."

**5. [§16.7 Regeneration policy] No rule for an exploded or missing detail reference → `SBCDETAILUPDATE` re-inserts a duplicate on top of a hand-edited detail.**
Office draughtsmen edit a generated detail by EXPLODE, not through BEDIT/REFEDIT (which differ per host and are slow on clones). After EXPLODE the definition still exists but no reference does; the policy only covers "definition hash differs". The update would then insert a fresh reference in the grid cell, overlapping the exploded copy.
Fix (append to §16.7): "If `SBC_DETAILER` NOD lists a detail whose `BlockReference` handle no longer exists: (a) if the definition still exists and is referenced 0 times → state `EXPLODED` — never re-insert, report 'C12 section exploded by hand — skipped (SBCDETAILFORCE re-inserts next to it)', keep the NOD entry; (b) if another reference of the same definition exists (user COPY) → treat the lowest-handle one as managed, the rest as 'user copy — not managed'. After redefining a definition call `RecordGraphicsModified(true)` on every reference and re-sync its attributes (attribute references are not updated by a redefinition on either host). Orphaned `*D`/`*U` anonymous blocks created by dimension regeneration are purged at the end of the command."

**6. [§7 CadAliases/csproj, §19.3, §21 Dual-host build] The GSTARCAD-net48 build must exclude every existing file that uses `ZwSoft.Windows` (managed ribbon), not just add a CUIX for the Detail button.**
Appendix A §6: `Ribbon.cs` (old) and the ui_a 6-button "SBC" ribbon tab, planned status-bar items, and `SbcTheme.cs` "follows ZWCAD theme" exist in the current plugin. Appendix D §1.2: GstarCAD 2024/2025 net48 has no `RibbonControl`/`ComponentManager`; `KeepFocus`/`DocumentCollectionExtension` are also absent. The current plugin therefore does not compile under `Gssoft.Gscad` until those files are conditionally excluded; the plan's M0 ("compiles under GSTARCAD-net48 with the alias set") and §7 ("Add GSTARCAD alias set") understate this.
Fix (§7 row `CadAliases.cs, CadCompat.cs`, add): "Inventory item: list every file referencing `ZwSoft.Windows`, `ZcWindows`, `ZdWindows`, `ZcCui`, `KeepFocus`, `Customization`. Each goes behind `#if !GSTARCAD` or behind `ICadHost.SupportsManagedRibbon`; the ribbon tab (ui_a) and status-bar items are replaced by the partial CUIX + `(command "_.CUILOAD")`/`MENULOAD` on GstarCAD, loaded once from `IExtensionApplication.Initialize`. The CUIX also serves ZWCAD so the Detail button has one route. M0 exit criterion adds: 'list of excluded files and their GstarCAD replacement in the lane note'."

**7. [§7 `SbcStructural.csproj`, §21, M0] Converting the plugin to an SDK-style project is not needed for V1 (net48 only, D6) and is the riskiest change in a 5-day spike.**
The project is a legacy net48 WinForms/WPF csproj with ConfuserEx `.crproj` files, `build_release.ps1` paths, ReflectHarness and Net8Smoke built around it. SDK-style conversion touches resx/WPF (`UseWPF`), output paths, assembly info, and the obfuscation inputs; nothing in V1 needs `<TargetFrameworks>`.
Fix (§7 row, §21 "Dual-host build", M0): replace "SDK-style project; configurations …" with "Keep the legacy csproj. Add build configurations `GSTARCAD2024` / `GSTARCAD2025` (`DefineConstants GSTARCAD;GSTARCAD_R24|R25`) with `<Reference>` items conditioned on configuration, pointing at `CAD_SDK\gstarcad2024\` and `CAD_SDK\gstarcad2025\` (same `$CadRefRoot` convention as the AutoCAD/ZWCAD folders in `build_release.ps1`) — NuGet `GstarCADNET` is only the source of those DLLs. SDK-style + multi-target is deferred to the GstarCAD 2026/.NET 8 decision (R14)."

**8. [§21 Dual-host build, matrix] One DLL compiled against `GstarCADNET 25.1.0` is assumed to load on GstarCAD 2024 (`plugin_out_gs2024`).**
The managed assemblies carry per-release versions; if strong-named (verify), a 25.1.0-compiled DLL fails to bind on 2024 without binding redirects, and vice versa. Appendix D lists 24.1.1 and 25.1.0 as separate packages. The plan references only 25.1.0 yet tests a gs2024 cell.
Fix (§21 "Dual-host build"): "One build per GstarCAD release: `GSTARCAD2024` against `GstarCADNET 24.1.1`, `GSTARCAD2025` against `25.1.0` (as `plugin_out_gs2024` / `plugin_out_gs2025` already imply). M0 verifies whether the 2025 build loads on 2024; if it does, the 2024 configuration is dropped and the lane note says so. The installer writes `R24` or `R25` keys per detected release (App. D §1.2, 'verify' token)."

**9. [M1 exit criteria vs §21 Regression harness] "Entity-for-entity identical on ZWCAD and GstarCAD 2025 (script-checked, 0.1 mm)" contradicts Appendix D §5 and §21's own per-host baselines.**
Appendix D §5: "ZWCAD and GstarCAD produce slightly different dimension block geometry and MText encoding"; compare across hosts "on the semantic layer only". Dimensions inside the detail blocks create `*D` anonymous blocks whose geometry differs per host; a 0.1 mm raw-entity diff will fail forever.
Fix (M1 exit criteria): replace with "Semantic equality on both hosts per `compare.py --semantic` (entity counts per layer/type, polyline vertices ± 0.1 mm, text strings, attribute values, `Dimension.Measurement`, Xrecord payloads, bounding boxes ± 0.5 mm); raw geometry compared only against that host's own `baseline\{zw,gs}\` golden."

**10. [§16.7, §18, §21 perf] Transaction/undo model is contradictory: "one transaction with one undo mark" (§16.7), "one transaction per member" (§21), "render errors roll back the whole transaction" (§18).**
If each member is committed in its own top-level transaction, a failure at member 30 cannot roll back members 1–29 inside the command; the command then ends `FAILED` with 29 blocks inserted, which §18 forbids ("never half-inserted blocks").
Fix (§16.7 last sentence, and §21 perf bullet): "One outer `StartTransaction()` per command (= one undo group, the host already groups a `[CommandMethod]`); per member a nested `StartTransaction()` that is aborted on that member's render error (member skipped, G8 finding) and committed otherwise; the outer transaction commits only if the run did not end `FAILED`. Never `Commit` per member at top level. Entities are added in batches with `Database.AddDBObject`-free code paths (no `Editor.Command`); no `Regen` until the end."

**11. [§10 step 6, §15] "`OpeningFinder` reuses the OPENING layer" — on a structural plan the OPENING layer holds slab cut-outs (lift, ducts), not wall openings.**
Appendix A §2 ties OPENING to the lift-wall rule ("LIFT" text + cut-out → enclosing walls are LW), i.e. a slab opening. Door/window openings in a shear wall are drawn as a gap between two wall pieces (two polylines of the same mark, often with a lintel/beam on the BEAM layer) or not at all; wall openings are listed as "not revealed" in Appendix A §10. §15 step 7 (trimmer bars, coupling-beam detection) would never fire.
Fix (§10 step 6): "Wall openings are detected as (a) a gap between two collinear wall pieces of the same mark/thickness whose ends are ≤ the opening threshold apart, with a BEAM-layer entity or lintel spanning the gap; (b) a closed polyline on a new `SBC-WALL-OPEN` layer lying inside the wall outline (sill/head as optional attributes of a small block or `null`). OPENING-layer entities are slab cut-outs and are used only for the lift-wall rule and for 'wall touches a slab opening' notes. Both detections are **(assumed — verify in inventory: how Numbering joins wall pieces)**."

**12. [§16.4, §21 perf, R13] Thousands of detail primitives in model space make the existing `Model.Load` full-scan slower; the plugin's own +10 % gate on `SBTNUMBER`/`SBTSHEETS` will trip after details are inserted.**
Appendix A §2/§9: `Model.Load` does a full model-space scan per command and is the known hot spot; peak memory 0.8–1.6 GB. The plan budgets only the Detailer's own commands.
Fix (§21 Performance budget, add): "Regression case `det_after_number`: run `SBTNUMBER` and `SBTSHEETS` on `realworld` after `SBTDETAILBATCH` inserted all details; both must stay within their existing perf baselines (+10 %). If they do not, `Model.Load` gains a layer-filtered `SelectAll` (`SelectionFilter` on structural layers) instead of iterating the model-space BlockTableRecord, or the details move into a single container block `SBC_DETAILS` referenced once in model space (one entity for the scan to skip). This is checked in M2, not M4."

**13. [§16.5, §21 perf] Bars as `Circle` + `Hatch` per bar: ~1,500 hatches for 42 columns, hatch evaluation on clones is the slow path and a classic regen/plot difference area (App. D §3 "hatch … budget test time").**
Fix (§16.5 Column section): "bars as solid donuts: a closed `Polyline` of two arc segments (bulge 1) with constant width = bar radius (the DONUT primitive) on `SBC-DET-BAR`; no `Hatch` per bar. `Hatch` is used only for concrete shading if the office standard needs it, one hatch per section." Add to the §16.6 whitelist note: "`Hatch` ≤ 1 per section".

---

## MINOR

**14. [§18 Guard pattern, §7] `Guard.Run("SBCDETAIL", () => …)` is written as an existing API; Appendix A §10 lists the `CmdGuard.Safe`/`Guard` signature as not revealed.**
Fix (§18 first bullet): "Every command body goes through the existing guard (`Guard.cs`, perf_0; exact entry point **(assumed — verify in inventory)**, written here as `Guard.Run(name, Action)`)."

**15. [§10 step 3] "converts to mm using the units check numbering already did" — Appendix A says the units check *stops* numbering on m/cm drawings ("NUMBERING STOPPED - WRONG UNITS"); it does not expose a conversion factor. Also `units_m.dxf`/`check_units_m.py` exists, so m-drawings may be handled in a way not described.**
Fix: "Detailer runs only on drawings that passed the numbering units check (mm); G0 fails with the same 'WRONG UNITS' wording otherwise. Whether numbering converts m-drawings (`units_m` case) is **(assumed — verify in inventory)**; if it does, `PolygonExtractor` reuses that factor, never `Database.Insunits` alone." Same marking for "Beam depths come from the CAD BEAM layer (plugin beam model, assumed)" → "from the plugin beam design/schedule size per mark **(assumed)**; a plan line does not carry depth."

**16. [§21 Performance budget vs M1 exit criteria] `SBTDETAIL` one column ≤ 1.0 s (§21) vs "detail < 10 s wall-clock, < 2 s in the engine" (M1).**
Fix (M1 exit): "≤ 1.0 s wall-clock for the one-column case per §21 (engine ≤ 0.2 s), measured as the median of three runs with `SBC_CMDTIME=1`."

**17. [§19.4 step 2] "pick the closed polyline or `SBC_BLK` copy on the COLUMN layer" — when the column comes from a block, the pick returns the INSERT (draw order), not the SBC_BLK copy.**
Fix: "Accept a polyline, an SBC_BLK copy, or an INSERT on a structural layer; an INSERT is resolved through the StructuralBlocks source-handle map (§7) to the member under the pick point; an INSERT with several members under the cursor prompts `Several members in block: [C7/C8]`."

**18. [§21 "SBT twins skip the panel, never prompt, and write result.json, exactly as SBTNUMBER/SBTDESIGN do"] Appendix A only says SBT names are test-build prefixes and that `result.json` exists per case; "skip the panel / never prompt" is not stated.**
Fix: append "**(assumed — verify in inventory: how SBT twins differ from SBC commands)**".

**19. [§16.3] Block names built from user-typed storey/band names (`SBC_DET_COL_C12_GF-3F_SEC`) can contain characters that are illegal in block names (`/ \ : ; ? * | , = < > " \``) or spaces; band changes rename the block and leave the old one in place.**
Fix: "Block names are `SBC_DET_<KIND>_<MARK>_<n>_<VIEW>` with `<n>` a sequence stored in the NOD; storey/band text lives in the `BAND` attribute only. Names are sanitised to `[A-Z0-9_-]`, ≤ 64 chars. Identity for regeneration is the NOD entry (mark, storey set, view), never the block name."

**20. [§16.4] "the position is stored in the block's Xrecord so updates keep manual placement" — the live `BlockReference.Position` is the truth once the user moves it; the stored one goes stale.**
Fix: "On update the existing reference is kept in place (its current `Position`/`Rotation`/`ScaleFactors` are read, not the Xrecord); the Xrecord stores only the grid cell used at first insertion so a re-insert after removal lands in the same cell."

**21. [§9 Persistence] `SBC_DETAIL_STATE` "on each inserted detail block's extension dictionary" — reference or definition is unspecified; a user COPY of the reference clones the extension dictionary, giving two managed references.**
Fix: "Xrecord on the `BlockReference` (not the definition) so WBLOCK/COPYCLIP of one detail carries its state; the NOD entry stores the managed reference's handle; any other reference of the same definition is 'user copy — not managed' (see 5). Payload strings chunked at 255 chars in group codes 300–309; one Xrecord ≤ 8 KB; `XrecordMergeStyle = XrecordMergeStyle.MergeReplace` left default."

**22. [§9, §17 outputs] Sidecar `<dwg>.sbcdetail.json`, `match_report.txt`, `detail_report.txt` are written beside the DWG; office drawings live on shared drives that are often read-only or unsaved (`Drawing1.dwg` has no path).**
Fix: "Sidecar and reports are written to `<results folder>` from `[Detailer]` settings (default beside the DWG); a write failure or an unsaved drawing is a WARNING line, never a failed command."

**23. [§21 Commands `SBCDETAILIMPORT`, §3] Two importers of the same ETABS export (Phase 2.5 import in the plugin, `SBCDETAILIMPORT` in the Detailer) will diverge in headers and units handling.**
Fix: "`SBCDETAILIMPORT` on the `EtabsDesign` path does not parse tables itself; it calls the Phase 2.5 import (`EtabsTables.cs`, assumed) and only maps the result. If Phase 2.5 has not landed when M1 starts, the Detailer's `ExcelTableSource` is written in `Lanes\SbcEtabs\` so it becomes the Phase 2.5 reader, not a second one."

**24. [§12 L1/L3, §10] Kind mismatch is treated as MATCH FAILED: the plugin calls aspect ratio ≥ 3.95 a wall (SW), ETABS/SbcDesign may model the same 300×1200 member as a column (frame), or a CAD column as a pier.**
Fix (§12 table, new row before L3): "L2b Kind check — CAD kind (C/SW/LW) vs record kind (Column/Pier) differ with a unique geometry hit → `DATA CONFLICT (kind)` with both kinds shown, never `MATCH FAILED`; user resolves by renumbering or by the ETABS model."

**25. [§10 PolygonExtractor] Real office outlines include polylines closed by coincident endpoints with `Closed = false`, duplicate/zero-length vertices, heavy `Polyline2d`, self-touching L/T/C outlines drawn as two overlapping rectangles, and circular columns as `Circle`; `IsCircle` on a `Circle` entity is not confirmed by Appendix A (walls/columns are "closed polylines").**
Fix (§10 step 3): "Accept `Polyline`, `Polyline2d`, and `Circle` **(Circle support assumed — verify in inventory)**; treat first==last vertex within snap tolerance as closed; drop vertices closer than tolerance; reject self-intersecting polygons with `Invalid CAD geometry: self-intersecting`; union two overlapping rectangles of the same mark into one polygon (L/T/C) and report 'composed from n outlines'. Unit tests for each case from M0 (D11)."

---

## Items checked and found consistent (no finding)
- Primitive whitelist in §16.6 matches App. D §4 (no Table/MLeader/Field/dynamic-block authoring/ribbon/PlotEngine/Overrule/COM/P-Invoke); `Leader`+`MText`, lines+text schedule.
- Xrecord/NOD + extension dictionary present on both hosts (App. D §3); XData rejected for the 16 KB limit; sizing of the match table (~1k records × ~0.5 KB) is fine.
- Geometry source reuse: `Model.Load` snapshot, `Numbering.MembersOf`, `StructuralBlocks` map, `Analysis.Supports` two-polyline rule are all marked assumed or point to new APIs in §7; no second model-space scan is specified.
- Lane base `beta_1142`, `SBT` naming, `result.json`/`perf.log`/`[SBC-TIME]` conventions, +10 % gate, median of three, zero unhandled exceptions all agree with Appendix A (perf_0, MASTER_PLAN §10).
- Model-space insertion instead of layouts is the right call for V1 given App. D §3 (layouts/viewports "verify" on both clones).
