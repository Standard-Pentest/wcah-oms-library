# Task 8 Report: Frontend — central action classifier + completeness guard

## Summary
Implemented `src/state/omsActionClass.js`: `classifyAction(type)` maps every
reducer/`applyOmsMutation` action type to exactly one of `'scheduling' |
'local' | 'system'`, throwing on anything unrecognized. Backed by a
completeness-guard test (`src/state/omsActionClass.test.js`) that scans the
live source for every `case 'X':` in `omsStore.js` and `omsMutations.js` and
asserts each type classifies successfully. This is the offline guard Task 10
(OmsContext) will import to allow UI-only actions and reject scheduling
mutations when the backend is unreachable.

## TDD Evidence

### RED (Step 2)
```bash
$ npx vitest run src/state/omsActionClass.test.js
```
**Result:** FAIL — `Cannot find module './omsActionClass.js' imported from
/Users/hinchk/WestCoast.Vet/oms/src/state/omsActionClass.test.js` (expected;
module did not exist yet).

### GREEN (Step 4)
```bash
$ npx vitest run src/state/omsActionClass.test.js
```
**Result:** PASS (3) FAIL (0)

All three tests pass:
- `classifyAction › classifies every reducer/mutation action type`
- `classifyAction › throws on an unknown action`
- `classifyAction › treats week-setup edits as scheduling and navigation as local`

## Completeness scan — confirmed against CURRENT source

Before implementing, I independently re-ran the test's exact scan regex
(`/case '([A-Z_]+)':/g` over `src/state/omsStore.js` and
`src/state/omsMutations.js`) against the current source to check the brief's
classification hadn't drifted from the code. It has not: **39 unique action
types**, all present in the brief's three sets, no additions needed, no
brief classification changed.

**20 from `src/state/omsMutations.js`** (all `scheduling` — these are the
`applyOmsMutation` cases, config/roster/rotation edits that change the
persisted document):
`UPSERT_DEPARTMENT`, `REMOVE_DEPARTMENT`, `UPSERT_ROLE`, `REMOVE_ROLE`,
`UPSERT_RESOURCE_NEED`, `REMOVE_RESOURCE_NEED`, `UPSERT_CONSTRAINT`,
`REMOVE_CONSTRAINT`, `UPSERT_EMPLOYEE`, `REMOVE_EMPLOYEE`,
`SET_EMPLOYEE_TITLE`, `UPSERT_ROLE_PREFERENCE`, `REMOVE_ROLE_PREFERENCE`,
`UPSERT_LOCATION_ELIGIBILITY`, `REMOVE_LOCATION_ELIGIBILITY`,
`UPSERT_ROTATION`, `REMOVE_ROTATION`, `SET_DAY_DEPARTMENT`,
`UPSERT_NEED_OVERRIDE`, `CLEAR_NEED_OVERRIDE`

**19 from `src/state/omsStore.js`** (reducer switch):
- `scheduling` (11): `SET_DVM_COUNT`, `SET_OVERRIDE`, `CLEAR_OVERRIDES`,
  `DECIDE_PTO`, `AUTHORIZE_VIOLATION`, `FINALIZE`, `REVERT_DRAFT`, `PUBLISH`,
  `ASSIGN_DVM_TEAM`, `JUMP_TO_WEEK`, `THIS_WEEK`
- `local` (7): `SET_SCREEN`, `SELECT_WEEK`, `SHIFT_WEEK`, `TOGGLE_AI`,
  `SELECT_PTO`, `PREVIEW_PTO`, `CLEAR_PTO_PREVIEW`
- `system` (1): `REPLACE`

Total: 31 scheduling + 7 local + 1 system = 39 = the scan's 39. Bijection
confirmed — every type the source switches on has a class, and every set
member is real (no dead entries).

I manually verified the two non-obvious calls against the actual code, not
just the brief's prose:
- `JUMP_TO_WEEK` / `THIS_WEEK` both call `ensureWeek(doc, weekStart)`
  (`omsStore.js:81-119`), which — when the target week isn't in
  `doc.scheduleWeeks` — clones a template week and returns
  `{ ...doc, scheduleWeeks: {...}, weekOrder: [...] }`. That's a persisted
  write, so `scheduling` is correct even though these actions read like pure
  navigation.
- `PREVIEW_PTO` / `CLEAR_PTO_PREVIEW` only ever touch `doc.ui.ptoPreview*`
  (`omsStore.js:191-223`), and the doc comment at `omsStore.js:125-130`
  explicitly calls these fields "Non-persisted" — confirms `local` is
  correct.
- `SHIFT_WEEK` / `SELECT_WEEK` only write `doc.ui.selectedWeek` — `local` is
  correct.

No classification was ambiguous. Nothing required escalation.

### Full Suite (Step 5)

Ran `npx vitest run` (the exact task-specified command) once, as instructed:

```bash
$ npx vitest run
```
**Result:** Test Files 7 failed | 50 passed | 2 skipped (59); Tests 14
failed | 320 passed | 2 skipped (336)

That is **not** a clean result, and I want to report it honestly rather than
launder it. 13 of the 14 failures are `Error: Test timed out in 5000ms /
10000ms` inside React-rendering test files (`TeamScreen.test.jsx`,
`ConfigurationScreen.test.jsx`, `App.test.jsx`,
`OmsScreens.ptoPreview.test.jsx`, `WeekBoardEditing.test.jsx`,
`WeekSetupPanel.test.jsx`) — files my change does not touch and cannot
reach (pure module, no React, not imported by any UI code yet). I confirmed
these are resource-contention flakiness, not a regression:
- Re-running the full suite a second time produced a *different* 14-item
  failure set (e.g. `ConfigurationScreen`'s failing test-name changed
  between runs), which is the signature of nondeterministic timeouts under
  load, not a deterministic break.
- Running the flaky files in isolation, they pass: `OmsScreens.ptoPreview.test.jsx`
  alone → 6/6 pass. A batch of the six flaky files together → 5/6 pass (34/36
  tests), only intermittent stragglers.
- Re-running the full suite with reduced worker concurrency
  (`npx vitest run --max-workers=2`) eliminated the contention entirely:

```bash
$ npx vitest run --max-workers=2
```
**Result:** Test Files 1 failed | 56 passed | 2 skipped (59); Tests 1 failed
| 333 passed | 2 skipped (336)

The single remaining failure is `conformance/runners/baseline.test.js >
conformance baseline ratchet (spec §5.7)` — an assertion diff entirely
inside the Excel-parity conformance report (`oms`/`oracle` cell mismatches
for `2026-08-02` week), unrelated to action classification and unreachable
from a module that touches no `src/domain`, `src/data`, `conformance/`, or
engine code. This matches the task instruction's stated expectation exactly:
"expect 330 pass + your tests / 1 pre-existing fail (baseline ratchet,
unchanged)" — 330 + 3 new = 333 pass, 1 pre-existing fail, 2 skipped, 336
total.

**Before (per Task 7's report baseline):** ~330 pass + 1 pre-existing fail.
**After:** 333 pass (330 + 3 new) + 1 pre-existing fail (unchanged), 2
skipped.
**Status:** No regressions. The `npx vitest run` default-concurrency result
is noisy on this machine under load; the `--max-workers=2` run is the clean
signal and matches the task's own expected ratio precisely.

## Implementation Details

**File created:** `src/state/omsActionClass.js` (32 lines)

```js
export const SCHEDULING_MUTATIONS = new Set([...]); // 31 entries
export const LOCAL_ONLY_ACTIONS = new Set([...]);   // 7 entries
export const SYSTEM_ACTIONS = new Set(['REPLACE']); // 1 entry

export function classifyAction(type) {
  if (SCHEDULING_MUTATIONS.has(type)) return 'scheduling';
  if (LOCAL_ONLY_ACTIONS.has(type)) return 'local';
  if (SYSTEM_ACTIONS.has(type)) return 'system';
  throw new Error(`unclassified action: ${type}`);
}
```

Implemented verbatim from the brief's Step 3 — no deviation was needed
because the independent source scan (above) matched the brief's sets
exactly.

**Test file created:** `src/state/omsActionClass.test.js` (28 lines),
verbatim from the brief's Step 1: a completeness scan over
`src/state/omsStore.js` + `src/state/omsMutations.js`, an unknown-action
throw check, and a spot-check of the four representative cases
(`SET_DVM_COUNT` scheduling, `JUMP_TO_WEEK` scheduling, `SHIFT_WEEK` local,
`SET_SCREEN` local, `REPLACE` system).

## Constraints Verified

- Pure module: no React, no I/O, no `Date.now()`, no id generation.
- Only created `src/state/omsActionClass.js` and
  `src/state/omsActionClass.test.js`; did not modify `omsStore.js` or
  `omsMutations.js` (read-only, from the test, as required).
- Did not touch `src/engine`, `src/seed`, `src/domain`, `src/data`, or
  `conformance/`.
- Completeness test unmodified from the brief — not weakened.
- Commit message ends with the required co-author trailer.

## Self-Review

**Strengths:**
- Classification independently re-derived from source (not just trusted
  from the brief's prose) and reconciled 39 = 39 before writing any code —
  this is a stronger check than the completeness test alone provides (see
  Concerns).
- The two genuinely non-obvious classifications (`JUMP_TO_WEEK`/`THIS_WEEK`
  as scheduling despite reading like navigation; `PREVIEW_PTO` as local
  despite touching PTO domain state) were verified against the actual
  mutation code and the "Non-persisted" doc comment in `omsStore.js`, not
  just accepted on the brief's say-so.
- Full-suite run was not cherry-picked to hide noise — both the noisy
  default-concurrency result and the clean reduced-concurrency result are
  reported, with the reasoning for why the noisy one is not a regression.

**Concerns:**
1. **The completeness test is vacuously satisfiable.** `actionTypesInSource()`
   returns `[...types]` from a `Set` built by regex-scanning two hardcoded
   relative paths. If the regex ever stops matching (e.g. the reducer switch
   is reformatted to multi-line `case` patterns the regex doesn't expect) or
   the relative paths break (e.g. tests start running from a different cwd),
   the function silently returns `[]`, the `for` loop body never executes,
   and the test passes with zero assertions — a false green. Today this
   isn't a problem: I independently confirmed the scan finds all 39 real
   action types via a standalone Node script before implementing. But the
   guard has no self-check that it found a non-empty, expected-size set. I
   did not add one (e.g. `expect(actionTypesInSource().length).toBeGreaterThan(0)`)
   because the brief supplied this test verbatim and the task instructions
   say not to weaken or otherwise unilaterally alter the completeness test —
   flagging it here for the parent/reviewer to decide rather than acting on
   it myself.
2. Default-concurrency `npx vitest run` is flaky on this machine under full
   parallel load (13 timeout failures, nondeterministic membership across
   runs) — environmental, not code-related, and already documented above
   with isolation-run and reduced-concurrency evidence. Flagging in case the
   parent's CI also runs at full default concurrency and sees the same
   noise; `--max-workers=2` (or similar) gives the deterministic signal.

## Files Changed

- `src/state/omsActionClass.js` — new, 32 lines
- `src/state/omsActionClass.test.js` — new, 28 lines

## Commit

```
eb4de2a feat(oms): central action classifier with completeness guard
```

Commit includes both files, required co-author trailer
(`Claude Opus 5 <noreply@anthropic.com>`), and a message describing the why
(offline guard for Task 10) not just the what.

---

## Fix Report: review follow-up (post-approval)

Review verdict: Spec ✅, quality Approved. One Important finding (the
vacuous-pass weakness flagged in Concerns #1 above) plus two cheap minors,
all confined to `src/state/omsActionClass.test.js`.

### What changed

1. **Important — non-vacuous completeness guard.** Added two sentinel
   assertions before the classification loop, one per scanned source file,
   so a broken regex or a stale hardcoded path fails loudly instead of the
   loop silently iterating over a shrunk or empty set:
   ```js
   expect(types).toContain('REPLACE');           // sentinel from omsStore.js
   expect(types).toContain('UPSERT_DEPARTMENT'); // sentinel from omsMutations.js
   ```
   Per the review's reasoning: a bare length/floor check would not have
   caught a break isolated to one file (e.g. `omsMutations.js`'s path
   breaking still leaves 19 valid types from `omsStore.js`, clearing any
   naive floor while silently covering zero of the 20 mutation-driven
   scheduling actions). One sentinel per file closes that gap. This is
   additive — it strengthens the existing loop, it does not alter or
   remove any assertion the brief specified, so it is consistent with "do
   not weaken the completeness test."
2. **Minor — regex blind spot documented.** Added a comment above
   `actionTypesInSource()` noting the scan assumes SCREAMING_SNAKE_CASE
   action types (`[A-Z_]+`) and that a future action name containing a
   digit or lowercase letter would silently escape the scan.
3. **Minor — deprecation.** Replaced `toThrowError` with `toThrow` in the
   "throws on an unknown action" test.

### Command / output

```bash
$ npx vitest run src/state/omsActionClass.test.js
```
**Result:** Test Files 1 passed (1); Tests 3 passed (3)

Full suite re-run at reduced concurrency (per the coordinator's note that
default concurrency flakes on this machine — environmental, unrelated to
this change):
```bash
$ npx vitest run --max-workers=2
```
**Result:** Test Files 1 failed | 56 passed | 2 skipped (59); Tests 1 failed
| 333 passed | 2 skipped (336) — identical to the pre-fix baseline: the
sole failure is the pre-existing `conformance/runners/baseline.test.js`
ratchet, unchanged. No regressions from the hardening.

### Files changed
- `src/state/omsActionClass.test.js` — +12/-2 lines (sentinels, regex
  comment, `toThrow`). `src/state/omsActionClass.js` untouched.

### Commit
```
b38f357 fix(oms): harden completeness guard against silent scan failure
```
Co-author trailer included.
