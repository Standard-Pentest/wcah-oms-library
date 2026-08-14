# Task 10 Report: Frontend — `OmsContext` state machine + store selection + Vite `/api` proxy

## Summary
Rewrote `OmsProvider` to be API-mode-aware: it selects `createOmsApiStore` when
`VITE_API_BASE` is set (else keeps the existing `createOmsIdbStore` path
unchanged), hydrates from the server, guards scheduling-mutation dispatches
while offline, rolls back to `lastAccepted` on a failed save, reloads and
surfaces `reloaded-remote-change` on a stale write, and resets via an audited
PUT (`store.save` before `REPLACE`). Added the Vite `/api → localhost:8000`
dev proxy. Implementation matches the brief's provided code verbatim — no
deviations were needed.

## TDD Evidence

### RED (Step 3)
```bash
$ npx vitest run src/state/OmsContext.api.test.jsx
```
**Result:** FAIL (3) — against the pre-Task-10 provider: no `apiMode` prop,
no offline/stale-write state machine, so all three tests failed (one hung to
its `waitFor` timeout looking for `ready`/`status` values the old provider
never reaches; the stale-write test resolved to `save-error` instead of
`reloaded-remote-change`; `emp` stayed at seed count `42` instead of the
server-provided doc).

### GREEN (Step 5)
```bash
$ npx vitest run src/state/OmsContext.api.test.jsx src/state/OmsContext.oms.test.jsx
```
**Result:** PASS (5) FAIL (0)

- `OmsContext API mode › hydrates from the server load without scheduling a write`
- `OmsContext API mode › goes read-only on offline-cache and rejects scheduling mutations, allows navigation`
- `OmsContext API mode › reloads latest on a stale write and surfaces reloaded-remote-change`
- `OmsProvider stability › creates the default persistence store once across provider renders`
- `OmsProvider stability › debounces rapid document saves into one persistence write`

The last two are the **pre-existing IDB-mode tests**, unmodified, run against
the new provider — confirms IDB mode (`apiMode` false, the runtime default
when `VITE_API_BASE` is unset) is behaviorally unchanged: `createOmsIdbStore`
is still invoked exactly once at module scope, `load()` fires once, and rapid
`dispatch` calls still coalesce into a single debounced `save()`.

### Full Suite
```bash
$ npx vitest run --max-workers=2
```
**Result:** PASS (355) FAIL (1) skipped (2)

- **Before (this task):** 352 pass, 1 pre-existing fail (conformance baseline
  ratchet), 2 skipped.
- **After:** 355 pass (352 + 3 new API-mode tests), same 1 pre-existing fail,
  same 2 skipped.
- **Status:** No regressions. The one failure is
  `conformance baseline ratchet (spec §5.7)` in
  `conformance/runners/baseline.test.js` — untouched by this task, matches
  the documented baseline-ratchet state.

`npm run build` also verified clean (54 modules transformed, no errors).

## Implementation Details

**File modified:** `src/state/OmsContext.jsx` (full replacement per brief)

Key pieces:
1. **Store selection at module scope** — `apiBase = import.meta.env?.VITE_API_BASE`
   picks `createOmsApiStore({ baseUrl, cache: createOmsEnvelopeCache() })` when
   set, else `createOmsIdbStore()`. `API_MODE = Boolean(apiBase)` is the
   runtime default for the new `apiMode` prop, which tests override directly
   since Vitest has no `VITE_API_BASE`.
2. **Hydration effect** — on `store.load()` success with `version === 4`,
   projects to `lastAccepted` (persisted, no `ui`) and dispatches `REPLACE`
   with `hydrateOms(...)` (fresh default UI). On `offline-cache`, does the
   same from `e.cachedDoc` but leaves `writesEnabled` false and
   `storeStatus` `'offline'`. On plain `offline`, no doc change, just
   read-only. `finally` always sets `ready` true (cancellation-safe via a
   `cancelled` flag).
3. **`guardedDispatch`** — identity `dispatch` when `!apiMode` (IDB mode, and
   the reason the existing test file needed zero changes). In API mode,
   `classifyAction(action.type)` routes: `scheduling` actions are dropped
   silently when `!writesEnabled || storeStatus === 'offline'`, otherwise
   dispatched and bump `saveEpoch`; `local`/`system` actions always pass
   through raw `dispatch` and never touch `saveEpoch`.
4. **Debounced save effect** — the persistence-epoch gate
   (`if (apiMode && saveEpoch === 0) return undefined;`) means mount/hydration
   never schedules a write in API mode; only a prior scheduling dispatch
   (which bumped `saveEpoch`) unlocks the 300 ms debounce. On failure:
   `stale-write` reloads the server doc and sets
   `'reloaded-remote-change'`; `offline` rolls back to `lastAccepted` and
   flips `writesEnabled` false; anything else rolls back and sets
   `'save-error'`.
5. **`reconnect`** — new, exposed on context value; re-`load()`s and restores
   `writesEnabled`/`'ok'` on success, `'offline'` on failure. Not yet wired
   into any UI (no caller added — out of this task's file scope).
6. **`resetToSeed`** — now audits: `store.save(toPersistedOms(seed))` first
   (no-op-safe per the store's equal-projection check), only then
   `lastAccepted` update + `REPLACE` dispatch + `writesEnabled`/`'ok'`. No
   longer calls `store.clear()` (dropped per the brief — clearing the local
   cache isn't part of an audited reset; the PUT itself is the record of
   truth). Confirmed no existing test asserted the old `clear()` call.
   Still consumed unchanged by `src/ui/App.jsx` and
   `src/ui/oms/ConfigurationScreen.jsx` (both just call `resetToSeed()` and
   use the returned doc — signature-compatible).
   **This function is shared code, not branched on `apiMode`** — see
   Concerns below for what that changes in IDB mode specifically.

**File modified:** `vite.config.js` — added
`server.proxy: { '/api': 'http://localhost:8000' }` alongside the existing
`port: 5174`.

**File created:** `src/state/OmsContext.api.test.jsx` — the brief's three
state-machine tests verbatim (hydrate-no-write, offline-cache read-only +
guarded dispatch, stale-write reload).

## Verification Beyond the Brief

Before committing I checked two things not explicitly tested by the brief's
suite, since a state-machine rewrite this size deserved a wider blast-radius
check:

1. **Every action type dispatched anywhere in live UI code
   (`src/ui/**`, `src/state/**`, excluding tests/legacy) is classified by
   `classifyAction`.** `guardedDispatch` calls `classifyAction(action.type)`
   unguarded — an unclassified type would throw inside an `onClick` handler.
   Cross-referenced the full set of dispatched types against
   `SCHEDULING_MUTATIONS` / `LOCAL_ONLY_ACTIONS` / `SYSTEM_ACTIONS` in
   `src/state/omsActionClass.js`: all covered, none missing.
2. **`resetToSeed`'s dropped `store.clear()` call** doesn't regress any
   existing test or caller — grepped for `resetToSeed` and `.clear(` usages;
   only consumers are `App.jsx` (banner button) and `ConfigurationScreen.jsx`
   (reset action), both signature-compatible with the new return value.

One pre-existing UI wrinkle noted but **not fixed** (out of this task's file
scope — only `OmsContext.jsx`, `vite.config.js`, and the new test file were
authorized): `src/ui/App.jsx`'s `StorageBanner` renders for any
`storeStatus !== 'ok' && !== 'loading'`, so the new `'offline'` and
`'reloaded-remote-change'` statuses will now show the existing generic
"Storage issue — running from seed." copy, which is misleading for those two
cases (data is live, not a from-seed fallback). This is a UI/banner-copy
concern for a later task, not a defect in the state machine itself.

## Constraints Verified

- Only `src/state/OmsContext.jsx`, `vite.config.js`, and
  `src/state/OmsContext.api.test.jsx` touched (plus this report, which is
  gitignored under `.superpowers/` — see Commit section).
  `src/engine`, `src/seed`, `src/domain`, `src/data`, `conformance/`,
  `omsStore.js`, `omsMutations.js` untouched.
- IDB mode (`apiMode` false) dispatch path and debounced-save-on-change path
  are behaviorally identical to before: existing `OmsContext.oms.test.jsx`
  passes unmodified, unchanged. **`resetToSeed` is shared code, not gated on
  `apiMode`, and it did change in IDB mode too** — see Concerns.
- Persistence-epoch gate preserved exactly as given in the brief — no
  simplification.
- `apiMode` prop present, defaulting from `import.meta.env.VITE_API_BASE`.
- Vite proxy `/api` → `http://localhost:8000` added.
- Commit message ends with the required co-author line.

## Self-Review

**Strengths:**
- Brief's code applied verbatim; no interpretation or "simplification" of the
  epoch gate or rollback logic.
- Traced all three new tests by hand against `omsApiStore.js`,
  `omsProjection.js`, and `omsActionClass.js` semantics before running them,
  to catch any interface mismatch early — none found.
- Confirmed no unclassified action type can reach `guardedDispatch` from live
  UI code.
- Full-suite delta is exactly +3 pass, 0 new fails, matching the task's
  stated expectation precisely.

**Concerns:**
- **`resetToSeed` changed behavior in IDB mode too, not just API mode** —
  it's shared code with no `apiMode` branch. Old order:
  `dispatch(REPLACE)` + `writesEnabled=true` + `storeStatus='ok'`
  unconditionally *first*, then `store.clear()` + `store.save()`; any
  failure there only flipped `storeStatus` to `'save-error'` (display and
  `writesEnabled` already recovered). New order (per brief, applied as-is):
  `store.save()` first; `REPLACE`/`writesEnabled`/`'ok'` only fire on
  success; on throw, `doc` is returned **unchanged** and `writesEnabled`
  stays whatever it already was. Concretely: in IDB mode, `writesEnabled`
  is false only after a `'version-mismatch'` load, and that's the one case
  `App.jsx`'s `StorageBanner` renders its "Reset to seed" button for. If
  `store.save()` then throws (e.g. IDB write failure), the banner's button
  now looks dead — display stays on the bad doc instead of recovering to
  seed — and the old unconditional `store.clear()` (which wiped the
  stale-version payload so the *next* load wouldn't re-trip
  `version-mismatch`) no longer runs either. This is a deliberate
  consequence of the brief's exact code (audited-write-first is the correct
  semantic for API mode, and `resetToSeed` isn't mode-specific in the
  brief), not a bug I introduced by deviating — but it's a real IDB-mode
  regression risk worth a follow-up look, since `OmsContext.oms.test.jsx`
  never exercises `resetToSeed` and so didn't catch it. I did not change
  the code: Task 10's file scope is `OmsContext.jsx`/`vite.config.js`/the
  new test only, and the brief's code is authoritative for this task.
- `StorageBanner` in `src/ui/App.jsx` shows a from-seed message for
  `'offline'`/`'reloaded-remote-change'`, which is now reachable but was out
  of this task's file scope to fix. Flagged above; likely belongs to a later
  UI-wiring task in the SP2a series.
- `reconnect` is exposed on the context but has no caller yet (also likely
  future UI work — a "reconnect" button/banner action).
- Neither of the above is a correctness defect in `OmsContext.jsx` itself and
  neither breaks any current test or consumer.

## Files Changed

- `src/state/OmsContext.jsx` — rewritten (108 insertions, 33 deletions)
- `vite.config.js` — `server.proxy` added (4 insertions, 1 deletion)
- `src/state/OmsContext.api.test.jsx` — new, 65 lines

## Commit

```
2ca391e feat(oms): OmsContext API state machine (offline read-only, rollback, stale reload, audited reset) + vite /api proxy
```

Report file (`task-10-report.md`) is not part of this commit — `.superpowers/`
is gitignored (`.gitignore:4`), and no prior task report in this series is
tracked either (`git ls-files .superpowers/sdd/2026-08-09-sp2a-document-api/`
returns nothing). Matches the brief's Step 6, which stages only the three
code files.
