### Task 22: Final verification, README, acceptance walkthrough

**Files:**
- Create: `README.md`
- Modify: none (verification only)

- [ ] **Step 1: Full suite and build**

Run: `npx vitest run`
Expected: PASS — every test file from Tasks 2–21.

Run: `npm run build`
Expected: clean production build.

- [ ] **Step 2: Browser acceptance walkthrough (spec §6)**

Start the dev server via browser preview (launch config `wcah-scheduler`) and verify each beat; fix and re-run tests if any fail:

1. First run lands on the Dashboard: four week cards, decision queue shows Pearl (6/19) before Rodriguez (7/6) with `+1 gap(s)`-style impact, equity and hours tiles populated.
2. Open Week of Aug 2: the grid matches the workbook (Gardner's three UNPAID OFF, `VA (until 5 PM)`, `Tech NC · until 1:00 PM`); coverage strip shows Thursday OVER +1, everything else ON TARGET; rail shows exactly one soft violation (Gardner undertime, "makeup shifts owed").
3. Time Off screen: paste a new Paylocity row → preview classifies it → Apply → the affected week's chips and coverage react.
4. On the board, set an RVT OFF on a dental day → hard violation appears with severity from its rule → rail suggests repairs in pull order → Apply → strip clears, impact matches the badge.
5. Select Week of Aug 9: rotation toggles arrive pre-proposed (Bree's Sunday ON, Vero's every-3rd ON with Friday OFF); confirm rotations; Publish screen → Download CSV + printable grid keyed by Paylocity names.
6. Reload the page — state persists (IndexedDB). Export JSON, wipe via devtools → Application → IndexedDB → delete `wcah-scheduler`, reload (reseeds), Import JSON → restored.

- [ ] **Step 3: Write README.md**

```markdown
# WCAH Scheduler

Employee shift scheduling for West Coast Animal Hospital Linda Vista — the
office manager's Excel schedule-builder workbook, automated. Local-first
SPA: React + Tailwind, pure JS domain, IndexedDB persistence, no server.

- **Spec:** docs/superpowers/specs/2026-07-24-wcah-scheduler-mvp-design.md
- **Plan:** docs/superpowers/plans/2026-07-24-wcah-scheduler-mvp.md

## Run

    npm install
    npm run dev        # http://localhost:5174
    npx vitest run     # domain + UI tests

## Trust anchor

`src/data/parity-aug02.test.js` proves the engine reproduces the real
workbook's Aug 2–8, 2026 week — Proposed Schedule cell-for-cell and
Coverage Check number-for-number. Seed data in `src/data/` is transcribed
from the workbook and is ground truth: fix the pipeline, never the fixtures.

## Where things live

- `src/domain/` — pure scheduling engine (build, coverage, rules, suggestions, metrics)
- `src/data/` — real roster, rotations, rulebook, the Aug 2 week
- `src/import/` — ImportAdapter parsers (Paylocity time off, roster paste);
  the future AI adapter implements the same `parse(text) → {records, issues}` contract
- `src/state/` — reducer, selectors, persistence (SchedulerStore)
- `src/ui/` — Dashboard, Week Board, Roster, Time Off, Publish
```

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: README with run instructions and trust anchor"
```

---

## Execution order and dependencies

Tasks 1→13 are strictly sequential (each consumes the previous). Tasks 14–21 are UI layers over a frozen domain: 14→15→16→17 sequential; 18, 19, 20, 21 each depend on 14 (and 21 reuses `WeekPicker` from 15) but not on each other. Task 22 last.

The parity gates are non-negotiable checkpoints:
- Task 4 gate: cadence engine reproduces the Week Setup sheet.
- Task 8 gate: pipeline reproduces Proposed Schedule + Coverage Check.
- Task 9 gate: real week yields zero hard violations, exactly one soft.

If a gate fails, the pipeline (or a Task 3 transcription) is wrong — the workbook is ground truth, fixtures never bend.
