# Conformance Triage Design — Drive the Aug 2 Report to Green

*2026-08-04. Follows SP1 (`2026-08-04-sp0-sp1-stabilize-and-conformance-design.md`).
SP1 built the instrument and published the first divergence report; this cycle
acts on it. The SP2 gate (migration spec §3.8) required the report to exist —
it does. This cycle closes the measured gap so SP2 persists an engine whose
divergences are all understood and signed.*

---

## 1. Why this cycle

The Aug 2 conformance report (`conformance/aug02/baseline.json`) records 17
divergences between the live OMS engine and the workbook oracle:

| Channel | Finding |
|---|---|
| Schedule | 1 mismatch, 9 extras, 3 inexpressible (annotated) |
| Coverage | 7 mismatches — every one an RVT `OVER +1`/`OVER +2` |

The user-selected direction (this brainstorm, 2026-08-04): **triage before
SP2, driving toward green** — OMS matches the oracle on Aug 2 for everything
expressible; only annotated divergences remain.

"Green" cannot mean "fix all 17" — see §2.3. Some divergences may be places
where OMS is *right* and the workbook week reflects rules the manager has since
corrected. Green means **every remaining divergence carries a signed verdict.**

## 2. Facts established during exploration (verified 2026-08-04)

### 2.1 Phase A has landed — three standing claims retired

The docs carried three claims about Track D that are now verified stale:

1. **"Phase A corrections live in Tom's unpushed working copy" — retired.**
   Tom pushed them to the previous repository (`HinchK/scheduler`), chiefly in
   the Approach B commit (`4d1de56`, 2026-08-04). Verified by tree diff: the
   only difference between that repo's `main` and this repo's `main` is the
   additive SP0/SP1 work. Nothing from the old repo is missing here.
2. **"Kenny Williams fix pending" — retired.** Kenny no longer works at West
   Coast. His absence from the seed is correct, not a gap. Tracking stops.
3. **"Generator semantics not final; Phase A may invalidate SP1 fixtures" —
   retired.** The engine SP1 measured *is* the Phase A-corrected engine. The
   baseline measures final semantics.

Consequence: the report is now actionable. §7 updates HANDOFF and the
migration spec so no future session re-derives the stale state from the docs.

### 2.2 The divergences form three clusters, not 17 items

- **(a) The RVT-extras cluster — 16 of 17 findings.** All 9 schedule extras
  are cells where OMS assigns a Surgery/Dental role (folded to the workbook's
  RVT line) and the workbook cell is blank. All 7 coverage mismatches are the
  same assignments counted: RVT `OVER` every day, Sun–Sat. One mechanism.
- **(b) The Angie Friday mismatch — 1 finding.** Oracle `RVT`, OMS `VA`
  (`gallegos-angie`, Fri). Likely interacts with her Tue/Thu overrides already
  carried in `input.json`.
- **(c) The 3 inexpressibles — already annotated, no action.** Early-leave
  suffix and the two Point Beach cells (`annotations.json`).

### 2.3 The mechanism behind cluster (a)

The seed carries workbook-style multi-week **cell rotations**
(`buildSeed.js`), and `generateWeek` builds standing assignments from them
(`src/engine/generate.js` — `rotationState`, cell-rotation rows). Every extra
is a day where the rotation grid says ON and the workbook's actual week says
off. Two candidate explanations, with opposite verdicts:

- **Bug:** the rotation data or its phase (anchor date / `rotationOrder`)
  diverges from what the manager actually runs → fix the seed or the engine.
- **Intended:** the rotation reflects a Phase A correction, and the workbook's
  Aug 2 week is the superseded party → annotate, do not "fix."

Distinguishing these per employee is the core work of this cycle.

## 3. Decisions

| # | Decision | Why |
|---|---|---|
| 1 | Verdict-gated green (Approach 1 of 3, user-approved) | Fixing everything assumes all divergences are bugs; with Phase A landed, that assumption is unsafe — it could regress Tom's validated rulebook to match a superseded workbook |
| 2 | `annotations.json` grows an **`intended`** category beside `inexpressible` | `expected.json` never changes (standing rule); intentional divergence needs a home that is auditable and mechanical, same as inexpressible |
| 3 | **Easy verdicts are called by Kasey + agent; ambiguous ones queue for Tom** | User decision this brainstorm. "Easy" = the evidence is one-sided (mechanical off-by-one, or a rotation cell provably matching Tom's Phase A commit). No tiebreaker → Tom. The process is documented in HANDOFF (§6) |
| 4 | Root cause **before** verdict, always | A verdict on an undiagnosed divergence is a guess. Each cluster gets a named mechanism first |
| 5 | Neither `src/domain`, `src/data`, `expected.json`, nor the parity tripwire changes | Same rule as SP1: the oracle is frozen; fixes land in `src/engine` / `src/seed` only |
| 6 | Baseline updates are deliberate per-fix commits | The ratchet test is the harness; regenerating `baseline.json` wholesale would blind it exactly when it matters most |

## 4. Annotations schema extension

`annotations.json` today:

```json
{ "schedule": [ { "employeeId": "...", "day": "...", "reason": "..." } ], "coverage": [] }
```

New shape — entries move under category keys; the flat arrays above are the
`inexpressible` category:

```json
{
  "inexpressible": { "schedule": [ ... ], "coverage": [ ... ] },
  "intended":      { "schedule": [ ... ], "coverage": [ ... ] }
}
```

- Entry shape is unchanged (`employeeId`/`day`/`reason` for schedule;
  `day`/`role`/`reason` for coverage). `reason` must name the evidence, not
  just assert intent.
- The diff engine (`conformance/runners/diff.js`) classifies an
  annotated-intended divergence as category `intended` instead of
  `mismatch`/`extra`/`missing`, with the same precedence discipline the
  existing inexpressible tests cover (`diff.test.js`). Agreement — oracle and
  candidate matching — always wins over any annotation.
- The report summary gains an `intended` count in both channels.
- `contract.md` is updated so future runners (the Python port at SP3) inherit
  the category; a conforming runner must implement it.
- Migration of the current file: the three existing entries move under
  `inexpressible` verbatim.

## 5. Investigation and fix scope

Work proceeds cluster by cluster; each ends in fixes, annotations, or a queued
question for Tom — never an unexplained baseline entry.

1. **Cluster (a) — RVT extras.** For each of the six affected employees
   (Dimino, Gallegos, Gardner, Quinonez, Ross, Sharko): trace the extra cell to
   its rotation row and phase; compare against the workbook's rotation sheet
   (`src/data/` transcription) and Tom's Approach B commit. One-sided evidence
   → fix (seed/engine) or annotate `intended`. Otherwise → Tom's queue.
2. **Cluster (b) — Angie Friday.** Diagnose why OMS assigns VA where the
   workbook has RVT; interaction with her `input.json` overrides is the first
   suspect. Same verdict discipline.
3. **Cluster (c)** — no action.

Fixes must keep the full vitest suite green, including `parity-aug02` (which
this cycle must not touch) and the conformance ratchet (which each fix commit
updates deliberately).

**Scope guard:** if a fix to cluster (a) requires changing engine semantics in
ways that affect weeks other than Aug 2, that is evidence the verdict is not
"easy" — stop and queue for Tom.

## 6. The verdict process, as HANDOFF will record it

A short section is added to HANDOFF §6 (process):

> **Conformance verdicts.** Every divergence in a conformance report is
> root-caused to a named mechanism before receiving one of three verdicts:
> **bug** (fix in `src/engine`/`src/seed`), **intended** (annotate in
> `annotations.json` with evidence), or **queued for Tom** (left in baseline).
> Kasey and the agent call verdicts where the evidence is one-sided; anything
> where the workbook and the seed disagree without a tiebreaker is Tom's call.
> `expected.json` is never edited. The annotations file is the audit trail.

## 7. Documentation corrections (same cycle, not a follow-up)

- **HANDOFF §4/§5:** retire "Phase A unpushed" and the Kenny Williams item;
  record that Phase A landed via the Approach B commit and that Kenny left
  West Coast. Replace the "Immediate — Track D hygiene" call to action with
  the current state.
- **HANDOFF §6:** add the verdict process (§6 above).
- **Migration spec §11:** annotate the "Still open: Track D's Phase A output
  is not in the repository" finding as resolved 2026-08-04, with the tree-diff
  evidence. Do not rewrite history — append the resolution.

## 8. Completion gate

This cycle is done when:

1. `npx vitest run` is fully green, including conformance and `parity-aug02`.
2. The Aug 2 report contains **only annotated entries** (`inexpressible` or
   `intended`) and Tom's queue — and the queue is either empty or explicitly
   handed off with a written list.
3. `baseline.json` equals the report — the ratchet guards the new state.
4. `contract.md` documents the `intended` category for future runners.
5. HANDOFF and the migration spec carry the corrections in §7.

## 9. Non-goals

- No SP2 work (containers, FastAPI, Postgres, Entra). This cycle clears the
  runway; it does not taxi onto it.
- No changes to `src/domain`, `src/data`, `expected.json`, `input.json`, or
  the parity tripwire.
- No new conformance weeks. Aug 2 is the only fixture; more weeks are Track D
  work (migration spec §5.2).
- No UI work. The Approach B follow-on list (HANDOFF §5) stays deferred.
