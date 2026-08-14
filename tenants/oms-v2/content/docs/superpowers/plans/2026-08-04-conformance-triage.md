# Conformance Triage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drive the Aug 2 conformance report to green — every remaining divergence carries a signed verdict (`inexpressible` or `intended`), all bug-class divergences fixed in OMS.

**Architecture:** Extend `annotations.json` with an `intended` category the diff engine recognizes, then triage the two divergence clusters (RVT extras; Angie Friday) verdict by verdict: root-cause → fix in `src/seed`/`src/engine` or annotate with evidence → ratchet `baseline.json` deliberately per change. Finish with the HANDOFF/migration-spec corrections that retire the stale Track D claims.

**Tech Stack:** Node ESM, vitest, existing conformance runners under `conformance/runners/`.

**Spec:** `docs/superpowers/specs/2026-08-04-conformance-triage-design.md`

## Global Constraints

- `src/domain`, `src/data`, `conformance/aug02/expected.json`, `conformance/aug02/input.json`, and `src/data/parity-aug02.test.js` are frozen — never modified (spec §3.5, §9).
- Fixes land only in `src/seed` or `src/engine` (spec §3.5).
- `baseline.json` updates only via `node conformance/runners/run-aug02.js --update`, one deliberate commit per verdict batch — never regenerated to silence a failure (spec §3.6).
- Every annotation `reason` names the evidence, not just the intent (spec §4).
- Verdict discipline (spec §3.3, §6): one-sided evidence → call it ourselves; workbook and seed disagree with no tiebreaker → queue for Tom, leave in baseline.
- Scope guard (spec §5): a fix that changes engine semantics for weeks other than Aug 2 means the verdict is not "easy" — stop and queue for Tom.
- Full `npx vitest run` green at the end of every task.
- Commit at the end of every task (user has authorized commits for this cycle).

---

### Task 1: `intended` category in the diff engine

**Files:**
- Modify: `conformance/runners/diff.js`
- Test: `conformance/runners/diff.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `diffSchedule(oracle, oms, annotations)` and `diffCoverage(oracle, oms, annotations)` where `annotations` now has shape `{ inexpressible: { schedule: [], coverage: [] }, intended: { schedule: [], coverage: [] } }`. Divergences annotated under `intended` get `category: 'intended'` plus the annotation's `reason`. Entry shapes are unchanged: schedule `{ employeeId, day, reason }`, coverage `{ day, role, reason }`. Precedence: agreement (no divergence) beats any annotation; `inexpressible` beats `intended` if a cell appears in both. Task 2 depends on this signature.

- [ ] **Step 1: Rewrite the annotation fixtures in `diff.test.js` to the new shape and add `intended` cases**

The existing tests build flat `{ schedule: [...], coverage: [...] }` annotation objects (lines 29, 37, 45). Update every existing fixture to nest under `inexpressible` with an empty `intended`, e.g.:

```js
const annotations = {
  inexpressible: { schedule: [{ employeeId: 'a', day: 'Mon', reason: 'why' }], coverage: [] },
  intended: { schedule: [], coverage: [] },
};
```

Then add these new tests:

```js
describe('intended annotations (triage spec §4)', () => {
  const none = { schedule: [], coverage: [] };

  it('an intended-annotated extra is categorized intended with the reason', () => {
    const annotations = {
      inexpressible: none,
      intended: { schedule: [{ employeeId: 'a', day: 'Mon', reason: 'Phase A rotation, workbook superseded' }], coverage: [] },
    };
    const out = diffSchedule(matrix({ a: {} }), matrix({ a: { Mon: 'RVT' } }), annotations);
    expect(out).toEqual([
      { employeeId: 'a', day: 'Mon', oracle: '', oms: 'RVT', category: 'intended', reason: 'Phase A rotation, workbook superseded' },
    ]);
  });

  it('agreement wins — an intended annotation on a matching cell produces no record', () => {
    const annotations = {
      inexpressible: none,
      intended: { schedule: [{ employeeId: 'a', day: 'Mon', reason: 'stale note' }], coverage: [] },
    };
    expect(diffSchedule(matrix({ a: { Mon: 'VA' } }), matrix({ a: { Mon: 'VA' } }), annotations)).toEqual([]);
  });

  it('inexpressible beats intended when a cell is annotated in both', () => {
    const annotations = {
      inexpressible: { schedule: [{ employeeId: 'a', day: 'Mon', reason: 'cannot render' }], coverage: [] },
      intended: { schedule: [{ employeeId: 'a', day: 'Mon', reason: 'also intended' }], coverage: [] },
    };
    const out = diffSchedule(matrix({ a: { Mon: 'PB' } }), matrix({ a: { Mon: 'RVT' } }), annotations);
    expect(out[0].category).toBe('inexpressible');
    expect(out[0].reason).toBe('cannot render');
  });

  it('an intended-annotated coverage mismatch is categorized intended', () => {
    const annotations = {
      inexpressible: none,
      intended: { schedule: [], coverage: [{ day: 'Mon', role: 'RVT', reason: 'Phase A staffing level' }] },
    };
    const oracleCov = coverageMatrix({ Mon: { RVT: { scheduled: 3, target: 3, status: 'ON TARGET' } } });
    const omsCov = coverageMatrix({ Mon: { RVT: { scheduled: 5, target: 3, status: 'OVER +2' } } });
    const out = diffCoverage(oracleCov, omsCov, annotations);
    expect(out).toEqual([
      {
        day: 'Mon', role: 'RVT',
        oracle: { scheduled: 3, target: 3, status: 'ON TARGET' },
        oms: { scheduled: 5, target: 3, status: 'OVER +2' },
        category: 'intended', reason: 'Phase A staffing level',
      },
    ]);
  });
});
```

Reuse the file's existing `matrix` / coverage helpers; if there is no coverage helper, build the two 7-day matrices inline the way the existing coverage tests do.

- [ ] **Step 2: Run the diff tests to verify the new ones fail**

Run: `npx vitest run conformance/runners/diff.test.js`
Expected: existing tests FAIL too (they now pass the new annotation shape to an implementation still reading `annotations.schedule`) — that is the point; the implementation comes next.

- [ ] **Step 3: Implement the category logic in `diff.js`**

Replace both annotation lookups:

```js
/** Categorized divergences (spec §5.5). Deterministic ordering (spec §5.6). */
import { DAYS } from '../../src/domain/calendar.js';

const COVERAGE_ROLE_ORDER = ['VA', 'RVT', 'HSS', 'PHARM', 'ADMIN'];

const toMap = (rows, key) => new Map(rows.map((a) => [key(a), a]));

export function diffSchedule(oracle, oms, annotations) {
  const key = (a) => `${a.employeeId}|${a.day}`;
  const inexpressible = toMap(annotations.inexpressible.schedule, key);
  const intended = toMap(annotations.intended.schedule, key);
  const out = [];
  for (const employeeId of Object.keys(oracle).sort()) {
    for (const day of DAYS) {
      const o = oracle[employeeId][day];
      const m = oms[employeeId][day];
      if (o === m) continue;
      const note = inexpressible.get(`${employeeId}|${day}`) ?? intended.get(`${employeeId}|${day}`);
      let category = 'mismatch';
      if (inexpressible.has(`${employeeId}|${day}`)) category = 'inexpressible';
      else if (intended.has(`${employeeId}|${day}`)) category = 'intended';
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
  const key = (a) => `${a.day}|${a.role}`;
  const inexpressible = toMap(annotations.inexpressible.coverage, key);
  const intended = toMap(annotations.intended.coverage, key);
  const out = [];
  for (const day of DAYS) {
    for (const role of COVERAGE_ROLE_ORDER) {
      const o = oracle[day][role];
      const m = oms[day][role];
      if (o.scheduled === m.scheduled && o.target === m.target && o.status === m.status) continue;
      const note = inexpressible.get(`${day}|${role}`) ?? intended.get(`${day}|${role}`);
      const category = inexpressible.has(`${day}|${role}`) ? 'inexpressible'
        : intended.has(`${day}|${role}`) ? 'intended'
        : 'mismatch';
      out.push({
        day, role, oracle: o, oms: m, category,
        ...(note ? { reason: note.reason } : {}),
      });
    }
  }
  return out;
}
```

- [ ] **Step 4: Run the diff tests to verify they pass**

Run: `npx vitest run conformance/runners/diff.test.js`
Expected: PASS. (`baseline.test.js` and the full suite are expected to fail until Task 2 migrates `annotations.json` — do not run the full suite as a gate here.)

- [ ] **Step 5: Commit**

```bash
git add conformance/runners/diff.js conformance/runners/diff.test.js
git commit -m "feat: intended annotation category in conformance diff"
```

---

### Task 2: Migrate `annotations.json`, summary counts, contract, baseline

**Files:**
- Modify: `conformance/aug02/annotations.json`
- Modify: `conformance/runners/report.js:8` (countByCategory)
- Modify: `conformance/contract.md` (§1 file list, §6 annotations shape)
- Modify: `conformance/aug02/baseline.json` (via CLI ratchet only)

**Interfaces:**
- Consumes: Task 1's annotation shape.
- Produces: the committed `annotations.json` in the new shape; report summaries carry an `intended` count; `contract.md` §6 documents both categories so future runners (SP3 Python) implement them. Tasks 3–4 append entries to this file.

- [ ] **Step 1: Migrate `annotations.json` — existing entries move under `inexpressible` verbatim**

```json
{
  "inexpressible": {
    "schedule": [
      { "employeeId": "escalante-aidee", "day": "Tue", "reason": "OMS carries no earlyLeave flag; the workbook's ' · EARLY LEAVE' suffix cannot render (spec §5.2)" },
      { "employeeId": "gardner-theresa", "day": "Thu", "reason": "Workbook prints PB as a role; OMS models Point Beach as a location and leaves the LV cell blank (spec §5.2)" },
      { "employeeId": "ross-shana", "day": "Tue", "reason": "Workbook prints PB as a role; OMS models Point Beach as a location and leaves the LV cell blank (spec §5.2)" }
    ],
    "coverage": []
  },
  "intended": {
    "schedule": [],
    "coverage": []
  }
}
```

- [ ] **Step 2: Add `intended` to the summary counter in `report.js`**

```js
function countByCategory(divergences) {
  const counts = { mismatch: 0, missing: 0, extra: 0, inexpressible: 0, intended: 0 };
  for (const d of divergences) counts[d.category] += 1;
  return counts;
}
```

- [ ] **Step 3: Ratchet the baseline — the summary shape changed, the divergence set did not**

Run: `node conformance/runners/run-aug02.js --update`
Then: `git diff conformance/aug02/baseline.json`
Expected diff: only the two `summary` objects gain `"intended": 0`. If any divergence entry changed, STOP — Task 1 has a bug.

- [ ] **Step 4: Run the full suite**

Run: `npx vitest run`
Expected: PASS, including `baseline.test.js` and `parity-aug02`.

- [ ] **Step 5: Document the category in `contract.md`**

In §1's file list, extend the `annotations.json` bullet:

```markdown
- `annotations.json` identifies known divergences that carry a standing
  verdict: `inexpressible` (the candidate model cannot express the workbook
  behavior) and `intended` (the candidate is deliberately correct and the
  workbook week reflects superseded rules; the reason names the evidence).
  It is committed.
```

In §6, replace the shape block with the nested form (copy the Step 1 JSON structure with placeholder entries) and add:

```markdown
A conforming runner must implement both categories. Precedence: agreement
between oracle and candidate suppresses any annotation; `inexpressible` wins
over `intended` when the same cell carries both. An `intended` entry's
`reason` must cite evidence (e.g. the commit or rulebook decision that
superseded the workbook), not merely assert intent. Summaries count
`intended` as its own category beside `mismatch`, `missing`, `extra`, and
`inexpressible`.
```

- [ ] **Step 6: Commit**

```bash
git add conformance/aug02/annotations.json conformance/runners/report.js conformance/aug02/baseline.json conformance/contract.md
git commit -m "feat: migrate annotations to categorized shape with intended verdicts"
```

---

### Task 3: Root-cause and verdict the RVT-extras cluster

**Files:**
- Create: `conformance/runners/trace-aug02.js` (diagnostic CLI, committed — reusable for future triage)
- Modify (outcome-dependent): `src/seed/mapRotations.js` and/or `src/seed/buildSeed.js` (fix path) and/or `conformance/aug02/annotations.json` (intended path)
- Modify: `conformance/aug02/baseline.json` (via CLI ratchet only)

**Interfaces:**
- Consumes: `buildSeedDocument()` from `src/seed/buildSeed.js`; `rotationState` from `src/engine/generate.js`; Task 1–2's annotation machinery.
- Produces: a verdict (fix, `intended` annotation, or Tom-queue entry) for each of the 9 schedule extras and 7 coverage mismatches; `docs/superpowers/plans/2026-08-04-conformance-triage-tom-queue.md` if anything queues.

The 9 extras, all folding to the workbook's RVT line: Dimino Mon+Tue, Gallegos Sun+Mon, Gardner Sat, Quinonez Fri, Ross Wed+Thu, Sharko Wed. The 7 coverage `RVT OVER` rows are these same assignments counted — they inherit the cell verdicts and get no independent investigation.

- [ ] **Step 1: Write the diagnostic script**

```js
/** Prints, per employee, the rotation rows generateWeek schedules from for
 * 2026-08-02, beside the roster pattern and the oracle grid — the evidence
 * base for triage verdicts (triage spec §5.1). */
import { buildSeedDocument } from '../../src/seed/buildSeed.js';
import { rotationState } from '../../src/engine/generate.js';
import { SEED_ROSTER } from '../../src/data/roster.js';
import { loadFixture } from './fixtures.js';

const WEEK = '2026-08-02';
const ids = process.argv.slice(2);
if (ids.length === 0) {
  console.error('usage: node conformance/runners/trace-aug02.js <employeeId> [...]');
  process.exit(1);
}

const doc = buildSeedDocument();
const expected = loadFixture('expected.json');

for (const id of ids) {
  const emp = doc.employees.find((e) => e.id === id);
  const roster = SEED_ROSTER.find((s) => s.id === id);
  console.log(`\n=== ${id} ===`);
  console.log('roster pattern days:', Object.keys(roster?.pattern ?? {}).join(' ') || '(none)');
  console.log('oracle week:', JSON.stringify(expected.grid[id]));
  for (const rot of emp?.rotations ?? []) {
    const cadence = rot.cadence ? `${rot.cadence} anchor=${rot.anchorDate} state=${rotationState(rot, WEEK)}` : '';
    const cells = rot.cells ? `cells(order=${rot.rotationOrder ?? 1})=${JSON.stringify(rot.cells)}` : '';
    console.log(`  rotation ${rot.id ?? '(cell row)'} active=${rot.active !== false} ${cadence}${cells}`);
  }
}
```

Adjust property names against the actual rotation row shape if they differ — the script is evidence-printing only and must not modify anything. Check `expected.json`'s real top-level key (`grid` per contract §1) before relying on it.

- [ ] **Step 2: Run it for all six employees and record the mechanism**

Run:

```bash
node conformance/runners/trace-aug02.js dimino-aaron gallegos-angie gardner-theresa quinonez-mariel ross-shana sharko-chloe
```

For each extra cell, answer: which rotation row puts the employee ON that day for the week of 2026-08-02? Note that Dimino's roster pattern is Wed(ADMIN)/Thu/Fri/Sat — his Mon+Tue extras cannot come from the flat pattern, so the multi-week cell rotation rows built by `mapEmployeeRotations` (`src/seed/mapRotations.js`) and their phase (`rotationOrder` selection relative to the week) are the first suspects.

- [ ] **Step 3: Call the verdict per employee, applying the spec's decision rule**

For each employee, compare the ON-days the trace shows against (a) the roster pattern and rotation notes in `src/data/roster.js` (frozen workbook transcription) and (b) the oracle grid. Decision rule (spec §2.3, §3.3):

- The cell rotation contradicts the frozen roster transcription (wrong days, wrong phase for 2026-08-02) → **bug** — fix the conversion in `src/seed/mapRotations.js` (or the row data in `buildSeed.js`), not the engine, unless the trace proves `rotationState`/row-selection in `src/engine/generate.js` picks the wrong row.
- The cell rotation is faithful to the transcription but the workbook week's manager hand-edits took the employee off → **intended is NOT automatic**: the workbook's hand-overrides were already injected via `input.json`. If the employee is ON per their own transcribed rotation and no injected override removes them, the divergence is between transcription and the manager's actual week — that is a **no-tiebreaker case → Tom's queue**.
- The extra matches a Phase A correction traceable to Tom's Approach B commit (compare against `git show 4d1de56 -- src/seed` if needed; that commit is reachable via the `old-scheduler` remote) → **intended**, reason citing the commit.

- [ ] **Step 4: Apply the outcomes**

*Fix path (per employee or per mechanism):* make the minimal seed/engine correction; then:

```bash
npx vitest run          # parity-aug02 and all seed/engine tests must stay green
node conformance/runners/run-aug02.js --update
git diff conformance/aug02/baseline.json   # only the fixed entries disappear
git add -A && git commit -m "fix: <employee/mechanism> rotation phase for aug02 conformance"
```

*Intended path:* append to `annotations.json` under `intended.schedule` (and `intended.coverage` for any coverage row fully explained by intended cells):

```json
{ "employeeId": "dimino-aaron", "day": "Mon", "reason": "<evidence: commit/rulebook decision>" }
```

then ratchet and commit exactly as above with message `docs: annotate <employee> aug02 divergence as intended`.

*Queue path:* add the employee, cells, trace output, and the open question to `docs/superpowers/plans/2026-08-04-conformance-triage-tom-queue.md` (create on first use, a plain list). The baseline keeps the divergence; no annotation is written.

- [ ] **Step 5: Coverage rows follow their cells**

After all six employees are resolved, re-run `node conformance/runners/run-aug02.js`. Any remaining coverage `RVT OVER` row whose contributing cells were all verdicted `intended` gets an `intended.coverage` annotation citing the cell verdicts; rows whose cells were fixed should have disappeared. A coverage row with mixed or queued cells stays in the baseline unannotated. Ratchet + commit as in Step 4.

- [ ] **Step 6: Full suite gate**

Run: `npx vitest run`
Expected: PASS.

```bash
git add conformance/runners/trace-aug02.js
git commit -m "feat: aug02 rotation trace CLI for conformance triage"
```

(Commit the trace script whenever convenient before task end; keep verdict commits separate.)

---

### Task 4: Root-cause and verdict the Angie Friday mismatch

**Files:**
- Modify (outcome-dependent): `src/seed/*` / `src/engine/generate.js` (fix path) or `conformance/aug02/annotations.json` (intended path) or the Tom queue file
- Modify: `conformance/aug02/baseline.json` (via CLI ratchet only)

**Interfaces:**
- Consumes: Task 3's trace CLI and verdict mechanics.
- Produces: the final verdict; after this task the report contains only annotated or queued entries.

- [ ] **Step 1: Trace the assignment**

Oracle: `RVT`; OMS: `VA`. Run `node conformance/runners/trace-aug02.js gallegos-angie` and additionally inspect the generated assignment:

```bash
node -e "
import('./conformance/runners/projectOms.js').then(async ({ buildOmsDoc }) => {
  const { generateWeek } = await import('./src/engine/generate.js');
  const { loadFixture } = await import('./conformance/runners/fixtures.js');
  const doc = buildOmsDoc(loadFixture('input.json'));
  const run = generateWeek(doc, '2026-08-02');
  console.log(run.assignments.filter(a => a.employeeId === 'gallegos-angie'));
});"
```

Prime suspects, in order: (1) her `input.json` Tue/Thu `ROOM_TECH` overrides interacting with rotation ON-days; (2) a pull-order demotion — her roster notes say `Pull order #1 (first to VA)`, so the engine may be pulling her to Room Tech (VA) on Friday to fill a Room need the workbook filled differently; (3) the projection fold (`ROOM_TECH → VA` in `projectOms.js`) rendering a role the workbook printed as RVT.

- [ ] **Step 2: Verdict and apply**

Same decision rule and mechanics as Task 3 Steps 3–4. Note the pull-to-VA case is genuine engine *policy*: if the trace shows a deliberate pull-order decision that Phase A rules endorse, that is `intended` with the rulebook note as evidence; if it shows the engine pulling when coverage did not require it, that is a bug — but if the fix would change pull behavior for other weeks, the scope guard applies: queue for Tom instead.

- [ ] **Step 3: Full suite gate + commit**

Run: `npx vitest run` — PASS, then commit per the outcome path.

---

### Task 5: Documentation corrections (HANDOFF + migration spec)

**Files:**
- Modify: `HANDOFF.md` §4 (decisions table row 8), §5 ("Immediate — Track D hygiene" block), §6 (new verdict-process block)
- Modify: `docs/superpowers/specs/2026-08-04-production-migration-design.md` §11

**Interfaces:**
- Consumes: verdict outcomes from Tasks 3–4 (the HANDOFF process text is outcome-independent; write it regardless).
- Produces: docs that no longer claim Phase A is unpushed or track Kenny Williams.

- [ ] **Step 1: HANDOFF §4 row 8**

Replace the row `| 8 | Phase A rulebook session with the manager is **done** | Corrections live in Tom's working copy — must be pushed (see §5) |` with:

```markdown
| 8 | Phase A rulebook session is **done and its corrections are landed** | Pushed via the Approach B commit in the previous repo (`HinchK/scheduler` `4d1de56`); verified 2026-08-04 by tree diff — old-repo `main` is fully contained in this repo's `main`. Kenny Williams left West Coast; his absence from the seed is correct, tracking stopped |
```

- [ ] **Step 2: HANDOFF §5 — replace the "Immediate — Track D hygiene" block**

Replace the whole block (heading and paragraph) with:

```markdown
### Immediate — conformance triage (both tracks)

SP1's Aug 2 report is the work queue: drive it to green under the verdict
process (§6). Spec: `docs/superpowers/specs/2026-08-04-conformance-triage-design.md`.
The former Track D hygiene item is resolved — Phase A corrections landed via
the Approach B commit (verified 2026-08-04, see §4.8), and Kenny Williams is
no longer tracked (left West Coast).
```

- [ ] **Step 3: HANDOFF §6 — add the verdict process after the "Process" list**

```markdown
### Conformance verdicts

Every divergence in a conformance report is root-caused to a named mechanism
before receiving one of three verdicts: **bug** (fix in `src/engine`/`src/seed`),
**intended** (annotate in `annotations.json` with evidence), or **queued for
Tom** (left in baseline). Kasey and the agent call verdicts where the evidence
is one-sided; anything where the workbook and the seed disagree without a
tiebreaker is Tom's call. `expected.json` is never edited. The annotations
file is the audit trail.
```

- [ ] **Step 4: Migration spec §11 — append the resolution, do not rewrite**

After the paragraph beginning `**Still open: Track D's Phase A output is not in the repository.**`, append:

```markdown
**Resolution (2026-08-04, conformance triage cycle):** the claim above is
retired. Tom's Phase A corrections were pushed to the previous repository
(`HinchK/scheduler`), chiefly in the Approach B commit `4d1de56`, and the
migration captured them: a tree diff shows the old repo's `main` is fully
contained in this repo's `main` — the only delta is the additive SP0/SP1
work. Kenny Williams no longer works at West Coast, so his absence from the
seed is correct rather than a pending fix. Generator semantics measured by
SP1 are therefore final. See
`docs/superpowers/specs/2026-08-04-conformance-triage-design.md` §2.
```

- [ ] **Step 5: Commit**

```bash
git add HANDOFF.md docs/superpowers/specs/2026-08-04-production-migration-design.md
git commit -m "docs: retire stale Track D claims; record conformance verdict process"
```

---

### Task 6: Completion gate

**Files:** none new — verification only.

- [ ] **Step 1: Full suite**

Run: `npx vitest run`
Expected: PASS, including `parity-aug02`, all conformance runners, and the baseline ratchet.

- [ ] **Step 2: Report contains only signed entries**

Run: `node conformance/runners/run-aug02.js` and inspect `conformance/aug02/report.json`. Every `schedule` and `coverage` entry must have category `inexpressible` or `intended` — except entries listed in `docs/superpowers/plans/2026-08-04-conformance-triage-tom-queue.md`, which must match one-for-one.

- [ ] **Step 3: Frozen paths untouched**

Run: `git log --oneline main -- src/domain src/data conformance/aug02/expected.json conformance/aug02/input.json` and confirm no commits from this cycle touched them.

- [ ] **Step 4: Hand off**

If the Tom queue exists, surface it to the user with the open questions. Report the final summary counts and the baseline diff across the cycle.
