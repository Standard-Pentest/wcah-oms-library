### Task 5: Time-off semantics and the Paylocity parser

**Files:**
- Create: `src/domain/timeoff.js`, `src/import/paylocity.js`
- Test: `src/domain/timeoff.test.js`, `src/import/paylocity.test.js`

**Interfaces:**
- Consumes: `addDays` from `calendar.js`; roster shape from Task 3.
- Produces:
  - `classifyRequest(req) → 'PAID'|'UNPAID'|'PARTIAL'` (hours 0 → UNPAID; hours/days < 8 → PARTIAL; else PAID)
  - `requestDates(req) → iso[]` (start date + `days` consecutive dates)
  - `isApplied(req) → boolean` (Approved, or Pending with `decision === 'granted'`)
  - `sortBySubmitted(reqs) → reqs` (first-submitted-wins ordering)
  - `parsePaylocityTimeOff(rawText, roster) → {records, issues}` — records are TimeOffRequest: `{submittedAt, employeeName, empNum, status, startDate, hours, days, staffId|null, decision:null}`; issues are `{line, kind:'bad-row'|'bad-date'|'unknown-employee', detail?, name?, suggestion?}`. **Exact-name matches (paylocityName or displayName) auto-assign `staffId`; anything fuzzier yields `staffId: null` plus a suggestion — never silent.**
  - Request ids are NOT generated here (domain purity); the reducer assigns them at dispatch (Task 12).

- [ ] **Step 1: Write the failing tests**

`src/domain/timeoff.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { classifyRequest, requestDates, isApplied, sortBySubmitted } from './timeoff.js';

describe('time-off semantics', () => {
  it('classifies the workbook cases', () => {
    expect(classifyRequest({ hours: 40, days: 4 })).toBe('PAID');   // Benitez
    expect(classifyRequest({ hours: 10, days: 1 })).toBe('PAID');   // Gallegos Sat
    expect(classifyRequest({ hours: 0, days: 1 })).toBe('UNPAID');  // Gardner
    expect(classifyRequest({ hours: 1, days: 1 })).toBe('PARTIAL'); // Gallegos early leave
    expect(classifyRequest({ hours: 2, days: 1 })).toBe('PARTIAL'); // Escalante early leave
  });
  it('expands consecutive request dates', () => {
    expect(requestDates({ startDate: '2026-08-04', days: 4 })).toEqual([
      '2026-08-04', '2026-08-05', '2026-08-06', '2026-08-07',
    ]);
  });
  it('applies Approved always, Pending only when granted', () => {
    expect(isApplied({ status: 'Approved', decision: null })).toBe(true);
    expect(isApplied({ status: 'Pending', decision: null })).toBe(false);
    expect(isApplied({ status: 'Pending', decision: 'granted' })).toBe(true);
    expect(isApplied({ status: 'Pending', decision: 'denied' })).toBe(false);
  });
  it('orders first-submitted first', () => {
    const out = sortBySubmitted([
      { submittedAt: '2026-06-19T08:36:00' },
      { submittedAt: '2026-03-10T13:43:00' },
    ]);
    expect(out[0].submittedAt).toBe('2026-03-10T13:43:00');
  });
});
```

`src/import/paylocity.test.js` (rows below are verbatim from the workbook's Time-Off Input sheet, tab-separated as Excel copies them):

```js
import { describe, it, expect } from 'vitest';
import { parsePaylocityTimeOff } from './paylocity.js';
import { SEED_ROSTER } from '../data/roster.js';

const T = '\t';
const row = (...cols) => cols.join(T);

describe('Paylocity time-off parser', () => {
  it('parses 12-hour and 24-hour submitted formats and maps exact names', () => {
    const text = [
      row('Submitted', 'Employee', 'Emp #', 'Status', 'Request Start', 'Hours', 'Days'),
      row('03/10/2026 01:43 PM', 'Benitez, Melinda', '102', 'Approved', '08/04/2026 08:00 AM', '40', '4'),
      row('06/16/2026 13:57:17', 'Gardner, Theresa', '240', 'Approved', '08/02/2026 08:00 AM', '0', '1'),
      row('04/11/2026 08:02 PM', 'Gallegos, Angela', '138', 'Pending', '08/08/2026 08:00 AM', '10', '1'),
    ].join('\n');
    const { records, issues } = parsePaylocityTimeOff(text, SEED_ROSTER);
    expect(records).toHaveLength(3);
    expect(records[0]).toMatchObject({
      submittedAt: '2026-03-10T13:43:00', startDate: '2026-08-04',
      hours: 40, days: 4, status: 'Approved', staffId: null,
    });
    expect(records[1]).toMatchObject({
      submittedAt: '2026-06-16T13:57:17', staffId: 'gardner-theresa', hours: 0,
    });
    expect(records[2]).toMatchObject({ staffId: 'gallegos-angie', status: 'Pending', decision: null });
    // Benitez is not on the roster — flagged, never silently attached
    expect(issues).toEqual([
      expect.objectContaining({ kind: 'unknown-employee', name: 'Benitez, Melinda', line: 2 }),
    ]);
  });
  it('suggests fuzzy matches without auto-assigning', () => {
    const text = row('05/13/2026 12:20 PM', 'Gallegos, Angie L.', '138', 'Approved', '08/04/2026 05:00 PM', '1', '1');
    const { records, issues } = parsePaylocityTimeOff(text, SEED_ROSTER);
    expect(records[0].staffId).toBeNull();
    expect(issues[0]).toMatchObject({ kind: 'unknown-employee', suggestion: 'gallegos-angie' });
  });
  it('reports malformed rows as issues, not exceptions', () => {
    const { records, issues } = parsePaylocityTimeOff('garbage line without tabs', SEED_ROSTER);
    expect(records).toHaveLength(0);
    expect(issues[0]).toMatchObject({ kind: 'bad-row', line: 1 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/domain/timeoff.test.js src/import`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`src/domain/timeoff.js`:

```js
import { addDays } from './calendar.js';

/**
 * @typedef {Object} TimeOffRequest
 * @property {string} submittedAt ISO datetime
 * @property {string} employeeName as exported
 * @property {string} empNum
 * @property {'Approved'|'Pending'} status
 * @property {string} startDate ISO date
 * @property {number} hours 0 = unpaid
 * @property {number} days
 * @property {string|null} staffId
 * @property {'granted'|'denied'|null} decision manager's call on Pending rows
 */

/** Hours 0 → UNPAID (makeup owed). Under 8h/day → PARTIAL (early leave, still works). */
export function classifyRequest(req) {
  if (req.hours === 0) return 'UNPAID';
  if (req.hours / req.days < 8) return 'PARTIAL';
  return 'PAID';
}

/** @returns {string[]} the consecutive dates the request covers */
export function requestDates(req) {
  return Array.from({ length: req.days }, (_, i) => addDays(req.startDate, i));
}

export function isApplied(req) {
  return req.status === 'Approved' || req.decision === 'granted';
}

/** First-submitted-wins ordering for competing requests. */
export function sortBySubmitted(reqs) {
  return [...reqs].sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
}
```

`src/import/paylocity.js`:

```js
/**
 * ImportAdapter #1 — deterministic Paylocity time-off export parser.
 * Contract shared with every future adapter (incl. the AI one):
 *   parse(rawText, roster) → { records, issues }
 * Nothing downstream commits without preview + confirm.
 */

const AMPM = /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)$/i;
const H24 = /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})$/;

/** @returns {string|null} ISO datetime, or null when unparseable */
export function parseDateTime(raw) {
  const s = raw.trim();
  let m = s.match(AMPM);
  if (m) {
    let h = Number(m[4]) % 12;
    if (m[6].toUpperCase() === 'PM') h += 12;
    return `${m[3]}-${m[1]}-${m[2]}T${String(h).padStart(2, '0')}:${m[5]}:00`;
  }
  m = s.match(H24);
  if (m) {
    return `${m[3]}-${m[1]}-${m[2]}T${String(Number(m[4])).padStart(2, '0')}:${m[5]}:${m[6]}`;
  }
  return null;
}

function normalize(name) {
  return name.toLowerCase().replace(/[^a-z,\s]/g, '').replace(/\s+/g, ' ').trim();
}

/** Exact (paylocity or display) → staffId. Fuzzy (same last name, first-name prefix) → suggestion only. */
export function matchStaff(name, roster) {
  const n = normalize(name);
  for (const s of roster) {
    if (normalize(s.paylocityName) === n || normalize(s.displayName) === n) {
      return { staffId: s.id, suggestion: null };
    }
  }
  const [last, first = ''] = n.split(',').map((p) => p.trim());
  for (const s of roster) {
    const [sLast, sFirst = ''] = normalize(s.paylocityName).split(',').map((p) => p.trim());
    if (sLast === last && (sFirst.startsWith(first.slice(0, 3)) || first.startsWith(sFirst.slice(0, 3)))) {
      return { staffId: null, suggestion: s.id };
    }
  }
  return { staffId: null, suggestion: null };
}

export function parsePaylocityTimeOff(rawText, roster) {
  const records = [];
  const issues = [];
  const lines = rawText.split('\n').map((l) => l.replace(/\r$/, '')).filter((l) => l.trim());
  lines.forEach((line, idx) => {
    const lineNo = idx + 1;
    if (idx === 0 && /^submitted\b/i.test(line.trim())) return; // optional header row
    const cols = line.split('\t').map((c) => c.trim());
    if (cols.length < 7) {
      issues.push({ line: lineNo, kind: 'bad-row', detail: `expected 7 tab-separated columns, got ${cols.length}` });
      return;
    }
    const [submittedRaw, employeeName, empNum, status, startRaw, hoursRaw, daysRaw] = cols;
    const submittedAt = parseDateTime(submittedRaw);
    const start = parseDateTime(startRaw);
    const hours = Number(hoursRaw);
    const days = Number(daysRaw);
    if (!submittedAt || !start || Number.isNaN(hours) || Number.isNaN(days)) {
      issues.push({ line: lineNo, kind: 'bad-date', detail: `unparseable date or number in: ${line}` });
      return;
    }
    const match = matchStaff(employeeName, roster);
    if (!match.staffId) {
      issues.push({ line: lineNo, kind: 'unknown-employee', name: employeeName, suggestion: match.suggestion });
    }
    records.push({
      submittedAt, employeeName, empNum,
      status: /^approved$/i.test(status) ? 'Approved' : 'Pending',
      startDate: start.slice(0, 10), hours, days,
      staffId: match.staffId, decision: null,
    });
  });
  return { records, issues };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/domain/timeoff.test.js src/import`
Expected: PASS — 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/domain/timeoff.js src/domain/timeoff.test.js src/import
git commit -m "feat: time-off semantics and deterministic Paylocity import adapter"
```

---

