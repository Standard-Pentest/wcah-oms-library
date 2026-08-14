# Task 18: Month Dashboard — report

## Summary

Created `src/ui/Dashboard.jsx` (Coastal Glass month dashboard) and its test
`src/ui/Dashboard.test.jsx`, both transcribed verbatim from the brief. Wired
`Dashboard` into `App.jsx`'s `SCREENS` registry as the `dashboard` entry's
`Component`, and deleted `MonthGlance` entirely — including its now-orphaned
`selectMonth` and `fmtShort` imports, since nothing else in `App.jsx` used
them. No brief-supplied assertion required a test-only fix, and no production
bug was found — the brief's Step 1 test and Step 3 component worked together
against existing (Task 1-17) production code without modification.
`App.test.jsx`'s `Week of Aug 2` / `Week of Aug 23` assertions needed no
changes — the new week cards render the same text.

## Step 1 — failing test written

`src/ui/Dashboard.test.jsx` created exactly per brief (3 `it` blocks:
decision-queue ordering + impact text, Grant removes the request from the
queue, clicking a week card navigates to that week's board). No
`afterEach(cleanup)` added — RTL cleanup runs automatically via
`src/test-setup.js` per the infra note.

## Step 2 — RED evidence

```
npx vitest run src/ui/Dashboard.test.jsx
```

Result: `FAIL` — `findByTestId('decision-queue')` timed out (`waitForWrapper`
threw after the default timeout). The DOM dump in the failure output showed
only the old `MonthGlance` markup (`glass-panel` week tiles with "Week of Aug
2" etc., no `data-testid="decision-queue"` anywhere), confirming the test was
exercising real (missing) behavior — `SCREENS` still pointed the `dashboard`
key at `MonthGlance`, which has no decision queue.

## Step 3 — implementation

- `src/ui/Dashboard.jsx` created verbatim from the brief: four metric tiles
  (`Tile` helper component, module-scope), four week cards
  (`data-testid="week-card-{weekId}"`, click dispatches `SELECT_WEEK` +
  `SET_SCREEN`), a decision queue section (`data-testid="decision-queue"`,
  each pending request rendered with classification/dates/impact and
  Grant/Deny buttons dispatching `DECIDE_REQUEST`), an hours-vs-standard list
  (rows from `month.hours` with `delta < 0`), and an `Advance horizon →`
  button dispatching `ADVANCE_HORIZON`.
- `src/ui/App.jsx` diff:

```diff
@@ -1,10 +1,7 @@
 import React from 'react';
 import { SchedulerProvider, useScheduler } from '../state/SchedulerContext.jsx';
 import { createIdbStore } from '../state/persistence.js';
-import { selectMonth } from '../state/store.js';
-import { fmtShort } from '../domain/calendar.js';
 import WeekBoard from './WeekBoard.jsx';
+import Dashboard from './Dashboard.jsx';

 const appStore = createIdbStore();

 /** Screen registry — later tasks replace/extend entries. */
 const SCREENS = [
-  { key: 'dashboard', label: 'Dashboard', Component: MonthGlance },
+  { key: 'dashboard', label: 'Dashboard', Component: Dashboard },
   { key: 'board', label: 'Week Board', Component: WeekBoard },
 ];

-export function MonthGlance() {
-  const { state } = useScheduler();
-  const month = selectMonth(state);
-  return (
-    <div className="grid grid-cols-2 gap-4 p-6 lg:grid-cols-4">
-      {month.perWeek.map((w) => (
-        <div key={w.weekId} className="glass-panel rounded-xl p-4">
-          <div className="text-sm font-semibold">Week of {fmtShort(w.weekId)}</div>
-          <div className="mt-2 text-xs text-charcoal/70">
-            {w.short} gaps · {w.hard} hard · {w.soft} soft
-          </div>
-          {w.provisional && (
-            <div className="mt-1 text-[11px] text-amber-text">rotations unconfirmed</div>
-          )}
-        </div>
-      ))}
-    </div>
-  );
-}
-
 function StorageBanner() {
```

The brief said "delete is cleaner" for `MonthGlance` and I took that path.
`selectMonth`/`fmtShort` were only used by `MonthGlance` in this file (grepped
after deletion — no remaining `MonthGlance` references anywhere in `src/`), so
removing those two imports along with it keeps the file lint-clean rather than
leaving dead imports.

## Step 4 — GREEN evidence

```
npx vitest run src/ui/Dashboard.test.jsx   →  PASS (3) FAIL (0)
npx vitest run src/ui                      →  PASS (13) FAIL (0)
```

Full suite, run through `rtk proxy npx vitest run` (bypassing rtk's
summarizing filter so stderr / act() warnings would surface rather than being
collapsed):

```
RUN  v4.1.10 /Users/hinchk/WestCoast.Vet/scheduler

 Test Files  20 passed (20)
      Tests  80 passed (80)
   Start at  23:27:05
   Duration  882ms (transform 557ms, setup 1.25s, import 881ms, tests 1.32s, environment 1.19s)
```

80 tests total, all green, no stderr output, no act() warnings, no console
errors. Pristine.

## Step 4b — build

```
npm run build
```

Result: succeeded — `✓ 52 modules transformed`, `✓ built in 337ms`, no
warnings.

## Step 5 — commit

```
git add src/ui
git commit -m "feat(ui): Coastal Glass month dashboard with decision queue and metrics

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

Result: commit `0dba9bf` on `feature/mvp-build` — 3 files changed, 149
insertions(+), 23 deletions(-): `src/ui/App.jsx` (modified),
`src/ui/Dashboard.jsx` (new), `src/ui/Dashboard.test.jsx` (new).

## Self-review

- Hard rules respected: `Dashboard` and `Tile` are both defined at module
  scope (no components nested inside another); only token classes used
  (`coast-bg`, `coast-panel`, `text-coast-accent`, `bg-amber-soft`,
  `text-amber-text`, `bg-success`, `text-success-text`,
  `text-coast-accent-soft`, `bg-coast-accent`, `text-coast-deep`, plus
  opacity-scaled `white/*` utilities) — grepped the file for raw hex
  (`#[0-9a-fA-F]{3,8}`) and found none.
- Verified `selectMonth`, `selectDecisionQueue`, `selectWeek`, and the
  `DECIDE_REQUEST`/`SELECT_WEEK`/`SET_SCREEN`/`ADVANCE_HORIZON` reducer cases
  all already existed in `src/state/store.js` from prior tasks, matching the
  brief's Interfaces section exactly — no reducer or selector changes needed.
- Confirmed `classifyRequest` (`src/domain/timeoff.js`) and `fmtShort`
  (`src/domain/calendar.js`) signatures match usage.
- Confirmed seed data (`src/data/week-aug02.js`) has Pearl, Leanne
  (`submittedAt: '2026-06-19T08:36:00'`) submitted before Rodriguez, Glenda
  (`submittedAt: '2026-07-06T21:34:00'`), matching the test's expected
  first-submitted-first ordering.
- Confirmed `hoursReport` (`src/domain/metrics.js`) returns `staffId`,
  `displayName`, and `delta` fields as consumed by the hours-vs-standard list.

### Verification beyond the brief: test 2 discriminating power

Before trusting the "grants a request from the queue" test, I stress-tested
it rather than accepting the green run at face value: the assertion
(`within(queue).queryByText(/Pearl, Leanne/)` → null) uses a different
matching path than test 1 (raw `textContent`), and RTL's default text
matcher only joins an element's *direct* child text nodes
(`getNodeText`), which raised a real question of whether it could see
"Pearl, Leanne" at all inside `{request.employeeName} — {classifyRequest(...)}
· {fmtShort(...)}`.

I temporarily replaced the Grant button's `onClick` with a no-op and re-ran
`npx vitest run src/ui/Dashboard.test.jsx`: test 2 failed as expected
(`AssertionError: expected <div class="font-semibold">...</div> to be null`),
proving the query does resolve to a live element and the test is a genuine
regression guard, not a vacuous pass. Restored the original file afterward
(byte-for-byte diff against a backup showed no residual change) and reran the
full suite to confirm 80/80 green again before committing.

### Note on the brief's Interfaces prose

The Interfaces bullet describes the equity tile as reading "Equity 0.31", but
the brief's own Step 3 code renders label `Weekend equity (gini)` with value
`0.31` as a separate tile from "Month gaps" — a minor internal inconsistency
in the brief's prose vs. its code. Followed the code verbatim per
instructions; no fix needed since Step 3 code is authoritative and internally
consistent.

No other concerns.
