### Task 16: Week Board editing — cell editor, rail, bench with drag

**Files:**
- Create: `src/ui/RailPanel.jsx`
- Modify: `src/ui/WeekBoard.jsx` (cell editor bar, rail column, bench drawer, DndContext)
- Test: `src/ui/WeekBoardEditing.test.jsx`

**Interfaces:**
- Consumes: reducer actions `SET_OVERRIDE`/`CLEAR_OVERRIDE` (identical semantics to `applyActionsToWeek` — Task 12 proved it), `evaluated` shape from `selectWeek`, `@dnd-kit/core`.
- Produces:
  - `CellEditorBar({selectedCell, weekId, roster, onClose})` (module scope, in WeekBoard.jsx) — role buttons `VA RVT HSS PHARM ADMIN MONITOR PB`, `OFF`, `Clear override`, `Close`. Every edit dispatches; **edits flag, never block.**
  - `RailPanel({evaluated, selectedCell, weekId})` (default export) — stacked sections: **Violations** (severity-colored, message text, hard first — includes honest "No repair available" when a hard coverage violation has no matching suggestion), **Suggestions** (title + measured impact badge + Apply button dispatching each action in order), **Person** (when a cell is selected: name, role, standard vs scheduled hours, constraint notes), and — when nothing is selected — **Rulebook**: every rule instance with its note, a flexibility `<select>` and an enable checkbox dispatching `UPDATE_RULE`. Editing a rule cascades instantly through violations — the elicitation surface.
  - Bench drawer (in WeekBoard.jsx): staff grouped by role, each a draggable chip; dropping a chip on that same person's **empty** day cell dispatches `SET_OVERRIDE` with their primary role. Drops elsewhere are no-ops (meaningless, not violations).

- [ ] **Step 1: Write the failing test**

`src/ui/WeekBoardEditing.test.jsx`:

```jsx
// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
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

describe('week board editing', () => {
  it('shows the seeded soft violation in the rail', async () => {
    mount();
    await screen.findByText('Gardner, Theresa');
    expect(screen.getByText(/under their 40h standard/)).toBeTruthy();
  });
  it('edits a cell to OFF, surfaces the violation and a pull-order repair, applies it', async () => {
    mount();
    await screen.findByText('Prado, Carla');
    // Prado's Tuesday RVT cell → OFF
    const row = screen.getByText('Prado, Carla').closest('tr');
    fireEvent.click(within(row).getAllByText('RVT')[0]); // Tue is her first RVT chip
    fireEvent.click(screen.getByRole('button', { name: 'OFF' }));
    // RVT short 1 on Tue → hard violation + suggestions
    expect(await screen.findByText(/RVT short 1 on Tue/)).toBeTruthy();
    const apply = await screen.findAllByRole('button', { name: /Apply/ });
    fireEvent.click(apply[0]);
    // Gap resolved — violation gone
    expect(screen.queryByText(/RVT short 1 on Tue/)).toBeNull();
  });
  it('clears an override', async () => {
    mount();
    await screen.findByText('Prado, Carla');
    const row = screen.getByText('Prado, Carla').closest('tr');
    fireEvent.click(within(row).getAllByText('RVT')[0]);
    fireEvent.click(screen.getByRole('button', { name: 'OFF' }));
    fireEvent.click(within(row).getAllByLabelText('empty slot')[2]); // Sun, Mon, then Tue — index 2 is the now-empty Tue cell
    fireEvent.click(screen.getByRole('button', { name: 'Clear override' }));
    expect(within(row).getAllByText('RVT').length).toBeGreaterThanOrEqual(3);
  });
  it('edits the rulebook from the rail and violations cascade', async () => {
    mount();
    await screen.findByText(/under their 40h standard/);
    // nothing selected → rulebook is visible; disabling undertime clears its violation live
    fireEvent.click(screen.getByLabelText('enable undertime'));
    expect(screen.queryByText(/under their 40h standard/)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/WeekBoardEditing.test.jsx`
Expected: FAIL — no editor buttons, no rail.

- [ ] **Step 3: Implement**

`src/ui/RailPanel.jsx`:

```jsx
import React from 'react';
import clsx from 'clsx';
import { useScheduler } from '../state/SchedulerContext.jsx';
import { DAYS } from '../domain/calendar.js';

const SEV_STYLES = {
  hard: 'border-danger/40 bg-danger-soft text-danger',
  soft: 'border-amber-text/30 bg-amber-soft text-amber-text',
  info: 'border-charcoal/15 bg-charcoal/5 text-charcoal/70',
};

export default function RailPanel({ evaluated, selectedCell, weekId }) {
  const { state, dispatch } = useScheduler();
  const staff = selectedCell ? state.roster.find((s) => s.id === selectedCell.staffId) : null;
  const workedHours = staff
    ? DAYS.reduce((h, d) => {
        const c = evaluated.built.cells[staff.id][d];
        return h + (c?.kind === 'shift' ? c.hours : 0);
      }, 0)
    : 0;
  const hardUnrepairable = evaluated.violations.filter(
    (v) => v.severity === 'hard' && v.day && v.role &&
      !evaluated.suggestions.some((s) => s.day === v.day && s.role === v.role)
  );

  return (
    <aside className="glass-panel w-80 shrink-0 space-y-4 self-start rounded-xl p-4 no-print">
      <section>
        <h3 className="text-xs font-bold uppercase tracking-wide text-charcoal/60">Violations</h3>
        {evaluated.violations.length === 0 && (
          <p className="mt-2 text-xs text-charcoal/50">None. This week satisfies the rulebook.</p>
        )}
        <ul className="mt-2 space-y-2">
          {evaluated.violations.map((v, i) => (
            <li key={i} className={clsx('rounded border px-2 py-1.5 text-xs', SEV_STYLES[v.severity])}>
              <span className="font-bold uppercase">{v.severity}</span> — {v.message}
              {hardUnrepairable.includes(v) && (
                <div className="mt-1 font-semibold">No repair available given current rules.</div>
              )}
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h3 className="text-xs font-bold uppercase tracking-wide text-charcoal/60">Suggestions</h3>
        {evaluated.suggestions.length === 0 && (
          <p className="mt-2 text-xs text-charcoal/50">Nothing to fix.</p>
        )}
        <ul className="mt-2 space-y-2">
          {evaluated.suggestions.map((s) => (
            <li key={s.id} className="rounded border border-primary/20 bg-white/60 px-2 py-1.5 text-xs">
              <div>{s.title}</div>
              <div className="mt-1 flex items-center justify-between">
                <span className="text-[11px] text-charcoal/60">
                  gaps {s.impact.shortDelta} · hard {s.impact.hardDelta >= 0 ? `+${s.impact.hardDelta}` : s.impact.hardDelta}
                </span>
                <button
                  type="button"
                  className="rounded bg-primary px-2 py-0.5 font-semibold text-white hover:bg-primary-hover"
                  onClick={() => s.actions.forEach((a) => dispatch({ type: a.type, ...a }))}
                >
                  Apply
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
      {staff && (
        <section>
          <h3 className="text-xs font-bold uppercase tracking-wide text-charcoal/60">Person</h3>
          <div className="mt-2 text-xs">
            <div className="font-semibold">{staff.displayName}</div>
            <div className="text-charcoal/60">{staff.role} · {workedHours}h scheduled / {staff.standardHours}h standard</div>
            {staff.constraints.notes && <p className="mt-1 text-charcoal/70">{staff.constraints.notes}</p>}
          </div>
        </section>
      )}
      {!staff && (
        <section>
          <h3 className="text-xs font-bold uppercase tracking-wide text-charcoal/60">Rulebook</h3>
          <p className="mt-1 text-[11px] text-charcoal/50">
            Edit a rule and watch the week react — correct the rulebook, not just the schedule.
          </p>
          <ul className="mt-2 space-y-2">
            {state.rulebook.map((r) => (
              <li key={r.id} className="rounded border border-charcoal/10 bg-white/60 px-2 py-1.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{r.id}</span>
                  <span className="flex items-center gap-1">
                    <select
                      aria-label={`flexibility ${r.id}`} value={r.flexibility}
                      onChange={(e) => dispatch({ type: 'UPDATE_RULE', ruleId: r.id, patch: { flexibility: e.target.value } })}
                      className="rounded border border-charcoal/20 px-1 py-0.5 text-[11px]"
                    >
                      {['fixed', 'flexible', 'highlyFlexible'].map((f) => <option key={f} value={f}>{f}</option>)}
                    </select>
                    <input
                      type="checkbox" aria-label={`enable ${r.id}`} checked={!r.disabled}
                      onChange={(e) => dispatch({ type: 'UPDATE_RULE', ruleId: r.id, patch: { disabled: !e.target.checked || undefined } })}
                    />
                  </span>
                </div>
                <p className="mt-0.5 text-charcoal/60">{r.note}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </aside>
  );
}
```

In `src/ui/WeekBoard.jsx` — add imports, the editor bar, bench, dnd, and the rail. Full revised file:

```jsx
import React, { useMemo, useState } from 'react';
import { DndContext, useDraggable, useDroppable } from '@dnd-kit/core';
import { useScheduler } from '../state/SchedulerContext.jsx';
import { selectWeek } from '../state/store.js';
import { DAYS, dateForDay, fmtShort } from '../domain/calendar.js';
import { COVERAGE_ROLES } from '../domain/cells.js';
import { CellChip, VarianceBadge, RoleTag } from './chips.jsx';
import RailPanel from './RailPanel.jsx';

const EDIT_ROLES = ['VA', 'RVT', 'HSS', 'PHARM', 'ADMIN', 'MONITOR', 'PB'];

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

export function CoverageStrip({ coverage }) {
  return (
    <div className="glass-panel overflow-x-auto rounded-xl p-3">
      <table className="w-full text-xs">
        <thead>
          <tr>
            <th className="pr-2 text-left font-semibold">Coverage</th>
            {DAYS.map((d) => <th key={d} className="px-2 text-center font-semibold">{d}</th>)}
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
              <td key={d} className="px-2 py-1 text-center text-[10px] font-bold">{coverage.days[d].status}</td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function CellEditorBar({ selectedCell, weekId, roster, onClose }) {
  const { dispatch } = useScheduler();
  if (!selectedCell) return null;
  const staff = roster.find((s) => s.id === selectedCell.staffId);
  const set = (value) =>
    dispatch({ type: 'SET_OVERRIDE', weekId, staffId: selectedCell.staffId, day: selectedCell.day, value });
  return (
    <div className="no-print glass-panel flex flex-wrap items-center gap-2 rounded-xl p-2 text-xs">
      <span className="font-semibold">{staff.displayName} · {selectedCell.day}:</span>
      {EDIT_ROLES.map((role) => (
        <button key={role} type="button" onClick={() => set({ role })}
          className="rounded border border-primary/30 px-2 py-1 font-medium text-primary hover:bg-primary/10">
          {role}
        </button>
      ))}
      <button type="button" onClick={() => set('OFF')}
        className="rounded border border-danger/40 px-2 py-1 font-medium text-danger hover:bg-danger-soft">
        OFF
      </button>
      <button type="button"
        onClick={() => dispatch({ type: 'CLEAR_OVERRIDE', weekId, staffId: selectedCell.staffId, day: selectedCell.day })}
        className="rounded border border-charcoal/20 px-2 py-1 text-charcoal/70 hover:bg-charcoal/5">
        Clear override
      </button>
      <button type="button" onClick={onClose}
        className="ml-auto rounded px-2 py-1 text-charcoal/50 hover:bg-charcoal/5">
        Close
      </button>
    </div>
  );
}

export function BenchChip({ staff }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: staff.id });
  return (
    <span
      ref={setNodeRef} {...listeners} {...attributes}
      style={transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined}
      className="inline-flex cursor-grab items-center gap-1 rounded-full border border-charcoal/15 bg-white px-2 py-0.5 text-[11px] shadow-sm"
    >
      {staff.displayName} <RoleTag role={staff.role} />
    </span>
  );
}

export function GridCell({ staffId, day, cell, selected, onSelect }) {
  const { setNodeRef, isOver } = useDroppable({ id: `${staffId}|${day}`, disabled: Boolean(cell) });
  return (
    <td ref={setNodeRef} className={isOver ? 'bg-primary/10 px-1 py-1' : 'px-1 py-1'}>
      <CellChip cell={cell} selected={selected} onClick={onSelect} />
    </td>
  );
}

export default function WeekBoard() {
  const { state, dispatch } = useScheduler();
  const weekId = state.ui.selectedWeek;
  const evaluated = useMemo(() => selectWeek(state, weekId), [state, weekId]);
  const [selectedCell, setSelectedCell] = useState(null);
  const [benchOpen, setBenchOpen] = useState(false);

  const onDragEnd = ({ active, over }) => {
    if (!over) return;
    const [staffId, day] = String(over.id).split('|');
    if (staffId !== active.id) return; // a chip only lands on its own row
    const staff = state.roster.find((s) => s.id === staffId);
    dispatch({ type: 'SET_OVERRIDE', weekId, staffId, day, value: { role: staff.role } });
  };

  return (
    <DndContext onDragEnd={onDragEnd}>
      <div className="space-y-4 p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold">Week of {fmtShort(weekId)}</h2>
          <WeekPicker />
        </div>
        <CoverageStrip coverage={evaluated.coverage} />
        <CellEditorBar
          selectedCell={selectedCell} weekId={weekId} roster={state.roster}
          onClose={() => setSelectedCell(null)}
        />
        <div className="flex gap-4">
          <div className="grow overflow-x-auto rounded-xl border border-charcoal/10 bg-white">
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
                      <GridCell
                        key={day} staffId={staff.id} day={day}
                        cell={evaluated.built.cells[staff.id][day]}
                        selected={selectedCell?.staffId === staff.id && selectedCell?.day === day}
                        onSelect={() => setSelectedCell({ staffId: staff.id, day })}
                      />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <RailPanel evaluated={evaluated} selectedCell={selectedCell} weekId={weekId} />
        </div>
        <div className="no-print">
          <button type="button" onClick={() => setBenchOpen(!benchOpen)}
            className="rounded border border-charcoal/15 px-3 py-1 text-xs text-charcoal/70 hover:bg-primary/10">
            {benchOpen ? 'Hide bench' : 'Show bench'}
          </button>
          {benchOpen && (
            <div className="glass-panel mt-2 flex flex-wrap gap-2 rounded-xl p-3">
              {state.roster.map((s) => <BenchChip key={s.id} staff={s} />)}
            </div>
          )}
        </div>
      </div>
    </DndContext>
  );
}
```

(The Task 15 test still passes — `CoverageStrip` dropped its unused `targets` prop; update that call in the Task 15 test only if it referenced it, which it did not.)

- [ ] **Step 4: Run tests, then verify in the browser**

Run: `npx vitest run src/ui`
Expected: PASS — both WeekBoard test files.

Browser check (launch config `wcah-scheduler`): click Prado's Tue chip → OFF → red coverage cell + hard violation in rail → Apply the first suggestion → strip returns to ON TARGET. Drag a bench chip onto that person's empty cell → chip lands.

- [ ] **Step 5: Commit**

```bash
git add src/ui
git commit -m "feat(ui): cell editing, violation rail with one-click repairs, bench drag"
```

---

