### Task 12: State — reducer, seed, selectors

**Files:**
- Create: `src/state/store.js`
- Test: `src/state/store.test.js`

**Interfaces:**
- Consumes: all domain modules; seed data (Tasks 3, 8).
- Produces:
  - `DEFAULT_DVM_COUNTS = {Sun:2, Mon:5, Tue:4, Wed:4, Thu:4, Fri:4, Sat:2}`
  - `makeWeek(startDate, rotations) → week` (proposed toggles, `toggleConfirmed:false`, `status:'draft'`)
  - `seedState() → state` — real roster/rulebook/pull order, `WEEK_AUG02` as week 1 + three proposed weeks, `REQUESTS_AUG02`
  - `initialState({roster, rotations, rulebook, pullOrder, requests, weeks, horizonStart}) → state` where state = `{roster, rotations, rulebook, pullOrder, requests, weeks: {[id]: week}, weekOrder: string[4], ui: {screen:'dashboard', selectedWeek}}`
  - `reducer(state, action)` — actions: `REPLACE_STATE{state}`, `SET_SCREEN{screen}`, `SELECT_WEEK{weekId}`, `SET_DVM_COUNT{weekId,day,count}`, `SET_TOGGLE{weekId,staffId,day,state,role}`, `CONFIRM_TOGGLES{weekId}`, `SET_OVERRIDE{weekId,staffId,day,value}`, `CLEAR_OVERRIDE{weekId,staffId,day}`, `ADD_REQUESTS{records}` (records arrive with ids — the UI assigns them at dispatch; never inside the reducer), `DECIDE_REQUEST{requestId,decision}`, `UPSERT_STAFF{staff}`, `REMOVE_STAFF{staffId}`, `SET_PULL_ORDER{order}`, `UPSERT_ROTATION{rotation}`, `REMOVE_ROTATION{rotationId}` (rotation edits re-propose toggles for every **unconfirmed** week; confirmed weeks keep their states), `UPDATE_RULE{ruleId,patch}`, `PUBLISH_WEEK{weekId}`, `ADVANCE_HORIZON{}`
  - Selectors: `selectWeek(state, weekId) → {week, built, targets, coverage, violations, suggestions}`; `selectMonth(state) → {perWeek:[{weekId, short, hard, soft, provisional, published}], equity, hours, totalShort}`; `selectDecisionQueue(state) → [{request, type, impact:{shortDelta, hardDelta}}]` (pending undecided, first-submitted first, impact = simulate granting)

- [ ] **Step 1: Write the failing test**

`src/state/store.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { seedState, reducer, selectWeek, selectMonth, selectDecisionQueue, makeWeek } from './store.js';
import { generateSuggestions, applyActionsToWeek } from '../domain/suggestions.js';
import { SEED_RULEBOOK } from '../domain/rules.js';

describe('scheduler state', () => {
  it('seeds four real weeks starting Aug 2, week 1 confirmed, the rest proposed', () => {
    const s = seedState();
    expect(s.weekOrder).toEqual(['2026-08-02', '2026-08-09', '2026-08-16', '2026-08-23']);
    expect(s.weeks['2026-08-02'].toggleConfirmed).toBe(true);
    expect(s.weeks['2026-08-09'].toggleConfirmed).toBe(false);
    expect(s.weeks['2026-08-09'].toggleStates.length).toBeGreaterThan(0);
  });
  it('evaluates the seeded week 1 clean: no hard violations, no gaps, no suggestions', () => {
    const s = seedState();
    const w = selectWeek(s, '2026-08-02');
    expect(w.violations.filter((x) => x.severity === 'hard')).toEqual([]);
    expect(Object.values(w.coverage.days).every((d) => d.short === 0)).toBe(true);
    expect(w.suggestions).toEqual([]);
  });
  it('mirrors applyActionsToWeek exactly when dispatching suggestion actions', () => {
    let s = seedState();
    // break coverage to force suggestions: take Prado off Tuesday
    s = reducer(s, { type: 'SET_OVERRIDE', weekId: '2026-08-02', staffId: 'prado-carla', day: 'Tue', value: 'OFF' });
    const { suggestions, week } = selectWeek(s, '2026-08-02');
    expect(suggestions.length).toBeGreaterThan(0);
    for (const sug of suggestions) {
      const viaDomain = applyActionsToWeek(week, sug.actions);
      const viaReducer = sug.actions.reduce((st, a) => reducer(st, { type: a.type, ...a }), s)
        .weeks['2026-08-02'];
      expect(viaReducer, sug.id).toEqual(viaDomain);
    }
  });
  it('grants a pending request and the schedule reacts', () => {
    let s = seedState();
    const before = selectWeek(s, '2026-08-02');
    expect(before.coverage.days.Sat.roles.HSS.variance).toBe(0); // Pearl works Sat
    s = reducer(s, { type: 'DECIDE_REQUEST', requestId: 'req-7', decision: 'granted' });
    const after = selectWeek(s, '2026-08-02');
    expect(after.coverage.days.Sat.roles.HSS.variance).toBe(-1); // her PTO opened a gap
  });
  it('queues only pending undecided requests, first-submitted first, with measured impact', () => {
    const q = selectDecisionQueue(seedState());
    expect(q.map((x) => x.request.id)).toEqual(['req-7', 'req-9']); // Pearl (6/19) before Rodriguez (7/6)
    expect(q[0].impact.shortDelta).toBeGreaterThan(0); // granting Pearl breaks Sat HSS
  });
  it('rule edits cascade: disabling the undertime rule clears its violation', () => {
    let s = seedState();
    expect(selectWeek(s, '2026-08-02').violations.some((v) => v.ruleId === 'undertime')).toBe(true);
    s = reducer(s, { type: 'UPDATE_RULE', ruleId: 'undertime', patch: { disabled: true } });
    expect(selectWeek(s, '2026-08-02').violations.some((v) => v.ruleId === 'undertime')).toBe(false);
  });
  it('advances the horizon by one week', () => {
    const s = reducer(seedState(), { type: 'ADVANCE_HORIZON' });
    expect(s.weekOrder).toEqual(['2026-08-09', '2026-08-16', '2026-08-23', '2026-08-30']);
    expect(s.weeks['2026-08-02']).toBeUndefined();
    expect(s.weeks['2026-08-30'].toggleConfirmed).toBe(false);
  });
  it('rotation edits re-propose toggles for unconfirmed weeks only', () => {
    let s = seedState();
    s = reducer(s, { type: 'REMOVE_ROTATION', rotationId: 'willis-sun' });
    expect(s.weeks['2026-08-09'].toggleStates.some((t) => t.staffId === 'willis-bree')).toBe(false);
    // week 1 was confirmed — its recorded states stay exactly as confirmed
    expect(s.weeks['2026-08-02'].toggleStates.some((t) => t.staffId === 'willis-bree')).toBe(true);
    s = reducer(s, {
      type: 'UPSERT_ROTATION',
      rotation: { id: 'willis-sun', staffId: 'willis-bree', day: 'Sun', roleWhenOn: 'HSS', cadence: 'everyOtherWeek', anchor: '2026-08-09' },
    });
    expect(
      s.weeks['2026-08-09'].toggleStates.find((t) => t.staffId === 'willis-bree' && t.day === 'Sun').state
    ).toBe('ON');
  });
  it('summarizes the month per week and pools equity', () => {
    const m = selectMonth(seedState());
    expect(m.perWeek).toHaveLength(4);
    expect(m.perWeek[0]).toMatchObject({ weekId: '2026-08-02', hard: 0, provisional: false });
    expect(m.perWeek[1].provisional).toBe(true);
    expect(m.equity.gini).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/state/store.test.js`
Expected: FAIL — `Cannot find module './store.js'`.

- [ ] **Step 3: Implement**

`src/state/store.js`:

```js
import { addDays } from '../domain/calendar.js';
import { proposeToggles } from '../domain/rotations.js';
import { buildWeek } from '../domain/build.js';
import { coverageCheck } from '../domain/coverage.js';
import { targetsForWeek } from '../domain/targets.js';
import { evaluateWeek, SEED_RULEBOOK } from '../domain/rules.js';
import { generateSuggestions } from '../domain/suggestions.js';
import { weekendEquity, hoursReport } from '../domain/metrics.js';
import { sortBySubmitted } from '../domain/timeoff.js';
import { DAYS } from '../domain/calendar.js';
import { SEED_ROSTER, SEED_ROTATIONS, PULL_ORDER } from '../data/roster.js';
import { WEEK_AUG02, REQUESTS_AUG02 } from '../data/week-aug02.js';

export const DEFAULT_DVM_COUNTS = { Sun: 2, Mon: 5, Tue: 4, Wed: 4, Thu: 4, Fri: 4, Sat: 2 };

export function makeWeek(startDate, rotations) {
  return {
    startDate,
    dvmCounts: { ...DEFAULT_DVM_COUNTS },
    toggleStates: proposeToggles(rotations, startDate),
    toggleConfirmed: false,
    overrides: {},
    status: 'draft',
  };
}

export function initialState({ roster, rotations, rulebook, pullOrder, requests = [], weeks = [], horizonStart }) {
  const byStart = Object.fromEntries(weeks.map((w) => [w.startDate, w]));
  const weekOrder = [0, 1, 2, 3].map((i) => addDays(horizonStart, i * 7));
  const weekMap = {};
  for (const start of weekOrder) weekMap[start] = byStart[start] ?? makeWeek(start, rotations);
  return {
    roster, rotations, rulebook, pullOrder, requests,
    weeks: weekMap, weekOrder,
    ui: { screen: 'dashboard', selectedWeek: horizonStart },
  };
}

/** First run: the real clinic, with the workbook's Aug 2 week as week 1. */
export function seedState() {
  return initialState({
    roster: SEED_ROSTER, rotations: SEED_ROTATIONS, rulebook: SEED_RULEBOOK,
    pullOrder: PULL_ORDER, requests: REQUESTS_AUG02,
    weeks: [WEEK_AUG02], horizonStart: WEEK_AUG02.startDate,
  });
}

function patchWeek(state, weekId, patch) {
  return { ...state, weeks: { ...state.weeks, [weekId]: { ...state.weeks[weekId], ...patch } } };
}

export function reducer(state, action) {
  switch (action.type) {
    case 'REPLACE_STATE':
      return action.state;
    case 'SET_SCREEN':
      return { ...state, ui: { ...state.ui, screen: action.screen } };
    case 'SELECT_WEEK':
      return { ...state, ui: { ...state.ui, selectedWeek: action.weekId } };
    case 'SET_DVM_COUNT': {
      const week = state.weeks[action.weekId];
      return patchWeek(state, action.weekId, { dvmCounts: { ...week.dvmCounts, [action.day]: action.count } });
    }
    case 'SET_TOGGLE': {
      const week = state.weeks[action.weekId];
      const rest = week.toggleStates.filter((t) => !(t.staffId === action.staffId && t.day === action.day));
      const prior = week.toggleStates.find((t) => t.staffId === action.staffId && t.day === action.day);
      return patchWeek(state, action.weekId, {
        toggleStates: [...rest, {
          rotationId: prior?.rotationId ?? null, staffId: action.staffId, day: action.day,
          role: action.role ?? prior?.role, state: action.state,
        }],
      });
    }
    case 'CONFIRM_TOGGLES':
      return patchWeek(state, action.weekId, { toggleConfirmed: true });
    case 'SET_OVERRIDE': {
      const week = state.weeks[action.weekId];
      const forStaff = { ...(week.overrides[action.staffId] ?? {}), [action.day]: action.value };
      return patchWeek(state, action.weekId, { overrides: { ...week.overrides, [action.staffId]: forStaff } });
    }
    case 'CLEAR_OVERRIDE': {
      const week = state.weeks[action.weekId];
      if (!week.overrides[action.staffId]) return state;
      const forStaff = { ...week.overrides[action.staffId] };
      delete forStaff[action.day];
      return patchWeek(state, action.weekId, { overrides: { ...week.overrides, [action.staffId]: forStaff } });
    }
    case 'ADD_REQUESTS':
      return { ...state, requests: [...state.requests, ...action.records] };
    case 'DECIDE_REQUEST':
      return {
        ...state,
        requests: state.requests.map((r) => (r.id === action.requestId ? { ...r, decision: action.decision } : r)),
      };
    case 'UPSERT_STAFF': {
      const exists = state.roster.some((s) => s.id === action.staff.id);
      return {
        ...state,
        roster: exists
          ? state.roster.map((s) => (s.id === action.staff.id ? action.staff : s))
          : [...state.roster, action.staff],
      };
    }
    case 'REMOVE_STAFF':
      return { ...state, roster: state.roster.filter((s) => s.id !== action.staffId) };
    case 'SET_PULL_ORDER':
      return { ...state, pullOrder: action.order };
    case 'UPSERT_ROTATION':
    case 'REMOVE_ROTATION': {
      const rotations =
        action.type === 'REMOVE_ROTATION'
          ? state.rotations.filter((r) => r.id !== action.rotationId)
          : state.rotations.some((r) => r.id === action.rotation.id)
            ? state.rotations.map((r) => (r.id === action.rotation.id ? action.rotation : r))
            : [...state.rotations, action.rotation];
      // Re-propose toggles for unconfirmed weeks; confirmed weeks keep the manager's states.
      const weeks = { ...state.weeks };
      for (const id of state.weekOrder) {
        if (!weeks[id].toggleConfirmed) {
          weeks[id] = { ...weeks[id], toggleStates: proposeToggles(rotations, id) };
        }
      }
      return { ...state, rotations, weeks };
    }
    case 'UPDATE_RULE':
      return {
        ...state,
        rulebook: state.rulebook.map((r) => (r.id === action.ruleId ? { ...r, ...action.patch } : r)),
      };
    case 'PUBLISH_WEEK':
      return patchWeek(state, action.weekId, { status: 'published' });
    case 'ADVANCE_HORIZON': {
      const [dropped, ...keep] = state.weekOrder;
      const nextStart = addDays(state.weekOrder[state.weekOrder.length - 1], 7);
      const weeks = { ...state.weeks, [nextStart]: makeWeek(nextStart, state.rotations) };
      delete weeks[dropped];
      const weekOrder = [...keep, nextStart];
      const selectedWeek = state.ui.selectedWeek === dropped ? weekOrder[0] : state.ui.selectedWeek;
      return { ...state, weeks, weekOrder, ui: { ...state.ui, selectedWeek } };
    }
    default:
      return state;
  }
}

/** Full evaluation of one week — recomputed on demand; 28×7 is cheap. */
export function selectWeek(state, weekId) {
  const week = state.weeks[weekId];
  const built = buildWeek({ roster: state.roster, week, requests: state.requests });
  const targets = targetsForWeek(week);
  const coverage = coverageCheck(built, targets);
  const violations = evaluateWeek({
    built, week, roster: state.roster, requests: state.requests, coverage, rulebook: state.rulebook,
  });
  const suggestions = generateSuggestions({
    roster: state.roster, week, requests: state.requests,
    rulebook: state.rulebook, pullOrder: state.pullOrder,
  });
  return { week, built, targets, coverage, violations, suggestions };
}

export function selectMonth(state) {
  const evaluated = state.weekOrder.map((id) => ({ id, ...selectWeek(state, id) }));
  const perWeek = evaluated.map((e) => ({
    weekId: e.id,
    short: DAYS.reduce((n, d) => n + e.coverage.days[d].short, 0),
    hard: e.violations.filter((x) => x.severity === 'hard').length,
    soft: e.violations.filter((x) => x.severity === 'soft').length,
    provisional: !e.week.toggleConfirmed,
    published: e.week.status === 'published',
  }));
  const builtWeeks = evaluated.map((e) => e.built);
  return {
    perWeek,
    totalShort: perWeek.reduce((n, w) => n + w.short, 0),
    equity: weekendEquity(builtWeeks, state.roster),
    hours: hoursReport(builtWeeks, state.roster),
  };
}

/** Pending undecided requests, first-submitted-wins, with the cost of granting each. */
export function selectDecisionQueue(state) {
  const pending = sortBySubmitted(
    state.requests.filter((r) => r.status === 'Pending' && !r.decision)
  );
  return pending.map((request) => {
    const granted = {
      ...state,
      requests: state.requests.map((r) => (r.id === request.id ? { ...r, decision: 'granted' } : r)),
    };
    const sum = (st) =>
      st.weekOrder.reduce((acc, id) => {
        const w = selectWeek(st, id);
        acc.short += DAYS.reduce((n, d) => n + w.coverage.days[d].short, 0);
        acc.hard += w.violations.filter((x) => x.severity === 'hard').length;
        return acc;
      }, { short: 0, hard: 0 });
    const before = sum(state);
    const after = sum(granted);
    return {
      request,
      impact: { shortDelta: after.short - before.short, hardDelta: after.hard - before.hard },
    };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/state/store.test.js`
Expected: PASS — 8 tests. (The suggestion-dispatch parity test is the prototype's hard-won lesson: a suggestion's actions must be real reducer actions, verified by dispatching every one.)

- [ ] **Step 5: Commit**

```bash
git add src/state/store.js src/state/store.test.js
git commit -m "feat(state): reducer, seed, and evaluated selectors over the domain"
```

---

