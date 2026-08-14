### Task 20: Roster screen

**Files:**
- Create: `src/ui/RosterScreen.jsx`
- Modify: `src/ui/App.jsx` (add `{ key: 'roster', label: 'Roster', Component: RosterScreen }`)
- Test: `src/ui/RosterScreen.test.jsx`

**Interfaces:**
- Consumes: `parseRosterPaste` (Task 19), reducer `UPSERT_STAFF`, `REMOVE_STAFF`, `SET_PULL_ORDER`.
- Produces: `RosterScreen` — roster table (name, Paylocity name, role, standard hours, pattern summary like `Mon Tue Wed · 3d`, notes); clicking a row opens `StaffEditor` (module scope) below it: per-day role `<select>` (empty option = day off; changing a day replaces that day's cell with a plain `shift(role)` — time notes survive only on untouched days), standard-hours input, notes input, day checkboxes for `noDays` and `fixedDays`, `maxDaysPerWeek` input, consecutive-off-exempt checkbox, Save (`UPSERT_STAFF`) / Remove (`REMOVE_STAFF` after `window.confirm`). Sidebar: **Pull Order** list with ↑ buttons (`SET_PULL_ORDER`), **Rotations** panel (every rotation: staff · day · role, cadence `<select>`, anchor date input, remove button — dispatching `UPSERT_ROTATION`/`REMOVE_ROTATION`; linked effects stay data-only and say so), and a **Paste roster rows** box (parse → issues list → `Apply` upserts each record).

- [ ] **Step 1: Write the failing test**

`src/ui/RosterScreen.test.jsx`:

```jsx
// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { SchedulerProvider } from '../state/SchedulerContext.jsx';
import { createMemoryStore } from '../state/persistence.js';
import RosterScreen from './RosterScreen.jsx';

function mount() {
  return render(
    <SchedulerProvider store={createMemoryStore()}>
      <RosterScreen />
    </SchedulerProvider>
  );
}

describe('roster screen', () => {
  it('lists all 28 staff', async () => {
    mount();
    expect(await screen.findByText('Alonzo, Evelyn')).toBeTruthy();
    expect(screen.getAllByTestId('roster-row')).toHaveLength(28);
  });
  it('edits a pattern day and saves', async () => {
    mount();
    fireEvent.click(await screen.findByText('Alonzo, Evelyn'));
    fireEvent.change(screen.getByLabelText('Pattern Mon'), { target: { value: 'VA' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    const row = screen.getByText('Alonzo, Evelyn').closest('tr');
    expect(within(row).getByText(/Mon/)).toBeTruthy();
  });
  it('moves a pull-order entry up', async () => {
    mount();
    const list = await screen.findByTestId('pull-order');
    const before = within(list).getAllByRole('listitem').map((li) => li.textContent);
    expect(before[0]).toContain('Gallegos');
    fireEvent.click(within(list).getAllByRole('button', { name: '↑' })[1]); // move #2 up
    const after = within(list).getAllByRole('listitem').map((li) => li.textContent);
    expect(after[0]).toContain('Sharko');
    expect(after[1]).toContain('Gallegos');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/RosterScreen.test.jsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/ui/RosterScreen.jsx`:

```jsx
import React, { useState } from 'react';
import { useScheduler } from '../state/SchedulerContext.jsx';
import { DAYS } from '../domain/calendar.js';
import { shift, ALL_ROLES } from '../domain/cells.js';
import { parseRosterPaste } from '../import/roster-paste.js';
import { RoleTag } from './chips.jsx';

function patternSummary(staff) {
  const days = DAYS.filter((d) => staff.pattern[d]);
  return days.length ? `${days.join(' ')} · ${days.length}d` : '—';
}

export function StaffEditor({ staff, onDone }) {
  const { dispatch } = useScheduler();
  const [draft, setDraft] = useState(structuredClone(staff));
  const c = draft.constraints;
  const setDay = (day, role) =>
    setDraft((d) => {
      const pattern = { ...d.pattern };
      if (role) pattern[day] = shift(role);
      else delete pattern[day];
      return { ...d, pattern };
    });
  const toggleDayList = (key, day) =>
    setDraft((d) => {
      const list = new Set(d.constraints[key] ?? []);
      list.has(day) ? list.delete(day) : list.add(day);
      const constraints = { ...d.constraints, [key]: list.size ? [...list] : undefined };
      return { ...d, constraints };
    });

  return (
    <div className="glass-panel space-y-3 rounded-xl p-4 text-xs">
      <div className="font-bold">{draft.displayName}</div>
      <div className="flex flex-wrap gap-2">
        {DAYS.map((day) => (
          <label key={day} className="text-center font-medium">
            {day}
            <select
              aria-label={`Pattern ${day}`} value={draft.pattern[day]?.role ?? ''}
              onChange={(e) => setDay(day, e.target.value)}
              className="mt-1 block rounded border border-charcoal/20 px-1 py-0.5"
            >
              <option value="">—</option>
              {ALL_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <label>Standard hours{' '}
          <input type="number" value={draft.standardHours}
            onChange={(e) => setDraft({ ...draft, standardHours: Number(e.target.value) })}
            className="w-16 rounded border border-charcoal/20 px-1 py-0.5" />
        </label>
        <label>Max days/wk{' '}
          <input type="number" value={c.maxDaysPerWeek ?? ''}
            onChange={(e) => setDraft({ ...draft, constraints: { ...c, maxDaysPerWeek: e.target.value ? Number(e.target.value) : undefined } })}
            className="w-14 rounded border border-charcoal/20 px-1 py-0.5" />
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={Boolean(c.consecutiveOffExempt)}
            onChange={(e) => setDraft({ ...draft, constraints: { ...c, consecutiveOffExempt: e.target.checked || undefined } })} />
          exempt from consecutive-off
        </label>
      </div>
      {['noDays', 'fixedDays'].map((key) => (
        <div key={key} className="flex items-center gap-2">
          <span className="w-20 font-semibold">{key === 'noDays' ? 'Never works' : 'Fixed days'}</span>
          {DAYS.map((day) => (
            <label key={day} className="flex items-center gap-0.5">
              <input type="checkbox" checked={c[key]?.includes(day) ?? false}
                onChange={() => toggleDayList(key, day)} />
              {day}
            </label>
          ))}
        </div>
      ))}
      <label className="block">Notes{' '}
        <input type="text" value={c.notes ?? ''}
          onChange={(e) => setDraft({ ...draft, constraints: { ...c, notes: e.target.value || undefined } })}
          className="w-full rounded border border-charcoal/20 px-2 py-1" />
      </label>
      <div className="flex gap-2">
        <button type="button" onClick={() => { dispatch({ type: 'UPSERT_STAFF', staff: draft }); onDone(); }}
          className="rounded bg-primary px-3 py-1 font-semibold text-white hover:bg-primary-hover">Save</button>
        <button type="button"
          onClick={() => { if (window.confirm(`Remove ${draft.displayName} from the roster?`)) { dispatch({ type: 'REMOVE_STAFF', staffId: draft.id }); onDone(); } }}
          className="rounded border border-danger/40 px-3 py-1 font-semibold text-danger hover:bg-danger-soft">Remove</button>
        <button type="button" onClick={onDone} className="rounded px-3 py-1 text-charcoal/60">Cancel</button>
      </div>
    </div>
  );
}

export function PullOrderPanel() {
  const { state, dispatch } = useScheduler();
  const name = (id) => state.roster.find((s) => s.id === id)?.displayName ?? id;
  const moveUp = (i) => {
    if (i === 0) return;
    const order = [...state.pullOrder];
    [order[i - 1], order[i]] = [order[i], order[i - 1]];
    dispatch({ type: 'SET_PULL_ORDER', order });
  };
  return (
    <div className="glass-panel rounded-xl p-4" data-testid="pull-order">
      <h3 className="text-xs font-bold uppercase tracking-wide text-charcoal/60">RVT→VA Pull Order</h3>
      <ol className="mt-2 space-y-1 text-xs">
        {state.pullOrder.map((id, i) => (
          <li key={id} className="flex items-center justify-between">
            <span>{i + 1}. {name(id)}</span>
            <button type="button" onClick={() => moveUp(i)} aria-label="↑"
              className="rounded border border-charcoal/15 px-1.5 text-charcoal/60 hover:bg-primary/10">↑</button>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function RotationsPanel() {
  const { state, dispatch } = useScheduler();
  const name = (id) => state.roster.find((s) => s.id === id)?.displayName ?? id;
  return (
    <div className="glass-panel rounded-xl p-4 text-xs" data-testid="rotations">
      <h3 className="font-bold uppercase tracking-wide text-charcoal/60">Rotations</h3>
      <p className="mt-1 text-[11px] text-charcoal/50">
        Cadence and anchor are editable; linked effects (e.g. Vero's Fri-off) are seed data for now.
      </p>
      <ul className="mt-2 space-y-2">
        {state.rotations.map((r) => (
          <li key={r.id} className="rounded border border-charcoal/10 p-1.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold">{name(r.staffId)} · {r.day} · {r.roleWhenOn}</span>
              <button type="button" aria-label={`remove ${r.id}`}
                onClick={() => dispatch({ type: 'REMOVE_ROTATION', rotationId: r.id })}
                className="rounded border border-danger/40 px-1.5 text-danger hover:bg-danger-soft">×</button>
            </div>
            <div className="mt-1 flex gap-1">
              <select value={r.cadence} aria-label={`cadence ${r.id}`}
                onChange={(e) => dispatch({ type: 'UPSERT_ROTATION', rotation: { ...r, cadence: e.target.value } })}
                className="rounded border border-charcoal/20 px-1 py-0.5">
                {['weekly', 'everyOtherWeek', 'everyThirdWeek', 'monthly'].map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <input type="date" value={r.anchor} aria-label={`anchor ${r.id}`}
                onChange={(e) => e.target.value &&
                  dispatch({ type: 'UPSERT_ROTATION', rotation: { ...r, anchor: e.target.value } })}
                className="rounded border border-charcoal/20 px-1 py-0.5" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function RosterPasteBox() {
  const { dispatch } = useScheduler();
  const [text, setText] = useState('');
  const [result, setResult] = useState(null);
  return (
    <div className="glass-panel rounded-xl p-4 text-xs">
      <h3 className="font-bold uppercase tracking-wide text-charcoal/60">Paste roster rows</h3>
      <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)}
        className="mt-2 w-full rounded border border-charcoal/20 p-1 font-mono" />
      <button type="button" onClick={() => setResult(parseRosterPaste(text))}
        className="mt-1 rounded bg-primary px-2 py-1 font-semibold text-white">Parse</button>
      {result && (
        <div className="mt-2 space-y-1">
          {result.issues.map((i) => (
            <div key={i.line} className="text-danger">Line {i.line}: {i.kind} {i.detail ?? ''}</div>
          ))}
          <div>{result.records.length} row(s) ready.</div>
          <button type="button"
            onClick={() => { result.records.forEach((staff) => dispatch({ type: 'UPSERT_STAFF', staff })); setResult(null); setText(''); }}
            className="rounded bg-primary px-2 py-1 font-semibold text-white">Apply</button>
        </div>
      )}
    </div>
  );
}

export default function RosterScreen() {
  const { state } = useScheduler();
  const [editing, setEditing] = useState(null);
  return (
    <div className="flex gap-4 p-6">
      <div className="grow space-y-3">
        <h2 className="text-base font-bold">Roster</h2>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-charcoal/10 text-left">
              <th className="py-1">Name</th><th>Paylocity</th><th>Role</th><th>Std hrs</th><th>Pattern</th><th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {state.roster.map((s) => (
              <tr key={s.id} data-testid="roster-row"
                onClick={() => setEditing(s.id)}
                className="cursor-pointer border-b border-charcoal/5 hover:bg-primary/5">
                <td className="py-1 font-medium">{s.displayName}</td>
                <td>{s.paylocityName}</td>
                <td><RoleTag role={s.role} /></td>
                <td>{s.standardHours}</td>
                <td>{patternSummary(s)}</td>
                <td className="max-w-56 truncate text-charcoal/60">{s.constraints.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {editing && (
          <StaffEditor
            key={editing}
            staff={state.roster.find((s) => s.id === editing)}
            onDone={() => setEditing(null)}
          />
        )}
      </div>
      <div className="w-72 shrink-0 space-y-4">
        <PullOrderPanel />
        <RotationsPanel />
        <RosterPasteBox />
      </div>
    </div>
  );
}
```

Register in `App.jsx` `SCREENS`: `{ key: 'roster', label: 'Roster', Component: RosterScreen }`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/ui/RosterScreen.test.jsx`
Expected: PASS — 3 tests. Then `npx vitest run` — full suite green (roster edits must not break the parity test, which reads the untouched seed).

- [ ] **Step 5: Commit**

```bash
git add src/ui
git commit -m "feat(ui): roster screen — staff editor, pull order, paste import"
```

---

