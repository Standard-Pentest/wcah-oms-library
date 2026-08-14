# Task 12 Report: State — reducer, seed, selectors

## Status: DONE_WITH_CONCERNS

## Commit

`src/state/store.js`, `src/state/store.test.js` — `feat(state): reducer, seed, and evaluated selectors over the domain`

## Process

Both files transcribed verbatim from the brief (Step 1 test, Step 3 implementation) —
no deviations from the brief's code blocks.

Before writing, cross-checked every domain/data export the brief's `store.js`
imports against the actual files (`calendar.js`, `rotations.js`, `build.js`,
`coverage.js`, `targets.js`, `rules.js`, `suggestions.js`, `metrics.js`,
`timeoff.js`, `data/roster.js`, `data/week-aug02.js`) — all names and shapes
matched (`DAYS`, `addDays`, `proposeToggles`, `buildWeek`, `coverageCheck`,
`targetsForWeek`, `evaluateWeek`, `SEED_RULEBOOK`, `generateSuggestions`,
`weekendEquity`, `hoursReport`, `sortBySubmitted`, `SEED_ROSTER`,
`SEED_ROTATIONS`, `PULL_ORDER`, `WEEK_AUG02`, `REQUESTS_AUG02`). Confirmed
`willis-sun` rotation and `req-7`/`req-9` request ids exist in the seed data
with the shapes the test relies on.

Also re-read `applyActionsToWeek` in `src/domain/suggestions.js` (the Task 10
parity notes' subject) before transcribing the reducer's `SET_OVERRIDE`/
`CLEAR_OVERRIDE` cases, to confirm the brief's reducer code already matches
it exactly:
- `SET_OVERRIDE`: both spread `{...(existing ?? {}), [day]: value}` under
  `overrides[staffId]`.
- `CLEAR_OVERRIDE`: both guard on `overrides[staffId]` existing, then
  `delete` the day key and leave the (possibly now-empty) parent object in
  place — no pruning. Reducer and domain function agree.

No deviation from the brief was needed.

### RED (Step 2)

Note (per Task 10's report): this repo's `rtk` hook rewrites bash commands
and filters vitest output to a bare `PASS (n) FAIL (n)` summary; the tee log
under `~/Library/Application Support/rtk/tee/*.log` is unreliable evidence.
Used `rtk proxy npx vitest ...` throughout for real, unfiltered reporter
output.

`rtk proxy npx vitest run src/state/store.test.js`

```
 FAIL  src/state/store.test.js [ src/state/store.test.js ]
Error: Cannot find module './store.js' imported from /Users/hinchk/WestCoast.Vet/scheduler/src/state/store.test.js

 Test Files  1 failed (1)
      Tests  no tests
```

Matches the brief's expected failure exactly.

### GREEN (Step 4)

`rtk proxy npx vitest run src/state/store.test.js --reporter=verbose`

```
 ✓ scheduler state > seeds four real weeks starting Aug 2, week 1 confirmed, the rest proposed 2ms
 ✓ scheduler state > evaluates the seeded week 1 clean: no hard violations, no gaps, no suggestions 1ms
 ✓ scheduler state > mirrors applyActionsToWeek exactly when dispatching suggestion actions 1ms
 ✓ scheduler state > grants a pending request and the schedule reacts 1ms
 ✓ scheduler state > queues only pending undecided requests, first-submitted first, with measured impact 20ms
 ✓ scheduler state > rule edits cascade: disabling the undertime rule clears its violation 1ms
 ✓ scheduler state > advances the horizon by one week 0ms
 ✓ scheduler state > rotation edits re-propose toggles for unconfirmed weeks only 0ms
 ✓ scheduler state > summarizes the month per week and pools equity 5ms

 Test Files  1 passed (1)
      Tests  9 passed (9)
```

9/9 pass, no deviation from the brief needed to reach green.

### Full suite

`rtk proxy npx vitest run --reporter=verbose`

```
 Test Files  14 passed (14)
      Tests  64 passed (64)
```

55 pre-existing + 9 new = 64, pristine, matches expectation exactly.

## Concern: the parity test only exercises SET_OVERRIDE, never CLEAR_OVERRIDE

The task brief frames this task's "critical contract" as: dispatching a
suggestion's actions through the reducer must produce week records
deep-equal to `applyActionsToWeek`, "one test dispatches every generated
suggestion to prove it." I verified this claim is narrower than it reads.

Ran a throwaway (uncommitted, scratch-only) probe reproducing the test's
setup — `seedState()` then `SET_OVERRIDE` Prado off Tuesday, then
`selectWeek` — and logged each generated suggestion's action types:

```
suggestion count: 3
fill-Tue-RVT-dimino-aaron [ 'SET_OVERRIDE' ]
fill-Tue-RVT-prado-carla  [ 'SET_OVERRIDE' ]
fill-Tue-RVT-sharko-chloe [ 'SET_OVERRIDE' ]
```

All three generated suggestions are single-action `SET_OVERRIDE`s. This is
inherent to `generateSuggestions` (`src/domain/suggestions.js:67`), which
only ever emits `SET_OVERRIDE` actions (pull or add, both by overriding a
cell) — it never emits `CLEAR_OVERRIDE`. So the brief's parity test, as
written, proves `SET_OVERRIDE` deep-equality between the reducer and
`applyActionsToWeek`, but **cannot** exercise or catch a `CLEAR_OVERRIDE`
mismatch (the exact hazard the Task 10 report flagged: "if Task 12's reducer
prunes empty parents for tidiness, its week records will differ").

I did not weaken or extend the test — it's transcribed verbatim per
instructions, and STOP/BLOCKED is for when the brief looks wrong, not for
filling perceived gaps unasked. Separately, I confirmed by direct code
comparison (not just test coverage) that the reducer's `CLEAR_OVERRIDE` case
matches `applyActionsToWeek`'s exactly (see Process section above) — so the
implementation is correct even though this particular test can't prove the
`CLEAR_OVERRIDE` branch. Flagging this as the actionable gap for whichever
task next touches override-clearing UI (a "remove my override" action),
since that's the first place a real `CLEAR_OVERRIDE` dispatch will occur
outside domain tests.

## Other notes (non-blocking)

- No lint script exists in `package.json` (`grep -n '"lint"\|eslint'`
  returned nothing), so the test file's unused `generateSuggestions` and
  `SEED_RULEBOOK` imports (both required verbatim by the brief, neither
  referenced in the test body) have no gate to trip.
- `seedState()`'s `roster`, `rotations`, `requests`, and the `WEEK_AUG02`
  week object are the same references as the data module's module-level
  exports (not deep-cloned). Every reducer case in this file copies before
  writing, so no mutation happens today, and repeated `seedState()` calls in
  different tests don't cross-contaminate. Worth keeping in mind for any
  future code path that might mutate a week or roster object in place
  instead of going through the reducer.

## Files

- `/Users/hinchk/WestCoast.Vet/scheduler/src/state/store.js`
- `/Users/hinchk/WestCoast.Vet/scheduler/src/state/store.test.js`
- `/Users/hinchk/WestCoast.Vet/scheduler/.superpowers/sdd/task-12-report.md` (this file)
