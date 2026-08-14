# SP0 + SP1 Implementation Plan — Stabilize the Base, Measure the Engine

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the repository's account of itself true (SP0: green suite,
reconciled docs) and stand up the `conformance/aug02/` suite that measures
where the live OMS engine diverges from the frozen Excel-parity oracle (SP1).

**Architecture:** SP0 is a jsdom `localStorage` shim plus documentation
reconciliation — no product code. SP1 builds conformance tooling under
`conformance/`: two projectors reduce both engines' output to canonical
schedule/coverage records, a diff engine categorizes divergences
(`mismatch`/`missing`/`extra`/`inexpressible`), and a committed baseline turns
the report into a CI ratchet. Neither engine changes; the OMS runner injects
`input.json` into a fresh seed document.

**Tech Stack:** JavaScript ESM + JSDoc, Vitest, Node (no new dependencies).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-04-sp0-sp1-stabilize-and-conformance-design.md`
- `src/domain`, `src/data`, and `src/data/parity-aug02.test.js` are **never edited**; parity stays green throughout
- Neither engine changes: no edits under `src/engine`, `src/seed`, `src/model`, `src/state` (spec decision 4)
- `expected.json` is transcribed from the committed workbook fixtures, never generated from either engine (spec decision 5)
- `inexpressible` is assigned only from `annotations.json` (spec decision 7)
- `report.json` carries no timestamps or run ids; stable key ordering; divergences sorted (spec §5.6)
- **No git commits unless Tom explicitly requests them** (HANDOFF §6)
- Conformance runners may import from `src/domain` (`formatCell`, `DAYS`) and from both engines — they are conformance tooling, not live OMS code; nothing under `src/` gains a dependency on `conformance/`

## File map

| File | Responsibility |
|------|----------------|
| `src/test-setup.js` (modify) | Guarded `localStorage` shim for the Node 26 collision |
| `HANDOFF.md` (modify) | Remove the six claims contradicting the migration spec |
| `CLAUDE.md`, `README.md` (modify) | Name the live persistence seam; server-authoritative direction |
| `conformance/runners/projection.js` (+ test) | OMS→workbook role map, cell projection, status convention |
| `conformance/runners/fixtures.js` | JSON fixture loader (works in Vitest and plain Node) |
| `conformance/aug02/input.json` | The workbook week's inputs, OMS-coded (language-neutral) |
| `conformance/aug02/expected.json` | Workbook cells + coverage, normalized full matrix |
| `conformance/aug02/annotations.json` | Known-inexpressible cells with reasons (Tom's file) |
| `conformance/runners/agreement.test.js` | `input.json`/`expected.json` pinned to frozen `src/data` fixtures |
| `conformance/runners/projectDomain.js` (+ test) | Oracle projector; self-check against `expected.json` |
| `conformance/runners/projectOms.js` (+ test) | OMS projector: inject input, run `generateWeek`, project |
| `conformance/runners/diff.js`, `report.js` (+ tests) | Categorized divergences; deterministic report assembly |
| `conformance/aug02/contract.md` | Field semantics for the future Python runner |
| `conformance/runners/run-aug02.js` | CLI: write `report.json`; `--update` refreshes baseline |
| `conformance/runners/baseline.test.js` | The ratchet: report must equal committed `baseline.json` |
| `package.json`, `.gitignore` (modify) | `conformance` scripts; ignore generated `report.json` |
| `conformance/aug02/baseline.json` | Committed snapshot of the report |

Verified starting state (2026-08-04): `npx vitest run` → **213 pass, 9 fail,
2 skipped**. All 9 failures are `localStorage` undefined in
`src/ui/App.test.jsx` / `src/ui/auth.test.js`.

---

## SP0

### Task 1: Fix the jsdom `localStorage` collision

**Files:**
- Modify: `src/test-setup.js`
- Test: the 9 existing failures in `src/ui/App.test.jsx`, `src/ui/auth.test.js`

**Interfaces:**
- Consumes: nothing
- Produces: a green full suite for every later task's verify step

The failing tests already exist — this task is red→green on them.

- [ ] **Step 1: Confirm the failures**

Run: `npx vitest run src/ui/App.test.jsx src/ui/auth.test.js`
Expected: 9 FAIL, all `TypeError` reading properties of `undefined` where the
test touches `localStorage`.

- [ ] **Step 2: Add the guarded shim**

Append to `src/test-setup.js` (keep the existing `afterEach(cleanup)`):

```js
// Node 26 defines an experimental `localStorage` global whose getter returns
// undefined unless --localstorage-file is provided. Vitest's jsdom environment
// leaves that accessor in place, shadowing jsdom's own Storage. Redefine only
// when the collision is present, so a Node version without it keeps jsdom's
// implementation (spec §4.2).
if (typeof globalThis.localStorage === 'undefined') {
  const backing = new Map();
  const storage = {
    get length() { return backing.size; },
    key(i) { return [...backing.keys()][i] ?? null; },
    getItem(k) { return backing.has(String(k)) ? backing.get(String(k)) : null; },
    setItem(k, v) { backing.set(String(k), String(v)); },
    removeItem(k) { backing.delete(String(k)); },
    clear() { backing.clear(); },
  };
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: storage,
  });
}
```

- [ ] **Step 3: Verify green**

Run: `npx vitest run` — expected **222 pass, 0 fail, 2 skipped**.
Run: `npx vitest run src/data/parity-aug02.test.js` — green in isolation.

---

### Task 2: Reconcile HANDOFF.md

**Files:**
- Modify: `HANDOFF.md`

**Interfaces:**
- Consumes: standing decisions in
  `docs/superpowers/specs/2026-08-04-production-migration-design.md` (§3.6,
  §3.8, §5.3)
- Produces: a HANDOFF a fresh session can trust

Six edits. Do **not** touch §1 (project intent), §3 (manager workflow), the
document-shape block in §2, or the hard rules in §6 — those are accurate.

- [ ] **Step 1: §2 repo line**

Replace:
> **Repo:** `TomWCAH/scheduler` (fork of `HinchK/scheduler`), branch `main`.

with:
> **Repo:** `TomWCAH/oms` — single shared repository, branch `main`. (The
> `HinchK/scheduler` upstream-plus-fork arrangement was retired 2026-08-04.)

- [ ] **Step 2: §4 Decision 5 (local-first) — record the reversal**

Replace the row with:

| 5 | **Server-authoritative** — Postgres holds the document; the browser edits via the API; IndexedDB becomes a read-only last-known-good cache at SP2 | A silent offline edit that fails to sync later is worse than an honest error at the time (prod migration §3.6). *Local-first was adopted 2026-08-04 and reversed the same day after the Kasey/Tom meeting — inherit the reversal, do not re-adopt.* |

- [ ] **Step 3: §4 Decision 7 (SP2 gate)**

Replace the row with:

| 7 | SP2 (deploy) gated on **SP1's conformance report existing** | "Track D green" was never objectively testable; a report either exists or it doesn't (prod migration §3.8, revised 2026-08-04) |

- [ ] **Step 4: §5 "Immediate — Track D hygiene"**

Replace the fork phrasing only: "exist on one machine and are **not yet on
the fork**" → "exist on one machine and are **not yet pushed**". Keep the
rest of the section ("Push early…", the bus-factor sentence) as is.

- [ ] **Step 5: §5 platform-track table, SP2 row**

Replace "(rollout milestone; gated on Track D)" with "(rollout milestone;
gated on SP1's conformance report — prod migration §3.8)".

- [ ] **Step 6: §6 process rule 5 (fork topology)**

Replace:
> **Fork topology:** work in `TomWCAH/scheduler`, integrate to upstream via
> PR. Unpushed work is invisible to review, CI, and backup.

with:
> **Single shared repository:** both maintainers work in `TomWCAH/oms` and
> integrate by PR. Unpushed work is invisible to review, CI, and backup —
> push early and often.

- [ ] **Step 7: Verify no contradictions remain**

Run: `grep -ni "fork" HANDOFF.md` — only the §2 historical retirement note may
remain.
Run: `grep -ni "local-first" HANDOFF.md` — only Decision 5's reversal note may
remain.
Run: `grep -n "Track D green\|gated on Track D" HANDOFF.md` — no hits.
Run: `npx vitest run` — still green (docs-only change; cheap safety check).

---

### Task 3: Correct the seam note in CLAUDE.md and README

**Files:**
- Modify: `CLAUDE.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: migration spec §6.1 (the seam correction)
- Produces: SP0 complete; the SP0 done-when gate

- [ ] **Step 1: CLAUDE.md — name the live seam**

In the Layout section, after the live-OMS bullet, add:

```markdown
- Persistence seam (SP2 swap point): `src/state/omsPersistence.js`
  (`load`/`save`/`clear` over a `schemaVersion`-wrapped payload) — **not** the
  legacy `src/state/persistence.js` named in older docs.
```

- [ ] **Step 2: README — direction and seam**

Replace the intro sentence "Local-first SPA: React + Tailwind, pure JS domain,
IndexedDB persistence, no server." with:

> React + Tailwind SPA, pure JS domain, IndexedDB persistence today. The
> production direction is server-authoritative (FastAPI + Postgres at SP2 —
> `docs/superpowers/specs/2026-08-04-production-migration-design.md`).

In "Where things live", extend the `src/state/` bullet:

> - `src/state/` — `omsStore`, `omsMutations`, `omsPersistence`, `OmsContext`.
>   `omsPersistence.js` is the persistence seam SP2 swaps to an API-backed store

- [ ] **Step 3: SP0 verify gate (spec §4.4)**

Run: `npx vitest run` — green (222 pass, 2 skipped).
Run: `npx vitest run src/data/parity-aug02.test.js` — green in isolation.
Run: `npm run build` — green.

---

## SP1

Day order everywhere: `['Sun','Mon','Tue','Wed','Thu','Fri','Sat']` (import
`DAYS` from `src/domain/calendar.js` in all runner code). Coverage role order
everywhere: `['VA','RVT','HSS','PHARM','ADMIN']`.

**Canonical record shapes** (produced by both projectors, consumed by the
diff):

```js
// schedule record: full matrix, '' = blank cell
{ [employeeId]: { Sun: 'VA', Mon: '', ... } }        // every SEED_ROSTER id × 7 days

// coverage record: ADMIN is scheduled-only (target/status null)
{ [day]: { VA: { scheduled: 5, target: 5, status: 'ON TARGET' },
           ...,
           ADMIN: { scheduled: 0, target: null, status: null } } }
```

### Task 4: Projection role map + totality test

**Files:**
- Create: `conformance/runners/projection.js`
- Test: `conformance/runners/projection.test.js`

**Interfaces:**
- Consumes: `shift`, `off`, `formatCell` from `src/domain/cells.js`;
  `buildSeedDocument` from `src/seed/buildSeed.js`; selectors from
  `src/model/omsSelectors.js`
- Produces: `PROJECTION_ROLE_MAP` (object), `OMS_PSEUDO_CODES` (string[]),
  `cellFromOmsAssignment(assignment) → Cell|null` (throws on unmapped code),
  `statusForVariance(variance) → 'SHORT n'|'OVER +n'|'ON TARGET'`

- [ ] **Step 1: Write the failing test**

```js
// conformance/runners/projection.test.js
import { describe, it, expect } from 'vitest';
import { formatCell } from '../../src/domain/cells.js';
import { buildSeedDocument } from '../../src/seed/buildSeed.js';
import {
  allDefaultNeeds, allRoleEligibilities, allConstraints, allRotations, findRole,
} from '../../src/model/omsSelectors.js';
import {
  PROJECTION_ROLE_MAP, OMS_PSEUDO_CODES, cellFromOmsAssignment, statusForVariance,
} from './projection.js';

describe('projection role map (spec §5.1)', () => {
  it('is the inverse of LEGACY_ROLE_MAP plus DENTAL_TECH → RVT', () => {
    expect(PROJECTION_ROLE_MAP).toEqual({
      ROOM_TECH: 'VA',
      SURGERY_TECH: 'RVT',
      DENTAL_TECH: 'RVT',
      DENTAL_MONITOR: 'MONITOR',
      HSS: 'HSS',
      PHARM: 'PHARM',
      ADMIN: 'ADMIN',
      TECH_NC: 'TECH_NC',
    });
  });

  it('is total over every role code the OMS engine can emit', () => {
    // Emittable = role ids reachable by generateWeek: default needs,
    // role eligibilities, FIXED_ASSIGNMENT constraints, rotations (both
    // roleWhenOn-legacy and cell rows), plus the pseudo-codes.
    const doc = buildSeedDocument();
    const codes = new Set(OMS_PSEUDO_CODES);
    for (const need of allDefaultNeeds(doc)) codes.add(findRole(doc, need.roleId).code);
    for (const e of allRoleEligibilities(doc)) codes.add(findRole(doc, e.roleId).code);
    for (const c of allConstraints(doc)) {
      if (c.typeCode === 'FIXED_ASSIGNMENT') codes.add(findRole(doc, c.parameters.roleId).code);
    }
    for (const r of allRotations(doc)) {
      for (const cell of Object.values(r.cells ?? {})) {
        if (cell.roleId) codes.add(findRole(doc, cell.roleId).code);
      }
    }
    for (const code of codes) {
      expect(
        () => cellFromOmsAssignment({ roleCode: code, paidHours: 10 }),
        `role code ${code} must have a workbook rendering`,
      ).not.toThrow();
    }
  });

  it('throws on an unmapped role code instead of silently mis-rendering', () => {
    expect(() => cellFromOmsAssignment({ roleCode: 'FRONT_DESK', paidHours: 10 }))
      .toThrow(/FRONT_DESK/);
  });
});

describe('cellFromOmsAssignment renders through formatCell', () => {
  it('projects a plain shift', () => {
    expect(formatCell(cellFromOmsAssignment({ roleCode: 'ROOM_TECH', paidHours: 10 }))).toBe('VA');
  });
  it('projects label and timeNote', () => {
    expect(formatCell(cellFromOmsAssignment({
      roleCode: 'ROOM_TECH', paidHours: 9.5, label: 'VA (until 5 PM)',
    }))).toBe('VA (until 5 PM)');
    expect(formatCell(cellFromOmsAssignment({
      roleCode: 'SURGERY_TECH', paidHours: 9.5, timeNote: '9a',
    }))).toBe('RVT (9a)');
  });
  it('projects time off and manual OFF', () => {
    expect(formatCell(cellFromOmsAssignment({ roleCode: 'PTO', paidHours: 0 }))).toBe('PTO');
    expect(formatCell(cellFromOmsAssignment({ roleCode: 'UNPAID_OFF', paidHours: 0 }))).toBe('UNPAID OFF');
    expect(cellFromOmsAssignment({ roleCode: 'OFF', paidHours: 0 })).toBeNull();
    expect(cellFromOmsAssignment(undefined)).toBeNull();
    expect(formatCell(null)).toBe('');
  });
});

describe('statusForVariance', () => {
  it('matches the workbook convention', () => {
    expect(statusForVariance(0)).toBe('ON TARGET');
    expect(statusForVariance(1)).toBe('OVER +1');
    expect(statusForVariance(-2)).toBe('SHORT 2');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run conformance/runners/projection.test.js`
Expected: FAIL — cannot resolve `./projection.js`.

- [ ] **Step 3: Implement**

```js
// conformance/runners/projection.js
/**
 * OMS → workbook projection (spec §5.1). Role translation is the inverse of
 * buildSeed's LEGACY_ROLE_MAP plus DENTAL_TECH → RVT: the workbook does not
 * distinguish surgery techs from dental techs. Deliberately non-injective;
 * the guarded property is totality — every emittable code renders, an
 * unmapped code throws rather than silently corrupting the report.
 */
import { shift, off } from '../../src/domain/cells.js';

export const PROJECTION_ROLE_MAP = {
  ROOM_TECH: 'VA',
  SURGERY_TECH: 'RVT',
  DENTAL_TECH: 'RVT',
  DENTAL_MONITOR: 'MONITOR',
  HSS: 'HSS',
  PHARM: 'PHARM',
  ADMIN: 'ADMIN',
  TECH_NC: 'TECH_NC',
};

/** Pseudo-codes generateWeek emits that are not department roles. */
export const OMS_PSEUDO_CODES = ['PTO', 'UNPAID_OFF', 'OFF'];

/**
 * @param {object|undefined} a an OMS assignment ({roleCode, paidHours, label, timeNote})
 * @returns {import('../../src/domain/cells.js').Cell|null} null = blank cell
 */
export function cellFromOmsAssignment(a) {
  if (!a) return null;
  if (a.roleCode === 'OFF') return null; // manual OFF renders blank (spec §5.2)
  if (a.roleCode === 'PTO') return off('PTO');
  if (a.roleCode === 'UNPAID_OFF') return off('UNPAID OFF');
  const legacy = PROJECTION_ROLE_MAP[a.roleCode];
  if (!legacy) throw new Error(`No workbook rendering for OMS role code ${a.roleCode}`);
  return shift(legacy, {
    hours: a.paidHours ?? 10,
    ...(a.label ? { label: a.label } : {}),
    ...(a.timeNote ? { timeNote: a.timeNote } : {}),
  });
}

/** Workbook status convention, shared by both coverage projections. */
export function statusForVariance(variance) {
  if (variance < 0) return `SHORT ${Math.abs(variance)}`;
  if (variance > 0) return `OVER +${variance}`;
  return 'ON TARGET';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run conformance/runners/projection.test.js` — PASS.

---

### Task 5: Fixtures + agreement tests

**Files:**
- Create: `conformance/runners/fixtures.js`
- Create: `conformance/aug02/input.json`
- Create: `conformance/aug02/expected.json`
- Create: `conformance/aug02/annotations.json`
- Test: `conformance/runners/agreement.test.js`

**Interfaces:**
- Consumes: `statusForVariance` from Task 4; frozen `src/data` fixtures;
  `roleForLegacyCode` from `src/seed/buildSeed.js`
- Produces: `loadFixture(name) → object`, `fixturePath(name) → string`;
  the three committed JSON fixtures

- [ ] **Step 1: Write the loader**

```js
// conformance/runners/fixtures.js
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const AUG02_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'aug02');

/** @param {string} name file name inside conformance/aug02/ */
export function loadFixture(name) {
  return JSON.parse(readFileSync(join(AUG02_DIR, name), 'utf8'));
}

export function fixturePath(name) {
  return join(AUG02_DIR, name);
}
```

- [ ] **Step 2: Write the failing agreement test**

```js
// conformance/runners/agreement.test.js
import { describe, it, expect } from 'vitest';
import { WEEK_AUG02, REQUESTS_AUG02 } from '../../src/data/week-aug02.js';
import { EXPECTED_GRID, EXPECTED_COVERAGE } from '../../src/data/expected-aug02.js';
import { SEED_ROSTER } from '../../src/data/roster.js';
import { DAYS } from '../../src/domain/calendar.js';
import { roleForLegacyCode } from '../../src/seed/buildSeed.js';
import { loadFixture } from './fixtures.js';
import { statusForVariance } from './projection.js';

const input = loadFixture('input.json');
const expectedFixture = loadFixture('expected.json');

describe('input.json agrees with the frozen src/data fixtures (spec §5.4)', () => {
  it('carries the same week and dvmCounts', () => {
    expect(input.weekStart).toBe(WEEK_AUG02.startDate);
    expect(input.dvmCounts).toEqual(WEEK_AUG02.dvmCounts);
  });

  it('enables the five departments the workbook staffs, every day', () => {
    for (const day of DAYS) {
      expect(input.departmentsEnabled[day]).toEqual(['ROOM', 'SURGERY', 'DENTAL', 'HSS', 'PHARM']);
    }
  });

  it('carries the seven hand-overrides, roles translated to OMS codes', () => {
    const translated = {};
    for (const [empId, byDay] of Object.entries(WEEK_AUG02.overrides)) {
      translated[empId] = {};
      for (const [day, v] of Object.entries(byDay)) {
        translated[empId][day] = v === 'OFF' ? 'OFF' : { ...v, role: roleForLegacyCode(v.role).code };
      }
    }
    expect(input.overrides).toEqual(translated);
  });

  it('carries the Time-Off Input rows', () => {
    const rows = REQUESTS_AUG02.map(({ id, staffId, submittedAt, status, decision, startDate, hours, days }) => (
      { id, staffId, submittedAt, status, decision: decision ?? null, startDate, hours, days }
    ));
    expect(input.requests).toEqual(rows);
  });
});

describe('expected.json agrees with the committed workbook transcription', () => {
  it('grid matches EXPECTED_GRID as a full matrix', () => {
    expect(Object.keys(expectedFixture.grid).sort())
      .toEqual(SEED_ROSTER.map((s) => s.id).sort());
    for (const staff of SEED_ROSTER) {
      for (const day of DAYS) {
        expect(expectedFixture.grid[staff.id][day], `${staff.id} ${day}`)
          .toBe(EXPECTED_GRID[staff.id][day] ?? '');
      }
    }
  });

  it('coverage matches EXPECTED_COVERAGE per day and role', () => {
    for (const [role, { scheduled, target }] of Object.entries(EXPECTED_COVERAGE)) {
      DAYS.forEach((day, i) => {
        const rec = expectedFixture.coverage[day][role];
        expect(rec.scheduled, `${role} ${day} scheduled`).toBe(scheduled[i]);
        expect(rec.target, `${role} ${day} target`).toBe(target ? target[i] : null);
        expect(rec.status, `${role} ${day} status`)
          .toBe(target ? statusForVariance(scheduled[i] - target[i]) : null);
      });
    }
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run conformance/runners/agreement.test.js`
Expected: FAIL — `input.json` does not exist.

- [ ] **Step 4: Write `conformance/aug02/input.json`**

Exactly this content (it mirrors `week-aug02.js` / `REQUESTS_AUG02`; the
agreement test enforces the mirror):

```json
{
  "weekStart": "2026-08-02",
  "dvmCounts": { "Sun": 2, "Mon": 5, "Tue": 4, "Wed": 4, "Thu": 4, "Fri": 4, "Sat": 2 },
  "departmentsEnabled": {
    "Sun": ["ROOM", "SURGERY", "DENTAL", "HSS", "PHARM"],
    "Mon": ["ROOM", "SURGERY", "DENTAL", "HSS", "PHARM"],
    "Tue": ["ROOM", "SURGERY", "DENTAL", "HSS", "PHARM"],
    "Wed": ["ROOM", "SURGERY", "DENTAL", "HSS", "PHARM"],
    "Thu": ["ROOM", "SURGERY", "DENTAL", "HSS", "PHARM"],
    "Fri": ["ROOM", "SURGERY", "DENTAL", "HSS", "PHARM"],
    "Sat": ["ROOM", "SURGERY", "DENTAL", "HSS", "PHARM"]
  },
  "overrides": {
    "alonzo-evelyn": { "Thu": "OFF", "Fri": { "role": "ROOM_TECH" } },
    "gallegos-angie": {
      "Tue": { "role": "ROOM_TECH", "label": "VA (until 5 PM)", "hours": 9.5 },
      "Thu": { "role": "ROOM_TECH" }
    },
    "hooper-camila": { "Fri": "OFF" },
    "lopez-jennifer": { "Mon": { "role": "ROOM_TECH" }, "Tue": "OFF" },
    "mariscal-paulina": { "Fri": "OFF" },
    "quinonez-mariel": { "Wed": { "role": "ROOM_TECH", "timeNote": "9a", "hours": 9.5 } },
    "sharko-chloe": { "Tue": "OFF", "Sat": { "role": "SURGERY_TECH" } }
  },
  "requests": [
    { "id": "req-1", "staffId": "gallegos-angie", "submittedAt": "2026-04-11T20:02:00", "status": "Pending", "decision": "granted", "startDate": "2026-08-08", "hours": 10, "days": 1 },
    { "id": "req-2", "staffId": "gallegos-angie", "submittedAt": "2026-05-13T12:20:00", "status": "Approved", "decision": null, "startDate": "2026-08-04", "hours": 1, "days": 1 },
    { "id": "req-3", "staffId": "escalante-aidee", "submittedAt": "2026-05-14T12:37:00", "status": "Approved", "decision": null, "startDate": "2026-08-04", "hours": 2, "days": 1 },
    { "id": "req-4", "staffId": "gardner-theresa", "submittedAt": "2026-06-16T13:57:17", "status": "Approved", "decision": null, "startDate": "2026-08-02", "hours": 0, "days": 1 },
    { "id": "req-5", "staffId": "gardner-theresa", "submittedAt": "2026-06-16T13:57:17", "status": "Approved", "decision": null, "startDate": "2026-08-03", "hours": 0, "days": 1 },
    { "id": "req-6", "staffId": "gardner-theresa", "submittedAt": "2026-06-16T13:57:17", "status": "Approved", "decision": null, "startDate": "2026-08-04", "hours": 0, "days": 1 },
    { "id": "req-7", "staffId": "pearl-leanne", "submittedAt": "2026-06-19T08:36:00", "status": "Pending", "decision": null, "startDate": "2026-08-08", "hours": 10, "days": 1 },
    { "id": "req-8", "staffId": "willis-bree", "submittedAt": "2026-06-23T13:35:00", "status": "Pending", "decision": "granted", "startDate": "2026-08-04", "hours": 10, "days": 1 },
    { "id": "req-9", "staffId": "rodriguez-glenda", "submittedAt": "2026-07-06T21:34:00", "status": "Pending", "decision": null, "startDate": "2026-08-07", "hours": 30, "days": 3 }
  ]
}
```

- [ ] **Step 5: Write `conformance/aug02/expected.json`**

Transcribe `EXPECTED_GRID` / `EXPECTED_COVERAGE` into the normalized shape.
This is mechanical translation of the committed workbook transcription
(migration spec §5.2 assigns it to Kasey), **not** engine output. Emit it with
this one-off command, then read the file and spot-check three rows against
`src/data/expected-aug02.js` by eye:

```bash
node --input-type=module -e "
import { writeFileSync } from 'node:fs';
import { EXPECTED_GRID, EXPECTED_COVERAGE } from './src/data/expected-aug02.js';
import { SEED_ROSTER } from './src/data/roster.js';
import { DAYS } from './src/domain/calendar.js';
const grid = {};
for (const s of SEED_ROSTER) {
  grid[s.id] = {};
  for (const d of DAYS) grid[s.id][d] = EXPECTED_GRID[s.id][d] ?? '';
}
const coverage = {};
for (const [i, d] of DAYS.entries()) {
  coverage[d] = {};
  for (const role of ['VA', 'RVT', 'HSS', 'PHARM', 'ADMIN']) {
    const row = EXPECTED_COVERAGE[role];
    const scheduled = row.scheduled[i];
    const target = row.target ? row.target[i] : null;
    const v = target === null ? null : scheduled - target;
    const status = v === null ? null : v < 0 ? 'SHORT ' + -v : v > 0 ? 'OVER +' + v : 'ON TARGET';
    coverage[d][role] = { scheduled, target, status };
  }
}
writeFileSync('conformance/aug02/expected.json', JSON.stringify({ grid, coverage }, null, 2) + '\n');
"
```

- [ ] **Step 6: Write `conformance/aug02/annotations.json`**

Exactly this content (spec §5.2's two structural findings — the two PB cells
and Aidee's early leave):

```json
{
  "schedule": [
    { "employeeId": "escalante-aidee", "day": "Tue", "reason": "OMS carries no earlyLeave flag; the workbook's ' · EARLY LEAVE' suffix cannot render (spec §5.2)" },
    { "employeeId": "gardner-theresa", "day": "Thu", "reason": "Workbook prints PB as a role; OMS models Point Beach as a location and leaves the LV cell blank (spec §5.2)" },
    { "employeeId": "ross-shana", "day": "Tue", "reason": "Workbook prints PB as a role; OMS models Point Beach as a location and leaves the LV cell blank (spec §5.2)" }
  ],
  "coverage": []
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npx vitest run conformance/runners/agreement.test.js` — PASS.

---

### Task 6: Domain projector + oracle self-check

**Files:**
- Create: `conformance/runners/projectDomain.js`
- Test: `conformance/runners/projectDomain.test.js`

**Interfaces:**
- Consumes: `statusForVariance` (Task 4), `loadFixture` (Task 5), domain
  modules (`buildWeek`, `coverageCheck`, `targetsForWeek`, `formatCell`,
  `DAYS`), frozen `src/data` fixtures
- Produces: `buildDomainProjection() → { schedule, coverage }` in the
  canonical record shapes

- [ ] **Step 1: Write the failing test**

The oracle self-check: because parity already proves the domain engine equals
the workbook, the domain projection must equal `expected.json` **exactly** —
this proves the projector itself is faithful.

```js
// conformance/runners/projectDomain.test.js
import { describe, it, expect } from 'vitest';
import { loadFixture } from './fixtures.js';
import { buildDomainProjection } from './projectDomain.js';

describe('oracle self-check (spec §5.1): domain projection === expected.json', () => {
  const projection = buildDomainProjection();
  const expected = loadFixture('expected.json');

  it('schedule record equals the workbook grid exactly', () => {
    expect(projection.schedule).toEqual(expected.grid);
  });

  it('coverage record equals the workbook coverage exactly', () => {
    expect(projection.coverage).toEqual(expected.coverage);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run conformance/runners/projectDomain.test.js`
Expected: FAIL — cannot resolve `./projectDomain.js`.

- [ ] **Step 3: Implement**

```js
// conformance/runners/projectDomain.js
/** Oracle projector: frozen fixtures → canonical records (spec §5.1, §5.4). */
import { buildWeek } from '../../src/domain/build.js';
import { coverageCheck } from '../../src/domain/coverage.js';
import { targetsForWeek } from '../../src/domain/targets.js';
import { formatCell } from '../../src/domain/cells.js';
import { DAYS } from '../../src/domain/calendar.js';
import { SEED_ROSTER } from '../../src/data/roster.js';
import { WEEK_AUG02, REQUESTS_AUG02 } from '../../src/data/week-aug02.js';
import { statusForVariance } from './projection.js';

const COVERAGE_ROLE_ORDER = ['VA', 'RVT', 'HSS', 'PHARM', 'ADMIN'];

export function buildDomainProjection() {
  const built = buildWeek({ roster: SEED_ROSTER, week: WEEK_AUG02, requests: REQUESTS_AUG02 });
  const report = coverageCheck(built, targetsForWeek(WEEK_AUG02));

  const schedule = {};
  for (const staff of SEED_ROSTER) {
    schedule[staff.id] = {};
    for (const day of DAYS) {
      schedule[staff.id][day] = formatCell(built.cells[staff.id][day]);
    }
  }

  const coverage = {};
  for (const day of DAYS) {
    coverage[day] = {};
    for (const role of COVERAGE_ROLE_ORDER) {
      const r = report.days[day].roles[role];
      const target = r.target ?? null;
      coverage[day][role] = {
        scheduled: r.scheduled,
        target,
        status: target === null ? null : statusForVariance(r.scheduled - target),
      };
    }
  }

  return { schedule, coverage };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run conformance/runners/projectDomain.test.js` — PASS.
If a cell differs, the bug is in the projector or the Step-5 transcription of
Task 5 — parity guarantees the engine side. Fix the pipeline, never
`src/data`.

---

### Task 7: OMS projector

**Files:**
- Create: `conformance/runners/projectOms.js`
- Test: `conformance/runners/projectOms.test.js`

**Interfaces:**
- Consumes: `cellFromOmsAssignment`, `statusForVariance` (Task 4),
  `loadFixture` (Task 5); `buildSeedDocument` (`src/seed/buildSeed.js`),
  `generateWeek` (`src/engine/generate.js`), `addDays`, `DAYS`
  (`src/domain/calendar.js`), `formatCell` (`src/domain/cells.js`),
  `SEED_ROSTER` (`src/data/roster.js`)
- Produces: `buildOmsDoc(input) → doc`,
  `omsTimeOffFromRequests(requests) → timeOffRequests[]`,
  `buildOmsProjection(input) → { schedule, coverage }` in the canonical
  record shapes

- [ ] **Step 1: Write the failing test**

Smoke assertions use only override- and PTO-driven cells — deterministic
channels that do not bet on solver behavior (what the solver does is SP1's
finding, not this test's).

```js
// conformance/runners/projectOms.test.js
import { describe, it, expect } from 'vitest';
import { buildSeedDocument } from '../../src/seed/buildSeed.js';
import { loadFixture } from './fixtures.js';
import { buildOmsDoc, omsTimeOffFromRequests, buildOmsProjection } from './projectOms.js';

const input = loadFixture('input.json');

describe('omsTimeOffFromRequests mirrors src/domain/timeoff.js isApplied', () => {
  it('Approved or granted → APPROVED; everything else PENDING', () => {
    const rows = omsTimeOffFromRequests(input.requests);
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(byId['req-1'].status).toBe('APPROVED'); // Pending + granted
    expect(byId['req-4'].status).toBe('APPROVED'); // Approved
    expect(byId['req-7'].status).toBe('PENDING');  // Pending, no decision
    expect(byId['req-9'].status).toBe('PENDING');
  });
  it('computes endDate from days', () => {
    const rows = omsTimeOffFromRequests(input.requests);
    const glenda = rows.find((r) => r.id === 'req-9');
    expect(glenda.startDate).toBe('2026-08-07');
    expect(glenda.endDate).toBe('2026-08-09');
  });
});

describe('buildOmsDoc injects input without touching the shipped seed (spec §5.4)', () => {
  it('injects overrides, departmentsEnabled, and requests', () => {
    const doc = buildOmsDoc(input);
    const week = doc.scheduleWeeks['2026-08-02'];
    expect(week.overrides['sharko-chloe'].Sat).toEqual({ role: 'SURGERY_TECH' });
    expect(week.dayPlans.Mon.departmentsEnabled).toHaveLength(5);
    expect(doc.timeOffRequests.map((r) => r.id)).toEqual(input.requests.map((r) => r.id));
  });
  it('a fresh buildSeedDocument() is unaffected', () => {
    buildOmsProjection(input);
    const fresh = buildSeedDocument();
    expect(fresh.scheduleWeeks['2026-08-02'].overrides).toEqual({});
    expect(fresh.scheduleWeeks['2026-08-02'].dayPlans.Mon.departmentsEnabled).toHaveLength(3);
  });
});

describe('buildOmsProjection (spec §5.1)', () => {
  const projection = buildOmsProjection(input);

  it('produces the full canonical matrix', () => {
    const doc = buildSeedDocument();
    const rosterIds = doc.employees.filter((e) => !e.synthetic).map((e) => e.id).sort();
    expect(Object.keys(projection.schedule).sort()).toEqual(rosterIds);
  });

  it('renders override- and PTO-driven cells deterministically', () => {
    expect(projection.schedule['gallegos-angie'].Tue).toBe('VA (until 5 PM)');
    expect(projection.schedule['sharko-chloe'].Tue).toBe('');    // manual OFF → blank
    expect(projection.schedule['sharko-chloe'].Sat).toBe('RVT');
    expect(projection.schedule['gardner-theresa'].Sun).toBe('UNPAID OFF'); // 0h → UNPAID
  });

  it('coverage record has the canonical shape with folded RVT and scheduled-only ADMIN', () => {
    for (const day of ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']) {
      expect(Object.keys(projection.coverage[day])).toEqual(['VA', 'RVT', 'HSS', 'PHARM', 'ADMIN']);
      expect(projection.coverage[day].ADMIN.target).toBeNull();
      expect(projection.coverage[day].ADMIN.status).toBeNull();
    }
    // Mon RVT target folds Surgery 1 + Dental 2 (spec §5.1)
    expect(projection.coverage.Mon.RVT.target).toBe(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run conformance/runners/projectOms.test.js`
Expected: FAIL — cannot resolve `./projectOms.js`.

- [ ] **Step 3: Implement**

```js
// conformance/runners/projectOms.js
/**
 * OMS projector (spec §5.1, §5.4): fresh seed + input.json injected into the
 * 2026-08-02 week, generateWeek run, output reduced to canonical records.
 * The shipped seed and both engines are unchanged (spec decision 4).
 */
import { buildSeedDocument } from '../../src/seed/buildSeed.js';
import { generateWeek } from '../../src/engine/generate.js';
import { formatCell } from '../../src/domain/cells.js';
import { DAYS, addDays } from '../../src/domain/calendar.js';
import { cellFromOmsAssignment, statusForVariance } from './projection.js';

/** Coverage folding (spec §5.1): Surgery and Dental both land on the workbook's RVT line. */
const COVERAGE_FOLD = {
  ROOM_TECH: 'VA',
  SURGERY_TECH: 'RVT',
  DENTAL_TECH: 'RVT',
  HSS: 'HSS',
  PHARM: 'PHARM',
};
const COVERAGE_ROLE_ORDER = ['VA', 'RVT', 'HSS', 'PHARM', 'ADMIN'];

/**
 * input.json requests → OMS timeOffRequests. Applied-ness mirrors
 * src/domain/timeoff.js isApplied: Denied never applies; Approved or a
 * granted decision does. Non-applied rows stay PENDING (inert to the grid).
 */
export function omsTimeOffFromRequests(requests) {
  return requests.map((r) => {
    const applied = r.status !== 'Denied' && (r.status === 'Approved' || r.decision === 'granted');
    return {
      id: r.id,
      employeeId: r.staffId,
      startDate: r.startDate,
      endDate: addDays(r.startDate, r.days - 1),
      hours: r.hours,
      status: applied ? 'APPROVED' : 'PENDING',
      submittedAt: r.submittedAt,
    };
  });
}

export function buildOmsDoc(input) {
  const doc = buildSeedDocument();
  const week = doc.scheduleWeeks[input.weekStart];
  const deptIdByCode = Object.fromEntries(doc.departments.map((d) => [d.code, d.id]));
  week.overrides = input.overrides;
  for (const day of DAYS) {
    week.dayPlans[day].departmentsEnabled = input.departmentsEnabled[day]
      .map((code) => ({ departmentId: deptIdByCode[code], weight: 80 }));
  }
  doc.timeOffRequests = omsTimeOffFromRequests(input.requests);
  return doc;
}

export function buildOmsProjection(input) {
  const doc = buildOmsDoc(input);
  const run = generateWeek(doc, input.weekStart);
  const byKey = new Map(run.assignments.map((a) => [`${a.employeeId}|${a.day}`, a]));

  const schedule = {};
  for (const emp of doc.employees) {
    if (emp.synthetic) continue;
    schedule[emp.id] = {};
    for (const day of DAYS) {
      schedule[emp.id][day] = formatCell(cellFromOmsAssignment(byKey.get(`${emp.id}|${day}`)));
    }
  }

  const coverage = {};
  for (const day of DAYS) {
    coverage[day] = {};
    for (const role of COVERAGE_ROLE_ORDER) {
      coverage[day][role] = { scheduled: 0, target: role === 'ADMIN' ? null : 0, status: null };
    }
    // The workbook's ADMIN row is scheduled-only; OMS has no ADMIN need, so
    // count assignments directly (contract.md records this normalization).
    coverage[day].ADMIN.scheduled = run.assignments
      .filter((a) => a.day === day && a.roleCode === 'ADMIN').length;
  }
  for (const row of run.coverage) {
    const bucket = COVERAGE_FOLD[row.roleCode];
    if (!bucket) continue;
    const rec = coverage[row.day][bucket];
    rec.scheduled += row.scheduled;
    rec.target += row.target;
  }
  for (const day of DAYS) {
    for (const role of COVERAGE_ROLE_ORDER) {
      const rec = coverage[day][role];
      if (rec.target !== null) rec.status = statusForVariance(rec.scheduled - rec.target);
    }
  }

  return { schedule, coverage };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run conformance/runners/projectOms.test.js` — PASS.
Note: `addDays` must exist in `src/domain/calendar.js` (it does — `timeoff.js`
imports it). If any smoke assertion fails, debug the projector/injection —
do **not** adjust an engine to make it pass.

---

### Task 8: Diff engine + report assembly + determinism

**Files:**
- Create: `conformance/runners/diff.js`
- Create: `conformance/runners/report.js`
- Test: `conformance/runners/diff.test.js`
- Test: `conformance/runners/report.test.js`

**Interfaces:**
- Consumes: `buildDomainProjection` (Task 6), `buildOmsProjection` (Task 7),
  `loadFixture` (Task 5)
- Produces: `diffSchedule(oracle, oms, annotations) → divergence[]`,
  `diffCoverage(oracle, oms, annotations) → divergence[]`,
  `buildAug02Report() → report`, `serializeReport(report) → string`

Divergence record shapes (spec §5.5, plus `reason` copied from annotations):

```js
// schedule: { employeeId, day, oracle: '…', oms: '…', category, reason? }
// coverage: { day, role, oracle: {scheduled,target,status}, oms: {…}, category, reason? }
```

- [ ] **Step 1: Write the failing diff test**

```js
// conformance/runners/diff.test.js
import { describe, it, expect } from 'vitest';
import { diffSchedule, diffCoverage } from './diff.js';

const NO_ANNOTATIONS = { schedule: [], coverage: [] };

function matrix(cells) {
  // helper: sparse {empId: {day: str}} → full 7-day matrix
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const out = {};
  for (const [empId, byDay] of Object.entries(cells)) {
    out[empId] = Object.fromEntries(days.map((d) => [d, byDay[d] ?? '']));
  }
  return out;
}

describe('diffSchedule categories (spec §5.5)', () => {
  it('categorizes mismatch / missing / extra and skips equal cells', () => {
    const oracle = matrix({ a: { Mon: 'VA', Tue: 'RVT', Wed: 'HSS' }, b: { Mon: 'VA' } });
    const oms = matrix({ a: { Mon: 'RVT', Tue: 'RVT' }, b: { Mon: 'VA', Tue: 'VA' } });
    const out = diffSchedule(oracle, oms, NO_ANNOTATIONS);
    expect(out).toEqual([
      { employeeId: 'a', day: 'Mon', oracle: 'VA', oms: 'RVT', category: 'mismatch' },
      { employeeId: 'a', day: 'Wed', oracle: 'HSS', oms: '', category: 'missing' },
      { employeeId: 'b', day: 'Tue', oracle: '', oms: 'VA', category: 'extra' },
    ]);
  });

  it('an annotated divergent cell is inexpressible, with the reason attached', () => {
    const annotations = { schedule: [{ employeeId: 'a', day: 'Mon', reason: 'why' }], coverage: [] };
    const out = diffSchedule(matrix({ a: { Mon: 'PB' } }), matrix({ a: {} }), annotations);
    expect(out).toEqual([
      { employeeId: 'a', day: 'Mon', oracle: 'PB', oms: '', category: 'inexpressible', reason: 'why' },
    ]);
  });

  it('an annotated cell that happens to MATCH produces no divergence', () => {
    const annotations = { schedule: [{ employeeId: 'a', day: 'Mon', reason: 'why' }], coverage: [] };
    expect(diffSchedule(matrix({ a: { Mon: 'VA' } }), matrix({ a: { Mon: 'VA' } }), annotations))
      .toEqual([]);
  });

  it('sorts by (employeeId, day order)', () => {
    const oracle = matrix({ z: { Sun: 'VA', Sat: 'VA' }, a: { Fri: 'VA' } });
    const oms = matrix({ z: {}, a: {} });
    expect(diffSchedule(oracle, oms, NO_ANNOTATIONS).map((d) => `${d.employeeId}|${d.day}`))
      .toEqual(['a|Fri', 'z|Sun', 'z|Sat']);
  });
});

describe('diffCoverage (spec §5.1 coverage record)', () => {
  const rec = (scheduled, target, status) => ({ scheduled, target, status });
  const dayRec = (overrides = {}) => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const base = {};
    for (const d of days) {
      base[d] = {
        VA: rec(0, 0, 'ON TARGET'), RVT: rec(0, 0, 'ON TARGET'), HSS: rec(0, 0, 'ON TARGET'),
        PHARM: rec(0, 0, 'ON TARGET'), ADMIN: rec(0, null, null),
      };
    }
    for (const [d, roles] of Object.entries(overrides)) Object.assign(base[d], roles);
    return base;
  };

  it('reports mismatched cells only', () => {
    const oracle = dayRec({ Mon: { VA: rec(12, 12, 'ON TARGET') } });
    const oms = dayRec({ Mon: { VA: rec(11, 12, 'SHORT 1') } });
    expect(diffCoverage(oracle, oms, NO_ANNOTATIONS)).toEqual([
      {
        day: 'Mon', role: 'VA',
        oracle: rec(12, 12, 'ON TARGET'), oms: rec(11, 12, 'SHORT 1'),
        category: 'mismatch',
      },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run conformance/runners/diff.test.js`
Expected: FAIL — cannot resolve `./diff.js`.

- [ ] **Step 3: Implement the diff**

```js
// conformance/runners/diff.js
/** Categorized divergences (spec §5.5). Deterministic ordering (spec §5.6). */
import { DAYS } from '../../src/domain/calendar.js';

const COVERAGE_ROLE_ORDER = ['VA', 'RVT', 'HSS', 'PHARM', 'ADMIN'];

export function diffSchedule(oracle, oms, annotations) {
  const annotated = new Map(annotations.schedule.map((a) => [`${a.employeeId}|${a.day}`, a]));
  const out = [];
  for (const employeeId of Object.keys(oracle).sort()) {
    for (const day of DAYS) {
      const o = oracle[employeeId][day];
      const m = oms[employeeId][day];
      if (o === m) continue;
      const note = annotated.get(`${employeeId}|${day}`);
      let category = 'mismatch';
      if (note) category = 'inexpressible';
      else if (o !== '' && m === '') category = 'missing';
      else if (o === '' && m !== '') category = 'extra';
      out.push({
        employeeId, day, oracle: o, oms: m, category,
        ...(note ? { reason: note.reason } : {}),
      });
    }
  }
  return out;
}

export function diffCoverage(oracle, oms, annotations) {
  const annotated = new Map(annotations.coverage.map((a) => [`${a.day}|${a.role}`, a]));
  const out = [];
  for (const day of DAYS) {
    for (const role of COVERAGE_ROLE_ORDER) {
      const o = oracle[day][role];
      const m = oms[day][role];
      if (o.scheduled === m.scheduled && o.target === m.target && o.status === m.status) continue;
      const note = annotated.get(`${day}|${role}`);
      out.push({
        day, role, oracle: o, oms: m,
        category: note ? 'inexpressible' : 'mismatch',
        ...(note ? { reason: note.reason } : {}),
      });
    }
  }
  return out;
}
```

- [ ] **Step 4: Diff tests green**

Run: `npx vitest run conformance/runners/diff.test.js` — PASS.

- [ ] **Step 5: Write the failing report test**

```js
// conformance/runners/report.test.js
import { describe, it, expect } from 'vitest';
import { buildAug02Report, serializeReport } from './report.js';

describe('the Aug 2 conformance report (spec §5.5–§5.6)', () => {
  const report = buildAug02Report();

  it('is deterministic across consecutive runs', () => {
    expect(serializeReport(buildAug02Report())).toBe(serializeReport(report));
  });

  it('carries no timestamps or run ids', () => {
    expect(serializeReport(report)).not.toMatch(/timestamp|runId|generatedAt/i);
  });

  it('names the three annotated findings as inexpressible (spec §5.2)', () => {
    const inexpressible = report.schedule.filter((d) => d.category === 'inexpressible');
    const keys = inexpressible.map((d) => `${d.employeeId}|${d.day}`);
    expect(keys).toContain('gardner-theresa|Thu');
    expect(keys).toContain('ross-shana|Tue');
    expect(keys).toContain('escalante-aidee|Tue');
    for (const d of inexpressible) expect(d.reason).toBeTruthy();
  });

  it('summary counts match the divergence lists', () => {
    const count = (list, cat) => list.filter((d) => d.category === cat).length;
    for (const cat of ['mismatch', 'missing', 'extra', 'inexpressible']) {
      expect(report.summary.schedule[cat]).toBe(count(report.schedule, cat));
      expect(report.summary.coverage[cat]).toBe(count(report.coverage, cat));
    }
  });
});
```

- [ ] **Step 6: Implement report assembly**

```js
// conformance/runners/report.js
/** Assembles the deterministic Aug 2 divergence report (spec §5.5–§5.7). */
import { loadFixture } from './fixtures.js';
import { buildDomainProjection } from './projectDomain.js';
import { buildOmsProjection } from './projectOms.js';
import { diffSchedule, diffCoverage } from './diff.js';

function countByCategory(divergences) {
  const counts = { mismatch: 0, missing: 0, extra: 0, inexpressible: 0 };
  for (const d of divergences) counts[d.category] += 1;
  return counts;
}

export function buildAug02Report() {
  const input = loadFixture('input.json');
  const annotations = loadFixture('annotations.json');
  const oracle = buildDomainProjection();
  const oms = buildOmsProjection(input);
  const schedule = diffSchedule(oracle.schedule, oms.schedule, annotations);
  const coverage = diffCoverage(oracle.coverage, oms.coverage, annotations);
  return {
    week: input.weekStart,
    summary: { schedule: countByCategory(schedule), coverage: countByCategory(coverage) },
    schedule,
    coverage,
  };
}

export function serializeReport(report) {
  return `${JSON.stringify(report, null, 2)}\n`;
}
```

- [ ] **Step 7: Report tests green**

Run: `npx vitest run conformance/runners/report.test.js` — PASS.
Note: the inexpressible assertions are safe — those three cells are
*structurally* unable to match (no `PB` role code, no `earlyLeave` flag), so
they always diverge and always carry annotations.

---

### Task 9: contract.md

**Files:**
- Create: `conformance/aug02/contract.md`

**Interfaces:**
- Consumes: every shape and rule defined in Tasks 4–8
- Produces: the document a Python runner can be written from without reading
  any JavaScript (spec §5.3; SP3's gate, migration spec §7)

- [ ] **Step 1: Write the contract**

Cover these sections, with the exact values from this plan — no references to
JS files as normative sources (the document must stand alone):

1. **Purpose and files.** What each of `input.json`, `expected.json`,
   `annotations.json`, `baseline.json`, `report.json` is; which are committed;
   `expected.json` is transcribed from the workbook, never generated from an
   engine.
2. **Day and role orders.** Days `Sun…Sat`; coverage roles
   `VA, RVT, HSS, PHARM, ADMIN`.
3. **input.json fields.** `weekStart` (ISO date, a Sunday); `dvmCounts` per
   day; `departmentsEnabled` per day (department codes); `overrides` —
   `employeeId → day → 'OFF' | { role, hours?, label?, timeNote? }` with OMS
   role codes; `requests` — the Time-Off Input rows with
   `id, staffId, submittedAt, status ('Approved'|'Pending'|'Denied'),
   decision ('granted'|'denied'|null), startDate, hours (total across days;
   0 = unpaid), days`. Applied-ness rule: Denied never applies; Approved or
   decision=granted applies.
4. **Cell rendering.** `role`, `role (timeNote)`, `label` verbatim when
   present, ` · EARLY LEAVE` suffix, `PTO`, `UNPAID OFF`, blank string for no
   shift. Role projection table: `ROOM_TECH→VA`, `SURGERY_TECH→RVT`,
   `DENTAL_TECH→RVT` (non-injective by design), `DENTAL_MONITOR→MONITOR`,
   `HSS`, `PHARM`, `ADMIN`, `TECH_NC` identity; pseudo-codes
   `PTO→'PTO'`, `UNPAID_OFF→'UNPAID OFF'`, `OFF→blank`. Unmapped codes are an
   error, never a silent rendering.
5. **Coverage record.** `{scheduled, target, status}` per day×role; the
   Surgery+Dental→RVT fold (targets and scheduled both summed); ADMIN is
   scheduled-only (`target: null, status: null`), counted from ADMIN
   assignments; status convention `SHORT n` / `OVER +n` / `ON TARGET`
   (OMS's internal `OK` normalizes to `ON TARGET`).
6. **Divergence records and categories.** The two record shapes; category
   semantics (`mismatch`, `missing` = oracle has a cell and the candidate is
   blank, `extra` = the reverse, `inexpressible` = listed in
   `annotations.json`); sorting — schedule by `(employeeId, day order)`,
   coverage by `(day order, role order)`.
7. **Determinism.** No timestamps or run ids; two runs must serialize
   identically; JSON with 2-space indent and trailing newline.
8. **Baseline discipline.** The report must equal `baseline.json`; both new
   and fixed divergence fail; baselines change only via the update script,
   deliberately.

- [ ] **Step 2: Self-check the contract**

Read it back asking: could someone port the runner to Python from this file
plus the three JSON fixtures, without opening any `.js` file? Every field
named, every rule stated with its values? Fix gaps inline.

---

### Task 10: CLI, baseline, scripts, done-when gate

**Files:**
- Create: `conformance/runners/run-aug02.js`
- Create: `conformance/aug02/baseline.json` (via the CLI)
- Test: `conformance/runners/baseline.test.js`
- Modify: `package.json` (scripts)
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `buildAug02Report`, `serializeReport` (Task 8), `fixturePath`
  (Task 5)
- Produces: `npm run conformance`, `npm run conformance:update`, the committed
  baseline, the ratchet test

- [ ] **Step 1: Write the CLI**

```js
// conformance/runners/run-aug02.js
/** Writes report.json; --update also refreshes baseline.json (spec §5.7). */
import { writeFileSync } from 'node:fs';
import { buildAug02Report, serializeReport } from './report.js';
import { fixturePath } from './fixtures.js';

const report = buildAug02Report();
const text = serializeReport(report);
writeFileSync(fixturePath('report.json'), text);
console.log(`report.json — schedule ${JSON.stringify(report.summary.schedule)}, coverage ${JSON.stringify(report.summary.coverage)}`);
if (process.argv.includes('--update')) {
  writeFileSync(fixturePath('baseline.json'), text);
  console.log('baseline.json updated — this is a deliberate ratchet move; review the diff');
}
```

- [ ] **Step 2: Add npm scripts and gitignore entry**

`package.json` scripts:

```json
"conformance": "node conformance/runners/run-aug02.js",
"conformance:update": "node conformance/runners/run-aug02.js --update"
```

`.gitignore` — add the line:

```
conformance/aug02/report.json
```

- [ ] **Step 3: Generate the first report and baseline**

Run: `npm run conformance:update`
Expected: both files written; the summary prints divergence counts. Read
`conformance/aug02/report.json` and sanity-check: the three annotated cells
appear as `inexpressible`; the remaining divergences are plausible engine
findings (they are SP1's product — do not "fix" them).

- [ ] **Step 4: Write the ratchet test**

```js
// conformance/runners/baseline.test.js
import { describe, it, expect } from 'vitest';
import { loadFixture } from './fixtures.js';
import { buildAug02Report } from './report.js';

describe('conformance baseline ratchet (spec §5.7)', () => {
  it('the report equals the committed baseline — new AND fixed divergence both fail', () => {
    expect(buildAug02Report()).toEqual(loadFixture('baseline.json'));
  });
});
```

Run: `npx vitest run conformance/runners/baseline.test.js` — PASS.

- [ ] **Step 5: Prove the ratchet fires both ways**

Temporarily edit `conformance/aug02/baseline.json` (change one `oms` string),
run the baseline test, confirm FAIL; revert the edit, confirm PASS. This
verifies fixed divergence fails, not just new divergence.

- [ ] **Step 6: Done-when gate (spec §8)**

- `npx vitest run` — full suite green, only the 2 legacy skips
- `npx vitest run src/data/parity-aug02.test.js` — green in isolation
- `npm run build` — green
- `npm run conformance` twice — `report.json` byte-identical across runs
  (`git status` shows no change, or diff the file)
- `conformance/aug02/` holds `input.json`, `expected.json`,
  `annotations.json`, `contract.md`, `baseline.json` (committed set) and
  `report.json` (gitignored)
- The report names `gardner-theresa|Thu`, `ross-shana|Tue` (PB) and
  `escalante-aidee|Tue` (earlyLeave) as `inexpressible`

---

## Execution notes

- Task order matters: 1 → 2 → 3 (SP0 gate), then 4 → 5 → 6 → 7 → 8 → 9 → 10.
- SP1's divergence findings are the deliverable. If the report shows the OMS
  engine disagreeing with the oracle, that is the instrument working. The only
  divergences that indicate a *plan* bug are in the projectors' own tests
  (Tasks 4–7) and the oracle self-check (Task 6), which must be exact.
- If Vitest fails to pick up `conformance/**/*.test.js`, the default include
  pattern was narrowed — extend `test.include` in `vite.config.js` rather than
  moving the tests.
