# WCAH Scheduler

**`AGENTS.md` is the entry point and outranks this file; this file is the
binding source for the operational hard rules below.** `HANDOFF.md` is history
and status, not a rule source — see `AGENTS.md` §0 for the full precedence order.

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
 live OMS app (Approach B nested document, persistence schema 4)
- Persistence seam (SP2 swap point): `src/state/omsPersistence.js`
  (`load`/`save`/`clear` over a `schemaVersion`-wrapped payload) — **not** the
  legacy `src/state/persistence.js` named in older docs.
- `src/domain`, `src/data` — **frozen** Excel-parity reference engine and
  workbook ground truth. Not legacy: the conformance target for any future
  engine port
- `src/legacy/` — quarantined MVP UI, state, and import adapters. Unreachable
  from `src/main.jsx`; see `src/legacy/README.md`

## Hard rules

- `src/domain`, `src/data`, `src/seed`, `src/engine`, `src/model` are pure: no
  React, no `Date.now()`, no id generation. Ids/timestamps arrive via action
  payloads / factory args.
- **`src/domain/cells.js` is the parity oracle's, not the product's** (since
  the V5 workbook import). The OMS seed comes from `src/seed/fromWorkbook.js`;
  `src/seed/buildSeed.js` still imports `PULL_ORDER` from `src/data/roster.js`,
  but that is a plain id list and does not flow through `cells.js`. Editing
  `cells.js` therefore moves the **oracle only** — which still breaks
  `parity-aug02` and shifts every conformance verdict, so it is never a
  drive-by. `conformance/runners/projection.js` renders *to* `cells.js` shapes;
  that is the live coupling to respect. Every other `src/domain/*` module is
  reachable only from the parity test and `src/legacy/`.
- Never import from `src/legacy/` into live code.
- Engine and UI read the nested document **only via** `src/model/omsSelectors`
 — no ad-hoc `doc.roles` / `doc.resourceNeeds`.
- Week Setup edits needs via `UPSERT_NEED_OVERRIDE` / `CLEAR_NEED_OVERRIDE`;
 Configuration edits department `defaultNeeds`. Week Setup must not mutate
 global defaults (decision 1).
- No wholesale rewrites of shared `src/` files without announcing first.
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
  Violation, Pull Order, Publish, Location, DVM count, Team assignment,
  `ANY` cell. Authoritative glossary: `docs/oms-domain-model.md` §2.
- No fact about a single employee is stored as an employee-scope constraint.
  A standing day is a sequence-1 rotation cell
  (`CODE[@LOCATION][/HOURS][ (note)]`, grammar in `src/model/rotationCells.js`),
  a weekly target is `employee.targetHours`, a rest waiver is
  `employee.consecutiveOffExempt`. A rule every employee shares is a hospital
  constraint. Employee scope stays in the schema as an unused escape hatch —
  do not start emitting it again (decision 18 / domain I13).
- Domain rulings live in `docs/decisions/`; `HANDOFF.md` §4 is the index.
  Most 2026-08-05 rulings are **recorded but not yet implemented** — notably
  the overage cap is not a hospital constraint yet. Tracked in `HANDOFF.md`
  §5; implementing one shifts engine output, so it is planned work with a
  conformance re-baseline, not a drive-by cleanup.
