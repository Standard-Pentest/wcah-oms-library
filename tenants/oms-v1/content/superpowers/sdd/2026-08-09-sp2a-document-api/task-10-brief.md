## Task 10: Frontend — `OmsContext` state machine + store selection + Vite proxy

**Files:**
- Modify: `src/state/OmsContext.jsx`
- Modify: `vite.config.js`
- Test: `src/state/OmsContext.api.test.jsx`

**Interfaces:**
- Consumes: `createOmsApiStore` (Task 9), `createOmsEnvelopeCache` (Task 7), `classifyAction` (Task 8), `toPersistedOms`/`hydrateOms` (Task 6), existing `createOmsIdbStore`, `reducer`, `seedDocument`.
- Produces: an `OmsProvider` that, in API mode, hydrates from the server, guards dispatch offline, rolls back failed edits, reloads on stale writes, and resets via an audited PUT.

- [ ] **Step 1: Add the Vite proxy**

Modify `vite.config.js`:
```javascript
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5174,
    proxy: { '/api': 'http://localhost:8000' },
  },
  test: { setupFiles: ['./src/test-setup.js'] },
});
```

- [ ] **Step 2: Write the failing state-machine tests**

Create `src/state/OmsContext.api.test.jsx`:
```javascript
// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { OmsProvider, useOms } from './OmsContext.jsx';

function Probe() {
  const { doc, storeStatus, dispatch, ready } = useOms();
  return (
    <div>
      <span data-testid="status">{storeStatus}</span>
      <span data-testid="ready">{String(ready)}</span>
      <span data-testid="emp">{doc?.employees?.length ?? -1}</span>
      <button onClick={() => dispatch({ type: 'SET_SCREEN', screen: 'team' })}>nav</button>
      <button onClick={() => dispatch({ type: 'UPSERT_EMPLOYEE', employee: { id: 'z', displayName: 'Z' } })}>edit</button>
    </div>
  );
}

function fakeStore(overrides = {}) {
  return {
    load: vi.fn(async () => null),
    save: vi.fn(async () => {}),
    clear: vi.fn(async () => {}),
    ...overrides,
  };
}

describe('OmsContext API mode', () => {
  it('hydrates from the server load without scheduling a write', async () => {
    const store = fakeStore({ load: vi.fn(async () => ({ version: 4, weekOrder: ['2026-08-02'], employees: [{ id: 'a' }] })) });
    render(<OmsProvider store={store} apiMode><Probe /></OmsProvider>);
    await waitFor(() => expect(screen.getByTestId('ready').textContent).toBe('true'));
    expect(screen.getByTestId('emp').textContent).toBe('1');
    expect(store.save).not.toHaveBeenCalled();
  });

  it('goes read-only on offline-cache and rejects scheduling mutations, allows navigation', async () => {
    const err = Object.assign(new Error('offline'), { code: 'offline-cache', cachedDoc: { version: 4, weekOrder: ['2026-08-02'], employees: [] } });
    const store = fakeStore({ load: vi.fn(async () => { throw err; }) });
    render(<OmsProvider store={store} apiMode><Probe /></OmsProvider>);
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('offline'));
    act(() => { screen.getByText('edit').click(); });        // scheduling mutation → rejected
    expect(store.save).not.toHaveBeenCalled();
    act(() => { screen.getByText('nav').click(); });          // navigation → allowed
    // no throw; still offline
    expect(screen.getByTestId('status').textContent).toBe('offline');
  });

  it('reloads latest on a stale write and surfaces reloaded-remote-change', async () => {
    let n = 0;
    const store = fakeStore({
      load: vi.fn(async () => (n++ === 0
        ? { version: 4, weekOrder: ['2026-08-02'], employees: [] }
        : { version: 4, weekOrder: ['2026-08-02'], employees: [{ id: 'server' }] })),
      save: vi.fn(async () => { throw Object.assign(new Error('stale'), { code: 'stale-write', currentRevision: 5 }); }),
    });
    render(<OmsProvider store={store} apiMode><Probe /></OmsProvider>);
    await waitFor(() => expect(screen.getByTestId('ready').textContent).toBe('true'));
    act(() => { screen.getByText('edit').click(); });
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('reloaded-remote-change'));
    expect(screen.getByTestId('emp').textContent).toBe('1'); // server content, not local edit
  });
});
```

- [ ] **Step 3: Run and watch it fail**

Run: `npx vitest run src/state/OmsContext.api.test.jsx`
Expected: FAIL — provider does not implement the state machine.

- [ ] **Step 4: Rewrite `OmsProvider` (API-aware; IDB mode unchanged)**

Replace `src/state/OmsContext.jsx` with:
```javascript
import React, {
  createContext, useContext, useEffect, useMemo, useReducer, useRef, useState,
} from 'react';
import { seedDocument, reducer } from './omsStore.js';
import { createOmsIdbStore } from './omsPersistence.js';
import { createOmsApiStore } from './omsApiStore.js';
import { createOmsEnvelopeCache } from './omsEnvelope.js';
import { classifyAction } from './omsActionClass.js';
import { toPersistedOms, hydrateOms } from './omsProjection.js';

const OmsContext = createContext(null);

const apiBase = import.meta.env?.VITE_API_BASE;
const defaultStore = apiBase
  ? createOmsApiStore({ baseUrl: apiBase, cache: createOmsEnvelopeCache() })
  : createOmsIdbStore();
const API_MODE = Boolean(apiBase);

export function OmsProvider({ children, store = defaultStore, apiMode = API_MODE }) {
  const [doc, dispatch] = useReducer(reducer, null, seedDocument);
  const [storeStatus, setStoreStatus] = useState('loading');
  const [writesEnabled, setWritesEnabled] = useState(false);
  const [ready, setReady] = useState(false);
  const [saveEpoch, setSaveEpoch] = useState(0); // bumps only on scheduling mutations (API mode)
  const lastAccepted = useRef(null);   // last accepted PERSISTED doc (no ui)

  // ---- hydrate ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await store.load();
        if (cancelled) return;
        if (raw?.version === 4) {
          lastAccepted.current = toPersistedOms(raw);
          dispatch({ type: 'REPLACE', doc: hydrateOms(toPersistedOms(raw), undefined) });
        } else {
          lastAccepted.current = toPersistedOms(seedDocument());
        }
        setWritesEnabled(true);
        setStoreStatus('ok');
      } catch (e) {
        if (cancelled) return;
        if (e.code === 'offline-cache') {
          lastAccepted.current = toPersistedOms(e.cachedDoc);
          dispatch({ type: 'REPLACE', doc: hydrateOms(toPersistedOms(e.cachedDoc), undefined) });
          setWritesEnabled(false);
          setStoreStatus('offline');
        } else if (e.code === 'offline') {
          setWritesEnabled(false);
          setStoreStatus('offline');
        } else {
          setWritesEnabled(true);
          setStoreStatus(e.code === 'version-mismatch' ? 'version-mismatch' : 'error');
          if (e.code === 'version-mismatch') setWritesEnabled(false);
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, [store]);

  // ---- guarded dispatch (API mode only) ----
  const guardedDispatch = useMemo(() => {
    if (!apiMode) return dispatch;
    return (action) => {
      const kind = classifyAction(action.type);
      if (kind === 'scheduling') {
        if (!writesEnabled || storeStatus === 'offline') return; // reject while read-only
        dispatch(action);
        setSaveEpoch((e) => e + 1); // only scheduling edits schedule a write
      } else {
        dispatch(action); // local + system actions never write
      }
    };
  }, [apiMode, writesEnabled, storeStatus]);

  // ---- debounced save ----
  // IDB mode: save on any doc change (unchanged legacy behavior).
  // API mode: gated on saveEpoch so mount/hydration never seeds the server
  //   (spec §11); the first scheduling mutation establishes revision 1. The
  //   equal-projection no-op in the store still absorbs any UI-only change.
  useEffect(() => {
    if (!ready || !writesEnabled) return undefined;
    if (apiMode && saveEpoch === 0) return undefined; // nothing edited yet
    // `doc` is in deps, so the effect re-runs on every change; the closure doc
    // is always current when the debounce fires.
    const timeout = setTimeout(() => {
      store.save(doc).catch(async (e) => {
        if (e.code === 'stale-write') {
          try {
            const latest = await store.load();
            if (latest?.version === 4) {
              lastAccepted.current = toPersistedOms(latest);
              dispatch({ type: 'REPLACE', doc: hydrateOms(toPersistedOms(latest), doc.ui) });
            }
            setStoreStatus('reloaded-remote-change');
          } catch { setStoreStatus('error'); }
        } else if (e.code === 'offline') {
          if (lastAccepted.current) {
            dispatch({ type: 'REPLACE', doc: hydrateOms(lastAccepted.current, doc.ui) });
          }
          setWritesEnabled(false);
          setStoreStatus('offline');
        } else {
          if (lastAccepted.current) {
            dispatch({ type: 'REPLACE', doc: hydrateOms(lastAccepted.current, doc.ui) });
          }
          setStoreStatus('save-error');
        }
      });
    }, 300);
    return () => clearTimeout(timeout);
  }, [doc, saveEpoch, ready, writesEnabled, store, apiMode]);

  // ---- reconnect ----
  const reconnect = async () => {
    try {
      const latest = await store.load();
      if (latest?.version === 4) {
        lastAccepted.current = toPersistedOms(latest);
        dispatch({ type: 'REPLACE', doc: hydrateOms(toPersistedOms(latest), doc.ui) });
      }
      setWritesEnabled(true);
      setStoreStatus('ok');
    } catch { setStoreStatus('offline'); }
  };

  // ---- reset to seed: audited PUT first, then REPLACE ----
  const resetToSeed = async () => {
    const seed = seedDocument();
    try {
      await store.save(toPersistedOms(seed));   // no-op-safe; establishes acceptance
      lastAccepted.current = toPersistedOms(seed);
      dispatch({ type: 'REPLACE', doc: seed });
      setWritesEnabled(true);
      setStoreStatus('ok');
      return seed;
    } catch (e) {
      setStoreStatus(e.code === 'offline' ? 'offline' : 'save-error');
      return doc; // display + cache untouched on failure
    }
  };

  const value = useMemo(
    () => ({ doc, dispatch: guardedDispatch, storeStatus, writesEnabled, ready, reconnect, resetToSeed }),
    [doc, guardedDispatch, storeStatus, writesEnabled, ready],
  );
  return <OmsContext.Provider value={value}>{children}</OmsContext.Provider>;
}

export function useOms() {
  const ctx = useContext(OmsContext);
  if (!ctx) throw new Error('useOms outside provider');
  return ctx;
}
```

Note: the tests pass `apiMode` explicitly because `VITE_API_BASE` is unset under Vitest (so the runtime default `API_MODE` is false). The `apiMode` prop exists precisely so the state machine is testable without env vars; production selects it from `import.meta.env.VITE_API_BASE`.

- [ ] **Step 5: Run the new tests and the existing context tests**

Run:
```bash
npx vitest run src/state/OmsContext.api.test.jsx src/state/OmsContext.oms.test.jsx
```
Expected: PASS. The existing IDB-mode test must still pass (IDB path is unchanged when `apiMode` is false).

- [ ] **Step 6: Commit**

```bash
git add src/state/OmsContext.jsx vite.config.js src/state/OmsContext.api.test.jsx
git commit -m "feat(oms): OmsContext API state machine (offline read-only, rollback, stale reload, audited reset) + vite /api proxy"
```

---

