### Task 11: Month metrics

**Files:**
- Create: `src/domain/metrics.js`
- Test: `src/domain/metrics.test.js`

**Interfaces:**
- Consumes: built shape (Task 6).
- Produces:
  - `gini(values) → 0..1` (0 = perfectly even; 0 for empty or all-zero input)
  - `weekendEquity(builtWeeks, roster) → {byStaff: {[staffId]: count}, gini}` — Sat+Sun shift cells pooled across the horizon (pooled, not averaged — spec), over staff who work at all in the horizon
  - `hoursReport(builtWeeks, roster) → [{staffId, displayName, weekHours: number[], total, standard, delta}]` with `standard = standardHours × weeks` (skips standardHours 0 staff)

- [ ] **Step 1: Write the failing test**

`src/domain/metrics.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { gini, weekendEquity, hoursReport } from './metrics.js';
import { shift } from './cells.js';

const builtWith = (cells) => ({ weekStart: '2026-08-02', cells });
const staff = (id, standardHours = 40) => ({ id, displayName: id, role: 'VA', standardHours, pattern: {}, constraints: {} });

describe('month metrics', () => {
  it('computes gini: even → 0, concentrated → high, degenerate → 0', () => {
    expect(gini([2, 2, 2, 2])).toBe(0);
    expect(gini([4, 0, 0, 0])).toBeCloseTo(0.75);
    expect(gini([])).toBe(0);
    expect(gini([0, 0])).toBe(0);
  });
  it('pools weekend shifts across the horizon', () => {
    const w1 = builtWith({ a: { Sat: shift('VA'), Mon: shift('VA') }, b: { Mon: shift('VA') } });
    const w2 = builtWith({ a: { Sun: shift('VA') }, b: { Tue: shift('VA') } });
    const eq = weekendEquity([w1, w2], [staff('a'), staff('b'), staff('idle')]);
    expect(eq.byStaff).toEqual({ a: 2, b: 0 }); // idle never works → not in the pool
    expect(eq.gini).toBeCloseTo(0.5);
  });
  it('reports hours vs standard across weeks', () => {
    const w1 = builtWith({ a: { Mon: shift('VA'), Tue: shift('VA') } }); // 20h
    const w2 = builtWith({ a: { Mon: shift('VA') } });                   // 10h
    const [row] = hoursReport([w1, w2], [staff('a'), staff('zero', 0)]);
    expect(row).toMatchObject({ staffId: 'a', weekHours: [20, 10], total: 30, standard: 80, delta: -50 });
    expect(hoursReport([w1, w2], [staff('zero', 0)])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/domain/metrics.test.js`
Expected: FAIL — `Cannot find module './metrics.js'`.

- [ ] **Step 3: Implement**

`src/domain/metrics.js`:

```js
import { DAYS } from './calendar.js';

const WEEKEND = ['Sun', 'Sat'];

/** Gini coefficient — 0 is perfectly even. Max−min saturates on real rosters; gini does not. */
export function gini(values) {
  const n = values.length;
  const sum = values.reduce((a, b) => a + b, 0);
  if (n === 0 || sum === 0) return 0;
  let diff = 0;
  for (const a of values) for (const b of values) diff += Math.abs(a - b);
  return diff / (2 * n * sum);
}

function weekHours(cells) {
  return DAYS.reduce((h, d) => h + (cells?.[d]?.kind === 'shift' ? cells[d].hours : 0), 0);
}

/** Weekend load pooled across the horizon, over staff who work at all in it. */
export function weekendEquity(builtWeeks, roster) {
  const byStaff = {};
  for (const s of roster) {
    const worksAtAll = builtWeeks.some((w) =>
      DAYS.some((d) => w.cells[s.id]?.[d]?.kind === 'shift')
    );
    if (!worksAtAll) continue;
    byStaff[s.id] = builtWeeks.reduce(
      (n, w) => n + WEEKEND.filter((d) => w.cells[s.id]?.[d]?.kind === 'shift').length,
      0
    );
  }
  return { byStaff, gini: gini(Object.values(byStaff)) };
}

/** Scheduled hours vs standard, per person, across the horizon. */
export function hoursReport(builtWeeks, roster) {
  return roster
    .filter((s) => s.standardHours > 0)
    .map((s) => {
      const perWeek = builtWeeks.map((w) => weekHours(w.cells[s.id]));
      const total = perWeek.reduce((a, b) => a + b, 0);
      const standard = s.standardHours * builtWeeks.length;
      return { staffId: s.id, displayName: s.displayName, weekHours: perWeek, total, standard, delta: total - standard };
    });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/domain/metrics.test.js`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/domain/metrics.js src/domain/metrics.test.js
git commit -m "feat(domain): month metrics — weekend equity (gini) and hours vs standard"
```

---

