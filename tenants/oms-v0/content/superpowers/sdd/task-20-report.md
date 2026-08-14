# Task 20 report: Roster screen

Status: **DONE_WITH_CONCERNS** (one documented test-only fix; see below)

## Summary

Added `src/ui/RosterScreen.jsx` (roster table + `StaffEditor`, `PullOrderPanel`,
`RotationsPanel`, `RosterPasteBox`, all module-scope), `src/ui/RosterScreen.test.jsx`,
and registered the screen in `App.jsx`'s `SCREENS`. Final suite: 86/86 tests green
across 23 files, no `act()` warnings.

## DELEGATION (agy-delegate, flash tier)

**Used, failed, abandoned on coordinator instruction.**

- Command run exactly per directive: `agy-delegate --tier flash --yolo --dir /Users/hinchk/WestCoast.Vet/scheduler "Read .superpowers/sdd/task-20-brief.md. Create src/ui/RosterScreen.jsx ..."`, launched in the foreground with a 600000 ms (10 min) Bash timeout as instructed.
- The command exceeded the Bash tool's hard 600s foreground cap and was auto-moved to background by the harness (`task b80sm5ugk`) — this was not a choice I made; the tool forced it despite the "do not background it" directive, because 600s is the tool's ceiling regardless of the requested timeout value.
- Set up an active `Monitor` to wait for the task's output file to gain content, honoring "don't end your turn while it runs" as closely as tooling allowed.
- **Result: zero output, ever.** The background output file (`b80sm5ugk.output`) was created at 23:44:55 and remained 0 bytes through 00:00:50 (current time at write-up) — roughly **26 minutes of total elapsed wall-clock** (≈10 min forced-foreground + ≈16 min further background wait) with nothing produced. `src/ui/RosterScreen.jsx` never appeared on disk. `ps` showed `Antigravity 2.app` processes accumulating CPU time throughout, so the backend was doing *something*, but never surfaced a result, error, or exit.
- The coordinator interrupted mid-wait, confirmed no agy process was usefully alive and the target file didn't exist, and directed: stop waiting, do not retry agy, write the file directly. Complied immediately — no second delegation attempt was made.
- Per the coordinator's note, **this is the second such failure** for this delegation pattern on this project.

**Net verdict: delegation did not pay off.** Zero net value delivered — no file, no error signal, no partial progress — for ~26 minutes of wall-clock, against a fallback (direct transcription) that took a few minutes end-to-end including verification. For a bulk-but-small single-file transcription task like this (226 lines, fully specified verbatim in the brief), direct writing is strictly faster and more reliable than agy flash-tier delegation as currently configured. Recommend not routing this class of task (verbatim transcription of a fully-specified code block) through agy-delegate again without a much tighter internal timeout and a verified working invocation first.

## Step 1–2: failing test (RED)

Wrote `src/ui/RosterScreen.test.jsx` per brief Step 1 verbatim. Ran:

```
npx vitest run src/ui/RosterScreen.test.jsx
```

Result: **FAIL** — `Failed to resolve import "./RosterScreen.jsx" from "src/ui/RosterScreen.test.jsx". Does the file exist?` (module not found, as expected).

## Step 3: implementation + fidelity verification

Since delegation produced nothing, wrote `src/ui/RosterScreen.jsx` directly by transcribing the brief's Step 3 code block. Verified byte-fidelity by extracting the brief's fenced code block into a scratch file and diffing:

```
diff <extracted-brief-block> src/ui/RosterScreen.jsx   → no output (identical)
md5 both files                                          → c1a72661902dc996858d51e152a83b72 (match)
```

226 lines, byte-identical, confirmed by both `diff` and MD5 checksum.

## Test-only fix (brief-supplied test vs. brief-supplied seed data)

The brief's Step 1 test, run verbatim against the brief's Step 3 component and the
project's existing seed roster, **fails** — not because of a defect in the
component, but because of a genuine collision in brief-supplied seed data:

- `src/data/roster.js` seeds `alonzo-evelyn` with `displayName: 'Alonzo, Evelyn'`
  **and** `paylocityName: 'Alonzo, Evelyn'` — identical strings.
- `RosterScreen`'s table renders both fields as separate `<td>` cells in the same
  row (`Name` column then `Paylocity` column), per brief-supplied Step 3 code.
- The brief's test uses single-match queries (`screen.findByText('Alonzo, Evelyn')`,
  `screen.getByText('Alonzo, Evelyn')`) which throw `Found multiple elements with
  the text: Alonzo, Evelyn` because both cells match.

This is a data/test interaction bug, not a production bug: the component behaves
exactly as specified, and nothing in the domain model forbids `displayName ===
paylocityName`. Fixed minimally and test-only, preserving the original intent
(locate the row for "Alonzo, Evelyn", click it, assert its pattern updated) by
switching to the `All`-variant queries and taking the first match — the Name
column always renders before the Paylocity column in DOM order, so index `[0]`
deterministically resolves to the Name cell, not an arbitrary one:

```diff
   it('lists all 28 staff', async () => {
     mount();
-    expect(await screen.findByText('Alonzo, Evelyn')).toBeTruthy();
+    // Alonzo, Evelyn's seed paylocityName equals her displayName, so both the
+    // Name and Paylocity cells render this text — use the first (Name column,
+    // which is always first in DOM order) rather than a single-match query.
+    expect((await screen.findAllByText('Alonzo, Evelyn'))[0]).toBeTruthy();
     expect(screen.getAllByTestId('roster-row')).toHaveLength(28);
   });
   it('edits a pattern day and saves', async () => {
     mount();
-    fireEvent.click(await screen.findByText('Alonzo, Evelyn'));
+    fireEvent.click((await screen.findAllByText('Alonzo, Evelyn'))[0]);
     fireEvent.change(screen.getByLabelText('Pattern Mon'), { target: { value: 'VA' } });
     fireEvent.click(screen.getByRole('button', { name: 'Save' }));
-    const row = screen.getByText('Alonzo, Evelyn').closest('tr');
+    const row = screen.getAllByText('Alonzo, Evelyn')[0].closest('tr');
     expect(within(row).getByText(/Mon/)).toBeTruthy();
   });
```

No assertion was weakened: the test still requires the element to exist, still
clicks the correct row, and still verifies the pattern-day edit persisted through
save. The third test (`moves a pull-order entry up`) needed no change and passed
unmodified on the first run.

## Step 4: GREEN evidence

```
npx vitest run src/ui/RosterScreen.test.jsx
```
→ **PASS (3) FAIL (0)**

```
./node_modules/.bin/vitest run
```
→ **86/86 tests passed, 23/23 test files passed**, duration ~923ms. Grepped the
raw run output for `warning|act(|not wrapped` — no matches. Pristine, no `act()`
warnings.

## App.jsx registration — scope check

```
git diff src/ui/App.jsx
```
Confirmed exactly two lines added: the `RosterScreen` import and the
`{ key: 'roster', label: 'Roster', Component: RosterScreen }` SCREENS entry.
Nothing else in the file was touched.

## Commit

```
96514a6 feat(ui): roster screen — staff editor, pull order, paste import
```
3 files changed (`src/ui/App.jsx`, `src/ui/RosterScreen.jsx`,
`src/ui/RosterScreen.test.jsx`), message + `Co-Authored-By: Claude Fable 5
<noreply@anthropic.com>` trailer per brief and task instructions.

## Self-review

- Five components, all module-scope (no inline definitions) — satisfies the
  hard rule.
- Token classes only throughout (`bg-primary`, `text-charcoal`, `text-danger`,
  `border-charcoal/…`, etc.) — no raw hex found in the transcribed file.
- `structuredClone` used for the editor draft, consistent with the rest of the
  codebase's pattern for local-edit buffers.
- Reducer actions consumed (`UPSERT_STAFF`, `REMOVE_STAFF`, `SET_PULL_ORDER`,
  `UPSERT_ROTATION`, `REMOVE_ROTATION`) all exist in `src/state/store.js` and
  match the brief's stated interface exactly — verified by reading the reducer
  before transcribing.
- Seed data cross-checked before writing the test: `PULL_ORDER[0..1]` is
  `gallegos-angie, sharko-chloe`, matching the pull-order test's expectations.
- No per-file `afterEach(cleanup)` was added, per the RTL-cleanup infrastructure
  note.
- Concern to flag: the collision between `displayName` and `paylocityName` for
  `alonzo-evelyn` in `src/data/roster.js` is real seed data, not a test
  artifact — it will also affect any *other* future screen/test that queries
  by that employee's display name with a single-match assertion. Worth a note
  for whoever next touches roster seed data or writes roster-adjacent tests.
