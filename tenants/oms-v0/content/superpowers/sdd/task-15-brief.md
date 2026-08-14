### Task 15: Week Board — read-only grid and coverage strip

**Files:**
- Create: `src/ui/WeekBoard.jsx`
- Modify: `src/ui/App.jsx` (add `{ key: 'board', label: 'Week Board', Component: WeekBoard }` to `SCREENS`; import it)
- Test: `src/ui/WeekBoard.test.jsx`

**Interfaces:**
- Consumes: `useScheduler`, `selectWeek`, `CellChip`, `VarianceBadge`, `DAYS`, `dateForDay`, `fmtShort`, `COVERAGE_ROLES`.
- Produces: `WeekBoard` (default export), `CoverageStrip({coverage, targets})`, `WeekPicker()` — module-scope components. Grid = roster rows × 7 day columns of `CellChip`s. Cell-click editing arrives in Task 16 via an `onCellClick(staffId, day)` prop threaded from `WeekBoard`; in this task clicking selects the cell (visual ring) only.

- [ ] **Step 1: Write the failing test**

`src/ui/WeekBoard.test.jsx`:

```jsx
// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SchedulerProvider } from '../state/SchedulerContext.jsx';
import { createMemoryStore } from '../state/persistence.js';
import WeekBoard from './WeekBoard.jsx';

function mount() {
  return render(
    <SchedulerProvider store={createMemoryStore()}>
      <WeekBoard />
    </SchedulerProvider>
  );
}

describe('week board', () => {
  it('renders every roster row and the workbook cells', async () => {
    mount();
    expect(await screen.findByText('Gardner, Theresa')).toBeTruthy();
    expect(screen.getAllByText('UNPAID OFF')).toHaveLength(3);
    expect(screen.getByText('VA (until 5 PM)')).toBeTruthy();
    expect(screen.getByText('Tech NC · until 1:00 PM')).toBeTruthy();
  });
  it('shows the coverage strip with Thursday over target', async () => {
    mount();
    await screen.findByText('Gardner, Theresa');
    expect(screen.getByText('OVER +1')).toBeTruthy();
    expect(screen.getAllByText('ON TARGET')).toHaveLength(6);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/WeekBoard.test.jsx`
Expected: FAIL — `Cannot find module './WeekBoard.jsx'`.

- [ ] **Step 3: Implement**

`src/ui/WeekBoard.jsx`:

```jsx
import React, { useMemo, useState } from 'react';
import { useScheduler } from '../state/SchedulerContext.jsx';
import { selectWeek } from '../state/store.js';
import { DAYS, dateForDay, fmtShort } from '../domain/calendar.js';
import { COVERAGE_ROLES } from '../domain/cells.js';
import { CellChip, VarianceBadge } from './chips.jsx';

export function WeekPicker() {
  const { state, dispatch } = useScheduler();
  return (
    <div className="no-print flex gap-1">
      {state.weekOrder.map((id) => (
        <button
          key={id} type="button"
          onClick={() => dispatch({ type: 'SELECT_WEEK', weekId: id })}
          className={
            state.ui.selectedWeek === id
              ? 'rounded bg-primary px-3 py-1 text-xs font-semibold text-white'
              : 'rounded border border-charcoal/15 px-3 py-1 text-xs text-charcoal/70 hover:bg-primary/10'
          }
        >
          {fmtShort(id)}
        </button>
      ))}
    </div>
  );
}

export function CoverageStrip({ coverage, targets }) {
  return (
    <div className="glass-panel overflow-x-auto rounded-xl p-3">
      <table className="w-full text-xs">
        <thead>
          <tr>
            <th className="pr-2 text-left font-semibold">Coverage</th>
            {DAYS.map((d) => (
              <th key={d} className="px-2 text-center font-semibold">{d}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {COVERAGE_ROLES.map((role) => (
            <tr key={role}>
              <td className="pr-2 font-medium">{role}</td>
              {DAYS.map((d) => {
                const r = coverage.days[d].roles[role];
                return (
                  <td key={d} className="px-2 py-0.5 text-center">
                    <span className="mr-1 tabular-nums">{r.scheduled}/{r.target}</span>
                    <VarianceBadge variance={r.variance} />
                  </td>
                );
              })}
            </tr>
          ))}
          <tr>
            <td className="pr-2 font-medium">Status</td>
            {DAYS.map((d) => (
              <td key={d} className="px-2 py-1 text-center text-[10px] font-bold">
                {coverage.days[d].status}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export default function WeekBoard() {
  const { state } = useScheduler();
  const weekId = state.ui.selectedWeek;
  const evaluated = useMemo(() => selectWeek(state, weekId), [state, weekId]);
  const [selectedCell, setSelectedCell] = useState(null); // {staffId, day}

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold">Week of {fmtShort(weekId)}</h2>
        <WeekPicker />
      </div>
      <CoverageStrip coverage={evaluated.coverage} targets={evaluated.targets} />
      <div className="overflow-x-auto rounded-xl border border-charcoal/10 bg-white">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-charcoal/10 bg-cream">
              <th className="sticky left-0 bg-cream px-2 py-2 text-left font-semibold">Staff</th>
              {DAYS.map((d) => (
                <th key={d} className="min-w-28 px-1 py-2 text-center font-semibold">
                  {d} <span className="font-normal text-charcoal/50">{fmtShort(dateForDay(weekId, d))}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {state.roster.map((staff) => (
              <tr key={staff.id} className="border-b border-charcoal/5">
                <td className="sticky left-0 bg-white px-2 py-1 font-medium whitespace-nowrap">
                  {staff.displayName}
                </td>
                {DAYS.map((day) => (
                  <td key={day} className="px-1 py-1">
                    <CellChip
                      cell={evaluated.built.cells[staff.id][day]}
                      selected={selectedCell?.staffId === staff.id && selectedCell?.day === day}
                      onClick={() => setSelectedCell({ staffId: staff.id, day })}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

In `src/ui/App.jsx`, add to imports and `SCREENS`:

```jsx
import WeekBoard from './WeekBoard.jsx';

const SCREENS = [
  { key: 'dashboard', label: 'Dashboard', Component: MonthGlance },
  { key: 'board', label: 'Week Board', Component: WeekBoard },
];
```

- [ ] **Step 4: Run tests, then look at it**

Run: `npx vitest run src/ui`
Expected: PASS.

Then start the dev server via the browser preview (launch config `wcah-scheduler`), open the Week Board, and verify against the workbook: Gardner's three UNPAID OFF days, Quinonez's `RVT (9a)` row, Thursday's OVER +1 in the strip.

- [ ] **Step 5: Commit**

```bash
git add src/ui
git commit -m "feat(ui): week board grid with live coverage strip"
```

---

