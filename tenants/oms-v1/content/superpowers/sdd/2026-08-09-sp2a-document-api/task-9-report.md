# Task 9 Report: Frontend — `createOmsApiStore` (revision, single-flight queue, offline)

## Summary

Implemented `src/state/omsApiStore.js`: `createOmsApiStore({ baseUrl, cache })`
returns `{ load, save, clear }`. The module owns three pieces of state in
closure, none of which ever leak to the caller:

- `revision` — the server's current revision, advanced only on a successful
  GET/PUT response. Never added to the domain document.
- `acceptedFingerprint` — `JSON.stringify` of the last-accepted *persisted*
  (post-`toPersistedOms`) document, used to make `save()` a no-op when the
  incoming projection is unchanged (e.g. a `ui`-only edit).
- `inFlight` / `queued` — a single-PUT-in-flight queue with latest-write
  coalescing: at most one PUT in flight; a second `save()` while one is in
  flight replaces (not appends to) a single `queued` slot; on completion,
  `pump()` drains the queued job using the *just-advanced* revision as its
  base, so two writes never share a base revision.

Consumes `toPersistedOms` (Task 6, strips `ui`) and
`createMemoryEnvelopeCache`/`createOmsEnvelopeCache` (Task 7, `loadEnvelope`/
`saveEnvelope`/`clearEnvelope`) exactly as those tasks produced them — no
signature drift.

## TDD Evidence

### RED (Step 2)

```
$ npx vitest run src/state/omsApiStore.test.js
```
**Result:** FAIL — `Cannot find module './omsApiStore.js' imported from
/Users/hinchk/WestCoast.Vet/oms/src/state/omsApiStore.test.js` (module did
not exist yet; confirmed via the JSON reporter before any implementation
file was written).

### GREEN (Step 4)

```
$ npx vitest run src/state/omsApiStore.test.js
```
**Result:** PASS (10) FAIL (0) — all brief-specified cases, including the
coalescing `[0, 1]` assertion, on first implementation (verbatim from the
brief's Step 3; no deviation was needed).

I then added one test not in the brief (see Concerns #2) and re-ran:
**Result:** PASS (11) FAIL (0).

Re-ran the full file 5 times back-to-back to rule out order-dependent
flakiness before trusting the single sample:
```
$ for i in 1 2 3 4 5; do npx vitest run src/state/omsApiStore.test.js; done
```
**Result:** 10/10 passed, all 5 runs, identical outcome each time (durations
573–641ms).

## How the coalescing test is deterministic

The test (`coalesces overlapping saves into sequential base revisions`) never
touches real timers — it controls ordering entirely through manual Promise
resolution and vitest's microtask-flushing `await`:

1. `store.save(A)` runs synchronously up to `pump()`. Inside `pump()`,
   `queued` (holding job A) is pulled out and cleared, and `put()` is called
   — its `fetch` mock returns an *unresolved* promise (captures
   `resolveFirst`) because `calls.length === 1` at that point. `inFlight` is
   now set; control returns to the caller with promise `a` pending.
2. `store.save(B)` runs before `a` settles. `queued` is `null` (A's job was
   already dequeued by step 1), so `queued` becomes job B and `pump()` is
   called again — but `inFlight` is still set, so `pump()` returns
   immediately. B is queued, not yet sent.
3. `resolveFirst()` fires *after* both `save()` calls have already run to
   completion of their synchronous prefix (JS never preempts between
   `await`-yielding points), settling the first `fetch`. That flows through
   `put()` → `revision = 1` → `acceptedFingerprint` set → `job.resolve()`
   (settles `a`) → `.finally(() => { inFlight = null; pump(); })`, which
   immediately (still synchronously, no `await` in between) dequeues job B
   and calls `put(persistedB, revision)` with `revision` now `1`.
4. The second `fetch` mock branch (`calls.length !== 1`) resolves
   immediately via `jsonResponse`, so `b` settles too.

Because every ordering decision is driven by explicit `queued`/`inFlight`
flag checks rather than a race between timers, the sequence `[0, 1]` is
forced by the code path, not by scheduling luck — there is no `setTimeout`,
no `Promise.race`, and no dependency on which microtask the test runner
happens to drain first. This is why 5/5 repeated runs were identical. No
weakening of the assertion was needed or done.

## Offline / stale / no-op results

All from the brief's Step 1, unmodified except for the one addition below:

- `load()` offline with cached envelope → `{ code: 'offline-cache', cachedDoc: P }` — pass.
- `load()` offline with no cache → `{ code: 'offline' }` — pass.
- `load()` on the empty sentinel (`doc: null, revision: 0`) → resolves `null` — pass.
- `load()` on a real doc → resolves the doc, caches `{revision: 3, doc}` — pass.
- `save()` strips `ui` and sends `base_revision: 0` on the first write — pass.
- `save()` with an unchanged projection (different `ui` only) → 0 additional `fetch` calls — pass.
- `save()` on 409 → `{ code: 'stale-write', currentRevision: 9 }` — pass.
- `save()` on network failure → `{ code: 'offline' }`, and `revision`/`acceptedFingerprint` are left untouched (verified by code inspection: the `catch` in `put()` throws before any state mutation) — pass.
- Base-URL normalization (`/api/` → `/api/document`, not `/api/api/document`) — pass.

## Full Suite (per task instructions)

```
$ npx vitest run --max-workers=2
```
**Result:** 347 total, 344 passed, 1 failed, 2 skipped (pending).

The single failure is the pre-existing, by-design red:
`conformance/runners/baseline.test.js > conformance baseline ratchet (spec
§5.7)` — an Excel-parity conformance-report diff for the `2026-08-02` week,
identical in nature to every prior task's report in this ledger
(`progress.md` Task 8 entry: "1 pre-existing fail = baseline ratchet"). This
module is pure JS with no import path into `src/engine`, `src/domain`,
`src/data`, or `conformance/`, so it cannot be the cause.

Arithmetic matches expectations exactly: Task 8's baseline was 333 pass + 1
fail + 2 skipped = 336 total. This task adds 11 new tests (the brief's 10
plus the `clear()` test I added, see below): 333 + 11 = 344 pass, 1 fail
(unchanged), 2 skipped (unchanged), 347 total. Used `--max-workers=2` per the
task instruction — this machine's default-concurrency run is documented as
flaky by every prior frontend task in this ledger (Task 8's report:
resource-contention timeouts, non-deterministic membership across runs); I
did not re-verify that flakiness independently since the instruction already
prescribes the reduced-concurrency command as the source of truth and I ran
only the reduced-concurrency form.

## Implementation Details

`src/state/omsApiStore.js` — implemented verbatim from the brief's Step 3,
64 lines. No deviation from the given code was necessary; every brief test
passed against the first draft.

`src/state/omsApiStore.test.js` — the brief's Step 1 verbatim, plus one
additional test (see below), 108 lines total.

## Deviation from the brief: added a `clear()` test

The brief's Step 1 test file (verbatim, per the task) does not exercise
`clear()` at all, even though the task description's contract explicitly
calls it out: *"`clear()` → clears only the injected `cache` (never touches
the server)."* Since `clear()` is part of the contract Task 10 depends on, I
added one test not present in the brief:

```javascript
describe('createOmsApiStore clear', () => {
  it('clears only the injected cache and never touches the server', async () => {
    const cache = createMemoryEnvelopeCache();
    await cache.saveEnvelope({ revision: 5, doc: P });
    const fetchMock = vi.fn();
    global.fetch = fetchMock;
    const store = createOmsApiStore({ baseUrl: '/api', cache });
    await store.clear();
    expect(await cache.loadEnvelope()).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
```

This is additive only — no brief-supplied test was changed or removed. It
passes against the verbatim implementation with no code changes required
(`clear()` was already implemented correctly: `async function clear() {
await cache.clearEnvelope(); }`).

## Self-Review

**Strengths:**
- Implementation matches the brief exactly; every test passed on first
  attempt with no debugging needed, which is itself evidence the queue's
  control flow (flag-based, not timer-based) is simple enough to reason
  about statically.
- Verified the coalescing test's determinism empirically (5 repeated runs)
  rather than assuming a single green run generalizes, and worked out *why*
  it's deterministic (see above) rather than treating it as a black box.
- Confirmed `src/state/omsProjection.js` and `src/state/omsEnvelope.js`
  signatures by reading the actual Task 6/7 source before writing anything,
  rather than trusting the brief's prose. They match exactly.
- Checked the backend's actual column type (`backend/app/models.py:26`,
  `backend/alembic/versions/0001_platform_document.py:23`) rather than
  guessing, to grounds Concern #3 below in fact.

**Concerns (not fixed — flagged per the Task 8 precedent: report, let the
reviewer decide, since none of these are brief-test failures and the brief
says implement the queue "exactly per the brief"):**

1. **Important — a discarded/superseded queued job's promise never
   settles.** Reachable with exactly two overlapping saves, no third needed:
   `save(A)` is pumped and in flight; `save(B)` lands in the `queued` slot.
   If `put(A)` then rejects (409 or network failure), the `catch` in `pump()`
   does `queued = null; job.reject(e);` — but `job` here is *A's* job object
   (closed over from when `pump()` dequeued it); B's `resolve`/`reject` are
   never called because B was silently dropped from `queued` before its own
   `put()` ever ran. B's promise hangs forever. The same drop happens on the
   discard-only path: if a *third* `save(C)` arrives while B is still queued
   (not yet dequeued), `queued = { doc: C, ... }` overwrites B outright, and
   B's promise also never settles — not even via rejection. Task 10
   (`OmsContext`) is exactly the kind of caller that will `await store.save(doc)`
   after a mutation; if a user edits twice in quick succession and the first
   PUT fails, the second edit's UI-visible promise (and any `.then`/spinner/
   error toast wired to it) will hang silently instead of surfacing the
   error. **One-line fix if the reviewer wants it:** in `pump()`'s `catch`,
   also settle any live `queued` job before or alongside `job.reject(e)`
   (e.g. reject it with the same error, since the base revision it was about
   to use is now invalid anyway); and in `save()`, reject the previous
   `queued.reject` (if any) before overwriting the slot on a third overlap.
   I did not make this change because the brief says to implement the queue
   "exactly per the brief" and no supplied test exercises 409/offline *during*
   an already-coalesced second write — but it is a real correctness gap in
   the exact scenario this queue exists to handle.

2. **Minor — `clear()` had zero test coverage in the brief.** Added the test
   above. Note for Task 10: `clear()` deliberately leaves the closure's
   `revision` and `acceptedFingerprint` untouched — it only clears the
   injected `cache`. If Task 10 calls `clear()` expecting a full reset (e.g.
   on logout), the next `save()` in the same store instance will still
   fingerprint-compare against the old `acceptedFingerprint` and use the old
   `revision` as its base — `clear()` is a cache wipe, not a store reset.
   This matches the task's stated contract ("clears only the injected
   `cache`") so it is not a bug, just a sharp edge worth naming explicitly
   for the consumer.

3. **Minor — the no-op fingerprint check is intra-session only, and will
   likely never fire after a fresh `load()` in production.** `load()` sets
   `acceptedFingerprint = JSON.stringify(body.doc)` from the *server's*
   JSON-decoded response; `save()` fingerprints
   `JSON.stringify(toPersistedOms(doc))` built from the *client's* in-memory
   object. `JSON.stringify` is key-order-sensitive. I confirmed the backend
   column is genuinely `JSONB` (`backend/app/models.py:26`:
   `doc: Mapped[dict | None] = mapped_column(JSONB, nullable=True)`;
   `backend/alembic/versions/0001_platform_document.py:23`:
   `sa.Column("doc", JSONB, nullable=True)`), and Postgres `jsonb` does not
   preserve the original key insertion order — a round-tripped document can
   come back with different key ordering than the object that was
   `JSON.stringify`'d to write it. So immediately after a `load()`, the very
   first `save()` of an *unmodified* document can still fail the fingerprint
   equality check and issue a real PUT, even though nothing changed. The
   brief's own tests never exercise this sequence (`load()` then `save()` of
   the same doc in one test) so nothing here fails; it's a latent gap between
   the "no-op on equal projection" contract description and what
   `JSON.stringify` equality actually guarantees across a JSONB round trip. I
   did not add canonicalization (e.g. a stable-key-order stringify) since
   that's a behavior change beyond "implement the brief," but the report
   should carry this so Task 10 doesn't rely on the no-op firing reliably
   right after a fresh load.

4. **Minor — the 409 test's name promises more than the store enforces.**
   The test is titled *"throws stale-write on 409 and requires reload before
   next save"*, but nothing in `omsApiStore.js` actually blocks a subsequent
   `save()` after a `stale-write` rejection — `revision` and
   `acceptedFingerprint` are simply left at their pre-failure values (the
   `catch` in `put()` throws before any mutation), so the *next* `save()`
   will happily PUT again using the same (now-known-stale) `revision` as
   `base_revision`, and will get another 409 rather than being pre-emptively
   blocked. The "requires reload" part of the contract is enforced by
   whoever calls this store (Task 10 must call `load()` again on
   `stale-write` before the next `save()`), not by `omsApiStore.js` itself.
   Naming this explicitly so Task 10's implementer doesn't assume a guard
   exists inside the store.

## Files Changed

- `src/state/omsApiStore.js` — new, 64 lines.
- `src/state/omsApiStore.test.js` — new, 108 lines (brief's 10 tests + 1
  added `clear()` test).

No other files touched — confirmed via `git status` before commit
(`src/engine`, `src/seed`, `src/domain`, `src/data`, `conformance/`, and
every other `src/state/*` file are untouched).

## Commit

```
5c480ae feat(oms): createOmsApiStore — internal revision, single-flight queue, offline
```
Message ends with the required trailer
(`Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`). Note: the brief's
own Step 5 commit command text omits this trailer — followed the task
instructions' global constraint over the brief's literal copy-paste command.

---

## Fix Report: coordinator-directed fix round (Concern 1 + minors, pre-review)

The coordinator confirmed Concern 1 (a discarded/superseded queued save's
promise never settles) as Important and directed a fix before task review,
plus two trivial cleanups and an optional attempt at Concern 3
(fingerprint key-order). This section documents what changed.

### What changed — `src/state/omsApiStore.js`

Rewrote the queue from a single `{doc, resolve, reject}` job object to the
coordinator's prescribed shape, which separates "the doc that will be sent
next" from "everyone waiting on some write landing":

- **State:** `revision`, `acceptedFingerprint`, `inFlight` (bool, was a
  Promise), `pendingDoc` (latest queued doc | `null`), `pendingWaiters`
  (array of `{resolve, reject}` — every caller queued behind the current
  slot, not just the most recent one).
- **`save(doc)`:** no-op check unchanged (equal-projection short-circuit).
  Otherwise: `pendingDoc = doc` (overwrite — latest wins), **push** (not
  overwrite) `{resolve, reject}` onto `pendingWaiters`, call `pump()`. This
  is the crux of the fix: a second/third overlapping `save()` used to
  replace the entire `{doc, resolve, reject}` slot, discarding the earlier
  caller's `resolve`/`reject` with it. Now only `pendingDoc` is replaced;
  every waiter's callbacks accumulate in the array and all get settled when
  that batch's PUT eventually resolves or rejects.
- **`pump()`:** snapshots `doc`/`waiters` from `pendingDoc`/`pendingWaiters`,
  clears both, sets `inFlight = true`, then runs the PUT in an async IIFE
  (previously a separate `put()` helper returned a promise assigned to
  `inFlight` itself). Branches:
  - **200:** advance `revision`, set `acceptedFingerprint`, refresh cache,
    `settleAll(waiters, resolve)`, `inFlight = false`, call `pump()` again
    to drain whatever queued up during the flight.
  - **409 / offline / other non-ok:** call `failBatch(waiters, err)`, which
    rejects `waiters` (the batch that was in flight) **and** rejects
    whatever accumulated in `pendingWaiters` during the flight, clears
    `pendingDoc`/`pendingWaiters`, sets `inFlight = false`, and does **not**
    call `pump()` — per the coordinator's spec, a reload must precede any
    further write, so nothing auto-drains after a failure. (A fresh
    `save()` call afterward still works — it just starts a new batch from
    scratch; the store itself does not block it, see existing Concern 4/now
    renumbered below.)
- **Fingerprint canonicalization (Concern 3 attempt):** added
  `canonicalStringify(value)` — a `JSON.stringify` replacer that recursively
  sorts object keys (arrays keep their element order) — and used it for
  every fingerprint computation (`load()`'s `acceptedFingerprint`, `save()`'s
  comparison, and `pump()`'s post-200 `acceptedFingerprint`). This was
  "genuinely cheap": one ~10-line pure function, confined entirely to
  fingerprint comparisons — the actual wire payload sent in the PUT body is
  still built with plain `JSON.stringify` (order-agnostic to the server,
  parsed back with `JSON.parse`), so this does not change what's sent over
  the network, only what "unchanged" means client-side. I verified the
  standard "replacer re-sorts each node, `JSON.stringify` then recurses into
  the returned object's own keys" trick recursively canonicalizes nested
  objects, not just the top level, and added a regression test (below)
  proving it closes the gap described in the original Concern 3.

### New tests — `src/state/omsApiStore.test.js`

1. **`resolves every queued save even when three overlap and only two PUTs
   are sent`** — `save(A)` goes in flight; `save(B)` and `save(C)` both
   queue while A is out. Asserts `await Promise.all([a, b, c])` completes
   (a hang here — B's old bug — would time out the test, which is a strict
   proof, not just an assertion) and that `calls` (the sequence of
   `base_revision` values sent) is `[0, 1]`: only two PUTs total (A, then
   the coalesced-latest C at the advanced base), with B's promise settling
   as a side effect of C's write succeeding, never sent on the wire itself.
2. **`rejects a queued save (not just the in-flight one) when the PUT
   409s`** — `save(A)` goes in flight (its `fetch` mock is held open via a
   manually-triggered `resolveFirst`); `save(B)` queues behind it. Resolving
   A's fetch with a 409 response asserts **both** `a` and `b` reject with
   `{code: 'stale-write', currentRevision: 9}`, and that `calls` is `[0]`
   only — B never got its own PUT attempt, it was rejected out of the
   `pendingWaiters` accumulated during A's flight. This is the direct proof
   for Concern 1's failure-path half.
3. **`treats a reloaded doc with different key order as unchanged (JSONB
   does not preserve key order)`** — `load()` returns a doc with the same
   content as the module-level fixture `P` but keys declared in a different
   literal order (`{ scheduleWeeks, version, employees }` vs. `P`'s
   `{ version, employees, scheduleWeeks }`); then `save()` is called with a
   doc whose persisted projection matches `P`'s literal order. Asserts
   `fetch` is never called for the save — proof the canonical-stringify fix
   actually closes the JSONB key-order gap documented in the original
   Concern 3, not just a claim.

### Existing tests — kept green, one renamed

- The original two-save coalescing test (`coalesces overlapping saves into
  sequential base revisions`, asserting `calls === [0, 1]`) is unchanged
  and still passes against the new queue — traced through by hand: `save(A)`
  is pumped immediately (batch of one), `save(B)` queues; A's 200 resolves
  → `revision` advances to 1, A's waiter resolves, `pump()` re-fires and
  pumps B's batch at `base_revision: 1`. Identical outcome to before the
  rewrite, now via the new state shape.
- **Minor (lint):** the two coalescing-style tests' `fetch` mocks had an
  unused `url` first parameter; renamed to `_url` (matches the repo's
  existing unused-arg convention — every other mock in this file that
  doesn't need the URL just omits the parameter entirely; these two needed
  a placeholder to reach the second (`opts`) parameter).
- **Minor (rename, Concern 3/4 from the original report):** renamed
  `throws stale-write on 409 and requires reload before next save` to
  `throws stale-write on 409` — the store does not enforce (and never did)
  the reload requirement; that remains a contract for the caller (Task 10)
  to uphold, called out explicitly in the original report's Concern 4
  (renumbered below) and now also reflected in the test's name so it stops
  implying a guard that isn't there.

### Commands / output

```
$ npx vitest run src/state/omsApiStore.test.js
```
**Result:** 14 passed (14). Re-ran 5 times back-to-back (same pattern as the
original coalescing-determinism check) — 14/14 every time, no flake,
durations 616–715ms.

```
$ npx vitest run --max-workers=2
```
**Result:** 350 total, 347 passed, 1 failed, 2 skipped/pending. The single
failure is the same pre-existing `conformance/runners/baseline.test.js >
conformance baseline ratchet (spec §5.7)` as every prior report in this
ledger — confirmed via the JSON reporter's `testResults`, only that one
file/test shows a failed assertion. Arithmetic: 333 (Task 8 baseline) + 14
(this file's total after the fix round, up from 11) = 347 pass, 1 fail
(unchanged), 2 skipped (unchanged), 350 total. No regression.

### Concerns resolved vs. still open

- **Concern 1 (Important) — FIXED.** Verified by the two new tests above
  (three-way coalescing resolves all three; queued save rejects on 409
  rather than hanging). No waiter — in-flight or queued — can fail to
  settle exactly once under the new `pendingDoc`/`pendingWaiters` model: every
  path through `pump()` either resolves a batch's waiters on 200 or rejects
  them (plus anything that piled up behind them) in `failBatch`; there is no
  code path that drops a `{resolve, reject}` pair without calling one of
  the two.
- **Concern 2 (fingerprint key-order) — FIXED** as a byproduct of attempting
  it per the coordinator's "if you can add it cleanly, do" — turned out to
  be cheap and low-risk (confined to fingerprint comparisons, wire format
  unchanged), so it's no longer just a documented limitation; test 3 above
  proves it closes the gap.
- **Concern 3 (renumbered from the original report's #2, `clear()` reset
  scope) — unchanged, still just a documented sharp edge**, not a defect:
  `clear()` intentionally only clears the cache, not `revision`/
  `acceptedFingerprint`. Restated here for continuity since the numbering
  shifted.
- **Concern 4 (renumbered from the original report's #4, 409-doesn't-block-
  next-save) — unchanged, still real, now reflected in the test's name**
  instead of just prose: the store surfaces `stale-write`, it does not
  prevent a subsequent `save()` from being attempted before a reload. Task
  10 must enforce the reload-before-retry rule itself.

### Files changed (this fix round)

- `src/state/omsApiStore.js` — rewritten queue (`inFlight`/`pendingDoc`/
  `pendingWaiters` replacing `inFlight`/`queued`), added
  `canonicalStringify`; net effect is a full-file rewrite but the public
  `{load, save, clear}` surface and every previously-passing test's
  behavior is unchanged except where the new tests specifically target the
  old bug.
- `src/state/omsApiStore.test.js` — 3 new tests, 1 renamed test, 2 unused-
  var lint fixes; brief's original tests otherwise untouched.

### Commit

```
096f177 fix(oms): omsApiStore — settle every queued save waiter exactly once
```
Trailer present.

---

## Fix Report: task-review fix round 2 (1 Critical + 1 Important + 3 minors)

The task review confirmed the queue core (coalescing, base advancement,
double-settle prevention, `canonicalStringify`) is correct, but found one
Critical and one Important defect that must land before consumption, plus
three cheap minors. This section documents the fix.

### CRITICAL — unhandled rejection in the PUT IIFE could strand `inFlight` forever

**The bug:** the fire-and-forget `(async () => {…})()` inside `pump()` had
two `await`s that could reject without being caught: `await resp.json()` on
the 409 path (a malformed error body), and `await cache.saveEnvelope(...)`
on the success path (e.g. IndexedDB quota/disk failure). Either rejecting
would throw out of the IIFE unhandled, and — critically — the line
`inFlight = false` on the success path sits *after* the `cache.saveEnvelope`
await, so a rejection there meant `inFlight` was never reset. Every future
`pump()` call early-returns while `inFlight` is true (`if (inFlight ||
pendingDoc == null) return;`), so this wasn't "one lost save" — it was a
**permanent persistence lockup**: every subsequent `save()` for the
lifetime of that store instance would queue and never drain.

**The fix**, three parts, all applied to `src/state/omsApiStore.js`:

1. **Guard the 409 body parse.** `const body = await resp.json().catch(()
   => ({}));` — a malformed 409 body now yields `currentRevision: undefined`
   in the thrown `stale-write` error instead of throwing during the parse
   itself.
2. **Make the cache write best-effort, in the exact order specified** (the
   server has already accepted the write and `revision`/
   `acceptedFingerprint` are already advanced by this point, so a cache
   failure must not be reported as a save failure — that would wrongly tell
   a caller to reload):
   ```js
   try { await cache.saveEnvelope({ revision, doc: persisted }); } catch { /* local cache is best-effort */ }
   settleAll(waiters, (w) => w.resolve());
   inFlight = false;
   pump();
   ```
3. **Outer safety net.** Wrapped the entire IIFE body in `try { ... } catch
   (e) { ... }`. The 409/offline/other-non-ok branches still `return`
   immediately after calling `failBatch` (which already sets `inFlight =
   false`), so they never reach the outer catch — it exists purely for
   truly unexpected throws (e.g. a malformed 200 body from `resp.json()`,
   or any future bug). On catch, it builds a `save-error`-tagged error and
   calls the same `failBatch(waiters, err)` used by the classified failure
   paths, which rejects the in-flight batch's waiters *and* anything that
   piled up in `pendingWaiters` during the flight, clears `pendingDoc`, and
   unconditionally resets `inFlight = false`. Reusing `failBatch` here (
   rather than duplicating the cleanup) guarantees the release logic can't
   drift between the classified and unexpected-error paths.

**Why this closes the hole completely, not just the two named cases:**
fixes 1–2 handle the two `await`s the review named specifically; fix 3
means *any* other throw inside the IIFE — named or not — still routes
through `failBatch` and releases `inFlight`. There is no longer a path
through `pump()`'s async body that can exit without either resolving,
rejecting via `failBatch`, or hitting the outer catch (which itself calls
`failBatch`).

**Test added** (`createOmsApiStore save`):
```javascript
it('resolves a save even when the local cache write fails, and does not lock the queue', async () => {
  const fetchMock = vi.fn(() => jsonResponse({ revision: 1 }));
  global.fetch = fetchMock;
  const cache = {
    loadEnvelope: vi.fn(async () => null),
    saveEnvelope: vi.fn(async () => { throw new Error('disk full'); }),
    clearEnvelope: vi.fn(async () => {}),
  };
  const store = createOmsApiStore({ baseUrl: '/api', cache });
  await expect(store.save({ ...P, employees: [{ id: 'a' }] })).resolves.toBeUndefined();
  fetchMock.mockImplementation(() => jsonResponse({ revision: 2 }));
  await expect(store.save({ ...P, employees: [{ id: 'b' }] })).resolves.toBeUndefined();
  expect(fetchMock).toHaveBeenCalledTimes(2); // the queue kept working after the cache failure
});
```
Before the fix, the first `save()` call in this test would have hung
forever (an unhandled rejection from `cache.saveEnvelope` leaving
`inFlight` stuck `true`), so the test's own timeout would have caught the
regression even without the explicit second-save assertion. With the fix,
both assertions pass: the first save resolves (server accepted the write)
despite the cache throwing, and the second, independent save still reaches
the network — direct proof the queue isn't locked.

### IMPORTANT — `load()` must check `resp.ok`

**The bug:** a non-network error response (5xx) resolves `fetch()`
successfully — it does not throw — so it skipped the `catch` block
entirely and fell through to `revision = body.revision` (→ `undefined`,
since an error body has no `revision` key) and `return body.doc` (→
`undefined`, not the contract's `null`). The `undefined` revision would
then poison the *next* `save()`'s PUT: `JSON.stringify({..., base_revision:
undefined, ...})` **drops** keys whose value is `undefined` entirely, so
the server would receive a PUT body with no `base_revision` key at all — a
malformed request, not merely a wrong one.

**The fix:** added an explicit ok-check between the fetch and the JSON
parse:
```js
if (!resp.ok) {
  const e = new Error(`load failed ${resp.status}`); e.code = 'offline'; throw e;
}
```
Used `code: 'offline'` (the first of the two options offered) rather than
inventing a new `load-error`-only-for-5xx code, to stay inside the
contract Task 10 already knows about (`offline` / `offline-cache`) rather
than adding a case Task 10 might not branch on. Note for the reviewer: this
path does **not** attempt the cached-envelope fallback the network-failure
`catch` branch does — a 5xx throws bare `{code: 'offline'}` with no
`cachedDoc`. That asymmetry (network-down tries the cache, 5xx doesn't) was
the coordinator's literal proposed fix; flagging it here in case a future
pass wants 5xx to also fall back to cache. I did not add that myself since
it wasn't asked for and would need its own test to justify.

**Test added** (`createOmsApiStore load`):
```javascript
it('throws instead of falling through when the GET resolves with a non-ok status', async () => {
  global.fetch = vi.fn(() => jsonResponse({ error: 'boom' }, 500));
  const store = createOmsApiStore({ baseUrl: '/api', cache: createMemoryEnvelopeCache() });
  await expect(store.load()).rejects.toMatchObject({ code: 'offline' });
});
```

### Minor 3 — duplicate in-flight PUT of an identical doc

**The bug:** `save()`'s no-op check only compares the incoming projection
against `acceptedFingerprint` — the last *server-confirmed* write. While a
PUT is in flight, `acceptedFingerprint` is stale, so two `save(sameDoc)`
calls straddling one slow PUT both miss the no-op check: the second lands
in the queue and, once the first PUT's 200 lands, would re-PUT an identical
document at the new base revision — a spurious write Task 10's debounced
autosave would trigger routinely (e.g. two keystrokes producing the same
final content, or a save fired right as an identical previous save
completes).

**The fix:** in `pump()`, right after computing `persisted` for the
snapshot batch, compute its fingerprint and compare against
`acceptedFingerprint` *before* setting `inFlight = true` or issuing the
PUT:
```js
const fingerprint = canonicalStringify(persisted);
if (fingerprint === acceptedFingerprint) {
  settleAll(waiters, (w) => w.resolve());
  return;
}
```
This fires on the *second* `pump()` invocation for the coalesced doc — once
the first PUT's success has updated `acceptedFingerprint` to match — so it
resolves the queued waiters without ever touching the network, and without
advancing `revision` a second time for content that's already there. The
already-computed `fingerprint` is also reused (not recomputed) as the value
assigned to `acceptedFingerprint` after a real PUT succeeds.

**Test added** (`createOmsApiStore save`):
```javascript
it('does not re-PUT an identical doc queued behind an in-flight save of the same content', async () => {
  let resolveFirst;
  const calls = [];
  global.fetch = vi.fn((_url, opts) => {
    calls.push(JSON.parse(opts.body).base_revision);
    if (calls.length === 1) return new Promise((r) => { resolveFirst = () => r({ ok: true, status: 200, json: () => Promise.resolve({ revision: 1 }) }); });
    return jsonResponse({ revision: 2 });
  });
  const store = createOmsApiStore({ baseUrl: '/api', cache: createMemoryEnvelopeCache() });
  const sameDoc = { ...P, employees: [{ id: 'a' }] };
  const a = store.save(sameDoc);
  const b = store.save({ ...sameDoc });
  resolveFirst();
  await Promise.all([a, b]);
  expect(calls).toEqual([0]); // only one PUT ever sent
});
```
Traced by hand to confirm the mechanism, not just the outcome: `save(a)`
pumps immediately (`fetch` call #1, `calls: [0]`, held open via
`resolveFirst`). `save(b)` — `acceptedFingerprint` is still `null` at this
point (a's PUT hasn't landed), so `b` fails the top-level `save()` no-op
check and queues normally, then `pump()` early-returns because `inFlight`
is `true`. `resolveFirst()` lands a's 200 → `acceptedFingerprint` is set to
`fingerprint(a)`, `a`'s waiter resolves, `inFlight = false`, `pump()` fires
again → dequeues `b`, computes `fingerprint(b)` — identical content to `a`,
so `fingerprint(b) === acceptedFingerprint` → the Minor-3 shortcut resolves
`b`'s waiter with **zero** additional `fetch` calls. `calls` stays `[0]`.

### Minor 4 — tag `load()`'s success-path JSON parse

**The fix:** `load()`'s `resp.json()` call (after the new `resp.ok` guard)
now has an explicit `.catch` that tags a malformed body with a new
`load-error` code (distinct from `offline`/`offline-cache`, since this is a
different failure class — the server responded 200 but with unparseable
JSON — and there's no existing code that honestly describes it):
```js
const body = await resp.json().catch((cause) => {
  const e = new Error('malformed load response'); e.code = 'load-error'; e.cause = cause; throw e;
});
```
No new test was written specifically for this (not requested), but the
existing `load()` tests continue to exercise the parse path with
well-formed bodies, and the change is a pure addition (a `.catch` around an
`await` that previously had none) — it cannot regress any passing
`load()` test since none of them feed a body that fails `resp.json()`.

### Minor 5 — pin the "no revision leak" contract with tests

**The fix:** added two tests, one on each side of the boundary:
```javascript
// createOmsApiStore save
it('never leaks revision into the PUT body doc', async () => {
  const fetchMock = vi.fn(() => jsonResponse({ revision: 1 }));
  global.fetch = fetchMock;
  const store = createOmsApiStore({ baseUrl: '/api', cache: createMemoryEnvelopeCache() });
  await store.save(withUi);
  const body = JSON.parse(fetchMock.mock.calls[0][1].body);
  expect('revision' in body.doc).toBe(false);
});

// createOmsApiStore load
it('never leaks revision into the returned document', async () => {
  global.fetch = vi.fn(() => jsonResponse({ doc: P, revision: 3, schema_version: 4 }));
  const store = createOmsApiStore({ baseUrl: '/api', cache: createMemoryEnvelopeCache() });
  const loaded = await store.load();
  expect('revision' in loaded).toBe(false);
});
```
Both currently pass by construction (revision has always lived in the
closure, never on the document object), so this pins the existing
guarantee against a future regression rather than fixing anything.

### Commands / output

```
$ npx vitest run src/state/omsApiStore.test.js
```
**Result:** 19 passed (19). Re-ran 5 times back-to-back — 19/19 every time,
no flake, durations 109–112ms (much faster than the previous round's
600ms+ — no `fake-indexeddb`/module-graph cold start this time since the
process wasn't restarted between runs by the shell loop... actually each
`npx vitest run` invocation is a fresh process; the faster times likely
reflect OS-level warm caches from the immediately preceding identical runs,
not a code change).

```
$ npx vitest run --max-workers=2
```
**Result:** 355 total, 352 passed, 1 failed, 2 skipped/pending. Verified via
the JSON reporter's `testResults` that the sole failure is, again, only
`conformance/runners/baseline.test.js > conformance baseline ratchet (spec
§5.7)` — identical failure signature to every prior round in this ledger.
Arithmetic: 333 (Task 8 baseline) + 19 (this file's total after this fix
round, up from 14: +5 new tests — 5xx GET, load revision-leak, PUT-body
revision-leak, in-flight dedup, cache-failure-resolves) = 352 pass, 1 fail
(unchanged), 2 skipped (unchanged), 355 total. No regression.

### Concerns status after this round

- **Critical (unhandled rejection stranding `inFlight`) — FIXED**, three-part
  fix as described, verified by the cache-failure test (which would have
  hung/timed-out pre-fix).
- **Important (`load()` not checking `resp.ok`) — FIXED**, verified by the
  5xx-GET test.
- **Minor 3 (duplicate in-flight PUT of identical doc) — FIXED**, verified
  by the in-flight-dedup test.
- **Minor 4 (`load()` success-path JSON tagging) — FIXED**, no new test
  (not requested; change is additive and cannot regress existing passing
  cases).
- **Minor 5 (revision-leak pinning) — FIXED**, two new tests added.
- **Carried forward, unchanged, still open (from the prior fix round, now
  renumbered again for continuity):**
  - `clear()` only clears the cache, not `revision`/`acceptedFingerprint` —
    documented sharp edge, not a defect, matches the stated contract.
  - `stale-write` on 409 does not itself block a subsequent `save()` from
    reusing the stale revision — Task 10 must enforce reload-before-retry;
    the test name (`throws stale-write on 409`) no longer implies otherwise.
  - The 5xx `load()` path (this round's Important fix) does not fall back
    to the cached envelope the way the network-failure `catch` branch
    does — flagged above as a design asymmetry worth a future look, not
    fixed unilaterally since it wasn't asked for.

### Files changed (this fix round)

- `src/state/omsApiStore.js` — `load()` gained an `resp.ok` guard and a
  tagged JSON-parse catch; `pump()`'s IIFE gained an outer try/catch,
  a guarded 409 body parse, a best-effort cache write on success, and a
  pre-PUT identical-fingerprint shortcut. Public `{load, save, clear}`
  surface unchanged.
- `src/state/omsApiStore.test.js` — 5 new tests (5xx GET, load
  revision-leak, PUT-body revision-leak, in-flight dedup, cache-failure
  doesn't lock the queue). No existing test was changed or removed in this
  round.

### Commit

```
b2806c4 fix(oms): omsApiStore — harden PUT/GET against unhandled rejections
```
Trailer present.
