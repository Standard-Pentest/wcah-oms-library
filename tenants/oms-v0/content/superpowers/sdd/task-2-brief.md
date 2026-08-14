### Task 2: Calendar and cell primitives

**Files:**
- Create: `src/domain/calendar.js`, `src/domain/cells.js`
- Test: `src/domain/calendar.test.js`, `src/domain/cells.test.js`

**Interfaces:**
- Produces:
  - `DAYS` = `['Sun','Mon','Tue','Wed','Thu','Fri','Sat']`
  - `addDays(iso, n) → iso`, `dateForDay(weekStart, day) → iso`, `dayForDate(weekStart, iso) → day|null`, `weeksBetween(aIso, bIso) → int`, `fmtShort(iso) → 'Aug 2'`
  - `shift(role, opts?) → ShiftCell` where ShiftCell = `{kind:'shift', role, hours, timeNote?, label?, earlyLeave?}` (hours default 10)
  - `off(reason) → {kind:'off', reason}` with reason `'PTO'` or `'UNPAID OFF'`
  - `formatCell(cell|undefined) → string` producing the workbook's exact labels
  - `COVERAGE_ROLES = ['VA','RVT','HSS','PHARM']`, `ALL_ROLES = [...COVERAGE_ROLES,'MONITOR','ADMIN','PB','TECH_NC']`

- [ ] **Step 1: Write the failing tests**

`src/domain/calendar.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { DAYS, addDays, dateForDay, dayForDate, weeksBetween, fmtShort } from './calendar.js';

describe('calendar', () => {
  it('orders days Sun-first', () => {
    expect(DAYS).toEqual(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
  });
  it('adds days across month boundaries', () => {
    expect(addDays('2026-08-02', 6)).toBe('2026-08-08');
    expect(addDays('2026-07-30', 3)).toBe('2026-08-02');
    expect(addDays('2026-08-02', -7)).toBe('2026-07-26');
  });
  it('maps week/day to dates and back', () => {
    expect(dateForDay('2026-08-02', 'Thu')).toBe('2026-08-06');
    expect(dayForDate('2026-08-02', '2026-08-06')).toBe('Thu');
    expect(dayForDate('2026-08-02', '2026-08-09')).toBeNull();
  });
  it('counts whole weeks, negative-safe', () => {
    expect(weeksBetween('2026-07-19', '2026-08-02')).toBe(2);
    expect(weeksBetween('2026-08-02', '2026-07-19')).toBe(-2);
  });
  it('formats short dates', () => {
    expect(fmtShort('2026-08-02')).toBe('Aug 2');
  });
});
```

`src/domain/cells.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { shift, off, formatCell, COVERAGE_ROLES } from './cells.js';

describe('cells', () => {
  it('formats plain and time-noted shifts like the workbook', () => {
    expect(formatCell(shift('VA'))).toBe('VA');
    expect(formatCell(shift('RVT', { timeNote: '7:30–4:30', hours: 8 }))).toBe('RVT (7:30–4:30)');
    expect(formatCell(shift('RVT', { timeNote: '9a', hours: 9.5 }))).toBe('RVT (9a)');
    expect(formatCell(shift('VA', { timeNote: 'until 5 PM', hours: 9.5 }))).toBe('VA (until 5 PM)');
  });
  it('prefers explicit labels and appends early-leave', () => {
    expect(formatCell(shift('TECH_NC', { label: 'Tech NC · until 1:00 PM', hours: 5.5 }))).toBe(
      'Tech NC · until 1:00 PM'
    );
    expect(formatCell(shift('VA', { earlyLeave: true }))).toBe('VA · EARLY LEAVE');
  });
  it('formats off cells and empties', () => {
    expect(formatCell(off('PTO'))).toBe('PTO');
    expect(formatCell(off('UNPAID OFF'))).toBe('UNPAID OFF');
    expect(formatCell(undefined)).toBe('');
  });
  it('defaults shift hours to 10', () => {
    expect(shift('VA').hours).toBe(10);
    expect(COVERAGE_ROLES).toEqual(['VA', 'RVT', 'HSS', 'PHARM']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/domain`
Expected: FAIL — `Cannot find module './calendar.js'` (and `./cells.js`).

- [ ] **Step 3: Implement**

`src/domain/calendar.js`:

```js
/** Day keys, Sunday-first — the workbook's column order. */
export const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const MS_DAY = 86400000;

function toUtc(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function toIso(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

/** @param {string} iso @param {number} n @returns {string} */
export function addDays(iso, n) {
  return toIso(toUtc(iso) + n * MS_DAY);
}

/** @param {string} weekStart Sunday ISO date @param {string} day one of DAYS */
export function dateForDay(weekStart, day) {
  return addDays(weekStart, DAYS.indexOf(day));
}

/** @returns {string|null} the day key if the date falls in the week, else null */
export function dayForDate(weekStart, iso) {
  const diff = Math.round((toUtc(iso) - toUtc(weekStart)) / MS_DAY);
  return diff >= 0 && diff < 7 ? DAYS[diff] : null;
}

/** Whole weeks from a to b (negative when b precedes a). */
export function weeksBetween(aIso, bIso) {
  return Math.round((toUtc(bIso) - toUtc(aIso)) / (7 * MS_DAY));
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** @returns {string} e.g. 'Aug 2' */
export function fmtShort(iso) {
  const [, m, d] = iso.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}
```

`src/domain/cells.js`:

```js
/**
 * @typedef {Object} ShiftCell
 * @property {'shift'} kind
 * @property {string} role       VA|RVT|HSS|PHARM|MONITOR|ADMIN|PB|TECH_NC
 * @property {number} hours
 * @property {string} [timeNote] e.g. '7:30–4:30', '9a', 'until 5 PM'
 * @property {string} [label]    exact display override (workbook oddities)
 * @property {boolean} [earlyLeave]
 *
 * @typedef {Object} OffCell
 * @property {'off'} kind
 * @property {'PTO'|'UNPAID OFF'} reason
 *
 * @typedef {ShiftCell|OffCell} Cell
 */

export const COVERAGE_ROLES = ['VA', 'RVT', 'HSS', 'PHARM'];
export const ALL_ROLES = [...COVERAGE_ROLES, 'MONITOR', 'ADMIN', 'PB', 'TECH_NC'];

/** @param {string} role @param {Partial<ShiftCell>} [opts] @returns {ShiftCell} */
export function shift(role, opts = {}) {
  return { kind: 'shift', role, hours: 10, ...opts };
}

/** @param {'PTO'|'UNPAID OFF'} reason @returns {OffCell} */
export function off(reason) {
  return { kind: 'off', reason };
}

/** Render a cell exactly as the workbook prints it. */
export function formatCell(cell) {
  if (!cell) return '';
  if (cell.kind === 'off') return cell.reason;
  const early = cell.earlyLeave ? ' · EARLY LEAVE' : '';
  if (cell.label) return cell.label + early;
  const note = cell.timeNote ? ` (${cell.timeNote})` : '';
  return cell.role + note + early;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/domain`
Expected: PASS — 2 files, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/domain
git commit -m "feat(domain): calendar math and workbook-exact cell formatting"
```

---

