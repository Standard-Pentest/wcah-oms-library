### Task 17: Week Setup panel

**Files:**
- Create: `src/ui/WeekSetupPanel.jsx`
- Modify: `src/ui/WeekBoard.jsx` (render `<WeekSetupPanel weekId={weekId} />` between the header row and `CoverageStrip`)
- Test: `src/ui/WeekSetupPanel.test.jsx`

**Interfaces:**
- Consumes: reducer actions `SET_DVM_COUNT`, `SET_TOGGLE`, `CONFIRM_TOGGLES`.
- Produces: `WeekSetupPanel({weekId})` — collapsible panel: a DVM-count number input per day (changing one recomputes VA targets live via the existing selectors), the week's rotation toggle rows (staff · day · role, ON/OFF buttons), a provisional badge until `Confirm rotations` is clicked.

- [ ] **Step 1: Write the failing test**

`src/ui/WeekSetupPanel.test.jsx`:

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

describe('week setup', () => {
  it('changes a DVM count and the VA target follows', async () => {
    mount();
    await screen.findByText('Gardner, Theresa');
    fireEvent.click(screen.getByRole('button', { name: /Week Setup/ }));
    const mon = screen.getByLabelText('DVMs Mon');
    fireEvent.change(mon, { target: { value: '4' } });
    expect(screen.getByText('12/10')).toBeTruthy(); // 12 scheduled vs new target 10 on Mon
  });
  it('confirms rotations on a provisional week', async () => {
    mount();
    await screen.findByText('Gardner, Theresa');
    fireEvent.click(screen.getByText('Aug 9')); // week 2 is provisional
    fireEvent.click(screen.getByRole('button', { name: /Week Setup/ }));
    expect(screen.getByText(/rotations unconfirmed/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm rotations' }));
    expect(screen.queryByText(/rotations unconfirmed/i)).toBeNull();
  });
  it('flips a toggle and the grid reacts', async () => {
    mount();
    await screen.findByText('Gardner, Theresa');
    fireEvent.click(screen.getByRole('button', { name: /Week Setup/ }));
    const bree = screen.getByText('Willis, Bree · Sun · HSS').closest('li');
    fireEvent.click(within(bree).getByRole('button', { name: 'ON' }));
    const row = screen.getByText('Willis, Bree').closest('tr');
    expect(within(row).getByText('HSS')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/WeekSetupPanel.test.jsx`
Expected: FAIL — no Week Setup button.

- [ ] **Step 3: Implement**

`src/ui/WeekSetupPanel.jsx`:

```jsx
import React, { useState } from 'react';
import { useScheduler } from '../state/SchedulerContext.jsx';
import { DAYS } from '../domain/calendar.js';

export default function WeekSetupPanel({ weekId }) {
  const { state, dispatch } = useScheduler();
  const [open, setOpen] = useState(false);
  const week = state.weeks[weekId];
  const staffName = (id) => state.roster.find((s) => s.id === id)?.displayName ?? id;
  const toggles = [...week.toggleStates].sort((a, b) =>
    `${staffName(a.staffId)}|${a.day}`.localeCompare(`${staffName(b.staffId)}|${b.day}`)
  );

  return (
    <div className="no-print glass-panel rounded-xl p-3">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => setOpen(!open)}
          className="rounded bg-primary/10 px-3 py-1 text-xs font-semibold text-primary hover:bg-primary/20">
          Week Setup {open ? '▴' : '▾'}
        </button>
        {!week.toggleConfirmed && (
          <span className="rounded bg-amber-soft px-2 py-0.5 text-[11px] font-semibold text-amber-text">
            rotations unconfirmed
          </span>
        )}
      </div>
      {open && (
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wide text-charcoal/60">DVMs per day</h4>
            <div className="mt-2 flex gap-2">
              {DAYS.map((d) => (
                <label key={d} className="text-center text-[11px] font-medium">
                  {d}
                  <input
                    type="number" min="0" max="9" aria-label={`DVMs ${d}`}
                    value={week.dvmCounts[d]}
                    onChange={(e) =>
                      dispatch({ type: 'SET_DVM_COUNT', weekId, day: d, count: Number(e.target.value) })
                    }
                    className="mt-1 block w-12 rounded border border-charcoal/20 px-1 py-0.5 text-center text-xs"
                  />
                </label>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-charcoal/50">
              Weekday VA target = (2 × DVMs) + 2 · Weekend = (2 × DVMs) + 1
            </p>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wide text-charcoal/60">Rotation toggles</h4>
              <button type="button"
                onClick={() => dispatch({ type: 'CONFIRM_TOGGLES', weekId })}
                className="rounded bg-primary px-2 py-1 text-[11px] font-semibold text-white hover:bg-primary-hover">
                Confirm rotations
              </button>
            </div>
            <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto">
              {toggles.map((t) => (
                <li key={`${t.staffId}|${t.day}`} className="flex items-center justify-between gap-2 text-xs">
                  <span>{staffName(t.staffId)} · {t.day} · {t.role}</span>
                  <span className="flex gap-1">
                    {['ON', 'OFF'].map((s) => (
                      <button key={s} type="button"
                        onClick={() =>
                          dispatch({ type: 'SET_TOGGLE', weekId, staffId: t.staffId, day: t.day, role: t.role, state: s })
                        }
                        className={
                          t.state === s
                            ? 'rounded bg-primary px-2 py-0.5 text-[11px] font-bold text-white'
                            : 'rounded border border-charcoal/20 px-2 py-0.5 text-[11px] text-charcoal/60'
                        }
                      >
                        {s}
                      </button>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
```

In `WeekBoard.jsx`, import it and render `<WeekSetupPanel weekId={weekId} />` directly after the header row (before `CoverageStrip`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/ui`
Expected: PASS — all UI test files.

- [ ] **Step 5: Commit**

```bash
git add src/ui
git commit -m "feat(ui): week setup panel — DVM counts and rotation confirmation"
```

---

