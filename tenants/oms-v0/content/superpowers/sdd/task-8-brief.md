### Task 8: Excel-parity test (the centerpiece)

**Files:**
- Create: `src/data/week-aug02.js`, `src/data/expected-aug02.js`
- Test: `src/data/parity-aug02.test.js`

**Interfaces:**
- Consumes: everything from Tasks 3–7.
- Produces:
  - `WEEK_AUG02` — the workbook's Aug 2–8 week record (Task 12 seeds state with it)
  - `REQUESTS_AUG02` — the 9 roster-matched time-off requests (with fixture ids `req-1`…`req-9`)
  - `EXPECTED_GRID`, `EXPECTED_COVERAGE`, `EXPECTED_STATUS` — parity fixtures

**These fixtures are transcribed from the workbook's Week Setup, Time-Off Input, Overrides, Proposed Schedule, and Coverage Check sheets. If this test fails, the pipeline is wrong — never the fixtures.** (The workbook's Benitez row is excluded here: she is not on the roster; the parser test in Task 5 covers her as the unknown-employee case.)

- [ ] **Step 1: Write the fixtures**

`src/data/week-aug02.js`:

```js
import { proposeToggles } from '../domain/rotations.js';
import { SEED_ROTATIONS } from './roster.js';

/**
 * The real workbook week of Aug 2–8, 2026. Toggle states are the cadence
 * engine's own Aug 2 proposal — Task 4's parity test proves that equals the
 * workbook's Week Setup sheet.
 */
export const WEEK_AUG02 = {
  startDate: '2026-08-02',
  dvmCounts: { Sun: 2, Mon: 5, Tue: 4, Wed: 4, Thu: 4, Fri: 4, Sat: 2 },
  toggleStates: proposeToggles(SEED_ROTATIONS, '2026-08-02'),
  toggleConfirmed: true,
  status: 'draft',
  overrides: {
    'alonzo-evelyn': { Thu: 'OFF', Fri: { role: 'VA' } },
    'gallegos-angie': {
      Tue: { role: 'VA', label: 'VA (until 5 PM)', hours: 9.5 },
      Thu: { role: 'VA' },
    },
    'hooper-camila': { Fri: 'OFF' },
    'lopez-jennifer': { Mon: { role: 'VA' }, Tue: 'OFF' },
    'mariscal-paulina': { Fri: 'OFF' },
    'quinonez-mariel': { Wed: { role: 'VA', timeNote: '9a', hours: 9.5 } },
    'sharko-chloe': { Tue: 'OFF', Sat: { role: 'RVT' } },
  },
};

/** Time-Off Input sheet rows that match roster members (Apply=Y → decision granted). */
export const REQUESTS_AUG02 = [
  { id: 'req-1', submittedAt: '2026-04-11T20:02:00', employeeName: 'Gallegos, Angela', empNum: '138', status: 'Pending', startDate: '2026-08-08', hours: 10, days: 1, staffId: 'gallegos-angie', decision: 'granted' },
  { id: 'req-2', submittedAt: '2026-05-13T12:20:00', employeeName: 'Gallegos, Angela', empNum: '138', status: 'Approved', startDate: '2026-08-04', hours: 1, days: 1, staffId: 'gallegos-angie', decision: null },
  { id: 'req-3', submittedAt: '2026-05-14T12:37:00', employeeName: 'Escalante, Aidee', empNum: '115', status: 'Approved', startDate: '2026-08-04', hours: 2, days: 1, staffId: 'escalante-aidee', decision: null },
  { id: 'req-4', submittedAt: '2026-06-16T13:57:17', employeeName: 'Gardner, Theresa', empNum: '240', status: 'Approved', startDate: '2026-08-02', hours: 0, days: 1, staffId: 'gardner-theresa', decision: null },
  { id: 'req-5', submittedAt: '2026-06-16T13:57:17', employeeName: 'Gardner, Theresa', empNum: '240', status: 'Approved', startDate: '2026-08-03', hours: 0, days: 1, staffId: 'gardner-theresa', decision: null },
  { id: 'req-6', submittedAt: '2026-06-16T13:57:17', employeeName: 'Gardner, Theresa', empNum: '240', status: 'Approved', startDate: '2026-08-04', hours: 0, days: 1, staffId: 'gardner-theresa', decision: null },
  { id: 'req-7', submittedAt: '2026-06-19T08:36:00', employeeName: 'Pearl, Leanne', empNum: '113', status: 'Pending', startDate: '2026-08-08', hours: 10, days: 1, staffId: 'pearl-leanne', decision: null },
  { id: 'req-8', submittedAt: '2026-06-23T13:35:00', employeeName: 'Willis, Breanne', empNum: '150', status: 'Pending', startDate: '2026-08-04', hours: 10, days: 1, staffId: 'willis-bree', decision: 'granted' },
  { id: 'req-9', submittedAt: '2026-07-06T21:34:00', employeeName: 'Rodriguez, Glenda', empNum: '243', status: 'Pending', startDate: '2026-08-07', hours: 30, days: 3, staffId: 'rodriguez-glenda', decision: null },
];
```

`src/data/expected-aug02.js`:

```js
/**
 * Expected output — the workbook's Proposed Schedule sheet, cell for cell.
 * Days omitted from a row are expected to be empty.
 */
export const EXPECTED_GRID = {
  'alonzo-evelyn': { Tue: 'VA', Wed: 'VA', Fri: 'VA', Sat: 'VA' },
  'alvarez-marvette': { Sun: 'VA', Tue: 'VA', Thu: 'VA', Sat: 'VA' },
  'burchnell-cayla': {},
  'corneau-lopez-michaela': { Sun: 'VA', Mon: 'VA', Tue: 'Tech NC · until 1:00 PM' },
  'cuevas-minjarez-paulina': { Mon: 'VA', Wed: 'VA', Thu: 'VA', Fri: 'VA' },
  'dimino-aaron': { Wed: 'ADMIN', Thu: 'RVT', Fri: 'RVT', Sat: 'RVT' },
  'escalante-aidee': { Tue: 'VA · EARLY LEAVE', Wed: 'VA', Thu: 'VA', Fri: 'VA' },
  'gallegos-angie': { Tue: 'VA (until 5 PM)', Thu: 'VA', Fri: 'RVT', Sat: 'PTO' },
  'garcia-lorena': { Mon: 'VA', Tue: 'VA', Wed: 'VA', Sat: 'VA' },
  'gardner-theresa': {
    Sun: 'UNPAID OFF', Mon: 'UNPAID OFF', Tue: 'UNPAID OFF',
    Wed: 'RVT (7:30–4:30)', Thu: 'PB', Fri: 'RVT (7:30–4:30)',
  },
  'hobbs-keith': { Sun: 'VA', Mon: 'VA', Tue: 'VA', Fri: 'VA' },
  'hooper-camila': { Sun: 'VA', Mon: 'VA', Wed: 'PHARM', Thu: 'VA' },
  'lopez-jennifer': { Mon: 'VA', Wed: 'VA', Thu: 'VA', Fri: 'VA' },
  'mariscal-paulina': { Mon: 'VA', Tue: 'VA', Wed: 'VA', Sat: 'VA' },
  'mendez-jorge': { Mon: 'VA', Tue: 'VA', Wed: 'VA', Thu: 'VA' },
  'nenneman-tyler': { Mon: 'PHARM', Tue: 'PHARM', Thu: 'PHARM', Fri: 'PHARM' },
  'paz-vero': { Mon: 'VA', Tue: 'VA', Thu: 'VA', Fri: 'VA' },
  'pearl-leanne': { Wed: 'HSS', Thu: 'HSS', Fri: 'HSS', Sat: 'HSS' },
  'prado-carla': { Tue: 'RVT', Wed: 'RVT', Thu: 'RVT' },
  'quinonez-mariel': { Mon: 'RVT (9a)', Tue: 'RVT (9a)', Wed: 'VA (9a)', Thu: 'ADMIN (9a)' },
  'rodriguez-glenda': { Sun: 'VA', Mon: 'VA', Thu: 'VA', Fri: 'VA' },
  'ross-shana': { Sun: 'RVT', Mon: 'RVT', Tue: 'PB', Fri: 'VA' },
  'russaw-jonelle': { Tue: 'VA', Wed: 'VA', Thu: 'VA', Sat: 'VA' },
  'sharko-chloe': { Sun: 'RVT', Mon: 'VA', Fri: 'MONITOR', Sat: 'RVT' },
  'timmons-michelle': { Mon: 'HSS', Tue: 'HSS', Wed: 'ADMIN' },
  'tolden-teagan': { Mon: 'RVT', Tue: 'RVT', Wed: 'RVT', Thu: 'RVT' },
  'torres-damali': { Mon: 'VA', Wed: 'VA', Thu: 'VA', Fri: 'VA' },
  'willis-bree': { Tue: 'PTO' },
};

/** Coverage Check sheet, arrays in DAYS order (Sun…Sat). */
export const EXPECTED_COVERAGE = {
  VA: { scheduled: [5, 12, 10, 10, 11, 10, 5], target: [5, 12, 10, 10, 10, 10, 5] },
  RVT: { scheduled: [2, 3, 3, 3, 3, 3, 2], target: [2, 3, 3, 3, 3, 3, 2] },
  HSS: { scheduled: [0, 1, 1, 1, 1, 1, 1], target: [0, 1, 1, 1, 1, 1, 1] },
  PHARM: { scheduled: [0, 1, 1, 1, 1, 1, 0], target: [0, 1, 1, 1, 1, 1, 0] },
  ADMIN: { scheduled: [0, 0, 0, 2, 1, 0, 0] },
};

export const EXPECTED_STATUS = [
  'ON TARGET', 'ON TARGET', 'ON TARGET', 'ON TARGET', 'OVER +1', 'ON TARGET', 'ON TARGET',
];
```

- [ ] **Step 2: Write the failing parity test**

`src/data/parity-aug02.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { buildWeek } from '../domain/build.js';
import { coverageCheck } from '../domain/coverage.js';
import { targetsForWeek } from '../domain/targets.js';
import { formatCell } from '../domain/cells.js';
import { DAYS } from '../domain/calendar.js';
import { SEED_ROSTER } from './roster.js';
import { WEEK_AUG02, REQUESTS_AUG02 } from './week-aug02.js';
import { EXPECTED_GRID, EXPECTED_COVERAGE, EXPECTED_STATUS } from './expected-aug02.js';

describe('Excel parity — Aug 2–8, 2026 (the trust proof)', () => {
  const built = buildWeek({ roster: SEED_ROSTER, week: WEEK_AUG02, requests: REQUESTS_AUG02 });
  const report = coverageCheck(built, targetsForWeek(WEEK_AUG02));

  it('reproduces the Proposed Schedule sheet cell-for-cell', () => {
    const mismatches = [];
    for (const staff of SEED_ROSTER) {
      for (const day of DAYS) {
        const got = formatCell(built.cells[staff.id][day]);
        const want = EXPECTED_GRID[staff.id][day] ?? '';
        if (got !== want) mismatches.push(`${staff.id} ${day}: got "${got}", want "${want}"`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('reproduces the Coverage Check sheet', () => {
    for (const [role, { scheduled, target }] of Object.entries(EXPECTED_COVERAGE)) {
      DAYS.forEach((day, i) => {
        const r = report.days[day].roles[role];
        expect(r.scheduled, `${role} ${day} scheduled`).toBe(scheduled[i]);
        if (target) expect(r.target, `${role} ${day} target`).toBe(target[i]);
      });
    }
  });

  it("reproduces the day statuses including Thursday's OVER +1", () => {
    expect(DAYS.map((day) => report.days[day].status)).toEqual(EXPECTED_STATUS);
  });
});
```

- [ ] **Step 3: Run the parity test**

Run: `npx vitest run src/data/parity-aug02.test.js`
Expected: likely FAIL on first run with a short mismatch list. **Debug protocol:** every mismatch names staff, day, got, want. Trace that cell through the pipeline order (pattern → toggle → time off → override) against the workbook sheets. Fix `build.js`/`coverage.js`/`targets.js` or a Task 3 transcription slip (verify against the workbook before touching seed data). Do not edit `expected-aug02.js` — it is the workbook.

- [ ] **Step 4: Run the full suite**

Run: `npx vitest run`
Expected: PASS — all files green, including the three parity tests.

- [ ] **Step 5: Commit**

```bash
git add src/data
git commit -m "test(parity): engine reproduces the workbook's Aug 2-8 week exactly"
```

---

