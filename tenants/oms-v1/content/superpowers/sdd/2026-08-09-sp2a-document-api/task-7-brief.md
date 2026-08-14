## Task 7: Frontend — envelope codec + last-known-good cache

**Files:**
- Create: `src/state/omsEnvelope.js`
- Test: `src/state/omsEnvelope.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `serializeOmsEnvelope`, `deserializeOmsEnvelope`, `createOmsEnvelopeCache`, `createMemoryEnvelopeCache` (see Module contracts).

- [ ] **Step 1: Write the failing test**

Create `src/state/omsEnvelope.test.js`:
```javascript
// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import {
  serializeOmsEnvelope, deserializeOmsEnvelope,
  createMemoryEnvelopeCache, createOmsEnvelopeCache,
} from './omsEnvelope.js';

describe('envelope codec', () => {
  it('round-trips { schemaVersion, revision, doc }', () => {
    const env = { revision: 12, doc: { version: 4, employees: [] } };
    const back = deserializeOmsEnvelope(serializeOmsEnvelope(env));
    expect(back).toEqual({ schemaVersion: 4, revision: 12, doc: { version: 4, employees: [] } });
  });
  it('throws version-mismatch on wrong schemaVersion', () => {
    const bad = JSON.stringify({ schemaVersion: 3, revision: 1, doc: {} });
    expect(() => deserializeOmsEnvelope(bad)).toThrowError(/version-mismatch|schema/i);
  });
});

describe('memory envelope cache', () => {
  it('stores and returns the envelope, and clears', async () => {
    const c = createMemoryEnvelopeCache();
    expect(await c.loadEnvelope()).toBeNull();
    await c.saveEnvelope({ revision: 2, doc: { version: 4 } });
    expect((await c.loadEnvelope()).revision).toBe(2);
    await c.clearEnvelope();
    expect(await c.loadEnvelope()).toBeNull();
  });
});

describe('idb envelope cache', () => {
  it('persists across cache instances (same dbName)', async () => {
    const a = createOmsEnvelopeCache({ dbName: 'oms-env-test' });
    await a.saveEnvelope({ revision: 5, doc: { version: 4 } });
    const b = createOmsEnvelopeCache({ dbName: 'oms-env-test' });
    expect((await b.loadEnvelope()).revision).toBe(5);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run src/state/omsEnvelope.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/state/omsEnvelope.js`:
```javascript
const SCHEMA = 4;

export function serializeOmsEnvelope({ revision, doc }) {
  return JSON.stringify({ schemaVersion: SCHEMA, revision, doc });
}

export function deserializeOmsEnvelope(json) {
  const env = JSON.parse(json);
  if (env.schemaVersion !== SCHEMA) {
    const err = new Error(`envelope expects schema v${SCHEMA}, got v${env.schemaVersion}`);
    err.code = 'version-mismatch';
    throw err;
  }
  return env;
}

export function createMemoryEnvelopeCache() {
  let saved = null;
  return {
    async loadEnvelope() { return saved ? deserializeOmsEnvelope(saved) : null; },
    async saveEnvelope(env) { saved = serializeOmsEnvelope(env); },
    async clearEnvelope() { saved = null; },
  };
}

export function createOmsEnvelopeCache({ dbName = 'wcah-oms-envelope' } = {}) {
  const open = () => new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  const run = async (mode, op) => {
    const db = await open();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction('kv', mode);
        const request = op(tx.objectStore('kv'));
        let result;
        request.onsuccess = () => { result = request.result; };
        request.onerror = () => reject(request.error ?? new Error('IDB request failed'));
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error ?? new Error('IDB tx failed'));
        tx.onabort = () => reject(tx.error ?? new Error('IDB tx aborted'));
      });
    } finally { db.close(); }
  };
  return {
    async loadEnvelope() {
      const json = await run('readonly', (s) => s.get('envelope'));
      return json ? deserializeOmsEnvelope(json) : null;
    },
    async saveEnvelope(env) {
      await run('readwrite', (s) => s.put(serializeOmsEnvelope(env), 'envelope'));
    },
    async clearEnvelope() {
      await run('readwrite', (s) => s.delete('envelope'));
    },
  };
}
```

- [ ] **Step 4: Run and watch it pass**

Run: `npx vitest run src/state/omsEnvelope.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/state/omsEnvelope.js src/state/omsEnvelope.test.js
git commit -m "feat(oms): envelope codec + last-known-good cache (revision internal)"
```

---

