### Task 13: Persistence — SchedulerStore, IndexedDB, JSON backup

**Files:**
- Create: `src/state/persistence.js`
- Test: `src/state/persistence.test.js`

**Interfaces:**
- Consumes: nothing domain-side (state is opaque JSON here).
- Produces:
  - `SCHEMA_VERSION = 1`
  - `serialize(state) → string`, `deserialize(json) → state` (throws `{code:'version-mismatch'}` on wrong version — **never silently drops data**)
  - `createMemoryStore() → SchedulerStore`, `createIdbStore(dbName?) → SchedulerStore` where SchedulerStore = `{load() → Promise<state|null>, save(state) → Promise<void>, clear() → Promise<void>}` — Task 14's provider takes any SchedulerStore (memory in tests, IndexedDB in the app)

- [ ] **Step 1: Write the failing test**

`src/state/persistence.test.js`:

```js
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { createMemoryStore, createIdbStore, serialize, deserialize, SCHEMA_VERSION } from './persistence.js';
import { seedState } from './store.js';

describe('persistence', () => {
  it('round-trips state through the memory store', async () => {
    const store = createMemoryStore();
    expect(await store.load()).toBeNull();
    const state = seedState();
    await store.save(state);
    expect(await store.load()).toEqual(state);
    await store.clear();
    expect(await store.load()).toBeNull();
  });
  it('round-trips state through IndexedDB', async () => {
    const store = createIdbStore('wcah-test');
    const state = seedState();
    await store.save(state);
    expect(await store.load()).toEqual(state);
    await store.clear();
    expect(await store.load()).toBeNull();
  });
  it('embeds the schema version and refuses mismatches loudly', () => {
    const json = serialize({ hello: 'world' });
    expect(JSON.parse(json).schemaVersion).toBe(SCHEMA_VERSION);
    const wrong = JSON.stringify({ schemaVersion: 999, state: {} });
    expect(() => deserialize(wrong)).toThrowError(expect.objectContaining({ code: 'version-mismatch' }));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/state/persistence.test.js`
Expected: FAIL — `Cannot find module './persistence.js'`.

- [ ] **Step 3: Implement**

`src/state/persistence.js`:

```js
/** Bump when the persisted state shape changes; add a migration in deserialize. */
export const SCHEMA_VERSION = 1;

export function serialize(state) {
  return JSON.stringify({ schemaVersion: SCHEMA_VERSION, state });
}

export function deserialize(json) {
  const doc = JSON.parse(json);
  if (doc.schemaVersion !== SCHEMA_VERSION) {
    // Future migrations run here. Unknown versions refuse loudly — never drop data.
    const err = new Error(`Saved data uses schema v${doc.schemaVersion}; this app expects v${SCHEMA_VERSION}.`);
    err.code = 'version-mismatch';
    throw err;
  }
  return doc.state;
}

/** In-memory SchedulerStore — tests and fallbacks. */
export function createMemoryStore() {
  let saved = null;
  return {
    async load() { return saved ? deserialize(saved) : null; },
    async save(state) { saved = serialize(state); },
    async clear() { saved = null; },
  };
}

/** IndexedDB SchedulerStore — single kv object store, whole-state document. */
export function createIdbStore(dbName = 'wcah-scheduler') {
  const open = () =>
    new Promise((resolve, reject) => {
      const req = indexedDB.open(dbName, 1);
      req.onupgradeneeded = () => req.result.createObjectStore('kv');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  const run = async (mode, op) => {
    const db = await open();
    try {
      return await new Promise((resolve, reject) => {
        const request = op(db.transaction('kv', mode).objectStore('kv'));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  };
  return {
    async load() {
      const json = await run('readonly', (s) => s.get('state'));
      return json ? deserialize(json) : null;
    },
    async save(state) {
      await run('readwrite', (s) => s.put(serialize(state), 'state'));
    },
    async clear() {
      await run('readwrite', (s) => s.delete('state'));
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/state/persistence.test.js`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/state/persistence.js src/state/persistence.test.js
git commit -m "feat(state): SchedulerStore persistence with versioned schema and IndexedDB"
```

---

