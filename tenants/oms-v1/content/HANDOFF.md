# WCAH Scheduler — Handoff

*Updated 2026-08-05 (evening) after Track D rulings 1–7 + seed workbook export
— Tom takes over ERD completion and workbook corrections from here. Read this
first in a new session; it carries project intent, what is live today, and
what to do next.*

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

## 2. Where it stands (2026-08-05)

**Repo:** `TomWCAH/oms` — single shared repository, branch `main`. (The
`HinchK/scheduler` upstream-plus-fork arrangement was retired 2026-08-04.)
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
| 2026-08-04 | **SP0 + SP1** — base stabilized; conformance suite landed (`conformance/aug02/`, PR #2) |
| 2026-08-04 | **Conformance triage** — every Aug 2 divergence signed; blank-cells ruling (PRs #3, #4) |
| 2026-08-05 | **Seed workbook export** + domain-model outline + Track D rulings 1–4 (PR #5) |
| 2026-08-05 | **Track D rulings 5–7** — standing week = sequence-1 rotation; PB/LV board; DVM count (PR #6) |
| 2026-08-05 | **Schema v4** — removed home department + `unavailableDays`/`DAY_AVAILABILITY`; rotations own permanent OFF |
| 2026-08-05 | **Employee constraints eliminated** — decision 18; wider rotation-cell grammar, `counts_toward_need` on roles, location-aware need counting; workbook V4 |

Approach A kept flat collections and remapped taxonomy/workflows.
Approach B kept that taxonomy and **nested the storage shape**. Spec:
`docs/superpowers/specs/2026-08-03-oms-approach-b-schema-design.md`.
Plan tasks 1–6 are checked off; current persistence schema is **4**.

### Architecture (two stacks — intentional)

```
src/engine/   OMS live generator, coverage, PTO impact, day recommendations
src/model/    omsSelectors — nest → flat helpers (engine/UI must use these)
src/seed/     buildSeedDocument() emits nested v4
src/state/    omsMutations / omsPersistence / OmsContext (schema 4)
src/ui/oms/   live screens

src/domain/   FROZEN Excel-parity reference engine — do not “improve” it
src/data/     workbook ground truth + parity-aug02 tripwire
src/import/   ImportAdapter parsers (legacy MVP path)
```

**OMS is the product surface. `src/domain` is the oracle.** The SP1
conformance suite (`conformance/aug02/`) measured OMS against the oracle on
the real Aug 2–8 week, and the triage cycle signed every divergence: 3
`inexpressible` (model gaps — the questions behind them were closed by the
2026-08-05 rulings, §4.10–16; whether the three cells now re-verdict is a
follow-on) and 17 `intended` (engine
behavior confirmed correct under the blank-cells ruling, §4.9). Zero unsigned
divergences remain; the baseline ratchet fails CI on any new one. Never edit
parity or conformance fixtures to make a test pass — fix the pipeline.

### Document shape (Approach B / schema v4)

```text
HospitalDocument version: 4
  catalogs, hospitalConstraints[]
  departments[] → roles[], defaultNeeds[], constraints[]
  employees[]  → titles[], roleEligibilities[], locationEligibilities[],
                 constraints[] (always empty — decision 18), rotations[]
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
| **Team** | Employee CRUD; role-eligibility **checkboxes** (engine placement; manager may override anyone); location eligibilities; cell-grid rotations; employee constraints |
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
| 5 | **Server-authoritative** — Postgres holds the document; the browser edits via the API; IndexedDB becomes a read-only last-known-good cache at SP2 | A silent offline edit that fails to sync later is worse than an honest error at the time (prod migration §3.6). *Local-first was adopted 2026-08-04 and reversed the same day after the Kasey/Tom meeting — inherit the reversal, do not re-adopt.* |
| 6 | Two tracks: **D domain (Tom)** / **O platform (Kasey)** | Lock-screen clobber proved shared-file rewrites are expensive |
| 7 | SP2 (deploy) gated on **SP1's conformance report existing** | "Track D green" was never objectively testable; a report either exists or it doesn't (prod migration §3.8, revised 2026-08-04) |
| 8 | Phase A rulebook session is **done and its corrections are landed** | Pushed via the Approach B commit in the previous repo (`HinchK/scheduler` `4d1de56`); verified 2026-08-04 by tree diff — old-repo `main` is fully contained in this repo's `main`. Kenny Williams left West Coast; his absence from the seed is correct, tracking stopped |
| 9 | **Blank rotation cells carry no constraint** — "In a rotation definition if it says any or blank for a given day, then there's no constraint" (Tom, 2026-08-04) | Settles the triage queue's policy question: general-eligibility fill may schedule employees on blank days. The 9 Aug 2 schedule extras and 7 coverage rows are engine behavior working as intended, annotated in `conformance/aug02/annotations.json` (PR #4) |
| 10 | **General-fill overage cap is a hospital constraint with a weight**, default **10 hours** (Tom, 2026-08-05) | Not unbounded; configurable. *First recorded the same morning as a `SystemConfig` entry and reversed that evening — `SystemConfig` is struck from the model entirely; inherit the reversal, do not re-adopt.* Engine enforcement follow-on |
| 11 | **Early leave is shift-note only** — engine does not model it (Tom, 2026-08-05) | No `earlyLeave` flag in OMS document |
| 12 | **Pacific Beach** is a **location** (code `PB`); prior "Point Beach" label was a misspelling (Tom, 2026-08-05) | Not a role. How the grid renders it is settled by decision 15 |
| 13 | **Rotations are optional**; when present, ordered cyclic weeks share one anchor Sunday (Tom, 2026-08-05) | No rows ⇒ flexible outside other constraints. *Optional means "has no standing week either" — per decision 14 an employee with a standing week necessarily has a sequence-1 rotation* |
| 14 | **Standing week is a sequence-1 rotation only** — Option B (Tom, 2026-08-05) | Do not also encode it as `FIXED_ASSIGNMENT`; that duplication is dropped. Day cells may be `ANY`/blank for in-week flexibility. Options A (constraints only) and C (both) explicitly rejected |
| 15 | **PB and LV are locations the board toggles between** (Tom, 2026-08-05) | One location view at a time (I7). An employee must not get two shifts the same day across locations, and other-location work stays identifiable so the other view cannot double-book (I8) |
| 16 | **Per-day DVM count is the permanent scheduling input** (Tom, 2026-08-05) | Generation uses counts, not named DVMs (I9). Replacing generic DVM slots with names, and pairing room techs to DVMs, is a separate step *after* the schedule is complete |
| 17 | **Eligible drives engine; no `autoAssign`** — manager may place anyone (Tom, 2026-08-05) | Collapses Eligible + Auto Assign; see decisions §9 / domain I12 |
| 18 | **No employee-scope constraints and no `Employee_Constraints` sheet** (Tom, 2026-08-05) — **implemented** | Standing days are rotation cells, target hours and rest exemption are employee fields, the rest rule and hours weight are hospital constraints. Employee scope stays in the schema as an unused escape hatch. Domain I13; ruling §10 |
| 19 | **Authentication is punted until a working scheduling product exists** (Kasey, 2026-08-09) | No Entra OIDC, no break-glass password in SP2. Get server-authoritative persistence and the scheduling product working first; add real auth after. The existing `src/ui/auth.js` doorbell stays as-is (it was never real auth). Supersedes the auth portions of prod-migration §6.4 / §9.2 and defers `platform.app_user`. A deployed instance therefore needs a **network-level** gate (see §5, SP2b), not app auth |
| 20 | **Persistence `revision` is internal to the store; stale writes throw** (Kasey, 2026-08-09) | Public method names remain `load` / `save` / `clear`; the API adapter owns the revision-bearing cache envelope and sends the last accepted revision as the write base. A typed `stale-write` triggers reload; typed offline paths drive the read-only/rollback state machine. Revision never enters the domain document. Corrects prod-migration §6.1's "same serialized payload / no interface change" claim; the reviewed SP2a spec §6 is authoritative for queueing, cache, and UI behavior (prod-migration §6.3 framing: two-tab lost-update, not collaborative concurrency control) |

Full write-up: `docs/decisions/2026-08-05-track-d-rulings.md` (rulings 1–7 map to
decisions 10–16; ruling §9 maps to decision 17; ruling §10 maps to decision 18).

---

## 5. Where we go from here

Sequenced by what unblocks the most. Production migration design:
`docs/superpowers/specs/2026-08-04-production-migration-design.md`.

### Conformance triage — COMPLETE (2026-08-04)

The Aug 2 report is fully signed: 0 bugs found, 17 `intended`, 3
`inexpressible`, zero unsigned entries. Spec:
`docs/superpowers/specs/2026-08-04-conformance-triage-design.md`; evidence
record: `docs/superpowers/plans/2026-08-04-conformance-triage-tom-queue.md`
(resolved by the blank-cells ruling, §4.9). PRs #3 and #4 are both merged —
`main` carries the full cycle. The SP2 gate (prod migration §3.8) is
satisfied; nothing is pending.

### Open questions for Tom

Closed 2026-08-05 (see §4.10–16 and `docs/decisions/2026-08-05-track-d-rulings.md`):
target-hours overage cap, early-leave as note, Pacific Beach location,
rotation semantics, standing-pattern representation, PB/LV board rendering,
Dental rename timing, synthetic-DVM modeling.

Still open:

1. **Next conformance week.** Contract §on-fixtures: every fixture after
   aug02 belongs to Tom. Which real week should be transcribed second — one
   with HSS/PHARM staffing active, to exercise what aug02 cannot? Deferred by
   the domain model until after the workbook corrections land.
2. **SP2 kickoff.** The gate is satisfied. When to start the SP2 spec cycle
   (FastAPI + Postgres + Entra + Compose — the rollout milestone), and
   schedule the joint Entra app registration in the WCAH tenant?
3. **Domain model completion.** The three original `[Tom]` questions are ruled.
   What remains open in `docs/oms-domain-model.md`: identity-map ownership,
   the keep/rename/drop column on the remaining constraint types, the empty
   ubiquitous-language rows (Makeup Shift, Schedule run), ERD polish, and
   lifecycle gaps vs the real clinic process.
4. **Corrected seed workbook return.** Done —
   `docs/seed/WCAH_OMS_Seed_Workbook-V5.xlsx` is the canonical clinic workbook
   (older V3/V4/unversioned copies removed). Structural validation is clean;
   **workbook → `src/seed` import is the follow-on.** The workbook still carries
   a `System_Config` sheet for a concept decision 10 deleted — see the drift
   list below before relying on it.
5. **Named-DVM synergy grids.** They sit under *Still deliberately not built*,
   but decision 16 makes named-DVM + room-tech team assignment a real later
   step. Are these distinct things (synergy/affinity data vs the assignment
   action), or is the non-goals list now stale?

### Known doc↔code drift (rulings not yet implemented)

The 2026-08-05 rulings are recorded but deliberately **not** enforced in code
yet. Listed with locations so nobody has to re-derive them:

| Ruling | Current code state | Where |
|---|---|---|
| 10 — overage cap is a hospital constraint | `GENERAL_FILL_MAX_OVERAGE_HOURS` exists **only** as a hardcoded workbook row; it is not in `buildHospitalConstraints()` at all, and no engine path reads it | `scripts/export-oms-seed-workbook.mjs:161`, `src/seed/buildSeed.js:563` |
| 10 — `SystemConfig` struck from the model | Export script still emits a `System_Config` sheet | `scripts/export-oms-seed-workbook.mjs:148,161` |

Ruling 14 / decision 18 cleared 2026-08-05: the seed emits no employee-scope
constraints.

**Scope correction (2026-08-07):** `src/seed/mapRotations.equivalence.test.js`
is no longer proof that *the live seed* reproduces every `FIXED_ASSIGNMENT`
fact for all 28 employees. Since the V5 import it proves that only for the
`mapRotations` path that converts `SEED_ROSTER` patterns — the file's own
docstring says the live seed "may intentionally diverge from SEED_ROSTER cell
detail." The live-seed contract is now `src/seed/buildSeed.workbook.test.js`
(6 assertions: department codes, role renames, 37 employees, one employee's
eligibility ranks, one negative case, one rotation cell) — a reasonable smoke
test, not an all-employees equivalence proof. If decision 18's safety argument
needs the stronger guarantee, that test has to be written against
`fromWorkbook.js`. Flagged, not resolved — Track D's call.

Clearing what is left is seed work (Track D), sequenced after the corrected
workbook returns so the two edits don't collide.

### Conformance divergence — RESOLVED (2026-08-09)

**Status 2026-08-09: the aug02 ratchet is GREEN; zero unsigned divergences.**
On the pinned pre-V5 seed the only unsigned cell was `Sharko Thu` (a
`DENTAL_TECH` general-eligibility fill on a blank rotation day — the identical
phenomenon Tom signed `intended` 5× under his 2026-08-04 blank-cells ruling,
opened here by per-location need counting I14). It was signed `intended` via
the sanctioned process (annotation + `conformance:update` re-baseline;
`expected.json` untouched) — one-sided verdict, Kasey-authorized 2026-08-09,
**Tom to confirm the annotation** (`conformance/aug02/annotations.json`,
commit `a3f30b8`). Full suite is now 371 pass / 0 fail. The historical
investigation below is retained for context.

---

`npx vitest run` was green except `conformance/runners/baseline.test.js` (now
also green after the disposition above).

**Historical (superseded) — do not run `npm run conformance:update` on this.** The section
below described three moved cells as of 2026-08-06. The V5 workbook import
(`405d7cd`) then moved the report to **51 unsigned divergences** out of 60
entries. Bisected per-commit evidence and analysis:
`docs/reviews/2026-08-07-tom-week-review-and-sp2-kickoff.md`. Re-baselining now
would freeze 51 divergences in as "expected", including at least one suspected
engine/import defect (OMS is short against its *own* reduced targets: Mon VA
9/10, Tue PHARM 0/1; and employees with `ANY` cells + rank-1 eligibility go
unassigned). Root-cause those before any ratchet move.

Cause is a provenance split: `conformance/runners/projectOms.js` builds the OMS
side from the **live seed** (now V5) while `expected.json` is transcribed from
the **pre-V5** workbook. Coverage *targets* themselves moved (Mon VA 12 → 10),
which is seed data, not engine behavior. Kasey's call 2026-08-07: pin the
projector to a committed seed fixture so aug02 tests engine behavior against a
fixed roster, with a fresh V5-era week as the second fixture (open question 1).
This amends SP0/SP1 spec §5.4's implementation; it does not overturn decision 4,
which was a scoping constraint on the SP1 build task.

The three cells originally recorded here (still valid, now folded into the
larger set):

| Cell | Was | Now | Why |
|---|---|---|---|
| Gardner Thu | `inexpressible` — OMS had no way to say "working, but not at LV" | matches the workbook's `PB` | the rotation cell's `@LOCATION` segment |
| Ross Tue | same | matches `PB` | same |
| Sharko Thu | absent | `extra` — OMS assigns `DENTAL_TECH`, oracle blank | Gardner was being counted as a Linda Vista body on a day she is in Pacific Beach; needs are now counted per location (I14), so that Thursday slot is genuinely open and the fill lands on Chloe |

The first two are strict improvements. The third is the same phenomenon already
signed `intended` five times over — a `DENTAL_TECH` general-eligibility fill on a
blank rotation day (§4.9 blank-cells ruling) — and is `extra` only because
`annotations.json` has no row for it. **Tom:** still needs your confirm, then
`npm run conformance:update` re-baselines and adds the annotation.

**Status 2026-08-07:** the projector fix is landed (`projectOms.js` now reads
`conformance/aug02/seed.json`, a committed pre-V5 seed snapshot). The report is
back to exactly these three cells — 1 unsigned divergence, `parity-aug02` green,
322 tests passing. The ratchet is red only for the item above.

### V5 workbook corrections — needs Tom (2026-08-07)

Surfaced by Tom's own V5 import; recorded here so they are not lost now that the
aug02 fixture is pinned to a pre-V5 snapshot and no longer exercises V5:

1. **Gardner Thursday is inconsistent in V5.** The `Employee_Rotations` sheet
   has her Thursday as `OFF`, while the sheet's notes still say PB Thursday.
   OMS therefore blanks the LV cell where the workbook prints `PB`. The
   rotation should carry `SURGERY_TECH@PB`. Was captured in
   `conformance/runners/report.test.js` before the pin; now documented here.
2. **Possible under-fill under the V5 seed.** With V5 the engine was short
   against its *own* targets (Mon VA 9/10, Thu VA 7/8, Tue PHARM 0/1), and
   employees with `ANY` cells plus rank-1 eligibility went unassigned
   (`corneau-lopez-michaela` Mon, `mariscal-paulina` Mon). This does **not**
   reproduce on the pre-V5 fixture, so it is a property of the V5 data or its
   interaction with the engine — not a pre-existing engine bug. It will surface
   again when the V5-era week becomes the second fixture (open question 1), and
   should be root-caused before that fixture is baselined.

### Approach B follow-ons (product, after nested schema is green)

From the Approach B spec — explicitly deferred until schema landed:

1. **Excel seed workbook** — corrected clinic file is
   `docs/seed/WCAH_OMS_Seed_Workbook-V5.xlsx`. `npm run seed:workbook` regenerates
   a comparison export only (`…-from-code.xlsx`) and must not overwrite V5.
   Re-import into `src/seed` is still follow-on. Dental rename
   (`Dental_1-3` / `Dental_4-5`) lands with that round.
2. Configurable constraint weights + hide/show in UI. Decision 10 folds into
   this: the overage cap is a weighted hospital constraint like any other.
3. Explicit **Propose Schedule** control on Week Board.
4. **Day view** (department-centric cells, best-fit roster picker).
5. Coverage tile title summary + non-DVM headcount; calendar dates on columns.
6. Week Setup any-week navigate + copy-from-previous (beyond `ensureWeek`).
7. PTO single inbox with status tabs; implications in details pane.
8. **Location view toggle on the board** (PB ↔ LV) with cross-location
   assignments visible enough to block same-day double-booking — new, required
   by decision 15 / invariants I7–I8. No surface in §3 does this today.
9. **Team assignment step** after a schedule is complete: replace generic DVM
   slots with named DVMs and pair room techs to them (decision 16).

### Platform track (Kasey) — after / beside Track D

| SP | Status | Delivers |
|---|---|---|
| **SP0** | ✅ shipped (PR #2) | Stabilized base; two-engine reality written down in CLAUDE.md / docs |
| **SP1** | ✅ shipped (PR #2) | Language-neutral `conformance/aug02/` + triage. The report-exists gate is satisfied; the current pinned-seed report has one unsigned `Sharko Thu` extra, so the baseline ratchet remains red pending disposition |
| **SP2a** | **implemented + reviewed — merge-ready (2026-08-09), unpushed** | Document API + Postgres/Alembic + atomic revision enforcement + serialized/coalesced API-store writes + honest-offline read-only cache + status-aware recovery banner + local Docker Compose + CI. Server stores scheduling state without `doc.ui`. **No auth** (decision 19). Built subagent-driven on branch `sp2a-document-api`; final whole-branch review's data-loss findings all fixed; ratchet green (371 pass / 0 fail). Plan: `docs/superpowers/plans/2026-08-09-sp2a-document-api.md`. Next: push + PR, then SP2b (deploy) |
| **SP2b** | queued behind SP2a | VPS deploy + Caddy + honest-offline read-only cache, behind a **network-level** access gate (not app auth). Entra OIDC + break-glass return here only when auth is un-punted |
| **SP3+** | queued behind SP2 | Python engine port, TypeScript, relational deepening, integrations |

SP2 is split 2a/2b (Kasey, 2026-08-09): 2a is everything buildable and testable
locally now; 2b is deployment. Auth (decision 19) is out of both until the
scheduling product works. Original single-SP2 framing: prod-migration §66.

The SP2a soundness review is incorporated into
`docs/superpowers/specs/2026-08-09-sp2a-document-api-design.md`: one in-flight
PUT with latest-write coalescing, an envelope-level cache that keeps revision
internal, central offline mutation rejection with rollback, reset as an audited
PUT, a revision-0 singleton database sentinel, and exclusion of local UI chrome
from Postgres history. These are design requirements, not implementation
details to rediscover in the plan.

**Kasey review required:** Tom approved the proposed modular database direction
(`platform`, `core`, `scheduling`, `commission`, and future module-specific
PostgreSQL schemas). v2 expands that into the full long-term table catalog
(`docs/superpowers/specs/2026-08-07-oms-modular-database-schema-design.md`).
It is deliberately **not final** until Kasey reviews platform and migration
feasibility and records sign-off there.

### Still deliberately not built

Robustness / call-out absorption, internal shift market, PIMS demand anchoring,
named-DVM synergy grids, Paylocity/WhenIWork integration, real Entra auth,
multi-user. See production migration §10 for the full non-goals list.

⚠️ **"named-DVM synergy grids" needs a ruling** — decision 16 puts named-DVM +
room-tech team assignment on the roadmap as a post-schedule step, so this entry
is either a *different* thing (synergy/affinity data) or stale. Open question 5.

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
5. **Single shared repository:** both maintainers work in `TomWCAH/oms` and
   integrate by PR. Unpushed work is invisible to review, CI, and backup —
   push early and often.

### Conformance verdicts

Every divergence in a conformance report is root-caused to a named mechanism
before receiving one of three verdicts: **bug** (fix in `src/engine`/`src/seed`),
**intended** (annotate in `annotations.json` with evidence), or **queued for
Tom** (left in baseline). Kasey and the agent call verdicts where the evidence
is one-sided; anything where the workbook and the seed disagree without a
tiebreaker is Tom's call. `expected.json` is never edited. The annotations
file is the audit trail.

### Hard rules

**Moved to `CLAUDE.md` — that list is authoritative.** This section used to
carry a second copy, and the two drifted: it still named `src/import` (deleted)
and omitted `src/model` (pure). Every rule that lived only here — the Week Setup
`UPSERT_NEED_OVERRIDE` / `CLEAR_NEED_OVERRIDE` split and "no wholesale rewrites
of shared `src/` files without announcing first" — was migrated to `CLAUDE.md`,
so nothing was lost. Do not restore a copy here; precedence is `AGENTS.md` §0.

### Ownership

| Owner | Owns |
|---|---|
| **Tom (Track D)** | Ubiquitous language, ERD / logical model, rulebook, fixture semantics |
| **Kasey (Track O)** | Infra, Postgres, auth, CI, API, conformance runners |

Seams between tracks: domain docs/ERD, `conformance/*/expected.json`, OpenAPI.

### Documents

| Doc | Role |
|---|---|
| `docs/oms-domain-model.md` | Track D ERD / logical model outline (Tom completes) |
| `docs/decisions/2026-08-05-track-d-rulings.md` | Rulings 1–7: overage cap, early leave, Pacific Beach, rotation semantics, standing week, PB/LV board, DVM count |
| `docs/seed/WCAH_OMS_Seed_Workbook-V5.xlsx` | Canonical corrected clinic seed workbook |
| `docs/superpowers/specs/2026-08-05-oms-seed-workbook-design.md` | Seed workbook + domain template design |
| `docs/superpowers/specs/2026-08-07-oms-modular-database-schema-design.md` | Modular Postgres schema **v2** — full long-term table catalog; pending Kasey sign-off |
| `docs/superpowers/specs/2026-08-05-oms-modular-database-schema-design.md` | Modular schema v1 (boundaries only) — **superseded** by 2026-08-07 |
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
Department, Role eligibility, Need override, Schedule run, Location,
DVM count, Team assignment, `ANY` cell.

Authoritative glossary is `docs/oms-domain-model.md` §2 — this list is a
pointer. Post-2026-08-05 senses to keep straight: **Pattern** is now *the*
sequence-1 rotation (not a separate construct), **DVM count** is the
generation input (named DVMs are a later **Team assignment** step), and
**`ANY`** is the explicit spelling of a blank, no-constraint rotation day.
