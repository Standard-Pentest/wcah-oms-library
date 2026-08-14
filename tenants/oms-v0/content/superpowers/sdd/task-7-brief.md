### Task 7: Coverage targets and coverage check

**Files:**
- Create: `src/domain/targets.js`, `src/domain/coverage.js`
- Test: `src/domain/targets.test.js`, `src/domain/coverage.test.js`

**Interfaces:**
- Consumes: `DAYS` from `calendar.js`; `COVERAGE_ROLES` from `cells.js`; built shape from Task 6.
- Produces:
  - `targetsForWeek(week) → {[day]: {VA, RVT, HSS, PHARM}}` — VA weekday `(2×DVMs)+2`, weekend `(2×DVMs)+1`; RVT weekday 3 / weekend 2; HSS 1, except Sun = 1 only when an HSS Sun toggle is ON; PHARM weekday 1 / weekend 0.
  - `coverageCheck(built, targets) → {days: {[day]: {roles: {VA:{scheduled,target,variance},…, ADMIN:{scheduled}}, short, over, status}}}` — status strings exactly `'ON TARGET'`, `'SHORT n'`, `'OVER +n'`. MONITOR counts toward VA; PB and TECH_NC are never counted; ADMIN reported informationally.

- [ ] **Step 1: Write the failing tests**

`src/domain/targets.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { targetsForWeek } from './targets.js';

const week = (toggleStates = []) => ({
  startDate: '2026-08-02',
  dvmCounts: { Sun: 2, Mon: 5, Tue: 4, Wed: 4, Thu: 4, Fri: 4, Sat: 2 },
  toggleStates, overrides: {},
});

describe('coverage targets', () => {
  it('computes the README VA formula per day', () => {
    const t = targetsForWeek(week());
    expect(t.Mon.VA).toBe(12); // 5 DVMs
    expect(t.Tue.VA).toBe(10); // 4 DVMs
    expect(t.Sun.VA).toBe(5);  // weekend, 2 DVMs
    expect(t.Sat.VA).toBe(5);
  });
  it('holds RVT and PHARM steady regardless of DVM count', () => {
    const t = targetsForWeek(week());
    expect(t.Mon.RVT).toBe(3);
    expect(t.Sun.RVT).toBe(2);
    expect(t.Mon.PHARM).toBe(1);
    expect(t.Sat.PHARM).toBe(0);
  });
  it('requires Sunday HSS only when an HSS Sun rotation is ON', () => {
    expect(targetsForWeek(week()).Sun.HSS).toBe(0);
    const on = [{ staffId: 'willis-bree', day: 'Sun', role: 'HSS', state: 'ON' }];
    expect(targetsForWeek(week(on)).Sun.HSS).toBe(1);
    expect(targetsForWeek(week(on)).Wed.HSS).toBe(1);
  });
});
```

`src/domain/coverage.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { coverageCheck } from './coverage.js';
import { shift } from './cells.js';

const targets = { Sun: { VA: 2, RVT: 1, HSS: 0, PHARM: 0 } };
const emptyTargets = Object.fromEntries(
  ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => [d, { VA: 0, RVT: 0, HSS: 0, PHARM: 0 }])
);

function builtWith(cellsByStaff) {
  return { weekStart: '2026-08-02', cells: cellsByStaff };
}

describe('coverageCheck', () => {
  it('counts MONITOR as VA and excludes PB/TECH_NC/ADMIN from targets', () => {
    const built = builtWith({
      a: { Sun: shift('VA') },
      b: { Sun: shift('MONITOR') },
      c: { Sun: shift('PB') },
      d: { Sun: shift('TECH_NC') },
      e: { Sun: shift('ADMIN') },
      f: { Sun: shift('RVT', { earlyLeave: true }) }, // early leave still works, still counts
    });
    const r = coverageCheck(built, { ...emptyTargets, ...targets }).days.Sun;
    expect(r.roles.VA).toEqual({ scheduled: 2, target: 2, variance: 0 });
    expect(r.roles.RVT.scheduled).toBe(1);
    expect(r.roles.ADMIN).toEqual({ scheduled: 1 });
    expect(r.status).toBe('ON TARGET');
  });
  it('reports SHORT and OVER day statuses', () => {
    const short = coverageCheck(builtWith({}), { ...emptyTargets, ...targets }).days.Sun;
    expect(short.roles.VA.variance).toBe(-2);
    expect(short.status).toBe('SHORT 3'); // 2 VA + 1 RVT missing
    const over = coverageCheck(
      builtWith({ a: { Sun: shift('VA') }, b: { Sun: shift('VA') }, c: { Sun: shift('VA') }, d: { Sun: shift('RVT') } }),
      { ...emptyTargets, ...targets }
    ).days.Sun;
    expect(over.status).toBe('OVER +1');
  });
  it('does not count off cells', () => {
    const built = builtWith({ a: { Sun: { kind: 'off', reason: 'PTO' } } });
    expect(coverageCheck(built, { ...emptyTargets, ...targets }).days.Sun.roles.VA.scheduled).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/domain/targets.test.js src/domain/coverage.test.js`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`src/domain/targets.js`:

```js
import { DAYS } from './calendar.js';

const WEEKEND = new Set(['Sun', 'Sat']);

/**
 * Per-day per-role coverage targets — the README formulas:
 * VA weekday (2×DVMs)+2 (monitor + floater), weekend (2×DVMs)+1.
 * RVT weekday 3 (1 surgery + 2 dental), weekend 2. PHARM weekday only.
 * Sunday HSS exists only on weeks with an ON Sunday HSS rotation.
 */
export function targetsForWeek(week) {
  const hssSunOn = (week.toggleStates ?? []).some(
    (t) => t.day === 'Sun' && t.role === 'HSS' && t.state === 'ON'
  );
  const targets = {};
  for (const day of DAYS) {
    const dvm = week.dvmCounts?.[day] ?? 0;
    const weekend = WEEKEND.has(day);
    targets[day] = {
      VA: 2 * dvm + (weekend ? 1 : 2),
      RVT: weekend ? 2 : 3,
      HSS: day === 'Sun' ? (hssSunOn ? 1 : 0) : 1,
      PHARM: weekend ? 0 : 1,
    };
  }
  return targets;
}
```

`src/domain/coverage.js`:

```js
import { DAYS } from './calendar.js';
import { COVERAGE_ROLES } from './cells.js';

/** Which coverage bucket a scheduled role fills (null = shown, never counted). */
function bucketFor(role) {
  if (role === 'MONITOR') return 'VA';
  if (COVERAGE_ROLES.includes(role)) return role;
  if (role === 'ADMIN') return 'ADMIN';
  return null; // PB, TECH_NC
}

/**
 * The workbook's Coverage Check sheet, live.
 * @returns {{days: Object<string, {roles: object, short: number, over: number, status: string}>}}
 */
export function coverageCheck(built, targets) {
  const days = {};
  for (const day of DAYS) {
    const counts = { VA: 0, RVT: 0, HSS: 0, PHARM: 0, ADMIN: 0 };
    for (const staffCells of Object.values(built.cells)) {
      const cell = staffCells[day];
      if (!cell || cell.kind !== 'shift') continue;
      const bucket = bucketFor(cell.role);
      if (bucket) counts[bucket] += 1;
    }
    const roles = {};
    let short = 0;
    let over = 0;
    for (const role of COVERAGE_ROLES) {
      const target = targets[day][role];
      const scheduled = counts[role];
      const variance = scheduled - target;
      if (variance < 0) short -= variance;
      else over += variance;
      roles[role] = { scheduled, target, variance };
    }
    roles.ADMIN = { scheduled: counts.ADMIN };
    const status = short > 0 ? `SHORT ${short}` : over > 0 ? `OVER +${over}` : 'ON TARGET';
    days[day] = { roles, short, over, status };
  }
  return { days };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/domain/targets.test.js src/domain/coverage.test.js`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/domain/targets.js src/domain/coverage.js src/domain/targets.test.js src/domain/coverage.test.js
git commit -m "feat(domain): coverage targets and live coverage check"
```

---

