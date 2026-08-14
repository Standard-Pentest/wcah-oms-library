# OMS Taxonomy Remap and Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remap the OMS mockup to Room Techs / Surgery / Dental department
ownership, wire department-default needs into Week Setup and coverage, add
PTO Week Board preview, rotation week chips, week jump controls, day
recommendations, and hours-minimizing fill.

**Architecture:** Approach A — keep normalized collections; remap seed and
teach the engine to expand day-enabled departments into active needs. Add
pure preview/recommendation helpers and thin UI wiring. Leave Approach B
nesting for a later schema migration.

**Tech Stack:** React 18, Vite 6, Tailwind v4, JavaScript with JSDoc, Vitest,
Testing Library, IndexedDB.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-01-oms-taxonomy-workflow-design.md`
- PRD lifecycle DRAFT → FINAL → PUBLISHED remains authoritative.
- Titles stay CSR / VA / RVT / DVM; departments/roles remap.
- Weekday Surgery 1 + Dental 2; weekend Surgery 1 + Dental 1.
- Room Techs weekday `(2*DVM)+2`, weekend `(2*DVM)+1`.
- PTO preview is non-persisted until Approve/Deny.
- No `Date.now()` in `src/domain`, `src/data`, `src/import`, or engine/seed.
- Legacy Excel parity tripwire and `src/domain` parity path stay untouched.
- Theme token classes only; components at module scope.
- Test-first red/green for every task.
- No git commits unless Tom explicitly requests them.

## File map

| File | Responsibility |
|------|----------------|
| `src/seed/buildSeed.js` | Remap departments, roles, default needs, dayPlans, rotations |
| `src/seed/mapRotations.js` (new) | Convert sample patterns + cadence rotations to cell rows |
| `src/engine/generate.js` | Active needs from dayPlans, department coverage, hours-aware fill |
| `src/engine/dayRecommendations.js` (new) | Ranked per-day fix suggestions |
| `src/engine/ptoImpact.js` | Preview helper reuse for board context |
| `src/state/omsStore.js` | Preview UI actions, week jump, This Week |
| `src/state/omsMutations.js` | Department-default need helpers if needed |
| `src/model/constants.js` | `weekStartForDate` / Sunday snap helper |
| `src/ui/oms/WeekNav.jsx` (new) | Shared date picker + This Week + ←/→ |
| `src/ui/oms/OmsScreens.jsx` | Board preview, coverage by dept, recommendations, nav |
| `src/ui/oms/WeekSetupScreen.jsx` | Department-default activation, coverage preview |
| `src/ui/oms/ConfigurationScreen.jsx` | Consolidated department detail |
| `src/ui/oms/TeamScreen.jsx` | Full-week rotation chips |
| Tests beside each module | Red/green coverage |

---

### Task 1: Remap seed taxonomy and default needs

**Files:**
- Modify: `src/seed/buildSeed.js`
- Test: `src/seed/buildSeed.taxonomy.test.js` (create)
- Test: `src/engine/oms.mockup.test.js` (update assertions that assume `dept-tech` / Floor VA)

**Interfaces:**
- Produces departments: `dept-room-techs`, `dept-surgery`, `dept-dental`,
  `dept-hss`, `dept-pharm`, `dept-csr`, `dept-admin`
- Produces roles: Room Tech, Surgery Tech, Dental Tech, Dental Monitor, HSS,
  Pharmacy, Front Desk, Admin
- Produces `resourceNeeds` with `departmentId` matching those departments
- Default weekday dayPlans enable Room Techs + Surgery + Dental

- [ ] **Step 1: Write failing taxonomy tests**

```javascript
import { describe, expect, it } from 'vitest';
import { buildSeedDocument } from './buildSeed.js';

describe('OMS taxonomy remap', () => {
  it('uses Room Techs, Surgery, and Dental instead of aggregate Technician RVT', () => {
    const doc = buildSeedDocument();
    expect(doc.departments.map((d) => d.code).sort()).toEqual(
      expect.arrayContaining(['ROOM', 'SURGERY', 'DENTAL', 'HSS', 'PHARM']),
    );
    expect(doc.departments.some((d) => d.code === 'TECH')).toBe(false);
    expect(doc.roles.some((r) => r.code === 'ROOM_TECH')).toBe(true);
    expect(doc.resourceNeeds.some((n) => n.departmentId === 'dept-surgery')).toBe(true);
    expect(doc.resourceNeeds.some((n) => n.departmentId === 'dept-dental')).toBe(true);
    expect(doc.resourceNeeds.every((n) => n.departmentId !== 'dept-tech')).toBe(true);
  });

  it('seeds weekday dayPlans with Room Techs, Surgery, and Dental enabled', () => {
    const week = buildSeedDocument().scheduleWeeks['2026-08-02'];
    const ids = week.dayPlans.Mon.departments.map((d) => d.departmentId).sort();
    expect(ids).toEqual(['dept-dental', 'dept-room-techs', 'dept-surgery']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/seed/buildSeed.taxonomy.test.js`
Expected: FAIL — TECH still present / dayPlans only TECH.

- [ ] **Step 3: Remap `buildSeed.js` departments, roles, needs, dayPlans, and employee mapping**

Update `ROLE_DEFS`, `buildNeeds()`, `mapEmployee()` department/role ids, and
default `dayPlans` per the design table. Keep title codes VA/RVT unchanged.

- [ ] **Step 4: Update broken OMS assertions that hard-code old ids**

- [ ] **Step 5: Re-run focused tests**

Run: `npx vitest run src/seed/buildSeed.taxonomy.test.js src/engine/oms.mockup.test.js`
Expected: PASS

---

### Task 2: Department-enabled needs drive generation and coverage

**Files:**
- Modify: `src/engine/generate.js`
- Create: `src/engine/activeNeeds.js`
- Test: `src/engine/activeNeeds.test.js`
- Modify: `src/ui/oms/WeekSetupScreen.jsx`
- Modify: `src/ui/oms/OmsScreens.jsx` coverage strip
- Test: `src/ui/oms/WeekSetupScreen.test.jsx`

**Interfaces:**
- Produces `activeNeedsForWeek(doc, week) → resourceNeed[]`
- Produces coverage rows `{ departmentId, departmentName, day, roleCode, target, scheduled, variance, status }`

- [ ] **Step 1: Write failing active-needs and coverage tests**

```javascript
it('drops Room Tech needs when Room Techs is disabled for Monday', () => {
  const doc = buildSeedDocument();
  doc.scheduleWeeks['2026-08-02'].dayPlans.Mon.departments =
    doc.scheduleWeeks['2026-08-02'].dayPlans.Mon.departments
      .filter((d) => d.departmentId !== 'dept-room-techs');
  const run = generateWeek(doc, '2026-08-02');
  expect(run.coverage.some((r) => r.day === 'Mon' && r.departmentId === 'dept-room-techs')).toBe(false);
  expect(run.coverage.some((r) => r.day === 'Mon' && r.departmentId === 'dept-surgery')).toBe(true);
});

it('groups coverage by department name matching Week Setup', () => {
  const run = generateWeek(buildSeedDocument(), '2026-08-02');
  expect(run.coverage[0]).toHaveProperty('departmentName');
});
```

- [ ] **Step 2: Run tests — expect FAIL**

- [ ] **Step 3: Implement `activeNeedsForWeek` and department fields on coverage**

- [ ] **Step 4: Update Week Setup and Board coverage UI to show department groups**

- [ ] **Step 5: Re-run focused tests — expect PASS**

---

### Task 3: Seed cell-based rotations and Team week chips

**Files:**
- Create: `src/seed/mapRotations.js`
- Modify: `src/seed/buildSeed.js`
- Modify: `src/ui/oms/TeamScreen.jsx`
- Test: `src/seed/mapRotations.test.js`
- Test: `src/ui/oms/TeamScreen.test.jsx`

**Interfaces:**
- Produces rotations `{ id, employeeId, rotationOrder, anchorDate, cells }`
- UI list row renders seven day labels

- [ ] **Step 1: Write failing rotation conversion and UI chip tests**

```javascript
it('converts Evelyn standing Tue–Thu VA into a cell rotation week', () => {
  const rows = mapEmployeeRotations(SEED_ROSTER, SEED_ROTATIONS);
  const evelyn = rows.filter((r) => r.employeeId === 'alonzo-evelyn');
  expect(evelyn[0].cells.Tue).toMatchObject({ kind: 'ROLE', roleId: 'role-room-tech' });
  expect(evelyn.some((r) => r.cells.Sat)).toBe(true); // cadence Sat row
});

it('shows Sun–Sat selections on each Team rotation row', async () => {
  // open Angie or Chloe, assert day chips visible without opening Edit
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement mapper + Team chip rendering**

Standing `pattern` becomes rotation order 0 (or baseline row). Cadence ON/OFF
weeks become additional ordered rows with OFF/ROLE cells and linked-day effects.

- [ ] **Step 4: Confirm generator still schedules Chloe Fri monitor / Evelyn Sat rotate**

- [ ] **Step 5: Re-run focused tests — expect PASS**

---

### Task 4: PTO preview on Week Board

**Files:**
- Modify: `src/state/omsStore.js`
- Modify: `src/engine/ptoImpact.js`
- Modify: `src/ui/oms/OmsScreens.jsx`
- Test: `src/ui/oms/OmsScreens.ptoPreview.test.jsx`
- Test: `src/state/omsStore.ptoPreview.test.js`

**Interfaces:**
- Actions: `PREVIEW_PTO { requestId, optionId? }`, `CLEAR_PTO_PREVIEW`
- UI state: `doc.ui.ptoPreviewRequestId`, `doc.ui.ptoPreviewOptionId`
- Selector: `selectBoardRun(doc, weekStart)` returns preview run when set

- [ ] **Step 1: Write failing reducer + UI tests**

```javascript
it('previewing a pending PTO selects its week and marks the employee off', () => {
  let doc = seedDocument();
  const req = doc.timeOffRequests.find((r) => r.status === 'PENDING' || r.status === 'HOLD');
  doc = reducer(doc, { type: 'PREVIEW_PTO', requestId: req.id });
  expect(doc.ui.screen).toBe('board');
  expect(doc.ui.selectedWeek).toBeTruthy();
  const run = selectBoardRun(doc, doc.ui.selectedWeek);
  expect(run.assignments.some((a) => a.employeeId === req.employeeId && a.isTimeOff)).toBe(true);
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement preview actions and board wiring**

Clicking a PTO queue item dispatches `PREVIEW_PTO` (and still sets
`selectedPtoId`). Board banner: “Previewing PTO for {name}” with Clear /
Approve / Deny. Do not persist time-off status until Decide.

- [ ] **Step 4: Re-run focused tests — expect PASS**

---

### Task 5: Week date picker and This Week

**Files:**
- Create: `src/ui/oms/WeekNav.jsx`
- Modify: `src/model/constants.js` (`weekStartForDate`)
- Modify: `src/state/omsStore.js` (`SELECT_WEEK`, `JUMP_TO_WEEK`, `THIS_WEEK`)
- Modify: Board / Setup / PTO / Hours screens to embed `WeekNav`
- Test: `src/model/constants.weekStart.test.js`
- Test: `src/ui/oms/WeekNav.test.jsx`

**Interfaces:**
- `weekStartForDate('2026-08-05') → '2026-08-02'`
- `THIS_WEEK { today: 'YYYY-MM-DD' }` — today from UI props/tests
- Creating missing weeks clones defaults from nearest seed week

- [ ] **Step 1: Write failing date-snap and nav tests**

```javascript
expect(weekStartForDate('2026-08-05')).toBe('2026-08-02');

it('This week jumps to the Sunday containing the injected today', async () => {
  render(<WeekNav today="2026-08-04" />);
  fireEvent.click(screen.getByRole('button', { name: 'This week' }));
  expect(screen.getByDisplayValue('2026-08-02')).toBeTruthy();
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement helpers, reducer week creation, and shared nav**

- [ ] **Step 4: Re-run focused tests — expect PASS**

---

### Task 6: Day recommendations and hours minimization

**Files:**
- Create: `src/engine/dayRecommendations.js`
- Modify: `src/engine/generate.js` (`fillGaps` candidate ranking)
- Modify: `src/ui/oms/OmsScreens.jsx` rail
- Test: `src/engine/dayRecommendations.test.js`
- Test: `src/engine/generate.hoursFill.test.js`

**Interfaces:**
- `recommendDayFixes(doc, weekStart, day, run) → [{ id, label, weightCost, kind }]`
- Fill prefers `scheduled + shiftHours <= targetHours`; else minimize overage

- [ ] **Step 1: Write failing recommendation and hours-fill tests**

```javascript
it('ranks under-hours employees before candidates who would go into overtime', () => {
  // fixture with two eligible Room Tech candidates: one at 30/40, one at 40/40
  // assert fill chooses the under-hours employee
});

it('returns pull and admin-yield recommendations for a short Room Tech day', () => {
  const fixes = recommendDayFixes(doc, '2026-08-02', 'Mon', run);
  expect(fixes[0].kind).toMatch(/pull|admin_yield|ot|accept_gap/);
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement ranking + rail “Recommendations” section**

- [ ] **Step 4: Re-run focused tests — expect PASS**

---

### Task 7: Consolidate Configuration department detail

**Files:**
- Modify: `src/ui/oms/ConfigurationScreen.jsx`
- Test: `src/ui/oms/ConfigurationScreen.test.jsx`

- [ ] **Step 1: Write failing UI test for department detail containing roles + default needs**

```javascript
it('shows roles and default requirements inside the selected department', async () => {
  fireEvent.click(screen.getByRole('button', { name: /Room Techs/i }));
  expect(screen.getByText(/Room Tech/i)).toBeTruthy();
  expect(screen.getByText(/Default requirements|Mon ·/i)).toBeTruthy();
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Collapse Roles & needs into department detail; keep Constraints tab**

- [ ] **Step 4: Re-run focused tests — expect PASS**

---

### Task 8: Verification

- [ ] **Step 1: Run `npx vitest run`**
- [ ] **Step 2: Run `npm run build`**
- [ ] **Step 3: Smoke test on `:5174` — taxonomy labels, Week Setup toggle → coverage, PTO preview, rotation chips, date picker, This Week, recommendations**
- [ ] **Step 4: Confirm `src/data/parity-aug02.test.js` still passes untouched**
- [ ] **Step 5: Note remaining Approach B follow-ups in the design doc if any A→B adapters were added**

## Incremental delivery implications

| Slice | User-visible value | Risk if skipped |
|-------|--------------------|-----------------|
| Task 1–2 | Correct staffing language + coverage matches setup | Everything else builds on wrong taxonomy |
| Task 3 | Rotations editable/visible as real weeks | Team screen stays cadence-opaque |
| Task 4 | Core PTO decision workflow | Biggest business gap remains |
| Task 5 | Horizon navigation | Stuck on 3 seed weeks |
| Task 6 | Actionable board + fairer hours | Gaps without guidance; overtime pile-up |
| Task 7 | Configuration matches mental model | Dual tabs keep confusing defaults |

## Approach B note for implementers

Do not nest collections in this plan. Keep stable ids
(`dept-room-techs`, `role-room-tech`, …). When Approach B starts, nest
`roles`/`defaultNeeds` under departments and move Week Setup edits to
`dayPlans.needOverrides` without renaming those ids.
