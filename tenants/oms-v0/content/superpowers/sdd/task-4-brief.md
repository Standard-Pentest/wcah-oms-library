### Task 4: Rotation cadence engine

**Files:**
- Create: `src/domain/rotations.js`
- Test: `src/domain/rotations.test.js`

**Interfaces:**
- Consumes: `weeksBetween` from `calendar.js`; `SEED_ROTATIONS` from `src/data/roster.js` (test only).
- Produces:
  - `rotationState(rotation, weekStart) → 'ON'|'OFF'`
  - `proposeToggles(rotations, weekStart) → Toggle[]` where `Toggle = {rotationId, staffId, day, role, state:'ON'|'OFF'}` — includes linked-effect rows. **Task 8 stores this exact output as the week's `toggleStates`; Tasks 6, 12, 17 consume the same `Toggle` shape.**

- [ ] **Step 1: Write the failing test**

`src/domain/rotations.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { proposeToggles, rotationState } from './rotations.js';
import { SEED_ROTATIONS } from '../data/roster.js';

const byKey = (t) => `${t.staffId}|${t.day}`;
const sorted = (list) => [...list].sort((a, b) => byKey(a).localeCompare(byKey(b)));

describe('cadence engine', () => {
  it('reproduces the workbook Week Setup toggles for Aug 2 exactly', () => {
    const got = sorted(proposeToggles(SEED_ROTATIONS, '2026-08-02')).map(
      (t) => `${t.staffId}|${t.day}|${t.role}|${t.state}`
    );
    expect(got).toEqual(
      [
        'alonzo-evelyn|Sat|VA|ON',
        'cuevas-minjarez-paulina|Sat|VA|OFF',
        'escalante-aidee|Tue|VA|ON',
        'hooper-camila|Sun|VA|ON',
        'mariscal-paulina|Sat|VA|ON',
        'mendez-jorge|Sun|VA|OFF',
        'mendez-jorge|Thu|VA|ON',
        'paz-vero|Fri|VA|ON',
        'paz-vero|Sun|VA|OFF',
        'ross-shana|Fri|VA|ON',
        'ross-shana|Sun|RVT|ON',
        'ross-shana|Wed|RVT|OFF',
        'russaw-jonelle|Mon|VA|OFF',
        'russaw-jonelle|Sat|VA|ON',
        'torres-damali|Sat|VA|OFF',
        'willis-bree|Sun|HSS|OFF',
      ].sort()
    );
  });
  it('cycles every-other and every-third cadences forward', () => {
    const bree = SEED_ROTATIONS.find((r) => r.id === 'willis-sun');
    expect(rotationState(bree, '2026-08-02')).toBe('OFF');
    expect(rotationState(bree, '2026-08-09')).toBe('ON');
    const vero = SEED_ROTATIONS.find((r) => r.id === 'paz-sun');
    expect(rotationState(vero, '2026-08-09')).toBe('ON');
    expect(rotationState(vero, '2026-08-16')).toBe('OFF');
  });
  it('applies linked effects for the state they match', () => {
    // Vero Sun ON week → Fri OFF (the README rule "when Sunday is ON her Friday is OFF")
    const rows = proposeToggles(SEED_ROTATIONS, '2026-08-09').filter((t) => t.staffId === 'paz-vero');
    expect(sorted(rows).map((t) => `${t.day}|${t.state}`)).toEqual(['Fri|OFF', 'Sun|ON']);
  });
  it('alternates Ross Wed/Fri across successive Sun-ON weeks', () => {
    const on1 = proposeToggles(SEED_ROTATIONS, '2026-08-02').filter((t) => t.staffId === 'ross-shana');
    const on2 = proposeToggles(SEED_ROTATIONS, '2026-08-16').filter((t) => t.staffId === 'ross-shana');
    const pick = (rows, day) => rows.find((t) => t.day === day).state;
    expect([pick(on1, 'Fri'), pick(on1, 'Wed')]).toEqual(['ON', 'OFF']);
    expect([pick(on2, 'Fri'), pick(on2, 'Wed')]).toEqual(['OFF', 'ON']);
  });
  it('turns Ross Wed and Fri fully on in Sun-OFF weeks', () => {
    const rows = proposeToggles(SEED_ROTATIONS, '2026-08-09').filter((t) => t.staffId === 'ross-shana');
    const pick = (day) => rows.find((t) => t.day === day);
    expect(pick('Sun').state).toBe('OFF');
    expect(pick('Wed')).toMatchObject({ state: 'ON', role: 'RVT' });
    expect(pick('Fri')).toMatchObject({ state: 'ON', role: 'RVT' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/domain/rotations.test.js`
Expected: FAIL — `Cannot find module './rotations.js'`.

- [ ] **Step 3: Implement**

`src/domain/rotations.js`:

```js
import { weeksBetween } from './calendar.js';

const PERIODS = { weekly: 1, everyOtherWeek: 2, everyThirdWeek: 3, monthly: 4 };

function mod(n, p) {
  return ((n % p) + p) % p;
}

/** @returns {'ON'|'OFF'} the base state of a rotation for the given week */
export function rotationState(rotation, weekStart) {
  const w = weeksBetween(rotation.anchor, weekStart);
  return mod(w, PERIODS[rotation.cadence]) === 0 ? 'ON' : 'OFF';
}

/** Zero-based count of completed cadence periods since the anchor. */
function cycleIndex(rotation, weekStart) {
  return Math.floor(weeksBetween(rotation.anchor, weekStart) / PERIODS[rotation.cadence]);
}

/**
 * Expand rotations (with linked effects) into this week's proposed toggles.
 * @returns {Array<{rotationId:string, staffId:string, day:string, role:string, state:'ON'|'OFF'}>}
 */
export function proposeToggles(rotations, weekStart) {
  const out = [];
  for (const r of rotations) {
    const state = rotationState(r, weekStart);
    out.push({ rotationId: r.id, staffId: r.staffId, day: r.day, role: r.roleWhenOn, state });
    for (const fx of r.linked ?? []) {
      if (fx.when !== state) continue;
      if (fx.pickOneAlternating) {
        const k = mod(cycleIndex(r, weekStart), fx.pickOneAlternating.length);
        fx.pickOneAlternating.forEach((opt, i) => {
          out.push({
            rotationId: r.id, staffId: r.staffId, day: opt.day, role: opt.role,
            state: i === k ? 'ON' : 'OFF',
          });
        });
      } else {
        out.push({
          rotationId: r.id, staffId: r.staffId, day: fx.day,
          role: fx.role ?? r.roleWhenOn, state: fx.state,
        });
      }
    }
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/domain/rotations.test.js`
Expected: PASS — 5 tests. (If the Aug 2 parity case fails, the bug is in anchors or the engine — the expected list is the workbook's Week Setup sheet and must not change.)

- [ ] **Step 5: Commit**

```bash
git add src/domain/rotations.js src/domain/rotations.test.js
git commit -m "feat(domain): rotation cadence engine with linked effects"
```

---

