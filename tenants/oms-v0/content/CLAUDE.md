# WCAH Scheduler

Employee shift scheduling MVP for West Coast Animal Hospital Linda Vista.
Automates the office manager's Excel schedule-builder workbook. Spec:
`docs/superpowers/specs/2026-07-24-wcah-scheduler-mvp-design.md`.

## Commands

- `npm run dev` — dev server on 5174 (browser preview: launch config `wcah-scheduler`)
- `npx vitest run` — all tests (fast, no browser)
- `npm run build` — production build

## Layout

Two stacks, intentionally. **OMS is the product surface; `src/domain` is the
oracle.**

- `src/engine`, `src/model`, `src/seed`, `src/state/oms*`, `src/ui/oms` — the
  live OMS app (Approach B nested document, persistence schema 3)
- `src/domain`, `src/data` — **frozen** Excel-parity reference engine and
  workbook ground truth. Not legacy: the conformance target for any future
  engine port
- `src/legacy/` — quarantined MVP UI, state, and import adapters. Unreachable
  from `src/main.jsx`; see `src/legacy/README.md`

## Hard rules

- `src/domain`, `src/data`, `src/seed`, `src/engine`, `src/model` are pure: no
  React, no `Date.now()`, no id generation. Ids/timestamps arrive via action
  payloads / factory args.
- **`src/domain/cells.js` is shared by both stacks** — the live OMS reaches it
  via `src/seed/buildSeed.js` → `src/data/roster.js`. Editing it changes the
  parity oracle *and* the running product. Every other `src/domain/*` module is
  reachable only from the parity test and `src/legacy/`.
- Never import from `src/legacy/` into live code.
- Engine and UI read the nested document **only via** `src/model/omsSelectors`
  — no ad-hoc `doc.roles` / `doc.resourceNeeds`.
- React components at module scope only.
- Design tokens live in `src/index.css` `@theme`; components use token
  classes, never raw hex.
- `src/data/parity-aug02.test.js` is the Excel-parity tripwire: it asserts the
  engine reproduces the real workbook's Aug 2–8 week cell-for-cell. Never
  edit fixtures to make it pass — fix the pipeline.
- Seed data in `src/data/` is transcribed from the real workbook. It is
  ground truth, not sample data.
- Ubiquitous language: Roster, Pattern, Rotation, Toggle, Week Setup,
  Time Off, Makeup Shift, Override, Proposed Schedule, Coverage, Gap,
  Violation, Pull Order, Publish.
