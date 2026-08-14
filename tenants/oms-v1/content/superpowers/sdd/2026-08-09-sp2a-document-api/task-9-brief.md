## Task 9: Frontend — `createOmsApiStore` (revision, single-flight queue, offline)

**Files:**
- Create: `src/state/omsApiStore.js`
- Test: `src/state/omsApiStore.test.js`

**Interfaces:**
- Consumes: `toPersistedOms` (Task 6), an envelope cache (Task 7).
- Produces: `createOmsApiStore({ baseUrl, cache })` (see Module contracts).

- [ ] **Step 1: Write the failing tests**

Create `src/state/omsApiStore.test.js`:
```javascript
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createOmsApiStore } from './omsApiStore.js';
import { createMemoryEnvelopeCache } from './omsEnvelope.js';

const P = { version: 4, employees: [], scheduleWeeks: {} };
const withUi = { ...P, ui: { screen: 'board' } };

function jsonResponse(body, status = 200) {
  return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
}

beforeEach(() => { vi.restoreAllMocks(); });

describe('createOmsApiStore load', () => {
  it('returns null and tracks revision 0 for the empty sentinel', async () => {
    global.fetch = vi.fn(() => jsonResponse({ doc: null, revision: 0, schema_version: null }));
    const store = createOmsApiStore({ baseUrl: '/api', cache: createMemoryEnvelopeCache() });
    expect(await store.load()).toBeNull();
  });
  it('returns the persisted doc and caches the envelope', async () => {
    const cache = createMemoryEnvelopeCache();
    global.fetch = vi.fn(() => jsonResponse({ doc: P, revision: 3, schema_version: 4 }));
    const store = createOmsApiStore({ baseUrl: '/api', cache });
    expect(await store.load()).toEqual(P);
    expect((await cache.loadEnvelope()).revision).toBe(3);
  });
  it('throws offline-cache with the cached doc on network failure', async () => {
    const cache = createMemoryEnvelopeCache();
    await cache.saveEnvelope({ revision: 7, doc: P });
    global.fetch = vi.fn(() => Promise.reject(new Error('down')));
    const store = createOmsApiStore({ baseUrl: '/api', cache });
    await expect(store.load()).rejects.toMatchObject({ code: 'offline-cache', cachedDoc: P });
  });
  it('throws offline with no cache', async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error('down')));
    const store = createOmsApiStore({ baseUrl: '/api', cache: createMemoryEnvelopeCache() });
    await expect(store.load()).rejects.toMatchObject({ code: 'offline' });
  });
});

describe('createOmsApiStore save', () => {
  it('sends base_revision and advances on 200; strips ui', async () => {
    const fetchMock = vi.fn(() => jsonResponse({ revision: 1 }));
    global.fetch = fetchMock;
    const store = createOmsApiStore({ baseUrl: '/api', cache: createMemoryEnvelopeCache() });
    await store.save(withUi);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.base_revision).toBe(0);
    expect('ui' in body.doc).toBe(false);
  });
  it('is a no-op when the projection equals the last accepted doc', async () => {
    const fetchMock = vi.fn(() => jsonResponse({ revision: 1 }));
    global.fetch = fetchMock;
    const store = createOmsApiStore({ baseUrl: '/api', cache: createMemoryEnvelopeCache() });
    await store.save(withUi);
    await store.save({ ...P, ui: { screen: 'team' } }); // same projection, different ui
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('coalesces overlapping saves into sequential base revisions', async () => {
    let resolveFirst;
    const calls = [];
    global.fetch = vi.fn((url, opts) => {
      calls.push(JSON.parse(opts.body).base_revision);
      if (calls.length === 1) return new Promise((r) => { resolveFirst = () => r({ ok: true, status: 200, json: () => Promise.resolve({ revision: 1 }) }); });
      return jsonResponse({ revision: 2 });
    });
    const store = createOmsApiStore({ baseUrl: '/api', cache: createMemoryEnvelopeCache() });
    const a = store.save({ ...P, employees: [{ id: 'a' }] });
    const b = store.save({ ...P, employees: [{ id: 'b' }] });
    resolveFirst();
    await Promise.all([a, b]);
    expect(calls).toEqual([0, 1]); // second write used the advanced base, never 0 twice
  });
  it('throws stale-write on 409 and requires reload before next save', async () => {
    global.fetch = vi.fn(() => jsonResponse({ error: 'stale-write', current_revision: 9 }, 409));
    const store = createOmsApiStore({ baseUrl: '/api', cache: createMemoryEnvelopeCache() });
    await expect(store.save({ ...P, employees: [{ id: 'x' }] }))
      .rejects.toMatchObject({ code: 'stale-write', currentRevision: 9 });
  });
  it('throws offline on network failure and does not advance', async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error('down')));
    const store = createOmsApiStore({ baseUrl: '/api', cache: createMemoryEnvelopeCache() });
    await expect(store.save({ ...P, employees: [{ id: 'x' }] })).rejects.toMatchObject({ code: 'offline' });
  });
});

describe('base url normalization', () => {
  it('does not double the /api segment', async () => {
    const fetchMock = vi.fn(() => jsonResponse({ doc: null, revision: 0, schema_version: null }));
    global.fetch = fetchMock;
    const store = createOmsApiStore({ baseUrl: '/api/', cache: createMemoryEnvelopeCache() });
    await store.load();
    expect(fetchMock.mock.calls[0][0]).toBe('/api/document');
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run src/state/omsApiStore.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/state/omsApiStore.js`:
```javascript
import { toPersistedOms } from './omsProjection.js';

const SCHEMA = 4;

function normalize(baseUrl) {
  return (baseUrl || '/api').replace(/\/+$/, '');
}

export function createOmsApiStore({ baseUrl, cache }) {
  const docUrl = `${normalize(baseUrl)}/document`;
  let revision = 0;
  let acceptedFingerprint = null;   // JSON of last accepted persisted doc
  let inFlight = null;              // Promise of the current PUT
  let queued = null;               // { doc, resolve, reject } — latest pending only

  async function load() {
    let resp;
    try {
      resp = await fetch(docUrl, { method: 'GET' });
    } catch {
      const env = await cache.loadEnvelope();
      if (env) { const e = new Error('offline'); e.code = 'offline-cache'; e.cachedDoc = env.doc; throw e; }
      const e = new Error('offline'); e.code = 'offline'; throw e;
    }
    const body = await resp.json();
    revision = body.revision;
    if (body.doc) {
      acceptedFingerprint = JSON.stringify(body.doc);
      await cache.saveEnvelope({ revision, doc: body.doc });
    }
    return body.doc;
  }

  async function put(persisted, base) {
    let resp;
    try {
      resp = await fetch(docUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doc: persisted, base_revision: base, schema_version: SCHEMA }),
      });
    } catch { const e = new Error('offline'); e.code = 'offline'; throw e; }
    if (resp.status === 409) {
      const body = await resp.json();
      const e = new Error('stale-write'); e.code = 'stale-write'; e.currentRevision = body.current_revision; throw e;
    }
    if (!resp.ok) { const e = new Error(`save failed ${resp.status}`); e.code = 'save-error'; throw e; }
    const body = await resp.json();
    revision = body.revision;
    acceptedFingerprint = JSON.stringify(persisted);
    await cache.saveEnvelope({ revision, doc: persisted });
    return revision;
  }

  function pump() {
    if (inFlight || !queued) return;
    const job = queued; queued = null;
    const persisted = toPersistedOms(job.doc);
    inFlight = put(persisted, revision)
      .then(() => { job.resolve(); })
      .catch((e) => { queued = null; job.reject(e); })
      .finally(() => { inFlight = null; pump(); });
  }

  async function save(doc) {
    const fingerprint = JSON.stringify(toPersistedOms(doc));
    if (fingerprint === acceptedFingerprint) return;           // equal-projection no-op
    return new Promise((resolve, reject) => {
      queued = { doc, resolve, reject };                       // single latest slot
      pump();
    });
  }

  async function clear() { await cache.clearEnvelope(); }

  return { load, save, clear };
}
```

- [ ] **Step 4: Run and watch it pass**

Run: `npx vitest run src/state/omsApiStore.test.js`
Expected: PASS (all cases, including coalescing `[0, 1]`).

- [ ] **Step 5: Commit**

```bash
git add src/state/omsApiStore.js src/state/omsApiStore.test.js
git commit -m "feat(oms): createOmsApiStore — internal revision, single-flight queue, offline"
```

---

