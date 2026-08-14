# Task 19: Time-Off Import screen + roster paste parser — report

## Summary

Created `src/import/roster-paste.js` (ImportAdapter #2, pure parser) and
`src/ui/ImportScreen.jsx` (paste → parse → preview/confirm → apply), both
transcribed verbatim from the brief. Registered `{ key: 'import', label:
'Time Off', Component: ImportScreen }` in `App.jsx`'s `SCREENS` (plus the
import), changing nothing else in that file. One brief-supplied test
assertion (`screen.getByText('PAID')`) was genuinely broken against the
brief's own fixture and production code — fixed test-only, documented below.
No production code was changed from the brief's Step 3 text.

## Step 1 — failing tests written

`src/import/roster-paste.test.js` and `src/ui/ImportScreen.test.jsx` created
exactly per brief. No `afterEach(cleanup)` added — RTL cleanup runs
automatically via `src/test-setup.js` per the infra note.

## Step 2 — RED evidence

```
npx vitest run src/import/roster-paste.test.js src/ui/ImportScreen.test.jsx
```

Result: both suites failed at collection, before any assertion ran:

```
"Cannot find module './roster-paste.js' imported from
 .../src/import/roster-paste.test.js"
"Failed to resolve import \"./ImportScreen.jsx\" from
 \"src/ui/ImportScreen.test.jsx\". Does the file exist?"
```

Confirms the tests exercise real (missing) modules, not a vacuous pass.

## Step 3 — implementation

- `src/import/roster-paste.js` — verbatim from the brief. Pure (no React, no
  timestamps/ids). Parses tab-separated roster rows into staff records
  (`id` = slug of display name, `pattern` keyed by `DAYS`, `standardHours:
  40`), flagging `bad-row` (fewer than 4 columns) and `unknown-role` issues.
- `src/ui/ImportScreen.jsx` — verbatim from the brief. Textarea → `Parse`
  (calls `parsePaylocityTimeOff(text, state.roster)`) → preview table +
  issues list (unknown-employee issues get a `Use <name>` button wired to
  `adopt`, which patches `staffId` onto the matching record) → `Apply N
  request(s)` filters to `staffId`-having rows, assigns
  `id: crypto.randomUUID()` **at dispatch** (not in the reducer, not in the
  parser), dispatches `ADD_REQUESTS`, and reports `"N added · M skipped"`.
- `src/ui/App.jsx` diff:

```diff
@@ -3,6 +3,7 @@ import { SchedulerProvider, useScheduler } from '../state/SchedulerContext.jsx';
 import { createIdbStore } from '../state/persistence.js';
 import WeekBoard from './WeekBoard.jsx';
 import Dashboard from './Dashboard.jsx';
+import ImportScreen from './ImportScreen.jsx';

 const appStore = createIdbStore();

@@ -10,6 +11,7 @@ const appStore = createIdbStore();
 const SCREENS = [
   { key: 'dashboard', label: 'Dashboard', Component: Dashboard },
   { key: 'board', label: 'Week Board', Component: WeekBoard },
+  { key: 'import', label: 'Time Off', Component: ImportScreen },
 ];
```

## Environment check: `crypto.randomUUID` under jsdom

The task note flagged that jsdom might not provide `crypto.randomUUID` in
this environment. Verified empirically with a throwaway probe test
(`// @vitest-environment jsdom`, `expect(typeof crypto.randomUUID).toBe
('function')`) run via `npx vitest run` and then deleted — it passed. This
project's Vitest (v4.1.10) on Node v26.5.0 exposes Node's global `Crypto`
(with `randomUUID`) even under the `jsdom` test environment, so no shim was
needed anywhere (not in `test-setup.js`, not in production code). Decision:
no change made. If this ever regresses (e.g. a jsdom/vitest downgrade), the
correct fix is a `test-setup.js`-level polyfill, not a production-code
change — `crypto.randomUUID()` at dispatch is the brief's explicit contract
and is not "genuinely unsafe."

## Genuinely broken assertion: duplicate `'PAID'` text

**Root cause:** the brief's `ImportScreen.test.jsx` fixture has two rows —
`Hobbs, Keith` (`hours: 10, days: 1`) and `Benitez, Melinda` (`hours: 40,
days: 4`). `classifyRequest` computes `hours / days`: `10/1 = 10` and
`40/4 = 10` — both `≥ 8`, so **both** rows classify `PAID`. The brief's
`ImportScreen.jsx` renders every parsed record in the preview table
regardless of match status (unmatched rows still appear, with `staffId:
null`, so the manager can see what's being skipped) — so both `PAID` cells
land in the DOM. `screen.getByText('PAID')` throws
`TestingLibraryElementError: Found multiple elements with the text: PAID`
because RTL's singular query requires exactly one match. This is a fixture
property (both rows happen to average 10 hrs/day), not a parser or component
defect — verified by reading the failure output's DOM dump, which showed
two `<td class="font-semibold">PAID</td>` from the two rendered rows.

**Fix (test-only, minimal, non-weakening):**

```diff
-    expect(screen.getByText('PAID')).toBeTruthy();
+    // Brief's fixture makes both rows classify PAID (10/1 and 40/4 both === 10 hrs/day),
+    // so the brief's `getByText('PAID')` throws "found multiple elements". Widened to
+    // getAllByText + exact-length assertion — strictly stronger than the original
+    // singular check, and it still fails if the unmatched row silently drops from
+    // the preview (the count would go to 1).
+    expect(screen.getAllByText('PAID')).toHaveLength(2);
```

This is strictly *stronger* than the brief's original: `getByText` already
asserted "exactly one" (strictly — that's exactly why it threw against two
matches), so a same-strength fix would only widen it to "at least one."
`toHaveLength(2)` instead pins the true, exact count, so it still catches a
regression where the unmatched Benitez row got dropped from the preview
entirely (contract requires unmatched rows to render and be reported, not
silently vanish) — that regression would drop the count to 1 and fail.
Rejected alternatives: `getAllByText('PAID')[0]` or `.length > 0` were
considered and discarded because both would pass even if the unmatched row
disappeared from the preview, silently losing coverage of that contract.

No production code was touched to make this pass.

## Step 4 — GREEN evidence

```
npx vitest run src/import/roster-paste.test.js src/ui/ImportScreen.test.jsx --reporter=verbose
```

```
 ✓ src/import/roster-paste.test.js > roster paste parser > parses a roster row with patterned days and time notes 2ms
 ✓ src/import/roster-paste.test.js > roster paste parser > flags rows with unknown roles 0ms
 ✓ src/ui/ImportScreen.test.jsx > time-off import > previews classifications and skips unmatched rows on apply 44ms

 Test Files  2 passed (2)
      Tests  3 passed (3)
```

Full suite:

```
npx vitest run --reporter=verbose
```

```
 Test Files  22 passed (22)
      Tests  83 passed (83)
   Start at  23:38:12
   Duration  900ms
```

83 tests total (80 prior + 3 new), all green. `App.test.jsx` (`boots from
seed, shows the horizon weeks`) still passes unmodified — adding the
`import` entry to `SCREENS` doesn't affect its assertions. Grepped the full
run's stdout/stderr for `warn`/`act(` — zero matches. No act() warnings, no
console errors. Pristine.

## Step 5 — commit

```
git add src/import src/ui
git commit -m "feat: time-off import screen with preview/confirm, roster paste parser

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

## Self-review

- Hard rules respected: `ImportScreen` is the only component in its file,
  defined at module scope (not nested). Token classes only (`bg-primary`,
  `text-charcoal/60`, `border-charcoal/20`, `bg-success`,
  `text-success-text`, `bg-amber-soft`, `text-amber-text`,
  `border-charcoal/10`, `border-charcoal/5`, `hover:bg-primary-hover`) —
  grepped the file for raw hex (`#[0-9a-fA-F]{3,8}`) and found none.
- `src/import/roster-paste.js` is pure: no React import, no `Date.now()`/
  `setInterval`, no id generation beyond a deterministic `slug()` of the
  display name (not `crypto.randomUUID`, not time-based) — matches
  "`src/import` stays pure (no React)."
- Request ids are assigned only at dispatch time in `ImportScreen.apply`
  (`{ ...r, id: crypto.randomUUID() }`), never inside `parsePaylocityTimeOff`
  (Task 5, unmodified) and never inside the `ADD_REQUESTS` reducer case in
  `src/state/store.js` (unmodified — `return { ...state, requests:
  [...state.requests, ...action.records] }`), matching "request ids are
  assigned at dispatch... never in the reducer or domain."
- Confirmed `parseRosterPaste`'s regex (`CELL`) and `shift`/`ALL_ROLES` from
  `src/domain/cells.js`, and `DAYS` from `src/domain/calendar.js`, all match
  the brief's expectations — traced the `RVT (7:30–4:30)` and `PB` cells by
  hand against the regex before running, and against `ALL_ROLES =
  ['VA','RVT','HSS','PHARM','MONITOR','ADMIN','PB','TECH_NC']`.
- Confirmed `Hobbs, Keith` exact-matches `SEED_ROSTER` (`id: 'hobbs-keith'`)
  and `Benitez, Melinda` matches no roster entry (no `Benitez` anywhere in
  `src/data/roster.js`, and last-name fuzzy match also fails) — this is what
  makes the fixture produce exactly one `unknown-employee` issue and exactly
  one ready record, matching `Apply 1 request` / `1 request added · 1
  skipped`.
- `npm run build` not re-run in this task since Step 4b wasn't requested in
  this brief (unlike Task 18's); the full vitest suite passing is the
  requested gate. Can run on request.

### Concern to flag (not blocking): `adopt`/`Use <name>` path has zero test coverage

`ImportScreen.jsx`'s issues list only shows a `Use <name>` button for issues
with a `suggestion` (fuzzy-matched unmatched employee); `adopt()` is the
handler that patches `staffId` onto the matching record when clicked. This
task's fixture never exercises that path: `matchStaff('Benitez, Melinda',
roster)` returns `{staffId: null, suggestion: null}` (no `Benitez` in
`SEED_ROSTER`, and the last-name fuzzy match also misses), so the issue has
no `suggestion` and the button never renders. Grepped for `suggestion` across
both test files — `src/import/paylocity.test.js` does exercise
`matchStaff`'s fuzzy-suggestion behavior at the *parser* layer (`issues[0]`
`toMatchObject({ suggestion: 'gallegos-angie' })`), but no test — not this
one, not any existing one — renders `ImportScreen` with a suggestion-bearing
issue and clicks `Use <name>`. So `adopt()` and its button are committed,
brief-supplied production code with no UI-level test coverage. Not a defect
(the brief's fixture doesn't call for it and adding a test wasn't asked),
but a real gap worth flagging for whoever picks up Task 20 or does a
follow-up review pass.

No other concerns. Status: DONE_WITH_CONCERNS — (1) one brief-supplied test
assertion required a minimal, strictly-stronger test-only fix (documented
above), (2) the `adopt`/`Use <name>` resolution path is untested.
