# Non-standard Shift Hours Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let managers set per-day custom start, end, and paid hours on rotation ROLE cells so weekly target math and Week Board `timeNote` stay accurate, without changing coverage headcount.

**Architecture:** Add a pure `src/model/shiftHours.js` helper for defaults, `timeNote` formatting, validation, and cell field apply/clear. Team rotation editor becomes the only authoring UI. Engine already copies `paidHours` / `timeNote` from rotation cells into assignments and sums `paidHours` for targets; tighten board overrides so a note cannot clobber rotation paid hours. Coverage continues to count heads via `countsTowardNeed`.

**Tech Stack:** JavaScript (JSDoc), React 18, Vitest + Testing Library, existing OMS document / `UPSERT_ROTATION` mutations

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-05-nonstandard-shift-hours-design.md`
- Pure modules only under `src/model` / `src/engine` / `src/seed` — no `Date.now()`, no React in helpers
- Do not edit `src/domain` or parity fixtures to force a pass
- Do not add week-board start/end/paid-hours controls
- Paid hours and start/end are independent (no auto-derive from clock span)
- Standard UI defaults when enabling custom hours: start `08:00`, end `18:00`, paid hours `10`
- Commit only when Tom explicitly asks

## File map

| File | Responsibility |
|------|----------------|
| `src/model/shiftHours.js` | Defaults, format `timeNote`, validate, apply/clear custom hours on a ROLE cell |
| `src/model/shiftHours.test.js` | Unit tests for the helper |
| `src/ui/oms/TeamScreen.jsx` | Custom-hours UI on rotation ROLE days; save via existing `UPSERT_ROTATION` |
| `src/ui/oms/TeamScreen.test.jsx` | UI tests for toggle, fields, validation, clear |
| `src/engine/generate.js` | Preserve prior `paidHours` when an override omits `hours` |
| `src/ui/oms/OmsScreens.jsx` | Stop hard-coding `hours: 10` on board assign so notes don't force 10h |
| `src/engine/oms.mockup.test.js` | Engine integration: custom cell → hours + note + coverage headcount |
| `docs/oms-domain-model.md` | Document rotation cell custom-hours fields |

---

### Task 1: Pure shift-hours helpers

**Files:**
- Create: `src/model/shiftHours.js`
- Create: `src/model/shiftHours.test.js`

**Interfaces:**
- Consumes: nothing (pure)
- Produces:
  - `DEFAULT_SHIFT_START = '08:00'`
  - `DEFAULT_SHIFT_END = '18:00'`
  - `DEFAULT_PAID_HOURS = 10`
  - `formatTimeNote(startTime, endTime) → string` (e.g. `8:00 AM – 4:30 PM`)
  - `validateCustomShiftHours({ startTime, endTime, paidHours }) → { ok: true } | { ok: false, message: string }`
  - `hasCustomHours(cell) → boolean` (ROLE cell with both start and end set)
  - `applyCustomHours(cell, { startTime, endTime, paidHours }) → cell` (ROLE only; sets fields + `timeNote`)
  - `clearCustomHours(cell) → cell` (strips start/end/paidHours/timeNote from feature; leaves roleId/kind)

- [x] **Step 1: Write the failing tests**

```js
// src/model/shiftHours.test.js
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SHIFT_START,
  DEFAULT_SHIFT_END,
  DEFAULT_PAID_HOURS,
  formatTimeNote,
  validateCustomShiftHours,
  hasCustomHours,
  applyCustomHours,
  clearCustomHours,
} from './shiftHours.js';

describe('shiftHours', () => {
  it('formats a board time note from start and end', () => {
    expect(formatTimeNote('08:00', '16:30')).toBe('8:00 AM – 4:30 PM');
    expect(formatTimeNote('08:00', '18:00')).toBe('8:00 AM – 6:00 PM');
  });

  it('rejects missing fields, non-positive paid hours, and end <= start', () => {
    expect(validateCustomShiftHours({
      startTime: '08:00', endTime: '18:00', paidHours: 10,
    }).ok).toBe(true);
    expect(validateCustomShiftHours({
      startTime: '', endTime: '18:00', paidHours: 10,
    }).ok).toBe(false);
    expect(validateCustomShiftHours({
      startTime: '08:00', endTime: '18:00', paidHours: 0,
    }).ok).toBe(false);
    expect(validateCustomShiftHours({
      startTime: '18:00', endTime: '08:00', paidHours: 8,
    }).ok).toBe(false);
  });

  it('applies and clears custom hours without deriving paidHours from the clock', () => {
    const base = { kind: 'ROLE', roleId: 'role-room-tech', weight: 65 };
    const custom = applyCustomHours(base, {
      startTime: '07:30', endTime: '16:30', paidHours: 8,
    });
    expect(custom).toMatchObject({
      startTime: '07:30',
      endTime: '16:30',
      paidHours: 8,
      timeNote: '7:30 AM – 4:30 PM',
    });
    expect(hasCustomHours(custom)).toBe(true);
    expect(clearCustomHours(custom)).toEqual({
      kind: 'ROLE', roleId: 'role-room-tech', weight: 65,
    });
    expect(hasCustomHours(clearCustomHours(custom))).toBe(false);
  });

  it('exposes standard defaults for the rotation editor', () => {
    expect(DEFAULT_SHIFT_START).toBe('08:00');
    expect(DEFAULT_SHIFT_END).toBe('18:00');
    expect(DEFAULT_PAID_HOURS).toBe(10);
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/model/shiftHours.test.js`

Expected: FAIL (module missing)

- [x] **Step 3: Implement `src/model/shiftHours.js`**

```js
/** Pure helpers for non-standard rotation shift hours. No React, no clock. */

export const DEFAULT_SHIFT_START = '08:00';
export const DEFAULT_SHIFT_END = '18:00';
export const DEFAULT_PAID_HOURS = 10;

function parseHm(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? '').trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function formatClock(hm) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(hm).trim());
  const hours24 = Number(match[1]);
  const minutes = match[2];
  const suffix = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${minutes} ${suffix}`;
}

export function formatTimeNote(startTime, endTime) {
  return `${formatClock(startTime)} – ${formatClock(endTime)}`;
}

export function validateCustomShiftHours({ startTime, endTime, paidHours }) {
  const startMin = parseHm(startTime);
  const endMin = parseHm(endTime);
  if (startMin == null || endMin == null) {
    return { ok: false, message: 'Start and end times are required (HH:MM).' };
  }
  if (!(Number.isFinite(paidHours) && paidHours > 0)) {
    return { ok: false, message: 'Paid hours must be greater than 0.' };
  }
  if (endMin <= startMin) {
    return { ok: false, message: 'End time must be after start time.' };
  }
  return { ok: true };
}

export function hasCustomHours(cell) {
  return cell?.kind === 'ROLE'
    && Boolean(cell.startTime)
    && Boolean(cell.endTime);
}

export function applyCustomHours(cell, { startTime, endTime, paidHours }) {
  if (cell?.kind !== 'ROLE') return cell;
  return {
    ...cell,
    startTime,
    endTime,
    paidHours,
    timeNote: formatTimeNote(startTime, endTime),
  };
}

export function clearCustomHours(cell) {
  if (!cell || cell.kind !== 'ROLE') return cell;
  const {
    startTime, endTime, paidHours, timeNote, ...rest
  } = cell;
  return rest;
}
```

- [x] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/model/shiftHours.test.js`

Expected: PASS

---

### Task 2: Engine — custom rotation hours + board override integrity

**Files:**
- Modify: `src/engine/generate.js` (override branch that sets `paidHours: value.hours ?? 10`)
- Modify: `src/ui/oms/OmsScreens.jsx` (`AssignmentModal` save payload — remove hard-coded `hours: 10`)
- Modify: `src/engine/oms.mockup.test.js`

**Interfaces:**
- Consumes: rotation ROLE cells may include `startTime`, `endTime`, `paidHours`, `timeNote`; `standingAssignments` already copies `paidHours` / `timeNote` from cells
- Produces: overrides without `hours` keep the standing assignment’s `paidHours`; custom rotation cells drive scheduled hours and board `timeNote`; coverage still headcount

- [x] **Step 1: Write failing engine tests**

Add to `src/engine/oms.mockup.test.js`:

```js
it('uses rotation custom paidHours and timeNote for targets without changing coverage headcount', () => {
  const doc = buildSeedDocument();
  // Find a sequence-1 ROLE day for a coverage role and force custom hours.
  const emp = doc.employees.find((e) => e.id === 'gardner-theresa');
  const rot = emp.rotations.find((r) => r.active !== false);
  const fri = rot.cells.Fri;
  expect(fri.kind).toBe('ROLE');
  rot.cells.Fri = {
    ...fri,
    startTime: '07:30',
    endTime: '16:30',
    paidHours: 8,
    timeNote: '7:30 AM – 4:30 PM',
  };

  const run = generateWeek(doc, '2026-08-02');
  const cell = run.assignments.find(
    (a) => a.employeeId === 'gardner-theresa' && a.day === 'Fri',
  );
  expect(cell).toMatchObject({
    paidHours: 8,
    timeNote: '7:30 AM – 4:30 PM',
    roleCode: expect.any(String),
  });

  // Coverage is headcount: this one assignment still contributes 1 if countsTowardNeed
  const sameRole = run.assignments.filter(
    (a) => a.day === 'Fri'
      && a.roleCode === cell.roleCode
      && a.countsTowardNeed
      && a.locationId === cell.locationId,
  );
  expect(sameRole.some((a) => a.employeeId === 'gardner-theresa')).toBe(true);
  expect(sameRole.filter((a) => a.employeeId === 'gardner-theresa')).toHaveLength(1);
});

it('board override without hours preserves standing paidHours', () => {
  const doc = buildSeedDocument();
  const emp = doc.employees.find((e) => e.id === 'gardner-theresa');
  const rot = emp.rotations.find((r) => r.active !== false);
  const fri = {
    ...rot.cells.Fri,
    startTime: '07:30',
    endTime: '16:30',
    paidHours: 8,
    timeNote: '7:30 AM – 4:30 PM',
  };
  rot.cells.Fri = fri;
  const role = allRoles(doc).find((r) => r.id === fri.roleId);
  doc.scheduleWeeks['2026-08-02'].overrides = {
    'gardner-theresa': {
      Fri: {
        departmentId: role.departmentId,
        roleId: fri.roleId,
        note: 'left early today',
        // hours intentionally omitted
      },
    },
  };

  const run = generateWeek(doc, '2026-08-02');
  const cell = run.assignments.find(
    (a) => a.employeeId === 'gardner-theresa' && a.day === 'Fri',
  );
  expect(cell.paidHours).toBe(8);
  expect(cell.note).toBe('left early today');
});
```

Import `allRoles` from `../model/omsSelectors.js` if not already imported in the test file. Assert `paidHours === 8`. Current `value.hours ?? 10` makes this FAIL until generate + modal are fixed.

- [x] **Step 2: Run the new tests — expect FAIL on override preservation**

Run: `npx vitest run src/engine/oms.mockup.test.js -t "custom paidHours|preserves standing"`

Expected: first test may already pass (cell path exists); second FAIL with `paidHours` 10

- [x] **Step 3: Fix override merge in `generate.js`**

Where overrides are applied (today roughly `paidHours: value.hours ?? 10`), change to:

```js
const existing = map.get(`${employeeId}|${day}`);
// ...
paidHours: value.hours ?? existing?.paidHours ?? 10,
```

Keep `note` / `timeNote` behavior as today for override notes. Do not invent start/end on assignments.

- [x] **Step 4: Fix `AssignmentModal` in `OmsScreens.jsx`**

Remove `hours: 10` from the `SET_OVERRIDE` value object so a board assign+note does not force standard hours. Role/department/note remain. Engine then keeps standing `paidHours` when `hours` is absent.

```js
value: roleId === 'OFF'
  ? 'OFF'
  : {
    departmentId,
    roleId,
    note,
  },
```

- [x] **Step 5: Re-run engine tests**

Run: `npx vitest run src/engine/oms.mockup.test.js`

Expected: PASS (including existing Theresa 5×8s test)

---

### Task 3: Rotation editor UI — custom hours

**Files:**
- Modify: `src/ui/oms/TeamScreen.jsx` (`Rotations` form)
- Modify: `src/ui/oms/TeamScreen.test.jsx`

**Interfaces:**
- Consumes: `hasCustomHours`, `applyCustomHours`, `clearCustomHours`, `validateCustomShiftHours`, defaults from `src/model/shiftHours.js`
- Produces: ROLE cells persisted via `UPSERT_ROTATION` with `startTime` / `endTime` / `paidHours` / `timeNote` when custom hours on; stripped when off or day becomes Any/OFF

- [x] **Step 1: Write failing UI tests**

Add to `src/ui/oms/TeamScreen.test.jsx`:

```js
it('lets a manager set custom hours on a rotation ROLE day', async () => {
  render(
    <OmsProvider store={createOmsMemoryStore()}>
      <TeamScreen />
    </OmsProvider>,
  );
  await screen.findByText('Team members');
  fireEvent.click(screen.getByRole('button', { name: /Gallegos, Angie/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Edit' })); // first rotation edit

  const monday = screen.getByLabelText('Rotation Monday');
  fireEvent.change(monday, { target: { value: 'role-room-tech' } }); // use real role id from seed

  fireEvent.click(screen.getByRole('button', { name: /Custom hours.*Mon|Mon.*Custom hours/i }));
  // Prefer accessible name: getByRole('button', { name: 'Custom hours Mon' }) or checkbox
  expect(screen.getByLabelText('Start Mon')).toBeTruthy();
  expect(screen.getByLabelText('End Mon')).toBeTruthy();
  expect(screen.getByLabelText('Paid hours Mon')).toBeTruthy();

  fireEvent.change(screen.getByLabelText('Start Mon'), { target: { value: '07:30' } });
  fireEvent.change(screen.getByLabelText('End Mon'), { target: { value: '16:30' } });
  fireEvent.change(screen.getByLabelText('Paid hours Mon'), { target: { value: '8' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save rotation row' }));

  // Re-open edit and assert values persisted
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
  expect(screen.getByLabelText('Start Mon').value).toBe('07:30');
  expect(screen.getByLabelText('Paid hours Mon').value).toBe('8');
});

it('blocks save when custom hours are invalid', async () => {
  // Enable custom hours, set end before start, click save
  // Expect inline error text; form still open (no successful upsert wipe)
});

it('clears custom hours when day changes to OFF', async () => {
  // Set custom hours on Mon ROLE, then change Mon to OFF
  // Re-select ROLE — custom hours control is off / fields absent
});
```

Use exact aria-labels from the implementation in Step 3 (`Custom hours Mon`, `Start Mon`, etc.) so tests stay stable.

- [x] **Step 2: Run UI tests — expect FAIL**

Run: `npx vitest run src/ui/oms/TeamScreen.test.jsx -t "custom hours"`

Expected: FAIL (controls missing)

- [x] **Step 3: Implement UI in `Rotations`**

For each day column after the role `<select>`:

1. If cell kind is ROLE, show a checkbox/button `aria-label={`Custom hours ${day}`}` (use full weekday for Mon like existing `Rotation Monday` pattern if preferred — be consistent in tests).
2. When checked / on: show three inputs — Start (`type="time"`), End (`type="time"`), Paid hours (`type="number"`, `min="0.5"`, `step="0.5"`). Defaults on first enable: `08:00`, `18:00`, `10`. Changing start/end must **not** rewrite paid hours.
3. On role select change to `''` or `'OFF'`: set cell to ANY/OFF only (no custom fields).
4. On role select change to a role: keep existing custom fields if the previous cell was ROLE with custom hours and only the roleId changes; otherwise plain `{ kind: 'ROLE', roleId, weight: 65 }`.
5. On form submit: for each ROLE day with custom hours UI on, run `validateCustomShiftHours`; on failure set local `error` string and `return` (do not dispatch). On success, `applyCustomHours` into `form.cells[day]` before dispatch. For ROLE days with custom off, `clearCustomHours` so stale fields are not saved.
6. Show validation error above the Save button.

Skeleton for the day cell updater:

```js
import {
  DEFAULT_SHIFT_START,
  DEFAULT_SHIFT_END,
  DEFAULT_PAID_HOURS,
  applyCustomHours,
  clearCustomHours,
  hasCustomHours,
  validateCustomShiftHours,
} from '../../model/shiftHours.js';

// when enabling custom hours:
setForm({
  ...form,
  cells: {
    ...form.cells,
    [day]: applyCustomHours(form.cells[day], {
      startTime: DEFAULT_SHIFT_START,
      endTime: DEFAULT_SHIFT_END,
      paidHours: DEFAULT_PAID_HOURS,
    }),
  },
});

// when disabling:
setForm({
  ...form,
  cells: {
    ...form.cells,
    [day]: clearCustomHours(form.cells[day]),
  },
});
```

Optional: list-row chips can append a short hours hint when `hasCustomHours(cell)` (e.g. show `timeNote`) — nice-to-have, not required for success criteria.

- [x] **Step 4: Run UI tests — expect PASS**

Run: `npx vitest run src/ui/oms/TeamScreen.test.jsx`

Expected: PASS

---

### Task 4: Domain doc + full verification

**Files:**
- Modify: `docs/oms-domain-model.md` (rotation / employee subtree — note optional `startTime`, `endTime`, `paidHours`, `timeNote` on ROLE cells; coverage ignores hours; board notes ≠ hours)

**Interfaces:**
- Produces: domain doc aligned with the spec; green test suite

- [x] **Step 1: Update domain model**

In §4.3 / §5 rotation vocabulary, add a short bullet:

- ROLE cells may optionally carry `startTime`, `endTime`, `paidHours`, and system `timeNote` for non-standard shifts (see `docs/superpowers/specs/2026-08-05-nonstandard-shift-hours-design.md`). Coverage remains headcount; weekly targets use `paidHours`.

- [x] **Step 2: Run full verification**

Run:

```bash
npx vitest run
npm run build
```

Expected: all tests pass; build succeeds. If conformance is in the default vitest run and drifts, do **not** edit fixtures — stop and report the diff to Tom.

- [x] **Step 3: Spec coverage checklist (implementer self-check)**

| Spec requirement | Task |
|------------------|------|
| Custom hours only on rotation ROLE days | Task 3 |
| Board notes do not edit paid hours controls | Task 2 (modal) + Task 3 (no board UI) |
| Independent start / end / paid hours | Task 1 + Task 3 |
| `timeNote` from start/end on board | Task 1 + Task 2/3 |
| Coverage headcount unchanged | Task 2 test |
| Defaults 8:00 / 6:00 / 10 | Task 1 + Task 3 |
| Validation blocks bad save | Task 1 + Task 3 |
| Clear custom / OFF clears fields | Task 1 + Task 3 |

---

## Self-review (plan author)

1. **Spec coverage:** All locked decisions and test table rows map to Tasks 1–4. Workbook grammar / Employee_Constraints retirement explicitly out of scope — no tasks.
2. **Placeholders:** None; helpers and UI behaviors specified with code.
3. **Type consistency:** `startTime` / `endTime` / `paidHours` / `timeNote` naming matches the spec and existing engine assignment fields.
