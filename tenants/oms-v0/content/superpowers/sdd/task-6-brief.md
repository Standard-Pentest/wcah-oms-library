### Task 6: buildWeek pipeline

**Files:**
- Create: `src/domain/build.js`
- Test: `src/domain/build.test.js`

**Interfaces:**
- Consumes: `shift`, `off` from `cells.js`; `dayForDate` from `calendar.js`; `classifyRequest`, `requestDates`, `isApplied` from `timeoff.js`; `Toggle` shape from Task 4.
- Produces: `buildWeek({roster, week, requests}) → {weekStart, cells}` where `cells` is `{[staffId]: {[day]: Cell}}` (every roster id present, possibly `{}`), and `week` is `{startDate, dvmCounts, toggleStates: Toggle[], overrides: {[staffId]: {[day]: 'OFF' | {role, timeNote?, hours?, label?}}}}`. Expansion order is fixed: **patterns → toggles → time off → overrides.** Tasks 7–12 and all UI consume this shape.

- [ ] **Step 1: Write the failing test**

`src/domain/build.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { buildWeek } from './build.js';
import { shift } from './cells.js';

const roster = [
  { id: 'a', role: 'VA', standardHours: 40, pattern: { Mon: shift('VA'), Fri: shift('VA') }, constraints: {} },
  { id: 'b', role: 'RVT', standardHours: 40, pattern: { Tue: shift('RVT') }, constraints: {} },
];
const week = (patch = {}) => ({
  startDate: '2026-08-02',
  dvmCounts: { Sun: 2, Mon: 5, Tue: 4, Wed: 4, Thu: 4, Fri: 4, Sat: 2 },
  toggleStates: [], overrides: {},
  ...patch,
});

describe('buildWeek', () => {
  it('expands default patterns without mutating them', () => {
    const r = structuredClone(roster);
    const { cells } = buildWeek({ roster: r, week: week(), requests: [] });
    expect(cells.a.Mon).toMatchObject({ role: 'VA' });
    expect(cells.a.Tue).toBeUndefined();
    cells.a.Mon.earlyLeave = true;
    expect(r[0].pattern.Mon.earlyLeave).toBeUndefined(); // clone, not alias
  });
  it('applies toggles: ON adds a shift, OFF removes a pattern day', () => {
    const { cells } = buildWeek({
      roster, requests: [],
      week: week({ toggleStates: [
        { staffId: 'a', day: 'Sat', role: 'VA', state: 'ON' },
        { staffId: 'a', day: 'Fri', role: 'VA', state: 'OFF' },
      ] }),
    });
    expect(cells.a.Sat).toMatchObject({ role: 'VA' });
    expect(cells.a.Fri).toBeUndefined();
  });
  it('stamps PAID and UNPAID time off even on non-working days', () => {
    const { cells } = buildWeek({
      roster, week: week(),
      requests: [
        { staffId: 'a', status: 'Approved', decision: null, startDate: '2026-08-03', hours: 10, days: 1, submittedAt: 'x' },
        { staffId: 'a', status: 'Approved', decision: null, startDate: '2026-08-05', hours: 0, days: 1, submittedAt: 'x' },
      ],
    });
    expect(cells.a.Mon).toEqual({ kind: 'off', reason: 'PTO' });
    expect(cells.a.Wed).toEqual({ kind: 'off', reason: 'UNPAID OFF' }); // Wed is not a pattern day
  });
  it('annotates PARTIAL as early leave, reducing hours, only on working days', () => {
    const { cells } = buildWeek({
      roster, week: week(),
      requests: [
        { staffId: 'a', status: 'Approved', decision: null, startDate: '2026-08-03', hours: 2, days: 1, submittedAt: 'x' },
        { staffId: 'b', status: 'Approved', decision: null, startDate: '2026-08-03', hours: 2, days: 1, submittedAt: 'x' },
      ],
    });
    expect(cells.a.Mon).toMatchObject({ role: 'VA', earlyLeave: true, hours: 8 });
    expect(cells.b.Mon).toBeUndefined(); // b does not work Monday
  });
  it('ignores pending-undecided, denied, and out-of-week requests', () => {
    const { cells } = buildWeek({
      roster, week: week(),
      requests: [
        { staffId: 'a', status: 'Pending', decision: null, startDate: '2026-08-03', hours: 10, days: 1, submittedAt: 'x' },
        { staffId: 'a', status: 'Pending', decision: 'denied', startDate: '2026-08-07', hours: 10, days: 1, submittedAt: 'x' },
        { staffId: 'a', status: 'Approved', decision: null, startDate: '2026-08-10', hours: 10, days: 1, submittedAt: 'x' },
      ],
    });
    expect(cells.a.Mon).toMatchObject({ role: 'VA' });
    expect(cells.a.Fri).toMatchObject({ role: 'VA' });
  });
  it('applies overrides last: OFF removes, specs replace (even over time off)', () => {
    const { cells } = buildWeek({
      roster,
      week: week({ overrides: {
        a: { Mon: 'OFF', Wed: { role: 'ADMIN' } },
        b: { Tue: { role: 'VA', label: 'VA (until 5 PM)', hours: 9.5 } },
      } }),
      requests: [{ staffId: 'b', status: 'Approved', decision: null, startDate: '2026-08-04', hours: 1, days: 1, submittedAt: 'x' }],
    });
    expect(cells.a.Mon).toBeUndefined();
    expect(cells.a.Wed).toMatchObject({ role: 'ADMIN' });
    expect(cells.b.Tue).toMatchObject({ label: 'VA (until 5 PM)', hours: 9.5 });
    expect(cells.b.Tue.earlyLeave).toBeUndefined(); // override wiped the partial annotation
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/domain/build.test.js`
Expected: FAIL — `Cannot find module './build.js'`.

- [ ] **Step 3: Implement**

`src/domain/build.js`:

```js
import { shift, off } from './cells.js';
import { dayForDate } from './calendar.js';
import { classifyRequest, requestDates, isApplied } from './timeoff.js';

/**
 * Deterministic weekly expansion — the workbook's pipeline made explicit.
 * Order is fixed: patterns → toggles → time off → overrides.
 * @returns {{weekStart: string, cells: Object<string, Object<string, import('./cells.js').Cell>>}}
 */
export function buildWeek({ roster, week, requests }) {
  const cells = {};

  // 1. Default patterns (cloned — builds must never mutate the roster)
  for (const staff of roster) {
    cells[staff.id] = {};
    for (const [day, cell] of Object.entries(staff.pattern)) {
      cells[staff.id][day] = { ...cell };
    }
  }

  // 2. Rotation toggles
  for (const t of week.toggleStates ?? []) {
    if (!cells[t.staffId]) continue;
    if (t.state === 'ON') cells[t.staffId][t.day] = shift(t.role);
    else delete cells[t.staffId][t.day];
  }

  // 3. Time off (applied requests only)
  for (const req of requests ?? []) {
    if (!req.staffId || !isApplied(req) || !cells[req.staffId]) continue;
    const type = classifyRequest(req);
    for (const date of requestDates(req)) {
      const day = dayForDate(week.startDate, date);
      if (!day) continue;
      const existing = cells[req.staffId][day];
      if (type === 'UNPAID') cells[req.staffId][day] = off('UNPAID OFF');
      else if (type === 'PAID') cells[req.staffId][day] = off('PTO');
      else if (existing && existing.kind === 'shift') {
        cells[req.staffId][day] = {
          ...existing, earlyLeave: true,
          hours: Math.max(0, existing.hours - req.hours),
        };
      }
    }
  }

  // 4. Overrides win over everything
  for (const [staffId, days] of Object.entries(week.overrides ?? {})) {
    if (!cells[staffId]) continue;
    for (const [day, value] of Object.entries(days)) {
      if (value === 'OFF') delete cells[staffId][day];
      else {
        const { role, ...opts } = value;
        cells[staffId][day] = shift(role, opts);
      }
    }
  }

  return { weekStart: week.startDate, cells };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/domain/build.test.js`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/domain/build.js src/domain/build.test.js
git commit -m "feat(domain): buildWeek pipeline (patterns, toggles, time off, overrides)"
```

---

