### Task 21: Publish — CSV, print, JSON backup

**Files:**
- Create: `src/ui/exporters.js`, `src/ui/PublishScreen.jsx`
- Modify: `src/ui/App.jsx` (add `{ key: 'publish', label: 'Publish', Component: PublishScreen }`)
- Test: `src/ui/exporters.test.js`, `src/ui/PublishScreen.test.jsx`

**Interfaces:**
- Consumes: `selectWeek`, `serialize`/`deserialize` (Task 13), `PUBLISH_WEEK`, `REPLACE_STATE`.
- Produces:
  - `weekCsv(roster, built) → string` — header `Employee (Paylocity),Sun,…,Sat`, one row per staff in roster order, cells are `formatCell` output, CSV-quoted. **Keyed by Paylocity name** — the manual-entry publish target.
  - `PublishScreen` — week picker; an always-visible print-friendly schedule table (this is what `window.print()` prints — everything else is `no-print`); buttons: `Download CSV`, `Print`, `Mark published`, `Export JSON backup`, and an `Import JSON backup` file input that `window.confirm`s before `REPLACE_STATE` (a bad file shows the error message, never half-applies).

- [ ] **Step 1: Write the failing tests**

`src/ui/exporters.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { weekCsv } from './exporters.js';
import { buildWeek } from '../domain/build.js';
import { SEED_ROSTER } from '../data/roster.js';
import { WEEK_AUG02, REQUESTS_AUG02 } from '../data/week-aug02.js';

describe('weekCsv', () => {
  it('emits Paylocity-keyed rows matching the built week', () => {
    const built = buildWeek({ roster: SEED_ROSTER, week: WEEK_AUG02, requests: REQUESTS_AUG02 });
    const lines = weekCsv(SEED_ROSTER, built).split('\n');
    expect(lines[0]).toBe('Employee (Paylocity),Sun,Mon,Tue,Wed,Thu,Fri,Sat');
    expect(lines).toHaveLength(29); // header + 28 staff
    const gardner = lines.find((l) => l.startsWith('"Gardner')); // names contain commas → quoted
    expect(gardner).toContain('UNPAID OFF');
    expect(gardner).toContain('RVT (7:30–4:30)');
  });
});
```

`src/ui/PublishScreen.test.jsx`:

```jsx
// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SchedulerProvider } from '../state/SchedulerContext.jsx';
import { createMemoryStore } from '../state/persistence.js';
import PublishScreen from './PublishScreen.jsx';

describe('publish screen', () => {
  it('shows the printable grid and marks the week published', async () => {
    render(
      <SchedulerProvider store={createMemoryStore()}>
        <PublishScreen />
      </SchedulerProvider>
    );
    expect(await screen.findByText('Gardner, Theresa')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Mark published' }));
    expect(screen.getByText('published')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/ui/exporters.test.js src/ui/PublishScreen.test.jsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`src/ui/exporters.js`:

```js
import { DAYS } from '../domain/calendar.js';
import { formatCell } from '../domain/cells.js';

function esc(value) {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** One week as CSV for manual entry into Paylocity. */
export function weekCsv(roster, built) {
  const header = ['Employee (Paylocity)', ...DAYS].join(',');
  const rows = roster.map((s) =>
    [esc(s.paylocityName), ...DAYS.map((d) => esc(formatCell(built.cells[s.id][d])))].join(',')
  );
  return [header, ...rows].join('\n');
}
```

`src/ui/PublishScreen.jsx`:

```jsx
import React, { useMemo, useRef, useState } from 'react';
import { useScheduler } from '../state/SchedulerContext.jsx';
import { selectWeek } from '../state/store.js';
import { serialize, deserialize } from '../state/persistence.js';
import { DAYS, dateForDay, fmtShort } from '../domain/calendar.js';
import { formatCell } from '../domain/cells.js';
import { weekCsv } from './exporters.js';
import { WeekPicker } from './WeekBoard.jsx';

function download(filename, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function PublishScreen() {
  const { state, dispatch } = useScheduler();
  const weekId = state.ui.selectedWeek;
  const { week, built } = useMemo(() => selectWeek(state, weekId), [state, weekId]);
  const fileRef = useRef(null);
  const [importError, setImportError] = useState(null);

  const onImportFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);
    try {
      const restored = deserialize(await file.text());
      if (window.confirm('Replace ALL current data with this backup?')) {
        dispatch({ type: 'REPLACE_STATE', state: restored });
      }
    } catch (err) {
      setImportError(err.message);
    } finally {
      e.target.value = '';
    }
  };

  return (
    <div className="space-y-4 p-6">
      <div className="no-print flex flex-wrap items-center gap-3">
        <h2 className="text-base font-bold">Publish — Week of {fmtShort(weekId)}</h2>
        <WeekPicker />
        {week.status === 'published' && (
          <span className="rounded bg-success px-2 py-0.5 text-xs font-semibold text-success-text">published</span>
        )}
      </div>
      <div className="no-print flex flex-wrap gap-2 text-sm">
        <button type="button"
          onClick={() => download(`wcah-week-${weekId}.csv`, weekCsv(state.roster, built), 'text/csv')}
          className="rounded bg-primary px-3 py-1.5 font-semibold text-white hover:bg-primary-hover">
          Download CSV
        </button>
        <button type="button" onClick={() => window.print()}
          className="rounded border border-primary/40 px-3 py-1.5 font-semibold text-primary hover:bg-primary/10">
          Print
        </button>
        <button type="button" onClick={() => dispatch({ type: 'PUBLISH_WEEK', weekId })}
          className="rounded border border-primary/40 px-3 py-1.5 font-semibold text-primary hover:bg-primary/10">
          Mark published
        </button>
        <button type="button"
          onClick={() => download('wcah-scheduler-backup.json', serialize(state), 'application/json')}
          className="rounded border border-charcoal/20 px-3 py-1.5 text-charcoal/70 hover:bg-charcoal/5">
          Export JSON backup
        </button>
        <button type="button" onClick={() => fileRef.current?.click()}
          className="rounded border border-charcoal/20 px-3 py-1.5 text-charcoal/70 hover:bg-charcoal/5">
          Import JSON backup
        </button>
        <input ref={fileRef} type="file" accept="application/json" onChange={onImportFile} className="hidden" />
      </div>
      {importError && <div className="no-print rounded bg-danger-soft px-3 py-2 text-sm text-danger">{importError}</div>}
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b-2 border-charcoal/30">
            <th className="py-1 pr-2 text-left">Employee</th>
            {DAYS.map((d) => (
              <th key={d} className="px-2 py-1 text-center">{d} {fmtShort(dateForDay(weekId, d))}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {state.roster.map((s) => (
            <tr key={s.id} className="border-b border-charcoal/10">
              <td className="py-1 pr-2 font-medium">{s.displayName}</td>
              {DAYS.map((d) => (
                <td key={d} className="px-2 py-1 text-center">{formatCell(built.cells[s.id][d])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

Register in `App.jsx` `SCREENS`: `{ key: 'publish', label: 'Publish', Component: PublishScreen }`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/ui/exporters.test.js src/ui/PublishScreen.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui
git commit -m "feat(ui): publish screen — CSV export, print grid, JSON backup/restore"
```

---

