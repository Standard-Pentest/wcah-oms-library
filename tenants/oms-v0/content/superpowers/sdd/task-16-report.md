# Task 16 report: Week Board editing — cell editor, rail, bench with drag

## Files

- Created: `src/ui/RailPanel.jsx` (verbatim from brief)
- Modified: `src/ui/WeekBoard.jsx` (full revision, verbatim from brief)
- Created: `src/ui/WeekBoardEditing.test.jsx` (verbatim from brief)

All three transcribed exactly as specified in `.superpowers/sdd/task-16-brief.md`. No
deviations from the brief's code were needed — the tests passed against the
brief-supplied production code without modification.

## Step 2: RED evidence

`npx vitest run src/ui/WeekBoardEditing.test.jsx` before implementation:

```
PASS (0) FAIL (4)

1. week board editing shows the seeded soft violation in the rail
   TestingLibraryElementError: Unable to find an element with the text: /under their 40h standard/.
   ...
```

All 4 tests failed as expected — no `CellEditorBar`, no `RailPanel`, no rail column
existed yet on `WeekBoard.jsx`.

## Step 4: GREEN evidence

`npx vitest run src/ui`:

```
PASS (7) FAIL (0)
```

7 = 4 new (`WeekBoardEditing.test.jsx`) + 2 existing (`WeekBoard.test.jsx`) + 1
(`App.test.jsx`).

Full suite, `npx vitest run` (via `rtk proxy` for unfiltered raw output):

```
 Test Files  18 passed (18)
      Tests  74 passed (74)
   Start at  23:10:49
   Duration  932ms
```

74/74 total, pristine. Grepped the raw log for `act(`, `warning`, `not wrapped`,
`console.error`, `deprecat` — zero hits. No act() warnings, no console noise.

## Browser verification (Step 4)

Launched the dev server (`npm run dev`, port 5174) and drove it via the Browser
pane against a fresh tab with a cleared Vite dep cache. Confirmed live:

1. Rail shows the seeded soft violation ("Gardner, Theresa is 16h under their 40h
   standard...") and the Rulebook section (15 rules, each with flexibility
   `<select>` and enable `<checkbox>`) when nothing is selected.
2. Clicked Prado, Carla's Tuesday RVT cell → `CellEditorBar` appeared with all 7
   role buttons + OFF + Clear override + Close; rail's Person section showed
   "Prado, Carla / RVT · 30h scheduled / 30h standard / Tue–Thu only; pull #6".
3. Clicked OFF → coverage strip Tue column flipped to `SHORT 1`, rail showed
   `HARD — RVT short 1 on Tue (2 of 3)` plus three pull-order suggestions (Dimino,
   Prado, Sharko) each with an Apply button and a `gaps -1 · hard -1` impact badge.
4. Clicked Apply on "Add Dimino, Aaron to RVT on Tue" → Tue coverage returned to
   `ON TARGET` (3/3), the hard violation disappeared, Dimino's Tuesday cell now
   reads "RVT", and an INFO-severity overtime violation appeared for Dimino (50h)
   — the rulebook cascading live and honestly, exactly as designed.

This matches the brief's Step 4 browser-check script (cell → OFF → hard violation
→ Apply → back to ON TARGET) end to end.

### Bench drag — not exercised end-to-end

The bench drawer and `@dnd-kit` wiring were not driven through an actual
pointer-drag in the browser pane; the pane's `scroll` action twice timed out and
blanked the render mid-session (recovered cleanly via a hard navigate — see
Environment note below), and retrying the same flaky action wasn't going to
produce a different result. Confidence in the drag path instead comes from:

- Code inspection: `onDragEnd` in `WeekBoard.jsx` dispatches
  `{ type: 'SET_OVERRIDE', weekId, staffId, day, value: { role: staff.role } }` —
  byte-identical override shape to what `CellEditorBar`'s role buttons send
  (`set({ role })`) and what `suggestions.js:67` sends
  (`value: { role }`), i.e. the exact same reducer path already proven live in
  step 4 above (Apply used this shape and correctly moved Tue from 2/3 to 3/3).
- `buildWeek` (`src/domain/build.js:48-57`) consumes `{ role, ...opts }` via
  `shift(role, opts)`, producing a full `{kind:'shift', role, hours:10}` cell —
  confirmed by reading the source, not assumed.
- `GridCell`'s `useDroppable` is `disabled: Boolean(cell)`, so drops only land on
  empty cells, matching the brief's "dropping a chip on that same person's
  **empty** day cell" spec; drops on other people's cells are no-ops because
  `onDragEnd` checks `staffId !== active.id`.

This is inspection-based confidence on the DnD wiring itself, not a live
pointer-drag observation. Flagging as the one open item rather than asserting it
sight-unseen.

## Two concerns raised by self-review, both checked and cleared

1. **Does a role-button edit (`set({role})`) actually count toward coverage, or
   does it silently no-op?** Traced `buildWeek`'s override step (`build.js:48-57`):
   `{ role, ...opts }` → `shift(role, opts)` → `{kind:'shift', role, hours:10}`.
   Identical shape and identical code path to the suggestion Apply already
   verified live in the browser (step 4 above, Dimino's Tue cell). Not a gap —
   verified, not just asserted.
2. **`RailPanel`'s `staff.constraints.notes` is unguarded past `staff.constraints`
   — does any of the 28 roster members lack a `constraints` object and crash the
   rail on selection?** Checked via a one-off Node import of
   `SEED_ROSTER`: all 28 entries have a `constraints` object (`missing
   constraints object: []`). 6 have `constraints` without a `.notes` key, which
   is harmless (`undefined && ...` renders nothing). No crash risk.

## Environment note (not a code concern)

Early in browser verification, a stale tab hit React's "Invalid hook call"
warning inside `<DndContext2>` right after Vite logged `✨ new dependencies
optimized: @dnd-kit/core` / `optimized dependencies changed. reloading` — a
known Vite mid-session dependency-optimization hiccup, not a bug in
`WeekBoard.jsx`/`RailPanel.jsx`. Confirmed by killing the dev server, clearing
`node_modules/.vite`, restarting, and opening a **fresh** tab: zero console
errors, and the full click → OFF → violation → Apply flow worked cleanly (see
Step 4 evidence above). No code change was made in response to this — it was
purely dev-server cache staleness.

## Commit

```
feat(ui): cell editing, violation rail with one-click repairs, bench drag

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
```

`git add src/ui` only (the three intended paths: modified `WeekBoard.jsx`, new
`RailPanel.jsx`, new `WeekBoardEditing.test.jsx`).

## Self-review summary

- Transcription verified against the brief line-by-line for both new files and
  the full `WeekBoard.jsx` revision; no drift.
- `CoverageStrip`'s dropped `targets` prop confirmed unreferenced anywhere else
  in the tree (`grep -rn "CoverageStrip" src/`) — matches the brief's note that
  Task 15's test never used it.
- No production code was altered to satisfy a test; no assertion was weakened;
  the brief's tests passed as-is against the brief's production code.
- Only open item: bench drag verified by code inspection + shared-code-path
  reasoning, not a live pointer-drag observation (see above). Recommend a follow-up
  visual smoke test of the bench in a future session if that path matters for the
  demo.
