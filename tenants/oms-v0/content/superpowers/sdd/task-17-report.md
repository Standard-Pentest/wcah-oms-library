# Task 17: Week Setup panel — report

## Summary

Created `src/ui/WeekSetupPanel.jsx` (collapsible DVM-count + rotation-toggle panel)
and its test `src/ui/WeekSetupPanel.test.jsx`, both transcribed verbatim from the
brief. Wired `<WeekSetupPanel weekId={weekId} />` into `src/ui/WeekBoard.jsx`
directly after the header row, before `CoverageStrip`. No brief-supplied assertion
required a test-only fix, and no production bug was found — the brief's Step 1
test and Step 3 component worked together against existing (Task 1-16) production
code without modification.

## Step 1 — failing test written

`src/ui/WeekSetupPanel.test.jsx` created exactly per brief (3 `it` blocks: DVM
count → VA target live update, confirm rotations on a provisional week, flip a
toggle → grid reacts). No `afterEach(cleanup)` added — RTL cleanup runs
automatically via `src/test-setup.js` per the infra note.

## Step 2 — RED evidence

```
npx vitest run src/ui/WeekSetupPanel.test.jsx
```

Result: `PASS (0) FAIL (3)`.

All 3 failures shared the same root cause:
`TestingLibraryElementError: Unable to find an accessible element with the role
"button" and name /Week Setup/` — the accessible-roles dump listed only the
week-picker buttons (Aug 2/9/16/23), grid cell chips, and empty-slot buttons; no
"Week Setup" toggle button existed yet because `WeekSetupPanel` hadn't been
created and `WeekBoard` didn't render it. This confirms the test was exercising
real (missing) behavior, not a typo.

## Step 3 — implementation

- `src/ui/WeekSetupPanel.jsx` created verbatim from the brief: collapsible panel
  gated by local `open` state, `rotations unconfirmed` badge when
  `!week.toggleConfirmed`, a DVM-count `<input type="number">` per day (`aria-label`
  `DVMs {day}`) dispatching `SET_DVM_COUNT`, a sorted rotation-toggle list
  (`staffName · day · role` with ON/OFF buttons) dispatching `SET_TOGGLE`, and a
  `Confirm rotations` button dispatching `CONFIRM_TOGGLES`.
- `src/ui/WeekBoard.jsx` diff (2 lines only, everything else untouched):

```diff
@@ -6,6 +6,7 @@ import { DAYS, dateForDay, fmtShort } from '../domain/calendar.js';
+import WeekSetupPanel from './WeekSetupPanel.jsx';

 const EDIT_ROLES = ['VA', 'RVT', 'HSS', 'PHARM', 'ADMIN', 'MONITOR', 'PB'];

@@ -143,6 +144,7 @@ export default function WeekBoard() {
+        <WeekSetupPanel weekId={weekId} />
         <CoverageStrip coverage={evaluated.coverage} />
         <CellEditorBar
```

## Step 4 — GREEN evidence

```
npx vitest run src/ui/WeekSetupPanel.test.jsx   →  PASS (3) FAIL (0)
npx vitest run src/ui                           →  PASS (10) FAIL (0)
```

Full suite, run through `rtk proxy npx vitest run` (bypassing rtk's summarizing
filter so stderr / act() warnings would surface rather than being collapsed into
`PASS (77) FAIL (0)`):

```
RUN  v4.1.10 /Users/hinchk/WestCoast.Vet/scheduler

 Test Files  19 passed (19)
      Tests  77 passed (77)
   Start at  23:20:34
   Duration  884ms (transform 667ms, setup 1.35s, import 997ms, tests 1.08s, environment 827ms)
```

77 tests total, all green, no stderr output, no act() warnings, no console
errors. Pristine.

## Step 5 — commit

```
git add src/ui
git commit -m "feat(ui): week setup panel — DVM counts and rotation confirmation

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

Result: commit `470cd98` on `feature/mvp-build` — 3 files changed, 133
insertions(+): `src/ui/WeekBoard.jsx` (modified, +2), `src/ui/WeekSetupPanel.jsx`
(new), `src/ui/WeekSetupPanel.test.jsx` (new).

## Self-review

- Hard rules respected: `WeekSetupPanel` is a single component defined at module
  scope (no components nested inside another); only token classes used
  (`bg-primary/10`, `text-amber-text`, `bg-amber-soft`, `border-charcoal/20`,
  etc.) — grepped the file for raw hex (`#[0-9a-f]{3,6}`) and found none.
- `WeekBoard.jsx` changed in exactly the two lines the brief specified (import +
  render call between the header row and `CoverageStrip`); no other lines
  touched.
- Reducer actions consumed (`SET_DVM_COUNT`, `SET_TOGGLE`, `CONFIRM_TOGGLES`)
  already existed in `src/state/store.js` from prior tasks — no reducer changes
  needed.

### Concern (not fixed — flagging for a future task)

`WeekSetupPanel`'s per-toggle-row buttons are labeled `ON` / `OFF`, and `OFF` is
also the accessible name of `CellEditorBar`'s clear-to-OFF button in the same
`WeekBoard` tree. `WeekBoardEditing.test.jsx` calls
`screen.getByRole('button', { name: 'OFF' })` (singular, not scoped to a
container) and still passes only because `WeekSetupPanel`'s `open` state
defaults to `false`, so its OFF buttons aren't in the accessible tree during
that test. This is latent, not a live defect, and the brief's component code is
verbatim, so I did not alter it. If a later task opens the Week Setup panel by
default, or a test opens it before asserting on `OFF`, that global query will
become ambiguous (`getByRole` throws on multiple matches) and will need
scoping (`within(...)`) at that point.
