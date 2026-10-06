# SBC Detailer — Handover

Written 2026-10-06 for whoever picks this project up next. Everything named below exists at the commit and locations given; nothing here is a promise about future work.

## 1. Where everything lives

- **Repository**: `https://github.com/ronakjn74-maker/reimagining-urban-india-2026`
- **Branch**: `claude/sbc-detailer-system-plan-l8o7qh`
- **Commit as of this handover**: `a02c42d5b338bf5135620c2bdbe2ab7ba5bf2989`
- **Folders**:
  - `docs/sbc-detailer/` — the plan, research, decisions, reviews (all Markdown, no code)
  - `sbc-detailer/src/` — working C# code, builds and tests independently of any CAD program

This repository is otherwise an unrelated static website (a conference site called "Reimagining Urban India 2026"). The Detailer work is confined to the two folders above.

## 2. The actual project, in one paragraph

SBC Detailer is a planned new module inside an existing CAD plugin called SbcStructural (C#, runs inside ZWCAD and GstarCAD, used by a structural engineering office). ETABS (or the office's own SBC Calculator) says how much reinforcement a column or wall needs. The CAD drawing says the member's real shape, size and position. The Detailer is supposed to combine the two and produce the actual buildable reinforcement: bar sizes, tie spacing, confinement zones, and eventually a drawing. The guiding rule throughout: if the two sources disagree, or data is missing, the software must stop and say so — never guess or silently default.

## 3. Who else is involved

Three separate Claude Code sessions worked on this, only one of which is this one:

1. **This session** ("SBC Detailer system plan") — wrote the plan and the host-neutral engine code (no CAD dependency).
2. **The plugin session** ("CAD plugin for structural element scheduling") — runs on the owner's own Windows PC at `C:\Users\admin\Desktop\SBC_Software`, and is the only session with access to the real plugin code, the real CAD programs, and ETABS. It is on a strict personal usage budget and works one task at a time, prioritising its own existing roadmap (a numbering-system lock) ahead of this project.
3. **The SBC Calculator session** ("Calculation software from sheets") — a separate Claude Desktop session, not reachable from here, maintains a standalone calculator app that shares some code with the plugin.

The three sessions do not share a filesystem. Everything exchanged between them went through either GitHub (this repo) or short text messages relayed by the owner.

## 4. The plan documents (`docs/sbc-detailer/`)

| File | What it is |
|---|---|
| `SBC_DETAILER_SYSTEM_PLAN_V1.md` | The master plan. Sections 0–25 answer the owner's original brief point by point (existing code, architecture, data flow, matching strategy, workflows, validation, UI, dependencies, risks, open questions). Read section 0 (executive summary) first. Status: "V1.1" — reviewed by five independent critiques and then corrected against the real plugin inventory. Still has a handful of items marked **(assumed — verify in inventory)** where even the inventory didn't answer; search for that phrase. |
| `OWNER_DECISIONS.md` | Every decision the owner (the person running this project) made, dated, in his own words or close to it. |
| `DECISIONS_TAKEN_BY_CLAUDE.md` | 42 decisions I made on the owner's behalf under his explicit instruction to keep moving rather than wait for replies. Each row has the decision, the reason, and the exact phrase the owner can say to reverse it. **Read this file before changing any default** — if something looks like an odd choice, it's probably explained here, not a mistake. |
| `APPENDIX_A_plugin_session_audit.md` | What the plugin session's own transcript revealed about its codebase, mined before direct contact was established. |
| `APPENDIX_B_etabs_research.md` | How ETABS exposes design data: export formats, table names and columns, the live API, and what ETABS does and does not give you (it never gives bar count or tie spacing — only required steel area and shear demand). |
| `APPENDIX_C_is_code_rules.md` | A full catalogue of the Indian Standards rules needed for column and wall detailing (IS 456, IS 13920 with amendments), with clause numbers, flagged wherever a value needs checking against the actual BIS book rather than trusting the research. |
| `APPENDIX_D_cad_platform_research.md` | GstarCAD vs ZWCAD .NET API compatibility research. |
| `APPENDIX_E_plugin_detailer_inventory.md` | **The most important appendix.** The plugin session's own read-only inventory of its real code: exact class names, file names, data formats, persistence keys. Supersedes guesses made elsewhere. |
| `APPENDIX_F_plugin_session_reply.md` | A short correction from the plugin session: the test machine actually runs GstarCAD 2026 on .NET 8, not the older version the plan first assumed, and the plugin already has a working build target for it. |
| `reviews/REVIEW_*.md` | Five independent critiques of the plan draft (structural engineering correctness, CAD platform practicality, ETABS data correctness, software architecture, and an "owner's advocate" check for scope creep and wasted questions). Twelve blocking problems and 59 lesser ones were found and fixed; these files are the record of what was wrong before the fix. |

**If you read nothing else, read**: the plan's section 0, `DECISIONS_TAKEN_BY_CLAUDE.md`, and Appendix E.

## 5. The code (`sbc-detailer/src/`)

Plain C#, targets .NET Standard 2.0 for the two libraries (compatible with both the plugin's old .NET Framework 4.8 and the newer .NET 8 build) and .NET 8 for the harness/tests. No CAD assembly is referenced anywhere in this code — that is deliberate, so it can be built and tested without ZWCAD, GstarCAD, or a license of either.

```
sbc-detailer/
  README.md                        — what's implemented, what's stubbed (keep this honest and current)
  src/
    Detailer.sln
    Sbc.Codes/                     — Indian Standards rule values (IS 456, IS 13920), clause-tagged
    SbcStructural.Detailer.Core/   — the actual engine:
      Contracts/                   —   the data types passed between stages
      Import/                      —   reads ETABS CSV/TSV exports (columns + walls/piers)
      Matching/                    —   matches a CAD member to its design record
      Engine/                      —   works out bar sizes, tie spacing, confinement zones
      Validation/                  —   the checks that can block a member (missing data, code violations)
    Detailer.Harness/              — a console program that runs sample columns and walls and prints the result
    Detailer.Tests/                — 15 automated tests
```

**To build and run it** (needs the .NET 8 SDK; nothing else):
```
cd sbc-detailer/src
dotnet build Detailer.sln
dotnet run --project Detailer.Harness
dotnet test
```
Expected: build succeeds with 0 warnings, the harness prints five sample runs (three column, two wall), and 15 of 15 tests pass. This was independently re-run and confirmed, not just taken on the developer's word, at the time of this handover.

**What it demonstrably does**, shown by the harness:
- Given a rectangular column's required steel and a ductile (earthquake) rule set, it picks a sensible bar count and diameter, sets tie spacing including the tighter zones near the top and bottom, and correctly notices when the required lap splice would not physically fit and suggests mechanical couplers instead of drawing something wrong.
- Given a shear wall needing a boundary element, it correctly divides it into boundary-element / web / boundary-element bands with different bar and tie arrangements.
- Given a member with missing required data (shear reinforcement, or boundary-element length), it stops and reports `STATUS: INCOMPLETE`, naming exactly what is missing. It never guesses or substitutes a default for genuinely missing design data.

**What it does NOT do yet**, stated plainly (the plan calls this scope-fencing — see `DECISIONS_TAKEN_BY_CLAUDE.md` D41, D42):
- **No CAD connection at all.** It cannot read a drawing or draw anything. That work needs the actual plugin code and a Windows machine with ZWCAD/GstarCAD, which only the plugin session has.
- **No L-shaped, T-shaped or other irregular columns** beyond a basic warning — only rectangles are fully handled.
- **Wall openings** (doors, voids) get a text note only, not real detailing around them.
- **Wall boundary-element confinement** reuses the column's tie rules rather than a wall-specific rule that's been independently checked.
- **Wall shear check** is an approximation, not the full code procedure.
- **Wall vertical bar lap pattern** is not implemented.
- **The Indian Standards rule values in `Sbc.Codes`** are a fresh write based on research, not yet checked against the office's own existing `Is456.cs` file (which lives in the plugin's codebase and this session could never read).
- One cosmetic bug: a particular warning message prints twice instead of once. Harmless, not fixed.
- Everything about how the ETABS CSV import exactly matches a real ETABS export's column headers is still marked "verify" — it was built from written research about ETABS, not a real exported file.

## 6. What a real ETABS export would unblock

The single most valuable thing the next person (or the owner) can supply is **one real ETABS export file** from an actual project — Excel or CSV — covering columns and a pier/wall, together with the matching CAD drawing. Everything about header names, units, and which table has what is currently a best guess from documentation, flagged as such throughout. One real file turns every one of those guesses into a fact.

## 7. Suggested next steps, in order

1. Get the plugin session (or whoever has access to the real plugin code and a Windows machine with ZWCAD/GstarCAD and a licensed ETABS) to continue — this is non-negotiable for most of what's left, since no further CAD or ETABS work is possible from here.
2. Get one real ETABS export and one real column/wall CAD drawing from the office, as above.
3. Wire the engine in `sbc-detailer/src/` to the plugin's real design-result types (`ColumnResult`, `ShapeColumnResult`, `ShearWallResult` — all named and described in Appendix E §6) instead of the engine's own placeholder arrangement logic, where the plugin's own code already does the same job. This was flagged as a major reuse opportunity (decision D39) and is probably the highest-value next step.
4. Build the actual drawing output, using the plugin's existing `Sketch` drawing helper (Appendix E §7) rather than inventing a new one.
5. Only after the above: L-shaped/T-shaped columns, wall openings, the wall lap pattern, and the rest of the stated gaps.

## 8. One governing instruction to carry forward

The person who owns this project gave two standing instructions that shaped everything above and should keep shaping it: do not waste much on automated testing, because he does the real testing himself; and keep AI usage and cost as low as reasonably possible. Both are why the test suite is small (15 tests, not hundreds) and why a single developer pass was used instead of repeated expensive review cycles once the plan itself had already been reviewed once.
