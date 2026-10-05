# ARCHITECT REVIEW — SBC_DETAILER_SYSTEM_PLAN_V1.md

Reviewer role: architect. Inputs: the plan, Appendix A, PLAN_ARCHITECTURE.md, OWNER_DECISIONS.md, DECISIONS_TAKEN_BY_CLAUDE.md. No edits made to the plan.

Summary: 3 BLOCKER, 12 MAJOR, 10 MINOR. The architecture is sound and the D13 two-source design is applied consistently in §9/§11/§13/§14/§15/§22 except for one schema-id slip. The blockers are (1) an undefined member-state vocabulary that chips, result.json, Xrecords and gates all need, (2) dependency rules that the plan's own adapters violate and that project references cannot enforce in a single project, and (3) an M1 estimate that contradicts itself (weeks 2–6 vs 12 days).

---

## BLOCKER

1. **BLOCKER — §13 / §14 / §17 / §18 / §19.5 / §21 — Member state vocabulary is undefined; Finding.Status cannot express what the sections use.**
   Problem: `Status { Ok, Warning, Incomplete, DataConflict, MatchFailed, Failed }` is the only status enum. Gates emit "Pass / Warn / Fail" (no `Pass` in the enum). §14.1 step 7 and §14.2 use member states `READY` and `REVIEW`; Q-A1/Q-B2 use `REVIEW`; §19.5 chips are `NOT RUN / MATCHED / MATCH BY GEOMETRY / MATCH FAILED / DATA CONFLICT / INCOMPLETE / DONE / DONE · WARN / APPROVED` (no `READY`, `REVIEW`, `MATCH PARTIAL`, `O/S`); §12 produces `MATCH PARTIAL`; `result.json detail: {ok, warn, incomplete, conflict, failed, ...}` conflates a G5 rule `Fail` (→ `Status.Failed`) with a Guard crash `FAILED`. A developer cannot write the chip, the Xrecord `status` field or `result.json` counts for M1 without inventing this.
   Fix (insert at end of §13, before "Versioning"):
   ```
   Member state (one enum, used identically by the panel chip, the Members grid, the block STATUS attribute, the SBC_DETAIL_STATE Xrecord and result.json):
   public enum MemberState { NotRun, Matched, MatchedByGeometry, MatchPartial, MatchFailed, DataConflict, Incomplete, Review, Ready, Done, DoneWithWarnings, Approved }
   Chip words: NOT RUN, MATCHED, MATCH-BY-GEOMETRY, MATCH PARTIAL, MATCH FAILED, DATA CONFLICT, INCOMPLETE, REVIEW, READY, DONE, DONE · WARN, APPROVED.
   Mapping from gate outcome to Finding.Status and MemberState:
   | Gate | Pass | Warn | Fail |
   | G0/G1 | – | Warning | Incomplete (run blocked) |
   | G2 | Matched → Ready | MatchedByGeometry/MatchPartial (Warning) → Review | MatchFailed |
   | G3 | – | Warning | DataConflict |
   | G4 | – | Warning | Failed → Review ("O/S — redesign" / "Check mode — confirm") |
   | G5 | – | Warning | Failed → Review (rule fail, nothing drawn) |
   | G6 | – | Warning | Incomplete |
   | G7 | – | Warning | Failed → Review (only when configured to Fail) |
   | G8 | – | – | Failed → Review (block skipped) |
   Rename Status.Ok→Pass is NOT done; `Ok` == gate Pass. result.json detail counts: {ok, warn, incomplete, conflict, matchFailed, review, blocks, perf} — "failed" is reserved for the Guard crash path and is always 0 in a passing case.
   ```
   Also replace in §19.5 the chip list with the one above and add `MATCH PARTIAL`, `REVIEW`, `READY`.

2. **BLOCKER — §8 / §9 dependency rules 2–3 / §11.3 / §21 — The rules are contradicted by the plan's own adapters and are not enforceable by project references.**
   Problem: Rule 2 says `Import` references `Sbc.Codes` and `Contracts` only. But `SbcDesignSource` (in `Import`) adapts plugin `ColumnDesign` / wall-design output types and `EtabsDesignSource` calls `Lanes\SbcEtabs\EtabsTables.cs` / `LabelMap.cs` — all plugin types, some of which may transitively reference CAD types. `Persistence` must use `Xrecord` / `DBDictionary` (CAD types) yet rule 3 names only `Render` and `CadRead`, and §8 says CadRead is "the only namespace besides Render allowed to see CAD types". Rule text "enforced by project references" is empty while everything except `Sbc.Codes` lives in the single `SbcStructural` project that already references the host DLLs; only the ReflectHarness scan would enforce it. `Detailer.Tests` "no CAD" will load `SbcStructural.dll`, whose manifest references `ZwSoft.*`.
   Fix: replace §8 first paragraph and rules 2–3 with:
   ```
   New code is split into THREE assemblies: (a) `Sbc.Codes` (netstandard2.0); (b) `SbcStructural.Detailer.Core` (net48 class library, references Sbc.Codes + one JSON package only) holding Contracts, Import (file readers + mappers + IDesignSource), Matching, Engine, Validation; (c) the plugin project, holding `Detailer.CadRead`, `Detailer.Render`, `Detailer.Persistence`, `Detailer.Ui`, `Detailer.Commands` and `Detailer.Adapters`. `Detailer.Adapters` is the ONLY place that touches plugin types: `SbcDesignSourceAdapter` (plugin ColumnDesign / wall design → DesignSet), `EtabsTablesAdapter` (Phase 2.5 EtabsTables/LabelMap → ITableSource / LabelMap records), `NumberingAdapter` (MembersOf → CadMemberGeometry input). Core never sees a plugin or host type because the compiler cannot let it. The ReflectHarness scan remains as a backstop for the plugin-side namespaces.
   Rule 2: `Core` references `Sbc.Codes` and the JSON package only (compiler-enforced).
   Rule 3: `Render`, `CadRead`, `Persistence` use CAD types through `CadAliases` only, limited to the App. D §4 primitive whitelist plus `Xrecord`, `DBDictionary`, `ResultBuffer`.
   ```
   Add `Detailer.Core.dll` to the ConfuserEx/loader list in §21 (the pipeline already changes for `Sbc.Codes.dll`, so "pipeline unchanged" is no longer a reason to keep one project). Update STATUS TABLE "NEEDS TO BE CREATED" with `SbcStructural.Detailer.Core` and `Detailer.Adapters`.

3. **BLOCKER — Milestones table M1 / §0 / §21 perf budget — M1 duration and acceptance numbers contradict each other.**
   Problem: M1 scope is written as "Week 2 … Week 3 … Week 4 … Week 5 … Week 6 buffer" = five weeks = 25 working days, but the Days column says 12 and §0 says "M1 one column 12 days"; 5+12+12+10+10 = 49 only with the 12. With 25 the total is 62. Separately, M1 exit criterion "detail < 10 s wall-clock, < 2 s in the engine" conflicts with §21 "`SBTDETAIL` one column ≤ 1.0 s wall".
   Fix: in the M1 row replace "Week 2 … Week 6 buffer / sign-off" with "Days 1–3 import + match … Days 4–6 arrangement engine … Days 7–9 renderer + SBCDETAIL … Days 10–11 both hosts and hardening … Day 12 buffer / sign-off" (or change Days to 25 and the totals in §0 and the Milestones footer to "≈ 62 working days"). Replace the exit criterion with "one column ≤ 1.0 s wall-clock on both hosts, engine ≤ 0.3 s, per §21 budget".

---

## MAJOR

4. **MAJOR — §21 commands table vs §16.7 / §17 G8 / §18 / M2 — Commands referenced elsewhere are missing from the table.**
   Problem: `SBCDETAILFORCE` (used in §16.7 and G8 override) is not in §21; the "Remove inserted details for n members?" modal (§18) and M2 "re-detail/remove" have no command; §21 does not say which commands exist in M1.
   Fix: add rows `| SBCDETAILFORCE [mark … | ALL] | Re-detail even when the block was hand-edited or STATUS is APPROVED; asks the destructive confirmation; engineer role. (M2) |` and `| SBCDETAILREMOVE [mark … | ALL] | Deletes inserted detail blocks and their SBC_DETAIL_STATE Xrecords; match table untouched; asks the destructive confirmation. (M2) |`. Add a column "Milestone" to the table: IMPORT, MATCH, DETAIL = M1; UPDATE, ACCEPT, REPORT, FORCE, REMOVE, BATCH = M2 (see finding 5 for BATCH).

5. **MAJOR — §21 regression / Milestones M1–M2 — M1 regression cases need `SBTDETAILBATCH`, which is scheduled in M2.**
   Problem: §21 dual-host matrix says "runs each `det_*` case via `/b run.scr` (NETLOAD, open fixture, `SBTDETAILBATCH`, SAVEAS DXF, QUIT)", and M1 lists cases `det_col1`, `det_col_fail`, `det_col_conflict`, `det_col_sbcdesign`, but "batch driver" and `SBCDETAILBATCH` are in M2 scope.
   Fix: in M1 scope add "`SBTDETAILBATCH job.json` minimal driver (import + match + detail for listed marks, writes result.json; no progress UI)"; in M2 change "batch driver" to "batch driver completed (Detail all, Stop-after-current, attention list)". Add to §21: "`job.json` schema: `{ schemaVersion, designSource, designFile, settingsIni, marks: [ ] | "ALL", outputs: { resultJson, dxf } }`".

6. **MAJOR — §9 / §16.3 / §16.7 / §21 — DesignHash / GeometryHash and JSON canonicalisation are undefined, so regeneration is not deterministic.**
   Problem: §16.7 says `DesignHash` = "design record envelope + section + rule set + office settings version + source"; §11.3 says `Provenance` carries "hash of the design run"; `Provenance.ExportDate` (non-nullable) and `GEN_DATE` are timestamps. Without a canonical serialisation, the same column re-imported on the other host, or by Newtonsoft vs System.Text.Json, yields a different hash and every `SBCDETAILUPDATE` redefines every block. The §21 DXF normaliser strips timestamps from the DXF but not from the hash inputs.
   Fix: add to §13 after "Versioning":
   ```
   Hashing. All hashes are SHA-256 over canonical JSON: properties sorted ordinally, camelCase, InvariantCulture, doubles rounded to 0.01 (mm, mm², kN, MPa) and 0.001 (ratios, %), no whitespace, UTF-8. DesignHash = hash(ColumnDesignRecord with Prov replaced by {Source, FileSha256 ?? runHash}) + RuleSetId + OfficeSettingsVersion. GeometryHash = hash(CadMemberGeometry minus SourceHandles, SourceBlockHandle, NumberingTextHandle). runHash (SbcDesign) = hash of the DesignSet JSON with Prov.ExportDate removed. ExportDate and GEN_DATE never enter a hash. Golden `DetailModel` JSON files are written with the same canonical writer so unit-test diffs are byte-stable.
   ```

7. **MAJOR — §16.3 / §16.7 / §14.2 — Block naming by storey band breaks in-place regeneration and typical-section grouping.**
   Problem: block name `SBC_DET_COL_C12_GF-3F_SEC` embeds the band. When a stack's band changes (GF–3F becomes GF–2F after a redesign) the "redefine the definition in place, keep the reference" policy cannot find the block and leaves an orphan. §14.2 groups identical columns into "one schedule row and one typical section" but blocks are per mark — which mark owns the typical section is undefined. Storey names such as "STOREY 3" contain characters illegal in block names.
   Fix: replace §16.3 naming with: "Block name `SBC_DET_<KIND>_<MARK>_<VIEW>_<NNN>` where NNN is a per-mark sequence; the band, storey ids and member list are attributes (`BAND`, `STOREYS`, `MEMBERS`), not part of the name. Regeneration locates blocks by the `SBC_DETAIL_STATE` Xrecord key (Mark, StackId, View), never by name. Typical sections: the block belongs to the lowest mark in natural order (C2 < C10); `MEMBERS` lists all grouped marks; the other marks' schedule rows reference it ("as C2"). Names are sanitised to `[A-Z0-9_-]` before use."

8. **MAJOR — §3 / §7 / §8 / §11.2 / STATUS TABLE — The ETABS table reader is both "not rebuilt" and "created".**
   Problem: §3 says "the Detailer does not write its own ETABS reader if Phase 2.5 already has one"; §7 modifies `EtabsTables.cs` with "header normaliser, units-row parser, A1 title read"; §8 and STATUS TABLE "NEEDS TO BE CREATED" list `ITableSource`, `ExcelTableSource`, `CsvTableSource`, `TableHeaderNormaliser`, `UnitsRowParser` as new Detailer.Import classes. Appendix A §3/§10 says the contents of `EtabsTables.cs` are unknown. The developer has no rule for which to do.
   Fix: add to §11.2 before "Pipeline": "Decision rule (resolved in V1.1 from the inventory): if `EtabsTables.cs` already opens .xlsx/.csv and returns rows, `EtabsTablesAdapter` wraps it as `ITableSource` and `ExcelTableSource`/`CsvTableSource` are NOT written; `TableHeaderNormaliser` and `UnitsRowParser` are written in Core either way because they are pure functions over strings and the Phase 2.5 lane must not be edited from the Detailer lane. Until the inventory arrives, M0 uses `ExcelTableSource` (OpenXML) behind `ITableSource` so M1 is not blocked; it is deleted in V1.1 if redundant." Remove the "header normaliser, units-row parser" item from the `EtabsTables.cs` row in §7 and from STATUS TABLE "NEEDS MODIFICATION".

9. **MAJOR — §11.3 vs §13 vs §22 (D13 consistency) — Schema id for the SbcDesign JSON differs; Schema vs SchemaVersion conflated.**
   Problem: §11.3 says the Calculator writes "`sbc-detailer/etabs-import/v1` schema, source `SbcDesign`" (left over from PLAN_ARCHITECTURE); §13 `ContractVersion.Design = "sbc-detailer/design/v1"` and §22 say `sbc-detailer/design/v1`. Also `ContractVersion` strings end in `/v1` while "schemaVersion is semver" and `DesignSet(Schema, SchemaVersion)` has both fields — two versions of the same number.
   Fix: in §11.3 replace `sbc-detailer/etabs-import/v1` with `sbc-detailer/design/v1`. In §13 change `ContractVersion` to `Design = "sbc-detailer/design"`, `Match = "sbc-detailer/match"`, `Detail = "sbc-detailer/detail"`, `CadGeometry = "sbc-detailer/cad-geometry"` and add `public const string Version = "1.0.0";` with the rule "`$schema` = Schema + "/v" + major; `schemaVersion` = full semver".

10. **MAJOR — §13 `DesignSet.Stories` — reuses the CAD-side `StoreyBand` record whose mandatory fields the design source cannot supply.**
    Problem: `StoreyBand(StoreyId, StoreyName, BottomLevel_mm, TopLevel_mm, …)` has non-nullable `StoreyId` and both levels. The ETABS `Story Definitions` table yields name, elevation and height only; `StoreyId` is a ProjectPanel concept. The import would have to fabricate ids, and `StoreyMapper` (L0) then compares a fabricated id with the real one. Under the §13 nullability rule the constructor would throw.
    Fix: add `public sealed record DesignStory(string Name, double Elevation_mm, double? Height_mm, string? Tower);` and change `DesignSet.Stories` to `IReadOnlyList<DesignStory>`. In §12 L0 replace "CAD `StoreyBand` ↔ ETABS story" with "CAD `StoreyBand` ↔ `DesignStory`" and state that `StoreyMapper` writes the resolved `EtabsStoryName` back into the match record, never into the design set.

11. **MAJOR — §7 Guard / §18 end states — Typed Guard outcome and the end-state strings do not map; Guard API is assumed without being marked.**
    Problem: §7 gives Guard the outcomes `Completed / CompletedWithWarnings / Blocked / Failed`; §18 gives end-state strings `COMPLETED ✓`, `COMPLETED WITH WARNINGS — n MEMBERS REQUIRE ATTENTION`, `FAILED — <phase> — <reason>` plus a separate `SBCDETAIL DONE: …` line. `Blocked` (G0/G1 fail, nothing done) has no string. §18 uses `Guard.Run("SBCDETAIL", …)` although Appendix A §10 lists the guard signature as unknown (`CmdGuard.Safe` was the name used in the request).
    Fix: add to §18 a mapping table: `Completed → "COMPLETED ✓"`, `CompletedWithWarnings → "COMPLETED WITH WARNINGS — n MEMBERS REQUIRE ATTENTION"`, `Blocked → "STATUS: INCOMPLETE — <gate> — <reason>" (nothing inserted, exit code 2 in result.json)`, `Failed → "<CMD> FAILED - unexpected error … results are NOT complete"` (existing Guard wording). State that `SBCDETAIL DONE: …` is the counts line printed before the end state, never instead of it. Mark `Guard.Run(...)` as "(assumed signature — verify in inventory; the actual entry point is whatever `Guard.cs` exposes today)".

12. **MAJOR — §19.7 / §21 settings / M1 fixtures — `[Detailer]` INI key names, `ProjectContext`, `RunResult.Stats` are not defined, so `settings_det.ini` and the M1 commands cannot be written without invention.**
    Problem: §19.7 lists settings in prose; §21 says regression cases pin them in `settings_det.ini`; `IDesignSource.Load(ProjectContext ctx)` uses a type that appears nowhere; `RunResult(Status Overall, IReadOnlyList<Finding> Findings, Stats)` leaves `Stats` undefined.
    Fix: add to §19.7 the key list: `[Detailer] DesignSource=SbcDesign|EtabsDesign; DesignFile=; Ductile=1; RuleSet=IS456_2000_IS13920_2016A1; MatchCentroidMm=100; MatchSectionPct=10; ConflictPct=5; StoreyTolMm=50; PreferredDias=12,16,20,25,32; MaxDias=2; MinTieDia=8; HookDeg=135; SpacingModuleMm=25; ConfiningFloorMm=75; CoverColumnMm=40; CoverWallIntMm=25; CoverWallExtMm=30; LapTable=office; GravityLapLocation=CentralHalf; CrankMaxOffsetMm=75; CurtainsMinTwMm=200; OpeningThresholdMm=300; Placement=Default|Ask; AreaOriginX=; AreaOriginY=; Scale=1; TextStyle=; DimStyle=; ResultsFolder=; Role=Draughtsman|Engineer; AllowUnlockedMarks=0 (test builds only)`. Add to §13: `public sealed record ProjectContext(string DwgPath, string? DesignFile, DesignSource Source, bool Ductile, string RuleSetId, string OfficeSettingsVersion, IReadOnlyList<StoreyBand> Storeys);` and `public sealed record RunStats(int Members, int Rendered, int Blocked, double Seconds, long PrivateBytes, int ModelLoadScans);`.

13. **MAJOR — §19.1 / §23 dep 1 / M1 — The Detail step is hard-locked until the numbering lock, but M1 exit requires owner sign-off on both hosts while the lock may not exist.**
    Problem: §19.1 "The Detail step is locked (grey) until the 1.14.2 numbering lock is set"; §17 G0 blocks the whole run; M1's fallback says "live persistence stubbed and M1 ends engine-complete, persistence pending", but the exit criteria still require "Pick → match → Detail → zoom works on both hosts" and "owner signs the sheet".
    Fix: add to §23 dep 1: "Until the lock lands, `[Detailer] AllowUnlockedMarks=1` (honoured by SBT builds and by SBC builds only when the DWG is under `Build\regression\inputs\` or the owner enables it per session) lets G0 pass with a permanent amber strip "marks not locked — detail is NOT FOR GFC"; nothing is written to the NOD, only the sidecar JSON. M1 is signed off in this mode if necessary; the lock is then a V1.1 gate before `det_0` merges into `beta_1142`."

14. **MAJOR — §13 mandatory-field paragraph — `avsMajor`/`avsMinor` are both mandatory and optional.**
    Problem: "Mandatory per column record: … stations ≥ 1 with (location, asRequired or pmmRatio per mode, avsMajor, avsMinor)" then two sentences later "`avs*` missing → Detailer computes minimum ties per IS 456 26.5.3.2 + IS 13920 and flags 'shear from code minimum'".
    Fix: replace with "Mandatory per column record: key, designSection, mode, stations ≥ 1 each with location and (asRequired when Mode = Design | pmmRatio when Mode = Check). Optional with a defined fallback: avsMajor/avsMinor (null → code-minimum ties, Warning 'shear from code minimum', G6 Warn), Pu/Mu (null → lap tension check skipped, Warning), geometry hint (null → L3 unavailable, 'unverified geometry'), fck/fy (null → project defaults, Warning)."

15. **MAJOR — §9 rule 1 / §8 / §13 — `Sbc.Codes` "references nothing but the BCL" conflicts with `OfficeSettings (JSON, versioned)` and with the undecided serializer.**
    Problem: netstandard2.0 has no JSON serializer in the BCL; `OfficeSettings` is a JSON document that `Sbc.Codes` must load; §13 defers the serializer choice to the inventory; §23 dep 10 lists "one JSON serializer for the plugin". If `Sbc.Codes` takes a JSON package, SbcCalc inherits that dependency at adoption time.
    Fix: change rule 1 to "`Sbc.Codes` references the BCL only. `OfficeSettings` is a plain immutable record with a static `Default`; parsing JSON into it is done by `Detailer.Core` (and by SbcCalc with its own serializer). `Sbc.Codes` exposes `OfficeSettings.Version` and `OfficeSettings.Validate()` only." Decide the serializer now rather than at inventory: "Newtonsoft.Json 13.x is used plugin-wide (net48, already common in CAD plugins; System.Text.Json on net48 pulls six support packages that ConfuserEx must exclude)". Add `HoopHook` and `CodeValueCatalogue` to the `Sbc.Codes` key-class list in §8 (both are referenced in §16.5 / §20 but absent there).

---

## MINOR

16. **MINOR — §8 vs STATUS TABLE — `IDesignSource` is placed in `Detailer.Import` (§8) and in `Detailer.Contracts` (§13 code block, STATUS TABLE "NEEDS TO BE CREATED").**
    Fix: keep it in `Contracts` (it is a contract); delete `IDesignSource` from the `Detailer.Import` row in §8.

17. **MINOR — §7 regression row vs §21 / STATUS TABLE — Case family named `detail_*` in §7, `det_*` everywhere else.**
    Fix: in §7 `run_regression.ps1` row replace "`detail_*` case family" with "`det_*` case family".

18. **MINOR — §12 / §19.5 / §16.4 / §17 G8 — Spelling of status words and the details area varies.**
    Problem: `MATCH-BY-GEOMETRY` (§12, §18) vs chip `MATCH BY GEOMETRY` (§19.5); model-space area `"SBC-DETAILS"` (§14.1, §16.4, Q-A6) vs `DETAILS area` (§17 G8).
    Fix: use `MATCH-BY-GEOMETRY` in §19.5 and `SBC-DETAILS area` in G8.

19. **MINOR — §7 Workflow tab / §19.1 / §21 — Position of the Detail step is stated three ways.**
    Problem: §7 "after Design"; §19.1 "Number → Design → QA → Detail → Sheets → Issue GFC" (after QA); §21 "between Design and Sheets/Issue GFC".
    Fix: everywhere: "step 4 'Detail', after QA and before Sheets (Number → Design → QA → Detail → Sheets → Issue GFC)".

20. **MINOR — §14.1 step 8 vs §9 persistence / rule 5 — "Every entity carries an Xrecord" contradicts the one-Xrecord-per-block design.**
    Fix: replace in §14.1 step 8 "Every entity carries an Xrecord with …" with "The detail block carries one `SBC_DETAIL_STATE` Xrecord with …; individual entities carry nothing" (keeps rule 5 and the 16 KB argument in §9 true).

21. **MINOR — STATUS TABLE vs §7 / §22 — Three wording slips against the sources.**
    Problem: (a) "calculator's confinement spacing and Ash functions (moved to `Is13920.cs`)" — "moved" breaks the port-not-edit rule (§22); (b) `Build\SbcStructural.crproj` appears under NEEDS MODIFICATION but not in §7; (c) §9 diagram says "ZWCAD 2024–26" while §21 installer/matrix cover only ZWCAD 2025/2026.
    Fix: (a) "ported into `Is13920.cs`"; (b) add `Build\SbcStructural.crproj` (+ new `Sbc.Codes`/`Detailer.Core` exclusions) to the `build_release.ps1` row in §7; (c) diagram header "ZWCAD 2025–26".

22. **MINOR — §14.2 / §16.7 — Processing order and hand-edit detection need two definitions for determinism.**
    Problem: "in mark order" is ambiguous (C10 before C2 in ordinal sort); "hand-edited blocks (entity count/hash of the definition differs)" needs a stored definition hash that the `SBC_DETAIL_STATE` field list in §9 does not contain.
    Fix: §14.2 "in natural mark order (C2 < C10), storeys bottom-up"; §9 state record add `DefinitionHash` (hash of entity types, layers, rounded coordinates and strings of the block definition at generation time).

23. **MINOR — §13 — Discriminators typed as `string` with comment-enums.**
    Problem: `Mode /*Design|Check*/`, `Status /*OK|Overstressed|NotDesigned*/`, `FrameType`, `PierType`, `WallType`, `Kind /*Column|Pier*/`, `Shape`, `TieZone.Name`, `LapSpec.Group`, `PierBoundary.Edge` are all strings; a typo in a mapper is not caught, and gate G4 compares strings.
    Fix: declare `enum DesignMode { Design, Check }`, `enum DesignStatus { Ok, Overstressed, NotDesigned }`, `enum FrameType { Ductile, Ordinary, NonSway }`, `enum PierType { UniformReinforcing, SimplifiedCT, GeneralSD, SbcWall }`, `enum WallType { Special, Ordinary }`, `enum KeyKind { Column, Pier }`, `enum SectionShape { Rectangular, Circular, SD }`, `enum ZoneName { Confining, Mid, Lap, General, Joint }`, `enum LapGroup { A, B }`, `enum Edge { Left, Right }` and serialise them as strings (`JsonStringEnumConverter`).

24. **MINOR — §13 nullability rule vs §18 "returned, not thrown".**
    Problem: "non-nullable means mandatory at construction (constructor throws → STATUS: INCOMPLETE with the field name)" while §18 says expected outcomes are returned, not thrown, and C# records do not throw on a null reference argument unless validation code is written.
    Fix: "Mappers validate before construction and emit a `Finding(Incomplete, "G1", member, "missing <field> (<table/row>)")`; a record is constructed only when every non-nullable argument is present. Record constructors contain `ArgumentNullException` guards as a last line of defence; reaching one is a bug, handled by Guard."

25. **MINOR — §8 Render / §9 / §16.5 — `SectionArrangement` and `BoundaryElementDetail` are used in `ColumnDetail`/`WallDetail` but defined only by reference to "App. C §C1".**
    Fix: add a one-line pointer under the §13 code block: "`SectionArrangement`, `BarPlacement`, `HoopShape`, `CrossTie`, `BoundaryElementDetail` are the App. C §C1 records, copied verbatim into `Detailer.Contracts` in M0 (they are part of the `sbc-detailer/detail` schema and versioned with it)."
