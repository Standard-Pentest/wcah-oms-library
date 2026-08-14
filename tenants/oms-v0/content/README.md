# WCAH Scheduler

> 🏛️ **Parent Archive**: **[Return to WCAH: OMS Hall of Records (Anchor Portal)](/wcah/)** · **[All Archives (Portal Hub)](/)**

Employee shift scheduling for West Coast Animal Hospital Linda Vista — the
office manager's Excel schedule-builder workbook, automated. Local-first
SPA: React + Tailwind, pure JS domain, IndexedDB persistence, no server.

- **Start here:** HANDOFF.md — project intent, what shipped, what's next
- **Spec:** docs/superpowers/specs/2026-07-24-wcah-scheduler-mvp-design.md
- **Plan:** docs/superpowers/plans/2026-07-24-wcah-scheduler-mvp.md

## Run

    npm install
    npm run dev        # http://localhost:5174
    npx vitest run     # domain + UI tests

`src/ui/auth.js`'s `PASSWORD` constant is a placeholder — change it before real use.

## Trust anchor

`src/data/parity-aug02.test.js` proves the engine reproduces the real
workbook's Aug 2–8, 2026 week — Proposed Schedule cell-for-cell and
Coverage Check number-for-number. Seed data in `src/data/` is transcribed
from the workbook and is ground truth: fix the pipeline, never the fixtures.

## Where things live

The live app is the **OMS** stack. The MVP stack is frozen or quarantined.

- `src/engine/` — OMS generator, coverage, PTO impact, day recommendations
- `src/model/` — `omsSelectors` (nested → flat helpers; engine and UI use these)
- `src/seed/` — `buildSeedDocument()`, nested Approach B document (schema 3)
- `src/state/` — `omsStore`, `omsMutations`, `omsPersistence`, `OmsContext`
- `src/ui/` — `App`, lock screen, and `ui/oms/` live screens
- `src/domain/` — **frozen** Excel-parity reference engine. Not legacy: the
  conformance target for any future engine port
- `src/data/` — real roster, rotations, rulebook, the Aug 2 week, parity fixtures
- `src/legacy/` — quarantined MVP UI, state, and ImportAdapter parsers.
  Unreachable from `src/main.jsx`; tests still run. See `src/legacy/README.md`
