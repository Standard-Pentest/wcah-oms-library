# Review: Tom's week (2026-08-05 → 08-07) + SP2 kickoff prep

*Reviewed 2026-08-07 by Kasey's session. Scope: the 12 commits on `origin/main`
that local `main` (`542a3ec`) does not yet have. Uncommitted — this is a review
artifact, not a ruling.*

## 0. What was reviewed

Local `main` is **12 commits behind `origin/main`** (clean fast-forward, no
local-only commits). Everything below was measured on a detached worktree at
`origin/main`, not in the working checkout.

| Commit | Author | What |
|---|---|---|
| `44a9c7b` | Tom | Drop home department + `unavailableDays`; rotations own permanent OFF |
| `7bfb4f7` | **Kasey** | docs: align HANDOFF and Track D docs with rulings 5–7 |
| `a1c8e7e` | Tom | Spec: non-standard shift hours on rotations |
| `2571727` | Tom | Spec: OMS document export/import on Configuration |
| `598aa4b` | Tom | Implement custom shift hours (`src/model/shiftHours.js`, TeamScreen) |
| `405d7cd` | Tom | **Seed workbook V5 + workbook→seed import** (`src/seed/fromWorkbook.js`) |
| `c92d354` | **Cursor Agent** (on Tom's branch) | Postgres modular schema design **v2** (796 lines) |

Two of the twelve are not Tom's: `7bfb4f7` is Kasey's own, and the schema v2
doc is agent-authored on Tom's branch. That last one matters — it is the
artifact HANDOFF parks as *"pending Kasey sign-off."*

Net: **9,042 insertions**. Of those, `src/seed/fromWorkbook.js` (4,913) is
generated data and the schema doc (796) is prose. Reviewable code is ~1,500 lines.

---

## 1. Verdict summary

| Area | Result |
|---|---|
| CLAUDE.md hard rules (purity, tokens, selectors, React scope) | ✅ clean |
| `parity-aug02` Excel tripwire | ✅ green, untouched |
| Test suite | 321 pass / **1 fail** / 2 skipped |
| Seed import round-trip (`npm run seed:import`) | ✅ idempotent — regenerates byte-identical from V5 |
| **Aug-2 conformance** | 🔴 **collapsed — 0 unsigned → 51 unsigned divergences** |
| Documented drift items (§ HANDOFF) | ❌ neither cleared |
| HANDOFF / CLAUDE.md accuracy | ❌ both now stale in load-bearing ways |

The single failing test is `conformance/runners/baseline.test.js`. HANDOFF
describes that as "red by design, three cells moved." **That description is no
longer true**, and the gap is the headline finding.

---

## 2. 🔴 Finding 1 — the conformance suite collapsed at `405d7cd`

The SP2 gate (prod migration §3.8) rests on SP1's conformance report. I ran the
report at every commit in the range:

| Commit | schedule `{mm, missing, extra, inexpr, intended}` | coverage | Unsigned |
|---|---|---|---|
| baseline.json (signed) | `{0, 0, 0, 3, 10}` | `{0,0,0,0,7}` | **0** |
| local `main` `542a3ec` | `{0, 0, 0, 3, 10}` | `{0,0,0,0,7}` | 0 |
| `44a9c7b`, `7bfb4f7`, `a1c8e7e` | `{0, 0, 0, 3, 10}` | `{0,0,0,0,7}` | 0 |
| `2571727`, `598aa4b` | `{0, 0, 1, 1, 10}` | `{0,0,0,0,7}` | **1** ← the state HANDOFF documents as "3 cells moved" |
| **`405d7cd` (V5 import)** | **`{23, 15, 2, 2, 1}`** | **`{11,0,0,0,6}`** | **51** |
| `c92d354` (docs only) | unchanged | unchanged | 51 |

Counting note: "unsigned" = `mismatch + missing + extra` (the three categories
`baseline.json` holds at zero). At `405d7cd` that is 23+15+2 = 40 schedule plus
11 coverage = **51**, out of 60 total report entries. The ratchet is stricter
still — `baseline.test.js` is a whole-report `toEqual`, so the drop in *signed*
entries (schedule `intended` 10 → 1, `inexpressible` 3 → 2; coverage `intended`
7 → 6) fails it independently, per contract §8.

Two corrections to HANDOFF fall out of this:

1. The "three cells moved" state (Gardner Thu + Ross Tue fixed, Sharko Thu
   extra) arrives at **`2571727` on 08-06**, not on 08-05 as written. Minor.
2. That state was then **buried by `405d7cd`**. The V5 workbook import moved the
   report to 60 entries with **51 unsigned**. Nothing in HANDOFF,
   `annotations.json`, or `baseline.json` acknowledges this, and the
   `npm run conformance:update` that HANDOFF asks Tom to run would now
   re-baseline all 51 rather than the 3 it was written for.

### What actually diverged

Not random breakage — a coherent set, dominated by role-placement and target shifts:

```
 10  missing   VA      ->  (nothing)
  5  mismatch  VA      ->  MONITOR
  4  mismatch  RVT     ->  VA
  4  mismatch  VA      ->  PHARM
  4  missing   PHARM   ->  (nothing)
  2  mismatch  RVT (7:30–4:30) -> RVT      ← shift-hours note not projected
  2  mismatch  RVT (9a)        -> RVT      ← same
  1  inexpr.   VA · EARLY LEAVE -> PTO     ← consistent w/ decision 11
```

Coverage targets moved too — e.g. Mon VA oracle `target 12` vs OMS `target 10`;
Tue VA `10` vs `8`. **The default needs themselves changed**, not just the fill.

### Mechanism — a provenance split in the comparison

`conformance/runners/projectOms.js:6` calls `buildSeedDocument()` directly.
`input.json` injects only week-level inputs (`dvmCounts`, `departmentsEnabled`,
`overrides`, `requests`) — the roster, roles, eligibility ranks and default
needs all come from **the live seed**.

So the conformance suite now compares:

- **oracle side** — `expected.json`, transcribed from the *pre-V5* workbook
- **OMS side** — the live seed, now built from the *corrected V5* workbook

These are two different generations of clinic ground truth. Much of the report
is therefore measuring workbook-vs-workbook drift rather than engine
conformance — most visibly in coverage, where **the targets themselves moved**
(Mon VA oracle `target 12` vs OMS `target 10`; Tue VA `10` vs `8`). Default
needs are seed data; a changed target is provenance, not engine behavior.

The changed roles are the real driver, not headcount: V5 renames and splits
roles (Dental JR/SR, `CSR` / `CSR_ADMIN` / `TECH_APPT`) and re-ranks
eligibility. It also grows the roster 28 → 37, but **none of the nine added
employees appear in the divergence list** — the added CSR staff are not what
moved the report.

### Not established: how much of this is provenance vs. defect

I want to be careful not to wave the whole thing off. Attribution to `405d7cd`
is certain; the *classification* of each divergence is not, and at least one
signal points at genuine under-fill rather than drift:

- OMS is short **against its own reduced targets** on several rows — Mon VA
  `9 scheduled / 10 target (SHORT 1)`, Thu VA `7/8`, Tue PHARM `0/1`. A target
  change cannot explain being short of the new target.
- Spot-checking two of the ten `missing VA → (nothing)` rows against
  `fromWorkbook.js`: `corneau-lopez-michaela` has Monday `{"kind":"ANY"}` and
  `role-room-tech` at rank 1; `mariscal-paulina` has Monday `ANY` and the same
  rank-1 room-tech eligibility. Under the blank-cells ruling (decision 9) an
  `ANY` day with rank-1 eligibility is exactly a fillable slot. Both get no
  assignment.

That is consistent with an engine or import defect sitting *underneath* the
provenance drift, and it needs triage — not an assumption either way. The
`RVT (7:30–4:30) -> RVT` and `RVT (9a) -> RVT` rows are a separate, smaller
issue: Tom's new shift-hours data is not being rendered into the conformance
projection.

This is the thing that most needs a decision before SP2 starts, because SP2's
gate is "a conformance report exists" and the one that exists currently mixes
drift with possible defects and distinguishes neither.

---

## 3. Finding 2 — a load-bearing invariant narrowed

HANDOFF calls `src/seed/mapRotations.equivalence.test.js` *"the standing proof
that the rotation cells reproduce every `FIXED_ASSIGNMENT` fact for all 28
employees."*

Tom's own docstring in that file (honestly, to his credit) now scopes it down:

> …evidence that dropping the constraints loses nothing **in the mapRotations
> path** that still converts SEED_ROSTER patterns… OMS live seed now comes from
> the V5 workbook and **may intentionally diverge** from SEED_ROSTER cell detail.

The replacement contract is `src/seed/buildSeed.workbook.test.js` (61 lines,
6 assertions: department codes, role renames, 37 employees, one employee's
eligibility ranks, one negative case, one rotation cell). That is a reasonable
smoke test but it is **not** an all-employees equivalence proof. HANDOFF still
claims the stronger guarantee. Decision 18's safety argument rests on the
stronger one.

---

## 4. Finding 3 — both documented drift items are still open

HANDOFF's "Known doc↔code drift" table lists two. Neither cleared:

| Ruling | Still true today |
|---|---|
| 10 — overage cap is a hospital constraint | `GENERAL_FILL_MAX_OVERAGE_HOURS` remains a hardcoded workbook row only (`scripts/export-oms-seed-workbook.mjs:190`); absent from `buildHospitalConstraints()`; no engine path reads it |
| 10 — `SystemConfig` struck from the model | Export script still emits a `System_Config` sheet (`scripts/export-oms-seed-workbook.mjs:174,187,188`) |

---

## 5. Finding 4 — docs now stale in ways that mislead the next session

**`CLAUDE.md`** (loads into *every* session). Tom updated it in `2571727` and
most of it is now better than before — it gained the rotation-cell grammar, the
employee-scope prohibition (decision 18), and an explicit "rulings are recorded
but not implemented" note. Two corrections to what I first wrote here:

- "persistence schema 3" → **already fixed upstream**; `origin/main` says 4.
  (My initial read was against the stale local checkout.)
- The `src/domain/cells.js` rule **is still wrong.** It states the live OMS
  reaches `cells.js` via `src/seed/buildSeed.js` → `src/data/roster.js`, and
  that editing it "changes the parity oracle *and* the running product."
  After the V5 import, `buildSeed.js` imports only `PULL_ORDER` from
  `roster.js` — a plain string array that never goes through `shift()`. Seed
  content now comes from `fromWorkbook.js`. Editing `cells.js` changes the
  parity oracle **only**. Tom documented the new boundary correctly at
  `src/seed/buildSeed.js:10-12`; the hard rule just never caught up.

**`HANDOFF.md`**: the conformance section (§ "Unsigned conformance divergence")
understates by 46 divergences, and the `mapRotations` claim in §"Known doc↔code
drift" overclaims (see §3).

---

## 6. Finding 5 — `exceljs` declared but not installed

`exceljs@^4.4.0` is in `devDependencies` but absent from `node_modules`. Both
`npm run seed:import` and `npm run seed:workbook` fail with
`ERR_MODULE_NOT_FOUND` on a fresh checkout of the current tree until
`npm install` runs. Low severity, but it blocks the first thing anyone will try.

---

## 7. What is good (and should be said plainly)

- **The V5 import is well built.** `fromWorkbook.js` is generated, header-marked
  do-not-edit, pure data, no ExcelJS at runtime — and it **round-trips exactly**:
  regenerating from `WCAH_OMS_Seed_Workbook-V5.xlsx` produces a byte-identical
  file. The committed artifact genuinely matches the canonical workbook.
- **Every CLAUDE.md hard rule holds.** No `Date.now()`/`Math.random()`/uuid in
  `src/seed`, `src/engine`, `src/model`, `src/domain`; no React in pure paths;
  no raw hex in `src/ui/oms`; no ad-hoc `doc.roles` / `doc.resourceNeeds` access.
- **`parity-aug02` is green and untouched.** The frozen oracle is intact; no
  fixture was edited to quiet anything.
- **`src/domain` was not "improved."** The freeze held.
- The seed boundary change is *documented at the source* (`buildSeed.js:10-12`)
  even though the top-level docs lag.
- The schema v2 doc is a genuinely strong artifact — see below.

---

## 8. Next phase for Kasey

Per HANDOFF §5, Kasey's track is unambiguous: **SP2 is "unblocked — next"**
(12-factor envelope + document API; FastAPI + Postgres + Entra + Compose), and
one artifact sits in Kasey's court.

### 8a. The blocking decision — what to do about conformance

SP2's gate is "SP1's conformance report existing." A report exists, but §2 shows
it no longer measures what the gate intends. **This needs a call before SP2
opens**, and it is a Kasey+Tom joint call because it crosses the track seam
(`conformance/*/expected.json` is listed as a shared seam in HANDOFF §6).

Three coherent options:

First, a point of order I checked before recommending anything. The live-seed
read is not accidental — SP0/SP1 spec §5.4 states it outright:

> The OMS runner builds a fresh `buildSeedDocument()`, injects `input.json` into
> its `2026-08-02` week… the shipped seed is unchanged, so **decision 4** holds:
> neither engine, and neither engine's seed, is modified.

But decision 4 is *"no edits under `src/engine`, `src/seed`, `src/model`,
`src/state`"* — a **scoping constraint on the SP1 build task**, not a standing
rule that conformance must read the live seed forever. §5.4 chose the live-seed
read at a time when the seed was frozen *by that constraint*. Tom's V5 import is
the first legitimate seed change since, so the choice needs revisiting on its
merits. Changing it amends §5.4's implementation; it does not overturn a ruling.

| Option | What it means | Cost | Risk |
|---|---|---|---|
| **A. Re-transcribe** `expected.json` from a real week under V5 | Oracle and seed share provenance again. Per contract §1, fixtures after aug02 are Tom's. | High — Tom transcribes a full week | Loses the aug02 baseline's signed history |
| **B. Pin the projector to a frozen pre-V5 seed snapshot** | `projectOms.js` stops calling live `buildSeedDocument()`; aug02 keeps testing *engine* behavior against a fixed roster | Medium — Track O change, ~a day | Conformance stops covering seed regressions (arguably correct — that is `buildSeed.workbook.test.js`'s job) |
| **C. Triage and sign all 51** | Follow the existing verdict process | High — 51 root-causes | Risks signing provenance drift as "intended," which weakens what the ratchet means |

**Leaning B, then A later as the second fixture** — but this is genuinely Tom's
call as much as Kasey's, because `expected.json` is named in HANDOFF §6 as a
cross-track seam. B restores a meaningful gate quickly, is squarely Track O work
(so it does not block on Tom's availability), and separates the two questions
the current suite conflates: *does the engine still behave?* (aug02, frozen
roster) versus *does the seed still match the clinic?*
(`buildSeed.workbook.test.js`). A then becomes the natural shape of "next
conformance week" (HANDOFF open question 1), which Tom already owns.

Whichever option wins, the under-fill signals in §2 should be triaged **before**
re-baselining — otherwise a real defect gets frozen into the new baseline as
"expected."

### 8b. Kasey's sign-off on schema v2 — half the deliverable

`docs/superpowers/specs/2026-08-07-oms-modular-database-schema-design.md` §10
names six specific things awaiting Kasey:

1. Postgres schema + migration feasibility for per-module schemas
2. ORM / Alembic ownership across `platform` / `core` / `scheduling` / `commission`
3. Permissions for cross-schema FKs
4. Timing of `core` extraction relative to SP2 and Commission
5. Compatibility of SP5 deepening with `schedule_document` + history
6. Physical id strategy (UUID vs stable text seed ids)

First read is that the doc is sound and SP2-compatible: `platform.app_user` /
`schedule_document` / `schedule_document_history` is exactly the §6.3 rollout
shape, `revision` + base-revision-on-write gives the lost-update rejection the
server-authoritative decision (§4.5) requires, and deferring relational
deepening to SP5 keeps SP2 thin. Items 4 and 6 are the ones with real
consequences for SP2 and deserve actual thought rather than a rubber stamp.

Note for the record: this doc is **agent-authored (Cursor) on Tom's branch**,
with Tom's sign-off checkbox marked for domain direction. Worth confirming Tom
read it line-by-line before Kasey counter-signs — two sign-offs on an
agent-drafted spec neither person wrote closely is a failure mode.

### 8a-bis. What was actually done (2026-08-07)

Kasey chose **Option B**. Landed, uncommitted:

- `conformance/aug02/seed.json` — committed snapshot of the pre-V5 seed
  document (`buildSeedDocument()` at `598aa4b`, the parent of the V5 import).
  128 KB, 28 real employees + 5 synthetic.
- `conformance/runners/projectOms.js` — `buildOmsDoc()` loads that fixture
  instead of calling `buildSeedDocument()`. Header amends spec §5.4 in place.
- `conformance/runners/projectOms.test.js` — two tests that asserted against
  the live seed now assert against the fixture, plus a new guard
  (`projects the frozen fixture, never the live seed`) that fails loudly if
  someone regenerates `seed.json` from the live seed.
- `conformance/runners/report.test.js` — inexpressible list back to the
  pre-V5 expectation; Tom's V5 Gardner-Thursday finding preserved as a comment
  and promoted into HANDOFF so it survives the pin.
- `conformance/runners/trace-aug02.js` — the triage trace CLI read the live
  seed too. Left alone it would have printed rotation anchors for a roster the
  report never saw, which is worse than not having it. Now reads `seed.json`.
- `conformance/runners/projection.test.js` — **deliberately left** on the live
  seed, with a comment saying why: `PROJECTION_ROLE_MAP` totality is a question
  about what the current product emits, so a new role must fail there. The
  frozen fixture would hide it.
- `conformance/contract.md` — §1 documents `seed.json` (including the
  do-not-regenerate rule and the reason), §9's porting checklist gains a step.
  This matters more than the spec §5.4 prose: contract.md *is* the
  language-neutral spec, and a Python porter reading the old §1 could not build
  the candidate side at all.

**Result:** 51 unsigned → **1**. `npx vitest run` is 322 pass / 1 fail; the one
failure is `baseline.test.js`, red for exactly the documented reason (Gardner Thu
+ Ross Tue now match `PB`, Sharko Thu is `extra` pending an annotation).
`parity-aug02` green. **Not re-baselined** — HANDOFF assigns that confirm to Tom.

Two things this surfaced that are worth more than the fix itself:

1. **The suspected engine defect is V5-scoped.** The under-fill signals (Mon VA
   9/10, unassigned `ANY`-cell employees) do **not** reproduce against the
   pre-V5 fixture. So it is not a latent engine bug — it is a property of the
   V5 data or its interaction with the engine. Correctly scoped to the V5-era
   fixture work, still needs Tom.
2. **A real V5 workbook inconsistency**, found by Tom's import and nearly lost
   when the fixture was pinned: `Employee_Rotations` has Gardner Thursday as
   `OFF` while the notes say PB Thursday. Now recorded in HANDOFF §"V5 workbook
   corrections" as a V6 fix.

Follow-up not done: SP0/SP1 spec §5.4 still describes the live-seed read in
prose. The runner header carries the amendment, but the spec should be updated
to match — small, and better done alongside Tom's re-baseline.

### 8c. Suggested sequence

1. ✅ **Fast-forward local `main`** — done (was 12 behind, clean FF to `d9e1ee3`).
2. ✅ **Conformance question decided and implemented** (§8a, §8a-bis).
3. ✅ **`CLAUDE.md` corrected** — the `cells.js` reachability rule. (Schema 3→4
   was already fixed upstream by Tom in `2571727`.)
4. ✅ **HANDOFF corrected** — conformance section, `mapRotations` scope, plus a
   new §"V5 workbook corrections".
5. **Tom confirms Sharko Thu** → `npm run conformance:update`. One decision,
   unblocks a fully green suite.
6. **Kasey's schema v2 review** → record sign-off or changes in its §10.
7. `npm install` — picks up `exceljs`, unblocks `seed:import` / `seed:workbook`.
8. **Then** open the SP2 spec cycle (spec → plan → build, per HANDOFF §6).

Steps 5 and 6 are independent and can run in parallel. Nothing is committed —
see §9.

---

## 9. Process notes

- HANDOFF §6.3: *"No commits unless Tom explicitly asks."* Nothing here was
  committed. **This is in tension with §6.5** (*"unpushed work is invisible to
  review, CI, and backup — push early and often"*), and the change set is now 8
  modified files plus `conformance/aug02/seed.json` and this review — including
  `conformance/` and `contract.md`, a documented cross-track seam. That is more
  than should sit unpushed. Kasey's call whether it goes to a branch/PR now or
  waits on Tom's Sharko Thu confirm; flagging rather than deciding.
- Reviewed via detached worktrees under the session scratchpad; the working
  checkout was not modified. Worktrees removed after the run.
- **`docs/reviews/` is a new directory.** Existing conventions are
  `docs/decisions/`, `docs/superpowers/specs/`, `docs/superpowers/plans/`. This
  is a review, not a decision or a spec, so none fit cleanly — happy to relocate
  or fold into HANDOFF instead.
