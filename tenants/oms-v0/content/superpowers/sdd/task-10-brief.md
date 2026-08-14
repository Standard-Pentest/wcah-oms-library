### Task 10: Repair suggestions with measured impact

**Files:**
- Create: `src/domain/suggestions.js`
- Test: `src/domain/suggestions.test.js`

**Interfaces:**
- Consumes: `buildWeek`, `coverageCheck`, `targetsForWeek`, `evaluateWeek` (Tasks 6–9).
- Produces:
  - `applyActionsToWeek(week, actions) → week` — pure; understands `{type:'SET_OVERRIDE', weekId, staffId, day, value}` and `{type:'CLEAR_OVERRIDE', weekId, staffId, day}`. **Task 12's reducer must produce identical week records for the same actions — its test dispatches every generated suggestion to prove it.**
  - `generateSuggestions({roster, week, requests, rulebook, pullOrder}) → Suggestion[]` where Suggestion = `{id, kind:'pull'|'add', title, day, role, staffId, actions, impact:{shortDelta, hardDelta, softDelta}}`.
  - Rules of the generator: only fills negative-variance gaps; for VA gaps, **pull-order RVT re-roles come first** (only when that day's RVT variance is positive), then off-duty same-role adds; candidates must pass constraints (noDays, fixedDays, maxDaysPerWeek, emergencyOnly, not already scheduled or off that day); every suggestion's impact is **measured by simulating the actions**, and any suggestion that fails to reduce shorts or that adds a hard violation is discarded; at most 3 suggestions per gap.

- [ ] **Step 1: Write the failing test**

`src/domain/suggestions.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { generateSuggestions, applyActionsToWeek } from './suggestions.js';
import { buildWeek } from './build.js';
import { coverageCheck } from './coverage.js';
import { targetsForWeek } from './targets.js';
import { shift } from './cells.js';
import { SEED_RULEBOOK } from './rules.js';
import { SEED_ROSTER, PULL_ORDER } from '../data/roster.js';
import { WEEK_AUG02, REQUESTS_AUG02 } from '../data/week-aug02.js';

const week = (dvmMon = 0) => ({
  startDate: '2026-08-02',
  dvmCounts: { Sun: 0, Mon: dvmMon, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0 },
  toggleStates: [], overrides: {},
});
const staff = (id, role, pattern, constraints = {}) => ({
  id, displayName: id, paylocityName: id, role, standardHours: 40, pattern, constraints,
});

describe('repair suggestions', () => {
  it('offers eligible off-duty adds and excludes constrained staff', () => {
    const roster = [
      staff('va1', 'VA', {}),
      staff('va2', 'VA', {}, { noDays: ['Mon'] }),
      staff('r1', 'RVT', { Mon: shift('RVT') }),
      staff('r2', 'RVT', { Mon: shift('RVT') }),
      staff('r3', 'RVT', { Mon: shift('RVT') }),
    ];
    const out = generateSuggestions({ roster, week: week(), requests: [], rulebook: SEED_RULEBOOK, pullOrder: [] });
    const vaMon = out.filter((s) => s.day === 'Mon' && s.role === 'VA');
    expect(vaMon.map((s) => s.staffId)).toEqual(['va1']); // va2's no-Mondays excludes her; RVTs are at target, no pull
  });
  it('pulls surplus on-duty RVTs to VA in pull order, before bench adds', () => {
    const roster = [
      staff('va1', 'VA', {}),
      staff('r1', 'RVT', { Mon: shift('RVT') }),
      staff('r2', 'RVT', { Mon: shift('RVT') }),
      staff('r3', 'RVT', { Mon: shift('RVT') }),
      staff('r4', 'RVT', { Mon: shift('RVT') }), // RVT variance +1 on Mon
    ];
    // pullOrder lists only r2 — with the 3-per-gap cap, a full pull list would evict the bench add
    const out = generateSuggestions({ roster, week: week(), requests: [], rulebook: SEED_RULEBOOK, pullOrder: ['r2'] });
    const vaMon = out.filter((s) => s.day === 'Mon' && s.role === 'VA');
    expect(vaMon[0]).toMatchObject({ kind: 'pull', staffId: 'r2' });
    expect(vaMon.some((s) => s.kind === 'add' && s.staffId === 'va1')).toBe(true);
  });
  it('reports impact that matches actually applying the actions', () => {
    const roster = [
      staff('va1', 'VA', {}),
      staff('r1', 'RVT', { Mon: shift('RVT') }),
      staff('r2', 'RVT', { Mon: shift('RVT') }),
      staff('r3', 'RVT', { Mon: shift('RVT') }),
    ];
    const w = week();
    const out = generateSuggestions({ roster, week: w, requests: [], rulebook: SEED_RULEBOOK, pullOrder: [] });
    const short = (wk) => {
      const built = buildWeek({ roster, week: wk, requests: [] });
      const cov = coverageCheck(built, targetsForWeek(wk));
      return Object.values(cov.days).reduce((n, d) => n + d.short, 0);
    };
    for (const s of out) {
      const before = short(w);
      const after = short(applyActionsToWeek(w, s.actions));
      expect(after - before, s.id).toBe(s.impact.shortDelta);
    }
  });
  it('generates nothing for the on-target real Aug 2 week', () => {
    const out = generateSuggestions({
      roster: SEED_ROSTER, week: WEEK_AUG02, requests: REQUESTS_AUG02,
      rulebook: SEED_RULEBOOK, pullOrder: PULL_ORDER,
    });
    expect(out).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/domain/suggestions.test.js`
Expected: FAIL — `Cannot find module './suggestions.js'`.

- [ ] **Step 3: Implement**

`src/domain/suggestions.js`:

```js
import { DAYS } from './calendar.js';
import { COVERAGE_ROLES } from './cells.js';
import { buildWeek } from './build.js';
import { coverageCheck } from './coverage.js';
import { targetsForWeek } from './targets.js';
import { evaluateWeek } from './rules.js';

/** Pure action application — the reducer (Task 12) must behave identically. */
export function applyActionsToWeek(week, actions) {
  const next = structuredClone(week);
  for (const a of actions) {
    if (a.type === 'SET_OVERRIDE') {
      next.overrides[a.staffId] = { ...(next.overrides[a.staffId] ?? {}), [a.day]: a.value };
    } else if (a.type === 'CLEAR_OVERRIDE' && next.overrides[a.staffId]) {
      delete next.overrides[a.staffId][a.day];
    }
  }
  return next;
}

function snapshot({ roster, week, requests, rulebook }) {
  const built = buildWeek({ roster, week, requests });
  const coverage = coverageCheck(built, targetsForWeek(week));
  const violations = evaluateWeek({ built, week, roster, requests, coverage, rulebook });
  return {
    built, coverage,
    totalShort: DAYS.reduce((n, d) => n + coverage.days[d].short, 0),
    hard: violations.filter((x) => x.severity === 'hard').length,
    soft: violations.filter((x) => x.severity === 'soft').length,
  };
}

function isEligible(staff, day, cells) {
  if (cells[day]) return false; // already scheduled, or on time off
  const c = staff.constraints ?? {};
  if (c.emergencyOnly) return false;
  if (c.noDays?.includes(day)) return false;
  if (c.fixedDays && !c.fixedDays.includes(day)) return false;
  const worked = DAYS.filter((d) => cells[d]?.kind === 'shift').length;
  if (c.maxDaysPerWeek && worked >= c.maxDaysPerWeek) return false;
  return true;
}

/** Gap repairs the way the manager does them: pull order first, bench second, impact measured. */
export function generateSuggestions({ roster, week, requests, rulebook, pullOrder }) {
  const base = snapshot({ roster, week, requests, rulebook });
  const suggestions = [];
  for (const day of DAYS) {
    for (const role of COVERAGE_ROLES) {
      if (base.coverage.days[day].roles[role].variance >= 0) continue;
      /** @type {Array<{staffId: string, kind: 'pull'|'add'}>} */
      const candidates = [];
      if (role === 'VA' && base.coverage.days[day].roles.RVT.variance > 0) {
        for (const id of pullOrder) {
          const cell = base.built.cells[id]?.[day];
          if (cell?.kind === 'shift' && cell.role === 'RVT') candidates.push({ staffId: id, kind: 'pull' });
        }
      }
      for (const s of roster) {
        if (s.role === role && isEligible(s, day, base.built.cells[s.id])) {
          candidates.push({ staffId: s.id, kind: 'add' });
        }
      }
      let kept = 0;
      for (const cand of candidates) {
        if (kept >= 3) break;
        const actions = [{ type: 'SET_OVERRIDE', weekId: week.startDate, staffId: cand.staffId, day, value: { role } }];
        const after = snapshot({ roster, week: applyActionsToWeek(week, actions), requests, rulebook });
        const impact = {
          shortDelta: after.totalShort - base.totalShort,
          hardDelta: after.hard - base.hard,
          softDelta: after.soft - base.soft,
        };
        if (impact.shortDelta >= 0 || impact.hardDelta > 0) continue;
        const staff = roster.find((x) => x.id === cand.staffId);
        suggestions.push({
          id: `fill-${day}-${role}-${cand.staffId}`,
          kind: cand.kind, day, role, staffId: cand.staffId, actions, impact,
          title: cand.kind === 'pull'
            ? `Pull ${staff.displayName} (RVT) to ${role} on ${day}`
            : `Add ${staff.displayName} to ${role} on ${day}`,
        });
        kept += 1;
      }
    }
  }
  return suggestions;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/domain/suggestions.test.js`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/domain/suggestions.js src/domain/suggestions.test.js
git commit -m "feat(domain): pull-order repair suggestions with measured impact"
```

---

