# Task 21 Report: Publish — CSV, print, JSON backup

## Summary

Transcribed `src/ui/exporters.js` and `src/ui/PublishScreen.jsx` verbatim from the
brief, plus their two test files, and registered `PublishScreen` in `App.jsx`
`SCREENS` (only the two lines the brief specified — import + registry entry).
No test-file or production-file deviations from the brief were needed.

## Pre-flight interface check

Before transcribing, confirmed every symbol the brief's code references
actually exists with the expected shape:

- `selectWeek(state, weekId)` in `src/state/store.js:148` — returns
  `{ week, built, targets, coverage, violations, suggestions }`.
- `serialize`/`deserialize`/`createMemoryStore` in `src/state/persistence.js`.
- `REPLACE_STATE` (`return action.state`) and `PUBLISH_WEEK`
  (`patchWeek(state, action.weekId, { status: 'published' })`) reducer cases
  in `src/state/store.js:54` / `:131`.
- `DAYS`, `dateForDay`, `fmtShort` in `src/domain/calendar.js`.
- `formatCell` in `src/domain/cells.js`.
- `WeekPicker` exported from `src/ui/WeekBoard.jsx:13`.
- `SEED_ROSTER` (28 entries) in `src/data/roster.js`, with
  `gardner-theresa` → `displayName`/`paylocityName` both `"Gardner, Theresa"`
  (comma triggers CSV quoting, as the test expects) and an RVT pattern
  including `7:30–4:30` shifts.
- `WEEK_AUG02`, `REQUESTS_AUG02` in `src/data/week-aug02.js`; `buildWeek` in
  `src/domain/build.js`.
- `state.ui.selectedWeek` as the week-picker cursor (`initialState` in
  `src/state/store.js:33`).

All matched exactly; no assertion needed adjustment.

## Step 1 — failing tests written

- `src/ui/exporters.test.js` — verbatim from brief.
- `src/ui/PublishScreen.test.jsx` — verbatim from brief.

## Step 2 — RED evidence

```
$ npx vitest run src/ui/exporters.test.js src/ui/PublishScreen.test.jsx
```

Both suites failed at import resolution, as expected (modules not yet created):

```
{"testResults":[
  {"status":"failed","message":"Failed to resolve import \"./PublishScreen.jsx\" from \"src/ui/PublishScreen.test.jsx\". Does the file exist?"},
  {"status":"failed","message":"Cannot find module './exporters.js' imported from /Users/hinchk/WestCoast.Vet/scheduler/src/ui/exporters.test.js"}
]}
```

## Step 3 — implementation

- `src/ui/exporters.js` — `weekCsv(roster, built)`, verbatim from brief.
- `src/ui/PublishScreen.jsx` — verbatim from brief (week picker, print-only
  grid, Download CSV / Print / Mark published / Export JSON backup / Import
  JSON backup with `window.confirm` gate before `REPLACE_STATE`).
- `src/ui/App.jsx` — added `import PublishScreen from './PublishScreen.jsx';`
  and `{ key: 'publish', label: 'Publish', Component: PublishScreen }` in
  `SCREENS`. Diff is exactly those two lines (`git diff --stat`: `+2 -0`).

## Step 4 — GREEN evidence

```
$ npx vitest run src/ui/exporters.test.js src/ui/PublishScreen.test.jsx
 RUN  v4.1.10 /Users/hinchk/WestCoast.Vet/scheduler
 Test Files  2 passed (2)
      Tests  2 passed (2)
```

Full suite:

```
$ rtk proxy npx vitest run
 RUN  v4.1.10 /Users/hinchk/WestCoast.Vet/scheduler
 Test Files  25 passed (25)
      Tests  88 passed (88)
```

25 test files on disk (`find src -name "*.test.js*" | wc -l` → 25), 88 tests
total (86 prior + 2 new), matching the task's expected count exactly.

act()-warning check, with a positive control to make sure the verbose stream
wasn't being summarized away by the `rtk` proxy hook (it did compress plain
`npx vitest run` to `PASS (88) FAIL (0)` earlier in this session, so a blind
grep against filtered output would prove nothing):

```
$ rtk proxy npx vitest run --reporter=verbose > verbose-run.log 2>&1
$ grep -cE "publish screen|weekCsv" verbose-run.log   # positive control
2                                                       # → stream is real, not filtered
$ grep -inE "not wrapped in act|act\(\.\.\.\)" verbose-run.log
                                                         # → zero matches
```

No act() warnings anywhere in the suite.

## Build

```
$ npm run build
vite v6.4.3 building for production...
✓ 58 modules transformed.
dist/index.html                   0.40 kB
dist/assets/index-BZSmv8eg.css   26.31 kB
dist/assets/index-N6z4nAeH.js   246.44 kB
✓ built in 360ms
```

Succeeds cleanly.

## Design-token / hard-rule self-review

- No raw hex in either new file (`grep -n "#[0-9a-fA-F]\{3,6\}"` → none).
- Every token class the brief's JSX uses resolves in `src/index.css`
  `@theme`: `--color-primary-hover`, `--color-success`,
  `--color-success-text` (new to this task's files; `--color-danger` /
  `--color-danger-soft` already proven live elsewhere, e.g. `App.jsx`'s
  storage banner).
- `.no-print` is correctly scoped inside `@media print { .no-print { display:
  none !important; } }` (`src/index.css:60-62`) — confirmed the print
  feature is functionally wired (the schedule table, not marked `no-print`,
  is the only thing left visible on `window.print()`), not merely present in
  markup with no backing rule.
- `PublishScreen` and its inner `download` helper are both defined at module
  scope — no nested component definitions.
- `App.jsx` diff is exactly the two brief-specified lines; nothing else in
  that file changed.

## Commit

```
1565f9d feat(ui): publish screen — CSV export, print grid, JSON backup/restore

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
```

5 files changed, 153 insertions(+): `src/ui/App.jsx` (modified),
`src/ui/PublishScreen.jsx`, `src/ui/PublishScreen.test.jsx`,
`src/ui/exporters.js`, `src/ui/exporters.test.js` (new). Working tree clean
after commit.

## Concerns

None. No brief-vs-code mismatch, no environment shim needed (the brief's test
never clicks Download/Print/Import, so `URL.createObjectURL`/`window.print`
were never exercised), no act() warnings, build green, design tokens and
`no-print`/`@media print` wiring all verified present and correctly scoped.

Status: **DONE**
