## Task 6: Frontend — authoritative projection (`toPersistedOms` / `hydrateOms`)

**Files:**
- Create: `src/state/omsProjection.js`
- Test: `src/state/omsProjection.test.js`

**Interfaces:**
- Produces: `toPersistedOms`, `hydrateOms`, `defaultUi` (see Module contracts).

- [ ] **Step 1: Write the failing test**

Create `src/state/omsProjection.test.js`:
```javascript
import { describe, expect, it } from 'vitest';
import { toPersistedOms, hydrateOms, defaultUi } from './omsProjection.js';

const doc = {
  version: 4,
  weekOrder: ['2026-08-02'],
  employees: [],
  ui: { screen: 'team', selectedWeek: '2026-08-02', aiOpen: true, selectedPtoId: 'x' },
};

describe('toPersistedOms', () => {
  it('removes ui entirely', () => {
    const p = toPersistedOms(doc);
    expect('ui' in p).toBe(false);
    expect(p.version).toBe(4);
    expect(p.employees).toEqual([]);
  });
  it('does not mutate the input', () => {
    toPersistedOms(doc);
    expect(doc.ui).toBeTruthy();
  });
});

describe('hydrateOms', () => {
  it('attaches provided local ui', () => {
    const p = toPersistedOms(doc);
    const ui = { screen: 'board', selectedWeek: '2026-08-02', aiOpen: false, selectedPtoId: null };
    expect(hydrateOms(p, ui).ui).toEqual(ui);
  });
  it('falls back to defaultUi derived from the persisted doc', () => {
    const p = toPersistedOms(doc);
    expect(hydrateOms(p).ui).toEqual(defaultUi(p));
    expect(defaultUi(p).selectedWeek).toBe('2026-08-02');
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run src/state/omsProjection.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/state/omsProjection.js`:
```javascript
/** The scheduling projection persisted server-side: the v4 document without
 * client UI chrome. `ui` never reaches Postgres or history (spec §6). */
export function toPersistedOms(doc) {
  const { ui, ...persisted } = doc;
  void ui;
  return persisted;
}

export function defaultUi(persisted) {
  return {
    screen: 'board',
    selectedWeek: persisted.weekOrder?.[0] ?? null,
    aiOpen: false,
    selectedPtoId: null,
  };
}

export function hydrateOms(persisted, localUi) {
  return { ...persisted, ui: localUi ?? defaultUi(persisted) };
}
```

- [ ] **Step 4: Run and watch it pass**

Run: `npx vitest run src/state/omsProjection.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/state/omsProjection.js src/state/omsProjection.test.js
git commit -m "feat(oms): authoritative projection toPersistedOms/hydrateOms"
```

---

