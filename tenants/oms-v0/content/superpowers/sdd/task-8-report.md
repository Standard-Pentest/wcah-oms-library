# Task 8: Excel-parity test (the centerpiece) — Report

## Status
**DONE**

## Commits
- test(parity): engine reproduces the workbook's Aug 2-8 week exactly

## Tests
- Parity tests (3): all PASS
- Full suite (42 = 39 prior + 3 new): all PASS, pristine output

## Files created
1. `src/data/week-aug02.js` — `WEEK_AUG02` (real Aug 2–8, 2026 week: DVM counts, toggle
   states from `proposeToggles(SEED_ROTATIONS, '2026-08-02')`, and 7 staff override blocks
   transcribed from the workbook's Overrides sheet) and `REQUESTS_AUG02` (9 roster-matched
   Time-Off Input rows, ids `req-1`…`req-9`).
2. `src/data/expected-aug02.js` — `EXPECTED_GRID` (29 staff rows transcribed cell-for-cell
   from the Proposed Schedule sheet), `EXPECTED_COVERAGE` (VA/RVT/HSS/PHARM/ADMIN
   scheduled+target arrays in Sun…Sat order from the Coverage Check sheet), and
   `EXPECTED_STATUS` (7 day statuses, including Thursday's `OVER +1`).
3. `src/data/parity-aug02.test.js` — three assertions: grid cell-for-cell, coverage
   scheduled/target per role/day, and day status strings.

All three files were written verbatim from the brief's fenced code blocks. Verified with a
mechanical diff (`difflib.unified_diff`) against the brief's `.md` source after writing —
all three came back **IDENTICAL**, not just eyeballed. Unicode transcription was checked the
same way: en-dash in `'7:30–4:30'` (Gardner Wed/Fri) and middle dot in `'Tech NC · until
1:00 PM'` (Corneau Lopez Tue) and `'VA · EARLY LEAVE'` (Escalante Tue) all confirmed present
as the correct Unicode code points, not ASCII substitutes or mojibake.

## Fixture fidelity method

1. Transcribed the brief's Step 1 code blocks into the two data files exactly as given —
   the brief states these are ground truth transcribed from the real workbook, so no
   editorial changes were made.
2. Wrote the Step 2 test file exactly as given.
3. Ran `npx vitest run src/data/parity-aug02.test.js` before touching any pipeline code, to
   see the brief's predicted "likely FAIL on first run."
4. Post-hoc, confirmed byte-level fidelity to the brief by diffing the three written files
   against the brief's fenced blocks (see above) — zero drift.

## Parity outcome: first-run pass, zero pipeline fixes

All three parity tests passed on the very first run. No changes were made to
`src/domain/*.js` or `src/data/roster.js`.

This is not surprising given Tasks 3–7's own coverage, and is worth recording so a future
reader doesn't mistake "no diffs to report" for "didn't look hard enough":

- `src/data/roster.js`'s `SEED_ROTATIONS` comment states the anchor dates were **chosen so
  `proposeToggles(SEED_ROTATIONS, '2026-08-02')` reproduces the workbook's Week Setup for
  Aug 2 exactly** — i.e. the toggle-generation leg of parity was already locked down before
  this task started.
- `src/domain/rotations.test.js` already carries an assertion named "reproduces the workbook
  Week Setup toggles for Aug 2 exactly," green since Task 4.
- Task 8's `WEEK_AUG02.toggleStates` is *computed* by `proposeToggles(SEED_ROTATIONS,
  '2026-08-02')`, not transcribed as a literal toggle list. So this test's coverage is
  effectively two-legged:
  - **Leg 1** (toggle proposal == workbook Week Setup) is proven in `rotations.test.js`,
    not here.
  - **Leg 2** (pattern → toggle → time-off → override → format → coverage, everything
    downstream of the toggle set) is what `parity-aug02.test.js` actually exercises.

  If `rotations.test.js`'s Aug 2 assertion is ever weakened or removed, `parity-aug02.test.js`
  would keep passing but would silently stop proving full pipeline-to-workbook parity — it
  would only be proving parity *given* whatever toggles `proposeToggles` currently emits, not
  that those toggles are correct. Worth remembering before touching either test.

Spot-checked coverage-math coherence directly (not just trusting the pass):
- Thursday VA: `EXPECTED_GRID` sums to 11 scheduled vs. target `2×4 DVM + 2 = 10` → `OVER +1`,
  matching `EXPECTED_STATUS[Thu]`.
- Monday VA: 12 scheduled vs. `2×5 DVM + 2 = 12` → `ON TARGET`.
- Monday RVT: 3 scheduled — Gardner correctly excluded (her Mon cell is `UNPAID OFF` from
  `req-4`, not `RVT (7:30–4:30)`), matching target 3.

## Evidence

```
RUN  v4.1.10 /Users/hinchk/WestCoast.Vet/scheduler

 ✓ src/data/parity-aug02.test.js > Excel parity — Aug 2–8, 2026 (the trust proof)
     > reproduces the Proposed Schedule sheet cell-for-cell 1ms
 ✓ src/data/parity-aug02.test.js > Excel parity — Aug 2–8, 2026 (the trust proof)
     > reproduces the Coverage Check sheet 1ms
 ✓ src/data/parity-aug02.test.js > Excel parity — Aug 2–8, 2026 (the trust proof)
     > reproduces the day statuses including Thursday's OVER +1 0ms

 Test Files  10 passed (10)
      Tests  42 passed (42)
```

Full suite (`npx vitest run`) confirms 10 files / 42 tests, all green, no skipped/todo tests.

## Concerns
None. Iron rule was never in tension — no fixture was ever suspected of mistranscription, no
pipeline file needed a fix, and `git status` shows only the three new files added (no
modifications to `src/domain/*.js` or `src/data/roster.js`).

## Report Path
/Users/hinchk/WestCoast.Vet/scheduler/.superpowers/sdd/task-8-report.md
