# SBC Detailer – IS Code Rule Catalogue for Column and Shear-Wall Reinforcement Detailing

Status: planning draft, prepared from working knowledge of the codes (no BIS PDFs in this session).
Codes: IS 456:2000 (reaffirmed, Amendments 1–6), IS 13920:2016 + Amendment 1 (Nov 2017) + Amendment 2 (2021, minor; see note), IS 1893 (Part 1):2016, SP 34:1987, IS 2502:1963 (R2004), IS 1786:2008.

Conventions used in this document
- Every rule carries a tag `[CODE clause]`. Rules whose clause number or numeric value I am not fully certain of are marked **(verify against BIS copy)**. Treat those as "implement with the stated value, but confirm before release".
- `Ø`/`db` = longitudinal bar diameter, `Øt` = tie/hoop diameter, `B`/`D` = least/largest lateral dimension, `tw` = wall thickness, `lw` = wall horizontal length, `hc`/`hw` = clear storey height, `fck` in N/mm², `fy` = 500 (Fe500 / Fe500D) unless stated.
- "Ductile" = member designed to IS 13920 (mandatory for all RC structures in seismic Zones III, IV, V `[IS 13920:2016 cl. 1.1.1]`). "Gravity" = IS 456 only (Zone II, or members outside the lateral-load-resisting system where the designer so decides — but note IS 13920:2016 cl. 1.1.1/5.x still requires gravity columns in Zone III+ frames to be detailed to IS 13920 if they must sustain the design drift; see Open Question F-3).
- Items already verified in the SBC Calculator session are marked **[Calc-verified]** and are not re-derived here.

---------------------------------------------------------------------
## A. COLUMNS
---------------------------------------------------------------------

### A1. Longitudinal reinforcement – IS 456 (all columns)

| ID | Rule | Value | Clause |
|----|------|-------|--------|
| C-L1 | Minimum longitudinal steel | 0.8 % of gross area Ag. Where the provided section is larger than needed for load, 0.8 % may be applied to the area *required* (not the actual) — the detailer should get a flag from the calculator (`UseReducedAgForMinSteel`) rather than decide itself. | IS 456 26.5.3.1(a) |
| C-L2 | Maximum longitudinal steel | 6 % of Ag; **practical maximum 4 %** because the lap zone doubles bar area and congests concrete placement. Office rule: hard-fail > 6 %, warn > 4 %, and compute "steel % in lap zone" = 2 × p when 100 % bars are lapped at one level (gravity columns). | IS 456 26.5.3.1(a), note in (b) |
| C-L3 | Pedestals (members with lo/least dim < 3) | min 0.15 % of Ag | IS 456 26.5.3.1(b) **(verify sub-clause letter)** |
| C-L4 | Minimum number of bars | 4 for rectangular, 6 for circular. For polygonal/irregular sections: one bar at every vertex (convex and re-entrant) and ≥ 4 total — this is an office/SP 34 interpretation, IS 456 says only "rectangular" and "circular". | IS 456 26.5.3.1(c) |
| C-L5 | Minimum bar diameter | 12 mm | IS 456 26.5.3.1(d) |
| C-L6 | Helically reinforced columns | ≥ 6 bars inside the helix | IS 456 26.5.3.1(e) **(verify letter)** |
| C-L7 | Maximum spacing of longitudinal bars along periphery | 300 mm (centre to centre along the perimeter) | IS 456 26.5.3.1(g) **(verify letter; the 300 mm value is certain)** |
| C-L8 | Minimum clear spacing between bars | ≥ larger bar Ø; ≥ (nominal max aggregate + 5 mm). Bundles: treat as single bar of equivalent area for spacing. Office rule proposed: ≥ max(Ø, 25 mm, agg + 5) with agg = 20 mm → 25 mm; at lap zones the *lapped pair* must still meet this (see A5). | IS 456 26.3.2 |
| C-L9 | Cover to longitudinal bars (nominal cover = to the *outermost* steel, i.e. the tie) | Columns: ≥ 40 mm, or ≥ Ø of longitudinal bar, whichever is greater; may be reduced to 25 mm for columns of min dimension ≤ 200 mm with bars ≤ 12 mm. Then also satisfy exposure Table 16 (mild 20, moderate 30, severe 45, very severe 50, extreme 75; −5 mm allowed for bars ≤ 12 mm in mild exposure only) and fire Table 16A (columns: 40 mm for 0.5 h to 4 h ratings). Net: 40 mm nominal cover for columns in mild/moderate exposure; 45/50/75 for severe/very severe/extreme. | IS 456 26.4.2.1, 26.4.2 Table 16, 26.4.3 Table 16A |
| C-L10 | Bars in more than one row (inner row) | Inner-row bars need lateral support only if the outer row is tied per 26.5.3.2 and no inner bar is closer to the nearest compression face than 3 × (largest inner-row Ø) (Fig 10). The Detailer should avoid inner rows entirely unless p > 4 % forces it. | IS 456 26.5.3.2(b)(3), Fig 10 |
| C-L11 | Bundled bars | Up to 4 bars in a bundle (IS 456 26.1.3? **(verify)**); ties per Fig 11; laps of bundled bars staggered within the bundle. Office: bundles only on owner approval (F-12). | IS 456 26.3.1 / 26.5.3.2(b)(4), Fig 11 |

### A2. Longitudinal reinforcement – IS 13920:2016 additions (ductile columns)

| ID | Rule | Value | Clause |
|----|------|-------|--------|
| C-D1 | Minimum column dimension | ≥ 20 × largest beam longitudinal bar Ø passing through the joint, and ≥ 300 mm. (1993 edition: 200 mm, 300 mm if beam span > 5 m / unsupported length > 4 m.) | IS 13920:2016 7.1.1 |
| C-D2 | Aspect ratio | shorter/longer lateral dimension ≥ 0.45 **(verify value; 2016 text)** | IS 13920:2016 7.1.2 |
| C-D3 | Circular columns | min 6 bars (consistent with IS 456) | IS 13920:2016 7.3.1 **(verify)** |
| C-D4 | T, X, + (and by extension L, C) shaped columns in the lateral-load-resisting system | Amendment 1 (2017) added a note that such columns are outside the standard and need specialist literature. **[Calc-verified]**. Detailer rule: if `IsLateralSystem && !IsRectangularOrCircular` → emit WARNING "Amd 1 note – specialist detailing required; defaulting to rectangular-sub-part hoop scheme" and tag the column on the drawing. | IS 13920:2016 Amd 1, note under 7.1 **(verify exact location)** |
| C-D5 | Lap splice location | Only in the **central half** of the clear height. Proportion as a *tension* splice. | IS 13920:2016 7.3.2 |
| C-D6 | Hoops over the lap | Closed hoops over the full lap length at spacing ≤ **100 mm** c/c (2016). 1993 edition: ≤ 150 mm. Use 100 unless BIS copy shows otherwise **(verify 100 vs 150 in 2016 text)**. | IS 13920:2016 7.3.2 |
| C-D7 | Bars spliced at a section | Not more than 50 % of bars at any one section. Hence the Detailer must stagger laps in two groups, the second group shifted by ≥ 1.3 × lap length (IS 456 26.2.5.1(c) definition of "staggered") — this forces the lap zone to be ≥ 2.3 Ld long and it still must sit inside the central half: a check `2.3·Llap ≤ hc/2` is needed; if it fails, mechanical couplers / welded splices are the only option (IS 13920 7.3.3/7.3.4). | IS 13920:2016 7.3.2; IS 456 26.2.5.1(c) |
| C-D8 | Welded / mechanical splices | Welded splices only in central half; mechanical couplers per IS 16172 (Amd 1 reference) allowed anywhere except within l0? **(verify — 2016 7.3.3/7.3.4; 1993 had "mechanical splices only outside l0" rule)** | IS 13920:2016 7.3.3, 7.3.4 |
| C-D9 | Strong-column/weak-beam (ΣMc ≥ 1.4 ΣMb) | OUT OF SCOPE for the Detailer — a design check in the Calculator. The Detailer only consumes the resulting As. | IS 13920:2016 7.2.1 |

### A3. Transverse reinforcement – IS 456 (all columns)

| ID | Rule | Value | Clause |
|----|------|-------|--------|
| C-T1 | Tie diameter | ≥ ¼ × largest longitudinal bar Ø, and ≥ 6 mm. With Ø25 → 8 mm; Ø32 → 8 mm; Ø36 → 10 mm (round up to next available: 8, 10, 12). Office: minimum 8 mm for all columns (F-7). | IS 456 26.5.3.2(c)(2) |
| C-T2 | Tie pitch | ≤ min(least lateral dimension, 16 × smallest longitudinal Ø, 300 mm) | IS 456 26.5.3.2(c)(1) |
| C-T3 | Which bars need lateral support — basic rule | Every corner bar and every alternate bar must be supported by the corner of a tie having an included angle ≤ 135°; no bar may be more than **150 mm clear** from such a laterally supported bar. | IS 456 26.5.3.2(b) lead-in text + (b)(1) |
| C-T4 | Bars ≤ 75 mm apart | If longitudinal bars are spaced ≤ 75 mm (clear) on either side, the tie needs to go round corner and alternate bars only (Fig 8). | IS 456 26.5.3.2(b)(1), Fig 8 |
| C-T5 | Bars effectively tied in two directions at ≤ 48 Øt | If bars spaced ≤ 48 × tie Ø are effectively tied in two directions, additional bars between them need be tied in one direction only by **open ties** (Fig 9). (With Øt = 8 → 384 mm; this is what permits a single-leg open tie/cross-tie on intermediate bars.) | IS 456 26.5.3.2(b)(2), Fig 9 |
| C-T6 | Helical reinforcement | pitch ≤ 75 mm, ≤ core Ø/6, ≥ 25 mm, ≥ 3 × helix bar Ø; helix bar Ø per C-T1. Ends: 1.5 extra turns. | IS 456 26.5.3.2(d) **(verify letter)**; 39.4.1 for 1.05 strength factor (design, not detailing) |
| C-T7 | Ties in beam–column joint (non-ductile) | IS 456 is silent; SP 34 recommends continuing column ties through the joint at the column pitch. Office rule: continue ties through joint at pitch of general zone (gravity) — see C-J for ductile. | SP 34 cl. 7.x **(verify)** |
| C-T8 | Tie hook type (non-ductile) | IS 456 only requires anchorage per IS 2502; SP 34 Fig shows 90° and 135° hooks. Office decision F-6: use 135° hooks everywhere (uniform BBS, no site confusion). | IS 456 26.2.2.1 / IS 2502; SP 34 |
| C-T9 | Tie splice / closing | Ties closed with hooks on both ends engaging a longitudinal bar; the hook location should alternate (rotate 90°/180°) from tie to tie along the height (SP 34 practice; IS 13920 7.4.1 Fig). | SP 34 **(verify)**; IS 13920 7.4.1 Fig 7/8 |

### A4. Transverse reinforcement – IS 13920:2016 (ductile columns)

| ID | Rule | Value | Clause |
|----|------|-------|--------|
| C-H1 | Hoop definition | Closed stirrup with **135° hooks** at both ends, hook extension **10 Øt but ≥ 75 mm**, hooks engaging peripheral longitudinal bars. (1993: "10 d, min 75 mm" — unchanged in substance.) **[Calc-verified in substance]** | IS 13920:2016 7.4.1 (with Fig) |
| C-H2 | Minimum hoop diameter (ductile) | **8 mm** — in 2016 the beam clause 6.3.2 states "minimum 8 mm" (1993 said 6 mm, 8 mm for spans > 5 m) and the column clause refers to hoops; office rule is 8 mm regardless. **(verify whether 7.4.x explicitly states 8 mm for columns, or whether it is inherited from 6.3.2)** | IS 13920:2016 6.3.2, 7.4.1 |
| C-H3 | Hoop leg spacing / cross-ties | Parallel legs of a rectangular hoop ≤ **300 mm** c/c. If any side of the hoop exceeds 300 mm, a **cross-tie** shall be provided; alternatively a pair of overlapping hoops. Cross-ties have 135° hooks at both ends (2016; the 1993 edition permitted a 90° hook at one end — **Amd 1 / 2016 made both ends 135°; verify**), hooks engage peripheral longitudinal bars, and consecutive cross-ties alternate their position (Fig 9). | IS 13920:2016 7.4.2, Fig 9 |
| C-H4 | Cross-tie leg spacing for Ash computation | The dimension `h` in the Ash formula is the c/c spacing of the hoop/cross-tie legs perpendicular to the direction considered and **h ≤ 300 mm** — practically forces cross-ties at ≤ 300 mm and governs the bar grid. | IS 13920:2016 7.6.1(a), note defining h |
| C-H5 | Hoop spacing outside the confining zone (mid-height) | ≤ **half the least lateral dimension** of the column (and IS 456 C-T2 still applies: ≤ 16 Ø, ≤ 300). | IS 13920:2016 7.4.2 **(verify sub-clause; 1993 was 7.3.3)** |
| C-H6 | Special confining zone length l0 | l0 ≥ max(D (larger lateral dimension), **hc/6** (clear height / 6), **450 mm**), measured from the face of the joint (top and bottom of each storey). | IS 13920:2016 8.1 |
| C-H7 | Confining hoop spacing in l0 | ≤ min(**B/4**, **6 × smallest longitudinal Ø**, **100 mm**). The 1993 edition had "need not be less than 75 mm nor more than 100 mm" — the 75 mm lower bound is **not** a code requirement in 2016 but remains the office constructability floor (F-9). **[Calc-verified: min(b/4, 6Ø, 100)]** | IS 13920:2016 8.1 (spacing sentence) |
| C-H8 | Ash — rectangular hoops | Ash = 0.18 · Sv · h · (fck/fy) · (Ag/Ak − 1) and ≥ 0.05 · Sv · h · (fck/fy). Ash = total area of hoop legs crossing the section in that direction, within spacing Sv; h ≤ 300 (C-H4); Ak = core area to the *outer* face of hoops; Ag = gross area. Compute in both directions. | IS 13920:2016 7.6.1(a) |
| C-H9 | Ash — circular / spiral | Ash (area of spiral or circular hoop bar) = 0.09 · Sv · Dk · (fck/fy) · (Ag/Ak − 1) and ≥ **0.024** · Sv · Dk · (fck/fy); Dk = core diameter to outer face of spiral. **[Calc-verified: 0.024 term]** | IS 13920:2016 7.6.1(b)/(c) |
| C-H10 | Where special confining reinforcement applies — full height | (a) point of contraflexure not within the middle half of the clear height (Mtop/Mbot check, from ETABS) → full height; (b) columns supporting discontinued stiff members (walls, trusses) → full height and extended into the discontinued member for ≥ Ld; (c) columns with unsupported length reduced by infill/parapet (short column) → full height; (d) column terminating into a footing/mat → confining reinforcement extended ≥ **300 mm** into the footing. | IS 13920:2016 8.2, 8.3, 8.4, 8.5 **(verify numbering; all four provisions exist)** |
| C-H11 | Confining reinforcement through the joint | Special confining reinforcement (C-H7/C-H8) continues through the joint. Where the joint is confined by beams on all four faces, each beam width ≥ ¾ column width, the hoops may be at **half** the C-H8 area with spacing ≤ **150 mm**. **(verify "half the area" vs "spacing 150" wording in 2016 cl. 9.x; 1993 cl. 8.2)** | IS 13920:2016 9.3 (2016 numbering) **(verify)** |
| C-H12 | Joint shear strength / joint width | Design check (1.5/1.2/1.0 × Aej √fck) — OUT OF SCOPE for the Detailer; Detailer only needs the "four-side confined" flag from the model to choose C-H11. | IS 13920:2016 9.1, 9.2 |
| C-H13 | Lap zone hoops | C-D6 (≤ 100 mm). If the lap zone (central half) overlaps l0 (short columns, hc < 2·l0 + Llap), confining spacing governs everywhere and the column should be flagged "full height confinement — check 8.x". | IS 13920:2016 7.3.2, 8.1 |
| C-H14 | Hoops at column–beam joint face | First hoop at ≤ 50 mm from the joint face (beam rule 6.3.5 is "first hoop ≤ 50 mm from face"; for columns IS 13920 does not state it explicitly — office rule: first confining hoop at 50 mm from the slab/beam face top and bottom). **(verify whether 8.1 gives a first-hoop offset)** | IS 13920:2016 6.3.5 (by analogy) |

### A5. Laps, anchorage and bar continuity (all columns)

| ID | Rule | Value | Clause |
|----|------|-------|--------|
| C-S1 | Development length Ld | Ld = Ø · σs / (4 · τbd); σs = 0.87 fy; τbd from Table (plain bars) M20 1.2, M25 1.4, M30 1.5, M35 1.7, M40 1.9, M45 2.0, M50 2.1 (N/mm²; M55+ constant **(verify)**), × 1.6 for deformed bars; compression τbd × 1.25. Fe500 tension: M20 56.6Ø, M25 48.6Ø, M30 45.3Ø, M35 40.0Ø, M40 35.8Ø; compression: 0.8 × those (M25 38.9Ø, M30 36.3Ø). | IS 456 26.2.1, 26.2.1.1 |
| C-S2 | Office lap table (Fe500) | ≤ M25: 50Ø; M30: 46Ø; M35: 40Ø; M40+: 36Ø; never below IS 456 value. **[Calc-verified]** This is a tension lap (≥ Ld, 30Ø) → also satisfies compression laps (≥ 0.8 Ld, 24Ø). The Detailer uses the office table for ALL column laps (gravity too) so that the lap is the same whether or not ductile; IS 13920 7.3.2 requires a tension splice in any case. | IS 456 26.2.5.1(c); office |
| C-S3 | Lap-length multipliers | × 1.4 when the lapped bar is (1) at the top of the section as cast with cover < 2Ø, or (2) at a corner with cover < 2Ø to either face **or** clear distance between adjacent laps < max(75 mm, 6Ø); × 2.0 when both apply. For columns: corner bars with 40 mm cover and Ø ≥ 20 → cover < 2Ø → factor 1.4 applies to corner bars! Office practice usually ignores this for columns because bars are in compression under gravity; IS 13920 "proportioned as tension splice" strictly re-opens it. → Open Question F-10. The module must expose `CornerLapFactor` as a setting with default per the owner's answer. | IS 456 26.2.5.1(c) |
| C-S4 | Minimum lap / straight length | Lap ≥ 15Ø and ≥ 200 mm; no lap for Ø > 36 mm (use couplers/weld). | IS 456 26.2.5.1 (a), (c) |
| C-S5 | Lap of different diameters | Lap length based on the **smaller** diameter. | IS 456 26.2.5.1(e) **(verify letter)** |
| C-S6 | Staggering definition | Laps are "staggered" if c/c distance between splices ≥ 1.3 × lap length. | IS 456 26.2.5.1(c) |
| C-S7 | Lap location — gravity columns | IS 456 is silent; SP 34 convention: lap starts just above the floor/slab level (kicker), all bars at one level. Office-selectable: `LapLocation = AboveFloor | MidHeight` (gravity) — ductile always `CentralHalf`. | SP 34 Section 7 **(verify)** |
| C-S8 | Percentage of bars lapped (gravity) | IS 456 has no 50 % rule for compression laps; the 50 % rule is from IS 13920 7.3.2. Office rule: gravity columns may lap 100 % at one level when p_lapzone = 2p ≤ 6 %; otherwise stagger. | IS 456 26.2.5.1 (silent); IS 13920 7.3.2 |
| C-S9 | Cranked (offset) bars at a change of column size | IS 456 is silent; adopt SP 34 / ACI practice: offset slope ≤ **1 in 6**; crank formed below the floor within the column below (so the upper column bar is straight), with extra ties at the bend to resist 1.5 × the horizontal component of the bar force, placed within 150 mm of the bend; if offset > **75 mm** use separate straight dowels lapped instead of a crank. In ductile columns crank the bars only within the lap zone (central half) of the lower column, never in l0. | SP 34 cl. 7.x **(verify)**; ACI 318 10.7.4 (reference only) |
| C-S10 | Column size reduction — dowel option | When the upper column is smaller on one or more faces by > 75 mm, terminate the lower bars 75 mm below the slab top (or Ld into the joint) and start upper bars as dowels anchored Ld (compression) into the lower column + lap with the upper bars. | SP 34; IS 456 26.2.1 |
| C-S11 | Bar termination at roof / top of column | Longitudinal bars anchored into the beam/slab with Ld (tension for ductile columns in the top joint, per IS 13920 9.x / 6.2.5 analogy) — bars bent 90° into the beam, horizontal leg ≥ Ld − straight portion; cover rules at the bend. | IS 456 26.2.1; IS 13920 9.x **(verify)** |
| C-S12 | Starter bars at foundation | Column bars (or starters) embedded with Ld (compression for gravity; tension for ductile) + 90° bend resting on the footing mat, min bend leg 300 mm / ≥ 16Ø; confining hoops ≥ 300 mm into footing for ductile (C-H10(d)). | IS 456 34.4.1 / 26.2.1; IS 13920 8.x |
| C-S13 | Number of ties within lap zone (gravity) | IS 456: pitch per C-T2 over the lap; office practice: tighten to ≤ 100–150 mm over laps for concreting/bar stability. Expose as `GravityLapTieSpacing` (default 150). | SP 34 **(verify)** |

### A6. Zone layout along a storey (what the elevation shows)

For each column storey segment from top of the slab below (level z0) to soffit of the beam/slab above (z1), with clear height hc = z1 − z0 (take the shallower beam if beams differ; conservative: deepest beam soffit → larger hc **(decide: F-11)**):

Ductile column:
1. Joint zone (within beam depth, above z1): hoops per C-H11.
2. Bottom confining zone: z0 → z0 + l0; spacing s_conf (C-H7), Ash (C-H8/9).
3. Lap zone: must lie within [z0 + hc/4, z1 − hc/4]; hoops ≤ 100 mm (C-D6). First lap group starts at z0 + hc/4 (or just above l0, whichever is higher); second group starts 1.3·Llap later. Check end of lap zone ≤ z1 − hc/4 and ≤ z1 − l0.
4. Mid zone (remaining): s_mid = min(B/2, 16Ø, 300) (C-H5, C-T2), rounded down to office module (F-8).
5. Top confining zone: z1 − l0 → z1.
If (2·l0 + 2.3·Llap) > hc then lap and confining zones overlap → use s_conf throughout, flag column.

Gravity column:
1. Lap zone just above z0 (kicker height 75–150 mm then lap starts) or at mid-height per `LapLocation`; ties at `GravityLapTieSpacing`.
2. General zone: s = min(B, 16Ø, 300) rounded to module.
3. Joint: ties continued at s (C-T7).

---------------------------------------------------------------------
## B. SHEAR WALLS (SPECIAL SHEAR WALLS, IS 13920:2016 cl. 10; ordinary walls IS 456 cl. 32)
---------------------------------------------------------------------

### B0. Input split (what ETABS / SBC Calculator gives vs. what the rules module computes)

From ETABS / SBC Calculator (per pier, per storey, per design combination envelope):
- Pier geometry label, storey, pier forces Pu, Mu2, Mu3, Vu (envelope) — used only for information and for the stress-trigger if the BE flag is not supplied.
- As_vertical required per unit length for the web (mm²/m per face or total), or ρv.
- As_horizontal required per unit length (from shear design: Av/s), or ρh.
- Boundary-element required flag per end, BE length lbe (from ETABS "pier section" or from 0.2 fck stress check), BE As_required (or ρ_be), BE confinement required flag.
- Ductile flag (special shear wall yes/no), fck, fy, seismic zone, ductility class.
- Coupling beam data (ignored; out of scope, see B6).
From CAD: wall polygon (plan), thickness(es), openings (plan + elevation extents), storey heights, connected columns/walls.
Rules module computes: curtains (1/2), bar diameter and spacing each way, end/boundary element bar layout and links (as a column: Section A rules), horizontal-bar anchorage (U-bar / hook) at free ends and at BE cores, laps (location, length, stagger), extra bars at openings, corner/junction detailing for L/C/T walls, zone layout along height.

### B1. Geometry and minimum provisions

| ID | Rule | Value | Clause |
|----|------|-------|--------|
| W-G1 | Minimum thickness | ≥ **150 mm** (to avoid slender walls / allow two curtains); coupled shear walls ≥ 200 mm **(verify 200 for coupled walls)**; the 1993 code said "preferably ≥ 150 mm". | IS 13920:2016 10.1.1 (and 10.1.2?) **(verify sub-clause)** |
| W-G2 | Effective flange width (flanged walls) | Projecting flange counted up to the lesser of ½ distance to adjacent web and 1/10 of the total wall height (design only; the Detailer treats the whole polygon as one section anyway). | IS 13920:2016 10.1.3 **(verify)** |
| W-G3 | Thickness in boundary-element region | 2016 text: boundary elements may have the same thickness as the wall; some practitioners read Amd 1 as requiring ≥ 300 mm in BE — I am **not certain** any such limit exists in the Indian code (it is in ACI/NZ practice). **(verify)** | IS 13920:2016 10.4.x **(verify)** |

### B2. Web reinforcement (both directions)

| ID | Rule | Value | Clause |
|----|------|-------|--------|
| W-R1 | Minimum reinforcement | ≥ **0.25 %** of gross area in **each** direction (vertical and horizontal), uniformly distributed. | IS 13920:2016 10.1.4 |
| W-R2 | Two curtains required when | tw > **200 mm**, or factored shear stress τv = Vu/(tw · dw) > **0.25 √fck** (dw = 0.8 lw per 10.2.x). Office: always two curtains for tw ≥ 200 (F-13). | IS 13920:2016 10.1.5 **(verify number)** |
| W-R3 | Maximum bar diameter in web | ≤ **tw/10** | IS 13920:2016 10.1.6 **(verify number)** |
| W-R4 | Maximum spacing (both directions) | ≤ min(**lw/5**, **3 tw**, **450 mm**) | IS 13920:2016 10.1.7 **(verify number)** |
| W-R5 | Vertical ratio vs horizontal ratio | Vertical reinforcement ratio shall be ≥ horizontal ratio (for walls with hw/lw ≤ 2 this governs; 2016 text states it generally **(verify)**) | IS 13920:2016 10.2.x **(verify)** |
| W-R6 | Horizontal shear reinforcement | ρh from shear design (Calculator; τc per IS 456 Table 19 with p = ρv, Vus = 0.87 fy Ah dw / Sv). Detailer only converts Ah/Sv into bars. | IS 13920:2016 10.2.3 **(verify)**; IS 456 40.4 |
| W-R7 | Ordinary (non-ductile, IS 456) walls | Vertical: ≥ 0.12 % (deformed ≤ 16 mm, fy ≥ 415) / 0.15 % (others); horizontal ≥ 0.20 % / 0.25 %; two layers if tw > 200; bar Ø ≤ tw/8; spacing ≤ min(3 tw, 450). The Detailer selects this table when `IsDuctile == false`. | IS 456 32.5 (a)–(d) |
| W-R8 | Cover to wall bars | Table 16 by exposure (20 mild… 30 moderate) subject to fire Table 16A for walls **(verify: walls not listed separately; use "load-bearing wall" 0.5–4 h: 20–35? mm)**; office: 25 mm internal, 30 mm external/moderate, 40 mm where the wall also acts as a column (BE). | IS 456 26.4.2, 26.4.3 |

### B3. Boundary elements (BE)

| ID | Rule | Value | Clause |
|----|------|-------|--------|
| W-B1 | Trigger | BE required where the extreme-fibre compressive stress under factored gravity + factored lateral (elastic, gross section) exceeds **0.2 fck**; BE may be discontinued above the level where the stress drops below **0.15 fck**. Supplied by ETABS/Calculator as a flag per end per storey; the Detailer does not re-check. | IS 13920:2016 10.4.1 |
| W-B2 | BE extent (length along wall) | The portion of wall where stress > 0.2 fck (from the neutral-axis / stress diagram), or the ETABS pier-section BE length; Detailer rounds up to a bar-spacing module and ≥ 1.5 tw? — IS 13920:2016 does not give an explicit minimum; ACI uses max(c − 0.1 lw, c/2). **(verify whether 10.4.x gives an explicit BE length rule; if not, owner decision F-14)** | IS 13920:2016 10.4.1 |
| W-B3 | BE vertical reinforcement | ≥ **0.8 %** and ≤ **6 %** of the BE gross area; practical upper limit **4 %** (lap congestion). | IS 13920:2016 10.4.3 **(verify number)** |
| W-B4 | BE confinement | Special confining reinforcement per 7.6 (C-H7/C-H8 spacing and Ash) throughout the full height of the BE where W-B1 is triggered; where BE is not required by stress, still provide ≥ nominal column ties? In 2016 a provision says that where the gravity load is ≥ 0.1 fck Ag, BE must be detailed with confinement over the full height **(verify)**. | IS 13920:2016 10.4.4 **(verify)** |
| W-B5 | BE as a column | Detail each BE exactly as a column (Section A, ductile): min 4 bars (practically ≥ 6 for a 2-curtain wall with bars on both faces), bar Ø ≥ 12, ties ≥ 8 mm, 135° hooks, cross-ties so every bar is within 150 mm clear of a supported bar and h ≤ 300. The web vertical bars adjacent to the BE continue into it as part of the BE steel only if counted in the design; otherwise they stop at the BE face and the BE has its own bars. | IS 13920:2016 10.4.x referring to 7.6 |
| W-B6 | Concentrated vertical bars at wall ends without BE | Office/SP 34 practice: ≥ **4 bars of 12 mm** in two layers at each end of every wall, tied with links at ≤ web spacing; some read IS 13920:2016 10.1.x as requiring this **(verify whether a code clause exists; 1993 cl. 9.1.? had it)**. | IS 13920:2016 10.1.x **(verify)**; SP 34 |
| W-B7 | BE axial load check (BE must carry Pu + Mu/(lw − lbe) etc.) | Design check — OUT OF SCOPE (Calculator). | IS 13920:2016 10.4.2 |

### B4. Openings, junctions, flanged walls

| ID | Rule | Value | Clause |
|----|------|-------|--------|
| W-O1 | Reinforcement around openings | Where openings interrupt reinforcement, provide bars each side (vertical and horizontal) equal in area to the interrupted bars, extending ≥ Ld beyond the opening edges; office minimum 2-T12 each side each face + 2-T12 diagonals at corners (SP 34). Also: an opening is "small" and ignorable only if it does not interrupt more than the office threshold (e.g. < 300 mm) — owner decision. | IS 13920:2016 10.6.1 **(verify numbering)**; SP 34 |
| W-O2 | Shear across openings | Design item (Calculator): shear strength of piers between openings. Out of scope. | IS 13920:2016 10.6.2 **(verify)** |
| W-O3 | Flanged / L / C / T walls | Treat the polygon as one section for bar placement; the flange–web junction corner is a re-entrant corner handled by the Section C algorithm (corner bar on both faces, horizontal bars of each leg lapped/anchored into the other leg with Ld, U-bars at free ends). BE at the junction when triggered by the stress check for that fibre. | IS 13920:2016 10.1.3, 10.4.1; SP 34 |
| W-O4 | Wall–column junction (column embedded in / adjacent to wall) | The column is detailed as a column (Section A); wall horizontal bars are anchored into the column core with Ld (straight if it fits, else 90° bend ≥ Ld total with ≥ 150 mm? leg) — same as W-A1 "anchored in confined core of BE". Column and wall vertical bars are separate marks. | IS 13920:2016 10.9.x **(verify)** |
| W-O5 | Coupling beams | OUT OF SCOPE for the Detailer v1 (diagonal reinforcement rules 10.5.x differ entirely); emit "coupling beam — not detailed" where two piers share a lintel-type beam. | IS 13920:2016 10.5 |
| W-O6 | Discontinued walls (wall on columns) | Columns supporting the wall get full-height confinement (C-H10(b)); the wall base bars anchor into the column/transfer beam with Ld tension. | IS 13920:2016 10.7, 8.x **(verify)** |

### B5. Anchorage, splices and construction joints

| ID | Rule | Value | Clause |
|----|------|-------|--------|
| W-A1 | Horizontal bar anchorage | Horizontal bars shall be anchored near the edges of the wall or in the confined core of boundary elements; at free ends use U-bars (same Ø and spacing as horizontal bars, legs ≥ Ld tension? ≥ lap length) or 135°/180° hooks engaging the end vertical bars; office standard: **U-bar lapped Ld with the horizontal bars**, which also provides the BE perimeter tie if the leg length ≥ BE length. | IS 13920:2016 10.9.1 **(verify)** |
| W-A2 | Vertical bar laps | Lap ≥ Ld tension (office table C-S2); laps staggered: not more than **1/3** of bars spliced at any section (2016; **verify 1/3 vs 1/2**), adjacent splices staggered ≥ **600 mm** **(verify)**; avoid laps in the plastic-hinge region at the base (≥ max(lw, hw/6) above base — **verify this value exists in 10.x**). For practical work: web vertical bars lapped above every floor in two alternating groups, the second group offset by max(1.3 Llap, 600). BE bars: as column laps (central half, 50 %) — note the **conflict between 1/3 (wall) and 1/2 (column)**; use the stricter for BE bars in walls (owner decision F-15). | IS 13920:2016 10.9.2–10.9.4 **(verify)** |
| W-A3 | Horizontal bar laps | Lap ≥ Ld tension; stagger alternate bars; laps not at the same vertical line in adjacent bars; lap away from BE where possible. | IS 13920:2016 10.9.x; IS 456 26.2.5 |
| W-A4 | Development of vertical bars at base / into foundation | Ld tension with 90° bend onto the footing/raft; confining reinforcement of BE extends ≥ 300 mm into the foundation (C-H10(d) analogy; **verify 10.x states this**). | IS 13920:2016 10.9.x / 8.x |
| W-A5 | Construction joints | Vertical reinforcement across a horizontal construction joint ≥ (0.92/fy)·(τv − Pu/Ag) ≥ 0.25 %? — a design check (Calculator) **(verify formula location 10.8)**; Detailer: no special action beyond not lapping all bars at the joint. | IS 13920:2016 10.8 |
| W-A6 | Lap of horizontal bars in BE core | Horizontal bars may be lapped inside the BE core (the confinement makes it the best lap location). | IS 13920:2016 10.9.1 note **(verify)** |

### B6. Zone layout along the wall height
Per storey: base of wall at slab top (z0), top at soffit (z1). Elevation content:
1. Web vertical bars: spacing/dia constant per storey; laps as W-A2 (two groups) starting at z0 + kicker.
2. Web horizontal bars: spacing/dia constant per storey; first bar at ≤ s/2 from slab; continuous through BE as the BE outer tie or terminated with U-bars.
3. BE links: s_conf full height where BE triggered (W-B4); otherwise ties at min(16Ø, tw? B, 300, web spacing) with 135° hooks.
4. Openings: extra bars (W-O1) shown in elevation with Ld extensions dimensioned.

---------------------------------------------------------------------
## C. GEOMETRY-DRIVEN ARRANGEMENT ALGORITHM (code-independent)
---------------------------------------------------------------------

Design goal: one algorithm operating on a plan polygon P (CCW, mm), cover c, tie Ø t, that produces (i) perimeter tie path, (ii) bar positions, (iii) tie/cross-tie legs, (iv) a validated result; the *limits* (s_max, 150 clear, 300 leg spacing, min/max %, etc.) are injected from the rule set (Section E), never hard-coded here.

### C1. Data model (no CAD types)
```
record Pt(double X, double Y);
record Polygon(IReadOnlyList<Pt> Verts);        // CCW, closed, no self-intersection
record Bar(Pt Centre, int Dia, string Mark, bool IsCorner, bool IsSupported);
record TieLeg(Pt A, Pt B, int Dia, bool IsPerimeterSegment);
record Hoop(IReadOnlyList<Pt> Path, int Dia, HookType Hooks, bool Closed);
record CrossTie(Pt A, Pt B, int Dia, HookType HookA, HookType HookB);
record SectionArrangement(IReadOnlyList<Bar> Bars, IReadOnlyList<Hoop> Hoops, IReadOnlyList<CrossTie> CrossTies, ArrangementDiagnostics Diag);
record ArrangementLimits(double SMaxPeriphery, double MaxClearToSupported, double MaxLegSpacing,
                         double MinClear, double MinPct, double MaxPct, double WarnPct,
                         double HookExtMultiplier, double HookExtMin, double BendRadiusMultiplier);
```

### C2. Section classification
```
Classify(P):
  n = vertex count after removing collinear vertices (|cross| < eps)
  if n == 4 and all angles ≈ 90°            -> Rectangular
  if P is a circle (CAD circle / ≥16 verts equal radius) -> Circular
  reentrant = vertices with interior angle > 180° (cross product sign ≠ polygon orientation)
  if reentrant.Count == 1 and n == 6         -> L
  if reentrant.Count == 2 and n == 8         -> T or C  (T: reentrants on a common edge direction with a stem; C: both reentrants face same way, open side)
  if reentrant.Count == 4 and n == 12        -> Plus
  else                                        -> Irregular
```

### C3. Perimeter tie path (offset polygon)
```
TiePath(P, c, t):
  d = c + t/2                                 // centre-line of tie
  Q = OffsetInward(P, d)                      // for each edge, move inward by d along its normal; intersect consecutive offset lines (miter). For re-entrant vertices, miter is still correct (vertex moves outward along the bisector).
  // Robustness: if any offset edge reverses direction (length < 0) the section is too thin -> error E-THIN ("section limb thinner than 2(c+t)+Ø").
  return Q
BarLine(P, c, t, Ø) = OffsetInward(P, c + t + Ø/2)   // centre-line of longitudinal bars
```
For circular sections TiePath is a circle of radius R − c − t/2.

### C4. Corner bars
```
CornerBars(Qb = BarLine):
  for each vertex v of Qb: place Bar(v, IsCorner = true, IsSupported = true)
```
Every vertex, convex or re-entrant, gets a bar (C-L4 interpretation). A re-entrant corner bar is supported by the two hoop legs meeting there (in the sub-hoop scheme of C8 it sits at the overlap of two hoops — always a hoop corner → supported).

### C5. Edge bar distribution
```
DistributeEdge(a, b, s_max, Ø, minClear):
  L = |b − a|                                 // c/c between corner bars along the bar line
  nSeg = ceil(L / s_max)                      // s_max = min(300 c/c (C-L7), limit from support rule)
  s = L / nSeg
  if s − Ø < minClear -> return INFEASIBLE(edge)
  bars = [ a + k·(b−a)/nSeg for k = 1..nSeg−1 ]
```
Support rule interplay: with corner bars supported and "every alternate bar supported", an intermediate unsupported bar is ≤ 150 clear from its supported neighbour if s − Ø ≤ 150 → s ≤ 150 + Ø. If instead every intermediate bar is tied (cross-tie each), s_max = 300 c/c. The selector decides per edge: `EdgeMode = AlternateTied (s ≤ 150+Ø, cross-tie on alternate bars) | AllTied (s ≤ 300, cross-tie each bar)`; in ductile columns the Ash h ≤ 300 rule (C-H4) additionally forces tied legs ≤ 300 c/c which coincides with AllTied at s ≤ 300.

### C6. Bar count / diameter selection
Inputs: As_req (mm²), optional (nBars_req, Ø_req) from the calculator (if the calculator already picked, honour it unless geometry forbids), preferred diameters D = [12,16,20,25,32], symmetry requirement, max two diameters, max bar count by geometry (from C5 with minClear), min bars by shape.
```
SelectBars(P, As_req, limits):
  candidates = []
  for Ø1 in D:
    for n in feasible counts (n ≥ nMin(shape), n ≤ nMax(Ø1), n respects parity/symmetry — see below):
      As = n·π·Ø1²/4
      if As ≥ As_req and pct(As) ≤ MaxPct: candidates.add(single(Ø1,n))
    for Ø2 in D where Ø2 > Ø1 (two-dia option): corner bars Ø2 (4 or all vertex bars), edge bars Ø1, require Ø2 − Ø1 ≤ 1 step? (office: 20+16, 25+20, 32+25 OK; 32+16 not)
  score = w1·(As − As_req)/As_req + w2·(number of marks) + w3·(bar count) + w4·(Ø2 ≠ Ø1)
  pick lowest score; prefer fewer, larger bars; prefer single dia; prefer Ø ≥ 16 for columns in ductile frames (office F-1)
Parity/symmetry:
  Rectangular: bars per face nB (along B) and nD (along D) with corners shared: n = 2(nB + nD) − 4; symmetric about both axes automatically if each face is evenly divided. Office: equal bars on opposite faces always; (nB,nD) chosen so that face spacing ≤ s_max.
  Circular: n ≥ 6, even preferred, equal angular spacing.
  L/T/C/Irregular: symmetry about the section's own symmetry axes if any (T, C, Plus have one or two); else none required, but opposite legs of equal length get equal bars.
```
Then re-run C5 with the chosen Ø to get actual positions (bar count per edge is fixed by the chosen (nB, nD) pattern: positions are equal subdivision of each edge).

### C7. Lateral-support solver (which bars need a tie corner / cross-tie)
```
SolveSupport(bars, hoops, limits):
  mark Supported = bars at any hoop corner with included angle ≤ 135°
  repeat:
    for each unsupported bar b:
      if clearDistance(b, nearest Supported bar along the perimeter) ≤ MaxClearToSupported (150): continue   // OK, covered
      else: add CrossTie through b (perpendicular to the face, to the opposite face bar or to the opposite hoop leg), mark b Supported
  until no change
  // alternate-bar rule: additionally ensure that along every face, no two consecutive bars are both unsupported (IS 456 26.5.3.2(b) "alternate bar")
  for each face: for consecutive (b_i, b_{i+1}) both unsupported: add CrossTie at b_i (choose the one that gives better symmetry)
  // leg spacing rule (ductile): along each face, c/c distance between consecutive tied legs ≤ MaxLegSpacing (300)
  for each face: walk tied positions; where gap > MaxLegSpacing insert cross-tie at the bar nearest the gap midpoint
```
Cross-tie geometry:
- A cross-tie spans the full section between opposite faces (anchored around the peripheral bar on both faces); hooks 135° both ends (ductile) with extension max(10·t, 75) (C-H1); non-ductile: owner choice 135°/135° or 135°/90° (F-6).
- Where opposite face has no bar in line, the cross-tie engages the hoop leg (permitted by IS 456 Fig 9 "open ties") — flag as `EngagesHoopOnly` so the drawing note says "cross-tie to engage hoop".
- Consecutive cross-ties along the column height alternate ends (90°/135° alternation only where 90° allowed; for 135°/135° alternate the *bar* they engage).
- Prefer cross-ties in pairs symmetric about the section axes; count parity check: a face with an odd number of intermediate bars has a centre bar — tie it (symmetric); with even intermediate count tie alternate pairs symmetric about the face centre.

### C8. Re-entrant sections (L, T, C, Plus, irregular): hoop decomposition
```
DecomposeToRectangles(P):
  // Split along the extension of each edge adjacent to a re-entrant vertex, choose the partition with the fewest rectangles whose union = P (for L: 2, T: 2 or 3, C: 3, Plus: 3). Prefer partitions that make each rectangle's longer side ≤ 2.5 × shorter side (helps h ≤ 300) and that overlap at the re-entrant corner by ≥ one bar spacing so hoops share the corner bars.
  rects = partition(P)
  for each rect r: hoop_r = OffsetInward(r, c + t/2) clipped so that interior legs run along the bar line of the interior bars; its corners must coincide with bar positions -> if a rectangle corner lands between bars, snap the rectangle boundary to the nearest bar line (bars are placed first, then hoops are snapped).
  return hoops (each closed, 135° hooks), overlapping at the junction (IS 13920 7.4.2 "pair of overlapping hoops")
```
Then run C7 on the union: bars on the interior legs of two overlapping hoops are hoop corners → supported. Any limb longer than MaxLegSpacing between tied legs gets cross-ties per C7.
Rule C-D4 (Amd 1): when the column is in the lateral system and shape ∉ {Rect, Circ}, output `Warning W-SHAPE-AMD1` and still produce the decomposition result.

### C9. Circular sections
Bars at equal angle; tie = circular hoop (lap ≥ Ld? office: hoop closed with 135° hooks and 10t ≥ 75 extensions, or spiral per C-T6); no cross-ties required when all bars are on one ring (each bar is "supported" by curvature — IS 456 Fig does not require cross-ties for circular hoops; ductile Ash per C-H9).

### C10. Zone layout along height (column) — see A6; pseudocode
```
LayoutStorey(col, rules):
  hc = z1 − z0
  if ductile:
    l0 = max(D, hc/6, 450)
    sConf = floorToModule(min(B/4, 6·Ømin, 100), module)   // module 25 (F-8); floor ≥ 75 → if < 75 warn E-CONF-TIGHT
    sMid  = floorToModule(min(B/2, 16·Ømin, 300), module)
    sLap  = min(100, sConf? no: sLap = min(100, sMid)) ; if lap overlaps l0 use sConf
    Llap  = officeLap(fck, Ø) × cornerFactor(F-10)
    lapStart = max(z0 + hc/4, z0 + l0)
    lapEnd   = lapStart + 2.3·Llap (50 % stagger) ; if lapEnd > min(z1 − hc/4, z1 − l0): flag E-LAP-NOFIT -> propose couplers
    zones = [ (z0, z0+l0, sConf, "Confining"), (z0+l0, lapStart, sMid, "Mid"), (lapStart, lapEnd, sLap, "Lap"), (lapEnd, z1−l0, sMid, "Mid"), (z1−l0, z1, sConf, "Confining"), (z1, z1+beamDepth, sJoint, "Joint") ]
    merge adjacent zones with equal spacing; drop zero-length zones
  else:
    s = floorToModule(min(B, 16·Ømin, 300), module)
    zones = [ (z0, z0+kicker+Llap, sLapGravity, "Lap"), (…, z1, s, "General"), (z1, z1+beamDepth, s, "Joint") ]
  numberOfTies per zone = ceil(length / s) (first tie at 50 mm from face)
```

### C11. Validation checks (run on every arrangement; each returns Pass/Warn/Fail + clause)
1. Clear spacing between adjacent bars ≥ max(Ø_larger, minClearOffice, agg + 5) [IS 456 26.3.2]; in lap zone, check with the lapped bar pair (2 bars side by side) — effective bar width 2Ø for the lapped bar [IS 456 26.2.5.1 congestion factor trigger; office].
2. Steel % within [MinPct, MaxPct]; warn > WarnPct (4 %); lap-zone % = p × (1 + fraction lapped) ≤ MaxPct [IS 456 26.5.3.1(a)].
3. Number of bars ≥ nMin by shape; bar Ø ≥ 12 [26.5.3.1(c),(d)].
4. Periphery c/c spacing ≤ 300 [26.5.3.1(g)].
5. Every bar supported or ≤ 150 clear from a supported bar; corner and alternate bars supported [26.5.3.2(b)].
6. Tie Ø ≥ max(Ø/4, 6) and ≥ office minimum 8 [26.5.3.2(c)(2)].
7. Tie pitch per zone ≤ limits (A3/A4); confining spacing ≥ 75 (constructability, warn) and ≤ 100.
8. Ductile: hoop leg spacing ≤ 300; Ash_provided ≥ Ash_req both directions (compute from legs crossing each direction × area / Sv) [13920 7.4.2, 7.6.1].
9. Hook extension ≥ max(10 t, 75); bend internal radius ≥ 2 t? (IS 2502: links of HYSD: ≥ 2Ø? **(verify; see D4)**).
10. Lap: length ≥ office table ≥ IS 456; lap inside central half (ductile); ≤ 50 % bars at a section; stagger ≥ 1.3 Llap; no laps for Ø > 36.
11. Crank: slope ≤ 1:6; offset ≤ 75 else dowels; no crank in l0 (ductile).
12. Bar count parity/symmetry (office).
13. Section limb thickness ≥ 2(c + t) + Ø + minClear (E-THIN).
14. Cover ≥ max(40, Ø, exposure, fire) for columns [26.4.2.1, Tables 16/16A].
15. Column dimension ≥ 300 and ≥ 20 × beam bar (ductile, informational — comes from the Calculator) [13920 7.1.1].
16. Two-diameter rule: at most two diameters per section; difference ≤ one preferred-list step.
17. Constructability: number of cross-ties per set ≤ office max (e.g. 6) else warn "congested"; total pieces per tie set reported.
18. Wall: bar Ø ≤ tw/10, spacing ≤ min(lw/5, 3tw, 450), ρ ≥ 0.25 % both ways, curtains per W-R2, BE checks as column checks 1–17.

---------------------------------------------------------------------
## D. DRAWING CONTENT STANDARD (checklist for a professional Indian office)
---------------------------------------------------------------------

D1. Column schedule (tabular, one row per column mark, one column-group per storey band)
- [ ] Column mark (C1, C2 …), grid reference(s), storey band ("Found. to GF", "GF to 3F" …) with levels.
- [ ] Section size B × D (mm) and orientation (sketch with B along X; orientation symbol/offset from grid).
- [ ] Longitudinal bars callout: "8-T20" or two-dia "4-T25 + 4-T20 (corners T25)"; T = Fe500 (office convention; IS 1786 grade stated in notes).
- [ ] Steel % (informative).
- [ ] Ties callout per zone: "T8@100 c/c (l0 = 600) / T8@150 c/c (mid) / T8@100 (lap)" — office style "T8@100/150".
- [ ] Section sketch at each storey band: bars as dots, hoops and cross-ties drawn (hoops as closed shapes with hooks drawn, cross-ties as lines with hooks), bar-mark labels, dimension B, D, cover note.
- [ ] Number of tie legs each direction (n_x, n_y) and Ash provided vs required (optional, for checking prints).
- [ ] Lap length table reference ("Lap = 50Ø for M25, see Note 4") or explicit Llap per column.
- [ ] Concrete grade per band (if grade changes with height).
- [ ] Ductile symbol / "DD" tag for IS 13920 columns; "G" for gravity.
- [ ] Remarks: coupler required, full-height confinement (8.x), Amd-1 shape warning, crank/dowel at size change.

D2. Column elevation (typical and special)
- [ ] Levels (slab top, beam soffit), clear height hc dimensioned.
- [ ] l0 zone dimensioned top and bottom with spacing and hoop count ("6-T8@100").
- [ ] Lap zone with start level (hc/4 line), Llap dimensioned, stagger (group A / group B) shown, hoop spacing in lap.
- [ ] Mid zone spacing; joint zone hoops ("hoops continued through joint @150").
- [ ] First hoop at 50 mm from face.
- [ ] Crank detail at size change (1:6, extra ties), dowel detail, termination at roof with bend/Ld.
- [ ] Starter bars at foundation: embedment, 90° bend leg, confinement 300 mm into footing.
- [ ] Bar marks on each bar group (e.g. C1-a, C1-b) tied to BBS.

D3. Link/tie details (typical detail sheet)
- [ ] Each hoop shape drawn with out-to-out dimensions (A × B), hook type 135°, hook extension "10d ≥ 75", bend radius note.
- [ ] Cross-tie: length, hooks each end, "alternate ends on consecutive sets".
- [ ] Overlapping hoop scheme for L/T/C columns (each hoop separate shape, numbering).
- [ ] Tie set table: pieces per set, total length per set.
- [ ] Typical hook geometry per IS 2502 / IS 13920 Fig: 135° hook, bend radius, extension.

D4. Hook/bend dimensions (for BBS and drawing)
- Bend internal radius: links/stirrups of HYSD bars ≥ 2 Øt? IS 456 26.2.2.1 → IS 2502: for mild steel 2Ø; for HYSD (Fe415/500) **4Ø** for main bars; for links many offices use 2Ø for Ø ≤ 10 and 3Ø ≥ 12 **(verify IS 2502 Table for links; SP 34 Table 4)**.
- 135° hook total added length (for cutting length): ≈ (π·(r + Ø/2)·135/360) + extension − (r + Ø) … implement exactly with r and Ø; the extension is max(10Ø, 75) [13920 7.4.1]. SP 34 approximate allowances: 90° bend 2Ø? / 135° hook 9Ø? / 180° hook 16Ø? **(verify; office may prefer its own BBS table)**.
- Main bar 90° bend at termination: horizontal leg ≥ 8Ø? anchorage value of 90° bend = 8Ø, 180° hook = 16Ø, bend r = 4Ø for HYSD [IS 456 26.2.2.1 **(verify values)**].

D5. Bending schedule shape codes (BBS, later phase)
- [ ] Adopt IS 2502 shapes; practical: use BS 8666:2005 codes internally (00 straight, 11 L, 21 U/C, 31 cranked, 51 closed link, 99 other) with a mapping to IS 2502 figure numbers (**verify IS 2502 numbering; IS 2502 uses lettered shapes A–?**) — owner decision F-16.
- [ ] Fields: mark, Ø, shape code, A/B/C/D/E dimensions, cutting length, number per member, number of members, total length, unit weight (IS 1786: 12 → 0.888, 16 → 1.578, 20 → 2.466, 25 → 3.853, 32 → 6.313, 8 → 0.395, 10 → 0.617 kg/m), total weight.

D6. Notes block (per drawing)
- [ ] Codes: IS 456:2000, IS 13920:2016 (+Amd 1/2017), IS 1893-1:2016, SP 34; seismic zone, R, ductility class.
- [ ] Concrete grade per element/level; steel Fe500D (ductile: IS 13920 5.3.1 **(verify)** requires Fe415/500D or ≤ Fe500 with UTS/YS ≥ 1.15? state as note).
- [ ] Nominal cover: columns 40, walls 25/30, footings 50 (per exposure); "cover is to the outermost steel (ties)".
- [ ] Lap table (office): ≤M25 50Ø, M30 46Ø, M35 40Ø, M40+ 36Ø; "laps in columns in central half, ≤ 50 % at a section, hoops @100 over lap".
- [ ] Hook rule: all hoops/ties 135° hooks with 10d ≥ 75 mm extension.
- [ ] Confining zone rule: "l0 = max(D, hc/6, 450)".
- [ ] "Bars > 32 mm not to be lapped — use couplers (IS 16172)".
- [ ] Aggregate size, kicker height, construction joint note.
- [ ] Legend of bar-mark syntax ("8-T20" = 8 bars of 20 mm Fe500).

D7. Wall elevation and section
- [ ] Section at each storey: tw, curtains, vertical bars "T12@150 c/c EF" (each face) and horizontal "T10@200 c/c EF", BE box with its bars and links, U-bars at ends, cover.
- [ ] Elevation: storey levels, laps (two groups, length), BE link zones, opening trimmer bars with Ld extensions, horizontal bar laps staggered.
- [ ] BE schedule (like column schedule) where BEs exist.
- [ ] Wall mark, length lw, flange relations (plan key).

---------------------------------------------------------------------
## E. CODE-RULE MODULE DESIGN (C#)
---------------------------------------------------------------------

E1. Principles
- Rules are pure functions over plain data (int/double/records); no CAD, no ETABS, no UI types. Deterministic; unit-testable with numbers from the code figures.
- Every numeric constant lives in one table (`CodeValues`) keyed by `RuleId`, with `Clause`, `Edition`, `Amendment`, `Value`, `Note`, `Verified` fields. Rule functions read constants by RuleId; they never embed numbers.
- Output of every rule is a `RuleResult` carrying the clause tag, so the UI/drawing can print "IS 13920:2016 cl. 8.1" beside any value, and the checker report can list clause by clause.
- The existing `SbcCalc\Engine\Is456.cs` single-source table (material properties, τbd, Ld, lap table, Table 16/16A cover, etc.) becomes the shared foundation: the Detailer must *reference* it (same assembly or a shared `Sbc.Codes` project extracted from SbcCalc), not copy it. Values that only the Detailer needs (hook extension, leg spacing, l0, lap location) are added to the same table family in a new `Is13920.cs` / `DetailingValues.cs` next to it. If SbcCalc cannot be referenced from the CAD plugin (different target framework), extract `Is456.cs` + new files into a netstandard2.0 class library `Sbc.Codes` consumed by both.

E2. Proposed structure
```
namespace Sbc.Codes
{
  public enum CodeEdition { IS456_2000_A6, IS13920_2016, IS13920_2016_A1, IS13920_2016_A2, SP34_1987 }
  public readonly record struct Clause(string Code, string Number, string Title, CodeEdition Edition, string Amendment = "");

  public sealed record CodeValue(string RuleId, Clause Clause, double Value, string Unit, string Note, bool Verified);

  public interface ICodeValueTable { CodeValue Get(string ruleId); IEnumerable<CodeValue> All { get; } }

  public sealed record RuleResult<T>(T Value, Clause Clause, string RuleId, Severity Severity = Severity.Info, string Message = "");

  public interface IColumnRules
  {
    RuleResult<double> MinSteelPct(ColumnInput c);                       // C-L1
    RuleResult<double> MaxSteelPct(ColumnInput c);                       // C-L2 (+ WarnPct)
    RuleResult<int>    MinBars(SectionShape s);                          // C-L4
    RuleResult<int>    MinBarDia();                                      // C-L5
    RuleResult<double> MaxPeripherySpacing();                            // C-L7
    RuleResult<double> MinClearSpacing(int dia, int aggregate);          // C-L8
    RuleResult<double> NominalCover(Exposure e, FireRating f, int dia, double leastDim); // C-L9
    RuleResult<int>    MinTieDia(int maxLongDia, bool ductile);          // C-T1 / C-H2
    RuleResult<double> TiePitchGeneral(double leastDim, int minLongDia); // C-T2
    RuleResult<double> TiePitchMid(double leastDim, int minLongDia);     // C-H5 ∩ C-T2
    RuleResult<double> MaxClearToSupportedBar();                         // C-T3 (150)
    RuleResult<double> MaxHoopLegSpacing();                              // C-H3 (300)
    RuleResult<double> ConfiningZoneLength(double D, double hc);         // C-H6
    RuleResult<double> ConfiningSpacing(double B, int minLongDia);       // C-H7
    RuleResult<double> AshRect(double sv, double h, double fck, double fy, double Ag, double Ak); // C-H8
    RuleResult<double> AshCirc(double sv, double Dk, double fck, double fy, double Ag, double Ak); // C-H9
    RuleResult<HookSpec> HoopHook(int tieDia, bool ductile);             // C-H1 / C-T8
    RuleResult<double> LapLength(int dia, double fck, LapKind kind, bool topBar, bool cornerCongested); // C-S1..S3 via Is456.LapTable
    RuleResult<double> LapHoopSpacing(bool ductile);                     // C-D6 / C-S13
    RuleResult<double> MaxLappedFraction(bool ductile);                  // C-D7 / C-S8
    RuleResult<(double from, double to)> LapWindow(double hc, bool ductile); // C-D5 / C-S7
    RuleResult<double> StaggerDistance(double lap);                      // C-S6
    RuleResult<CrankSpec> Crank(double offset);                          // C-S9/S10
    RuleResult<JointHoopSpec> JointHoops(bool confinedFourSides);        // C-H11
    RuleResult<bool>   FullHeightConfinement(ColumnInput c);             // C-H10
    IEnumerable<RuleResult<bool>> Validate(SectionArrangement a, ColumnInput c); // C11
  }

  public interface IWallRules
  {
    RuleResult<double> MinThickness(bool coupled);                        // W-G1
    RuleResult<double> MinReinfPct(Direction d, bool ductile, int dia);   // W-R1 / W-R7
    RuleResult<int>    Curtains(double tw, double tauV, double fck);      // W-R2
    RuleResult<int>    MaxBarDia(double tw, bool ductile);                // W-R3 / W-R7
    RuleResult<double> MaxSpacing(double lw, double tw, bool ductile);    // W-R4 / W-R7
    RuleResult<bool>   BoundaryElementRequired(double sigmaExtreme, double fck); // W-B1 (only when flag not supplied)
    RuleResult<(double min, double max, double warn)> BeSteelPct();       // W-B3
    RuleResult<double> HorizontalBarAnchorage(int dia, double fck);       // W-A1
    RuleResult<double> MaxLappedFraction();                               // W-A2 (1/3)
    RuleResult<double> LapStagger(double lap);                            // W-A2 (600 / 1.3 lap)
    RuleResult<OpeningReinfSpec> OpeningReinforcement(double interruptedAs, int dia, double fck); // W-O1
    IEnumerable<RuleResult<bool>> Validate(WallArrangement a, WallInput w);
  }

  public interface IRuleSet
  {
    CodeEdition Is456Edition { get; }
    CodeEdition Is13920Edition { get; }
    ICodeValueTable Values { get; }
    IColumnRules Columns { get; }
    IWallRules Walls { get; }
    OfficeSettings Office { get; }   // preferred dias, min tie dia 8, module 25, hook type, lap table, cover by exposure, corner lap factor flag…
  }
  // Implementations: RuleSet_IS456_2000_IS13920_2016A1 (default), RuleSet_IS456_Only (gravity-only project), and future RuleSet_IS13920_202x.
  // The arrangement algorithm (Section C) takes ArrangementLimits built from IRuleSet — it never calls the rules directly.
}
```
Office settings are separate from code values: `OfficeSettings` is JSON-loadable, versioned, and shown in the drawing notes block; code values are compiled and change only with a code revision.

E3. Rule → clause → value → amendment table (seed for `CodeValues`; `V` = verified in this session or by Calculator, `?` = verify)

| RuleId | Clause | Value | Edition / Amendment | V |
|---|---|---|---|---|
| COL.MIN_PCT | IS 456 26.5.3.1(a) | 0.8 % | 2000 | V |
| COL.MAX_PCT | IS 456 26.5.3.1(a) | 6 % | 2000 | V |
| COL.WARN_PCT | office / 26.5.3.1 note | 4 % | — | V |
| COL.PEDESTAL_MIN_PCT | IS 456 26.5.3.1(b) | 0.15 % | 2000 | ? letter |
| COL.MIN_BARS_RECT | IS 456 26.5.3.1(c) | 4 | 2000 | V |
| COL.MIN_BARS_CIRC | IS 456 26.5.3.1(c) | 6 | 2000 | V |
| COL.MIN_BAR_DIA | IS 456 26.5.3.1(d) | 12 mm | 2000 | V |
| COL.MAX_PERIPHERY_SPACING | IS 456 26.5.3.1(g) | 300 mm | 2000 | ? letter |
| BAR.MIN_CLEAR | IS 456 26.3.2 | max(Ø, agg+5) | 2000 | V |
| COV.COLUMN_MIN | IS 456 26.4.2.1 | 40 mm (25 for ≤200/≤12) | 2000 | V |
| COV.EXPOSURE | IS 456 Table 16 | 20/30/45/50/75 | 2000 | V |
| COV.FIRE_COLUMN | IS 456 Table 16A | 40 mm all ratings | 2000 | V |
| TIE.MIN_DIA_FRACTION | IS 456 26.5.3.2(c)(2) | Ø/4, ≥6 | 2000 | V |
| TIE.MIN_DIA_OFFICE | office | 8 mm | — | decision F-7 |
| TIE.PITCH | IS 456 26.5.3.2(c)(1) | min(B,16Ø,300) | 2000 | V |
| TIE.MAX_CLEAR_TO_SUPPORTED | IS 456 26.5.3.2(b) | 150 mm | 2000 | V |
| TIE.CLOSE_SPACED_LIMIT | IS 456 26.5.3.2(b)(1) | 75 mm | 2000 | V |
| TIE.TWO_WAY_TIED_LIMIT | IS 456 26.5.3.2(b)(2) | 48 Øt | 2000 | V |
| HELIX.PITCH | IS 456 26.5.3.2(d) | ≤75, ≤core/6, ≥25, ≥3Øh | 2000 | ? letter |
| DUCT.MIN_COL_DIM | IS 13920 7.1.1 | 300; 20×beam bar | 2016 (1993: 200) | V |
| DUCT.ASPECT | IS 13920 7.1.2 | 0.45 | 2016 | ? |
| DUCT.SHAPE_NOTE | IS 13920 Amd 1 | T/X/+ specialist | Amd 1 2017 | V (Calc) |
| DUCT.LAP_WINDOW | IS 13920 7.3.2 | central half | 2016 | V |
| DUCT.LAP_HOOP_SPACING | IS 13920 7.3.2 | 100 mm (1993: 150) | 2016 | ? |
| DUCT.LAP_MAX_FRACTION | IS 13920 7.3.2 | 50 % | 2016 | V |
| HOOP.HOOK_ANGLE | IS 13920 7.4.1 | 135° | 2016 | V |
| HOOP.HOOK_EXT | IS 13920 7.4.1 | 10Øt ≥ 75 | 2016 | V |
| HOOP.MIN_DIA | IS 13920 6.3.2 / 7.4.1 | 8 mm (1993: 6) | 2016 | ? |
| HOOP.MAX_LEG_SPACING | IS 13920 7.4.2 | 300 mm | 2016 | V |
| HOOP.MID_SPACING | IS 13920 7.4.2 | B/2 | 2016 | ? sub-clause |
| CONF.L0 | IS 13920 8.1 | max(D, hc/6, 450) | 2016 | V |
| CONF.SPACING | IS 13920 8.1 | min(B/4, 6Ø, 100) | 2016 (1993: ≥75 ≤100, B/4) | V (Calc) |
| CONF.SPACING_MIN_OFFICE | office (1993 8.1 legacy) | 75 mm | — | decision F-9 |
| CONF.ASH_RECT_K | IS 13920 7.6.1(a) | 0.18 / 0.05 | 2016 | V |
| CONF.ASH_H_MAX | IS 13920 7.6.1(a) | 300 mm | 2016 | V |
| CONF.ASH_CIRC_K | IS 13920 7.6.1(b)(c) | 0.09 / 0.024 | 2016 | V (Calc) |
| CONF.FOOTING_EXT | IS 13920 8.x | 300 mm | 2016 | ? number |
| JOINT.CONFINED_SPACING | IS 13920 9.3 | 150 mm, half Ash | 2016 | ? |
| JOINT.BEAM_WIDTH_FRACTION | IS 13920 9.3 | 3/4 | 2016 | ? |
| LD.TBD | IS 456 26.2.1.1 | table ×1.6 ×1.25 | 2000 | V (Is456.cs) |
| LAP.OFFICE_TABLE | office | 50/46/40/36 Ø | — | V (Calc) |
| LAP.FACTOR_TOP / CORNER / BOTH | IS 456 26.2.5.1(c) | 1.4 / 1.4 / 2.0 | 2000 | V; application F-10 |
| LAP.MIN | IS 456 26.2.5.1 | 15Ø, 200 mm | 2000 | V |
| LAP.MAX_DIA | IS 456 26.2.5.1(a) | 36 mm | 2000 | V |
| LAP.STAGGER | IS 456 26.2.5.1(c) | 1.3 Llap | 2000 | V |
| CRANK.SLOPE | SP 34 / ACI | 1:6 | — | ? |
| CRANK.MAX_OFFSET | SP 34 / ACI | 75 mm | — | ? |
| WALL.MIN_T | IS 13920 10.1.1 | 150 mm | 2016 | V |
| WALL.MIN_T_COUPLED | IS 13920 10.1.x | 200 mm | 2016 | ? |
| WALL.MIN_PCT | IS 13920 10.1.4 | 0.25 % each way | 2016 | V |
| WALL.TWO_CURTAIN_T | IS 13920 10.1.5 | 200 mm | 2016 | V (value) ? (number) |
| WALL.TWO_CURTAIN_TAU | IS 13920 10.1.5 | 0.25√fck | 2016 | V (value) |
| WALL.MAX_BAR_DIA | IS 13920 10.1.6 | tw/10 | 2016 | V (value) |
| WALL.MAX_SPACING | IS 13920 10.1.7 | min(lw/5, 3tw, 450) | 2016 | V (value) |
| WALL.IS456_MIN_V / MIN_H | IS 456 32.5 | 0.12/0.15 %; 0.20/0.25 % | 2000 | V |
| WALL.IS456_MAX_DIA | IS 456 32.5 | tw/8 | 2000 | V |
| BE.TRIGGER | IS 13920 10.4.1 | 0.2 fck / 0.15 fck | 2016 | V |
| BE.MIN_PCT / MAX_PCT / WARN | IS 13920 10.4.3 | 0.8 / 6 / 4 % | 2016 | V (values) ? (number) |
| BE.CONFINE | IS 13920 10.4.4 → 7.6 | as column | 2016 | ? number |
| WALL.LAP_MAX_FRACTION | IS 13920 10.9.x | 1/3 | 2016 | ? |
| WALL.LAP_STAGGER | IS 13920 10.9.x | 600 mm | 2016 | ? |
| WALL.OPENING_REINF | IS 13920 10.6.1 | = interrupted As, +Ld | 2016 | ? number |
| WALL.END_BARS_MIN | SP 34 / 13920 10.1.x | 4-T12 two layers | — | ? |
| BBS.UNIT_WEIGHT | IS 1786 | per table D5 | 2008 | V |
| BEND.RADIUS_HYSD | IS 2502 / IS 456 26.2.2.1 | 4Ø main; links 2Ø? | — | ? |

E4. Relationship to `SbcCalc\Engine\Is456.cs`
- Keep `Is456.cs` as the only place for IS 456 material/anchorage numbers (τbd, σs, Ld, lap table, cover tables, min/max steel). The Detailer's `IColumnRules.LapLength`, `NominalCover`, `MinSteelPct` delegate to it.
- Add `Is13920.cs` beside it, same style (static readonly table + typed accessors + `Clause` tags), holding C-D/C-H/W-* values; the Calculator's existing confinement spacing (min(b/4, 6Ø, 100)) and Ash functions should be *moved* there and called from both Calculator and Detailer, so a future Amd changes one line.
- Add a `CodeValueCatalogue` that enumerates every constant from both files for the audit report (print "rules in force" sheet into the drawing notes or a PDF appendix).
- Unit tests: one test per RuleId with the value in E3 — the test file doubles as the human-readable catalogue; a failing test after a code update tells you exactly which drawing outputs change.

---------------------------------------------------------------------
## F. OPEN ENGINEERING QUESTIONS FOR THE OWNER
---------------------------------------------------------------------

F-1. Preferred longitudinal bar diameters: confirm [12,16,20,25,32] and whether 12 mm is allowed in ductile columns (many offices use ≥ 16 in lateral-system columns), and whether 28/36 are ever stocked.
F-2. Two-diameter sections: allowed? If yes, which pairings (25+20, 32+25, 20+16 only?) and corners always the larger.
F-3. Ductile detailing scope: detail ALL columns and walls to IS 13920 in Zones III–V (IS 13920:2016 cl. 1.1.1 makes it mandatory for the structure; gravity columns still need drift compatibility), or only those flagged "lateral system" by ETABS? Recommended: all, in Zone III+.
F-4. Non-rectangular (L/T/C/+) columns in the lateral system: accept the rectangular-sub-part overlapping-hoop scheme with a drawing note citing Amd 1, or refuse to auto-detail and require manual detailing?
F-5. Tie spacing rounding module: 25 mm (75/100/125/150/175/200…) or 50 mm (100/150/200/250/300)? Floor (conservative) always.
F-6. Hook type for non-ductile columns and walls: 135° everywhere (recommended, uniform) or 90° allowed in Zone II gravity members?
F-7. Minimum tie diameter: 8 mm everywhere (recommended) vs code minimum 6 mm; 10 mm when longitudinal Ø ≥ 32?
F-8. Minimum confining spacing floor: enforce 75 mm (legacy 1993 and constructability) even though 2016 permits lower? Recommended yes (warn when 6Ø or B/4 < 75, e.g. Ø12 → 72).
F-9. Cover values by exposure/fire for the office standard: columns 40 (mild/moderate), 45 (severe), 50 (very severe/marine); walls 25 internal / 30 external; confirm, and whether cover is specified to tie (code) or to main bar (some site habits).
F-10. Lap length corner factor 1.4 (IS 456 26.2.5.1(c)) for column corner bars with Ø ≥ 20: apply (code-strict, lap becomes 70Ø for M25) or rely on the office table only (common practice, since bars are compression under gravity and the table already exceeds Ld)? Recommended: office table without 1.4 but with a visible setting; mandatory 1.4 if the Calculator reports net tension in the bar.
F-11. Clear height hc for l0 when beams of different depths frame in: use shallowest beam soffit (larger hc, longer l0 at top?) or detail l0 from each beam face separately?
F-12. Bundled bars: permitted? (Needed only above ~4 %.)
F-13. Walls: always two curtains for tw ≥ 200 even when shear stress is low? Single curtain allowed at 150–180 mm walls?
F-14. BE length when ETABS supplies only the flag: rule for lbe (e.g. max(0.15 lw, 2 tw, 450)? or ACI c − 0.1lw / c/2) and rounding.
F-15. Lap fraction in BE vertical bars: 1/3 (wall clause) or 1/2 (column clause)?
F-16. BBS shape-code convention: IS 2502 figures, BS 8666 codes, or the office's existing BBS template codes.
F-17. Lap location for gravity columns: above floor (all bars, traditional) or central half (uniform with ductile, simpler for the Detailer)?
F-18. Crank vs dowel policy at column size reduction, kicker height (75/100/150), and whether cranks are allowed at all in ductile columns.
F-19. Starter bar length from foundation: L-bar with 90° leg on the mat, embedment = Ld compression or tension?
F-20. Joint hoops: continue confining spacing through all joints (simple, conservative) or apply the four-side-confined 150 mm relaxation (needs beam-width data)?
F-21. Steel grade: Fe500D everywhere (IS 13920 5.3 requirement for ductile members) and office bar-mark prefix ("T", "Y", "#")?
F-22. Shear-wall end bars without BE: enforce 4-T12 two-layer minimum (SP 34 practice)?
F-23. Amendment 2 (2021) to IS 13920: I am not certain of its content (believed editorial / wall and beam-joint clarifications) — obtain BIS copy and diff against this table before release. **(verify)**

---------------------------------------------------------------------
## G. Consolidated "verify against BIS copy" list
---------------------------------------------------------------------
1. IS 456 26.5.3.1 sub-clause letters for pedestal 0.15 %, helical 6 bars, 300 mm periphery spacing; 26.5.3.2(d) helical pitch letter.
2. IS 456 bundle limit clause (26.1.3?) and IS 2502 bend radii for links and main HYSD bars; SP 34 hook allowances (9Ø/16Ø).
3. IS 13920:2016 7.1.2 aspect ratio 0.45; 7.3.1 circular min bars; exact placement of Amd 1 T/X/+ note.
4. IS 13920:2016 7.3.2 hoop spacing over laps: 100 mm (2016) vs 150 mm (1993).
5. IS 13920:2016 7.3.3/7.3.4 welded and mechanical splice location rules.
6. IS 13920:2016 minimum hoop diameter for columns (8 mm): whether stated in 7.4.x or only in 6.3.2.
7. IS 13920:2016 cross-tie hook ends: 135° both ends (2016/Amd 1) vs 90°/135° (1993).
8. IS 13920:2016 mid-height hoop spacing B/2 sub-clause number (7.4.2?).
9. IS 13920:2016 8.2–8.5 numbering for full-height confinement cases and the 300 mm extension into footing.
10. IS 13920:2016 9.3 joint confinement: "half area, ≤ 150 mm" wording and ¾ beam width.
11. First hoop within 50 mm of joint face for columns (explicit or by analogy with 6.3.5).
12. IS 13920:2016 10.1.x numbering: 150 mm thickness, 200 mm coupled walls, two-curtain, tw/10, spacing; 10.2.x "ρv ≥ ρh"; any BE thickness minimum.
13. IS 13920:2016 10.4.x: BE length rule (if any), 0.8–6 % clause number, confinement clause number and the "Pu ≥ 0.1 fck Ag" provision.
14. IS 13920:2016 10.6/10.9 numbering: opening reinforcement, horizontal-bar anchorage, 1/3 lapped fraction, 600 mm stagger, plastic-hinge no-lap zone, extension into foundation.
15. IS 13920:2016 10.8 construction-joint reinforcement formula (design, Calculator).
16. Wall end concentrated bars "4-T12 in two layers" — code clause or SP 34 practice only.
17. IS 456 Table 16A fire cover for walls; τbd for M55+.
18. IS 13920:2016 5.3 steel grade requirement wording (Fe500D).
19. SP 34 crank slope 1:6 / 75 mm offset / lap-above-floor convention and SP 34 clause numbers.
20. Content of IS 13920 Amendment 2 (2021).
21. IS 2502 shape-code numbering scheme.
