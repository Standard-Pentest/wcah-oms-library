# Task 7 report — envelope codec + last-known-good cache

## What was implemented

`src/state/omsEnvelope.js` — pure-JS envelope codec + two cache backends, exactly per the task brief:

- `serializeOmsEnvelope({ revision, doc })` → JSON string `{ schemaVersion: 4, revision, doc }`.
- `deserializeOmsEnvelope(json)` → parses, throws `Error` with `err.code = 'version-mismatch'` when `schemaVersion !== 4`.
- `createMemoryEnvelopeCache()` → in-memory `{ loadEnvelope, saveEnvelope, clearEnvelope }`, for tests / Task 9/10 consumers that don't need persistence.
- `createOmsEnvelopeCache({ dbName = 'wcah-oms-envelope' })` → IndexedDB-backed cache with the same three-method shape, mirroring the existing `createOmsIdbStore` open/transaction pattern in `src/state/omsPersistence.js` (single `kv` object store, key `'envelope'`, `readonly`/`readwrite` transactions, `db.close()` in a `finally`).

`revision` never leaves the envelope/cache layer — the domain `doc` passed in and returned is untouched. `omsPersistence.js` was read for reference only; not modified.

## TDD evidence

**RED** — `npx vitest run src/state/omsEnvelope.test.js` before `omsEnvelope.js` existed:

```
Failed to resolve import "./omsEnvelope.js" from "src/state/omsEnvelope.test.js". Does the file exist?
```

(via rtk tee log JSON: `numFailedTestSuites: 1`, `numTotalTests: 0`, message above)

**Implementation**: wrote `src/state/omsEnvelope.js` verbatim from the brief's Step 3.

**GREEN** — `npx vitest run src/state/omsEnvelope.test.js --reporter=verbose`:

```
 RUN  v4.1.10 /Users/hinchk/WestCoast.Vet/oms

 ✓ src/state/omsEnvelope.test.js > envelope codec > round-trips { schemaVersion, revision, doc } 1ms
 ✓ src/state/omsEnvelope.test.js > envelope codec > throws version-mismatch on wrong schemaVersion 0ms
 ✓ src/state/omsEnvelope.test.js > memory envelope cache > stores and returns the envelope, and clears 0ms
 ✓ src/state/omsEnvelope.test.js > idb envelope cache > persists across cache instances (same dbName) 1ms

 Test Files  1 passed (1)
      Tests  4 passed (4)
```

The fourth test (`persists across cache instances (same dbName)`) opens a fresh `createOmsEnvelopeCache` instance `b` after `a` has already saved, and asserts `b.loadEnvelope()` reads back `revision: 5` — this genuinely exercises the fake-indexeddb-backed open/transaction/get path across two separate `indexedDB.open()` calls on the same `dbName`, not just in-process state, so it proves the IDB path.

## Full-suite result

`npx vitest run` (whole frontend suite, after commit):

```
numTotalTestSuites: 133
numPassedTestSuites: 131
numFailedTestSuites: 2   (see note below)
numTotalTests: 333
numPassedTests: 330
numFailedTests: 1
numPendingTests: 2
FAILED FILE: conformance/runners/baseline.test.js
```

- 330 passed = 326 pre-existing + 4 new (`omsEnvelope.test.js`) — matches the brief's expectation exactly.
- 1 failed test, in `conformance/runners/baseline.test.js` — the pre-existing, by-design-red conformance ratchet test. Unchanged: this task added only two new files under `src/state/` that nothing in `conformance/` imports, and `git status` shows zero modifications under `conformance/`, `src/domain`, `src/data`, `src/seed`, or `src/engine`.
- 2 pending/skipped tests are pre-existing (`src/legacy/ui/Dashboard.test.jsx`, `src/legacy/state/SchedulerContext.test.jsx`), unrelated to this task.
- `numFailedTestSuites: 2` vs `numFailedTests: 1` is a reporter artifact — `numTotalTestSuites: 133` against ~55 test files shows the JSON reporter counts `describe` blocks as suites, so the one failing test's `describe` and its parent both register as "failed suites." Only one *file* (`conformance/runners/baseline.test.js`) has `status: 'failed'`.

## Files changed

- Created `src/state/omsEnvelope.js` (68 lines)
- Created `src/state/omsEnvelope.test.js` (34 lines)
- No other files touched. `src/state/omsPersistence.js` was read for reference only, not modified.

## Commit

```
ce9e82a feat(oms): envelope codec + last-known-good cache (revision internal)
 2 files changed, 107 insertions(+)
```

Trailer `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` included, matching the convention already used in this branch's prior commits (verified via `git log -3 --format='%B'` against e7f4341/e352fa6/1f86390 before committing).

Staged explicitly by path (`git add src/state/omsEnvelope.js src/state/omsEnvelope.test.js`) — the pre-existing untracked directory `docs/superpowers/specs/.clearance-rendered-preview-C7D7D292-4736-4510-AE87-325977006378/` (present before this task started, unrelated to it) was left untouched and is not part of this commit.

## Self-review

- Signatures match exactly what Tasks 9/10 are documented to consume: `serializeOmsEnvelope`, `deserializeOmsEnvelope`, `createOmsEnvelopeCache({ dbName })`, `createMemoryEnvelopeCache()`.
- `deserializeOmsEnvelope` throws `{ code: 'version-mismatch' }` on `schemaVersion !== 4`, satisfying the global SP2a constraint.
- `revision` is only ever read/written inside the envelope object — never merged into `doc` — so it cannot leak into the domain document.
- No new runtime dependencies; IDB cache uses native `indexedDB` only. `fake-indexeddb/auto` and `jsdom` are test-only, already present as devDependencies.
- IDB code is a deliberate structural mirror of `createOmsIdbStore` in `omsPersistence.js` per the task's explicit instruction — not a refactor, not shared code, just the same proven shape applied to a different key/value pair (`'envelope'` vs `'state'`, different `dbName` default).
- Did not add tests, hardening, or defensive extras beyond the brief (e.g., no `deleteDatabase` cleanup hook, no extra edge-case tests) — the brief's four tests are the full contract Tasks 9/10 will build against, and deviating from the specified shape was flagged as the actual risk, not under-testing.

## Concerns

None blocking. Two minor observations, neither actionable within this task's scope:

1. The IDB test (`oms-env-test` dbName) doesn't explicitly clean up/delete the fake-indexeddb database after the test. This matches the brief exactly (no cleanup step specified) and doesn't leak across files since fake-indexeddb's in-memory backend is reset per test-file process; not changing it since the brief is explicit about test content.
2. `numFailedTestSuites: 2` in the JSON summary looks alarming at a glance but is a reporter-counting artifact (describe-block nesting), not a second failing file — confirmed by enumerating all `testResults[].status`, only one file (`baseline.test.js`) is `'failed'`.
