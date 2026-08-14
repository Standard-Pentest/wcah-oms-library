# SP0 + SP1 Design — Stabilize the Base, Measure the Engine

*2026-08-04. Implements the first two sub-projects of
`2026-08-04-production-migration-design.md`. That document specs seven
sub-projects and their order; this one specs SP0 and SP1 in enough detail to
plan and build them. SP2 gets its own cycle once SP1 has reported (§3.8 of the
migration spec).*

---

## 1. Why these two, together

SP0 makes the repository's account of itself true. SP1 measures how far the
live engine has drifted from the one proven against the workbook.

They ship together because a divergence report published while the test suite
is red is hard to read: a reader cannot tell which failures are the finding and
which are the furniture. SP0 is four small tasks; SP1 does not depend on SP0's
code, only on the clarity it buys.

Neither sub-project modifies `src/domain`, the fixtures in `src/data`, or
`src/data/parity-aug02.test.js`. That test stays green and untouched from start
to finish — migration spec §7: there is no window where nothing guards the
workbook.

---

## 2. What exploration established

These facts were verified against the working tree on 2026-08-04. They make SP1
substantially cheaper than the migration spec assumed, and they are recorded
here so the plan does not re-derive them.

| Fact | Evidence | Consequence |
|---|---|---|
| The two stacks **share employee ids** | `buildSeed.js:501-508` maps `SEED_ROSTER` 1:1 into `employees[]` | No identity mapping needed; `alonzo-evelyn` is the same key on both sides |
| A **legacy→OMS role map already exists** | `LEGACY_ROLE_MAP`, `buildSeed.js:73` | The projection's role translation is an inversion of existing code, not new semantics |
| The OMS seed **already carries week `2026-08-02`** | `sessionWeeks.js:8-15` | The comparison week exists on both sides today |
| DVM counts **match exactly** | `week-aug02.js:11` vs `sessionWeeks.js:13` | One less input to reconcile |
| The OMS override channel is **shape-compatible** | `generate.js:315-357` accepts `'OFF'` or `{role, hours, label, timeNote, note}` | The workbook's hand-overrides can be fed to OMS with a role-code translation |
| The OMS seed's Aug 2 week has **no overrides** | `buildSeed.js:531-534` — `overrides: {}`, `needOverrides: []` | **The trap.** See §2.1 |
| The seed enables only **Room/Surgery/Dental** per day | `DEFAULT_DAY_DEPARTMENTS`, `buildSeed.js:490-493` | **The trap's second channel** — HSS and PHARM needs never activate. See §2.1 |

### 2.1 The input-drift trap

The workbook's Proposed Schedule reflects the manager's actual hand-edits. The
domain engine reproduces it because it is *fed* those edits: `week-aug02.js:15-26`
carries seven employees' overrides, including Angie's `VA (until 5 PM)` at 9.5
hours and Chloe's Tue OFF / Sat RVT.

The OMS seed's Aug 2 week carries none. Running both engines as they sit today
and diffing the output would produce a large divergence report measuring
**input drift, not engine divergence** — the precise false signal SP1 exists to
eliminate. §4 is the response.

The same drift has a second channel. `activeNeedsForDay` activates only
*enabled* departments' needs, and the seeded day plans enable Room Techs,
Surgery, and Dental — never HSS or Pharmacy (`DEFAULT_DAY_DEPARTMENTS`,
`buildSeed.js:490`). The workbook's coverage sheet targets HSS 1 (Mon–Sat) and
PHARM 1 (weekdays). Run as seeded, the OMS coverage record simply has no HSS or
PHARM rows, and the diff would report them as `missing` — input drift again, in
coverage rather than cells. `input.json` therefore carries `departmentsEnabled`
per day alongside the overrides (§5.3).

---

## 3. Decisions

| # | Decision | Why |
|---|---|---|
| 1 | HANDOFF reconciliation is **SP0 task 1**, not a separate chore | The migration spec already scopes SP0 as "the two-engine ambiguity resolved *in writing*." Splitting it would leave two documents describing the same work |
| 2 | The Aug 2 fixture carries the **workbook week's full inputs** | Identical inputs to both engines is what makes a divergence mean engine divergence. It also proves OMS can reproduce a real week end to end, not just a synthetic one |
| 3 | The runner **reports against a committed baseline**; it does not hard-fail on *known* divergence, but does fail when the set of divergences changes | OMS diverges today. Hard-failing on any divergence would leave `main` red until parity is reached, which is SP3-scale work. A baseline keeps CI green on what is already known while failing loudly on new or fixed divergence |
| 4 | Neither engine changes in SP1 | SP1 is an instrument. An instrument that modifies what it measures is worthless |
| 5 | `expected.json` is **transcribed from the workbook**, never generated from either engine | Same rule as the existing parity fixtures: fix the pipeline, never the fixtures |
| 6 | The `localStorage` fix is a **guarded redefine in `test-setup.js`**, not a Node pin | Narrow, reversible, and portable to CI. Pinning Node to dodge one accessor is a large lever for a small problem |
| 7 | `inexpressible` is assigned **only from a committed `annotations.json`**, never hardcoded in the runner or auto-detected | The semantic verdict on a divergence belongs to Track D (migration spec §5.2). An annotations file makes the verdict auditable and Tom-ownable while the runner stays mechanical |

---

## 4. SP0 — Stabilize the base

### 4.1 Reconcile HANDOFF.md

`HANDOFF.md` says "Read this first in a new session." After commit `4c09a69`
revised the migration spec, four of its claims contradict the standing
decisions. A fresh session reads HANDOFF before the spec and acts on the
reversed decision.

| HANDOFF location | Says | Standing decision |
|---|---|---|
| §2 | Repo `TomWCAH/scheduler`, fork of `HinchK/scheduler`, branch `main` | Single repo `tomwcah/oms` |
| §4 Decision 5 | Local-first retained; server is a durable replica | **Reversed** — server-authoritative; Postgres holds the document, IndexedDB is a read-only last-known-good cache |
| §4 Decision 7 | SP2 gated on "Track D green" | Gated on SP1's conformance report existing |
| §5 | "Immediate — push Track D to the fork" | That fork topology no longer exists |
| §6.5 | "Fork topology: work in `TomWCAH/scheduler`, integrate upstream via PR" | Same — dead rule |

Rewrite in place. Decision 5 gets a dated note recording that local-first was
adopted and reversed on 2026-08-04 after the Kasey/Tom meeting, so the next
reader inherits the reversal rather than silently re-adopting the original.

What does **not** change: §1 (project intent), §3 (manager workflow), the
Approach B document shape in §2, and the hard rules in §6. Those are accurate.

### 4.2 Fix the jsdom `localStorage` collision

Nine tests fail across `src/ui/App.test.jsx` and `src/ui/auth.test.js`.

**Root cause, verified.** Node 26 defines its own experimental `localStorage`
global — the one that warns `localStorage is not available because
--localstorage-file was not provided`. Vitest's jsdom environment leaves that
accessor in place, and its getter returns `undefined`. Probing inside a jsdom
test confirms the diagnosis:

- `localStorage` is `undefined` both bare and as `window.localStorage`
- `sessionStorage` **works** — Node has no counterpart to shadow it
- the document URL is a real origin, `http://localhost:3000/`, so this is not
  jsdom's opaque-origin case
- the descriptor is an accessor with `configurable: true`

Because `sessionStorage` works at the same origin, this is a global-shadowing
problem, not a jsdom capability problem. Because the descriptor is
configurable, it is fixable from the setup file.

**Fix.** In `src/test-setup.js`, redefine `globalThis.localStorage` with a
Storage-conformant implementation **only when the existing value is
undefined**, with a comment naming the cause. The guard matters: on a Node
version without the collision, the patch must not displace jsdom's own
implementation.

### 4.3 Correct the seam note

Migration spec §6.1 records that HANDOFF §4 named `src/state/persistence.js` as
the persistence seam. That was true when written; the app now renders the OMS
layer, so the live seam is `src/state/omsPersistence.js`. CLAUDE.md and README
get the correction, along with the two-engine reality — OMS is the product
surface, `src/domain` is the frozen oracle — stated plainly enough that a new
session does not have to infer it.

### 4.4 Verify

- `npx vitest run` — full suite green (2 intentional `describe.skip` suites in
  `src/legacy/` remain skipped)
- `npx vitest run src/data/parity-aug02.test.js` — green in isolation
- `npm run build` — green

---

## 5. SP1 — Parity conformance suite

### 5.1 The canonical projection

The engines are not comparable as they stand. The domain engine produces
`built.cells[staffId][day]`, rendered by `formatCell`. The OMS engine produces
`assignments[]` of `{employeeId, day, roleCode, paidHours, isTimeOff, label,
timeNote}`.

A **canonical projection** is therefore the load-bearing artifact of SP1, not an
implementation detail. Two records, two projectors. Each engine owns its
projector; neither engine changes.

**Schedule record** — `{employeeId, day} → cellString`. Both sides render
through `formatCell` semantics. The OMS projector translates role codes through
a **projection role map**: the inverse of `LEGACY_ROLE_MAP` plus
`DENTAL_TECH → RVT`.

Both projectors import `formatCell` from `src/domain/cells.js` rather than
reimplementing it. Two renderers would make every formatting difference look
like a scheduling difference. This is not new coupling: CLAUDE.md already
records `cells.js` as shared by both stacks, and the projectors are conformance
tooling, not live OMS code — nothing under `src/engine`, `src/state`, or
`src/ui` gains a dependency.

The extra entry is not optional. Dental's resource need targets `DENTAL_TECH`
(`buildSeed.js:302`) — a code `LEGACY_ROLE_MAP` never produces, so a bare
inverse would leave every generated dental assignment untranslatable. The map
is therefore deliberately **non-injective**: both `SURGERY_TECH` and
`DENTAL_TECH` render as `RVT`, because the workbook does not distinguish
surgery techs from dental techs. The property that actually protects the
report is **totality**: every role code the OMS engine can emit — the seven
inverses, `DENTAL_TECH`, and the pseudo-codes `PTO`, `UNPAID_OFF`, `OFF` — has
exactly one defined workbook rendering. A test asserts totality directly, so a
future role addition fails at the map rather than silently corrupting a
divergence report.

**Coverage record** — `{day, role} → {scheduled, target, status}`, normalized
from the domain's `report.days[day].roles[role]` and from OMS's `overShortTable`
rows. The normalization folds OMS's `SURGERY_TECH` and `DENTAL_TECH` rows —
scheduled and target alike — into the workbook's single `RVT` line; the exact
folding is defined in `contract.md` (§5.3).

Employee ids need no translation (§2).

### 5.2 What OMS can and cannot express

Checked against the workbook's actual cells:

**Expressible.** `PTO` versus `UNPAID OFF` — OMS emits both at
`generate.js:276`. `timeNote` and `label` survive into the seed
(`mapRotations.js:105-106`, `buildSeed.js:168-169`), so `RVT (7:30–4:30)` and
`Tech NC · until 1:00 PM` render. Manual-OFF overrides flatten to a blank cell,
which is what the workbook expects for those five rows.

**Not expressible — two, both structural.**

1. **`PB`.** The workbook prints `PB` as a role in two cells — Gardner's
   Thursday and Ross's Tuesday. OMS models Point Beach as a *location*
   (`buildSeed.js:18`) and skips PB pattern cells outright (`buildSeed.js:147`).
   The two stacks disagree about what kind of thing PB is.
2. **`earlyLeave`.** `formatCell` appends ` · EARLY LEAVE`; the OMS seed carries
   no equivalent flag, so Aidee's Tuesday cannot render it.

These are not defects to paper over. They are the first two findings, and they
are reported as such — see the `inexpressible` category in §5.5. Forcing a match
would destroy exactly the information SP1 exists to produce.

### 5.3 Layout

```
conformance/
  runners/           the JS runner and both projectors — Kasey's directory
                     (migration spec §5.2)
  aug02/
    input.json       the workbook week: dvmCounts, the seven hand-overrides
                     with roles translated to OMS codes, PTO requests, and
                     departmentsEnabled per day (§2.1's second channel)
    expected.json    the workbook's own cells and coverage, transcribed from
                     EXPECTED_GRID / EXPECTED_COVERAGE — never generated
    annotations.json known-inexpressible cells, each with a reason — Tom's
                     file (migration spec §5.2); the runner assigns the
                     `inexpressible` category only from this file
    contract.md      field semantics, sufficient to write a Python runner
                     from the document alone
    report.json      generated output: divergences, oracle versus OMS —
                     gitignored; only the baseline is committed
    baseline.json    committed snapshot of report.json
```

`contract.md` is what makes the suite language-neutral, and language-neutrality
is what makes SP3's Python port safe (migration spec §7). It is a deliverable,
not documentation of one. It names the known normalizations so the Python
runner inherits them rather than rediscovering them: `UNPAID_OFF` ↔
`UNPAID OFF`, coverage status `OK` ↔ `ON TARGET`, the workbook's ADMIN coverage
row carries `scheduled` with no target, a manual-OFF override renders as a
blank cell, and the `SURGERY_TECH` + `DENTAL_TECH` → `RVT` coverage folding
(§5.1).

### 5.4 Feeding the engines

The domain engine consumes the frozen `src/data` fixtures directly, exactly as
the parity test does. The OMS runner builds a fresh `buildSeedDocument()`,
injects `input.json` into its `2026-08-02` week — overrides,
`departmentsEnabled`, the PTO context — and calls `generateWeek`. The injection
lives in the runner; the shipped seed is unchanged, so decision 4 holds:
neither engine, and neither engine's seed, is modified.

`input.json` and the frozen `week-aug02.js` / `REQUESTS_AUG02` describe the
same week in two representations. An **agreement test** asserts they match, so
the language-neutral copy cannot drift from the fixtures the oracle actually
runs on. When they disagree, the JSON is wrong by definition — the `src/data`
fixtures are ground truth.

### 5.5 The divergence record

```json
{
  "employeeId": "gardner-theresa",
  "day": "Thu",
  "oracle": "PB",
  "oms": "",
  "category": "inexpressible"
}
```

Categories: `mismatch`, `missing`, `extra`, `inexpressible`.

The `category` field is what makes the report a usable input to Tom's ERD rather
than a wall of string differences. `inexpressible` in particular says *why* a
cell differs — a modeling disagreement, not a scheduling one.

### 5.6 Determinism

The baseline is only a useful ratchet if the report is stable and diffable.

- no timestamps or run ids in `report.json`
- stable key ordering throughout
- divergences sorted by `(employeeId, day)`

Without these the baseline churns on every run, and a churning baseline teaches
its readers to regenerate past it without looking.

### 5.7 Running it

The runner always writes `report.json`. A vitest test asserts it matches
`baseline.json`. Known divergence keeps CI green; **new** divergence fails, and
so does **fixed** divergence — the baseline must be updated deliberately, which
is what makes it a ratchet rather than a rug. A separate `--update` script
regenerates the baseline.

---

## 6. Assumptions

Stated rather than discovered later.

1. **Tom's Phase A corrections are not in the repository** (migration spec §11).
   If they change generator semantics, some fixtures need rewriting. The
   baseline-update path is the mitigation and the cost is bounded. This is a
   reason to build SP1 now — measuring the gap is its purpose — not a reason to
   wait.
2. **`parity-aug02.test.js` stays untouched and green** throughout both
   sub-projects.
3. **SP1 reports; it does not fix.** Closing a divergence is downstream work,
   and which divergences are worth closing is a Track D judgment.

---

## 7. Non-goals

- Making OMS reach parity. SP1 measures; it does not close the gap.
- A Python runner. `contract.md` makes one writable; SP3 writes it.
- Fixtures for any week other than Aug 2–8.
- Retiring `parity-aug02.test.js`. It is superseded only when the conformance
  suite demonstrably covers it, which is not SP1.
- Touching `src/domain` for any reason.

---

## 8. Done when

**SP0:** HANDOFF carries no claim contradicting the migration spec; the full
suite is green; parity is green in isolation; the build is green; CLAUDE.md and
README name the live seam correctly.

**SP1:** `conformance/aug02/` exists with all five committed files
(`report.json` is generated and gitignored); both projectors are tested; the
totality test passes — every role code the OMS engine can emit has exactly one
workbook rendering; the agreement test passes — `input.json` matches the
frozen `week-aug02.js` / `REQUESTS_AUG02`; `report.json` is deterministic
across consecutive runs; the baseline test is wired into the suite; the report
categorizes both `PB` cells (Gardner Thu, Ross Tue) and Aidee's `earlyLeave`
as `inexpressible` via `annotations.json`; and the suite is green against the
committed baseline.
