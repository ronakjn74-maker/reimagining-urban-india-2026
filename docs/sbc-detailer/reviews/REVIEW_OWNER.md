# REVIEW — OWNER'S ADVOCATE — SBC_DETAILER_SYSTEM_PLAN_V1.md (+ DECISIONS_TAKEN_BY_CLAUDE.md, OWNER_DECISIONS.md)

Reviewed: `/home/user/reimagining-urban-india-2026/docs/sbc-detailer/SBC_DETAILER_SYSTEM_PLAN_V1.md`, `DECISIONS_TAKEN_BY_CLAUDE.md`, `OWNER_DECISIONS.md` (appendices A, C, D consulted for cross-checks only).

What passes (no finding): all 25 required sections plus §0 are present and each answers its heading rather than filling space (§3 and §5 honestly say "contents not seen" and draw the right conclusion). Every D1–D14 row is reflected in the plan. BBS is untouched everywhere (D12, §7, §21 perf budget, DoD item 9). The WHAT/WHERE/combine principle is applied consistently in §10, §11, §12 and the source-of-truth table. The five-way STATUS TABLE is complete and matches §6/§7/§8 except for the small items in #21.

Totals: 2 BLOCKER, 12 MAJOR, 11 MINOR.

---

1. **BLOCKER — §0 "Schedule" and "Milestones M0–M4" table — M1 duration is internally contradictory.** The M1 scope cell describes work in "Week 2 … Week 3 … Week 4 … Week 5 … Week 6 buffer / sign-off" (five weeks ≈ 25 working days) but the Days column says 12, and §0 repeats "M1 one column 12 days … about 49 working days". The honest total is ≈ 62 days. The owner will approve a budget that is 25 % short.
   Fix: change the M1 Days cell to `25` and §0 to: "**Schedule.** M0 spike 5 days → M1 one column 25 days (weeks 2–6, including one buffer week) → M2 all columns + L/T/C 12 days → M3 shear walls 10 days → M4 complete system 10 days. About 62 working days of one developer lane." Update the "Total ≈ 49" line under the table to "≈ 62".

2. **BLOCKER — §13 (mandatory-fields paragraph after the code block) contradicts §17 G6 and the owner's "never silently use wrong design data" rule.** §13 says "`avs*` missing → Detailer computes minimum ties per IS 456 26.5.3.2 + IS 13920 and flags" and "fck/fy missing → project defaults with a warning". Both are design inputs (shear demand, concrete grade governs lap length and Ash) and both would be drawn with only a warning. §17 G6 says the same cases are `STATUS: INCOMPLETE` "when a drawn dimension depends on it" — which is always the case for fck (lap length) and Av/s (tie spacing).
   Fix: replace the two sentences in §13 with: "`avsMajor`/`avsMinor` missing → `STATUS: INCOMPLETE "shear demand missing — supply Av/s or tie spacing from the design"`; the Detailer never substitutes a code minimum for a missing design value. fck/fy missing → `STATUS: INCOMPLETE "concrete/steel grade missing (lap length and Ash depend on it)"`; project defaults may be *offered* in the card but must be accepted explicitly (recorded in the Xrecord like SBCDETAILACCEPT)." Add the same wording to the source-of-truth table row "Required reinforcement".

3. **MAJOR — §0 Executive summary — it describes the plan but never says what the owner is approving.** The "asks" are things to send, not decisions to sign off. An owner with five minutes cannot tell which sentences commit money or architecture.
   Fix: add after "What is new" a block: "**What you are approving by saying 'go'.** (1) Detailer is a module inside the existing plugin, not a separate app (D2). (2) Code rules move into one shared library used by plugin and Calculator (D4). (3) Drawings use only basic CAD entities so ZWCAD and GstarCAD output is identical (D5); no Table/MLeader. (4) GstarCAD 2024/2025 only in V1; 2026+ is a later build (D6). (5) ETABS via exported tables, never the live API (D3). (6) The M1 scope, the ≈ 62-day budget and the owner-time budget below. (7) The office defaults in D9, which stay 'NOT FOR GFC' until you confirm them. Anything else in this document is implementation detail you may skip."

4. **MAJOR — §25(a) Q-A3, Q-A4, Q-A5 re-ask what D9 already decided.** D9 already fixes bar list, two-dia limit, tie min 8 mm, 135° hooks, 25 mm module, cover 40 default by exposure. §25 lists them again as three separate "blocking" questions, inflating the owner's question count from 4 to 7, and §0 ask (c) asks the same thing a fourth time.
   Fix: delete Q-A3, Q-A4, Q-A5 from §25(a) and replace with one row: "Q-A3 Confirm or amend the office defaults in D9 (bar list and pairings, cover set incl. walls 25/30 and cover-to-tie, hooks/tie dia/module/75 mm floor). Default if silent: D9 as written, drawings stay NOT FOR GFC." Update the NEEDS MY DECISION list and §0 ask (c) to point to this single row.

5. **MAJOR — §25(b) Q-B4 and §25(c) Q-C4 are answerable by inspecting existing files, which the owner forbade.** Q-B4 (text height, dimension style, which LAYERS.dwg layers) is answered by opening `LAYERS.dwg` and drawings 1071/1153/1162 — the plan itself names them as the answer key. Q-C4 (steel grade note, bar-mark prefix) is visible in the same drawings ("T8@100" callouts are quoted in §14.3) and in `Detailing\Laps.cs` (Fe500).
   Fix: delete Q-B4 and Q-C4. In §23 dependency 6 add: "Text height, dim style, layer names, grade note and bar prefix are read from LAYERS.dwg and drawings 1071/1153/1162 during M0 and recorded as a D-row; they are not asked." Add the resulting values as D-row(s) when read.

6. **MAJOR — §0 "Schedule" understates owner time.** §0 says "about one owner evening per milestone", but the Definition of done requires "owner test sheet executed and signed on at least ZWCAD 2026 and GstarCAD 2025" for every milestone (two hosts × five milestones), §0 ask (d) already says two evenings for M1, M0 asks for an evening to send files, and M4 needs "two owner projects detailed".
   Fix: replace with: "**Your time.** About 8–10 evenings in total: M0 one (send export, confirm version), M1 two (one per host), M2 one, M3 two (one per host), M4 two to three (two live projects). Each test sheet is ≤ 20 minutes per host."

7. **MAJOR — M0 "Spike" (5 days) is overloaded and is no longer a spike.** Besides the GstarCAD compile/NETLOAD/PaletteSet go-no-go, M0 also creates `Sbc.Codes`, ports `Is456.cs`, seeds `Is13920.cs`, defines every §13 record, and builds `ITableSource` with an Excel reader. That is M1 week-2 work; if the spike fails the go/no-go, this code is wasted, and 5 days is not enough for both.
   Fix: in the M0 Scope cell delete the last sentence ("`Sbc.Codes` project created … `ITableSource` with Excel source.") and move it verbatim to the start of M1 "Week 2". M0 stays: compile, NETLOAD on both hosts, stub polygon read + block + dimension, PaletteSet, Table Plugin check (see #11), alias delta list, go/no-go.

8. **MAJOR — §21 "Dual-host matrix" and DoD item (3): four host cells (zw2026, zw2025, gs2024, gs2025) for every milestone.** The owner's requirement is "GstarCAD and ZWCAD", not four versions. For a single developer lane this doubles regression time and licence cost (R7 admits it) with no owner benefit.
   Fix: change DoD (3) to "the milestone's `det_*` cases pass on ZWCAD 2026 and GstarCAD 2025 with approved baselines; zw2025 and gs2024 run once at the M4 merge only." In §21 matrix: "`-Host zw2026|gs2025` per milestone; `zw2025|gs2024` at M4 merge." Keep the GstarCAD 2026+ empty column.

9. **MAJOR — Scope creep: §7, §22 and §23 item 4 replace `BeamDesign.cs` τc / kLim / xulim with calls into `Sbc.Codes` (XC-7).** Beam design is working, regression-covered code outside columns+walls detailing. Editing it in the Detailer lane risks the beam baselines and is exactly "rebuilding existing functionality". The Detailer does not need BeamDesign to change.
   Fix: in §7 change the `BeamDesign.cs` row to "**Not modified in V1.** XC-7 (duplicate τc) is removed by the design lane after `Sbc.Codes` ships; the Detailer only adds the library." Delete "the plugin's `BeamDesign` duplicates (XC-7) are removed in the same step" from §22 and "removes XC-7" from §23 item 4. Remove `BeamDesign.cs` from NEEDS MODIFICATION.

10. **MAJOR — Scope creep: M4 "sheets integration (details placed on the layout the Sheets step owns)" contradicts §16.4 ("model space, not a layout, for V1") and depends on an unfinished ui_a Phase B/C API.** It adds a dependency on another lane in the last milestone and re-opens the `Sheets.Run` O(n²) issue the plan chose to avoid.
   Fix: delete "sheets integration (details placed on the layout the Sheets step owns)" and "Sheets step API from ui_a Phase B/C" from M4. Add to §16.4 last sentence: "Placing detail blocks on layouts is V1.5, after the Sheets step exposes its API." Remove `Sheets.Run` mention from M4 exit criteria.

11. **MAJOR — Rebuilding existing functionality: §6 ("Not reused in V1 … Table Plugin for Detailer schedules (lines + text block instead)") and §16.5 "Mini schedule block (lines + text, no Table entity)".** The office already produces every schedule through Table Plugin 3.3 (`TPIMPORT`). Drawing a second, hand-made schedule in lines and text duplicates an existing tool and gives the owner two schedule styles. The only stated reason (Table entity not on the whitelist) does not apply — Table Plugin is an external tool, not the managed `Table` entity. Whether Table Plugin runs on GstarCAD is not known, and that is a code/tool fact, not an owner question.
   Fix: add to the M0 Scope cell: "Run Table Plugin 3.3 `TPIMPORT` on GstarCAD 2025 with one schedule text file." In §16.5 replace the mini-schedule bullet with: "*Schedule row*: written in the Table Plugin text format (`SbcCalc\UI\TablePlugin.cs` writer reused) and imported with `TPIMPORT`, exactly as the existing schedules; the lines+text fallback is used only if the M0 check fails on GstarCAD (logged as a D-row)." Update §6 and STATUS TABLE accordingly.

12. **MAJOR — DECISIONS_TAKEN_BY_CLAUDE.md is missing seven defaults the plan already relies on.** Not logged as D-rows: (a) §12 extra tolerances — storey elevation 50 mm, rotation 5°, pier leg 70 % overlap / 10 % or 25 mm thickness; (b) §9 persistence — Xrecords in the DWG NOD plus sidecar JSON, XData rejected; (c) §21 lane base `beta_1142`, Detailer is a 1.17 deliverable and stays out of the 1.15 train; (d) §12/§17 G3 — an engineer may *accept* a MATCH-BY-GEOMETRY and *override* a DATA CONFLICT with a recorded reason (this touches the owner's "never pick one side" rule, so the owner must see it); (e) M1 "Budget guard: if week 3 slips > 3 days, M1 drops the elevation"; (f) §19.3 GstarCAD ribbon via partial CUIX; (g) §8 `Sbc.Codes` as a separate netstandard2.0 project also consumed by SbcCalc.
   Fix: append rows D15–D21 to DECISIONS_TAKEN_BY_CLAUDE.md with the wording above, reason column "plan default, §n", and the "to change it" phrase (e.g. D18: "No overrides — conflicts must be fixed at source"). Add "(D15)" … "(D21)" at the corresponding places in the plan.

13. **MAJOR — §0 asks omit the cost items the plan depends on.** §23 item 5 and R7 require "a GstarCAD 2024/2025 licence or trial" and "paid GstarCAD seat before M0 ends"; §23 item 9 requires "a Windows machine with ZWCAD and GstarCAD". A budget-limited owner must see this on page one.
   Fix: add ask "(f) **Budget.** One GstarCAD 2025 seat (trial for M0, paid before M1 ends) on the same Windows machine as ZWCAD. No other purchases: GstarCAD .NET package, OpenXML SDK, xUnit are free. ETABS is not needed on the detailing machine."

14. **MAJOR — Plain language: the executive summary and the plan use developer jargon an engineer-owner will not follow.** In §0 alone: "typed design record with provenance", "host-neutral rule library", "primitive entities", "compat layer". Elsewhere without explanation: NOD, Xrecord, XData, netstandard2.0, ConfuserEx/obfuscation, PaletteSet, CUIX, NETLOAD, xUnit, golden JSON, semver, SHA-256, O(n²), InvariantCulture, IdMapping, Overrules, P/Invoke, `/b` script, ReflectHarness, DoD.
   Fix: in §0 replace with plain phrases: "one tidy record per column that also says where the numbers came from"; "one shared rulebook (IS 456 / IS 13920) used by plugin and Calculator"; "only basic CAD lines, arcs, text and dimensions"; "the existing layer that hides CAD-brand differences". Add a 15-line "Words used" box after §0 defining the terms above in one line each (e.g. "Xrecord — a hidden note stored inside the DWG that travels with the file").

15. **MINOR — DECISIONS_TAKEN_BY_CLAUDE.md D10 is superseded by D14 but still reads as live.**
    Fix: prefix D10's Decision cell with "**Superseded by D14.**" and in §20 "Ductile policy (D10, D14)" change to "(D14, which replaces D10)".

16. **MINOR — §25(b) Q-B1 (overstressed members: block / warn / detail) is already decided in the plan.** §11.2 item 6, §14.1 ("Overstressed → that member only"), §17 G4 ("nobody" can override O/S) and the source-of-truth table all say "block". Asking it again is noise, and if the owner answered "warn" four sections would have to change.
    Fix: delete Q-B1; add D-row "D22 Overstressed / O/S members are blocked ('O/S — redesign'); nobody can override. To change: 'Allow detailing O/S with a flag'."

17. **MINOR — §25(c) Q-C6 "Live ETABS API path (V1.5)?" is outside V1 and already closed by D3.**
    Fix: delete Q-C6 and remove it from NEEDS MY DECISION. (The `ITableSource` seam sentence in §11.2 is enough.)

18. **MINOR — §25(a) Q-A2 duplicates D6 and §0 ask (b).**
    Fix: delete Q-A2 from §25(a); keep only §0 ask (b) "GstarCAD version on the test machine (D6 assumes 2025)". Reduce the NEEDS MY DECISION list accordingly.

19. **MINOR — Performance and identity numbers disagree across sections.** M1 exit: "detail < 10 s wall-clock, < 2 s in the engine" vs §21 budget "`SBTDETAIL` one column ≤ 1.0 s wall". M1 exit "entity-for-entity identical … 0.1 mm" vs §21 "bounding boxes ± 0.5 mm" semantic comparison.
    Fix: in the M1 exit cell use "one column ≤ 1.0 s wall-clock (§21 budget)" and "identical on both hosts per `compare.py --semantic` (± 0.5 mm)". Delete the 10 s / 2 s / 0.1 mm figures.

20. **MINOR — §10 `MemberKind` includes `RetainingWall` (RW) but retaining walls are not in V1 scope (columns + shear/lift walls only).** Carrying it in the contract invites creep.
    Fix: change the enum to `{ Column, ShearWall, LiftWall }` with comment "// RW out of V1 scope; add when retaining-wall detailing is planned", and add "retaining walls" to the §0 scope fence.

21. **MINOR — STATUS TABLE inconsistencies.** (a) "ALREADY EXISTS" lists `Guard.cs` (perf_0), `StructuralBlocks.cs` (num_1) and the ui_a panel as existing, but they live on unmerged lanes and only exist for the Detailer once `beta_1142` is the base (§21). (b) "NEEDS MODIFICATION" names `Build\SbcStructural.crproj`, which appears nowhere in §7.
    Fix: (a) tag those three bullets "(on lane perf_0 / num_1 / ui_a — unmerged; available via `beta_1142`, §21)". (b) add a §7 row "`Build\SbcStructural.crproj` — ConfuserEx exclusions for Detailer model types and `[CommandMethod]` classes — obfuscation must not break JSON (R10)".

22. **MINOR — §14.1 step 8 says "Every entity carries an Xrecord with mark, storey, design revision…" but §9 and §16.3 store one Xrecord per detail *block*.** Per-entity Xrecords would bloat the DWG and contradict the persistence design.
    Fix: change §14.1 step 8 to "Each detail block carries an Xrecord with mark, storey, design revision, source and rule-library version (§9)."

23. **MINOR — §25(a) Q-A6 (detail placement) is largely answerable from the answer-key drawings.** The default text itself says "1071/1162 look like model-space sheets — confirm". Opening them settles it.
    Fix: move Q-A6 out of the blocking table into §0 ask list as a one-line confirmation: "(g) Confirm details go in model space next to the plan, as in your drawings 1071/1162 (a layout or separate DWG is possible later)."

24. **MINOR — §21 "Installer enumerates GstarCAD R24/R25 … registry roots and writes loader keys; ships the partial CUIX" is scheduled implicitly for M0–M1, but the owner's evening tests need only NETLOAD.** Installer and CUIX work is M4 work.
    Fix: add to §21 Dual-host build paragraph: "Installer registry keys and the CUIX ship in M4; M0–M3 owner testing uses NETLOAD from `3 BETA\`." Add "installer with GstarCAD variants, CUIX" to M4 only (it is already there) and remove it from the M0/M1 implications.

25. **MINOR — §21 `SBCDETAILREPORT` produces "the HTML report (same style as SBCREPORT)" in addition to the text report and sidecar JSON.** A third report format is extra work in a 62-day plan and the owner reviews drawings, not web pages.
    Fix: change to "Writes `detail_report.txt`, the sidecar JSON and the notes block. (HTML report in the SBCREPORT style: M4 if time remains, else backlog.)"
