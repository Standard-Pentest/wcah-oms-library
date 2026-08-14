### Task 19: Time-Off Import screen (+ roster paste parser)

**Files:**
- Create: `src/import/roster-paste.js`, `src/ui/ImportScreen.jsx`
- Modify: `src/ui/App.jsx` (add `{ key: 'import', label: 'Time Off', Component: ImportScreen }`)
- Test: `src/import/roster-paste.test.js`, `src/ui/ImportScreen.test.jsx`

**Interfaces:**
- Consumes: `parsePaylocityTimeOff` (Task 5), `classifyRequest`, reducer `ADD_REQUESTS`.
- Produces:
  - `parseRosterPaste(rawText) → {records, issues}` (ImportAdapter #2) — parses Roster-sheet rows (`Display Name \t Paylocity Name \t Role \t Notes \t Sun…Sat` where day cells are labels like `VA`, `RVT (7:30–4:30)`, `PB`); returns staff records `{id (slug of display name), displayName, paylocityName, role, standardHours: 40, pattern, constraints: {notes}}`; unknown roles or short rows become issues. Task 20's Roster screen consumes it.
  - `ImportScreen` — textarea → Parse → preview table (one row per record: name, match status, classification, dates, hours) + issues list (unknown-employee issues render a `Use <suggestion>` button that fills `staffId`) → `Apply N requests` assigns ids via `crypto.randomUUID()` **at dispatch** and sends `ADD_REQUESTS`; rows with `staffId: null` are skipped and said so.

- [ ] **Step 1: Write the failing tests**

`src/import/roster-paste.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { parseRosterPaste } from './roster-paste.js';

const T = '\t';
describe('roster paste parser', () => {
  it('parses a roster row with patterned days and time notes', () => {
    const line = ['Gardner, Theresa', 'Gardner, Theresa', 'RVT', '5x8s', '', 'RVT (7:30–4:30)', 'RVT (7:30–4:30)', 'RVT (7:30–4:30)', 'PB', 'RVT (7:30–4:30)', ''].join(T);
    const { records, issues } = parseRosterPaste(line);
    expect(issues).toEqual([]);
    expect(records[0]).toMatchObject({
      id: 'gardner-theresa', role: 'RVT', standardHours: 40,
      constraints: { notes: '5x8s' },
    });
    expect(records[0].pattern.Mon).toMatchObject({ role: 'RVT', timeNote: '7:30–4:30' });
    expect(records[0].pattern.Thu).toMatchObject({ role: 'PB' });
    expect(records[0].pattern.Sun).toBeUndefined();
  });
  it('flags rows with unknown roles', () => {
    const { issues } = parseRosterPaste(['X, Y', 'X, Y', 'WIZARD', '', '', '', '', '', '', '', ''].join(T));
    expect(issues[0]).toMatchObject({ kind: 'unknown-role', line: 1 });
  });
});
```

`src/ui/ImportScreen.test.jsx`:

```jsx
// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SchedulerProvider } from '../state/SchedulerContext.jsx';
import { createMemoryStore } from '../state/persistence.js';
import ImportScreen from './ImportScreen.jsx';

const ROWS = [
  '07/20/2026 09:00 AM\tHobbs, Keith\t201\tPending\t08/12/2026 08:00 AM\t10\t1',
  '07/21/2026 09:00 AM\tBenitez, Melinda\t102\tApproved\t08/12/2026 08:00 AM\t40\t4',
].join('\n');

describe('time-off import', () => {
  it('previews classifications and skips unmatched rows on apply', async () => {
    render(
      <SchedulerProvider store={createMemoryStore()}>
        <ImportScreen />
      </SchedulerProvider>
    );
    fireEvent.change(await screen.findByRole('textbox'), { target: { value: ROWS } });
    fireEvent.click(screen.getByRole('button', { name: 'Parse' }));
    expect(screen.getByText('PAID')).toBeTruthy();
    expect(screen.getByText(/unknown employee/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Apply 1 request/ }));
    expect(await screen.findByText(/1 request added · 1 skipped/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/import/roster-paste.test.js src/ui/ImportScreen.test.jsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`src/import/roster-paste.js`:

```js
import { DAYS } from '../domain/calendar.js';
import { shift, ALL_ROLES } from '../domain/cells.js';

const CELL = /^([A-Za-z_ ]+?)(?:\s*\((.+)\))?$/;

function slug(name) {
  return name.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '');
}

/** ImportAdapter #2 — Roster sheet paste: Display, Paylocity, Role, Notes, Sun…Sat. */
export function parseRosterPaste(rawText) {
  const records = [];
  const issues = [];
  const lines = rawText.split('\n').map((l) => l.replace(/\r$/, '')).filter((l) => l.trim());
  lines.forEach((line, idx) => {
    const lineNo = idx + 1;
    if (idx === 0 && /^display name/i.test(line)) return;
    const cols = line.split('\t');
    if (cols.length < 4) {
      issues.push({ line: lineNo, kind: 'bad-row', detail: `expected at least 4 columns, got ${cols.length}` });
      return;
    }
    const [displayName, paylocityName, role, notes, ...dayCells] = cols.map((c) => c.trim());
    if (!ALL_ROLES.includes(role)) {
      issues.push({ line: lineNo, kind: 'unknown-role', detail: role });
      return;
    }
    const pattern = {};
    DAYS.forEach((day, i) => {
      const text = dayCells[i];
      if (!text) return;
      const m = text.match(CELL);
      const cellRole = m?.[1]?.trim().toUpperCase().replace(' ', '_');
      if (!m || !ALL_ROLES.includes(cellRole)) {
        pattern[day] = shift(role, { label: text }); // keep the label verbatim rather than guessing
        return;
      }
      pattern[day] = m[2] ? shift(cellRole, { timeNote: m[2], hours: 10 }) : shift(cellRole);
    });
    records.push({
      id: slug(displayName), displayName, paylocityName: paylocityName || displayName,
      role, standardHours: 40, pattern, constraints: { notes: notes || undefined },
    });
  });
  return { records, issues };
}
```

`src/ui/ImportScreen.jsx`:

```jsx
import React, { useState } from 'react';
import { useScheduler } from '../state/SchedulerContext.jsx';
import { parsePaylocityTimeOff } from '../import/paylocity.js';
import { classifyRequest } from '../domain/timeoff.js';
import { fmtShort } from '../domain/calendar.js';

export default function ImportScreen() {
  const { state, dispatch } = useScheduler();
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState(null); // {records, issues}
  const [summary, setSummary] = useState(null);

  const parse = () => {
    setSummary(null);
    setParsed(parsePaylocityTimeOff(text, state.roster));
  };
  const adopt = (line, staffId) =>
    setParsed((p) => {
      const issue = p.issues.find((i) => i.line === line);
      return {
        issues: p.issues.filter((i) => i.line !== line),
        records: p.records.map((r) =>
          issue && r.employeeName === issue.name && !r.staffId ? { ...r, staffId } : r
        ),
      };
    });
  const apply = () => {
    const ready = parsed.records.filter((r) => r.staffId);
    const skipped = parsed.records.length - ready.length;
    dispatch({
      type: 'ADD_REQUESTS',
      records: ready.map((r) => ({ ...r, id: crypto.randomUUID() })),
    });
    setSummary(`${ready.length} request${ready.length === 1 ? '' : 's'} added · ${skipped} skipped`);
    setParsed(null);
    setText('');
  };

  return (
    <div className="max-w-4xl space-y-4 p-6">
      <h2 className="text-base font-bold">Time-Off Import</h2>
      <p className="text-xs text-charcoal/60">
        Paste the Paylocity export (Submitted · Employee · Emp # · Status · Request Start · Hours · Days).
        Nothing is applied until you confirm the preview.
      </p>
      <textarea
        value={text} onChange={(e) => setText(e.target.value)} rows={6}
        className="w-full rounded-lg border border-charcoal/20 p-2 font-mono text-xs"
      />
      <button type="button" onClick={parse}
        className="rounded bg-primary px-4 py-1.5 text-sm font-semibold text-white hover:bg-primary-hover">
        Parse
      </button>
      {summary && <div className="rounded bg-success px-3 py-2 text-sm text-success-text">{summary}</div>}
      {parsed && (
        <div className="space-y-3">
          {parsed.issues.length > 0 && (
            <ul className="space-y-1 rounded-lg bg-amber-soft p-3 text-xs text-amber-text">
              {parsed.issues.map((i) => (
                <li key={`${i.kind}-${i.line}`} className="flex items-center justify-between">
                  <span>
                    Line {i.line}: {i.kind === 'unknown-employee' ? `unknown employee "${i.name}"` : i.detail}
                  </span>
                  {i.suggestion && (
                    <button type="button" onClick={() => adopt(i.line, i.suggestion)}
                      className="rounded bg-white px-2 py-0.5 font-semibold">
                      Use {state.roster.find((s) => s.id === i.suggestion)?.displayName}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-charcoal/10 text-left">
                <th className="py-1">Employee</th><th>Match</th><th>Type</th><th>Start</th><th>Days</th><th>Hours</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {parsed.records.map((r, i) => (
                <tr key={i} className="border-b border-charcoal/5">
                  <td className="py-1">{r.employeeName}</td>
                  <td>{r.staffId ?? '—'}</td>
                  <td className="font-semibold">{classifyRequest(r)}</td>
                  <td>{fmtShort(r.startDate)}</td>
                  <td>{r.days}</td>
                  <td>{r.hours}</td>
                  <td>{r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" onClick={apply}
            className="rounded bg-primary px-4 py-1.5 text-sm font-semibold text-white hover:bg-primary-hover">
            Apply {parsed.records.filter((r) => r.staffId).length} request
            {parsed.records.filter((r) => r.staffId).length === 1 ? '' : 's'}
          </button>
        </div>
      )}
    </div>
  );
}
```

Register in `App.jsx` `SCREENS`: `{ key: 'import', label: 'Time Off', Component: ImportScreen }`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/import/roster-paste.test.js src/ui/ImportScreen.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/import src/ui
git commit -m "feat: time-off import screen with preview/confirm, roster paste parser"
```

---

