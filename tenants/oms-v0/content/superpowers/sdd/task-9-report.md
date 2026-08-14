# Task 9: Rulebook and evaluateWeek — Report

## Status: DONE

Both files were transcribed **verbatim** from the brief. Machine-verified: a script
extracted the two ```js code blocks from `task-9-brief.md` via regex and diffed them
against the written files byte-for-byte (after trimming trailing whitespace) —
`test match: True`, `impl match: True`.

## Step 1–2: RED

Created `src/domain/rules.test.js` exactly per brief Step 1 (6 test cases). Ran:

```
npx vitest run src/domain/rules.test.js
```

Result: **FAIL**, as expected —

```
Cannot find module './rules.js' imported from /Users/hinchk/WestCoast.Vet/scheduler/src/domain/rules.test.js
```

## Step 3–4: GREEN

Created `src/domain/rules.js` exactly per brief Step 3 (SEVERITY map, 10 closed
templates, SEED_RULEBOOK with 16 rule instances, evaluateWeek). Ran:

```
npx vitest run src/domain/rules.test.js --reporter=verbose
```

Result: **PASS, 6/6, first try** —

```
 ✓ src/domain/rules.test.js > rule templates > maps flexibility to severity 1ms
 ✓ src/domain/rules.test.js > rule templates > flags coverage shortfalls with the rule severity 1ms
 ✓ src/domain/rules.test.js > rule templates > checks consecutive days off circularly and honors exemptions 0ms
 ✓ src/domain/rules.test.js > rule templates > enforces person rules: fixed days, day-role locks, no-days, forbidden roles, max days, emergency-only 0ms
 ✓ src/domain/rules.test.js > rule templates > flags overtime as info and undertime as soft, crediting paid time off 1ms
 ✓ src/domain/rules.test.js > rule templates > on the real Aug 2 week: no hard violations, and exactly Gardner undertime as soft 1ms

 Test Files  1 passed (1)
      Tests  6 passed (6)
```

Full suite:

```
npx vitest run --reporter=verbose
```

Result: **48/48 passed across 11 test files** — pristine, no regressions.

```
 Test Files  11 passed (11)
      Tests  48 passed (48)
```

(Full file list: cells, targets, coverage, calendar, roster, paylocity, build,
timeoff, rotations, rules, parity-aug02 — all green.)

## Gate outcome: PASSED ON FIRST RUN — no template debugging required

The brief flagged this as the risky step ("if extras appear, debug the template,
never the test/fixtures/seed data; if convinced the expectation is wrong, STOP and
report BLOCKED"). None of that applied — the parity tripwire test passed on the
very first execution of the verbatim implementation. No violation diff to report,
no template logic touched beyond the transcribed code.

### Why the gate is non-vacuous (not a trivial pass)

The real Aug 2 week (`WEEK_AUG02` / `REQUESTS_AUG02`) produces **zero hard
violations** and **exactly one soft violation** for `gardner-theresa`, and this
result is load-bearing, not incidental:

- Gardner's base pattern (`Mon/Tue/Wed/Fri` RVT at 8h via `t830`, `Thu` PB at 8h)
  sums to exactly 40h — her `standardHours` — so with no time off applied she'd have
  **zero** shortfall and the gate would be vacuous.
- `REQUESTS_AUG02` contains `req-4` (Aug 2/Sun, `hours: 0`), `req-5` (Aug 3/Mon,
  `hours: 0`), `req-6` (Aug 4/Tue, `hours: 0`), all `status: 'Approved'` for
  `gardner-theresa`. `hours: 0` → `classifyRequest` returns `'UNPAID'`.
- In `buildWeek`, UNPAID requests overwrite the cell with `off('UNPAID OFF')`,
  which replaces her Mon and Tue RVT shifts (Sun was already a day off — no shift
  to replace there). That drops her worked hours from 40h to **24h**.
- In the `undertime` template: `worked=24`, `paidOff=0` (UNPAID doesn't credit
  `paidOff`), `unpaidDays=3` (one day from each of the three `days:1` requests).
  `shortfall = 40 - 24 - 0 = 16 > 0` → violation fires. Because `unpaidDays > 0`,
  the message appends `" Unpaid time off — makeup shifts owed."`, satisfying the
  test's `toContain('makeup')` assertion.
- Every other roster member's rules (fixed days, day-role locks, no-days,
  forbidden roles, max days, emergency-only, coverage targets, consecutive-off)
  evaluate clean against the real roster/week/overrides — confirming those
  templates don't misfire against real data, not just the synthetic unit-test
  fixtures.

So the single soft violation is a specific, traceable consequence of three real
time-off rows interacting with `buildWeek`'s time-off pipeline and the `undertime`
template's paid/unpaid accounting — not an artifact of an empty or degenerate
fixture.

## Verbatim-match verification

```python
blocks = re.findall(r'```js\n(.*?)\n```', brief_text, re.DOTALL)
# blocks[0] == src/domain/rules.test.js  -> True
# blocks[1] == src/domain/rules.js       -> True
```

## Commit

```
git add src/domain/rules.js src/domain/rules.test.js
git commit -m "feat(domain): rulebook templates with flexibility ratings and evaluateWeek

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

## Self-review

- Files match the brief exactly, including two things left untouched deliberately
  because the task scope is "transcribe verbatim" and the gate did not force any
  template debugging:
  - `rules.js` has two separate `import ... from './calendar.js'` statements
    (lines 1 and 3) instead of one merged import. Cosmetic; no lint script or
    Husky hook exists in this repo (`package.json` has no `lint` script, no
    `.husky` directory) so nothing would fail the commit over it.
  - `consecutiveDaysOff`'s `staff.constraints.consecutiveOffExempt` is read
    without an optional-chain guard on `constraints` itself. Every roster record
    in `SEED_ROSTER` and every test fixture always supplies a `constraints: {}`
    object, so this can't throw against the fixtures actually used, but it would
    throw for a hypothetical staff object missing `constraints` entirely.
  - Both are present in the brief's Step 3 code verbatim; per the task
    instructions, only template *logic* bugs surfaced by the parity gate were to
    be debugged, and none were.
- `.superpowers/sdd/` is git-ignored in this repo (confirmed via
  `git status --ignored`), so this report file is intentionally left untracked,
  matching the apparent convention for Tasks 1–8 (no sdd files appear in
  `git ls-files`).
- No other files were modified; `git status` before staging showed only the two
  new files as untracked.
