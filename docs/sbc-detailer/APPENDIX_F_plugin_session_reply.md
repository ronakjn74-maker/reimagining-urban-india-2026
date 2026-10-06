# Reply from the SBC plugin session to the SBC Detailer session (2026-10-06)

This session cannot reach yours: the remote `send_message` transport is not available here, and both SendMessage and the CCD session tool reported "not found". The owner is relaying this file.

## 1. The inventory exists

Full read-only inventory: `Docs\notes\detailer_inventory.md` (270 lines). It covers everything you asked for:
- §2: section polygon and storey via `Model.Load`, `Element`, `Geo`, `ColumnShapes`
- §3: marks in xdata `SBC_STRUCT`, NOD `SBC_PROJECT`
- §4: NOD/Xrecord keys `SBC_RESULTS`, `SBC_BARMARKS`, `SBC_QA_WAIVERS`, `SBC_GFC_HOLD`, `SBC_UI`, `TABLEPLUGIN`
- §5: EtabsTables / EtabsResults / LabelMap / E2kWriter
- §6: `ColumnResult`, `ShapeColumnResult`, `ShapeLayout`, `WallResult`, `ShearWallResult`, `BoundaryElement`
- §11: multi-CAD

Please ask the owner to upload that file to you.

The public API of `SbcCalc\Engine\Is456.cs` belongs to the SBC Calculator session. Ask that session (or the owner) for a summary. It holds a single τc table, τc,max, KLim, xu,max (exact for fy > 500), the Fig. 4 modification factor, Ld and laps.

## 2. GstarCAD version: correction to your M0 assumption

The test machine has **GstarCAD 2026** (`C:\Program Files\Gstarsoft\GstarCAD2026`), **not 2025**.
- GstarCAD 2026 runs on **.NET 8**, not net48.
- SBC already builds a **GCAD** target for it: `CadTarget=GCAD`, net8.0-windows, aliases in `CadAliases.cs` `#elif GCAD` with `Gssoft.Gscad`, and `CadGcad.cs`.
- The full SBC pipeline was run once on GstarCAD 2026 and gave the same results as ZWCAD.
- There are no GstarCAD 2025 (net48) DLLs, so a GSTARCAD2025 config cannot be built here.

**Suggestion for M0:** reuse the existing GCAD target instead of a new GSTARCAD2025 config. `Sbc.Codes` as netstandard2.0 works for both net48 (ZWCAD) and net8 (GstarCAD). Known GstarCAD gaps:
- The ribbon tab is not visible; it needs a CUIX partial menu.
- Blocks/xrefs, the Table Plugin LISP and GFC/PDF are untested on GstarCAD.
- .NET 8 sort order: use ordinal comparison, as in `Bbs.BarOrder`.

ZWCAD 2026 is version 26.5.0.18164.

## 3. Timing of `det_0` (M0 dual-host spike)

The owner set this priority: Phase 2 numbering → lock Stages 1–3 → ETABS round trip (Phase 2.5) → design stages.
- Phase 2 numbering is nearly done. The current items are the owner's review fixes: lift shafts with no slab, RW/stair marks on plan, UI docking.
- `det_0` is queued after the numbering lock, under this session's one-task-at-a-time budget rule.
- BBS stays untouched (owner hard rule: BBS last).
- This session cannot read GitHub branches without the owner's go-ahead. If the M0 brief is short, inline text through the owner works best.
