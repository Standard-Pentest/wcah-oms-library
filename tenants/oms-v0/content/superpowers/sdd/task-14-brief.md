### Task 14: Provider, shell, chips

**Files:**
- Create: `src/state/SchedulerContext.jsx`, `src/ui/chips.jsx`, `.claude/launch.json`
- Modify: `src/ui/App.jsx` (replace the Task 1 stub)
- Test: `src/ui/App.test.jsx`

**Interfaces:**
- Consumes: `reducer`, `seedState`, `selectMonth` (Task 12); `createIdbStore`, `createMemoryStore` (Task 13).
- Produces:
  - `SchedulerProvider({store, children})` + `useScheduler() → {state, dispatch, storeStatus}` — loads saved state (else seeds), debounce-autosaves every change, `storeStatus: 'loading'|'ok'|'error'|'version-mismatch'`
  - `Shell` (exported from `App.jsx` for tests) — nav + screen switch driven by `state.ui.screen` and a module-scope `SCREENS` registry that later tasks extend
  - `CellChip({cell, onClick, selected})`, `VarianceBadge({variance})`, `RoleTag({role})` from `chips.jsx`
  - `MonthGlance` — minimal real month view (per-week short/hard tiles from `selectMonth`); Task 18's Dashboard replaces its registry entry

- [ ] **Step 1: Write the failing test**

`src/ui/App.test.jsx`:

```jsx
// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SchedulerProvider } from '../state/SchedulerContext.jsx';
import { createMemoryStore } from '../state/persistence.js';
import { Shell } from './App.jsx';

describe('app shell', () => {
  it('boots from seed, shows the horizon weeks', async () => {
    render(
      <SchedulerProvider store={createMemoryStore()}>
        <Shell />
      </SchedulerProvider>
    );
    expect(await screen.findByText('WCAH Scheduler')).toBeTruthy();
    expect(await screen.findByText(/Week of Aug 2/)).toBeTruthy();
    expect(screen.getByText(/Week of Aug 23/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/App.test.jsx`
Expected: FAIL — `Cannot find module '../state/SchedulerContext.jsx'`.

- [ ] **Step 3: Implement**

`src/state/SchedulerContext.jsx`:

```jsx
import React, { createContext, useContext, useEffect, useReducer, useState } from 'react';
import { reducer, seedState } from './store.js';

const Ctx = createContext(null);

export function SchedulerProvider({ store, children }) {
  const [state, dispatch] = useReducer(reducer, null);
  const [storeStatus, setStoreStatus] = useState('loading');

  useEffect(() => {
    let alive = true;
    store
      .load()
      .then((saved) => {
        if (!alive) return;
        dispatch({ type: 'REPLACE_STATE', state: saved ?? seedState() });
        setStoreStatus('ok');
      })
      .catch((err) => {
        if (!alive) return;
        dispatch({ type: 'REPLACE_STATE', state: seedState() });
        setStoreStatus(err?.code === 'version-mismatch' ? 'version-mismatch' : 'error');
      });
    return () => { alive = false; };
  }, [store]);

  useEffect(() => {
    if (!state) return;
    const t = setTimeout(() => {
      store.save(state).catch(() => setStoreStatus('error'));
    }, 300);
    return () => clearTimeout(t);
  }, [state, store]);

  if (!state) return <div className="p-8 text-sm text-charcoal/60">Loading…</div>;
  return <Ctx.Provider value={{ state, dispatch, storeStatus }}>{children}</Ctx.Provider>;
}

export function useScheduler() {
  const value = useContext(Ctx);
  if (!value) throw new Error('useScheduler must be used inside SchedulerProvider');
  return value;
}
```

`src/ui/chips.jsx`:

```jsx
import React from 'react';
import clsx from 'clsx';
import { formatCell } from '../domain/cells.js';

const ROLE_STYLES = {
  VA: 'bg-primary/10 text-primary border-primary/30',
  MONITOR: 'bg-primary/10 text-primary border-primary/30',
  RVT: 'bg-accent/15 text-accent border-accent/30',
  HSS: 'bg-success text-success-text border-success-text/20',
  PHARM: 'bg-amber-soft text-amber-text border-amber-text/30',
  ADMIN: 'bg-charcoal/10 text-charcoal border-charcoal/20',
  PB: 'bg-charcoal/10 text-charcoal border-charcoal/20',
  TECH_NC: 'bg-charcoal/10 text-charcoal border-charcoal/20',
};

export function RoleTag({ role }) {
  return (
    <span className={clsx('rounded border px-1.5 py-0.5 text-[10px] font-semibold', ROLE_STYLES[role])}>
      {role}
    </span>
  );
}

export function CellChip({ cell, onClick, selected }) {
  if (!cell) {
    return (
      <button
        type="button" onClick={onClick} aria-label="empty slot"
        className="h-8 w-full rounded border border-dashed border-charcoal/15 text-xs text-charcoal/25 hover:border-primary/50"
      >
        ·
      </button>
    );
  }
  const style =
    cell.kind === 'off'
      ? 'bg-charcoal/5 italic text-charcoal/50 border-charcoal/15'
      : ROLE_STYLES[cell.role];
  return (
    <button
      type="button" onClick={onClick}
      className={clsx(
        'h-8 w-full truncate rounded border px-1 text-xs font-medium',
        style, selected && 'ring-2 ring-primary'
      )}
      title={formatCell(cell)}
    >
      {formatCell(cell)}
    </button>
  );
}

export function VarianceBadge({ variance }) {
  const style =
    variance < 0
      ? 'bg-danger-soft text-danger'
      : variance > 0
        ? 'bg-amber-soft text-amber-text'
        : 'bg-success text-success-text';
  const text = variance > 0 ? `+${variance}` : `${variance}`;
  return <span className={clsx('rounded px-1.5 py-0.5 text-[11px] font-semibold', style)}>{text}</span>;
}
```

`src/ui/App.jsx` (replaces the Task 1 stub):

```jsx
import React from 'react';
import { SchedulerProvider, useScheduler } from '../state/SchedulerContext.jsx';
import { createIdbStore } from '../state/persistence.js';
import { selectMonth } from '../state/store.js';
import { fmtShort } from '../domain/calendar.js';

const appStore = createIdbStore();

/** Screen registry — later tasks replace/extend entries. */
const SCREENS = [{ key: 'dashboard', label: 'Dashboard', Component: MonthGlance }];

export function MonthGlance() {
  const { state } = useScheduler();
  const month = selectMonth(state);
  return (
    <div className="grid grid-cols-2 gap-4 p-6 lg:grid-cols-4">
      {month.perWeek.map((w) => (
        <div key={w.weekId} className="glass-panel rounded-xl p-4">
          <div className="text-sm font-semibold">Week of {fmtShort(w.weekId)}</div>
          <div className="mt-2 text-xs text-charcoal/70">
            {w.short} gaps · {w.hard} hard · {w.soft} soft
          </div>
          {w.provisional && (
            <div className="mt-1 text-[11px] text-amber-text">rotations unconfirmed</div>
          )}
        </div>
      ))}
    </div>
  );
}

function StorageBanner() {
  const { storeStatus } = useScheduler();
  if (storeStatus === 'ok' || storeStatus === 'loading') return null;
  const message =
    storeStatus === 'version-mismatch'
      ? 'Saved data is from an incompatible version — running from seed. Export JSON before making changes.'
      : 'Browser storage is unavailable — changes will NOT survive a reload. Export JSON to back up.';
  return <div className="bg-danger-soft px-4 py-2 text-sm text-danger no-print">{message}</div>;
}

export function Shell() {
  const { state, dispatch } = useScheduler();
  const Active = (SCREENS.find((s) => s.key === state.ui.screen) ?? SCREENS[0]).Component;
  return (
    <div className="min-h-screen">
      <StorageBanner />
      <header className="no-print flex items-center gap-6 border-b border-charcoal/10 bg-glass-strong px-6 py-3 backdrop-blur-md">
        <h1 className="text-lg font-bold text-primary">WCAH Scheduler</h1>
        <nav className="flex gap-1">
          {SCREENS.map((s) => (
            <button
              key={s.key} type="button"
              onClick={() => dispatch({ type: 'SET_SCREEN', screen: s.key })}
              className={
                state.ui.screen === s.key
                  ? 'rounded bg-primary px-3 py-1.5 text-sm font-medium text-white'
                  : 'rounded px-3 py-1.5 text-sm text-charcoal/70 hover:bg-primary/10'
              }
            >
              {s.label}
            </button>
          ))}
        </nav>
      </header>
      <main>
        <Active />
      </main>
    </div>
  );
}

export default function App() {
  return (
    <SchedulerProvider store={appStore}>
      <Shell />
    </SchedulerProvider>
  );
}
```

`.claude/launch.json`:

```json
{
  "version": "0.0.1",
  "configurations": [
    {
      "name": "wcah-scheduler",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "dev"],
      "port": 5174
    }
  ]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ui/App.test.jsx`
Expected: PASS — 1 test. Then run the whole suite: `npx vitest run` — everything green.

- [ ] **Step 5: Commit**

```bash
git add src/state/SchedulerContext.jsx src/ui .claude/launch.json
git commit -m "feat(ui): provider with autosave, app shell, chips, month glance"
```

---

