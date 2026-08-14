# OMS Scheduling Mockup — Design Notes

*2026-07-31. Functional mockup against PRD v0.7.6 + live Aug session.*

## Intent

Exercise the PRD lifecycle and PTO-centered workflow with real Linda Vista
roster facts and the July 31 Claude-assisted scheduling session (decision log
+ handoff). Not production: no OR-Tools, no Postgres, no AWS.

## Sources (priority)

1. PRD v0.7.6 (`content7.js`) — data shape, lifecycle, weight bands
2. `WCAH_Decision_Log_and_Rules.md` / `WCAH_Scheduling_Handoff.md` — BR1–BR20, D1–D37
3. Existing `src/data/roster.js` — 28-person seed mapped into §4 tables

## What shipped

- In-memory document (`src/seed/buildSeed.js`) shaped like PRD §4
- Three schedule weeks: Aug 2, 9, 16 with session DVM counts and PTO adjudications
- Heuristic `generateWeek` (always returns schedule + gaps + violations)
- PTO workspace with ranked accommodation options; HOLD blocks finalize
- Week board with title chips, hours borders, override borders, soft/hard violations
- Lifecycle DRAFT → FINAL → PUBLISHED with publish acknowledgment path

## Deferred

See plan `oms_mockup_rebuild` — OR-Tools, real AI capture, CSR department proof,
Kenny fold-in, A10 department inventory, Excel parity tripwire.
