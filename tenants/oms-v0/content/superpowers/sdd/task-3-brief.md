### Task 3: Seed roster, rotations, pull order (real workbook data)

**Files:**
- Create: `src/data/roster.js`
- Test: `src/data/roster.test.js`

**Interfaces:**
- Consumes: `shift` from `src/domain/cells.js`.
- Produces:
  - `SEED_ROSTER` — array of 28 `StaffMember`: `{id, displayName, paylocityName, role, standardHours, pattern: {day: ShiftCell}, constraints: {fixedDays?, noDays?, maxDaysPerWeek?, consecutiveOffExempt?, forbiddenRoles?, emergencyOnly?, notes?}}`
  - `SEED_ROTATIONS` — array of `Rotation`: `{id, staffId, day, roleWhenOn, cadence: 'weekly'|'everyOtherWeek'|'everyThirdWeek'|'monthly', anchor, linked?: LinkedEffect[]}` where `LinkedEffect` is `{when:'ON'|'OFF', day, state:'ON'|'OFF', role?}` **or** `{when:'ON', pickOneAlternating: [{day, role}, …]}`
  - `PULL_ORDER` — array of 8 staff ids, RVT→VA pull sequence
  - `staffById(roster) → Map`

**This data is transcribed from the workbook's Roster + README sheets. It is ground truth.** Anchors are chosen so the cadence engine (Task 4) reproduces the workbook's Aug 2 Week Setup exactly; they are seed *guesses* for future weeks, which the manager confirms weekly by design.

- [ ] **Step 1: Write the failing test**

`src/data/roster.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { SEED_ROSTER, SEED_ROTATIONS, PULL_ORDER, staffById } from './roster.js';

describe('seed roster', () => {
  it('has the 28 real staff with correct role counts', () => {
    expect(SEED_ROSTER).toHaveLength(28);
    const count = (role) => SEED_ROSTER.filter((s) => s.role === role).length;
    expect(count('VA')).toBe(15);
    expect(count('RVT')).toBe(8);
    expect(count('HSS')).toBe(4);
    expect(count('PHARM')).toBe(1);
  });
  it('keeps the RVT→VA pull order from the README sheet', () => {
    expect(PULL_ORDER).toEqual([
      'gallegos-angie',
      'sharko-chloe',
      'quinonez-mariel',
      'gardner-theresa',
      'ross-shana',
      'prado-carla',
      'dimino-aaron',
      'tolden-teagan',
    ]);
  });
  it('references only real staff from rotations', () => {
    const byId = staffById(SEED_ROSTER);
    for (const r of SEED_ROTATIONS) {
      expect(byId.has(r.staffId), r.id).toBe(true);
      expect(['weekly', 'everyOtherWeek', 'everyThirdWeek', 'monthly']).toContain(r.cadence);
    }
    expect(SEED_ROTATIONS).toHaveLength(13);
  });
  it('carries workbook name mismatches for the fuzzy matcher', () => {
    const byId = staffById(SEED_ROSTER);
    expect(byId.get('gallegos-angie').paylocityName).toBe('Gallegos, Angela');
    expect(byId.get('paz-vero').paylocityName).toBe('Paz, Veronica');
    expect(byId.get('willis-bree').paylocityName).toBe('Willis, Breanne');
  });
  it('sets per-person standard hours', () => {
    const byId = staffById(SEED_ROSTER);
    expect(byId.get('corneau-lopez-michaela').standardHours).toBe(25.5);
    expect(byId.get('quinonez-mariel').standardHours).toBe(38);
    expect(byId.get('willis-bree').standardHours).toBe(0);
    expect(byId.get('alonzo-evelyn').standardHours).toBe(40);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/data`
Expected: FAIL — `Cannot find module './roster.js'`.

- [ ] **Step 3: Implement**

`src/data/roster.js` (complete transcription — every entry below comes from the workbook Roster sheet; notes quote its Notes/Constraints column):

```js
import { shift } from '../domain/cells.js';

/** RVT→VA pull order — README: "Angie → Chloe → Mariel → Theresa → Shana → Carla → Aaron → Teagan". */
export const PULL_ORDER = [
  'gallegos-angie',
  'sharko-chloe',
  'quinonez-mariel',
  'gardner-theresa',
  'ross-shana',
  'prado-carla',
  'dimino-aaron',
  'tolden-teagan',
];

const t830 = { timeNote: '7:30–4:30', hours: 8 };
const t9a = { timeNote: '9a', hours: 9.5 };

export const SEED_ROSTER = [
  {
    id: 'alonzo-evelyn', displayName: 'Alonzo, Evelyn', paylocityName: 'Alonzo, Evelyn',
    role: 'VA', standardHours: 40,
    pattern: { Tue: shift('VA'), Wed: shift('VA'), Thu: shift('VA') },
    constraints: { notes: 'Sat rotate' },
  },
  {
    id: 'alvarez-marvette', displayName: 'Alvarez, Marvette', paylocityName: 'Alvarez, Marvette',
    role: 'VA', standardHours: 40,
    pattern: { Sun: shift('VA'), Tue: shift('VA'), Thu: shift('VA'), Sat: shift('VA') },
    constraints: {
      fixedDays: ['Sun', 'Tue', 'Thu', 'Sat'], consecutiveOffExempt: true,
      notes: 'FIXED Sun/Tue/Thu/Sat — commute, rest day between shifts; exempt from consecutive-off rule',
    },
  },
  {
    id: 'burchnell-cayla', displayName: 'Burchnell, Cayla', paylocityName: 'Burchnell, Cayla',
    role: 'HSS', standardHours: 0,
    pattern: {},
    constraints: { emergencyOnly: true, notes: 'Emergency HSS backup ONLY (outside dept)' },
  },
  {
    id: 'corneau-lopez-michaela', displayName: 'Corneau Lopez, Michaela', paylocityName: 'Corneau Lopez, Michaela',
    role: 'VA', standardHours: 25.5,
    pattern: {
      Sun: shift('VA'), Mon: shift('VA'),
      Tue: shift('TECH_NC', { label: 'Tech NC · until 1:00 PM', hours: 5.5 }),
    },
    constraints: { maxDaysPerWeek: 3, notes: 'Part-time 3 days; Tue non-coverage tech role until 1:00 PM' },
  },
  {
    id: 'cuevas-minjarez-paulina', displayName: 'Cuevas Minjarez, Paulina C-M', paylocityName: 'Cuevas Minjarez, Paulina',
    role: 'VA', standardHours: 40,
    pattern: { Mon: shift('VA'), Wed: shift('VA'), Thu: shift('VA'), Fri: shift('VA') },
    constraints: { notes: 'Regular Mon; Sat rotate (drops a weekday when Sat is ON)' },
  },
  {
    id: 'dimino-aaron', displayName: 'Dimino, Aaron', paylocityName: 'Dimino, Aaron',
    role: 'RVT', standardHours: 40,
    pattern: { Wed: shift('ADMIN'), Thu: shift('RVT'), Fri: shift('RVT'), Sat: shift('RVT') },
    constraints: { notes: '1 ADMIN day/wk (coverage first); pull order #7' },
  },
  {
    id: 'escalante-aidee', displayName: 'Escalante, Aidee', paylocityName: 'Escalante, Aidee',
    role: 'VA', standardHours: 40,
    pattern: { Wed: shift('VA'), Thu: shift('VA'), Fri: shift('VA') },
    constraints: { notes: 'Tue rotate' },
  },
  {
    id: 'gallegos-angie', displayName: 'Gallegos, Angie', paylocityName: 'Gallegos, Angela',
    role: 'RVT', standardHours: 40,
    pattern: { Tue: shift('RVT'), Thu: shift('RVT'), Fri: shift('RVT'), Sat: shift('RVT') },
    constraints: { notes: 'Pull order #1 (first to VA)' },
  },
  {
    id: 'garcia-lorena', displayName: 'Garcia, Lorena', paylocityName: 'Garcia, Lorena V.',
    role: 'VA', standardHours: 40,
    pattern: { Mon: shift('VA'), Tue: shift('VA'), Wed: shift('VA'), Sat: shift('VA') },
    constraints: {},
  },
  {
    id: 'gardner-theresa', displayName: 'Gardner, Theresa', paylocityName: 'Gardner, Theresa',
    role: 'RVT', standardHours: 40,
    pattern: {
      Mon: shift('RVT', t830), Tue: shift('RVT', t830), Wed: shift('RVT', t830),
      Thu: shift('PB', { hours: 8 }), Fri: shift('RVT', t830),
    },
    constraints: { notes: '5x8s, off 4:30; PB every Thursday; pull #4' },
  },
  {
    id: 'hobbs-keith', displayName: 'Hobbs, Keith', paylocityName: 'Hobbs, Keith',
    role: 'VA', standardHours: 40,
    pattern: { Sun: shift('VA'), Mon: shift('VA'), Tue: shift('VA'), Fri: shift('VA') },
    constraints: {},
  },
  {
    id: 'hooper-camila', displayName: 'Hooper, Camila', paylocityName: 'Hooper, Camila',
    role: 'VA', standardHours: 40,
    pattern: { Mon: shift('VA'), Wed: shift('PHARM'), Thu: shift('VA'), Fri: shift('VA') },
    constraints: { notes: 'Pharmacy backup #1 (Wed default); Sun flex rotate' },
  },
  {
    id: 'lopez-jennifer', displayName: "Lopez, Jennifer 'Jlo'", paylocityName: 'Lopez, Jennifer',
    role: 'VA', standardHours: 40,
    pattern: { Tue: shift('VA'), Wed: shift('VA'), Thu: shift('VA'), Fri: shift('VA') },
    constraints: {},
  },
  {
    id: 'mariscal-paulina', displayName: 'Mariscal, Paulina M', paylocityName: 'Mariscal, Paulina',
    role: 'VA', standardHours: 40,
    pattern: { Mon: shift('VA'), Tue: shift('VA'), Wed: shift('VA'), Fri: shift('VA') },
    constraints: { noDays: ['Sun'], notes: 'NO Sundays; Sat rotate' },
  },
  {
    id: 'mendez-jorge', displayName: 'Mendez, Jorge', paylocityName: 'Mendez, Jorge',
    role: 'VA', standardHours: 40,
    pattern: { Mon: shift('VA'), Tue: shift('VA'), Wed: shift('VA') },
    constraints: { notes: 'Sun + Thu rotates' },
  },
  {
    id: 'nenneman-tyler', displayName: 'Nenneman, Tyler', paylocityName: 'Nenneman, Tyler',
    role: 'PHARM', standardHours: 40,
    pattern: { Mon: shift('PHARM'), Tue: shift('PHARM'), Thu: shift('PHARM'), Fri: shift('PHARM') },
    constraints: {},
  },
  {
    id: 'paz-vero', displayName: 'Paz, Vero', paylocityName: 'Paz, Veronica',
    role: 'VA', standardHours: 40,
    pattern: { Mon: shift('VA'), Tue: shift('VA'), Thu: shift('VA'), Fri: shift('VA') },
    constraints: { notes: 'Every 3rd Sun; Fri OFF when Sun ON' },
  },
  {
    id: 'pearl-leanne', displayName: 'Pearl, Leanne', paylocityName: 'Pearl, Leanne',
    role: 'HSS', standardHours: 40,
    pattern: { Wed: shift('HSS'), Thu: shift('HSS'), Fri: shift('HSS'), Sat: shift('HSS') },
    constraints: {},
  },
  {
    id: 'prado-carla', displayName: 'Prado, Carla', paylocityName: 'Prado, Carla',
    role: 'RVT', standardHours: 30,
    pattern: { Tue: shift('RVT'), Wed: shift('RVT'), Thu: shift('RVT') },
    constraints: { noDays: ['Sun', 'Mon', 'Fri', 'Sat'], notes: 'Tue–Thu only; pull #6' },
  },
  {
    id: 'quinonez-mariel', displayName: 'Quinonez, Mariel', paylocityName: 'Quinonez, Mariel A.',
    role: 'RVT', standardHours: 38,
    pattern: {
      Mon: shift('RVT', t9a), Tue: shift('RVT', t9a), Wed: shift('RVT', t9a),
      Thu: shift('ADMIN', t9a),
    },
    constraints: { notes: '9:00 AM starts; Thu ADMIN; pull #3' },
  },
  {
    id: 'rodriguez-glenda', displayName: 'Rodriguez, Glenda', paylocityName: 'Rodriguez, Glenda',
    role: 'VA', standardHours: 40,
    pattern: { Sun: shift('VA'), Mon: shift('VA'), Thu: shift('VA'), Fri: shift('VA') },
    constraints: {},
  },
  {
    id: 'ross-shana', displayName: 'Ross, Shana', paylocityName: 'Ross, Shana L.',
    role: 'RVT', standardHours: 40,
    pattern: { Mon: shift('RVT'), Tue: shift('PB') },
    constraints: { noDays: ['Sat'], notes: 'PB Tuesdays; NO Saturdays; Sun rotate with alternating Wed/Fri; pull #5' },
  },
  {
    id: 'russaw-jonelle', displayName: 'Russaw, Jonelle', paylocityName: 'Russaw, Jonelle',
    role: 'VA', standardHours: 40,
    pattern: { Tue: shift('VA'), Wed: shift('VA'), Thu: shift('VA') },
    constraints: { notes: 'Mon + Sat rotates' },
  },
  {
    id: 'sharko-chloe', displayName: 'Sharko, Chloe', paylocityName: 'Sharko, Chloe',
    role: 'RVT', standardHours: 40,
    pattern: { Sun: shift('RVT'), Mon: shift('VA'), Tue: shift('VA'), Fri: shift('MONITOR') },
    constraints: { notes: 'VA every Mon; dental MONITOR every Fri; pull #2' },
  },
  {
    id: 'timmons-michelle', displayName: 'Timmons, Michelle', paylocityName: 'Timmons, Michelle',
    role: 'HSS', standardHours: 30,
    pattern: { Mon: shift('HSS'), Tue: shift('HSS'), Wed: shift('ADMIN') },
    constraints: { notes: 'Mon/Tue HSS + standing Wed ADMIN' },
  },
  {
    id: 'tolden-teagan', displayName: 'Tolden, Teagan', paylocityName: 'Tolden, Teagan',
    role: 'RVT', standardHours: 40,
    pattern: { Mon: shift('RVT'), Tue: shift('RVT'), Wed: shift('RVT'), Thu: shift('RVT') },
    constraints: { forbiddenRoles: ['MONITOR'], notes: 'SURGERY or VA only — never dental; pull #8 (last)' },
  },
  {
    id: 'torres-damali', displayName: 'Torres, Damali', paylocityName: 'Torres, Damali',
    role: 'VA', standardHours: 40,
    pattern: { Mon: shift('VA'), Wed: shift('VA'), Thu: shift('VA'), Fri: shift('VA') },
    constraints: { notes: 'Pharmacy backup #2, HSS Role 3; Sat rotate 1x/month' },
  },
  {
    id: 'willis-bree', displayName: 'Willis, Bree', paylocityName: 'Willis, Breanne',
    role: 'HSS', standardHours: 0,
    pattern: {},
    constraints: { notes: 'Every other Sunday HSS ONLY' },
  },
];

/**
 * Rotation cadences. Anchors are the Sunday week-start of a known ON week,
 * chosen so `proposeToggles(SEED_ROTATIONS, '2026-08-02')` reproduces the
 * workbook's Week Setup for Aug 2 exactly. Future-week proposals are guesses
 * the manager confirms in Week Setup — that is the designed workflow.
 */
export const SEED_ROTATIONS = [
  { id: 'alonzo-sat', staffId: 'alonzo-evelyn', day: 'Sat', roleWhenOn: 'VA', cadence: 'everyOtherWeek', anchor: '2026-08-02' },
  {
    id: 'cuevas-sat', staffId: 'cuevas-minjarez-paulina', day: 'Sat', roleWhenOn: 'VA', cadence: 'everyOtherWeek', anchor: '2026-07-26',
    linked: [{ when: 'ON', day: 'Mon', state: 'OFF', role: 'VA' }],
  },
  { id: 'escalante-tue', staffId: 'escalante-aidee', day: 'Tue', roleWhenOn: 'VA', cadence: 'everyOtherWeek', anchor: '2026-08-02' },
  { id: 'hooper-sun', staffId: 'hooper-camila', day: 'Sun', roleWhenOn: 'VA', cadence: 'everyOtherWeek', anchor: '2026-08-02' },
  { id: 'mariscal-sat', staffId: 'mariscal-paulina', day: 'Sat', roleWhenOn: 'VA', cadence: 'everyOtherWeek', anchor: '2026-08-02' },
  { id: 'mendez-sun', staffId: 'mendez-jorge', day: 'Sun', roleWhenOn: 'VA', cadence: 'everyOtherWeek', anchor: '2026-07-26' },
  { id: 'mendez-thu', staffId: 'mendez-jorge', day: 'Thu', roleWhenOn: 'VA', cadence: 'everyOtherWeek', anchor: '2026-08-02' },
  {
    id: 'paz-sun', staffId: 'paz-vero', day: 'Sun', roleWhenOn: 'VA', cadence: 'everyThirdWeek', anchor: '2026-07-19',
    linked: [
      { when: 'ON', day: 'Fri', state: 'OFF', role: 'VA' },
      { when: 'OFF', day: 'Fri', state: 'ON', role: 'VA' },
    ],
  },
  {
    id: 'ross-sun', staffId: 'ross-shana', day: 'Sun', roleWhenOn: 'RVT', cadence: 'everyOtherWeek', anchor: '2026-08-02',
    linked: [
      { when: 'ON', pickOneAlternating: [{ day: 'Fri', role: 'VA' }, { day: 'Wed', role: 'RVT' }] },
      { when: 'OFF', day: 'Wed', state: 'ON', role: 'RVT' },
      { when: 'OFF', day: 'Fri', state: 'ON', role: 'RVT' },
    ],
  },
  { id: 'russaw-mon', staffId: 'russaw-jonelle', day: 'Mon', roleWhenOn: 'VA', cadence: 'everyOtherWeek', anchor: '2026-07-26' },
  { id: 'russaw-sat', staffId: 'russaw-jonelle', day: 'Sat', roleWhenOn: 'VA', cadence: 'everyOtherWeek', anchor: '2026-08-02' },
  { id: 'torres-sat', staffId: 'torres-damali', day: 'Sat', roleWhenOn: 'VA', cadence: 'monthly', anchor: '2026-07-12' },
  { id: 'willis-sun', staffId: 'willis-bree', day: 'Sun', roleWhenOn: 'HSS', cadence: 'everyOtherWeek', anchor: '2026-07-26' },
];

/** @returns {Map<string, object>} staff by id */
export function staffById(roster) {
  return new Map(roster.map((s) => [s.id, s]));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/data`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/data
git commit -m "feat(data): real WCAH roster, rotations, and pull order from the workbook"
```

---

