# Task 6 Report: Frontend — authoritative projection (`toPersistedOms` / `hydrateOms`)

## Summary
Implemented the three pure functions that manage the SP2a frontend seam: persisting the OMS document to the server (without UI chrome) and rehydrating it on load with local UI state.

## TDD Evidence

### RED (Step 2)
Focused test run before implementation:
```bash
$ npx vitest run src/state/omsProjection.test.js
```
**Result:** FAIL — `Cannot find module './omsProjection.js'` (expected)

### GREEN (Step 4)
Focused test run after implementation:
```bash
$ npx vitest run src/state/omsProjection.test.js
```
**Result:** PASS (4) FAIL (0)

All four tests pass:
- `toPersistedOms › removes ui entirely`
- `toPersistedOms › does not mutate the input`
- `hydrateOms › attaches provided local ui`
- `hydrateOms › falls back to defaultUi derived from the persisted doc`

### Full Suite (Step 5)
```bash
$ npx vitest run
```
**Result:** PASS (326) FAIL (1) skipped (2)

- **Before:** 322 pass + 1 pre-existing fail (conformance baseline)
- **After:** 326 pass + 1 pre-existing fail (4 new tests added)
- **Status:** ✓ No regressions; pre-existing conformance baseline failure unchanged

## Implementation Details

**File created:** `src/state/omsProjection.js`

Three pure functions:

1. **`toPersistedOms(doc)`**
   - Destructures `ui` from the document
   - Returns persisted document (version 4, weekOrder, employees, etc.)
   - Does not mutate input (via rest operator)
   - `void ui;` suppresses unused-variable warnings

2. **`defaultUi(persisted)`**
   - Returns sensible defaults for local UI state
   - `screen: 'board'` — default view
   - `selectedWeek` — first week in weekOrder, or null
   - `aiOpen: false` — AI panel closed by default
   - `selectedPtoId: null` — no PTO selected

3. **`hydrateOms(persisted, localUi)`**
   - Reattaches UI state to the persisted document
   - Uses provided `localUi` if supplied
   - Falls back to `defaultUi(persisted)` if no UI provided
   - Returns new object (no mutation)

**Test file created:** `src/state/omsProjection.test.js`

Four test cases covering:
- UI stripping and key preservation
- Input immutability
- UI attachment (provided and default)
- Default UI derivation from weekOrder

## Constraints Verified

✓ Pure functions (no React, no `Date.now()`, no id generation, no I/O)
✓ `toPersistedOms` does not mutate input
✓ Only modified files: `src/state/omsProjection.js` and `src/state/omsProjection.test.js`
✓ No changes to `src/engine`, `src/domain`, `src/data`, `conformance/`, or other files
✓ Commit message ends with proper co-author line

## Self-Review

**Strengths:**
- Exact implementation from brief (no interpretation needed)
- Clean test coverage: 4 cases spanning all three functions
- Immutability verified by test
- Default UI sensible (board view, first week)

**Concerns:** None. The implementation is straightforward, follows the brief verbatim, and all tests pass.

## Files Changed

- `src/state/omsProjection.js` — new, 20 lines
- `src/state/omsProjection.test.js` — new, 35 lines

## Commit

```
2e7690f feat(oms): authoritative projection toPersistedOms/hydrateOms
```

Commit includes both files, proper co-author line, and clear message.
