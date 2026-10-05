# Decisions taken by Claude without owner reply (review list)

Owner instruction (2026-10-06): "if I don't reply within 60 sec you move ahead with your decision, and keep a list so when I am back I can see if something is to be changed".
Each row: what was decided, why, and what to say if you want it changed.

| # | Decision | Reason | To change it, tell me |
|---|----------|--------|------------------------|
| D1 | Plan is written from the transcript audit + three research appendices, then reconciled with the plugin session's code inventory when it arrives, instead of waiting idle. | Owner wants progress; inventory agent timing unknown. | "Redo the plan after the inventory" |
| D2 | Detailer is a NEW module inside the existing SbcStructural plugin (same repo, same panel, same compat layer), not a separate application. | Long-term architecture in the master prompt; reuse of geometry, numbering, Guard, panel; BBS/sheets already there. | "Make Detailer a separate app" |
| D3 | ETABS→Detailer channel for V1 = the ETABS table export (Excel/CSV) that the plugin's Phase 2.5 import already plans to read; no live ETABS API in V1. | Owner: "we never start ETABS, owner runs it"; no typed pier API; no licence needed at detailing time. | "Use the ETABS API" |
| D4 | Code rules (IS 456 / IS 13920) live in a host-neutral shared library `Sbc.Codes`, seeded from SbcCalc\Engine\Is456.cs, with a new Is13920.cs. Detailer never computes code values inline. | Master prompt: code logic separated from drawing logic; plugin already plans to adopt Is456.cs as single source. | "Keep rules inside the plugin only" |
| D5 | Drawing renderer uses only primitive entities (lines, arcs, polylines, text, classic dimensions, blocks with attributes, Xrecords); no Table, MLeader, Fields, dynamic-block authoring. | Only this surface is identical on GstarCAD ≤2025 (net48) and ZWCAD. | "Allow MLeader/Table" |
| D6 | GstarCAD target for V1 = GstarCAD 2024/2025 (.NET Framework 4.8 API). GstarCAD 2026/2027 (.NET 8 API) is a separate later build. | GstarCAD 2026+ cannot NETLOAD a net48 DLL; the whole plugin is net48. | "Target GstarCAD 2026" |
| D7 | Member matching confidence: ID+storey exact = MATCH; else geometry (centroid ≤ 100 mm & section within 10 % & storey) = MATCH-BY-GEOMETRY (amber, listed); else MATCH FAILED (member blocked). Tolerances are settings. | Master prompt forbids silent wrong data. | "Change tolerances / no geometry fallback" |
| D8 | Geometry conflict rule: CAD section vs ETABS design section differing by >5 % in any dimension or different shape = DATA CONFLICT (review required). ≤5 % = warning only. | Need a threshold; ETABS analytical sections are often rounded. | "Use a different threshold" |
| D9 | Office defaults assumed until you confirm: preferred bar dias 12/16/20/25/32, max two dias per column, tie min dia 8 mm, 135° hooks everywhere, spacing rounded down to 25 mm, cover per IS 456 Table 16 by exposure with 40 mm default for columns, office lap table (50/46/40/36 Ø). | From the IS catalogue and the calculator's existing lap table. | Any value |
| D10 | Ductile detailing (IS 13920) is applied when the project is in seismic zone III or higher or when ETABS reports the frame as Ductile; otherwise IS 456 only. | IS 1893/13920 applicability. | "Always ductile" / "Flag per project" |
| D11 | First milestone column is a rectangular ductile column; L/T/C are in milestone 2 but the geometry engine is polygon-based from day one. | Master prompt phase 11; no hard-coded rectangles. | — |
| D12 | BBS untouched; Detailer emits bar marks only as drawing text. | Owner hard rule. | — |
