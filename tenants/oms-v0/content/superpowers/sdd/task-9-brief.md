### Task 9: Rulebook and evaluateWeek

**Files:**
- Create: `src/domain/rules.js`
- Test: `src/domain/rules.test.js`

**Interfaces:**
- Consumes: built/coverage shapes (Tasks 6–7), `isApplied`, `requestDates`, `classifyRequest` (Task 5), fixtures (Task 8, test only).
- Produces:
  - `SEVERITY = { fixed: 'hard', flexible: 'soft', highlyFlexible: 'info' }`
  - `SEED_RULEBOOK` — rule instances `{id, template, params, flexibility, note}` encoding the README's standing rules
  - `evaluateWeek({built, week, roster, requests, coverage, rulebook}) → Violation[]` where Violation = `{ruleId, severity:'hard'|'soft'|'info', message, staffId?, day?, role?}`, sorted hard→soft→info.
  - Template names (closed set): `roleCoverageTarget`, `consecutiveDaysOff` (evaluated **circularly** within the week — Sat and Sun adjacent, since patterns repeat weekly), `fixedWorkDays`, `personDayRole`, `noWorkDays`, `forbiddenAssignment`, `maxDaysPerWeek`, `emergencyOnly`, `overtime`, `undertime` (paid-credited: worked hours + applied paid/partial request hours vs `standardHours`; skip staff with standardHours 0).

- [ ] **Step 1: Write the failing test**

`src/domain/rules.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { evaluateWeek, SEED_RULEBOOK, SEVERITY } from './rules.js';
import { buildWeek } from './build.js';
import { coverageCheck } from './coverage.js';
import { targetsForWeek } from './targets.js';
import { shift } from './cells.js';
import { SEED_ROSTER } from '../data/roster.js';
import { WEEK_AUG02, REQUESTS_AUG02 } from '../data/week-aug02.js';

const week = (patch = {}) => ({
  startDate: '2026-08-02',
  dvmCounts: { Sun: 0, Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0 },
  toggleStates: [], overrides: {}, ...patch,
});

function run(roster, w, requests = [], rulebook = SEED_RULEBOOK) {
  const built = buildWeek({ roster, week: w, requests });
  const coverage = coverageCheck(built, targetsForWeek(w));
  return evaluateWeek({ built, week: w, roster, requests, coverage, rulebook });
}

describe('rule templates', () => {
  it('maps flexibility to severity', () => {
    expect(SEVERITY).toEqual({ fixed: 'hard', flexible: 'soft', highlyFlexible: 'info' });
  });
  it('flags coverage shortfalls with the rule severity', () => {
    // Empty schedule, Monday needs RVTs (weekday target 3)
    const out = run([], week());
    const rvtMon = out.find((v) => v.ruleId === 'cov-rvt' && v.day === 'Mon');
    expect(rvtMon).toMatchObject({ severity: 'hard', role: 'RVT' });
  });
  it('checks consecutive days off circularly and honors exemptions', () => {
    const iso = { id: 'x', role: 'VA', standardHours: 40, constraints: {}, // off Sun, Fri — never 2 in a row even circularly
      pattern: { Mon: shift('VA'), Tue: shift('VA'), Wed: shift('VA'), Thu: shift('VA'), Sat: shift('VA') } };
    expect(run([iso], week()).some((v) => v.ruleId === 'consec-off' && v.staffId === 'x')).toBe(true);
    const wrap = { ...iso, id: 'y', // off Sun, Wed, Sat — Sat+Sun wrap makes a pair
      pattern: { Mon: shift('VA'), Tue: shift('VA'), Thu: shift('VA'), Fri: shift('VA') } };
    expect(run([wrap], week()).some((v) => v.ruleId === 'consec-off' && v.staffId === 'y')).toBe(false);
    const exempt = { ...iso, id: 'alvarez-marvette', constraints: { consecutiveOffExempt: true } };
    expect(run([exempt], week()).some((v) => v.ruleId === 'consec-off')).toBe(false);
  });
  it('enforces person rules: fixed days, day-role locks, no-days, forbidden roles, max days, emergency-only', () => {
    const staff = (id, pattern) => ({ id, role: 'RVT', standardHours: 40, constraints: {}, pattern });
    const out = run(
      [
        staff('alvarez-marvette', { Wed: shift('VA') }),          // outside her fixed days
        staff('sharko-chloe', { Mon: shift('RVT') }),             // Monday must be VA
        staff('mariscal-paulina', { Sun: shift('VA') }),          // no Sundays
        staff('tolden-teagan', { Fri: shift('MONITOR') }),        // never dental
        staff('corneau-lopez-michaela', { Sun: shift('VA'), Mon: shift('VA'), Tue: shift('VA'), Wed: shift('VA') }),
        staff('burchnell-cayla', { Thu: shift('HSS') }),          // emergency backup only
      ],
      week()
    );
    for (const ruleId of ['fixed-marvette', 'lock-chloe-mon', 'noday-mariscal', 'forbid-teagan', 'maxdays-michaela', 'emergency-cayla']) {
      expect(out.some((v) => v.ruleId === ruleId), ruleId).toBe(true);
    }
  });
  it('flags overtime as info and undertime as soft, crediting paid time off', () => {
    const five = { id: 'a', role: 'VA', standardHours: 40, constraints: {},
      pattern: { Mon: shift('VA'), Tue: shift('VA'), Wed: shift('VA'), Thu: shift('VA'), Fri: shift('VA') } };
    expect(run([five], week()).find((v) => v.ruleId === 'overtime')).toMatchObject({ severity: 'info', staffId: 'a' });
    const three = { id: 'b', role: 'VA', standardHours: 40, constraints: {},
      pattern: { Mon: shift('VA'), Tue: shift('VA'), Wed: shift('VA') } };
    expect(run([three], week()).find((v) => v.ruleId === 'undertime')).toMatchObject({ severity: 'soft', staffId: 'b' });
    const covered = [{ ...three, id: 'c' }];
    const paid = [{ staffId: 'c', status: 'Approved', decision: null, startDate: '2026-08-06', hours: 10, days: 1, submittedAt: 'x' }];
    expect(run(covered, week(), paid).some((v) => v.ruleId === 'undertime' && v.staffId === 'c')).toBe(false);
  });
  it('on the real Aug 2 week: no hard violations, and exactly Gardner undertime as soft', () => {
    const out = run(SEED_ROSTER, WEEK_AUG02, REQUESTS_AUG02);
    expect(out.filter((v) => v.severity === 'hard')).toEqual([]);
    const soft = out.filter((v) => v.severity === 'soft');
    expect(soft).toHaveLength(1);
    expect(soft[0]).toMatchObject({ ruleId: 'undertime', staffId: 'gardner-theresa' });
    expect(soft[0].message).toContain('makeup');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/domain/rules.test.js`
Expected: FAIL — `Cannot find module './rules.js'`.

- [ ] **Step 3: Implement**

`src/domain/rules.js`:

```js
import { DAYS } from './calendar.js';
import { isApplied, requestDates, classifyRequest } from './timeoff.js';
import { dayForDate } from './calendar.js';

export const SEVERITY = { fixed: 'hard', flexible: 'soft', highlyFlexible: 'info' };

const ORDER = { hard: 0, soft: 1, info: 2 };

function v(rule, extra) {
  return { ruleId: rule.id, severity: SEVERITY[rule.flexibility], ...extra };
}

function shiftDays(cells) {
  return DAYS.filter((d) => cells[d]?.kind === 'shift');
}

function workedHours(cells) {
  return DAYS.reduce((h, d) => h + (cells[d]?.kind === 'shift' ? cells[d].hours : 0), 0);
}

/** Longest circular run of consecutive off days (Sat wraps to Sun — patterns repeat weekly). */
function longestOffRun(cells) {
  const off = DAYS.map((d) => !cells[d] || cells[d].kind === 'off');
  if (off.every(Boolean)) return 7;
  let best = 0;
  let run = 0;
  for (const isOff of [...off, ...off]) { // doubled array = circular scan
    run = isOff ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return Math.min(best, 7);
}

const TEMPLATES = {
  roleCoverageTarget({ rule, coverage }) {
    const { role } = rule.params;
    const out = [];
    for (const day of DAYS) {
      const r = coverage.days[day].roles[role];
      if (r.variance < 0) {
        out.push(v(rule, { day, role, message: `${role} short ${-r.variance} on ${day} (${r.scheduled} of ${r.target}). ${rule.note}` }));
      }
    }
    return out;
  },
  consecutiveDaysOff({ rule, built, roster }) {
    const out = [];
    for (const staff of roster) {
      if (rule.params.exempt?.includes(staff.id) || staff.constraints.consecutiveOffExempt) continue;
      if (longestOffRun(built.cells[staff.id]) < rule.params.minRun) {
        out.push(v(rule, { staffId: staff.id, message: `${staff.displayName ?? staff.id} has no ${rule.params.minRun} consecutive days off this week. ${rule.note}` }));
      }
    }
    return out;
  },
  fixedWorkDays({ rule, built }) {
    const { staffId, days } = rule.params;
    const cells = built.cells[staffId] ?? {};
    return shiftDays(cells)
      .filter((d) => !days.includes(d))
      .map((d) => v(rule, { staffId, day: d, message: `${staffId} is locked to ${days.join('/')} and is scheduled ${d}. ${rule.note}` }));
  },
  personDayRole({ rule, built }) {
    const { staffId, day, role } = rule.params;
    const cell = built.cells[staffId]?.[day];
    if (cell?.kind === 'shift' && cell.role !== role) {
      return [v(rule, { staffId, day, role, message: `${staffId} works ${day} as ${cell.role}, but ${day} is always ${role}. ${rule.note}` })];
    }
    return [];
  },
  noWorkDays({ rule, built }) {
    const { staffId, days } = rule.params;
    const cells = built.cells[staffId] ?? {};
    return days
      .filter((d) => cells[d]?.kind === 'shift')
      .map((d) => v(rule, { staffId, day: d, message: `${staffId} is scheduled ${d}, a day they never work. ${rule.note}` }));
  },
  forbiddenAssignment({ rule, built }) {
    const { staffId, roles } = rule.params;
    const cells = built.cells[staffId] ?? {};
    return shiftDays(cells)
      .filter((d) => roles.includes(cells[d].role))
      .map((d) => v(rule, { staffId, day: d, role: cells[d].role, message: `${staffId} is assigned ${cells[d].role} on ${d}. ${rule.note}` }));
  },
  maxDaysPerWeek({ rule, built }) {
    const { staffId, max } = rule.params;
    const n = shiftDays(built.cells[staffId] ?? {}).length;
    return n > max ? [v(rule, { staffId, message: `${staffId} is scheduled ${n} days; their maximum is ${max}. ${rule.note}` })] : [];
  },
  emergencyOnly({ rule, built }) {
    const { staffId } = rule.params;
    const n = shiftDays(built.cells[staffId] ?? {}).length;
    return n > 0 ? [v(rule, { staffId, message: `${staffId} is scheduled ${n} day(s) but is an emergency backup only. ${rule.note}` })] : [];
  },
  overtime({ rule, built, roster }) {
    const out = [];
    for (const staff of roster) {
      const h = workedHours(built.cells[staff.id]);
      if (h > rule.params.maxHours) {
        out.push(v(rule, { staffId: staff.id, message: `${staff.displayName ?? staff.id} is at ${h}h (over ${rule.params.maxHours}h). ${rule.note}` }));
      }
    }
    return out;
  },
  undertime({ rule, built, week, roster, requests }) {
    const out = [];
    for (const staff of roster) {
      if (!staff.standardHours) continue;
      const worked = workedHours(built.cells[staff.id]);
      let paidOff = 0;
      let unpaidDays = 0;
      for (const req of requests ?? []) {
        if (req.staffId !== staff.id || !isApplied(req)) continue;
        const inWeek = requestDates(req).some((date) => dayForDate(week.startDate, date));
        if (!inWeek) continue;
        if (classifyRequest(req) === 'UNPAID') unpaidDays += req.days;
        else paidOff += req.hours;
      }
      const shortfall = staff.standardHours - worked - paidOff;
      if (shortfall > 0) {
        const makeup = unpaidDays > 0 ? ` Unpaid time off — makeup shifts owed.` : '';
        out.push(v(rule, { staffId: staff.id, message: `${staff.displayName ?? staff.id} is ${shortfall}h under their ${staff.standardHours}h standard.${makeup} ${rule.note}` }));
      }
    }
    return out;
  },
};

/** The README sheet's standing rules, as editable instances. */
export const SEED_RULEBOOK = [
  { id: 'cov-va', template: 'roleCoverageTarget', params: { role: 'VA' }, flexibility: 'fixed', note: 'Two VAs per doctor plus monitor and floater — not flexible.' },
  { id: 'cov-rvt', template: 'roleCoverageTarget', params: { role: 'RVT' }, flexibility: 'fixed', note: 'Weekday RVT split: 1 surgery + 2 dental (Teagan surgery/VA only).' },
  { id: 'cov-hss', template: 'roleCoverageTarget', params: { role: 'HSS' }, flexibility: 'fixed', note: 'Sunday HSS only on Bree\'s ON weeks.' },
  { id: 'cov-pharm', template: 'roleCoverageTarget', params: { role: 'PHARM' }, flexibility: 'flexible', note: 'Pharmacy backups: Camila (#1, Wed default), Damali (#2).' },
  { id: 'consec-off', template: 'consecutiveDaysOff', params: { minRun: 2, exempt: ['alvarez-marvette'] }, flexibility: 'flexible', note: 'Everyone gets at least 2 consecutive days off.' },
  { id: 'fixed-marvette', template: 'fixedWorkDays', params: { staffId: 'alvarez-marvette', days: ['Sun', 'Tue', 'Thu', 'Sat'] }, flexibility: 'fixed', note: 'Mexico commute — needs the rest day between shifts.' },
  { id: 'lock-chloe-mon', template: 'personDayRole', params: { staffId: 'sharko-chloe', day: 'Mon', role: 'VA' }, flexibility: 'fixed', note: 'Chloe is VA every Monday.' },
  { id: 'lock-chloe-fri', template: 'personDayRole', params: { staffId: 'sharko-chloe', day: 'Fri', role: 'MONITOR' }, flexibility: 'fixed', note: 'Chloe runs dental monitor every Friday.' },
  { id: 'noday-mariscal', template: 'noWorkDays', params: { staffId: 'mariscal-paulina', days: ['Sun'] }, flexibility: 'fixed', note: 'Paulina M works no Sundays.' },
  { id: 'noday-shana', template: 'noWorkDays', params: { staffId: 'ross-shana', days: ['Sat'] }, flexibility: 'fixed', note: 'Shana works no Saturdays.' },
  { id: 'noday-carla', template: 'noWorkDays', params: { staffId: 'prado-carla', days: ['Sun', 'Mon', 'Fri', 'Sat'] }, flexibility: 'fixed', note: 'Carla works Tue–Thu only.' },
  { id: 'forbid-teagan', template: 'forbiddenAssignment', params: { staffId: 'tolden-teagan', roles: ['MONITOR'] }, flexibility: 'fixed', note: 'Teagan: surgery RVT or VA only — never dental.' },
  { id: 'maxdays-michaela', template: 'maxDaysPerWeek', params: { staffId: 'corneau-lopez-michaela', max: 3 }, flexibility: 'fixed', note: 'Michaela is part-time, 3 days.' },
  { id: 'emergency-cayla', template: 'emergencyOnly', params: { staffId: 'burchnell-cayla' }, flexibility: 'flexible', note: 'Cayla is the emergency HSS backup only.' },
  { id: 'overtime', template: 'overtime', params: { maxHours: 40 }, flexibility: 'highlyFlexible', note: 'Minimize overtime — highly flexible.' },
  { id: 'undertime', template: 'undertime', params: {}, flexibility: 'flexible', note: 'Nobody silently loses hours.' },
];

/** Run every enabled rule instance; hard violations sort first. */
export function evaluateWeek(ctx) {
  const out = [];
  for (const rule of ctx.rulebook) {
    if (rule.disabled) continue;
    const evaluate = TEMPLATES[rule.template];
    if (evaluate) out.push(...evaluate({ ...ctx, rule }));
  }
  return out.sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/domain/rules.test.js`
Expected: PASS — 6 tests. The Aug 2 case is the second parity tripwire: the real week must produce **zero hard violations and exactly one soft** (Gardner's unpaid-time undertime). If extras appear, a template is too eager — fix the template, not the test.

- [ ] **Step 5: Commit**

```bash
git add src/domain/rules.js src/domain/rules.test.js
git commit -m "feat(domain): rulebook templates with flexibility ratings and evaluateWeek"
```

---

