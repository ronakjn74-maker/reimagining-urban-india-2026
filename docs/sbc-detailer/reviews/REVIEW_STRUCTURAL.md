# STRUCTURAL REVIEW — SBC_DETAILER_SYSTEM_PLAN_V1.md

Reviewer role: senior Indian RCC engineer + detailer. Checked against APPENDIX_C_is_code_rules.md and IS 456:2000, IS 13920:2016 + Amd 1, IS 1893-1:2016, SP 34. Plan not edited. Findings ordered most severe first.

Summary: 4 BLOCKER, 11 MAJOR, 8 MINOR (23 total).

---

## BLOCKER

**1. BLOCKER — §13 (mandatory-field paragraph), §17 G6 — Missing design data is defaulted silently (fck/fy, Av/s).**
Problem: §13 says "`avs*` missing → Detailer computes minimum ties per IS 456 26.5.3.2 + IS 13920 and flags 'shear from code minimum'" and "fck/fy missing → project defaults with a warning"; §17 G6 lists "fck/fy from defaults" as a Warn. This breaks the one principle (WHAT comes from the design source, never guessed). fck drives Ld, Llap, Ash and τbd; Av/s is the design shear reinforcement (for ductile columns it is the capacity-design shear of IS 13920 7.5). A column drawn with "minimum ties" because the shear result was absent is a safety defect that reaches a GFC drawing with only a warning.
Fix (replace both sentences in §13 and the G6 row): "`AvsMajor/Minor` missing → `STATUS: INCOMPLETE 'shear reinforcement not supplied by <source>'`; the Detailer never substitutes code-minimum ties for a missing shear design. `Fck/Fy` missing → `STATUS: INCOMPLETE 'material grade not in design record'`; project defaults are used only for a *pre-match preview* and never for an inserted detail." In §17 G6 move "fck/fy from defaults" and add "Av/s absent" to the fail (INCOMPLETE) column.

**2. BLOCKER — §14.1 step 6, App. C §C10, §17 G5 — Design shear reinforcement (Av/s) is never checked against the chosen tie spacing/legs in any zone.**
Problem: tie spacing per zone is set purely from detailing limits (min(B/4, 6Ø, 100), min(B/2, 16Ø, 300), ≤100 at laps) and Ash. The record carries `AvsMajor_mm2_per_m` / `AvsMinor_mm2_per_m` but no step and no gate compares provided legs × area / s with it, in either direction. The mid zone at B/2 or 16Ø may be far below what the capacity-design shear needs. This is the single most common site failure in Indian ductile frames.
Fix: add to §14.1 step 6: "In every zone, Asv,prov/s = (number of tie legs crossing the shear direction × tie area)/s must be ≥ the governing Av/s from the design record for that direction (major: legs parallel to D; minor: legs parallel to B). Zone spacing = min(detailing limit, shear limit), rounded down to module." Add to §17 G5: "Asv/s provided ≥ Av/s required, both directions, every zone [IS 456 40.4 / IS 13920 7.5] — Fail blocks the member." Add the same for walls: Ah/s provided ≥ `AvsHoriz_mm2_per_m` per leg.

**3. BLOCKER — §13 (pier paragraph), §15.1, Source-of-truth table row "Boundary-element required flag" — The Detailer computes the BE trigger itself from Pu/Mu, contradicting App. C W-B1 ("Supplied by ETABS/Calculator as a flag; the Detailer does not re-check").**
Problem: §13 says "`boundary[]` empty → Detailer runs the IS 13920 10.4.1 stress check itself from Pu/Mu if present". The 10.4.1 check needs the gross flanged section properties, both signs of moment, and the specific combination that maximises extreme-fibre compression; the record's Pu/Mu are *envelope* values from possibly different combinations, so the result is neither conservative nor reproducible. Whether a BE exists is a design (WHAT) decision.
Fix: replace with "`boundary[]` empty and no `Required` flag → `STATUS: INCOMPLETE 'boundary element decision not supplied by <source>'` → ACTION: run the pier design / Calculator wall check and re-import." Delete `IWallRules.BoundaryElementRequired` from the Sbc.Codes interface (or keep it only inside the Calculator). Correct the Source-of-truth row to "Selected DesignSource only; missing → INCOMPLETE". Same for BE length: never derived by the Detailer (see finding 11).

**4. BLOCKER — §0 scope fence, §20 "Ductile policy", §25 Q-A3/Q-A5, D10 — Ductile detailing can be switched off per project in a Zone III office.**
Problem: IS 13920:2016 cl. 1.1.1 (and IS 1893-1:2016 cl. 6.4) make IS 13920 mandatory for all RC structures in Zones III–V; there are no "gravity-only small buildings" in Mumbai for which `RuleSet_IS456_Only` is lawful. The plan further speaks of "12 mm in gravity columns" and "90° hooks in Zone II gravity members" as live options for the Mumbai default.
Fix: in §20 replace "Per project it can be switched off for gravity-only small buildings" with "`Ductile = off` is permitted only when the project seismic zone is II; in Zones III–V the switch is locked, and an override requires the engineer role, a recorded reason stored in the Xrecord, and a notes-block line 'DETAILED TO IS 456 ONLY — ENGINEER OVERRIDE <name/date>'. `RuleSet_IS456_Only` is selected automatically from zone, never by a free toggle." Reword D10 and Q-A3/Q-A5 accordingly (12 mm bars and 90° hooks are Zone II options only).

---

## MAJOR

**5. MAJOR — §15.1, §15.2 step 9, §25 Q-B6 — Wall vertical-bar laps: "two groups" contradicts the 1/3 lapped-fraction default; the no-lap plastic-hinge height is undefined.**
Problem: §15.1 says "laps (two groups, stagger ≥ 600 mm, not in the base plastic-hinge zone)" while Q-B6 adopts the 1/3 rule (App. C W-A2, IS 13920:2016 10.9.x, 1993 cl. 9.9.2). Two alternating groups splice 50 % at a section. The plastic-hinge no-lap height is left as words; the engine needs a number, and in practice it is **lw above the base** (1993 9.9.2; 2016 10.9.2 verify). With lw ≥ storey height this makes ground-storey laps impossible, which the plan does not address.
Fix: §15.1: "laps in **three** alternating groups (≤ 1/3 at a section), adjacent splices offset ≥ max(600 mm, Llap); no laps within lw above the wall base (IS 13920 10.9.2 **(verify)**) — if the first lap level would fall inside that zone, the Detailer emits `E-WALL-LAP-HINGE` and proposes either starter bars from the raft of length lw + Llap or couplers (IS 16172); never silently laps in the hinge zone." Add `WallRules.NoLapZoneHeight(lw, hw)` to §20 and a RuleId `WALL.NO_LAP_ZONE = lw (verify)`.

**6. MAJOR — §14.1 step 6 — "If 2·l0 + 2.3·Llap > hc → 'confined full height' flag" conflates lap feasibility with IS 13920 8.2–8.5 full-height confinement.**
Problem: full-height special confinement is a design condition (contraflexure location, short column, column under discontinued wall) that comes from the design source (`FullHeightConfinement`, C-H10). A lap that does not fit in the permitted window is a splice problem whose code answer is couplers/welded splices in the central half (7.3.3/7.3.4). Flagging it as "confined full height" produces a wrong drawing note and hides the real action.
Fix: replace with "Lap window = [max(z0 + hc/4, z0 + l0), min(z1 − hc/4, z1 − l0)]. If 2.3·Llap (two groups) does not fit → `E-LAP-NOFIT`: try single-stagger 1.0·Llap offset (still ≤ 50 % at any section); if still no fit → member to REVIEW with ACTION 'use mechanical couplers (IS 16172) in the central half — IS 13920 7.3.3' and the elevation shows the coupler level. Full-height confinement is applied only when `FullHeightConfinement = true` in the design record (IS 13920 8.2–8.5)."

**7. MAJOR — §14.1 step 5, §17 G5 — Lateral-support wording is wrong and the ductile 300 mm leg rule and peripheral-bar engagement are missing from the workflow and the gate list.**
Problem: step 5 says "cross-ties so every bar is within 150 mm clear of a supported corner". IS 456 26.5.3.2(b) is: corner and alternate bars supported by a tie corner (≤ 135°), and no bar more than 150 mm clear from a *laterally supported bar* (not "corner"). For ductile columns IS 13920 7.4.x additionally requires parallel hoop legs ≤ 300 mm c/c with a cross-tie whenever a side exceeds 300 mm, cross-ties with 135° hooks at both ends engaging *peripheral longitudinal bars*, and h ≤ 300 for Ash. App. C §C7 allows a cross-tie that "engages hoop only" — acceptable under IS 456 Fig 9 but not for a ductile column.
Fix: step 5: "…cross-ties so that every corner and every alternate bar sits at a tie corner, no bar is more than 150 mm clear from a laterally supported bar [IS 456 26.5.3.2(b)], and in ductile columns consecutive tied legs are ≤ 300 mm c/c with every cross-tie hooked 135°/135° around a peripheral longitudinal bar [IS 13920 7.4.x, 7.6.1 note]." Add to G5: "`EngagesHoopOnly` cross-tie in a ductile member → Fail."

**8. MAJOR — D9, §25 Q-A4, §15.2 step 3 — Flat 40 mm column / 25–30 mm wall cover is not a safe Mumbai default; exposure must be per face, not a single project number.**
Problem: IS 456 Table 3 classes "exposed to coastal environment" as *severe* (Table 16: 45 mm); sheltered interior members are *moderate* (30, raised to 40 by 26.4.2.1 for columns). Mumbai external columns and shear walls (lift/stair cores on the periphery, podium walls) are routinely detailed at 45–50 mm by competent offices. A single "40 default" silently under-covers external members, and "walls 25 internal / 30 external" is below Table 16 severe for any external wall.
Fix: Q-A4 default: "Exposure class per project *and per face*: internal → moderate (columns 40, walls 30); external/coastal-facing → severe (columns 45, walls 45); below ground / water-retaining → 50. The Detailer reads an `Exposure` attribute per member (Members grid, default = project external/internal from the plan's perimeter test) and prints the class in the schedule remarks; cover is never a bare number in OfficeSettings."

**9. MAJOR — §25 Q-B7 default — "Single curtain allowed below 200 mm with a warning" ignores the shear-stress criterion of IS 13920:2016 10.1.5.**
Problem: two curtains are required when tw > 200 **or** τv > 0.25√fck. A 180 mm wall at τv = 0.8 MPa in M30 (0.25√30 = 1.37 — fine) may pass, but the plan's default does not evaluate τv at all; it needs Vu/(tw·0.8lw) from the design record. In Mumbai practice every RC shear wall is two-curtain regardless.
Fix: Q-B7 default: "Two curtains always (office). A single curtain is permitted only if tw ≤ 200 **and** the design source supplies Vu such that τv = Vu/(0.8·lw·tw) ≤ 0.25√fck; Vu absent → two curtains, note 'τv not supplied'." Keep `IWallRules.Curtains(tw, tauV, fck)` but make `tauV` non-nullable on the single-curtain path.

**10. MAJOR — §25 Q-B6 default, §15.2 step 3 and 6 — BE length derived by a 60-second rule (max(0.15 lw, 2 tw, 450)) is design, not detailing; and the plan does not say whether web vertical bars are counted inside the BE.**
Problem: the BE extent is the length over which σ > 0.2 fck (IS 13920 10.4.1), i.e. from the stress diagram; a default length changes BE Ag, the 0.8–6 % band and the confinement — all WHAT quantities. Also W-B5 (App. C) raises a question the plan never settles: do the web verticals continue through the BE and count toward `RequiredRho`, or does the BE carry its own bars? Both are drawn differently and the ETABS "Required Rho" convention differs between pier types.
Fix: Q-B6 default → "`RequiredLength_mm` absent → `STATUS: INCOMPLETE 'BE length not supplied'`; an office rule for lbe may be entered in OfficeSettings only after explicit owner confirmation (not a silent default) and is then printed in the notes." §15.2 step 6 add: "BE bars are separate marks; web vertical bars terminate at the BE face with Ld into the BE core unless `PierType = UniformReinforcing`, in which case the uniform bars continue through and the BE adds only the extra bars needed to reach `RequiredRho` over lbe·tw."

**11. MAJOR — §25 Q-B8 default, App. C F-10 — Defaulting to "office table without the 1.4 corner factor" is a conscious code departure that is not visible on the drawing.**
Problem: IS 13920 7.3.2 requires column laps to be *tension* splices; IS 456 26.2.5.1(c) ×1.4 applies to corner bars with cover < 2Ø (true for Ø ≥ 25 at 40 cover) — so with the office 50Ø table at M25, a T25 corner bar strictly needs 70Ø. The 60-second default silently drops it, and the trigger "forced if the design reports net tension in that bar" needs a per-bar tension result that neither source provides.
Fix: Q-B8 default → "Apply 1.4 to corner bars with cover < 2Ø **unless** the owner sets `CornerLapFactor = 1.0` in OfficeSettings; whichever is set, the lap table printed in the notes block carries the line 'corner-bar factor 1.4 applied / NOT applied (office decision, IS 456 26.2.5.1(c))'." Remove the "net tension in that bar" trigger (not computable from the records).

**12. MAJOR — §25 Q-B9 default — Using the shallowest beam soffit for hc is conservative for l0 but *unconservative* for the lap window.**
Problem: l0 = max(D, hc/6, 450) grows with hc, so shallowest-soffit is safe for l0; but the "central half" for laps then extends to z1,shallow − hc/4, which on the deep-beam side can lie inside that face's l0 (laps in a confining zone are prohibited by 7.3.2 by implication and by App. C C-D5).
Fix: Q-B9 default → "l0 at the top from the shallowest soffit (longest hc); the lap window from the *deepest* soffit (shortest hc): window = [z0 + max(hc,deep/4, l0,bot), z1,deep − max(hc,deep/4, l0,top)]. Both beam faces are drawn on the elevation."

**13. MAJOR — §14.1 step 5/6, §17 G5 — Lap-zone steel percentage and lapped-pair clear spacing are not named as checks although App. C §C11 1–2 require them.**
Problem: §17 G5 says "clear spacing, %" without the lap-zone condition. At the lap level the bar area is p·(1 + fraction lapped) and the lapped pair occupies 2Ø; for a 4 % column with 50 % lapped this is 6 %, and at 100 % (gravity) 8 % — a code Fail. This is exactly where Mumbai columns with T32 at 3.5 % become unconcretable.
Fix: G5 text → "…clear spacing (including the lapped pair treated as 2Ø wide), steel % including lap-zone % = p·(1 + lapped fraction) ≤ 6 % [IS 456 26.5.3.1(a)], …". Add to §14.1 step 5 the warning "lap-zone congestion → propose couplers or larger section".

**14. MAJOR — §13 `ColumnDesignRecord` comment, §16.5 — Wrong clause citation and renderer text that look like rule values.**
Problem: `AshOverS_* /*null → Detailer computes IS 13920 8.1*/` — Ash is 7.6.1(a)/(b); 8.1 is l0 and spacing. In §16.5 the renderer bullet lists "lap zone start at hc/4", "first hoop at 50", "crank 1:6" as if the drawer knew these numbers; the rule (D4/§20) is that Render reads only the `DetailModel` (`TieZone`, `LapSpec`, `CrankSpec`) and prints what is there.
Fix: change the comment to "IS 13920 7.6.1". Add to §16.5 opening: "Every dimension and spacing in the section/elevation is read from `DetailModel`; the renderer holds no code constant and no office constant (ReflectHarness scans `Detailer.Render` for numeric literals > 10 except line weights/text heights)."

**15. MAJOR — §14.2, §25 Q-B5 — Crank/dowel rule at size change is incomplete for ductile columns.**
Problem: "never crank in ductile columns' l0" is necessary but not sufficient: the crank must lie in the *lap zone of the lower column* (central half) so the upper bar stays straight, and the extra ties at the bend (1.5 × horizontal component, within 150 mm of the bend, SP 34) are not mentioned anywhere in the plan.
Fix: §14.2: "Size change → crank at slope ≤ 1:6, located within the lap window of the lower column, upper bars straight; two extra hoops within 150 mm each side of the bend (SP 34, App. C C-S9); offset > 75 mm → separate dowels lapped Llap into the upper column with Ld (tension, ductile) into the lower. The crank/dowel geometry is a `CrankSpec` in `DetailModel`, drawn on the elevation and listed in the schedule remarks."

---

## MINOR

**16. MINOR — §25 structure — Several "owner questions" are not engineering decisions, and a few are answerable from the code.**
Problem: Q-A2, Q-A6, Q-A7, Q-B3, Q-B4, Q-C1, Q-C2, Q-C6 are IT/project logistics; Q-B1 (detail an overstressed member?) has only one engineering answer (never); Q-A5's "90° hooks in gravity members?" is answered by finding 4 for Zone III. Mixing them dilutes the list the owner must actually think about (Q-A3, Q-B2, Q-B5–Q-B10, Q-C3, Q-C7).
Fix: split §25 into "(E) Engineering decisions" and "(P) Project/IT decisions"; delete Q-B1 (state "O/S always blocks" as a rule) and the 90° option in Q-A5.

**17. MINOR — §15.2 step 5 — "ρv ≥ ρh" stated without the "(verify)" that App. C W-R5 carries.**
Fix: "ρv ≥ ρh **(verify IS 13920:2016 10.2.x; applies at least for hw/lw ≤ 2)**".

**18. MINOR — §14.1 step 8 / §16.5 — Foundation interface reduced to "per foundation drawing".**
Problem: C-H10(d)/C-S12 require confining hoops ≥ 300 mm into the footing and Ld (tension, ductile) embedment with the 90° leg; the column elevation is where the site reads this. Leaving it entirely to the SAFE drawing loses the IS 13920 requirement.
Fix: elevation note at foundation level: "Starter bars: embed Ld,tension = <value> + 90° leg ≥ 16Ø on mat; confining hoops @ <s_conf> continued 300 mm into footing (IS 13920 8.x) — coordinate with foundation drawing."

**19. MINOR — D9 / §20 lap table — High-grade concrete (M50–M70, common in Mumbai towers) is outside the verified τbd table.**
Fix: `CodeValues` τbd stops at the last verified grade (M40 per Is456.cs); for higher grades use the M40 value (36Ø) and print "lap per M40 (τbd for > M40 not verified)". Never extrapolate.

**20. MINOR — §15.2 step 6, App. C §B6 item 2 — Web horizontal bars described as "the BE outer tie".**
Problem: web horizontals at e.g. T10@200 cannot act as the BE hoop at s_conf ≤ 100 with Ash; the BE has its own closed hoops.
Fix: "Web horizontal bars are anchored Ld into the BE core (U-bar or 135° hook around the BE corner bar) and are never counted as BE confinement."

**21. MINOR — §14.1 step 6 — Lap-zone hoop spacing stated as "≤ 100 mm" only.**
Fix: "s_lap = min(100, s_mid, shear limit) — IS 13920 7.3.2 (100 mm **(verify vs 150)**)".

**22. MINOR — §17 G3 — "≤ 5 % → proceed with the CAD size" should state what happens to As,req and min steel.**
Fix: "…proceed with the CAD polygon; As,req is taken unchanged from the design (conservative when CAD is larger; when CAD is smaller by ≤ 5 % the warning text says 'design section larger — As,req unverified for CAD size'); min/max % are computed on the CAD Ag."

**23. MINOR — §25 Q-A5 — Tie 10 mm "when main Ø ≥ 32" is office practice, not IS 456 26.5.3.2(c)(2) (32/4 = 8).**
Fix: state it as "office (D9); code minimum for Ø32 is 8 mm" so EXPLAIN cites the right source.
