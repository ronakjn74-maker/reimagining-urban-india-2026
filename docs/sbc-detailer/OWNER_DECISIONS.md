# SBC Detailer — Owner decisions log

| Date | Decision | Source |
|------|----------|--------|
| 2026-10-05 | SBC Detailer MUST work in both GstarCAD and ZWCAD. This is a hard requirement, not a preference. All CAD access in the Detailer goes through the existing compatibility layer; no host-specific API in Detailer code. | Owner message in Detailer session |
| 2026-10-05 | ETABS / SBC Calculator is the source of WHAT reinforcement is required; CAD is the source of WHERE and in WHAT actual geometry; Detailer combines both. Never silently pick one side on conflict. | Master development prompt |
| 2026-10-05 | First working milestone is ONE column end-to-end (CAD geometry → ETABS match → links → detail inserted → validated) before scaling. | Master development prompt |
