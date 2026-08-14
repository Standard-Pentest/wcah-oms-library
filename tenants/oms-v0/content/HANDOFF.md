# WCAH Scheduler — Handoff

*Updated 2026-08-04 after Approach B schema cutover. Read this first in a new
session; it carries project intent, what is live today, and what to do next.*

---

## 1. What this project is

West Coast Animal Hospital Linda Vista has one person who builds the entire
staff schedule. The stated ask is a scheduling tool. The real problem underneath
it is narrower and harder:

> If she quits, gets sick, or takes a real vacation, the hospital cannot produce
> a schedule.

That is a **tacit-expertise and bus-factor problem**, not a calendar problem.
The product's job is to externalize that judgment into policy anyone can read,
run, and argue with.

**Scope discipline:** this is an employee-scheduling system. It is not a
practice-management system and not a vet-appointment system.

The original MVP encoded the Excel workbook
(`WCAH_Schedule_Builder_Template.xlsx`) into a pure engine with an
Excel-parity tripwire. The live app is now the **OMS mockup** — same clinic
facts, PRD lifecycle, Room Techs / Surgery / Dental taxonomy, nested Approach B
document shape.

---

## 2. Where it stands (2026-08-04)

**Repo:** `TomWCAH/scheduler` (fork of `HinchK/scheduler`), branch `main`.
**Live UI:** OMS Scheduling mockup behind a placeholder lock screen.
**Stack:** Vite 6 + React 18 + Tailwind v4, JS with JSDoc (no TypeScript yet).

```bash
npm run dev        # http://localhost:5174
npx vitest run     # full suite (legacy domain + OMS)
npm run build
```

### Arc since the MVP handoff

| When | What shipped |
|---|---|
| 2026-07-24 | Excel-parity MVP (`src/domain` + legacy UI) |
| 2026-07-27 | Lock screen (later clobbered by OMS, then restored) |
| 2026-07-31 | OMS functional mockup (PRD document + heuristic generator) |
| 2026-08-01 | Configuration + Team CRUD |
| 2026-08-01–02 | **Approach A** — Room Techs / Surgery / Dental taxonomy + workflow plan |
| 2026-08-03 | **Approach B** — nested schema v3 (departments + employees as aggregates) |
| 2026-08-04 | Production migration design (12-factor path; SP0–SP6) |

Approach A kept flat collections and remapped taxonomy/workflows.
Approach B kept that taxonomy and **nested the storage shape**. Spec:
`docs/superpowers/specs/2026-08-03-oms-approach-b-schema-design.md`.
Plan tasks 1–6 are checked off; persistence schema is **3**.

### Architecture (two stacks — intentional)

```
src/engine/   OMS live generator, coverage, PTO impact, day recommendations
src/model/    omsSelectors — nest → flat helpers (engine/UI must use these)
src/seed/     buildSeedDocument() emits nested v3
src/state/    omsMutations / omsPersistence / OmsContext (schema 3)
src/ui/oms/   live screens

src/domain/   FROZEN Excel-parity reference engine — do not “improve” it
src/data/     workbook ground truth + parity-aug02 tripwire
src/import/   ImportAdapter parsers (legacy MVP path)
```

**OMS is the product surface. `src/domain` is the oracle.** OMS does not yet
have Excel parity; that gap is the highest-leverage next check (production
migration SP1 / conformance suite). Never edit parity fixtures to make a test
pass — fix the pipeline.

### Document shape (Approach B / schema v3)

```text
HospitalDocument version: 3
  catalogs, hospitalConstraints[]
  departments[] → roles[], defaultNeeds[], constraints[]
  employees[]  → titles[], roleEligibilities[], locationEligibilities[],
                 constraints[], rotations[]
  identityMaps[], timeOffRequests[]
  scheduleWeeks[weekStart].dayPlans[day]
    → dvmCount, departmentsEnabled[], needOverrides[]
```

No top-level `roles` / `resourceNeeds` / `constraints` / `departmentAuths`.
Role eligibility implies department authorization. Week Setup edits write
**needOverrides**, never department defaults. Configuration owns defaults.

IndexedDB schema mismatch (`2 → 3`) → seed + banner; no A→B migrator.

---

## 3. Manager workflow (what is live)

| Surface | What it does |
|---|---|
| **Week Board** | Proposed schedule grid; gaps/violations/notes/recommendations rail; PTO preview when a pending request is selected |
| **Week Setup** | Per-day DVM count; enable departments (`departmentsEnabled`); edit needs as **week-local overrides** (defaults come from Configuration) |
| **PTO Decisions** | Pending/HOLD inbox; ranked accommodation options; click → non-persisted Week Board preview with person off and coverage regenerated; Approve/Deny commits |
| **Hours** | Hours vs target view |
| **Team** | Employee CRUD; role-eligibility **checkboxes** (no separate dept-auth editor); location eligibilities; cell-grid rotations; employee constraints |
| **Configuration** | Department master/detail: metadata, nested roles, Mon–Sat default needs, department constraints; hospital constraints on the Constraints surface |
| **AI panel** | Toggle chrome (capture stub) |
| **Lock screen** | Placeholder password gate (`src/ui/auth.js`) — doorbell, not real auth |

Shared week nav (Board / Setup / PTO / Hours): date picker snaps to Sunday,
This week / ← →, jump outside horizon creates a draft week via `ensureWeek`.

### How a week is supposed to run

1. **Configuration** holds department defaults (roles + Mon–Sat needs).
2. **Week Setup** enables departments per day and overrides quantities only for
   that week — defaults stay intact.
3. Generator fills from enabled depts × nested defaults + overrides; prefers
   under-hours candidates; records soft overage when forced.
4. **PTO** is decided in board context (preview first, then commit).
5. Board rail lists day recommendations: pull Surgery/Dental → Room Tech,
   yield ADMIN, OT/5th-day ask, causal PTO deny/accept-short, authorize hard
   violations.

Legacy MVP screens (Month Dashboard, Roster paste, Publish CSV) are no longer
the shell — OMS replaced them. Their domain code remains as the parity stack.

---

## 4. Decisions already made — do not relitigate without new information

| # | Decision | Why |
|---|---|---|
| 1 | OMS nested Approach B (schema 3), big-bang cutover | Long-term aggregate roots; Week Setup must not mutate global defaults |
| 2 | No `departmentAuths` — eligibility implies dept auth | One source of truth; Team is a role checkbox group |
| 3 | `src/domain` + `parity-aug02` frozen | Trust anchor for any future engine port |
| 4 | Heuristic `generateWeek` for now — no OR-Tools | Mockup fidelity first |
| 5 | Local-first IndexedDB retained; server will be a durable replica | One user; offline must keep working (prod migration §3.6) |
| 6 | Two tracks: **D domain (Tom)** / **O platform (Kasey)** | Lock-screen clobber proved shared-file rewrites are expensive |
| 7 | SP2 (deploy) gated on Track D green | Do not wrap moving semantics in containers |
| 8 | Phase A rulebook session with the manager is **done** | Corrections live in Tom's working copy — must be pushed (see §5) |

---

## 5. Where we go from here

Sequenced by what unblocks the most. Production migration design:
`docs/superpowers/specs/2026-08-04-production-migration-design.md`.

### Immediate — Track D hygiene (Tom)

Phase A lessons, ERD, and Kenny Williams fix exist on one machine and are **not
yet on the fork**. Push early. SP1's divergence report is worthless if it
measures an engine about to be superseded. This is the bus-factor thesis turned
on the authors.

### Approach B follow-ons (product, after nested schema is green)

From the Approach B spec — explicitly deferred until schema landed:

1. **Excel seed workbook** — sheets for nested departments/roles/needs,
   employees, hospital constraints, dayPlans; Tom corrects; re-import updates
   seed. Dental rename (`Dental_1-3` / `Dental_4-5`) lands here.
2. Configurable constraint weights + hide/show in UI.
3. Explicit **Propose Schedule** control on Week Board.
4. **Day view** (department-centric cells, best-fit roster picker).
5. Coverage tile title summary + non-DVM headcount; calendar dates on columns.
6. Week Setup any-week navigate + copy-from-previous (beyond `ensureWeek`).
7. PTO single inbox with status tabs; implications in details pane.

### Platform track (Kasey) — after / beside Track D

| SP | Delivers |
|---|---|
| **SP0** | Stabilize base; write down two-engine reality in CLAUDE.md / docs |
| **SP1** | Language-neutral `conformance/aug02/` — where OMS diverges from parity oracle |
| **SP2** | 12-factor envelope + sync API (rollout milestone; gated on Track D) |
| **SP3+** | Python engine port, TypeScript, relational deepening, integrations |

### Still deliberately not built

Robustness / call-out absorption, internal shift market, PIMS demand anchoring,
named-DVM synergy grids, Paylocity/WhenIWork integration, real Entra auth,
multi-user. See production migration §10 for the full non-goals list.

---

## 6. How to work on this (Option B era)

### Process

1. **Spec → plan → build.** Specs and plans live under `docs/superpowers/`.
2. **Subagent-driven development** for multi-task plans: task brief → implement
   (TDD) → report → review → fix round. Ledger under `.superpowers/sdd/`
   (gitignored locally).
3. **No commits unless Tom explicitly asks.**
4. **Short-lived branches, merged daily.** Long-lived `Option-A` / `August-2`
   caused lock-screen clobber and a no-op merge PR — do not repeat.
5. **Fork topology:** work in `TomWCAH/scheduler`, integrate to upstream via PR.
   Unpushed work is invisible to review, CI, and backup.

### Hard rules

- `src/domain`, `src/data`, `src/import`, and seed/engine pure paths: no React,
  no `Date.now()`, no id generation.
- Engine and UI read nested docs **only via** `omsSelectors` / nest-aware APIs
  — no ad-hoc `doc.roles` / `doc.resourceNeeds`.
- Week Setup → `UPSERT_NEED_OVERRIDE` / `CLEAR_NEED_OVERRIDE`. Configuration →
  department `defaultNeeds`.
- React components at module scope only; theme tokens only (no raw hex).
- `parity-aug02` stays green and untouched when changing OMS.
- No wholesale rewrites of shared `src/` files without announcing first.

### Ownership

| Owner | Owns |
|---|---|
| **Tom (Track D)** | Ubiquitous language, ERD / logical model, rulebook, fixture semantics |
| **Kasey (Track O)** | Infra, Postgres, auth, CI, API, conformance runners |

Seams between tracks: domain docs/ERD, `conformance/*/expected.json`, OpenAPI.

### Documents

| Doc | Role |
|---|---|
| `docs/superpowers/specs/2026-08-03-oms-approach-b-schema-design.md` | Nested schema (current) |
| `docs/superpowers/plans/2026-08-03-oms-approach-b-schema.md` | Approach B task plan |
| `docs/superpowers/specs/2026-08-01-oms-taxonomy-workflow-design.md` | Approach A taxonomy + workflow intent (shape superseded by B) |
| `docs/superpowers/specs/2026-08-04-production-migration-design.md` | Path to deployed system of record |
| `docs/superpowers/specs/2026-07-31-oms-mockup-design.md` | Original OMS mockup notes |
| `docs/superpowers/specs/2026-07-24-wcah-scheduler-mvp-design.md` | Legacy MVP (parity stack origin) |
| `.superpowers/sdd/2026-08-01-oms-taxonomy-workflow/` | Approach A SDD ledger (local) |

### Ubiquitous language

Roster, Pattern, Rotation, Toggle, Week Setup, Time Off / PTO, Makeup Shift,
Override, Proposed Schedule, Coverage, Gap, Violation, Pull Order, Publish,
Department, Role eligibility, Need override, Schedule run.
