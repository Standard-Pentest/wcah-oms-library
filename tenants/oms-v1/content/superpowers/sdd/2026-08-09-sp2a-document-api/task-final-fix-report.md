# SP2a persistence layer — final code-review fix wave

Branch `sp2a-document-api`. Scope respected: only
`src/state/omsApiStore.js`, `src/state/OmsContext.jsx`,
`src/state/OmsContext.api.test.jsx`, `src/state/OmsContext.oms.test.jsx`
were touched.

## Fix 1 (data loss) — guard `load()`'s cache write in `src/state/omsApiStore.js`

```diff
     revision = body.revision;
     if (body.doc) {
       acceptedFingerprint = canonicalStringify(body.doc);
-      await cache.saveEnvelope({ revision, doc: body.doc });
+      // The GET already succeeded and is authoritative — a local cache
+      // failure here must not turn into a load() rejection (which would
+      // otherwise land in OmsContext as a generic, non-'.code' error with
+      // revision already advanced, enabling writes that PUT at the real
+      // base_revision and overwrite the server doc with seed content).
+      try { await cache.saveEnvelope({ revision, doc: body.doc }); } catch { /* local cache is best-effort */ }
     }
     return body.doc;
```

Mirrors the existing best-effort pattern already used on the PUT/success
path (`pump()`'s `try { await cache.saveEnvelope(...) } catch { ... }`).
`load()` now always resolves with the server doc after a successful GET,
regardless of local cache health; `revision`/`acceptedFingerprint` stay
advanced, matching "the successful GET is authoritative."

No new test added here per explicit advisor guidance and the task's own
constraint that `src/state/omsApiStore.test.js` is out of scope to modify
(verification step 3 only requires it stay green, which it does — 19/19).

## Fix 2 (regression) — gate the save-error rollback on `apiMode` in `src/state/OmsContext.jsx`

```diff
           } else {
-            if (lastAccepted.current) {
+            // IDB-store failures carry no `.code` and land here. The IDB
+            // store has no equal-projection no-op, so rolling back via
+            // REPLACE would change doc identity, re-run this effect, re-save,
+            // fail again, and roll back again — an infinite loop — while
+            // also discarding the user's edit from the display for a single
+            // transient failure. API mode's store *does* have that no-op
+            // (idempotent PUT retry of the same content resolves without a
+            // second write), so only API mode rolls back here; IDB mode just
+            // surfaces the error and leaves the edit visible (legacy
+            // behavior).
+            if (apiMode && lastAccepted.current) {
               dispatch({ type: 'REPLACE', doc: hydrateOms(lastAccepted.current, doc.ui) });
             }
             setStoreStatus('save-error');
           }
```

`offline` branch left untouched as instructed (IDB errors never carry
`code: 'offline'`, so they can't reach it).

## Fix 3 (data loss) — guard `resetToSeed`'s API-mode PUT behind `writesEnabled`

```diff
   const resetToSeed = async () => {
     const seed = seedDocument();
     if (apiMode) {
+      // Reset must not clobber the server from a read-only/offline state:
+      // while writes are disabled there is no guarantee `revision` reflects
+      // the server's true current revision, so this PUT could overwrite the
+      // authoritative document with the seed. Bail out with the doc and
+      // status untouched.
+      if (!writesEnabled) return doc;
       try {
         await store.save(toPersistedOms(seed));   // no-op-safe; establishes acceptance
```

IDB branch unchanged.

## Fix 4 (minor correctness) — clear a stale error status on save success

```diff
         .then(() => {
           if (cancelled) return;
           lastAccepted.current = toPersistedOms(doc);
+          // Clear any prior 'save-error' / 'reloaded-remote-change' banner
+          // now that a save has gone through. Only reached when writes are
+          // enabled, so this can never override 'offline'.
+          setStoreStatus('ok');
         })
```

### Interaction this fix surfaced (see "Self-review / concerns" below)

Applying Fix 4 literally broke the pre-existing, already-green test
*"advances the acceptance watermark on success, so a later save-error
rolls back to the ACCEPTED edit, not a stale snapshot"* in
`OmsContext.api.test.jsx`. That test's flow: editA succeeds; editB fails
(`save-error`); rollback REPLACEs `doc` back to the accepted edit-A
content; the doc-identity change re-runs the debounced-save effect, which
resaves that (already-accepted) content, and — because the mock's
`save()` only throws when an `id: 'b'` employee is present — that resave
*succeeds*. Before Fix 4 this had no visible effect on status; after Fix 4
its `.then` fires `setStoreStatus('ok')`, so the final status is `'ok'`,
not `'save-error'` as the old assertion expected.

I ran this by the advisor before touching the test. Verdict: this is Fix 4
exactly as specified (the task explicitly names `'save-error'` as a status
to clear on any save success), the assertion I broke was an incidental
tail line rather than the test's stated subject (the `lastAccepted`
watermark — still verified by the surrounding `ids === 'a'` /
`saved[last] === 'a'` / `!== ''` assertions, all still passing), and
`OmsContext.api.test.jsx` is in-scope to modify. I updated that one
assertion to `await waitFor(() => ... toBe('ok'))` with a comment
explaining why, rather than silently deleting or weakening it — see the
diff in `OmsContext.api.test.jsx` below. This is flagged explicitly per
the task's "STOP and report... do not paper over it" instruction; I'm
reporting it as a concern (not blocking) since the advisor's read is that
implementing Fix 4 as literally specified is correct and the test was the
thing that needed to move, not the fix.

## Tests added

### `src/state/OmsContext.oms.test.jsx` (IDB mode, default `apiMode` false)

Added `data-testid="status"` to the shared `Controls` probe (additive,
doesn't affect the two pre-existing tests) and one new test:

> **"keeps the edit visible and does not enter a re-save loop when an IDB save fails"**
> Fake store whose `save` always rejects with a code-less `Error`. Click
> `Switch` (dispatches `SET_SCREEN`, a doc-changing action in IDB mode
> since `guardedDispatch === dispatch` there). After the 300ms debounce
> fires and the save rejects: asserts the edited screen (`'hours'`) is
> still rendered (no rollback), `status` is `'save-error'`, then advances
> fake timers by another 2000ms and asserts `store.save`'s call count
> settled at 1–2 (not growing) and the edit is still visible. This is the
> direct regression guard for Fix 2: pre-fix, the rollback REPLACE would
> change doc identity every cycle, forever re-triggering the effect.

### `src/state/OmsContext.api.test.jsx`

Two new tests, using the existing `Probe`/`fakeStore`/`doc()` harness:

> **"resetToSeed does not PUT while read-only/offline (no destructive overwrite)"**
> Hydrates via an `offline-cache` load (`writesEnabled` false, `status`
> `'offline'`), clicks `reset`, waits 350ms, and asserts `store.save` was
> never called and the displayed doc/ids/status are unchanged. Direct
> regression guard for Fix 3.

> **"storeStatus returns to ok after a save-error is followed by a successful save"**
> Uses a `failing` flag so *every* save fails (including any
> rollback-triggered resave) until flipped off — this pins the failure
> phase deterministically at `'save-error'` rather than letting an
> incidental rollback-resave flip it to `'ok'` for the wrong reason (this
> was an explicit trap the advisor called out: a naive editA-fails →
> editB-succeeds design would pass even if editB's own save were never the
> one that succeeded). After `status` settles at `'save-error'` from
> editA, `failing` is set `false` and `editB` is clicked — the doc-identity
> change from that click cancels any pending rollback-resave `setTimeout`
> (ordinary React effect-cleanup-on-deps-change) and schedules a fresh
> debounced save for editB's content, which now succeeds and clears the
> banner. Direct regression guard for Fix 4.

## Verify

### 1. `npx vitest run src/state/OmsContext.api.test.jsx`
```
PASS (11) FAIL (0)
```
9 pre-existing + 2 new, all green.

### 2. `npx vitest run src/state/OmsContext.oms.test.jsx`
```
PASS (3) FAIL (0)
```
2 pre-existing + 1 new, all green.

### 3. `npx vitest run src/state/omsApiStore.test.js`
```
PASS (19) FAIL (0)
```
Unchanged — confirms Fix 1 didn't break anything here.

### 4. `npx vitest run --max-workers=2` (full suite)
```
PASS (364) FAIL (1) skipped (2)

1. conformance baseline ratchet (spec §5.7) the report equals the committed baseline — new AND fixed divergence both fail
   AssertionError: expected { week: '2026-08-02', …(3) } to deeply equal { week: '2026-08-02', …(3) }
       at /Users/hinchk/WestCoast.Vet/oms/conformance/runners/baseline.test.js:7:32
       ...
```
Exactly the one pre-existing, by-design-red ratchet failure (untouched),
same 2 skipped as baseline. Confirmed the delta is exactly my 3 new tests
by stashing my changes and re-running: unmodified tree is
`PASS (361) FAIL (1) skipped (2)` with the identical single failure.

### 5. `npx vitest run src/data/parity-aug02.test.js`
```
PASS (3) FAIL (0)
```

## Self-review

- All four fixes match the review's specified mechanism exactly (try/catch
  best-effort cache write; `apiMode`-gated rollback; `writesEnabled` guard
  returning `doc` unchanged; `setStoreStatus('ok')` on save success).
- No files outside the four in scope were touched. `App.jsx`,
  `src/engine`, `src/seed`, `src/domain`, `src/data`, `conformance/`, and
  the backend are untouched (confirmed via `git status` / `git diff
  --stat` before committing).
- `git diff --stat` for the two source files: `OmsContext.jsx` +21/-1,
  `omsApiStore.js` +6/-1 — small, surgical, comments included so the "why"
  survives without re-deriving it from the review thread.
- Verified the full-suite delta (361 → 364) empirically via `git stash` /
  `git stash pop` rather than assuming it, per
  `superpowers:verification-before-completion` discipline.

## Concerns (non-blocking, for human ruling)

1. **Fix 4 self-clears the 'save-error' banner very quickly in the common
   case.** With the *real* `omsApiStore` (unlike the plain-mock
   `fakeStore` in tests), after any save-error rollback in API mode, the
   very next debounced save carries the rolled-back (already-accepted)
   content, which hits `save()`'s equal-projection no-op and resolves
   immediately without a network round-trip — so the `.then` success
   handler fires and clears `'save-error'` back to `'ok'` within one
   ~300ms debounce cycle of the original failure, even though the user's
   actual edit was silently discarded by the rollback. The error banner is
   therefore only visible for a brief flash. This is Fix 4 exactly as
   specified in the review (it explicitly names `'save-error'` as a status
   to clear on save success), so I implemented it as written rather than
   narrowing it — but flagging it since a human may want the banner to
   persist longer, or want some other UX signal that an edit was dropped,
   separate from the transient network-status indicator.
2. **Same self-clear mechanism likely shortens `'reloaded-remote-change'`
   too**, for the identical reason (any subsequent successful save,
   including a no-op resave of already-current content, now clears it).
   Not separately tested here since it's outside the four named fixes, but
   worth a human look if that banner is meant to persist until
   acknowledged.
3. I updated one assertion in the pre-existing "advances the acceptance
   watermark" test (final status expectation, `'save-error'` → `'ok'`) to
   match Fix 4's new, correct-per-spec behavior. This was a deliberate,
   documented change to an existing test — not something I did quietly —
   and is called out above and in that test's new comment.

No blockers. All requested fixes and tests are in place and green.
