# Task 15 report: Week Board — read-only grid and coverage strip

## Summary

Implemented `src/ui/WeekBoard.jsx` (default export `WeekBoard`, plus module-scope
`CoverageStrip` and `WeekPicker`) transcribed verbatim from the brief's Step 3, and
wired it into `src/ui/App.jsx`'s `SCREENS` registry alongside the existing
`MonthGlance` dashboard entry. Test file `src/ui/WeekBoard.test.jsx` transcribed
verbatim from the brief's Step 1, with one minimal test-only fix (see below).

## RED (Step 2)

Before `WeekBoard.jsx` existed:

```
npx vitest run src/ui/WeekBoard.test.jsx
```

```json
"status":"failed","message":"Failed to resolve import \"./WeekBoard.jsx\" from \"src/ui/WeekBoard.test.jsx\". Does the file exist?"
```

Matches the brief's expected failure exactly.

## Test-only fix: missing `afterEach(cleanup)`

After implementing `WeekBoard.jsx` verbatim, the first test passed but the second
failed:

```
TestingLibraryElementError: Found multiple elements with the text: OVER +1
```

**Root cause:** this repo has no `vitest.config` / `test.globals` and no
`setupFiles` (confirmed: `vite.config.js` has no `test` block, `package.json` has
no vitest config, no existing test file registers cleanup). `@testing-library/react`'s
auto-cleanup only self-registers when it detects a global `afterEach` at import
time (`typeof afterEach === 'function'`); since this project imports `afterEach`
explicitly per-file rather than via Vitest globals, no global exists at import
time and auto-cleanup never engages. `WeekBoard.test.jsx` is the first UI test
file in this repo with two `it()` blocks that each call `render()` — the DOM
from the first test's `mount()` was still attached when the second test ran, so
the coverage strip's Thursday "OVER +1" cell was found twice (once from each
un-cleaned mount) and "ON TARGET" would have doubled to 12 instead of 6.

Confirmed via isolation run (`-t "shows the coverage strip"` alone → 1 pass) and
via a standalone script driving `seedState()` + `selectWeek()` directly, which
computed the correct single-day-OVER coverage (Thu OVER +1, all others ON TARGET) —
proving `coverage.js`/`WeekBoard.jsx` were correct and the test file was the
defect.

**Fix (test-only, preserves every assertion verbatim):**

```diff
-import { describe, it, expect } from 'vitest';
-import { render, screen } from '@testing-library/react';
+import { describe, it, expect, afterEach } from 'vitest';
+import { render, screen, cleanup } from '@testing-library/react';
 import { SchedulerProvider } from '../state/SchedulerContext.jsx';
 import { createMemoryStore } from '../state/persistence.js';
 import WeekBoard from './WeekBoard.jsx';
 
+afterEach(cleanup);
+
 function mount() {
```

No assertion text, count, or intent was changed. Production code (`WeekBoard.jsx`,
`coverage.js`) was not touched.

**Flag for follow-up (not fixed here, per advisor guidance — this is a project-wide
test-infra decision, not test-file-local):** the repo has no `vitest.config`
`test.globals: true` or shared `setupFiles` that would auto-register RTL cleanup.
Task 16 and later tasks will likely add more multi-`it` UI test files and will hit
this same trap unless each file remembers to add `afterEach(cleanup)` itself, or
the project adopts a shared setup file. Worth a small follow-up task.

## GREEN (Step 4)

```
npx vitest run src/ui/WeekBoard.test.jsx
```
`PASS (2) FAIL (0)`

```
npx vitest run src/ui
```
`PASS (3) FAIL (0)` — 2 new WeekBoard tests + existing App.test.jsx test.

```
rtk proxy npx vitest run
```
```
 Test Files  17 passed (17)
      Tests  70 passed (70)
```
70 total (68 prior + 2 new), all green.

**act() warning check:** ran the full suite unfiltered through `rtk proxy` (raw
passthrough, not the JSON reporter, so stderr/console output is visible) and
grepped for `"not wrapped in act"` / `"Warning:"` — zero matches. No act()
warnings, no console errors/warnings anywhere in the suite.

## Visual verification

The browser-preview tool's `name`-based launch (`wcah-scheduler`) kept resolving
to the sibling `prototype` project's `wcah-portal` config instead (both on the
`/Users/hinchk/WestCoast.Vet` working-directory umbrella); worked around it by
starting `npm run dev` directly (port 5174) and pointing the browser preview at
`http://localhost:5174` by URL. Confirmed against the workbook:

- Coverage strip: Thursday shows `OVER +1` (highlighted), all other six days show
  `ON TARGET` — matches `coverage.js`'s `bucketFor`/`status` logic exactly.
- Gardner, Theresa: three `UNPAID OFF` cells (Sun/Mon/Tue), consistent with the
  test's `getAllByText('UNPAID OFF')` length-3 assertion.
- Nav bar shows both `Dashboard` and `Week Board`; clicking switches screens via
  the existing `SCREENS` registry / `SET_SCREEN` dispatch, unchanged.
- No console errors during interaction.

Dev server and browser preview were stopped/killed after verification.

## Commit

```
a454047 feat(ui): week board grid with live coverage strip
```//trailer: Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>

Files: `src/ui/App.jsx` (modified), `src/ui/WeekBoard.jsx` (new),
`src/ui/WeekBoard.test.jsx` (new). `.superpowers/sdd/` is entirely gitignored
(`.superpowers/sdd/.gitignore` contains `*`) — consistent with all 14 prior
tasks, none of whose briefs/reports are tracked in git — so this report is
written to disk only, not staged/committed, matching established convention.

## Self-review

- Interfaces match the brief exactly: `WeekBoard` default export, named
  `CoverageStrip({coverage, targets})` and `WeekPicker()`, both module-scope.
  Cell click only sets local `selectedCell` state (visual ring via `CellChip`'s
  `selected` prop) — no `onCellClick` prop threading yet, correctly deferred to
  Task 16 per the brief.
- `CoverageStrip`'s `targets` prop is accepted but unused inside the component
  (it reads `r.target` off `coverage.days[d].roles[role]` instead) — this is
  brief-verbatim production code, not something I introduced, and the brief's
  interface line names the prop explicitly, so left as-is rather than "cleaning
  it up" during self-review.
- Hard rules respected: `WeekBoard`, `CoverageStrip`, `WeekPicker` are all
  defined at module scope (no inline component definitions); no raw hex, only
  token classes (`bg-primary`, `text-charcoal`, `bg-cream`, etc.), consistent
  with existing `chips.jsx`/`App.jsx` usage.
- No production code was altered to satisfy the test defect — only the test
  file gained an `afterEach(cleanup)` cross-test-isolation fix, which is
  test-infrastructure hygiene, not a change to what's being asserted.
