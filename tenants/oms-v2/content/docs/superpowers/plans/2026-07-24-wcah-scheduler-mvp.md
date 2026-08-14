# WCAH Scheduler MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A local-first SPA that automates the office manager's Excel schedule-builder workflow: real 28-person roster, rotation cadences, Paylocity time-off import, deterministic proposed schedules for 4 real weeks, live coverage checking, rule violations with pull-order repair suggestions, and publish/export — proven by an Excel-parity test that reproduces the workbook's Aug 2–8 week cell-for-cell.

**Architecture:** Pure JSDoc-typed domain (`src/domain`, `src/data`, `src/import` — no React, no `Date.now()`, no id generation; ids/timestamps arrive as arguments) beneath one reducer + selectors (`src/state`) beneath module-scope React components (`src/ui`). Persistence sits behind a `SchedulerStore` interface (IndexedDB impl + memory impl for tests). Spec: `docs/superpowers/specs/2026-07-24-wcah-scheduler-mvp-design.md`.

**Tech Stack:** Vite 6, React 18.3, Tailwind v4 (`@tailwindcss/vite`), vitest 4, @dnd-kit/core 6, lucide-react, @testing-library/react + jsdom (UI smoke), fake-indexeddb (persistence tests).

## Global Constraints

- Repo: `/Users/hinchk/WestCoast.Vet/scheduler` (exists; git `main`; spec committed). All paths below are relative to it.
- JS with JSDoc types. **No TypeScript.**
- `src/domain`, `src/data`, `src/import` are pure: no React imports, no `Date.now()`, no `Math.random()`, no id generation inside reducers or domain functions.
- React components at **module scope only** — never defined inside another component.
- Colors/fonts only via `@theme` tokens in `src/index.css` (`bg-primary`, `coast-*`, `glass-*`); **no raw hex in components**.
- Ubiquitous language in code and copy: Roster, Pattern, Rotation, Toggle, Week Setup, Time Off, Makeup Shift, Override, Proposed Schedule, Coverage, Gap, Violation, Pull Order, Publish.
- Days are always `['Sun','Mon','Tue','Wed','Thu','Fri','Sat']` in that order; week ids are ISO Sunday dates (`'2026-08-02'`).
- Roles: coverage = `VA`, `RVT`, `HSS`, `PHARM`; `MONITOR` counts toward VA coverage; `ADMIN`, `PB`, `TECH_NC` are shown but never counted toward coverage targets.
- Severity mapping from rule flexibility: `fixed`→`hard`, `flexible`→`soft`, `highlyFlexible`→`info`.
- Test runner: `npx vitest run` (fast, no browser). Dev server: `npm run dev` on port **5174**.
- Every commit message ends with the trailer: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- The workbook this plan encodes: `/Users/hinchk/WestCoast.Vet/docs/WCAH_Schedule_Builder_Template.xlsx`. Every seed value in Tasks 3, 8 was transcribed from it — do not "correct" seed data to make tests pass; fix the pipeline instead.

## File Structure

```
package.json  vite.config.js  index.html  .gitignore  CLAUDE.md
.claude/launch.json                  — browser-preview dev server config (Task 14)
src/main.jsx                         — React root
src/index.css                        — @theme tokens (slate + Coastal Glass), glass/coast utilities
src/domain/calendar.js               — DAYS, date math (pure)
src/domain/cells.js                  — cell constructors + formatCell (exact workbook labels)
src/domain/rotations.js              — cadence engine: proposeToggles + linked effects
src/domain/timeoff.js                — classification (PAID/UNPAID/PARTIAL), date ranges, applied?
src/domain/build.js                  — buildWeek: patterns → toggles → time off → overrides
src/domain/targets.js                — per-day per-role coverage targets from DVM counts
src/domain/coverage.js               — coverageCheck + day status
src/domain/rules.js                  — rule templates, seed rulebook, evaluateWeek
src/domain/suggestions.js            — gap repairs via pull order, measured impact
src/domain/metrics.js                — gini, weekend equity, hours report, month summary
src/data/roster.js                   — SEED_ROSTER (28 real staff), SEED_ROTATIONS, PULL_ORDER
src/data/week-aug02.js               — the workbook's Aug 2–8 week: toggles, requests, overrides
src/data/expected-aug02.js           — parity fixtures: expected grid strings + coverage numbers
src/import/paylocity.js              — deterministic time-off export parser (ImportAdapter #1)
src/import/roster-paste.js           — roster-sheet paste parser (ImportAdapter #2)
src/state/store.js                   — initialState, reducer, selectors
src/state/persistence.js             — SchedulerStore interface: memory + IndexedDB, JSON export/import
src/state/SchedulerContext.jsx       — provider + useScheduler hook + autosave
src/ui/App.jsx                       — shell, nav, storage banner
src/ui/chips.jsx                     — StaffChip, CellChip, VarianceBadge (shared presentational)
src/ui/Dashboard.jsx                 — month dashboard: week cards, decision queue, metrics
src/ui/WeekBoard.jsx                 — grid + coverage strip + cell editor + bench + dnd
src/ui/WeekSetupPanel.jsx            — DVM counts + rotation toggle confirm
src/ui/RailPanel.jsx                 — violations / suggestions / person detail
src/ui/RosterScreen.jsx              — staff CRUD, pattern editor, pull order, paste import
src/ui/ImportScreen.jsx              — time-off paste → preview → apply
src/ui/PublishScreen.jsx             — CSV, print, JSON backup/restore
```

Tests are colocated: `src/domain/calendar.test.js`, `src/domain/build.test.js`, `src/data/parity-aug02.test.js`, etc.

---

### Task 1: Scaffold the app

**Files:**
- Create: `package.json`, `vite.config.js`, `index.html`, `.gitignore`, `CLAUDE.md`, `src/main.jsx`, `src/index.css`, `src/ui/App.jsx`

**Interfaces:**
- Produces: a running Vite + React + Tailwind v4 app with vitest wired; `src/index.css` defines every design token later tasks use (`primary`, `cream`, `charcoal`, `coast-*`, `glass*`, `.glass-panel`, `.coast-bg`, `.coast-panel`).

- [ ] **Step 1: Write the project files**

`package.json`:

```json
{
  "name": "wcah-scheduler",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "dependencies": {
    "@dnd-kit/core": "^6.3.1",
    "clsx": "^2.1.1",
    "lucide-react": "^0.525.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.1.11",
    "@testing-library/react": "^16.1.0",
    "@vitejs/plugin-react": "^4.6.0",
    "fake-indexeddb": "^6.0.0",
    "jsdom": "^25.0.1",
    "tailwindcss": "^4.1.11",
    "vite": "^6.3.5",
    "vitest": "^4.1.10"
  }
}
```

`vite.config.js`:

```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5174 },
});
```

`index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>WCAH Scheduler</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

`.gitignore`:

```
node_modules
dist
.DS_Store
```

`src/main.jsx`:

```jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './ui/App.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

`src/index.css` (tokens ported from the prototype, Coastal Glass included):

```css
@import url('https://fonts.googleapis.com/css2?family=Open+Sans:ital,wght@0,300..800;1,300..800&display=swap');
@import 'tailwindcss';

@theme {
  --font-sans: 'Open Sans', ui-sans-serif, system-ui, sans-serif;
  --color-primary: #516d7d;
  --color-primary-hover: #6297b5;
  --color-accent: #475a6e;
  --color-cream: #f9f9f7;
  --color-charcoal: #454545;
  --color-success: #d4edda;
  --color-success-text: #155724;
  --color-danger: #b3261e;
  --color-danger-soft: #f8d7da;
  --color-amber-soft: #fff3cd;
  --color-amber-text: #856404;
  /* Coastal Glass — dashboard dark surface */
  --color-coast-deep: #0b1e2d;
  --color-coast-mid: #123f56;
  --color-coast-dark: #0d2b3e;
  --color-coast-accent: #5eead4;
  --color-coast-accent-soft: #99f6e4;

  --color-glass: rgb(255 255 255 / 0.55);
  --color-glass-strong: rgb(255 255 255 / 0.75);
  --color-glass-border: rgb(255 255 255 / 0.45);
}

body {
  @apply bg-cream font-sans text-charcoal antialiased;
}

.glass-panel {
  @apply bg-glass border-glass-border border shadow-sm backdrop-blur-md;
}

.coast-bg {
  background: linear-gradient(
    135deg,
    var(--color-coast-deep) 0%,
    var(--color-coast-mid) 45%,
    var(--color-coast-dark) 100%
  );
}
.coast-panel {
  @apply rounded-2xl border border-white/15 bg-white/10 backdrop-blur-xl;
  box-shadow: 0 8px 32px rgb(0 0 0 / 0.25);
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}

@media print {
  .no-print { display: none !important; }
}
```

`src/ui/App.jsx` (minimal; replaced by the real shell in Task 14):

```jsx
export default function App() {
  return (
    <div className="p-8">
      <h1 className="text-xl font-semibold text-primary">WCAH Scheduler</h1>
      <p className="mt-2 text-sm">Employee scheduling MVP — shell arrives in Task 14.</p>
    </div>
  );
}
```

`CLAUDE.md`:

```markdown
# WCAH Scheduler

Employee shift scheduling MVP for West Coast Animal Hospital Linda Vista.
Automates the office manager's Excel schedule-builder workbook. Spec:
`docs/superpowers/specs/2026-07-24-wcah-scheduler-mvp-design.md`.

## Commands

- `npm run dev` — dev server on 5174 (browser preview: launch config `wcah-scheduler`)
- `npx vitest run` — all tests (fast, no browser)
- `npm run build` — production build

## Hard rules

- `src/domain`, `src/data`, `src/import` are pure: no React, no `Date.now()`,
  no id generation. Ids/timestamps arrive via action payloads / factory args.
- React components at module scope only.
- Design tokens live in `src/index.css` `@theme`; components use token
  classes, never raw hex.
- `src/data/parity-aug02.test.js` is the Excel-parity tripwire: it asserts the
  engine reproduces the real workbook's Aug 2–8 week cell-for-cell. Never
  edit fixtures to make it pass — fix the pipeline.
- Seed data in `src/data/` is transcribed from the real workbook. It is
  ground truth, not sample data.
- Ubiquitous language: Roster, Pattern, Rotation, Toggle, Week Setup,
  Time Off, Makeup Shift, Override, Proposed Schedule, Coverage, Gap,
  Violation, Pull Order, Publish.
```

- [ ] **Step 2: Install dependencies**

Run: `npm install`
Expected: completes without errors; `node_modules/` created.

- [ ] **Step 3: Verify the toolchain**

Run: `npx vitest run --passWithNoTests`
Expected: `No test files found, exiting with code 0`

Run: `npm run build`
Expected: `✓ built in …` with `dist/` output.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite + React + Tailwind v4 app with design tokens"
```

---

### Task 2: Calendar and cell primitives

**Files:**
- Create: `src/domain/calendar.js`, `src/domain/cells.js`
- Test: `src/domain/calendar.test.js`, `src/domain/cells.test.js`

**Interfaces:**
- Produces:
  - `DAYS` = `['Sun','Mon','Tue','Wed','Thu','Fri','Sat']`
  - `addDays(iso, n) → iso`, `dateForDay(weekStart, day) → iso`, `dayForDate(weekStart, iso) → day|null`, `weeksBetween(aIso, bIso) → int`, `fmtShort(iso) → 'Aug 2'`
  - `shift(role, opts?) → ShiftCell` where ShiftCell = `{kind:'shift', role, hours, timeNote?, label?, earlyLeave?}` (hours default 10)
  - `off(reason) → {kind:'off', reason}` with reason `'PTO'` or `'UNPAID OFF'`
  - `formatCell(cell|undefined) → string` producing the workbook's exact labels
  - `COVERAGE_ROLES = ['VA','RVT','HSS','PHARM']`, `ALL_ROLES = [...COVERAGE_ROLES,'MONITOR','ADMIN','PB','TECH_NC']`

- [ ] **Step 1: Write the failing tests**

`src/domain/calendar.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { DAYS, addDays, dateForDay, dayForDate, weeksBetween, fmtShort } from './calendar.js';

describe('calendar', () => {
  it('orders days Sun-first', () => {
    expect(DAYS).toEqual(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
  });
  it('adds days across month boundaries', () => {
    expect(addDays('2026-08-02', 6)).toBe('2026-08-08');
    expect(addDays('2026-07-30', 3)).toBe('2026-08-02');
    expect(addDays('2026-08-02', -7)).toBe('2026-07-26');
  });
  it('maps week/day to dates and back', () => {
    expect(dateForDay('2026-08-02', 'Thu')).toBe('2026-08-06');
    expect(dayForDate('2026-08-02', '2026-08-06')).toBe('Thu');
    expect(dayForDate('2026-08-02', '2026-08-09')).toBeNull();
  });
  it('counts whole weeks, negative-safe', () => {
    expect(weeksBetween('2026-07-19', '2026-08-02')).toBe(2);
    expect(weeksBetween('2026-08-02', '2026-07-19')).toBe(-2);
  });
  it('formats short dates', () => {
    expect(fmtShort('2026-08-02')).toBe('Aug 2');
  });
});
```

`src/domain/cells.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { shift, off, formatCell, COVERAGE_ROLES } from './cells.js';

describe('cells', () => {
  it('formats plain and time-noted shifts like the workbook', () => {
    expect(formatCell(shift('VA'))).toBe('VA');
    expect(formatCell(shift('RVT', { timeNote: '7:30–4:30', hours: 8 }))).toBe('RVT (7:30–4:30)');
    expect(formatCell(shift('RVT', { timeNote: '9a', hours: 9.5 }))).toBe('RVT (9a)');
    expect(formatCell(shift('VA', { timeNote: 'until 5 PM', hours: 9.5 }))).toBe('VA (until 5 PM)');
  });
  it('prefers explicit labels and appends early-leave', () => {
    expect(formatCell(shift('TECH_NC', { label: 'Tech NC · until 1:00 PM', hours: 5.5 }))).toBe(
      'Tech NC · until 1:00 PM'
    );
    expect(formatCell(shift('VA', { earlyLeave: true }))).toBe('VA · EARLY LEAVE');
  });
  it('formats off cells and empties', () => {
    expect(formatCell(off('PTO'))).toBe('PTO');
    expect(formatCell(off('UNPAID OFF'))).toBe('UNPAID OFF');
    expect(formatCell(undefined)).toBe('');
  });
  it('defaults shift hours to 10', () => {
    expect(shift('VA').hours).toBe(10);
    expect(COVERAGE_ROLES).toEqual(['VA', 'RVT', 'HSS', 'PHARM']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/domain`
Expected: FAIL — `Cannot find module './calendar.js'` (and `./cells.js`).

- [ ] **Step 3: Implement**

`src/domain/calendar.js`:

```js
/** Day keys, Sunday-first — the workbook's column order. */
export const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const MS_DAY = 86400000;

function toUtc(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function toIso(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

/** @param {string} iso @param {number} n @returns {string} */
export function addDays(iso, n) {
  return toIso(toUtc(iso) + n * MS_DAY);
}

/** @param {string} weekStart Sunday ISO date @param {string} day one of DAYS */
export function dateForDay(weekStart, day) {
  return addDays(weekStart, DAYS.indexOf(day));
}

/** @returns {string|null} the day key if the date falls in the week, else null */
export function dayForDate(weekStart, iso) {
  const diff = Math.round((toUtc(iso) - toUtc(weekStart)) / MS_DAY);
  return diff >= 0 && diff < 7 ? DAYS[diff] : null;
}

/** Whole weeks from a to b (negative when b precedes a). */
export function weeksBetween(aIso, bIso) {
  return Math.round((toUtc(bIso) - toUtc(aIso)) / (7 * MS_DAY));
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** @returns {string} e.g. 'Aug 2' */
export function fmtShort(iso) {
  const [, m, d] = iso.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}
```

`src/domain/cells.js`:

```js
/**
 * @typedef {Object} ShiftCell
 * @property {'shift'} kind
 * @property {string} role       VA|RVT|HSS|PHARM|MONITOR|ADMIN|PB|TECH_NC
 * @property {number} hours
 * @property {string} [timeNote] e.g. '7:30–4:30', '9a', 'until 5 PM'
 * @property {string} [label]    exact display override (workbook oddities)
 * @property {boolean} [earlyLeave]
 *
 * @typedef {Object} OffCell
 * @property {'off'} kind
 * @property {'PTO'|'UNPAID OFF'} reason
 *
 * @typedef {ShiftCell|OffCell} Cell
 */

export const COVERAGE_ROLES = ['VA', 'RVT', 'HSS', 'PHARM'];
export const ALL_ROLES = [...COVERAGE_ROLES, 'MONITOR', 'ADMIN', 'PB', 'TECH_NC'];

/** @param {string} role @param {Partial<ShiftCell>} [opts] @returns {ShiftCell} */
export function shift(role, opts = {}) {
  return { kind: 'shift', role, hours: 10, ...opts };
}

/** @param {'PTO'|'UNPAID OFF'} reason @returns {OffCell} */
export function off(reason) {
  return { kind: 'off', reason };
}

/** Render a cell exactly as the workbook prints it. */
export function formatCell(cell) {
  if (!cell) return '';
  if (cell.kind === 'off') return cell.reason;
  const early = cell.earlyLeave ? ' · EARLY LEAVE' : '';
  if (cell.label) return cell.label + early;
  const note = cell.timeNote ? ` (${cell.timeNote})` : '';
  return cell.role + note + early;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/domain`
Expected: PASS — 2 files, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/domain
git commit -m "feat(domain): calendar math and workbook-exact cell formatting"
```

---

### Task 3: Seed roster, rotations, pull order (real workbook data)

**Files:**
- Create: `src/data/roster.js`
- Test: `src/data/roster.test.js`

**Interfaces:**
- Consumes: `shift` from `src/domain/cells.js`.
- Produces:
  - `SEED_ROSTER` — array of 28 `StaffMember`: `{id, displayName, paylocityName, role, standardHours, pattern: {day: ShiftCell}, constraints: {fixedDays?, noDays?, maxDaysPerWeek?, consecutiveOffExempt?, forbiddenRoles?, emergencyOnly?, notes?}}`
  - `SEED_ROTATIONS` — array of `Rotation`: `{id, staffId, day, roleWhenOn, cadence: 'weekly'|'everyOtherWeek'|'everyThirdWeek'|'monthly', anchor, linked?: LinkedEffect[]}` where `LinkedEffect` is `{when:'ON'|'OFF', day, state:'ON'|'OFF', role?}` **or** `{when:'ON', pickOneAlternating: [{day, role}, …]}`
  - `PULL_ORDER` — array of 8 staff ids, RVT→VA pull sequence
  - `staffById(roster) → Map`

**This data is transcribed from the workbook's Roster + README sheets. It is ground truth.** Anchors are chosen so the cadence engine (Task 4) reproduces the workbook's Aug 2 Week Setup exactly; they are seed *guesses* for future weeks, which the manager confirms weekly by design.

- [ ] **Step 1: Write the failing test**

`src/data/roster.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { SEED_ROSTER, SEED_ROTATIONS, PULL_ORDER, staffById } from './roster.js';

describe('seed roster', () => {
  it('has the 28 real staff with correct role counts', () => {
    expect(SEED_ROSTER).toHaveLength(28);
    const count = (role) => SEED_ROSTER.filter((s) => s.role === role).length;
    expect(count('VA')).toBe(15);
    expect(count('RVT')).toBe(8);
    expect(count('HSS')).toBe(4);
    expect(count('PHARM')).toBe(1);
  });
  it('keeps the RVT→VA pull order from the README sheet', () => {
    expect(PULL_ORDER).toEqual([
      'gallegos-angie',
      'sharko-chloe',
      'quinonez-mariel',
      'gardner-theresa',
      'ross-shana',
      'prado-carla',
      'dimino-aaron',
      'tolden-teagan',
    ]);
  });
  it('references only real staff from rotations', () => {
    const byId = staffById(SEED_ROSTER);
    for (const r of SEED_ROTATIONS) {
      expect(byId.has(r.staffId), r.id).toBe(true);
      expect(['weekly', 'everyOtherWeek', 'everyThirdWeek', 'monthly']).toContain(r.cadence);
    }
    expect(SEED_ROTATIONS).toHaveLength(13);
  });
  it('carries workbook name mismatches for the fuzzy matcher', () => {
    const byId = staffById(SEED_ROSTER);
    expect(byId.get('gallegos-angie').paylocityName).toBe('Gallegos, Angela');
    expect(byId.get('paz-vero').paylocityName).toBe('Paz, Veronica');
    expect(byId.get('willis-bree').paylocityName).toBe('Willis, Breanne');
  });
  it('sets per-person standard hours', () => {
    const byId = staffById(SEED_ROSTER);
    expect(byId.get('corneau-lopez-michaela').standardHours).toBe(25.5);
    expect(byId.get('quinonez-mariel').standardHours).toBe(38);
    expect(byId.get('willis-bree').standardHours).toBe(0);
    expect(byId.get('alonzo-evelyn').standardHours).toBe(40);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/data`
Expected: FAIL — `Cannot find module './roster.js'`.

- [ ] **Step 3: Implement**

`src/data/roster.js` (complete transcription — every entry below comes from the workbook Roster sheet; notes quote its Notes/Constraints column):

```js
import { shift } from '../domain/cells.js';

/** RVT→VA pull order — README: "Angie → Chloe → Mariel → Theresa → Shana → Carla → Aaron → Teagan". */
export const PULL_ORDER = [
  'gallegos-angie',
  'sharko-chloe',
  'quinonez-mariel',
  'gardner-theresa',
  'ross-shana',
  'prado-carla',
  'dimino-aaron',
  'tolden-teagan',
];

const t830 = { timeNote: '7:30–4:30', hours: 8 };
const t9a = { timeNote: '9a', hours: 9.5 };

export const SEED_ROSTER = [
  {
    id: 'alonzo-evelyn', displayName: 'Alonzo, Evelyn', paylocityName: 'Alonzo, Evelyn',
    role: 'VA', standardHours: 40,
    pattern: { Tue: shift('VA'), Wed: shift('VA'), Thu: shift('VA') },
    constraints: { notes: 'Sat rotate' },
  },
  {
    id: 'alvarez-marvette', displayName: 'Alvarez, Marvette', paylocityName: 'Alvarez, Marvette',
    role: 'VA', standardHours: 40,
    pattern: { Sun: shift('VA'), Tue: shift('VA'), Thu: shift('VA'), Sat: shift('VA') },
    constraints: {
      fixedDays: ['Sun', 'Tue', 'Thu', 'Sat'], consecutiveOffExempt: true,
      notes: 'FIXED Sun/Tue/Thu/Sat — commute, rest day between shifts; exempt from consecutive-off rule',
    },
  },
  {
    id: 'burchnell-cayla', displayName: 'Burchnell, Cayla', paylocityName: 'Burchnell, Cayla',
    role: 'HSS', standardHours: 0,
    pattern: {},
    constraints: { emergencyOnly: true, notes: 'Emergency HSS backup ONLY (outside dept)' },
  },
  {
    id: 'corneau-lopez-michaela', displayName: 'Corneau Lopez, Michaela', paylocityName: 'Corneau Lopez, Michaela',
    role: 'VA', standardHours: 25.5,
    pattern: {
      Sun: shift('VA'), Mon: shift('VA'),
      Tue: shift('TECH_NC', { label: 'Tech NC · until 1:00 PM', hours: 5.5 }),
    },
    constraints: { maxDaysPerWeek: 3, notes: 'Part-time 3 days; Tue non-coverage tech role until 1:00 PM' },
  },
  {
    id: 'cuevas-minjarez-paulina', displayName: 'Cuevas Minjarez, Paulina C-M', paylocityName: 'Cuevas Minjarez, Paulina',
    role: 'VA', standardHours: 40,
    pattern: { Mon: shift('VA'), Wed: shift('VA'), Thu: shift('VA'), Fri: shift('VA') },
    constraints: { notes: 'Regular Mon; Sat rotate (drops a weekday when Sat is ON)' },
  },
  {
    id: 'dimino-aaron', displayName: 'Dimino, Aaron', paylocityName: 'Dimino, Aaron',
    role: 'RVT', standardHours: 40,
    pattern: { Wed: shift('ADMIN'), Thu: shift('RVT'), Fri: shift('RVT'), Sat: shift('RVT') },
    constraints: { notes: '1 ADMIN day/wk (coverage first); pull order #7' },
  },
  {
    id: 'escalante-aidee', displayName: 'Escalante, Aidee', paylocityName: 'Escalante, Aidee',
    role: 'VA', standardHours: 40,
    pattern: { Wed: shift('VA'), Thu: shift('VA'), Fri: shift('VA') },
    constraints: { notes: 'Tue rotate' },
  },
  {
    id: 'gallegos-angie', displayName: 'Gallegos, Angie', paylocityName: 'Gallegos, Angela',
    role: 'RVT', standardHours: 40,
    pattern: { Tue: shift('RVT'), Thu: shift('RVT'), Fri: shift('RVT'), Sat: shift('RVT') },
    constraints: { notes: 'Pull order #1 (first to VA)' },
  },
  {
    id: 'garcia-lorena', displayName: 'Garcia, Lorena', paylocityName: 'Garcia, Lorena V.',
    role: 'VA', standardHours: 40,
    pattern: { Mon: shift('VA'), Tue: shift('VA'), Wed: shift('VA'), Sat: shift('VA') },
    constraints: {},
  },
  {
    id: 'gardner-theresa', displayName: 'Gardner, Theresa', paylocityName: 'Gardner, Theresa',
    role: 'RVT', standardHours: 40,
    pattern: {
      Mon: shift('RVT', t830), Tue: shift('RVT', t830), Wed: shift('RVT', t830),
      Thu: shift('PB', { hours: 8 }), Fri: shift('RVT', t830),
    },
    constraints: { notes: '5x8s, off 4:30; PB every Thursday; pull #4' },
  },
  {
    id: 'hobbs-keith', displayName: 'Hobbs, Keith', paylocityName: 'Hobbs, Keith',
    role: 'VA', standardHours: 40,
    pattern: { Sun: shift('VA'), Mon: shift('VA'), Tue: shift('VA'), Fri: shift('VA') },
    constraints: {},
  },
  {
    id: 'hooper-camila', displayName: 'Hooper, Camila', paylocityName: 'Hooper, Camila',
    role: 'VA', standardHours: 40,
    pattern: { Mon: shift('VA'), Wed: shift('PHARM'), Thu: shift('VA'), Fri: shift('VA') },
    constraints: { notes: 'Pharmacy backup #1 (Wed default); Sun flex rotate' },
  },
  {
    id: 'lopez-jennifer', displayName: "Lopez, Jennifer 'Jlo'", paylocityName: 'Lopez, Jennifer',
    role: 'VA', standardHours: 40,
    pattern: { Tue: shift('VA'), Wed: shift('VA'), Thu: shift('VA'), Fri: shift('VA') },
    constraints: {},
  },
  {
    id: 'mariscal-paulina', displayName: 'Mariscal, Paulina M', paylocityName: 'Mariscal, Paulina',
    role: 'VA', standardHours: 40,
    pattern: { Mon: shift('VA'), Tue: shift('VA'), Wed: shift('VA'), Fri: shift('VA') },
    constraints: { noDays: ['Sun'], notes: 'NO Sundays; Sat rotate' },
  },
  {
    id: 'mendez-jorge', displayName: 'Mendez, Jorge', paylocityName: 'Mendez, Jorge',
    role: 'VA', standardHours: 40,
    pattern: { Mon: shift('VA'), Tue: shift('VA'), Wed: shift('VA') },
    constraints: { notes: 'Sun + Thu rotates' },
  },
  {
    id: 'nenneman-tyler', displayName: 'Nenneman, Tyler', paylocityName: 'Nenneman, Tyler',
    role: 'PHARM', standardHours: 40,
    pattern: { Mon: shift('PHARM'), Tue: shift('PHARM'), Thu: shift('PHARM'), Fri: shift('PHARM') },
    constraints: {},
  },
  {
    id: 'paz-vero', displayName: 'Paz, Vero', paylocityName: 'Paz, Veronica',
    role: 'VA', standardHours: 40,
    pattern: { Mon: shift('VA'), Tue: shift('VA'), Thu: shift('VA'), Fri: shift('VA') },
    constraints: { notes: 'Every 3rd Sun; Fri OFF when Sun ON' },
  },
  {
    id: 'pearl-leanne', displayName: 'Pearl, Leanne', paylocityName: 'Pearl, Leanne',
    role: 'HSS', standardHours: 40,
    pattern: { Wed: shift('HSS'), Thu: shift('HSS'), Fri: shift('HSS'), Sat: shift('HSS') },
    constraints: {},
  },
  {
    id: 'prado-carla', displayName: 'Prado, Carla', paylocityName: 'Prado, Carla',
    role: 'RVT', standardHours: 30,
    pattern: { Tue: shift('RVT'), Wed: shift('RVT'), Thu: shift('RVT') },
    constraints: { noDays: ['Sun', 'Mon', 'Fri', 'Sat'], notes: 'Tue–Thu only; pull #6' },
  },
  {
    id: 'quinonez-mariel', displayName: 'Quinonez, Mariel', paylocityName: 'Quinonez, Mariel A.',
    role: 'RVT', standardHours: 38,
    pattern: {
      Mon: shift('RVT', t9a), Tue: shift('RVT', t9a), Wed: shift('RVT', t9a),
      Thu: shift('ADMIN', t9a),
    },
    constraints: { notes: '9:00 AM starts; Thu ADMIN; pull #3' },
  },
  {
    id: 'rodriguez-glenda', displayName: 'Rodriguez, Glenda', paylocityName: 'Rodriguez, Glenda',
    role: 'VA', standardHours: 40,
    pattern: { Sun: shift('VA'), Mon: shift('VA'), Thu: shift('VA'), Fri: shift('VA') },
    constraints: {},
  },
  {
    id: 'ross-shana', displayName: 'Ross, Shana', paylocityName: 'Ross, Shana L.',
    role: 'RVT', standardHours: 40,
    pattern: { Mon: shift('RVT'), Tue: shift('PB') },
    constraints: { noDays: ['Sat'], notes: 'PB Tuesdays; NO Saturdays; Sun rotate with alternating Wed/Fri; pull #5' },
  },
  {
    id: 'russaw-jonelle', displayName: 'Russaw, Jonelle', paylocityName: 'Russaw, Jonelle',
    role: 'VA', standardHours: 40,
    pattern: { Tue: shift('VA'), Wed: shift('VA'), Thu: shift('VA') },
    constraints: { notes: 'Mon + Sat rotates' },
  },
  {
    id: 'sharko-chloe', displayName: 'Sharko, Chloe', paylocityName: 'Sharko, Chloe',
    role: 'RVT', standardHours: 40,
    pattern: { Sun: shift('RVT'), Mon: shift('VA'), Tue: shift('VA'), Fri: shift('MONITOR') },
    constraints: { notes: 'VA every Mon; dental MONITOR every Fri; pull #2' },
  },
  {
    id: 'timmons-michelle', displayName: 'Timmons, Michelle', paylocityName: 'Timmons, Michelle',
    role: 'HSS', standardHours: 30,
    pattern: { Mon: shift('HSS'), Tue: shift('HSS'), Wed: shift('ADMIN') },
    constraints: { notes: 'Mon/Tue HSS + standing Wed ADMIN' },
  },
  {
    id: 'tolden-teagan', displayName: 'Tolden, Teagan', paylocityName: 'Tolden, Teagan',
    role: 'RVT', standardHours: 40,
    pattern: { Mon: shift('RVT'), Tue: shift('RVT'), Wed: shift('RVT'), Thu: shift('RVT') },
    constraints: { forbiddenRoles: ['MONITOR'], notes: 'SURGERY or VA only — never dental; pull #8 (last)' },
  },
  {
    id: 'torres-damali', displayName: 'Torres, Damali', paylocityName: 'Torres, Damali',
    role: 'VA', standardHours: 40,
    pattern: { Mon: shift('VA'), Wed: shift('VA'), Thu: shift('VA'), Fri: shift('VA') },
    constraints: { notes: 'Pharmacy backup #2, HSS Role 3; Sat rotate 1x/month' },
  },
  {
    id: 'willis-bree', displayName: 'Willis, Bree', paylocityName: 'Willis, Breanne',
    role: 'HSS', standardHours: 0,
    pattern: {},
    constraints: { notes: 'Every other Sunday HSS ONLY' },
  },
];

/**
 * Rotation cadences. Anchors are the Sunday week-start of a known ON week,
 * chosen so `proposeToggles(SEED_ROTATIONS, '2026-08-02')` reproduces the
 * workbook's Week Setup for Aug 2 exactly. Future-week proposals are guesses
 * the manager confirms in Week Setup — that is the designed workflow.
 */
export const SEED_ROTATIONS = [
  { id: 'alonzo-sat', staffId: 'alonzo-evelyn', day: 'Sat', roleWhenOn: 'VA', cadence: 'everyOtherWeek', anchor: '2026-08-02' },
  {
    id: 'cuevas-sat', staffId: 'cuevas-minjarez-paulina', day: 'Sat', roleWhenOn: 'VA', cadence: 'everyOtherWeek', anchor: '2026-07-26',
    linked: [{ when: 'ON', day: 'Mon', state: 'OFF', role: 'VA' }],
  },
  { id: 'escalante-tue', staffId: 'escalante-aidee', day: 'Tue', roleWhenOn: 'VA', cadence: 'everyOtherWeek', anchor: '2026-08-02' },
  { id: 'hooper-sun', staffId: 'hooper-camila', day: 'Sun', roleWhenOn: 'VA', cadence: 'everyOtherWeek', anchor: '2026-08-02' },
  { id: 'mariscal-sat', staffId: 'mariscal-paulina', day: 'Sat', roleWhenOn: 'VA', cadence: 'everyOtherWeek', anchor: '2026-08-02' },
  { id: 'mendez-sun', staffId: 'mendez-jorge', day: 'Sun', roleWhenOn: 'VA', cadence: 'everyOtherWeek', anchor: '2026-07-26' },
  { id: 'mendez-thu', staffId: 'mendez-jorge', day: 'Thu', roleWhenOn: 'VA', cadence: 'everyOtherWeek', anchor: '2026-08-02' },
  {
    id: 'paz-sun', staffId: 'paz-vero', day: 'Sun', roleWhenOn: 'VA', cadence: 'everyThirdWeek', anchor: '2026-07-19',
    linked: [
      { when: 'ON', day: 'Fri', state: 'OFF', role: 'VA' },
      { when: 'OFF', day: 'Fri', state: 'ON', role: 'VA' },
    ],
  },
  {
    id: 'ross-sun', staffId: 'ross-shana', day: 'Sun', roleWhenOn: 'RVT', cadence: 'everyOtherWeek', anchor: '2026-08-02',
    linked: [
      { when: 'ON', pickOneAlternating: [{ day: 'Fri', role: 'VA' }, { day: 'Wed', role: 'RVT' }] },
      { when: 'OFF', day: 'Wed', state: 'ON', role: 'RVT' },
      { when: 'OFF', day: 'Fri', state: 'ON', role: 'RVT' },
    ],
  },
  { id: 'russaw-mon', staffId: 'russaw-jonelle', day: 'Mon', roleWhenOn: 'VA', cadence: 'everyOtherWeek', anchor: '2026-07-26' },
  { id: 'russaw-sat', staffId: 'russaw-jonelle', day: 'Sat', roleWhenOn: 'VA', cadence: 'everyOtherWeek', anchor: '2026-08-02' },
  { id: 'torres-sat', staffId: 'torres-damali', day: 'Sat', roleWhenOn: 'VA', cadence: 'monthly', anchor: '2026-07-12' },
  { id: 'willis-sun', staffId: 'willis-bree', day: 'Sun', roleWhenOn: 'HSS', cadence: 'everyOtherWeek', anchor: '2026-07-26' },
];

/** @returns {Map<string, object>} staff by id */
export function staffById(roster) {
  return new Map(roster.map((s) => [s.id, s]));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/data`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/data
git commit -m "feat(data): real WCAH roster, rotations, and pull order from the workbook"
```

---

### Task 4: Rotation cadence engine

**Files:**
- Create: `src/domain/rotations.js`
- Test: `src/domain/rotations.test.js`

**Interfaces:**
- Consumes: `weeksBetween` from `calendar.js`; `SEED_ROTATIONS` from `src/data/roster.js` (test only).
- Produces:
  - `rotationState(rotation, weekStart) → 'ON'|'OFF'`
  - `proposeToggles(rotations, weekStart) → Toggle[]` where `Toggle = {rotationId, staffId, day, role, state:'ON'|'OFF'}` — includes linked-effect rows. **Task 8 stores this exact output as the week's `toggleStates`; Tasks 6, 12, 17 consume the same `Toggle` shape.**

- [ ] **Step 1: Write the failing test**

`src/domain/rotations.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { proposeToggles, rotationState } from './rotations.js';
import { SEED_ROTATIONS } from '../data/roster.js';

const byKey = (t) => `${t.staffId}|${t.day}`;
const sorted = (list) => [...list].sort((a, b) => byKey(a).localeCompare(byKey(b)));

describe('cadence engine', () => {
  it('reproduces the workbook Week Setup toggles for Aug 2 exactly', () => {
    const got = sorted(proposeToggles(SEED_ROTATIONS, '2026-08-02')).map(
      (t) => `${t.staffId}|${t.day}|${t.role}|${t.state}`
    );
    expect(got).toEqual(
      [
        'alonzo-evelyn|Sat|VA|ON',
        'cuevas-minjarez-paulina|Sat|VA|OFF',
        'escalante-aidee|Tue|VA|ON',
        'hooper-camila|Sun|VA|ON',
        'mariscal-paulina|Sat|VA|ON',
        'mendez-jorge|Sun|VA|OFF',
        'mendez-jorge|Thu|VA|ON',
        'paz-vero|Fri|VA|ON',
        'paz-vero|Sun|VA|OFF',
        'ross-shana|Fri|VA|ON',
        'ross-shana|Sun|RVT|ON',
        'ross-shana|Wed|RVT|OFF',
        'russaw-jonelle|Mon|VA|OFF',
        'russaw-jonelle|Sat|VA|ON',
        'torres-damali|Sat|VA|OFF',
        'willis-bree|Sun|HSS|OFF',
      ].sort()
    );
  });
  it('cycles every-other and every-third cadences forward', () => {
    const bree = SEED_ROTATIONS.find((r) => r.id === 'willis-sun');
    expect(rotationState(bree, '2026-08-02')).toBe('OFF');
    expect(rotationState(bree, '2026-08-09')).toBe('ON');
    const vero = SEED_ROTATIONS.find((r) => r.id === 'paz-sun');
    expect(rotationState(vero, '2026-08-09')).toBe('ON');
    expect(rotationState(vero, '2026-08-16')).toBe('OFF');
  });
  it('applies linked effects for the state they match', () => {
    // Vero Sun ON week → Fri OFF (the README rule "when Sunday is ON her Friday is OFF")
    const rows = proposeToggles(SEED_ROTATIONS, '2026-08-09').filter((t) => t.staffId === 'paz-vero');
    expect(sorted(rows).map((t) => `${t.day}|${t.state}`)).toEqual(['Fri|OFF', 'Sun|ON']);
  });
  it('alternates Ross Wed/Fri across successive Sun-ON weeks', () => {
    const on1 = proposeToggles(SEED_ROTATIONS, '2026-08-02').filter((t) => t.staffId === 'ross-shana');
    const on2 = proposeToggles(SEED_ROTATIONS, '2026-08-16').filter((t) => t.staffId === 'ross-shana');
    const pick = (rows, day) => rows.find((t) => t.day === day).state;
    expect([pick(on1, 'Fri'), pick(on1, 'Wed')]).toEqual(['ON', 'OFF']);
    expect([pick(on2, 'Fri'), pick(on2, 'Wed')]).toEqual(['OFF', 'ON']);
  });
  it('turns Ross Wed and Fri fully on in Sun-OFF weeks', () => {
    const rows = proposeToggles(SEED_ROTATIONS, '2026-08-09').filter((t) => t.staffId === 'ross-shana');
    const pick = (day) => rows.find((t) => t.day === day);
    expect(pick('Sun').state).toBe('OFF');
    expect(pick('Wed')).toMatchObject({ state: 'ON', role: 'RVT' });
    expect(pick('Fri')).toMatchObject({ state: 'ON', role: 'RVT' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/domain/rotations.test.js`
Expected: FAIL — `Cannot find module './rotations.js'`.

- [ ] **Step 3: Implement**

`src/domain/rotations.js`:

```js
import { weeksBetween } from './calendar.js';

const PERIODS = { weekly: 1, everyOtherWeek: 2, everyThirdWeek: 3, monthly: 4 };

function mod(n, p) {
  return ((n % p) + p) % p;
}

/** @returns {'ON'|'OFF'} the base state of a rotation for the given week */
export function rotationState(rotation, weekStart) {
  const w = weeksBetween(rotation.anchor, weekStart);
  return mod(w, PERIODS[rotation.cadence]) === 0 ? 'ON' : 'OFF';
}

/** Zero-based count of completed cadence periods since the anchor. */
function cycleIndex(rotation, weekStart) {
  return Math.floor(weeksBetween(rotation.anchor, weekStart) / PERIODS[rotation.cadence]);
}

/**
 * Expand rotations (with linked effects) into this week's proposed toggles.
 * @returns {Array<{rotationId:string, staffId:string, day:string, role:string, state:'ON'|'OFF'}>}
 */
export function proposeToggles(rotations, weekStart) {
  const out = [];
  for (const r of rotations) {
    const state = rotationState(r, weekStart);
    out.push({ rotationId: r.id, staffId: r.staffId, day: r.day, role: r.roleWhenOn, state });
    for (const fx of r.linked ?? []) {
      if (fx.when !== state) continue;
      if (fx.pickOneAlternating) {
        const k = mod(cycleIndex(r, weekStart), fx.pickOneAlternating.length);
        fx.pickOneAlternating.forEach((opt, i) => {
          out.push({
            rotationId: r.id, staffId: r.staffId, day: opt.day, role: opt.role,
            state: i === k ? 'ON' : 'OFF',
          });
        });
      } else {
        out.push({
          rotationId: r.id, staffId: r.staffId, day: fx.day,
          role: fx.role ?? r.roleWhenOn, state: fx.state,
        });
      }
    }
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/domain/rotations.test.js`
Expected: PASS — 5 tests. (If the Aug 2 parity case fails, the bug is in anchors or the engine — the expected list is the workbook's Week Setup sheet and must not change.)

- [ ] **Step 5: Commit**

```bash
git add src/domain/rotations.js src/domain/rotations.test.js
git commit -m "feat(domain): rotation cadence engine with linked effects"
```

---

### Task 5: Time-off semantics and the Paylocity parser

**Files:**
- Create: `src/domain/timeoff.js`, `src/import/paylocity.js`
- Test: `src/domain/timeoff.test.js`, `src/import/paylocity.test.js`

**Interfaces:**
- Consumes: `addDays` from `calendar.js`; roster shape from Task 3.
- Produces:
  - `classifyRequest(req) → 'PAID'|'UNPAID'|'PARTIAL'` (hours 0 → UNPAID; hours/days < 8 → PARTIAL; else PAID)
  - `requestDates(req) → iso[]` (start date + `days` consecutive dates)
  - `isApplied(req) → boolean` (Approved, or Pending with `decision === 'granted'`)
  - `sortBySubmitted(reqs) → reqs` (first-submitted-wins ordering)
  - `parsePaylocityTimeOff(rawText, roster) → {records, issues}` — records are TimeOffRequest: `{submittedAt, employeeName, empNum, status, startDate, hours, days, staffId|null, decision:null}`; issues are `{line, kind:'bad-row'|'bad-date'|'unknown-employee', detail?, name?, suggestion?}`. **Exact-name matches (paylocityName or displayName) auto-assign `staffId`; anything fuzzier yields `staffId: null` plus a suggestion — never silent.**
  - Request ids are NOT generated here (domain purity); the reducer assigns them at dispatch (Task 12).

- [ ] **Step 1: Write the failing tests**

`src/domain/timeoff.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { classifyRequest, requestDates, isApplied, sortBySubmitted } from './timeoff.js';

describe('time-off semantics', () => {
  it('classifies the workbook cases', () => {
    expect(classifyRequest({ hours: 40, days: 4 })).toBe('PAID');   // Benitez
    expect(classifyRequest({ hours: 10, days: 1 })).toBe('PAID');   // Gallegos Sat
    expect(classifyRequest({ hours: 0, days: 1 })).toBe('UNPAID');  // Gardner
    expect(classifyRequest({ hours: 1, days: 1 })).toBe('PARTIAL'); // Gallegos early leave
    expect(classifyRequest({ hours: 2, days: 1 })).toBe('PARTIAL'); // Escalante early leave
  });
  it('expands consecutive request dates', () => {
    expect(requestDates({ startDate: '2026-08-04', days: 4 })).toEqual([
      '2026-08-04', '2026-08-05', '2026-08-06', '2026-08-07',
    ]);
  });
  it('applies Approved always, Pending only when granted', () => {
    expect(isApplied({ status: 'Approved', decision: null })).toBe(true);
    expect(isApplied({ status: 'Pending', decision: null })).toBe(false);
    expect(isApplied({ status: 'Pending', decision: 'granted' })).toBe(true);
    expect(isApplied({ status: 'Pending', decision: 'denied' })).toBe(false);
  });
  it('orders first-submitted first', () => {
    const out = sortBySubmitted([
      { submittedAt: '2026-06-19T08:36:00' },
      { submittedAt: '2026-03-10T13:43:00' },
    ]);
    expect(out[0].submittedAt).toBe('2026-03-10T13:43:00');
  });
});
```

`src/import/paylocity.test.js` (rows below are verbatim from the workbook's Time-Off Input sheet, tab-separated as Excel copies them):

```js
import { describe, it, expect } from 'vitest';
import { parsePaylocityTimeOff } from './paylocity.js';
import { SEED_ROSTER } from '../data/roster.js';

const T = '\t';
const row = (...cols) => cols.join(T);

describe('Paylocity time-off parser', () => {
  it('parses 12-hour and 24-hour submitted formats and maps exact names', () => {
    const text = [
      row('Submitted', 'Employee', 'Emp #', 'Status', 'Request Start', 'Hours', 'Days'),
      row('03/10/2026 01:43 PM', 'Benitez, Melinda', '102', 'Approved', '08/04/2026 08:00 AM', '40', '4'),
      row('06/16/2026 13:57:17', 'Gardner, Theresa', '240', 'Approved', '08/02/2026 08:00 AM', '0', '1'),
      row('04/11/2026 08:02 PM', 'Gallegos, Angela', '138', 'Pending', '08/08/2026 08:00 AM', '10', '1'),
    ].join('\n');
    const { records, issues } = parsePaylocityTimeOff(text, SEED_ROSTER);
    expect(records).toHaveLength(3);
    expect(records[0]).toMatchObject({
      submittedAt: '2026-03-10T13:43:00', startDate: '2026-08-04',
      hours: 40, days: 4, status: 'Approved', staffId: null,
    });
    expect(records[1]).toMatchObject({
      submittedAt: '2026-06-16T13:57:17', staffId: 'gardner-theresa', hours: 0,
    });
    expect(records[2]).toMatchObject({ staffId: 'gallegos-angie', status: 'Pending', decision: null });
    // Benitez is not on the roster — flagged, never silently attached
    expect(issues).toEqual([
      expect.objectContaining({ kind: 'unknown-employee', name: 'Benitez, Melinda', line: 2 }),
    ]);
  });
  it('suggests fuzzy matches without auto-assigning', () => {
    const text = row('05/13/2026 12:20 PM', 'Gallegos, Angie L.', '138', 'Approved', '08/04/2026 05:00 PM', '1', '1');
    const { records, issues } = parsePaylocityTimeOff(text, SEED_ROSTER);
    expect(records[0].staffId).toBeNull();
    expect(issues[0]).toMatchObject({ kind: 'unknown-employee', suggestion: 'gallegos-angie' });
  });
  it('reports malformed rows as issues, not exceptions', () => {
    const { records, issues } = parsePaylocityTimeOff('garbage line without tabs', SEED_ROSTER);
    expect(records).toHaveLength(0);
    expect(issues[0]).toMatchObject({ kind: 'bad-row', line: 1 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/domain/timeoff.test.js src/import`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`src/domain/timeoff.js`:

```js
import { addDays } from './calendar.js';

/**
 * @typedef {Object} TimeOffRequest
 * @property {string} submittedAt ISO datetime
 * @property {string} employeeName as exported
 * @property {string} empNum
 * @property {'Approved'|'Pending'} status
 * @property {string} startDate ISO date
 * @property {number} hours 0 = unpaid
 * @property {number} days
 * @property {string|null} staffId
 * @property {'granted'|'denied'|null} decision manager's call on Pending rows
 */

/** Hours 0 → UNPAID (makeup owed). Under 8h/day → PARTIAL (early leave, still works). */
export function classifyRequest(req) {
  if (req.hours === 0) return 'UNPAID';
  if (req.hours / req.days < 8) return 'PARTIAL';
  return 'PAID';
}

/** @returns {string[]} the consecutive dates the request covers */
export function requestDates(req) {
  return Array.from({ length: req.days }, (_, i) => addDays(req.startDate, i));
}

export function isApplied(req) {
  return req.status === 'Approved' || req.decision === 'granted';
}

/** First-submitted-wins ordering for competing requests. */
export function sortBySubmitted(reqs) {
  return [...reqs].sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
}
```

`src/import/paylocity.js`:

```js
/**
 * ImportAdapter #1 — deterministic Paylocity time-off export parser.
 * Contract shared with every future adapter (incl. the AI one):
 *   parse(rawText, roster) → { records, issues }
 * Nothing downstream commits without preview + confirm.
 */

const AMPM = /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)$/i;
const H24 = /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})$/;

/** @returns {string|null} ISO datetime, or null when unparseable */
export function parseDateTime(raw) {
  const s = raw.trim();
  let m = s.match(AMPM);
  if (m) {
    let h = Number(m[4]) % 12;
    if (m[6].toUpperCase() === 'PM') h += 12;
    return `${m[3]}-${m[1]}-${m[2]}T${String(h).padStart(2, '0')}:${m[5]}:00`;
  }
  m = s.match(H24);
  if (m) {
    return `${m[3]}-${m[1]}-${m[2]}T${String(Number(m[4])).padStart(2, '0')}:${m[5]}:${m[6]}`;
  }
  return null;
}

function normalize(name) {
  return name.toLowerCase().replace(/[^a-z,\s]/g, '').replace(/\s+/g, ' ').trim();
}

/** Exact (paylocity or display) → staffId. Fuzzy (same last name, first-name prefix) → suggestion only. */
export function matchStaff(name, roster) {
  const n = normalize(name);
  for (const s of roster) {
    if (normalize(s.paylocityName) === n || normalize(s.displayName) === n) {
      return { staffId: s.id, suggestion: null };
    }
  }
  const [last, first = ''] = n.split(',').map((p) => p.trim());
  for (const s of roster) {
    const [sLast, sFirst = ''] = normalize(s.paylocityName).split(',').map((p) => p.trim());
    if (sLast === last && (sFirst.startsWith(first.slice(0, 3)) || first.startsWith(sFirst.slice(0, 3)))) {
      return { staffId: null, suggestion: s.id };
    }
  }
  return { staffId: null, suggestion: null };
}

export function parsePaylocityTimeOff(rawText, roster) {
  const records = [];
  const issues = [];
  const lines = rawText.split('\n').map((l) => l.replace(/\r$/, '')).filter((l) => l.trim());
  lines.forEach((line, idx) => {
    const lineNo = idx + 1;
    if (idx === 0 && /^submitted\b/i.test(line.trim())) return; // optional header row
    const cols = line.split('\t').map((c) => c.trim());
    if (cols.length < 7) {
      issues.push({ line: lineNo, kind: 'bad-row', detail: `expected 7 tab-separated columns, got ${cols.length}` });
      return;
    }
    const [submittedRaw, employeeName, empNum, status, startRaw, hoursRaw, daysRaw] = cols;
    const submittedAt = parseDateTime(submittedRaw);
    const start = parseDateTime(startRaw);
    const hours = Number(hoursRaw);
    const days = Number(daysRaw);
    if (!submittedAt || !start || Number.isNaN(hours) || Number.isNaN(days)) {
      issues.push({ line: lineNo, kind: 'bad-date', detail: `unparseable date or number in: ${line}` });
      return;
    }
    const match = matchStaff(employeeName, roster);
    if (!match.staffId) {
      issues.push({ line: lineNo, kind: 'unknown-employee', name: employeeName, suggestion: match.suggestion });
    }
    records.push({
      submittedAt, employeeName, empNum,
      status: /^approved$/i.test(status) ? 'Approved' : 'Pending',
      startDate: start.slice(0, 10), hours, days,
      staffId: match.staffId, decision: null,
    });
  });
  return { records, issues };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/domain/timeoff.test.js src/import`
Expected: PASS — 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/domain/timeoff.js src/domain/timeoff.test.js src/import
git commit -m "feat: time-off semantics and deterministic Paylocity import adapter"
```

---

### Task 6: buildWeek pipeline

**Files:**
- Create: `src/domain/build.js`
- Test: `src/domain/build.test.js`

**Interfaces:**
- Consumes: `shift`, `off` from `cells.js`; `dayForDate` from `calendar.js`; `classifyRequest`, `requestDates`, `isApplied` from `timeoff.js`; `Toggle` shape from Task 4.
- Produces: `buildWeek({roster, week, requests}) → {weekStart, cells}` where `cells` is `{[staffId]: {[day]: Cell}}` (every roster id present, possibly `{}`), and `week` is `{startDate, dvmCounts, toggleStates: Toggle[], overrides: {[staffId]: {[day]: 'OFF' | {role, timeNote?, hours?, label?}}}}`. Expansion order is fixed: **patterns → toggles → time off → overrides.** Tasks 7–12 and all UI consume this shape.

- [ ] **Step 1: Write the failing test**

`src/domain/build.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { buildWeek } from './build.js';
import { shift } from './cells.js';

const roster = [
  { id: 'a', role: 'VA', standardHours: 40, pattern: { Mon: shift('VA'), Fri: shift('VA') }, constraints: {} },
  { id: 'b', role: 'RVT', standardHours: 40, pattern: { Tue: shift('RVT') }, constraints: {} },
];
const week = (patch = {}) => ({
  startDate: '2026-08-02',
  dvmCounts: { Sun: 2, Mon: 5, Tue: 4, Wed: 4, Thu: 4, Fri: 4, Sat: 2 },
  toggleStates: [], overrides: {},
  ...patch,
});

describe('buildWeek', () => {
  it('expands default patterns without mutating them', () => {
    const r = structuredClone(roster);
    const { cells } = buildWeek({ roster: r, week: week(), requests: [] });
    expect(cells.a.Mon).toMatchObject({ role: 'VA' });
    expect(cells.a.Tue).toBeUndefined();
    cells.a.Mon.earlyLeave = true;
    expect(r[0].pattern.Mon.earlyLeave).toBeUndefined(); // clone, not alias
  });
  it('applies toggles: ON adds a shift, OFF removes a pattern day', () => {
    const { cells } = buildWeek({
      roster, requests: [],
      week: week({ toggleStates: [
        { staffId: 'a', day: 'Sat', role: 'VA', state: 'ON' },
        { staffId: 'a', day: 'Fri', role: 'VA', state: 'OFF' },
      ] }),
    });
    expect(cells.a.Sat).toMatchObject({ role: 'VA' });
    expect(cells.a.Fri).toBeUndefined();
  });
  it('stamps PAID and UNPAID time off even on non-working days', () => {
    const { cells } = buildWeek({
      roster, week: week(),
      requests: [
        { staffId: 'a', status: 'Approved', decision: null, startDate: '2026-08-03', hours: 10, days: 1, submittedAt: 'x' },
        { staffId: 'a', status: 'Approved', decision: null, startDate: '2026-08-05', hours: 0, days: 1, submittedAt: 'x' },
      ],
    });
    expect(cells.a.Mon).toEqual({ kind: 'off', reason: 'PTO' });
    expect(cells.a.Wed).toEqual({ kind: 'off', reason: 'UNPAID OFF' }); // Wed is not a pattern day
  });
  it('annotates PARTIAL as early leave, reducing hours, only on working days', () => {
    const { cells } = buildWeek({
      roster, week: week(),
      requests: [
        { staffId: 'a', status: 'Approved', decision: null, startDate: '2026-08-03', hours: 2, days: 1, submittedAt: 'x' },
        { staffId: 'b', status: 'Approved', decision: null, startDate: '2026-08-03', hours: 2, days: 1, submittedAt: 'x' },
      ],
    });
    expect(cells.a.Mon).toMatchObject({ role: 'VA', earlyLeave: true, hours: 8 });
    expect(cells.b.Mon).toBeUndefined(); // b does not work Monday
  });
  it('ignores pending-undecided, denied, and out-of-week requests', () => {
    const { cells } = buildWeek({
      roster, week: week(),
      requests: [
        { staffId: 'a', status: 'Pending', decision: null, startDate: '2026-08-03', hours: 10, days: 1, submittedAt: 'x' },
        { staffId: 'a', status: 'Pending', decision: 'denied', startDate: '2026-08-07', hours: 10, days: 1, submittedAt: 'x' },
        { staffId: 'a', status: 'Approved', decision: null, startDate: '2026-08-10', hours: 10, days: 1, submittedAt: 'x' },
      ],
    });
    expect(cells.a.Mon).toMatchObject({ role: 'VA' });
    expect(cells.a.Fri).toMatchObject({ role: 'VA' });
  });
  it('applies overrides last: OFF removes, specs replace (even over time off)', () => {
    const { cells } = buildWeek({
      roster,
      week: week({ overrides: {
        a: { Mon: 'OFF', Wed: { role: 'ADMIN' } },
        b: { Tue: { role: 'VA', label: 'VA (until 5 PM)', hours: 9.5 } },
      } }),
      requests: [{ staffId: 'b', status: 'Approved', decision: null, startDate: '2026-08-04', hours: 1, days: 1, submittedAt: 'x' }],
    });
    expect(cells.a.Mon).toBeUndefined();
    expect(cells.a.Wed).toMatchObject({ role: 'ADMIN' });
    expect(cells.b.Tue).toMatchObject({ label: 'VA (until 5 PM)', hours: 9.5 });
    expect(cells.b.Tue.earlyLeave).toBeUndefined(); // override wiped the partial annotation
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/domain/build.test.js`
Expected: FAIL — `Cannot find module './build.js'`.

- [ ] **Step 3: Implement**

`src/domain/build.js`:

```js
import { shift, off } from './cells.js';
import { dayForDate } from './calendar.js';
import { classifyRequest, requestDates, isApplied } from './timeoff.js';

/**
 * Deterministic weekly expansion — the workbook's pipeline made explicit.
 * Order is fixed: patterns → toggles → time off → overrides.
 * @returns {{weekStart: string, cells: Object<string, Object<string, import('./cells.js').Cell>>}}
 */
export function buildWeek({ roster, week, requests }) {
  const cells = {};

  // 1. Default patterns (cloned — builds must never mutate the roster)
  for (const staff of roster) {
    cells[staff.id] = {};
    for (const [day, cell] of Object.entries(staff.pattern)) {
      cells[staff.id][day] = { ...cell };
    }
  }

  // 2. Rotation toggles
  for (const t of week.toggleStates ?? []) {
    if (!cells[t.staffId]) continue;
    if (t.state === 'ON') cells[t.staffId][t.day] = shift(t.role);
    else delete cells[t.staffId][t.day];
  }

  // 3. Time off (applied requests only)
  for (const req of requests ?? []) {
    if (!req.staffId || !isApplied(req) || !cells[req.staffId]) continue;
    const type = classifyRequest(req);
    for (const date of requestDates(req)) {
      const day = dayForDate(week.startDate, date);
      if (!day) continue;
      const existing = cells[req.staffId][day];
      if (type === 'UNPAID') cells[req.staffId][day] = off('UNPAID OFF');
      else if (type === 'PAID') cells[req.staffId][day] = off('PTO');
      else if (existing && existing.kind === 'shift') {
        cells[req.staffId][day] = {
          ...existing, earlyLeave: true,
          hours: Math.max(0, existing.hours - req.hours),
        };
      }
    }
  }

  // 4. Overrides win over everything
  for (const [staffId, days] of Object.entries(week.overrides ?? {})) {
    if (!cells[staffId]) continue;
    for (const [day, value] of Object.entries(days)) {
      if (value === 'OFF') delete cells[staffId][day];
      else {
        const { role, ...opts } = value;
        cells[staffId][day] = shift(role, opts);
      }
    }
  }

  return { weekStart: week.startDate, cells };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/domain/build.test.js`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/domain/build.js src/domain/build.test.js
git commit -m "feat(domain): buildWeek pipeline (patterns, toggles, time off, overrides)"
```

---

### Task 7: Coverage targets and coverage check

**Files:**
- Create: `src/domain/targets.js`, `src/domain/coverage.js`
- Test: `src/domain/targets.test.js`, `src/domain/coverage.test.js`

**Interfaces:**
- Consumes: `DAYS` from `calendar.js`; `COVERAGE_ROLES` from `cells.js`; built shape from Task 6.
- Produces:
  - `targetsForWeek(week) → {[day]: {VA, RVT, HSS, PHARM}}` — VA weekday `(2×DVMs)+2`, weekend `(2×DVMs)+1`; RVT weekday 3 / weekend 2; HSS 1, except Sun = 1 only when an HSS Sun toggle is ON; PHARM weekday 1 / weekend 0.
  - `coverageCheck(built, targets) → {days: {[day]: {roles: {VA:{scheduled,target,variance},…, ADMIN:{scheduled}}, short, over, status}}}` — status strings exactly `'ON TARGET'`, `'SHORT n'`, `'OVER +n'`. MONITOR counts toward VA; PB and TECH_NC are never counted; ADMIN reported informationally.

- [ ] **Step 1: Write the failing tests**

`src/domain/targets.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { targetsForWeek } from './targets.js';

const week = (toggleStates = []) => ({
  startDate: '2026-08-02',
  dvmCounts: { Sun: 2, Mon: 5, Tue: 4, Wed: 4, Thu: 4, Fri: 4, Sat: 2 },
  toggleStates, overrides: {},
});

describe('coverage targets', () => {
  it('computes the README VA formula per day', () => {
    const t = targetsForWeek(week());
    expect(t.Mon.VA).toBe(12); // 5 DVMs
    expect(t.Tue.VA).toBe(10); // 4 DVMs
    expect(t.Sun.VA).toBe(5);  // weekend, 2 DVMs
    expect(t.Sat.VA).toBe(5);
  });
  it('holds RVT and PHARM steady regardless of DVM count', () => {
    const t = targetsForWeek(week());
    expect(t.Mon.RVT).toBe(3);
    expect(t.Sun.RVT).toBe(2);
    expect(t.Mon.PHARM).toBe(1);
    expect(t.Sat.PHARM).toBe(0);
  });
  it('requires Sunday HSS only when an HSS Sun rotation is ON', () => {
    expect(targetsForWeek(week()).Sun.HSS).toBe(0);
    const on = [{ staffId: 'willis-bree', day: 'Sun', role: 'HSS', state: 'ON' }];
    expect(targetsForWeek(week(on)).Sun.HSS).toBe(1);
    expect(targetsForWeek(week(on)).Wed.HSS).toBe(1);
  });
});
```

`src/domain/coverage.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { coverageCheck } from './coverage.js';
import { shift } from './cells.js';

const targets = { Sun: { VA: 2, RVT: 1, HSS: 0, PHARM: 0 } };
const emptyTargets = Object.fromEntries(
  ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => [d, { VA: 0, RVT: 0, HSS: 0, PHARM: 0 }])
);

function builtWith(cellsByStaff) {
  return { weekStart: '2026-08-02', cells: cellsByStaff };
}

describe('coverageCheck', () => {
  it('counts MONITOR as VA and excludes PB/TECH_NC/ADMIN from targets', () => {
    const built = builtWith({
      a: { Sun: shift('VA') },
      b: { Sun: shift('MONITOR') },
      c: { Sun: shift('PB') },
      d: { Sun: shift('TECH_NC') },
      e: { Sun: shift('ADMIN') },
      f: { Sun: shift('RVT', { earlyLeave: true }) }, // early leave still works, still counts
    });
    const r = coverageCheck(built, { ...emptyTargets, ...targets }).days.Sun;
    expect(r.roles.VA).toEqual({ scheduled: 2, target: 2, variance: 0 });
    expect(r.roles.RVT.scheduled).toBe(1);
    expect(r.roles.ADMIN).toEqual({ scheduled: 1 });
    expect(r.status).toBe('ON TARGET');
  });
  it('reports SHORT and OVER day statuses', () => {
    const short = coverageCheck(builtWith({}), { ...emptyTargets, ...targets }).days.Sun;
    expect(short.roles.VA.variance).toBe(-2);
    expect(short.status).toBe('SHORT 3'); // 2 VA + 1 RVT missing
    const over = coverageCheck(
      builtWith({ a: { Sun: shift('VA') }, b: { Sun: shift('VA') }, c: { Sun: shift('VA') }, d: { Sun: shift('RVT') } }),
      { ...emptyTargets, ...targets }
    ).days.Sun;
    expect(over.status).toBe('OVER +1');
  });
  it('does not count off cells', () => {
    const built = builtWith({ a: { Sun: { kind: 'off', reason: 'PTO' } } });
    expect(coverageCheck(built, { ...emptyTargets, ...targets }).days.Sun.roles.VA.scheduled).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/domain/targets.test.js src/domain/coverage.test.js`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`src/domain/targets.js`:

```js
import { DAYS } from './calendar.js';

const WEEKEND = new Set(['Sun', 'Sat']);

/**
 * Per-day per-role coverage targets — the README formulas:
 * VA weekday (2×DVMs)+2 (monitor + floater), weekend (2×DVMs)+1.
 * RVT weekday 3 (1 surgery + 2 dental), weekend 2. PHARM weekday only.
 * Sunday HSS exists only on weeks with an ON Sunday HSS rotation.
 */
export function targetsForWeek(week) {
  const hssSunOn = (week.toggleStates ?? []).some(
    (t) => t.day === 'Sun' && t.role === 'HSS' && t.state === 'ON'
  );
  const targets = {};
  for (const day of DAYS) {
    const dvm = week.dvmCounts?.[day] ?? 0;
    const weekend = WEEKEND.has(day);
    targets[day] = {
      VA: 2 * dvm + (weekend ? 1 : 2),
      RVT: weekend ? 2 : 3,
      HSS: day === 'Sun' ? (hssSunOn ? 1 : 0) : 1,
      PHARM: weekend ? 0 : 1,
    };
  }
  return targets;
}
```

`src/domain/coverage.js`:

```js
import { DAYS } from './calendar.js';
import { COVERAGE_ROLES } from './cells.js';

/** Which coverage bucket a scheduled role fills (null = shown, never counted). */
function bucketFor(role) {
  if (role === 'MONITOR') return 'VA';
  if (COVERAGE_ROLES.includes(role)) return role;
  if (role === 'ADMIN') return 'ADMIN';
  return null; // PB, TECH_NC
}

/**
 * The workbook's Coverage Check sheet, live.
 * @returns {{days: Object<string, {roles: object, short: number, over: number, status: string}>}}
 */
export function coverageCheck(built, targets) {
  const days = {};
  for (const day of DAYS) {
    const counts = { VA: 0, RVT: 0, HSS: 0, PHARM: 0, ADMIN: 0 };
    for (const staffCells of Object.values(built.cells)) {
      const cell = staffCells[day];
      if (!cell || cell.kind !== 'shift') continue;
      const bucket = bucketFor(cell.role);
      if (bucket) counts[bucket] += 1;
    }
    const roles = {};
    let short = 0;
    let over = 0;
    for (const role of COVERAGE_ROLES) {
      const target = targets[day][role];
      const scheduled = counts[role];
      const variance = scheduled - target;
      if (variance < 0) short -= variance;
      else over += variance;
      roles[role] = { scheduled, target, variance };
    }
    roles.ADMIN = { scheduled: counts.ADMIN };
    const status = short > 0 ? `SHORT ${short}` : over > 0 ? `OVER +${over}` : 'ON TARGET';
    days[day] = { roles, short, over, status };
  }
  return { days };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/domain/targets.test.js src/domain/coverage.test.js`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/domain/targets.js src/domain/coverage.js src/domain/targets.test.js src/domain/coverage.test.js
git commit -m "feat(domain): coverage targets and live coverage check"
```

---

### Task 8: Excel-parity test (the centerpiece)

**Files:**
- Create: `src/data/week-aug02.js`, `src/data/expected-aug02.js`
- Test: `src/data/parity-aug02.test.js`

**Interfaces:**
- Consumes: everything from Tasks 3–7.
- Produces:
  - `WEEK_AUG02` — the workbook's Aug 2–8 week record (Task 12 seeds state with it)
  - `REQUESTS_AUG02` — the 9 roster-matched time-off requests (with fixture ids `req-1`…`req-9`)
  - `EXPECTED_GRID`, `EXPECTED_COVERAGE`, `EXPECTED_STATUS` — parity fixtures

**These fixtures are transcribed from the workbook's Week Setup, Time-Off Input, Overrides, Proposed Schedule, and Coverage Check sheets. If this test fails, the pipeline is wrong — never the fixtures.** (The workbook's Benitez row is excluded here: she is not on the roster; the parser test in Task 5 covers her as the unknown-employee case.)

- [ ] **Step 1: Write the fixtures**

`src/data/week-aug02.js`:

```js
import { proposeToggles } from '../domain/rotations.js';
import { SEED_ROTATIONS } from './roster.js';

/**
 * The real workbook week of Aug 2–8, 2026. Toggle states are the cadence
 * engine's own Aug 2 proposal — Task 4's parity test proves that equals the
 * workbook's Week Setup sheet.
 */
export const WEEK_AUG02 = {
  startDate: '2026-08-02',
  dvmCounts: { Sun: 2, Mon: 5, Tue: 4, Wed: 4, Thu: 4, Fri: 4, Sat: 2 },
  toggleStates: proposeToggles(SEED_ROTATIONS, '2026-08-02'),
  toggleConfirmed: true,
  status: 'draft',
  overrides: {
    'alonzo-evelyn': { Thu: 'OFF', Fri: { role: 'VA' } },
    'gallegos-angie': {
      Tue: { role: 'VA', label: 'VA (until 5 PM)', hours: 9.5 },
      Thu: { role: 'VA' },
    },
    'hooper-camila': { Fri: 'OFF' },
    'lopez-jennifer': { Mon: { role: 'VA' }, Tue: 'OFF' },
    'mariscal-paulina': { Fri: 'OFF' },
    'quinonez-mariel': { Wed: { role: 'VA', timeNote: '9a', hours: 9.5 } },
    'sharko-chloe': { Tue: 'OFF', Sat: { role: 'RVT' } },
  },
};

/** Time-Off Input sheet rows that match roster members (Apply=Y → decision granted). */
export const REQUESTS_AUG02 = [
  { id: 'req-1', submittedAt: '2026-04-11T20:02:00', employeeName: 'Gallegos, Angela', empNum: '138', status: 'Pending', startDate: '2026-08-08', hours: 10, days: 1, staffId: 'gallegos-angie', decision: 'granted' },
  { id: 'req-2', submittedAt: '2026-05-13T12:20:00', employeeName: 'Gallegos, Angela', empNum: '138', status: 'Approved', startDate: '2026-08-04', hours: 1, days: 1, staffId: 'gallegos-angie', decision: null },
  { id: 'req-3', submittedAt: '2026-05-14T12:37:00', employeeName: 'Escalante, Aidee', empNum: '115', status: 'Approved', startDate: '2026-08-04', hours: 2, days: 1, staffId: 'escalante-aidee', decision: null },
  { id: 'req-4', submittedAt: '2026-06-16T13:57:17', employeeName: 'Gardner, Theresa', empNum: '240', status: 'Approved', startDate: '2026-08-02', hours: 0, days: 1, staffId: 'gardner-theresa', decision: null },
  { id: 'req-5', submittedAt: '2026-06-16T13:57:17', employeeName: 'Gardner, Theresa', empNum: '240', status: 'Approved', startDate: '2026-08-03', hours: 0, days: 1, staffId: 'gardner-theresa', decision: null },
  { id: 'req-6', submittedAt: '2026-06-16T13:57:17', employeeName: 'Gardner, Theresa', empNum: '240', status: 'Approved', startDate: '2026-08-04', hours: 0, days: 1, staffId: 'gardner-theresa', decision: null },
  { id: 'req-7', submittedAt: '2026-06-19T08:36:00', employeeName: 'Pearl, Leanne', empNum: '113', status: 'Pending', startDate: '2026-08-08', hours: 10, days: 1, staffId: 'pearl-leanne', decision: null },
  { id: 'req-8', submittedAt: '2026-06-23T13:35:00', employeeName: 'Willis, Breanne', empNum: '150', status: 'Pending', startDate: '2026-08-04', hours: 10, days: 1, staffId: 'willis-bree', decision: 'granted' },
  { id: 'req-9', submittedAt: '2026-07-06T21:34:00', employeeName: 'Rodriguez, Glenda', empNum: '243', status: 'Pending', startDate: '2026-08-07', hours: 30, days: 3, staffId: 'rodriguez-glenda', decision: null },
];
```

`src/data/expected-aug02.js`:

```js
/**
 * Expected output — the workbook's Proposed Schedule sheet, cell for cell.
 * Days omitted from a row are expected to be empty.
 */
export const EXPECTED_GRID = {
  'alonzo-evelyn': { Tue: 'VA', Wed: 'VA', Fri: 'VA', Sat: 'VA' },
  'alvarez-marvette': { Sun: 'VA', Tue: 'VA', Thu: 'VA', Sat: 'VA' },
  'burchnell-cayla': {},
  'corneau-lopez-michaela': { Sun: 'VA', Mon: 'VA', Tue: 'Tech NC · until 1:00 PM' },
  'cuevas-minjarez-paulina': { Mon: 'VA', Wed: 'VA', Thu: 'VA', Fri: 'VA' },
  'dimino-aaron': { Wed: 'ADMIN', Thu: 'RVT', Fri: 'RVT', Sat: 'RVT' },
  'escalante-aidee': { Tue: 'VA · EARLY LEAVE', Wed: 'VA', Thu: 'VA', Fri: 'VA' },
  'gallegos-angie': { Tue: 'VA (until 5 PM)', Thu: 'VA', Fri: 'RVT', Sat: 'PTO' },
  'garcia-lorena': { Mon: 'VA', Tue: 'VA', Wed: 'VA', Sat: 'VA' },
  'gardner-theresa': {
    Sun: 'UNPAID OFF', Mon: 'UNPAID OFF', Tue: 'UNPAID OFF',
    Wed: 'RVT (7:30–4:30)', Thu: 'PB', Fri: 'RVT (7:30–4:30)',
  },
  'hobbs-keith': { Sun: 'VA', Mon: 'VA', Tue: 'VA', Fri: 'VA' },
  'hooper-camila': { Sun: 'VA', Mon: 'VA', Wed: 'PHARM', Thu: 'VA' },
  'lopez-jennifer': { Mon: 'VA', Wed: 'VA', Thu: 'VA', Fri: 'VA' },
  'mariscal-paulina': { Mon: 'VA', Tue: 'VA', Wed: 'VA', Sat: 'VA' },
  'mendez-jorge': { Mon: 'VA', Tue: 'VA', Wed: 'VA', Thu: 'VA' },
  'nenneman-tyler': { Mon: 'PHARM', Tue: 'PHARM', Thu: 'PHARM', Fri: 'PHARM' },
  'paz-vero': { Mon: 'VA', Tue: 'VA', Thu: 'VA', Fri: 'VA' },
  'pearl-leanne': { Wed: 'HSS', Thu: 'HSS', Fri: 'HSS', Sat: 'HSS' },
  'prado-carla': { Tue: 'RVT', Wed: 'RVT', Thu: 'RVT' },
  'quinonez-mariel': { Mon: 'RVT (9a)', Tue: 'RVT (9a)', Wed: 'VA (9a)', Thu: 'ADMIN (9a)' },
  'rodriguez-glenda': { Sun: 'VA', Mon: 'VA', Thu: 'VA', Fri: 'VA' },
  'ross-shana': { Sun: 'RVT', Mon: 'RVT', Tue: 'PB', Fri: 'VA' },
  'russaw-jonelle': { Tue: 'VA', Wed: 'VA', Thu: 'VA', Sat: 'VA' },
  'sharko-chloe': { Sun: 'RVT', Mon: 'VA', Fri: 'MONITOR', Sat: 'RVT' },
  'timmons-michelle': { Mon: 'HSS', Tue: 'HSS', Wed: 'ADMIN' },
  'tolden-teagan': { Mon: 'RVT', Tue: 'RVT', Wed: 'RVT', Thu: 'RVT' },
  'torres-damali': { Mon: 'VA', Wed: 'VA', Thu: 'VA', Fri: 'VA' },
  'willis-bree': { Tue: 'PTO' },
};

/** Coverage Check sheet, arrays in DAYS order (Sun…Sat). */
export const EXPECTED_COVERAGE = {
  VA: { scheduled: [5, 12, 10, 10, 11, 10, 5], target: [5, 12, 10, 10, 10, 10, 5] },
  RVT: { scheduled: [2, 3, 3, 3, 3, 3, 2], target: [2, 3, 3, 3, 3, 3, 2] },
  HSS: { scheduled: [0, 1, 1, 1, 1, 1, 1], target: [0, 1, 1, 1, 1, 1, 1] },
  PHARM: { scheduled: [0, 1, 1, 1, 1, 1, 0], target: [0, 1, 1, 1, 1, 1, 0] },
  ADMIN: { scheduled: [0, 0, 0, 2, 1, 0, 0] },
};

export const EXPECTED_STATUS = [
  'ON TARGET', 'ON TARGET', 'ON TARGET', 'ON TARGET', 'OVER +1', 'ON TARGET', 'ON TARGET',
];
```

- [ ] **Step 2: Write the failing parity test**

`src/data/parity-aug02.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { buildWeek } from '../domain/build.js';
import { coverageCheck } from '../domain/coverage.js';
import { targetsForWeek } from '../domain/targets.js';
import { formatCell } from '../domain/cells.js';
import { DAYS } from '../domain/calendar.js';
import { SEED_ROSTER } from './roster.js';
import { WEEK_AUG02, REQUESTS_AUG02 } from './week-aug02.js';
import { EXPECTED_GRID, EXPECTED_COVERAGE, EXPECTED_STATUS } from './expected-aug02.js';

describe('Excel parity — Aug 2–8, 2026 (the trust proof)', () => {
  const built = buildWeek({ roster: SEED_ROSTER, week: WEEK_AUG02, requests: REQUESTS_AUG02 });
  const report = coverageCheck(built, targetsForWeek(WEEK_AUG02));

  it('reproduces the Proposed Schedule sheet cell-for-cell', () => {
    const mismatches = [];
    for (const staff of SEED_ROSTER) {
      for (const day of DAYS) {
        const got = formatCell(built.cells[staff.id][day]);
        const want = EXPECTED_GRID[staff.id][day] ?? '';
        if (got !== want) mismatches.push(`${staff.id} ${day}: got "${got}", want "${want}"`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('reproduces the Coverage Check sheet', () => {
    for (const [role, { scheduled, target }] of Object.entries(EXPECTED_COVERAGE)) {
      DAYS.forEach((day, i) => {
        const r = report.days[day].roles[role];
        expect(r.scheduled, `${role} ${day} scheduled`).toBe(scheduled[i]);
        if (target) expect(r.target, `${role} ${day} target`).toBe(target[i]);
      });
    }
  });

  it("reproduces the day statuses including Thursday's OVER +1", () => {
    expect(DAYS.map((day) => report.days[day].status)).toEqual(EXPECTED_STATUS);
  });
});
```

- [ ] **Step 3: Run the parity test**

Run: `npx vitest run src/data/parity-aug02.test.js`
Expected: likely FAIL on first run with a short mismatch list. **Debug protocol:** every mismatch names staff, day, got, want. Trace that cell through the pipeline order (pattern → toggle → time off → override) against the workbook sheets. Fix `build.js`/`coverage.js`/`targets.js` or a Task 3 transcription slip (verify against the workbook before touching seed data). Do not edit `expected-aug02.js` — it is the workbook.

- [ ] **Step 4: Run the full suite**

Run: `npx vitest run`
Expected: PASS — all files green, including the three parity tests.

- [ ] **Step 5: Commit**

```bash
git add src/data
git commit -m "test(parity): engine reproduces the workbook's Aug 2-8 week exactly"
```

---

### Task 9: Rulebook and evaluateWeek

**Files:**
- Create: `src/domain/rules.js`
- Test: `src/domain/rules.test.js`

**Interfaces:**
- Consumes: built/coverage shapes (Tasks 6–7), `isApplied`, `requestDates`, `classifyRequest` (Task 5), fixtures (Task 8, test only).
- Produces:
  - `SEVERITY = { fixed: 'hard', flexible: 'soft', highlyFlexible: 'info' }`
  - `SEED_RULEBOOK` — rule instances `{id, template, params, flexibility, note}` encoding the README's standing rules
  - `evaluateWeek({built, week, roster, requests, coverage, rulebook}) → Violation[]` where Violation = `{ruleId, severity:'hard'|'soft'|'info', message, staffId?, day?, role?}`, sorted hard→soft→info.
  - Template names (closed set): `roleCoverageTarget`, `consecutiveDaysOff` (evaluated **circularly** within the week — Sat and Sun adjacent, since patterns repeat weekly), `fixedWorkDays`, `personDayRole`, `noWorkDays`, `forbiddenAssignment`, `maxDaysPerWeek`, `emergencyOnly`, `overtime`, `undertime` (paid-credited: worked hours + applied paid/partial request hours vs `standardHours`; skip staff with standardHours 0).

- [ ] **Step 1: Write the failing test**

`src/domain/rules.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { evaluateWeek, SEED_RULEBOOK, SEVERITY } from './rules.js';
import { buildWeek } from './build.js';
import { coverageCheck } from './coverage.js';
import { targetsForWeek } from './targets.js';
import { shift } from './cells.js';
import { SEED_ROSTER } from '../data/roster.js';
import { WEEK_AUG02, REQUESTS_AUG02 } from '../data/week-aug02.js';

const week = (patch = {}) => ({
  startDate: '2026-08-02',
  dvmCounts: { Sun: 0, Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0 },
  toggleStates: [], overrides: {}, ...patch,
});

function run(roster, w, requests = [], rulebook = SEED_RULEBOOK) {
  const built = buildWeek({ roster, week: w, requests });
  const coverage = coverageCheck(built, targetsForWeek(w));
  return evaluateWeek({ built, week: w, roster, requests, coverage, rulebook });
}

describe('rule templates', () => {
  it('maps flexibility to severity', () => {
    expect(SEVERITY).toEqual({ fixed: 'hard', flexible: 'soft', highlyFlexible: 'info' });
  });
  it('flags coverage shortfalls with the rule severity', () => {
    // Empty schedule, Monday needs RVTs (weekday target 3)
    const out = run([], week());
    const rvtMon = out.find((v) => v.ruleId === 'cov-rvt' && v.day === 'Mon');
    expect(rvtMon).toMatchObject({ severity: 'hard', role: 'RVT' });
  });
  it('checks consecutive days off circularly and honors exemptions', () => {
    const iso = { id: 'x', role: 'VA', standardHours: 40, constraints: {}, // off Sun, Fri — never 2 in a row even circularly
      pattern: { Mon: shift('VA'), Tue: shift('VA'), Wed: shift('VA'), Thu: shift('VA'), Sat: shift('VA') } };
    expect(run([iso], week()).some((v) => v.ruleId === 'consec-off' && v.staffId === 'x')).toBe(true);
    const wrap = { ...iso, id: 'y', // off Sun, Wed, Sat — Sat+Sun wrap makes a pair
      pattern: { Mon: shift('VA'), Tue: shift('VA'), Thu: shift('VA'), Fri: shift('VA') } };
    expect(run([wrap], week()).some((v) => v.ruleId === 'consec-off' && v.staffId === 'y')).toBe(false);
    const exempt = { ...iso, id: 'alvarez-marvette', constraints: { consecutiveOffExempt: true } };
    expect(run([exempt], week()).some((v) => v.ruleId === 'consec-off')).toBe(false);
  });
  it('enforces person rules: fixed days, day-role locks, no-days, forbidden roles, max days, emergency-only', () => {
    const staff = (id, pattern) => ({ id, role: 'RVT', standardHours: 40, constraints: {}, pattern });
    const out = run(
      [
        staff('alvarez-marvette', { Wed: shift('VA') }),          // outside her fixed days
        staff('sharko-chloe', { Mon: shift('RVT') }),             // Monday must be VA
        staff('mariscal-paulina', { Sun: shift('VA') }),          // no Sundays
        staff('tolden-teagan', { Fri: shift('MONITOR') }),        // never dental
        staff('corneau-lopez-michaela', { Sun: shift('VA'), Mon: shift('VA'), Tue: shift('VA'), Wed: shift('VA') }),
        staff('burchnell-cayla', { Thu: shift('HSS') }),          // emergency backup only
      ],
      week()
    );
    for (const ruleId of ['fixed-marvette', 'lock-chloe-mon', 'noday-mariscal', 'forbid-teagan', 'maxdays-michaela', 'emergency-cayla']) {
      expect(out.some((v) => v.ruleId === ruleId), ruleId).toBe(true);
    }
  });
  it('flags overtime as info and undertime as soft, crediting paid time off', () => {
    const five = { id: 'a', role: 'VA', standardHours: 40, constraints: {},
      pattern: { Mon: shift('VA'), Tue: shift('VA'), Wed: shift('VA'), Thu: shift('VA'), Fri: shift('VA') } };
    expect(run([five], week()).find((v) => v.ruleId === 'overtime')).toMatchObject({ severity: 'info', staffId: 'a' });
    const three = { id: 'b', role: 'VA', standardHours: 40, constraints: {},
      pattern: { Mon: shift('VA'), Tue: shift('VA'), Wed: shift('VA') } };
    expect(run([three], week()).find((v) => v.ruleId === 'undertime')).toMatchObject({ severity: 'soft', staffId: 'b' });
    const covered = [{ ...three, id: 'c' }];
    const paid = [{ staffId: 'c', status: 'Approved', decision: null, startDate: '2026-08-06', hours: 10, days: 1, submittedAt: 'x' }];
    expect(run(covered, week(), paid).some((v) => v.ruleId === 'undertime' && v.staffId === 'c')).toBe(false);
  });
  it('on the real Aug 2 week: no hard violations, and exactly Gardner undertime as soft', () => {
    const out = run(SEED_ROSTER, WEEK_AUG02, REQUESTS_AUG02);
    expect(out.filter((v) => v.severity === 'hard')).toEqual([]);
    const soft = out.filter((v) => v.severity === 'soft');
    expect(soft).toHaveLength(1);
    expect(soft[0]).toMatchObject({ ruleId: 'undertime', staffId: 'gardner-theresa' });
    expect(soft[0].message).toContain('makeup');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/domain/rules.test.js`
Expected: FAIL — `Cannot find module './rules.js'`.

- [ ] **Step 3: Implement**

`src/domain/rules.js`:

```js
import { DAYS } from './calendar.js';
import { isApplied, requestDates, classifyRequest } from './timeoff.js';
import { dayForDate } from './calendar.js';

export const SEVERITY = { fixed: 'hard', flexible: 'soft', highlyFlexible: 'info' };

const ORDER = { hard: 0, soft: 1, info: 2 };

function v(rule, extra) {
  return { ruleId: rule.id, severity: SEVERITY[rule.flexibility], ...extra };
}

function shiftDays(cells) {
  return DAYS.filter((d) => cells[d]?.kind === 'shift');
}

function workedHours(cells) {
  return DAYS.reduce((h, d) => h + (cells[d]?.kind === 'shift' ? cells[d].hours : 0), 0);
}

/** Longest circular run of consecutive off days (Sat wraps to Sun — patterns repeat weekly). */
function longestOffRun(cells) {
  const off = DAYS.map((d) => !cells[d] || cells[d].kind === 'off');
  if (off.every(Boolean)) return 7;
  let best = 0;
  let run = 0;
  for (const isOff of [...off, ...off]) { // doubled array = circular scan
    run = isOff ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return Math.min(best, 7);
}

const TEMPLATES = {
  roleCoverageTarget({ rule, coverage }) {
    const { role } = rule.params;
    const out = [];
    for (const day of DAYS) {
      const r = coverage.days[day].roles[role];
      if (r.variance < 0) {
        out.push(v(rule, { day, role, message: `${role} short ${-r.variance} on ${day} (${r.scheduled} of ${r.target}). ${rule.note}` }));
      }
    }
    return out;
  },
  consecutiveDaysOff({ rule, built, roster }) {
    const out = [];
    for (const staff of roster) {
      if (rule.params.exempt?.includes(staff.id) || staff.constraints.consecutiveOffExempt) continue;
      if (longestOffRun(built.cells[staff.id]) < rule.params.minRun) {
        out.push(v(rule, { staffId: staff.id, message: `${staff.displayName ?? staff.id} has no ${rule.params.minRun} consecutive days off this week. ${rule.note}` }));
      }
    }
    return out;
  },
  fixedWorkDays({ rule, built }) {
    const { staffId, days } = rule.params;
    const cells = built.cells[staffId] ?? {};
    return shiftDays(cells)
      .filter((d) => !days.includes(d))
      .map((d) => v(rule, { staffId, day: d, message: `${staffId} is locked to ${days.join('/')} and is scheduled ${d}. ${rule.note}` }));
  },
  personDayRole({ rule, built }) {
    const { staffId, day, role } = rule.params;
    const cell = built.cells[staffId]?.[day];
    if (cell?.kind === 'shift' && cell.role !== role) {
      return [v(rule, { staffId, day, role, message: `${staffId} works ${day} as ${cell.role}, but ${day} is always ${role}. ${rule.note}` })];
    }
    return [];
  },
  noWorkDays({ rule, built }) {
    const { staffId, days } = rule.params;
    const cells = built.cells[staffId] ?? {};
    return days
      .filter((d) => cells[d]?.kind === 'shift')
      .map((d) => v(rule, { staffId, day: d, message: `${staffId} is scheduled ${d}, a day they never work. ${rule.note}` }));
  },
  forbiddenAssignment({ rule, built }) {
    const { staffId, roles } = rule.params;
    const cells = built.cells[staffId] ?? {};
    return shiftDays(cells)
      .filter((d) => roles.includes(cells[d].role))
      .map((d) => v(rule, { staffId, day: d, role: cells[d].role, message: `${staffId} is assigned ${cells[d].role} on ${d}. ${rule.note}` }));
  },
  maxDaysPerWeek({ rule, built }) {
    const { staffId, max } = rule.params;
    const n = shiftDays(built.cells[staffId] ?? {}).length;
    return n > max ? [v(rule, { staffId, message: `${staffId} is scheduled ${n} days; their maximum is ${max}. ${rule.note}` })] : [];
  },
  emergencyOnly({ rule, built }) {
    const { staffId } = rule.params;
    const n = shiftDays(built.cells[staffId] ?? {}).length;
    return n > 0 ? [v(rule, { staffId, message: `${staffId} is scheduled ${n} day(s) but is an emergency backup only. ${rule.note}` })] : [];
  },
  overtime({ rule, built, roster }) {
    const out = [];
    for (const staff of roster) {
      const h = workedHours(built.cells[staff.id]);
      if (h > rule.params.maxHours) {
        out.push(v(rule, { staffId: staff.id, message: `${staff.displayName ?? staff.id} is at ${h}h (over ${rule.params.maxHours}h). ${rule.note}` }));
      }
    }
    return out;
  },
  undertime({ rule, built, week, roster, requests }) {
    const out = [];
    for (const staff of roster) {
      if (!staff.standardHours) continue;
      const worked = workedHours(built.cells[staff.id]);
      let paidOff = 0;
      let unpaidDays = 0;
      for (const req of requests ?? []) {
        if (req.staffId !== staff.id || !isApplied(req)) continue;
        const inWeek = requestDates(req).some((date) => dayForDate(week.startDate, date));
        if (!inWeek) continue;
        if (classifyRequest(req) === 'UNPAID') unpaidDays += req.days;
        else paidOff += req.hours;
      }
      const shortfall = staff.standardHours - worked - paidOff;
      if (shortfall > 0) {
        const makeup = unpaidDays > 0 ? ` Unpaid time off — makeup shifts owed.` : '';
        out.push(v(rule, { staffId: staff.id, message: `${staff.displayName ?? staff.id} is ${shortfall}h under their ${staff.standardHours}h standard.${makeup} ${rule.note}` }));
      }
    }
    return out;
  },
};

/** The README sheet's standing rules, as editable instances. */
export const SEED_RULEBOOK = [
  { id: 'cov-va', template: 'roleCoverageTarget', params: { role: 'VA' }, flexibility: 'fixed', note: 'Two VAs per doctor plus monitor and floater — not flexible.' },
  { id: 'cov-rvt', template: 'roleCoverageTarget', params: { role: 'RVT' }, flexibility: 'fixed', note: 'Weekday RVT split: 1 surgery + 2 dental (Teagan surgery/VA only).' },
  { id: 'cov-hss', template: 'roleCoverageTarget', params: { role: 'HSS' }, flexibility: 'fixed', note: 'Sunday HSS only on Bree\'s ON weeks.' },
  { id: 'cov-pharm', template: 'roleCoverageTarget', params: { role: 'PHARM' }, flexibility: 'flexible', note: 'Pharmacy backups: Camila (#1, Wed default), Damali (#2).' },
  { id: 'consec-off', template: 'consecutiveDaysOff', params: { minRun: 2, exempt: ['alvarez-marvette'] }, flexibility: 'flexible', note: 'Everyone gets at least 2 consecutive days off.' },
  { id: 'fixed-marvette', template: 'fixedWorkDays', params: { staffId: 'alvarez-marvette', days: ['Sun', 'Tue', 'Thu', 'Sat'] }, flexibility: 'fixed', note: 'Mexico commute — needs the rest day between shifts.' },
  { id: 'lock-chloe-mon', template: 'personDayRole', params: { staffId: 'sharko-chloe', day: 'Mon', role: 'VA' }, flexibility: 'fixed', note: 'Chloe is VA every Monday.' },
  { id: 'lock-chloe-fri', template: 'personDayRole', params: { staffId: 'sharko-chloe', day: 'Fri', role: 'MONITOR' }, flexibility: 'fixed', note: 'Chloe runs dental monitor every Friday.' },
  { id: 'noday-mariscal', template: 'noWorkDays', params: { staffId: 'mariscal-paulina', days: ['Sun'] }, flexibility: 'fixed', note: 'Paulina M works no Sundays.' },
  { id: 'noday-shana', template: 'noWorkDays', params: { staffId: 'ross-shana', days: ['Sat'] }, flexibility: 'fixed', note: 'Shana works no Saturdays.' },
  { id: 'noday-carla', template: 'noWorkDays', params: { staffId: 'prado-carla', days: ['Sun', 'Mon', 'Fri', 'Sat'] }, flexibility: 'fixed', note: 'Carla works Tue–Thu only.' },
  { id: 'forbid-teagan', template: 'forbiddenAssignment', params: { staffId: 'tolden-teagan', roles: ['MONITOR'] }, flexibility: 'fixed', note: 'Teagan: surgery RVT or VA only — never dental.' },
  { id: 'maxdays-michaela', template: 'maxDaysPerWeek', params: { staffId: 'corneau-lopez-michaela', max: 3 }, flexibility: 'fixed', note: 'Michaela is part-time, 3 days.' },
  { id: 'emergency-cayla', template: 'emergencyOnly', params: { staffId: 'burchnell-cayla' }, flexibility: 'flexible', note: 'Cayla is the emergency HSS backup only.' },
  { id: 'overtime', template: 'overtime', params: { maxHours: 40 }, flexibility: 'highlyFlexible', note: 'Minimize overtime — highly flexible.' },
  { id: 'undertime', template: 'undertime', params: {}, flexibility: 'flexible', note: 'Nobody silently loses hours.' },
];

/** Run every enabled rule instance; hard violations sort first. */
export function evaluateWeek(ctx) {
  const out = [];
  for (const rule of ctx.rulebook) {
    if (rule.disabled) continue;
    const evaluate = TEMPLATES[rule.template];
    if (evaluate) out.push(...evaluate({ ...ctx, rule }));
  }
  return out.sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/domain/rules.test.js`
Expected: PASS — 6 tests. The Aug 2 case is the second parity tripwire: the real week must produce **zero hard violations and exactly one soft** (Gardner's unpaid-time undertime). If extras appear, a template is too eager — fix the template, not the test.

- [ ] **Step 5: Commit**

```bash
git add src/domain/rules.js src/domain/rules.test.js
git commit -m "feat(domain): rulebook templates with flexibility ratings and evaluateWeek"
```

---

### Task 10: Repair suggestions with measured impact

**Files:**
- Create: `src/domain/suggestions.js`
- Test: `src/domain/suggestions.test.js`

**Interfaces:**
- Consumes: `buildWeek`, `coverageCheck`, `targetsForWeek`, `evaluateWeek` (Tasks 6–9).
- Produces:
  - `applyActionsToWeek(week, actions) → week` — pure; understands `{type:'SET_OVERRIDE', weekId, staffId, day, value}` and `{type:'CLEAR_OVERRIDE', weekId, staffId, day}`. **Task 12's reducer must produce identical week records for the same actions — its test dispatches every generated suggestion to prove it.**
  - `generateSuggestions({roster, week, requests, rulebook, pullOrder}) → Suggestion[]` where Suggestion = `{id, kind:'pull'|'add', title, day, role, staffId, actions, impact:{shortDelta, hardDelta, softDelta}}`.
  - Rules of the generator: only fills negative-variance gaps; for VA gaps, **pull-order RVT re-roles come first** (only when that day's RVT variance is positive), then off-duty same-role adds; candidates must pass constraints (noDays, fixedDays, maxDaysPerWeek, emergencyOnly, not already scheduled or off that day); every suggestion's impact is **measured by simulating the actions**, and any suggestion that fails to reduce shorts or that adds a hard violation is discarded; at most 3 suggestions per gap.

- [ ] **Step 1: Write the failing test**

`src/domain/suggestions.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { generateSuggestions, applyActionsToWeek } from './suggestions.js';
import { buildWeek } from './build.js';
import { coverageCheck } from './coverage.js';
import { targetsForWeek } from './targets.js';
import { shift } from './cells.js';
import { SEED_RULEBOOK } from './rules.js';
import { SEED_ROSTER, PULL_ORDER } from '../data/roster.js';
import { WEEK_AUG02, REQUESTS_AUG02 } from '../data/week-aug02.js';

const week = (dvmMon = 0) => ({
  startDate: '2026-08-02',
  dvmCounts: { Sun: 0, Mon: dvmMon, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0 },
  toggleStates: [], overrides: {},
});
const staff = (id, role, pattern, constraints = {}) => ({
  id, displayName: id, paylocityName: id, role, standardHours: 40, pattern, constraints,
});

describe('repair suggestions', () => {
  it('offers eligible off-duty adds and excludes constrained staff', () => {
    const roster = [
      staff('va1', 'VA', {}),
      staff('va2', 'VA', {}, { noDays: ['Mon'] }),
      staff('r1', 'RVT', { Mon: shift('RVT') }),
      staff('r2', 'RVT', { Mon: shift('RVT') }),
      staff('r3', 'RVT', { Mon: shift('RVT') }),
    ];
    const out = generateSuggestions({ roster, week: week(), requests: [], rulebook: SEED_RULEBOOK, pullOrder: [] });
    const vaMon = out.filter((s) => s.day === 'Mon' && s.role === 'VA');
    expect(vaMon.map((s) => s.staffId)).toEqual(['va1']); // va2's no-Mondays excludes her; RVTs are at target, no pull
  });
  it('pulls surplus on-duty RVTs to VA in pull order, before bench adds', () => {
    const roster = [
      staff('va1', 'VA', {}),
      staff('r1', 'RVT', { Mon: shift('RVT') }),
      staff('r2', 'RVT', { Mon: shift('RVT') }),
      staff('r3', 'RVT', { Mon: shift('RVT') }),
      staff('r4', 'RVT', { Mon: shift('RVT') }), // RVT variance +1 on Mon
    ];
    // pullOrder lists only r2 — with the 3-per-gap cap, a full pull list would evict the bench add
    const out = generateSuggestions({ roster, week: week(), requests: [], rulebook: SEED_RULEBOOK, pullOrder: ['r2'] });
    const vaMon = out.filter((s) => s.day === 'Mon' && s.role === 'VA');
    expect(vaMon[0]).toMatchObject({ kind: 'pull', staffId: 'r2' });
    expect(vaMon.some((s) => s.kind === 'add' && s.staffId === 'va1')).toBe(true);
  });
  it('reports impact that matches actually applying the actions', () => {
    const roster = [
      staff('va1', 'VA', {}),
      staff('r1', 'RVT', { Mon: shift('RVT') }),
      staff('r2', 'RVT', { Mon: shift('RVT') }),
      staff('r3', 'RVT', { Mon: shift('RVT') }),
    ];
    const w = week();
    const out = generateSuggestions({ roster, week: w, requests: [], rulebook: SEED_RULEBOOK, pullOrder: [] });
    const short = (wk) => {
      const built = buildWeek({ roster, week: wk, requests: [] });
      const cov = coverageCheck(built, targetsForWeek(wk));
      return Object.values(cov.days).reduce((n, d) => n + d.short, 0);
    };
    for (const s of out) {
      const before = short(w);
      const after = short(applyActionsToWeek(w, s.actions));
      expect(after - before, s.id).toBe(s.impact.shortDelta);
    }
  });
  it('generates nothing for the on-target real Aug 2 week', () => {
    const out = generateSuggestions({
      roster: SEED_ROSTER, week: WEEK_AUG02, requests: REQUESTS_AUG02,
      rulebook: SEED_RULEBOOK, pullOrder: PULL_ORDER,
    });
    expect(out).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/domain/suggestions.test.js`
Expected: FAIL — `Cannot find module './suggestions.js'`.

- [ ] **Step 3: Implement**

`src/domain/suggestions.js`:

```js
import { DAYS } from './calendar.js';
import { COVERAGE_ROLES } from './cells.js';
import { buildWeek } from './build.js';
import { coverageCheck } from './coverage.js';
import { targetsForWeek } from './targets.js';
import { evaluateWeek } from './rules.js';

/** Pure action application — the reducer (Task 12) must behave identically. */
export function applyActionsToWeek(week, actions) {
  const next = structuredClone(week);
  for (const a of actions) {
    if (a.type === 'SET_OVERRIDE') {
      next.overrides[a.staffId] = { ...(next.overrides[a.staffId] ?? {}), [a.day]: a.value };
    } else if (a.type === 'CLEAR_OVERRIDE' && next.overrides[a.staffId]) {
      delete next.overrides[a.staffId][a.day];
    }
  }
  return next;
}

function snapshot({ roster, week, requests, rulebook }) {
  const built = buildWeek({ roster, week, requests });
  const coverage = coverageCheck(built, targetsForWeek(week));
  const violations = evaluateWeek({ built, week, roster, requests, coverage, rulebook });
  return {
    built, coverage,
    totalShort: DAYS.reduce((n, d) => n + coverage.days[d].short, 0),
    hard: violations.filter((x) => x.severity === 'hard').length,
    soft: violations.filter((x) => x.severity === 'soft').length,
  };
}

function isEligible(staff, day, cells) {
  if (cells[day]) return false; // already scheduled, or on time off
  const c = staff.constraints ?? {};
  if (c.emergencyOnly) return false;
  if (c.noDays?.includes(day)) return false;
  if (c.fixedDays && !c.fixedDays.includes(day)) return false;
  const worked = DAYS.filter((d) => cells[d]?.kind === 'shift').length;
  if (c.maxDaysPerWeek && worked >= c.maxDaysPerWeek) return false;
  return true;
}

/** Gap repairs the way the manager does them: pull order first, bench second, impact measured. */
export function generateSuggestions({ roster, week, requests, rulebook, pullOrder }) {
  const base = snapshot({ roster, week, requests, rulebook });
  const suggestions = [];
  for (const day of DAYS) {
    for (const role of COVERAGE_ROLES) {
      if (base.coverage.days[day].roles[role].variance >= 0) continue;
      /** @type {Array<{staffId: string, kind: 'pull'|'add'}>} */
      const candidates = [];
      if (role === 'VA' && base.coverage.days[day].roles.RVT.variance > 0) {
        for (const id of pullOrder) {
          const cell = base.built.cells[id]?.[day];
          if (cell?.kind === 'shift' && cell.role === 'RVT') candidates.push({ staffId: id, kind: 'pull' });
        }
      }
      for (const s of roster) {
        if (s.role === role && isEligible(s, day, base.built.cells[s.id])) {
          candidates.push({ staffId: s.id, kind: 'add' });
        }
      }
      let kept = 0;
      for (const cand of candidates) {
        if (kept >= 3) break;
        const actions = [{ type: 'SET_OVERRIDE', weekId: week.startDate, staffId: cand.staffId, day, value: { role } }];
        const after = snapshot({ roster, week: applyActionsToWeek(week, actions), requests, rulebook });
        const impact = {
          shortDelta: after.totalShort - base.totalShort,
          hardDelta: after.hard - base.hard,
          softDelta: after.soft - base.soft,
        };
        if (impact.shortDelta >= 0 || impact.hardDelta > 0) continue;
        const staff = roster.find((x) => x.id === cand.staffId);
        suggestions.push({
          id: `fill-${day}-${role}-${cand.staffId}`,
          kind: cand.kind, day, role, staffId: cand.staffId, actions, impact,
          title: cand.kind === 'pull'
            ? `Pull ${staff.displayName} (RVT) to ${role} on ${day}`
            : `Add ${staff.displayName} to ${role} on ${day}`,
        });
        kept += 1;
      }
    }
  }
  return suggestions;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/domain/suggestions.test.js`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/domain/suggestions.js src/domain/suggestions.test.js
git commit -m "feat(domain): pull-order repair suggestions with measured impact"
```

---

### Task 11: Month metrics

**Files:**
- Create: `src/domain/metrics.js`
- Test: `src/domain/metrics.test.js`

**Interfaces:**
- Consumes: built shape (Task 6).
- Produces:
  - `gini(values) → 0..1` (0 = perfectly even; 0 for empty or all-zero input)
  - `weekendEquity(builtWeeks, roster) → {byStaff: {[staffId]: count}, gini}` — Sat+Sun shift cells pooled across the horizon (pooled, not averaged — spec), over staff who work at all in the horizon
  - `hoursReport(builtWeeks, roster) → [{staffId, displayName, weekHours: number[], total, standard, delta}]` with `standard = standardHours × weeks` (skips standardHours 0 staff)

- [ ] **Step 1: Write the failing test**

`src/domain/metrics.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { gini, weekendEquity, hoursReport } from './metrics.js';
import { shift } from './cells.js';

const builtWith = (cells) => ({ weekStart: '2026-08-02', cells });
const staff = (id, standardHours = 40) => ({ id, displayName: id, role: 'VA', standardHours, pattern: {}, constraints: {} });

describe('month metrics', () => {
  it('computes gini: even → 0, concentrated → high, degenerate → 0', () => {
    expect(gini([2, 2, 2, 2])).toBe(0);
    expect(gini([4, 0, 0, 0])).toBeCloseTo(0.75);
    expect(gini([])).toBe(0);
    expect(gini([0, 0])).toBe(0);
  });
  it('pools weekend shifts across the horizon', () => {
    const w1 = builtWith({ a: { Sat: shift('VA'), Mon: shift('VA') }, b: { Mon: shift('VA') } });
    const w2 = builtWith({ a: { Sun: shift('VA') }, b: { Tue: shift('VA') } });
    const eq = weekendEquity([w1, w2], [staff('a'), staff('b'), staff('idle')]);
    expect(eq.byStaff).toEqual({ a: 2, b: 0 }); // idle never works → not in the pool
    expect(eq.gini).toBeCloseTo(0.5);
  });
  it('reports hours vs standard across weeks', () => {
    const w1 = builtWith({ a: { Mon: shift('VA'), Tue: shift('VA') } }); // 20h
    const w2 = builtWith({ a: { Mon: shift('VA') } });                   // 10h
    const [row] = hoursReport([w1, w2], [staff('a'), staff('zero', 0)]);
    expect(row).toMatchObject({ staffId: 'a', weekHours: [20, 10], total: 30, standard: 80, delta: -50 });
    expect(hoursReport([w1, w2], [staff('zero', 0)])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/domain/metrics.test.js`
Expected: FAIL — `Cannot find module './metrics.js'`.

- [ ] **Step 3: Implement**

`src/domain/metrics.js`:

```js
import { DAYS } from './calendar.js';

const WEEKEND = ['Sun', 'Sat'];

/** Gini coefficient — 0 is perfectly even. Max−min saturates on real rosters; gini does not. */
export function gini(values) {
  const n = values.length;
  const sum = values.reduce((a, b) => a + b, 0);
  if (n === 0 || sum === 0) return 0;
  let diff = 0;
  for (const a of values) for (const b of values) diff += Math.abs(a - b);
  return diff / (2 * n * sum);
}

function weekHours(cells) {
  return DAYS.reduce((h, d) => h + (cells?.[d]?.kind === 'shift' ? cells[d].hours : 0), 0);
}

/** Weekend load pooled across the horizon, over staff who work at all in it. */
export function weekendEquity(builtWeeks, roster) {
  const byStaff = {};
  for (const s of roster) {
    const worksAtAll = builtWeeks.some((w) =>
      DAYS.some((d) => w.cells[s.id]?.[d]?.kind === 'shift')
    );
    if (!worksAtAll) continue;
    byStaff[s.id] = builtWeeks.reduce(
      (n, w) => n + WEEKEND.filter((d) => w.cells[s.id]?.[d]?.kind === 'shift').length,
      0
    );
  }
  return { byStaff, gini: gini(Object.values(byStaff)) };
}

/** Scheduled hours vs standard, per person, across the horizon. */
export function hoursReport(builtWeeks, roster) {
  return roster
    .filter((s) => s.standardHours > 0)
    .map((s) => {
      const perWeek = builtWeeks.map((w) => weekHours(w.cells[s.id]));
      const total = perWeek.reduce((a, b) => a + b, 0);
      const standard = s.standardHours * builtWeeks.length;
      return { staffId: s.id, displayName: s.displayName, weekHours: perWeek, total, standard, delta: total - standard };
    });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/domain/metrics.test.js`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/domain/metrics.js src/domain/metrics.test.js
git commit -m "feat(domain): month metrics — weekend equity (gini) and hours vs standard"
```

---

### Task 12: State — reducer, seed, selectors

**Files:**
- Create: `src/state/store.js`
- Test: `src/state/store.test.js`

**Interfaces:**
- Consumes: all domain modules; seed data (Tasks 3, 8).
- Produces:
  - `DEFAULT_DVM_COUNTS = {Sun:2, Mon:5, Tue:4, Wed:4, Thu:4, Fri:4, Sat:2}`
  - `makeWeek(startDate, rotations) → week` (proposed toggles, `toggleConfirmed:false`, `status:'draft'`)
  - `seedState() → state` — real roster/rulebook/pull order, `WEEK_AUG02` as week 1 + three proposed weeks, `REQUESTS_AUG02`
  - `initialState({roster, rotations, rulebook, pullOrder, requests, weeks, horizonStart}) → state` where state = `{roster, rotations, rulebook, pullOrder, requests, weeks: {[id]: week}, weekOrder: string[4], ui: {screen:'dashboard', selectedWeek}}`
  - `reducer(state, action)` — actions: `REPLACE_STATE{state}`, `SET_SCREEN{screen}`, `SELECT_WEEK{weekId}`, `SET_DVM_COUNT{weekId,day,count}`, `SET_TOGGLE{weekId,staffId,day,state,role}`, `CONFIRM_TOGGLES{weekId}`, `SET_OVERRIDE{weekId,staffId,day,value}`, `CLEAR_OVERRIDE{weekId,staffId,day}`, `ADD_REQUESTS{records}` (records arrive with ids — the UI assigns them at dispatch; never inside the reducer), `DECIDE_REQUEST{requestId,decision}`, `UPSERT_STAFF{staff}`, `REMOVE_STAFF{staffId}`, `SET_PULL_ORDER{order}`, `UPSERT_ROTATION{rotation}`, `REMOVE_ROTATION{rotationId}` (rotation edits re-propose toggles for every **unconfirmed** week; confirmed weeks keep their states), `UPDATE_RULE{ruleId,patch}`, `PUBLISH_WEEK{weekId}`, `ADVANCE_HORIZON{}`
  - Selectors: `selectWeek(state, weekId) → {week, built, targets, coverage, violations, suggestions}`; `selectMonth(state) → {perWeek:[{weekId, short, hard, soft, provisional, published}], equity, hours, totalShort}`; `selectDecisionQueue(state) → [{request, type, impact:{shortDelta, hardDelta}}]` (pending undecided, first-submitted first, impact = simulate granting)

- [ ] **Step 1: Write the failing test**

`src/state/store.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { seedState, reducer, selectWeek, selectMonth, selectDecisionQueue, makeWeek } from './store.js';
import { generateSuggestions, applyActionsToWeek } from '../domain/suggestions.js';
import { SEED_RULEBOOK } from '../domain/rules.js';

describe('scheduler state', () => {
  it('seeds four real weeks starting Aug 2, week 1 confirmed, the rest proposed', () => {
    const s = seedState();
    expect(s.weekOrder).toEqual(['2026-08-02', '2026-08-09', '2026-08-16', '2026-08-23']);
    expect(s.weeks['2026-08-02'].toggleConfirmed).toBe(true);
    expect(s.weeks['2026-08-09'].toggleConfirmed).toBe(false);
    expect(s.weeks['2026-08-09'].toggleStates.length).toBeGreaterThan(0);
  });
  it('evaluates the seeded week 1 clean: no hard violations, no gaps, no suggestions', () => {
    const s = seedState();
    const w = selectWeek(s, '2026-08-02');
    expect(w.violations.filter((x) => x.severity === 'hard')).toEqual([]);
    expect(Object.values(w.coverage.days).every((d) => d.short === 0)).toBe(true);
    expect(w.suggestions).toEqual([]);
  });
  it('mirrors applyActionsToWeek exactly when dispatching suggestion actions', () => {
    let s = seedState();
    // break coverage to force suggestions: take Prado off Tuesday
    s = reducer(s, { type: 'SET_OVERRIDE', weekId: '2026-08-02', staffId: 'prado-carla', day: 'Tue', value: 'OFF' });
    const { suggestions, week } = selectWeek(s, '2026-08-02');
    expect(suggestions.length).toBeGreaterThan(0);
    for (const sug of suggestions) {
      const viaDomain = applyActionsToWeek(week, sug.actions);
      const viaReducer = sug.actions.reduce((st, a) => reducer(st, { type: a.type, ...a }), s)
        .weeks['2026-08-02'];
      expect(viaReducer, sug.id).toEqual(viaDomain);
    }
  });
  it('grants a pending request and the schedule reacts', () => {
    let s = seedState();
    const before = selectWeek(s, '2026-08-02');
    expect(before.coverage.days.Sat.roles.HSS.variance).toBe(0); // Pearl works Sat
    s = reducer(s, { type: 'DECIDE_REQUEST', requestId: 'req-7', decision: 'granted' });
    const after = selectWeek(s, '2026-08-02');
    expect(after.coverage.days.Sat.roles.HSS.variance).toBe(-1); // her PTO opened a gap
  });
  it('queues only pending undecided requests, first-submitted first, with measured impact', () => {
    const q = selectDecisionQueue(seedState());
    expect(q.map((x) => x.request.id)).toEqual(['req-7', 'req-9']); // Pearl (6/19) before Rodriguez (7/6)
    expect(q[0].impact.shortDelta).toBeGreaterThan(0); // granting Pearl breaks Sat HSS
  });
  it('rule edits cascade: disabling the undertime rule clears its violation', () => {
    let s = seedState();
    expect(selectWeek(s, '2026-08-02').violations.some((v) => v.ruleId === 'undertime')).toBe(true);
    s = reducer(s, { type: 'UPDATE_RULE', ruleId: 'undertime', patch: { disabled: true } });
    expect(selectWeek(s, '2026-08-02').violations.some((v) => v.ruleId === 'undertime')).toBe(false);
  });
  it('advances the horizon by one week', () => {
    const s = reducer(seedState(), { type: 'ADVANCE_HORIZON' });
    expect(s.weekOrder).toEqual(['2026-08-09', '2026-08-16', '2026-08-23', '2026-08-30']);
    expect(s.weeks['2026-08-02']).toBeUndefined();
    expect(s.weeks['2026-08-30'].toggleConfirmed).toBe(false);
  });
  it('rotation edits re-propose toggles for unconfirmed weeks only', () => {
    let s = seedState();
    s = reducer(s, { type: 'REMOVE_ROTATION', rotationId: 'willis-sun' });
    expect(s.weeks['2026-08-09'].toggleStates.some((t) => t.staffId === 'willis-bree')).toBe(false);
    // week 1 was confirmed — its recorded states stay exactly as confirmed
    expect(s.weeks['2026-08-02'].toggleStates.some((t) => t.staffId === 'willis-bree')).toBe(true);
    s = reducer(s, {
      type: 'UPSERT_ROTATION',
      rotation: { id: 'willis-sun', staffId: 'willis-bree', day: 'Sun', roleWhenOn: 'HSS', cadence: 'everyOtherWeek', anchor: '2026-08-09' },
    });
    expect(
      s.weeks['2026-08-09'].toggleStates.find((t) => t.staffId === 'willis-bree' && t.day === 'Sun').state
    ).toBe('ON');
  });
  it('summarizes the month per week and pools equity', () => {
    const m = selectMonth(seedState());
    expect(m.perWeek).toHaveLength(4);
    expect(m.perWeek[0]).toMatchObject({ weekId: '2026-08-02', hard: 0, provisional: false });
    expect(m.perWeek[1].provisional).toBe(true);
    expect(m.equity.gini).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/state/store.test.js`
Expected: FAIL — `Cannot find module './store.js'`.

- [ ] **Step 3: Implement**

`src/state/store.js`:

```js
import { addDays } from '../domain/calendar.js';
import { proposeToggles } from '../domain/rotations.js';
import { buildWeek } from '../domain/build.js';
import { coverageCheck } from '../domain/coverage.js';
import { targetsForWeek } from '../domain/targets.js';
import { evaluateWeek, SEED_RULEBOOK } from '../domain/rules.js';
import { generateSuggestions } from '../domain/suggestions.js';
import { weekendEquity, hoursReport } from '../domain/metrics.js';
import { sortBySubmitted } from '../domain/timeoff.js';
import { DAYS } from '../domain/calendar.js';
import { SEED_ROSTER, SEED_ROTATIONS, PULL_ORDER } from '../data/roster.js';
import { WEEK_AUG02, REQUESTS_AUG02 } from '../data/week-aug02.js';

export const DEFAULT_DVM_COUNTS = { Sun: 2, Mon: 5, Tue: 4, Wed: 4, Thu: 4, Fri: 4, Sat: 2 };

export function makeWeek(startDate, rotations) {
  return {
    startDate,
    dvmCounts: { ...DEFAULT_DVM_COUNTS },
    toggleStates: proposeToggles(rotations, startDate),
    toggleConfirmed: false,
    overrides: {},
    status: 'draft',
  };
}

export function initialState({ roster, rotations, rulebook, pullOrder, requests = [], weeks = [], horizonStart }) {
  const byStart = Object.fromEntries(weeks.map((w) => [w.startDate, w]));
  const weekOrder = [0, 1, 2, 3].map((i) => addDays(horizonStart, i * 7));
  const weekMap = {};
  for (const start of weekOrder) weekMap[start] = byStart[start] ?? makeWeek(start, rotations);
  return {
    roster, rotations, rulebook, pullOrder, requests,
    weeks: weekMap, weekOrder,
    ui: { screen: 'dashboard', selectedWeek: horizonStart },
  };
}

/** First run: the real clinic, with the workbook's Aug 2 week as week 1. */
export function seedState() {
  return initialState({
    roster: SEED_ROSTER, rotations: SEED_ROTATIONS, rulebook: SEED_RULEBOOK,
    pullOrder: PULL_ORDER, requests: REQUESTS_AUG02,
    weeks: [WEEK_AUG02], horizonStart: WEEK_AUG02.startDate,
  });
}

function patchWeek(state, weekId, patch) {
  return { ...state, weeks: { ...state.weeks, [weekId]: { ...state.weeks[weekId], ...patch } } };
}

export function reducer(state, action) {
  switch (action.type) {
    case 'REPLACE_STATE':
      return action.state;
    case 'SET_SCREEN':
      return { ...state, ui: { ...state.ui, screen: action.screen } };
    case 'SELECT_WEEK':
      return { ...state, ui: { ...state.ui, selectedWeek: action.weekId } };
    case 'SET_DVM_COUNT': {
      const week = state.weeks[action.weekId];
      return patchWeek(state, action.weekId, { dvmCounts: { ...week.dvmCounts, [action.day]: action.count } });
    }
    case 'SET_TOGGLE': {
      const week = state.weeks[action.weekId];
      const rest = week.toggleStates.filter((t) => !(t.staffId === action.staffId && t.day === action.day));
      const prior = week.toggleStates.find((t) => t.staffId === action.staffId && t.day === action.day);
      return patchWeek(state, action.weekId, {
        toggleStates: [...rest, {
          rotationId: prior?.rotationId ?? null, staffId: action.staffId, day: action.day,
          role: action.role ?? prior?.role, state: action.state,
        }],
      });
    }
    case 'CONFIRM_TOGGLES':
      return patchWeek(state, action.weekId, { toggleConfirmed: true });
    case 'SET_OVERRIDE': {
      const week = state.weeks[action.weekId];
      const forStaff = { ...(week.overrides[action.staffId] ?? {}), [action.day]: action.value };
      return patchWeek(state, action.weekId, { overrides: { ...week.overrides, [action.staffId]: forStaff } });
    }
    case 'CLEAR_OVERRIDE': {
      const week = state.weeks[action.weekId];
      if (!week.overrides[action.staffId]) return state;
      const forStaff = { ...week.overrides[action.staffId] };
      delete forStaff[action.day];
      return patchWeek(state, action.weekId, { overrides: { ...week.overrides, [action.staffId]: forStaff } });
    }
    case 'ADD_REQUESTS':
      return { ...state, requests: [...state.requests, ...action.records] };
    case 'DECIDE_REQUEST':
      return {
        ...state,
        requests: state.requests.map((r) => (r.id === action.requestId ? { ...r, decision: action.decision } : r)),
      };
    case 'UPSERT_STAFF': {
      const exists = state.roster.some((s) => s.id === action.staff.id);
      return {
        ...state,
        roster: exists
          ? state.roster.map((s) => (s.id === action.staff.id ? action.staff : s))
          : [...state.roster, action.staff],
      };
    }
    case 'REMOVE_STAFF':
      return { ...state, roster: state.roster.filter((s) => s.id !== action.staffId) };
    case 'SET_PULL_ORDER':
      return { ...state, pullOrder: action.order };
    case 'UPSERT_ROTATION':
    case 'REMOVE_ROTATION': {
      const rotations =
        action.type === 'REMOVE_ROTATION'
          ? state.rotations.filter((r) => r.id !== action.rotationId)
          : state.rotations.some((r) => r.id === action.rotation.id)
            ? state.rotations.map((r) => (r.id === action.rotation.id ? action.rotation : r))
            : [...state.rotations, action.rotation];
      // Re-propose toggles for unconfirmed weeks; confirmed weeks keep the manager's states.
      const weeks = { ...state.weeks };
      for (const id of state.weekOrder) {
        if (!weeks[id].toggleConfirmed) {
          weeks[id] = { ...weeks[id], toggleStates: proposeToggles(rotations, id) };
        }
      }
      return { ...state, rotations, weeks };
    }
    case 'UPDATE_RULE':
      return {
        ...state,
        rulebook: state.rulebook.map((r) => (r.id === action.ruleId ? { ...r, ...action.patch } : r)),
      };
    case 'PUBLISH_WEEK':
      return patchWeek(state, action.weekId, { status: 'published' });
    case 'ADVANCE_HORIZON': {
      const [dropped, ...keep] = state.weekOrder;
      const nextStart = addDays(state.weekOrder[state.weekOrder.length - 1], 7);
      const weeks = { ...state.weeks, [nextStart]: makeWeek(nextStart, state.rotations) };
      delete weeks[dropped];
      const weekOrder = [...keep, nextStart];
      const selectedWeek = state.ui.selectedWeek === dropped ? weekOrder[0] : state.ui.selectedWeek;
      return { ...state, weeks, weekOrder, ui: { ...state.ui, selectedWeek } };
    }
    default:
      return state;
  }
}

/** Full evaluation of one week — recomputed on demand; 28×7 is cheap. */
export function selectWeek(state, weekId) {
  const week = state.weeks[weekId];
  const built = buildWeek({ roster: state.roster, week, requests: state.requests });
  const targets = targetsForWeek(week);
  const coverage = coverageCheck(built, targets);
  const violations = evaluateWeek({
    built, week, roster: state.roster, requests: state.requests, coverage, rulebook: state.rulebook,
  });
  const suggestions = generateSuggestions({
    roster: state.roster, week, requests: state.requests,
    rulebook: state.rulebook, pullOrder: state.pullOrder,
  });
  return { week, built, targets, coverage, violations, suggestions };
}

export function selectMonth(state) {
  const evaluated = state.weekOrder.map((id) => ({ id, ...selectWeek(state, id) }));
  const perWeek = evaluated.map((e) => ({
    weekId: e.id,
    short: DAYS.reduce((n, d) => n + e.coverage.days[d].short, 0),
    hard: e.violations.filter((x) => x.severity === 'hard').length,
    soft: e.violations.filter((x) => x.severity === 'soft').length,
    provisional: !e.week.toggleConfirmed,
    published: e.week.status === 'published',
  }));
  const builtWeeks = evaluated.map((e) => e.built);
  return {
    perWeek,
    totalShort: perWeek.reduce((n, w) => n + w.short, 0),
    equity: weekendEquity(builtWeeks, state.roster),
    hours: hoursReport(builtWeeks, state.roster),
  };
}

/** Pending undecided requests, first-submitted-wins, with the cost of granting each. */
export function selectDecisionQueue(state) {
  const pending = sortBySubmitted(
    state.requests.filter((r) => r.status === 'Pending' && !r.decision)
  );
  return pending.map((request) => {
    const granted = {
      ...state,
      requests: state.requests.map((r) => (r.id === request.id ? { ...r, decision: 'granted' } : r)),
    };
    const sum = (st) =>
      st.weekOrder.reduce((acc, id) => {
        const w = selectWeek(st, id);
        acc.short += DAYS.reduce((n, d) => n + w.coverage.days[d].short, 0);
        acc.hard += w.violations.filter((x) => x.severity === 'hard').length;
        return acc;
      }, { short: 0, hard: 0 });
    const before = sum(state);
    const after = sum(granted);
    return {
      request,
      impact: { shortDelta: after.short - before.short, hardDelta: after.hard - before.hard },
    };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/state/store.test.js`
Expected: PASS — 8 tests. (The suggestion-dispatch parity test is the prototype's hard-won lesson: a suggestion's actions must be real reducer actions, verified by dispatching every one.)

- [ ] **Step 5: Commit**

```bash
git add src/state/store.js src/state/store.test.js
git commit -m "feat(state): reducer, seed, and evaluated selectors over the domain"
```

---

### Task 13: Persistence — SchedulerStore, IndexedDB, JSON backup

**Files:**
- Create: `src/state/persistence.js`
- Test: `src/state/persistence.test.js`

**Interfaces:**
- Consumes: nothing domain-side (state is opaque JSON here).
- Produces:
  - `SCHEMA_VERSION = 1`
  - `serialize(state) → string`, `deserialize(json) → state` (throws `{code:'version-mismatch'}` on wrong version — **never silently drops data**)
  - `createMemoryStore() → SchedulerStore`, `createIdbStore(dbName?) → SchedulerStore` where SchedulerStore = `{load() → Promise<state|null>, save(state) → Promise<void>, clear() → Promise<void>}` — Task 14's provider takes any SchedulerStore (memory in tests, IndexedDB in the app)

- [ ] **Step 1: Write the failing test**

`src/state/persistence.test.js`:

```js
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { createMemoryStore, createIdbStore, serialize, deserialize, SCHEMA_VERSION } from './persistence.js';
import { seedState } from './store.js';

describe('persistence', () => {
  it('round-trips state through the memory store', async () => {
    const store = createMemoryStore();
    expect(await store.load()).toBeNull();
    const state = seedState();
    await store.save(state);
    expect(await store.load()).toEqual(state);
    await store.clear();
    expect(await store.load()).toBeNull();
  });
  it('round-trips state through IndexedDB', async () => {
    const store = createIdbStore('wcah-test');
    const state = seedState();
    await store.save(state);
    expect(await store.load()).toEqual(state);
    await store.clear();
    expect(await store.load()).toBeNull();
  });
  it('embeds the schema version and refuses mismatches loudly', () => {
    const json = serialize({ hello: 'world' });
    expect(JSON.parse(json).schemaVersion).toBe(SCHEMA_VERSION);
    const wrong = JSON.stringify({ schemaVersion: 999, state: {} });
    expect(() => deserialize(wrong)).toThrowError(expect.objectContaining({ code: 'version-mismatch' }));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/state/persistence.test.js`
Expected: FAIL — `Cannot find module './persistence.js'`.

- [ ] **Step 3: Implement**

`src/state/persistence.js`:

```js
/** Bump when the persisted state shape changes; add a migration in deserialize. */
export const SCHEMA_VERSION = 1;

export function serialize(state) {
  return JSON.stringify({ schemaVersion: SCHEMA_VERSION, state });
}

export function deserialize(json) {
  const doc = JSON.parse(json);
  if (doc.schemaVersion !== SCHEMA_VERSION) {
    // Future migrations run here. Unknown versions refuse loudly — never drop data.
    const err = new Error(`Saved data uses schema v${doc.schemaVersion}; this app expects v${SCHEMA_VERSION}.`);
    err.code = 'version-mismatch';
    throw err;
  }
  return doc.state;
}

/** In-memory SchedulerStore — tests and fallbacks. */
export function createMemoryStore() {
  let saved = null;
  return {
    async load() { return saved ? deserialize(saved) : null; },
    async save(state) { saved = serialize(state); },
    async clear() { saved = null; },
  };
}

/** IndexedDB SchedulerStore — single kv object store, whole-state document. */
export function createIdbStore(dbName = 'wcah-scheduler') {
  const open = () =>
    new Promise((resolve, reject) => {
      const req = indexedDB.open(dbName, 1);
      req.onupgradeneeded = () => req.result.createObjectStore('kv');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  const run = async (mode, op) => {
    const db = await open();
    try {
      return await new Promise((resolve, reject) => {
        const request = op(db.transaction('kv', mode).objectStore('kv'));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  };
  return {
    async load() {
      const json = await run('readonly', (s) => s.get('state'));
      return json ? deserialize(json) : null;
    },
    async save(state) {
      await run('readwrite', (s) => s.put(serialize(state), 'state'));
    },
    async clear() {
      await run('readwrite', (s) => s.delete('state'));
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/state/persistence.test.js`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/state/persistence.js src/state/persistence.test.js
git commit -m "feat(state): SchedulerStore persistence with versioned schema and IndexedDB"
```

---

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

### Task 22: Final verification, README, acceptance walkthrough

**Files:**
- Create: `README.md`
- Modify: none (verification only)

- [ ] **Step 1: Full suite and build**

Run: `npx vitest run`
Expected: PASS — every test file from Tasks 2–21.

Run: `npm run build`
Expected: clean production build.

- [ ] **Step 2: Browser acceptance walkthrough (spec §6)**

Start the dev server via browser preview (launch config `wcah-scheduler`) and verify each beat; fix and re-run tests if any fail:

1. First run lands on the Dashboard: four week cards, decision queue shows Pearl (6/19) before Rodriguez (7/6) with `+1 gap(s)`-style impact, equity and hours tiles populated.
2. Open Week of Aug 2: the grid matches the workbook (Gardner's three UNPAID OFF, `VA (until 5 PM)`, `Tech NC · until 1:00 PM`); coverage strip shows Thursday OVER +1, everything else ON TARGET; rail shows exactly one soft violation (Gardner undertime, "makeup shifts owed").
3. Time Off screen: paste a new Paylocity row → preview classifies it → Apply → the affected week's chips and coverage react.
4. On the board, set an RVT OFF on a dental day → hard violation appears with severity from its rule → rail suggests repairs in pull order → Apply → strip clears, impact matches the badge.
5. Select Week of Aug 9: rotation toggles arrive pre-proposed (Bree's Sunday ON, Vero's every-3rd ON with Friday OFF); confirm rotations; Publish screen → Download CSV + printable grid keyed by Paylocity names.
6. Reload the page — state persists (IndexedDB). Export JSON, wipe via devtools → Application → IndexedDB → delete `wcah-scheduler`, reload (reseeds), Import JSON → restored.

- [ ] **Step 3: Write README.md**

```markdown
# WCAH Scheduler

Employee shift scheduling for West Coast Animal Hospital Linda Vista — the
office manager's Excel schedule-builder workbook, automated. Local-first
SPA: React + Tailwind, pure JS domain, IndexedDB persistence, no server.

- **Spec:** docs/superpowers/specs/2026-07-24-wcah-scheduler-mvp-design.md
- **Plan:** docs/superpowers/plans/2026-07-24-wcah-scheduler-mvp.md

## Run

    npm install
    npm run dev        # http://localhost:5174
    npx vitest run     # domain + UI tests

## Trust anchor

`src/data/parity-aug02.test.js` proves the engine reproduces the real
workbook's Aug 2–8, 2026 week — Proposed Schedule cell-for-cell and
Coverage Check number-for-number. Seed data in `src/data/` is transcribed
from the workbook and is ground truth: fix the pipeline, never the fixtures.

## Where things live

- `src/domain/` — pure scheduling engine (build, coverage, rules, suggestions, metrics)
- `src/data/` — real roster, rotations, rulebook, the Aug 2 week
- `src/import/` — ImportAdapter parsers (Paylocity time off, roster paste);
  the future AI adapter implements the same `parse(text) → {records, issues}` contract
- `src/state/` — reducer, selectors, persistence (SchedulerStore)
- `src/ui/` — Dashboard, Week Board, Roster, Time Off, Publish
```

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: README with run instructions and trust anchor"
```

---

## Execution order and dependencies

Tasks 1→13 are strictly sequential (each consumes the previous). Tasks 14–21 are UI layers over a frozen domain: 14→15→16→17 sequential; 18, 19, 20, 21 each depend on 14 (and 21 reuses `WeekPicker` from 15) but not on each other. Task 22 last.

The parity gates are non-negotiable checkpoints:
- Task 4 gate: cadence engine reproduces the Week Setup sheet.
- Task 8 gate: pipeline reproduces Proposed Schedule + Coverage Check.
- Task 9 gate: real week yields zero hard violations, exactly one soft.

If a gate fails, the pipeline (or a Task 3 transcription) is wrong — the workbook is ground truth, fixtures never bend.
