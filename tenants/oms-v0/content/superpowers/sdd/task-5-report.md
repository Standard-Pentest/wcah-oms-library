# Task 5: Time-off semantics and Paylocity parser — Report

## Status
✅ **COMPLETE** — All 26 tests passing, pristine suite.

## Commits
- **808740e** feat: time-off semantics and deterministic Paylocity import adapter

## Test Summary
- **RED confirmed**: Modules not found (timeoff.js, paylocity.js missing).
- **GREEN achieved**: 7 new tests pass + 19 existing tests pass = 26/26 passing.
  - `src/domain/timeoff.test.js`: 4 tests (classify, dates, applied, sort)
  - `src/import/paylocity.test.js`: 3 tests (parse exact + fuzzy, malformed rows)

## Key Implementation Notes
- `classifyRequest()` correctly returns PAID/UNPAID/PARTIAL based on hours/days ratio.
- `requestDates()` uses `addDays()` to expand consecutive dates.
- `isApplied()` checks both Approved status and granted decision for Pending.
- `parsePaylocityTimeOff()` parses 12-hour (03/10/2026 01:43 PM) and 24-hour (06/16/2026 13:57:17) formats.
- Exact name matches (paylocityName or displayName) auto-assign `staffId`; fuzzy matches suggest only (no silent attachment).
- All issues tracked with line number, kind (bad-row, bad-date, unknown-employee), and detail/suggestion fields.

## No Concerns
All fixtures transcribed verbatim from brief. Tab-separated row helper confirmed. ISO datetime formatting and regex escapes verified against test expectations.

## Fix: blank-numeric guard

**Issue**: `Number.isNaN()` guard passed blank Hours/Days cells (Number('') === 0), causing silent records with UNPAID classification and divide-by-zero on hours/days ratio.

**Solution**:
- Added pre-check for blank/whitespace `hoursRaw` or `daysRaw` before Number conversion
- Strengthened guard to reject `hours < 0` or `days <= 0`
- Both cases push to `issues` with kind 'bad-date', detail naming the problem

**Files changed**:
- `src/import/paylocity.js`: Guard logic in `parsePaylocityTimeOff()` (lines 63-70)
- `src/import/paylocity.test.js`: New test "rejects blank or zero numeric cells as issues, not silent records"

**Test command & output**:
```bash
npx vitest run src/import
# PASS (4) FAIL (0)

npx vitest run
# PASS (27) FAIL (0)
```

All existing tests continue to pass; 1 new test covers blank/zero Hours and Days rejection.
