# Task 7: Coverage targets and coverage check — Report

**Status:** DONE

## Commits
- `49ed8a2` feat(domain): coverage targets and live coverage check

## Tests
- Task 7 tests (6): all PASS
- Full suite (39): all PASS

## Implementation

### Created files:
1. `src/domain/targets.test.js` — 3 test cases covering VA/RVT/HSS/PHARM formulas
2. `src/domain/coverage.test.js` — 3 test cases covering role bucketing, status reporting, and off cells
3. `src/domain/targets.js` — `targetsForWeek()` with README formulas (VA weekday `2×DVM+2`, weekend `2×DVM+1`; RVT weekday 3/weekend 2; HSS conditional on Sunday toggle; PHARM weekday only)
4. `src/domain/coverage.js` — `coverageCheck()` with role bucketing (MONITOR→VA, PB/TECH_NC→ignored, ADMIN→separate), variance calculation, and status strings (`'ON TARGET'`, `'SHORT n'`, `'OVER +n'`)

### Key design decisions:
- HSS Sunday only when toggle is ON
- MONITOR counts as VA for coverage
- PHARM: weekday 1, weekend 0
- Status prioritizes SHORT over OVER when both present

## Evidence
```
RED:  Coverage tests failed with module not found (targets.js, coverage.js)
GREEN: 6/6 targeted tests pass, 39/39 full suite pristine
```

No issues or concerns.
