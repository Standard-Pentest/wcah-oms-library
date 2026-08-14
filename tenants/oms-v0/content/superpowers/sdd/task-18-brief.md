### Task 18: Month Dashboard

**Files:**
- Create: `src/ui/Dashboard.jsx`
- Modify: `src/ui/App.jsx` (replace the `dashboard` registry entry's Component with `Dashboard`; keep `MonthGlance` exported or delete it and its import — delete is cleaner; remove its code entirely)
- Test: `src/ui/Dashboard.test.jsx`

**Interfaces:**
- Consumes: `selectMonth`, `selectDecisionQueue`, `selectWeek`, reducer actions `DECIDE_REQUEST`, `SELECT_WEEK`, `SET_SCREEN`, `ADVANCE_HORIZON`.
- Produces: `Dashboard` (default export) on the `coast-bg` dark surface with `coast-panel` cards: four week cards (gaps/hard/soft/published/provisional; click → selects that week and jumps to the board), the **decision queue** (pending requests first-submitted first, each with classification, dates, measured impact of granting, Grant/Deny buttons), month metric tiles (weekend equity gini as `Equity 0.31`, total gaps, under-hours list from `hours` rows with negative delta), and an `Advance horizon` button.

- [ ] **Step 1: Write the failing test**

`src/ui/Dashboard.test.jsx`:

```jsx
// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { SchedulerProvider } from '../state/SchedulerContext.jsx';
import { createMemoryStore } from '../state/persistence.js';
import { Shell } from './App.jsx';

function mount() {
  return render(
    <SchedulerProvider store={createMemoryStore()}>
      <Shell />
    </SchedulerProvider>
  );
}

describe('dashboard', () => {
  it('lists pending requests first-submitted first with impact', async () => {
    mount();
    const queue = await screen.findByTestId('decision-queue');
    const items = within(queue).getAllByRole('listitem');
    expect(items[0].textContent).toContain('Pearl, Leanne');
    expect(items[1].textContent).toContain('Rodriguez, Glenda');
    expect(items[0].textContent).toMatch(/\+\d+ gap/);
  });
  it('grants a request from the queue', async () => {
    mount();
    const queue = await screen.findByTestId('decision-queue');
    fireEvent.click(within(queue).getAllByRole('button', { name: 'Grant' })[0]);
    expect(within(queue).queryByText(/Pearl, Leanne/)).toBeNull();
  });
  it('jumps to the week board from a week card', async () => {
    mount();
    fireEvent.click(await screen.findByTestId('week-card-2026-08-09'));
    expect(await screen.findByText('Week of Aug 9')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/Dashboard.test.jsx`
Expected: FAIL — no decision-queue test id.

- [ ] **Step 3: Implement**

`src/ui/Dashboard.jsx`:

```jsx
import React from 'react';
import { useScheduler } from '../state/SchedulerContext.jsx';
import { selectMonth, selectDecisionQueue } from '../state/store.js';
import { classifyRequest } from '../domain/timeoff.js';
import { fmtShort } from '../domain/calendar.js';

function Tile({ label, value }) {
  return (
    <div className="coast-panel p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-white/60">{label}</div>
      <div className="mt-1 text-2xl font-bold text-coast-accent">{value}</div>
    </div>
  );
}

export default function Dashboard() {
  const { state, dispatch } = useScheduler();
  const month = selectMonth(state);
  const queue = selectDecisionQueue(state);
  const under = month.hours.filter((h) => h.delta < 0);

  return (
    <div className="coast-bg min-h-screen space-y-6 p-6 text-white">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile label="Month gaps" value={month.totalShort} />
        <Tile label="Weekend equity (gini)" value={month.equity.gini.toFixed(2)} />
        <Tile label="Under hours" value={under.length} />
        <Tile label="Pending decisions" value={queue.length} />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {month.perWeek.map((w) => (
          <button
            key={w.weekId} type="button" data-testid={`week-card-${w.weekId}`}
            onClick={() => {
              dispatch({ type: 'SELECT_WEEK', weekId: w.weekId });
              dispatch({ type: 'SET_SCREEN', screen: 'board' });
            }}
            className="coast-panel p-4 text-left transition hover:bg-white/15"
          >
            <div className="text-sm font-bold">Week of {fmtShort(w.weekId)}</div>
            <div className="mt-2 text-xs text-white/70">
              {w.short} gaps · {w.hard} hard · {w.soft} soft
            </div>
            <div className="mt-1 flex gap-2 text-[10px] font-semibold">
              {w.provisional && <span className="rounded bg-amber-soft px-1.5 py-0.5 text-amber-text">provisional</span>}
              {w.published && <span className="rounded bg-success px-1.5 py-0.5 text-success-text">published</span>}
            </div>
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="coast-panel p-4" data-testid="decision-queue">
          <h3 className="text-xs font-bold uppercase tracking-wide text-white/60">
            Decision queue — first submitted wins
          </h3>
          {queue.length === 0 && <p className="mt-2 text-xs text-white/50">Nothing pending.</p>}
          <ul className="mt-2 space-y-2">
            {queue.map(({ request, impact }) => (
              <li key={request.id} className="rounded-lg bg-white/10 p-2 text-xs">
                <div className="font-semibold">
                  {request.employeeName} — {classifyRequest(request)} · {fmtShort(request.startDate)}
                  {request.days > 1 ? ` ×${request.days}d` : ''}
                </div>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-white/60">
                    submitted {request.submittedAt.slice(0, 10)} ·
                    {impact.shortDelta > 0 ? ` +${impact.shortDelta} gap(s) if granted` : ' no coverage cost'}
                    {impact.hardDelta > 0 ? ` · +${impact.hardDelta} hard` : ''}
                  </span>
                  <span className="flex gap-1">
                    <button type="button"
                      onClick={() => dispatch({ type: 'DECIDE_REQUEST', requestId: request.id, decision: 'granted' })}
                      className="rounded bg-coast-accent px-2 py-0.5 font-bold text-coast-deep">
                      Grant
                    </button>
                    <button type="button"
                      onClick={() => dispatch({ type: 'DECIDE_REQUEST', requestId: request.id, decision: 'denied' })}
                      className="rounded bg-white/20 px-2 py-0.5 font-semibold">
                      Deny
                    </button>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="coast-panel p-4">
          <h3 className="text-xs font-bold uppercase tracking-wide text-white/60">Hours vs standard</h3>
          {under.length === 0 && <p className="mt-2 text-xs text-white/50">Everyone is at standard.</p>}
          <ul className="mt-2 space-y-1 text-xs">
            {under.map((h) => (
              <li key={h.staffId} className="flex justify-between">
                <span>{h.displayName}</span>
                <span className="font-semibold text-coast-accent-soft">{h.delta}h</span>
              </li>
            ))}
          </ul>
          <button type="button"
            onClick={() => dispatch({ type: 'ADVANCE_HORIZON' })}
            className="mt-4 rounded bg-white/15 px-3 py-1 text-xs font-semibold hover:bg-white/25">
            Advance horizon →
          </button>
        </section>
      </div>
    </div>
  );
}
```

In `src/ui/App.jsx`: import `Dashboard from './Dashboard.jsx'`, set it as the `dashboard` entry's Component, and delete the `MonthGlance` component (its shell duty is done). Update `App.test.jsx`'s week assertions to match the new cards (`Week of Aug 2` text remains on the cards, so the existing assertions keep passing).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/ui`
Expected: PASS — all UI tests including the updated shell test.

- [ ] **Step 5: Commit**

```bash
git add src/ui
git commit -m "feat(ui): Coastal Glass month dashboard with decision queue and metrics"
```

---

