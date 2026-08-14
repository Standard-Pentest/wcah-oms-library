# Task 14 Report: Provider, shell, chips

## Summary

Implemented `SchedulerProvider`/`useScheduler` (debounced autosave over a
pluggable store), the app `Shell` with a module-scope `SCREENS` registry,
presentational chips (`RoleTag`, `CellChip`, `VarianceBadge`), a real
`MonthGlance` screen wired to `selectMonth`, and `.claude/launch.json`.
`src/ui/App.jsx` replaces the Task 1 stub. All files transcribed verbatim
from the brief **except one line in the test**, documented below.

## Step 1 — failing test written

`src/ui/App.test.jsx` created per brief Step 1, verbatim initially.

## Step 2 — RED

```
$ npx vitest run src/ui/App.test.jsx
```

Result (via rtk-filtered JSON summary):

```json
{"numTotalTestSuites":1,"numPassedTestSuites":0,"numFailedTestSuites":1,...,
 "testResults":[{"assertionResults":[],"status":"failed",
   "message":"Failed to resolve import \"../state/SchedulerContext.jsx\" from \"src/ui/App.test.jsx\". Does the file exist?",
   "name":"/Users/hinchk/WestCoast.Vet/scheduler/src/ui/App.test.jsx"}]}
```

Matches the brief's expected failure (module not found).

## Step 3 — implement

Created:
- `src/state/SchedulerContext.jsx` — verbatim from brief.
- `src/ui/chips.jsx` — verbatim from brief.
- `.claude/launch.json` — verbatim from brief.

Replaced:
- `src/ui/App.jsx` — verbatim from brief (Task 1 stub removed).

## Deviation: test assertion had to be changed (concern)

The brief's Step 1 test, run verbatim against the brief's Step 3
implementation, does **not** pass. Root cause:

```jsx
expect(await screen.findByText(/Week of Aug 2/)).toBeTruthy();
```

is an unanchored regex. `MonthGlance` renders `Week of {fmtShort(w.weekId)}`
as two sibling text nodes inside one `<div>`; Testing Library concatenates
direct text-node children of an element into that element's matchable text,
so the div's text is `"Week of Aug 2"` for the first horizon week and
`"Week of Aug 23"` for the fourth. The regex `/Week of Aug 2/` substring-matches
**both** (`"Week of Aug 23"` starts with `"Week of Aug 2"`), so
`findByText` throws:

```
TestingLibraryElementError: Found multiple elements with the text: /Week of Aug 2/
```

captured verbatim from the actual run. The brief's Step 1 and Step 3 code
blocks are mutually unsatisfiable as written — the test assertion, not the
shipped component, is the bug. I did not change `MonthGlance`'s markup (e.g.
wrapping the date in its own element) to route around this, since that would
bend shipped UI to accommodate a test defect, and Task 18 replaces this
registry entry anyway.

Fix applied — one-token change, exact-string match instead of unanchored
regex:

```diff
-    expect(await screen.findByText(/Week of Aug 2/)).toBeTruthy();
+    expect(await screen.findByText('Week of Aug 2')).toBeTruthy();
```

`screen.getByText(/Week of Aug 23/)` on the next line was left untouched —
it was already unique and still passes.

## Step 4 — GREEN

```
$ npx vitest run src/ui/App.test.jsx   (raw output via rtk proxy)
 RUN  v4.1.10 /Users/hinchk/WestCoast.Vet/scheduler
 Test Files  1 passed (1)
      Tests  1 passed (1)
```

Full suite:

```
$ npx vitest run   (raw output via rtk proxy)
 RUN  v4.1.10 /Users/hinchk/WestCoast.Vet/scheduler
 Test Files  16 passed (16)
      Tests  68 passed (68)
   Duration  342ms
```

68 total tests, all green — matches the expected count in the task
description.

**act() warning check** (task explicitly calls this out as a thing to
verify, not suppress): captured raw stdout/stderr from the full-suite run
(via `rtk proxy`, bypassing rtk's JSON-summary filtering, which would hide
stderr noise) and grepped for `not wrapped in act`, `Warning:`,
`Cannot log after tests`, `console.error`, `console.warn`. Zero matches —
the full output is 9 lines, just the vitest run banner and summary. No
React act() warnings, no console noise. The suite is pristine.

## Step: build

```
$ npm run build   (raw output via rtk proxy)
vite v6.4.3 building for production...
✓ 42 modules transformed.
dist/index.html                   0.40 kB │ gzip:  0.27 kB
dist/assets/index-BZSmv8eg.css   26.31 kB │ gzip:  5.21 kB
dist/assets/index-3X8sYMEW.js   173.89 kB │ gzip: 55.71 kB
✓ built in 297ms
```

Build succeeds — first task touching the app entry, confirmed working.
(`SCREENS` references `MonthGlance` above its declaration in `App.jsx`;
this is fine because `function MonthGlance() {}` is a hoisted function
declaration, and the build/runtime both confirm it works.)

## Commit

```
git add src/state/SchedulerContext.jsx src/ui .claude/launch.json
git commit -m "feat(ui): provider with autosave, app shell, chips, month glance

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

Commit `7461d84b50c2651d773519648853538ba3136af9`. Verified `.claude/`
was not gitignored (`git check-ignore -v .claude/launch.json` → no match)
and confirmed via `git show --stat HEAD` that all 5 files are present in
the commit, including `.claude/launch.json`:

```
 .claude/launch.json            | 11 ++++++
 src/state/SchedulerContext.jsx | 43 +++++++++++++++++++++++
 src/ui/App.jsx                 | 79 +++++++++++++++++++++++++++++++++++++++---
 src/ui/App.test.jsx            | 20 +++++++++++
 src/ui/chips.jsx               | 62 +++++++++++++++++++++++++++++++++
 5 files changed, 211 insertions(+), 4 deletions(-)
```

## Self-review

- `SchedulerContext.jsx`, `chips.jsx`, `App.jsx`, `.claude/launch.json` —
  byte-for-byte transcriptions of the brief; diffed against the brief's
  code blocks to confirm.
- `App.test.jsx` — transcribed verbatim except the one documented,
  necessary regex→string fix on line 17.
- Components defined at module scope only (repo hard rule) — `MonthGlance`,
  `StorageBanner`, `Shell`, `App` are all top-level function declarations
  in `App.jsx`; `RoleTag`, `CellChip`, `VarianceBadge` are top-level in
  `chips.jsx`. No inline component definitions.
- Token classes only — every className in the new/changed files uses
  `@theme` tokens already defined in `src/index.css` (`primary`, `accent`,
  `charcoal`, `success`/`success-text`, `amber-soft`/`amber-text`,
  `danger`/`danger-soft`, `glass`/`glass-strong`/`glass-border`) or the
  `.glass-panel`/`.no-print` utility classes already defined there. No raw
  hex anywhere in the diff.
- `SchedulerProvider` correctly consumes `reducer`/`seedState` (Task 12)
  and any store conforming to the `{load, save, clear}` interface (Task 13,
  `createIdbStore`/`createMemoryStore` both satisfy it).
- `Shell` is exported for tests, per the brief's interface list.
- No jsdom/vitest toolchain changes were needed — the `// @vitest-environment
  jsdom` pragma worked out of the box with the existing `jsdom` and
  `@testing-library/react` devDependencies from Task 1. No vitest.config.js
  or setup file existed or was added.

## Concerns

1. **Test-brief deviation (documented above).** The brief's Step 1 test
   file, run verbatim, fails against the brief's own Step 3 implementation
   due to an unanchored regex matching two elements. Fixed with a one-line,
   minimal change (regex → exact string) on the assertion only; no
   production code was altered to work around it. Flagging per task
   instructions to report deviations as concerns rather than silently
   "fixing" and moving on.

No other concerns. Test suite and build are both clean.
