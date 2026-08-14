# Task 10 Report: Repair suggestions with measured impact

## Status: DONE

## Commit

`42883e3` — `feat(domain): pull-order repair suggestions with measured impact`
(2 files changed: `src/domain/suggestions.js`, `src/domain/suggestions.test.js`)

## Process

Both files transcribed verbatim from the brief (Step 1 test, Step 3 implementation) —
no deviations from the brief's code blocks.

### RED (Step 2)

`npx vitest run src/domain/suggestions.test.js`

Note: this repo has an `rtk` hook rewriting bash commands, which for vitest
collapses output to a filtered `PASS (n) FAIL (n)` summary and tees the real
reporter output to a JSON log file under
`~/Library/Application Support/rtk/tee/*.log`. That log file did **not**
refresh on the second (GREEN) run — it kept the stale RED-run JSON
(`"success":false`, `numTotalTests:0`). Do not trust that tee log for
evidence; use `rtk proxy <cmd>` to get real, unfiltered vitest output. Noting
this for whoever runs Task 11/12/13's verification.

RED evidence (via `rtk proxy`):
```
FAIL src/domain/suggestions.test.js [ src/domain/suggestions.test.js ]
Error: Cannot find module './suggestions.js' imported from
/Users/hinchk/WestCoast.Vet/scheduler/src/domain/suggestions.test.js
```
(captured pre-implementation; matches brief's expected failure exactly)

### GREEN (Step 4)

`rtk proxy npx vitest run src/domain/suggestions.test.js --reporter=verbose`

```
✓ src/domain/suggestions.test.js > repair suggestions > offers eligible off-duty adds and excludes constrained staff 3ms
✓ src/domain/suggestions.test.js > repair suggestions > pulls surplus on-duty RVTs to VA in pull order, before bench adds 1ms
✓ src/domain/suggestions.test.js > repair suggestions > reports impact that matches actually applying the actions 1ms
✓ src/domain/suggestions.test.js > repair suggestions > generates nothing for the on-target real Aug 2 week 2ms

Test Files  1 passed (1)
     Tests  4 passed (4)
```

### Full suite

`rtk proxy npx vitest run --reporter=verbose`

```
Test Files  12 passed (12)
     Tests  52 passed (52)
```

48 pre-existing + 4 new = 52, pristine (matches expectation exactly).

## Extra verification (beyond the brief)

Test 4 (`generates nothing for the on-target real Aug 2 week`) only exercises
the generator's *base snapshot* path against real data — the real week has no
gaps, so no candidate/eligibility/pull-order/impact code actually runs
against `SEED_ROSTER` + real `PULL_ORDER`. To close that gap I ran a
scratch-only probe (not committed) that perturbed `WEEK_AUG02` by bumping
`dvmCounts.Wed` by 1, opening a VA short of 2 on Wednesday with no RVT
surplus that day:

- `coverageCheck` on the perturbed week: `Wed VA variance -2, RVT variance 0`.
- `generateSuggestions` returned exactly 3 bench-add suggestions (cap
  honored), all `shortDelta: -1`, `hardDelta: 0`, none touching any
  constrained staff (`alvarez-marvette`, `burchnell-cayla`,
  `corneau-lopez-michaela`, `mariscal-paulina`, `prado-carla`, `ross-shana` —
  all correctly excluded by `noDays`/`fixedDays`/`emergencyOnly`/
  `maxDaysPerWeek`).
- Confirmed `SEED_ROSTER` entries for Mariscal, Prado, and Ross Shana carry
  `constraints.noDays`, so `isEligible`'s `noDays` check has real staff to
  filter (this wasn't guaranteed by reading the brief alone).

This gives confidence the generator behaves correctly on the real roster/
rulebook, not just the synthetic fixtures in the brief's test file.

## Concerns (for Task 12, which must mirror `applyActionsToWeek` exactly)

None block this task, but flagging for the reducer author:

1. **No guard on `week.overrides`.** `applyActionsToWeek` does
   `next.overrides[a.staffId] = ...` assuming `overrides` already exists on
   the week record. Every fixture here (`week()` helper and `WEEK_AUG02`)
   supplies `overrides: {}`, so this never trips, but a reducer initializing
   week records without that field would throw where this function wouldn't
   need to.
2. **`CLEAR_OVERRIDE` leaves an empty parent object.** Deleting the last day
   key under `overrides[staffId]` leaves `overrides[staffId] = {}` rather
   than removing the key. If Task 12's reducer prunes empty parents for
   tidiness, its week records will differ from this function's — the task's
   own note says the reducer must produce *identical* records, so it should
   leave the empty object too.
3. **`action.weekId` is never checked.** `applyActionsToWeek` applies every
   action in the array regardless of `weekId`; only same-week dispatch is
   safe.
4. **Override value is `{ role }` only — hours/timeNote/label are lost.** A
   pull suggestion turns an 8h `7:30–4:30` RVT into a plain 10h shift under
   the new role (via `shift(role)` defaults in `buildWeek`). This is
   consistent between this module and any reducer that reuses the same
   override shape, but it's lossy versus the person's original shift, and
   can shift overtime/undertime soft violations. Not a bug — the brief's
   impact simulation already measures `softDelta` including this effect —
   just noting it's a real behavior, not an oversight.
5. **Suggestions are independently measured, not composable.** Each
   suggestion's impact is simulated against the *original* base week. Two
   suggestions for the same gap (e.g., two of the three add candidates)
   cannot both be safely applied — applying both would need re-simulation.
   This matches the brief's "measured by simulating the actions" scope (per
   suggestion, not per combination) and is fine for a picker UI where the
   user applies one suggestion at a time, but worth knowing before any UI
   offers "apply all."
6. **Cost:** `generateSuggestions` runs a full `buildWeek` + `coverageCheck`
   + `evaluateWeek` per candidate considered (days × roles × candidates).
   Fine at current roster/rulebook size (52 tests run in ~160ms total); would
   need attention if roster/candidate counts grow substantially — same class
   of concern as the perf-cliff fix already in this repo's history
   (`63eaf26`).

## Files

- `/Users/hinchk/WestCoast.Vet/scheduler/src/domain/suggestions.js`
- `/Users/hinchk/WestCoast.Vet/scheduler/src/domain/suggestions.test.js`
- `/Users/hinchk/WestCoast.Vet/scheduler/.superpowers/sdd/task-10-report.md` (this file)
