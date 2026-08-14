# WCAH Scheduler — MVP Design

*Design spec, brainstormed and approved 2026-07-24. Status: approved for
planning (writing-plans is the next step).*

Sources: `~/WestCoast.Vet/docs/scheduling-epic-spec.md` (the epic),
`~/WestCoast.Vet/docs/Shift Scheduling Software Requirements.docx` (the
requirements doc), `~/WestCoast.Vet/docs/WCAH_Schedule_Builder_Template.xlsx`
(the workbook), and the `feature/scheduling-demo` branch of
`~/WestCoast.Vet/prototype/` (front-end direction).

## What this is

A production-intent MVP that solves exactly one problem: **employee shift
scheduling** for West Coast Animal Hospital Linda Vista. It automates the work
the office manager does today in `WCAH_Schedule_Builder_Template.xlsx`, so she
can set correct, fair staff schedules a month out, quickly. It is explicitly
**not** a practice-management system, not a vet-appointment system, and not
the prototype's demo.

**The central discovery reframing this build:** the epic spec assumed phase-1
rule extraction hadn't happened and mandated fictitious data. The workbook *is*
the phase-1 output — a real 28-person roster with per-person weekly patterns
and constraints, ~15 standing rules written in the manager's language, the
per-role daily coverage-target formulas, and the full weekly pipeline
(patterns + rotations + time off + overrides → proposed schedule → coverage
check → manual repairs via a pull order). This MVP encodes the *real* rulebook,
not planted fiction.

## Decision log

| # | Decision | Choice |
|---|----------|--------|
| 1 | Ingestion | **Deterministic first, AI seam.** MVP parses known-format Paylocity exports deterministically; ingestion is built behind an `ImportAdapter` contract so an AI adapter (freeform paste/screenshots via Claude API) plugs in later with no downstream changes. |
| 2 | Runtime shape | **Local-first SPA.** Vite + React 18 + Tailwind v4, JS with JSDoc-typed pure domain (prototype stack). Persistence = IndexedDB auto-save + JSON export/import. No server, no accounts. Storage isolated behind an interface for a later backend. |
| 3 | Horizon | **4 real editable weeks** (rolling). Each week has its own Week Setup, time off, and overrides. Rotation toggles are auto-proposed per week from cadence; the manager confirms or flips. Every week is publishable. |
| 4 | Seed data | **Real data + Excel-parity test.** Ships with the real roster and rulebook; acceptance = reproduce the workbook's Aug 2–8 Proposed Schedule and Coverage Check exactly. Real names in a private repo — accepted knowingly. |
| 5 | Build approach | **Greenfield app, workbook-native domain, prototype-derived UI.** New repo at `~/WestCoast.Vet/scheduler/`. Domain re-founded on the workbook's person×day×role model (the prototype's block model doesn't fit). Copy-adapt from the prototype: design tokens, Dashboard/Coverage Board idioms, dnd engine, architecture discipline. Domain-first build order: parity test passes before serious UI. |

Rejected: forking the prototype (un-baking demo assumptions — block slots,
planted-defect tripwire tests, projection horizon — costs more than porting the
good parts out), and a two-package workspace (plumbing tax without MVP payoff).

## Relationship to the prototype

Carried over: Coastal Glass design language via `@theme` tokens, the
dashboard-as-front-door / board-as-drill-down two-surface pattern, the dnd
engine, pure-domain discipline (no React, no `Date.now()`, ids/timestamps via
args), rule-templates→violations architecture, suggestions with **measured**
impact (simulate the move, diff the result — never assert unearned numbers),
flag-never-block editing.

Left behind: the fictional clinic (roster, rules, planted defects), operational
blocks as rows (Kennel AM, Surgery Block…), the projection-based horizon, demo
auth/lock screen, chemistry/archetypes (requirements doc Phase 2; the synergy
grid idea returns then).

## 1. Surfaces

The user is the office manager. Two primary surfaces (Month Dashboard, Week
Board) and four supporting ones (Roster, Week Setup, Time-Off Import, Publish).

### Month Dashboard (front door)

Four real weeks at a glance: per-week coverage status, violation counts, PTO
load, rotation toggles awaiting confirmation. Month-scale metrics the Excel
cannot see: Saturday-rotation equity across staff, per-person hours vs standard
(undertime/overtime), month coverage summary. A **decision queue** lists what
needs the manager: pending time-off requests (ordered first-submitted-wins,
each showing coverage impact if granted), unresolved gaps, unconfirmed
rotations. Every item links into the week it affects.

### Week Board (drill-down; where editing happens)

- **Grid**: roster rows (28) × 7 day columns. Cells are assignment chips —
  role, plus time when nonstandard (`RVT 7:30–4:30`, `RVT 9a`), plus state
  markers (`PTO`, `UNPAID OFF`, `EARLY LEAVE`, `Tech NC · until 1:00 PM`).
- **Coverage strip**: per-day per-role scheduled vs target with variance
  badges — the workbook's Coverage Check, recomputed live on every edit.
- **Right rail** (context-switching): nothing selected → week vitals +
  rulebook; violation selected → the rule in plain language + repair
  suggestions honoring the pull order, one-click apply; person selected →
  their week, hours, constraints, patterns.
- **Editing**: click a cell → set role / OFF / clear override / adjust time;
  or drag a person chip from the available-staff bench onto a day cell.
  Both paths create Overrides — the pattern layer is never mutated by
  week-level edits.

### Roster

Staff CRUD: default weekly pattern editor (day → role + shift times),
structured constraints (fixed days, forbidden days, forbidden assignments,
consecutive-off exemption), rotation memberships (cadence + anchor + linked
effects), pull-order editor. Roster rows can also arrive via paste-import
from the workbook's Roster sheet (same preview/confirm flow as time off).

### Week Setup (per week)

Start date, DVM count per day (drives VA targets), rotation toggle proposals
generated from cadence with confirm/flip controls.

### Time-Off Import

Paste the Paylocity export → parsed preview table (per-row classification:
paid PTO / unpaid / partial early-leave; per-row issues) → Apply. Pending
requests queue in first-submitted-wins order; granting one previews coverage
impact.

### Publish

Per-week: printable schedule grid + CSV keyed by **Paylocity name** for manual
entry into Paylocity (Phase-1 output is manual by design). Full-state JSON
export/import as backup and backend seam.

Deliberately absent: DVM names (requirements doc Phase 2 — the MVP takes DVM
*counts*, like the workbook), synergy grids (Phase 2), API integrations
(Phases 3–7), auth, AI parsing (seam only), mobile layout.

## 2. Domain model

`src/domain/` — pure, JSDoc-typed: no React, no `Date.now()`, no id generation
inside reducers; timestamps and ids arrive via action payloads / factory args.

### Entities

- **`StaffMember`** — id, displayName, paylocityName, primary role
  (VA / RVT / HSS / PHARM), altRoles, defaultPattern (day → {role, start,
  end}), constraints (structured: fixedDays, noDays, maxDaysPerWeek,
  consecutiveOffExempt, forbiddenAssignments, notes), pullOrderRank,
  rotationIds.
- **`Rotation`** — staffId, day, roleWhenOn, cadence (`everyOtherWeek` |
  `everyThirdWeek` | `alternating` | `monthly`), anchorDate, linkedEffects
  (e.g. Vero: Sun ON ⇒ Fri OFF; Paulina C-M: Sat ON ⇒ drop a weekday;
  Shana: Sun OFF weeks = Mon/Tue(PB)/Wed/Fri, Sun ON weeks = Mon/Tue(PB) +
  Wed-or-Fri alternating).
- **`Week`** — id (Sunday start date), dvmCounts per day, toggleStates
  (proposed by cadence engine + confirmed by manager), appliedTimeOff,
  overrides (staffId × day → {role | OFF, start?, end?}), status
  (draft | published).
- **`TimeOffRequest`** — submittedAt, employeeName, empNum, status
  (Approved | Pending), start, hours, days; derived type: hours > 0 = PAID
  PTO (no makeup), hours = 0 = UNPAID (makeup owed, tracked until a makeup
  shift is scheduled), partial early-leave (still works; marked on the chip).

### Pipeline (the workbook's, made explicit)

```
buildWeek(roster, week, timeOff) → ProposedSchedule    // person×day assignments
coverageCheck(schedule, targets(week)) → CoverageReport // per-day per-role scheduled/target/variance
evaluateWeek(schedule, rulebook) → Violation[]
suggestions(state) → Suggestion[]                       // ordered reducer actions + measured impact
```

`buildWeek` expansion order: default patterns → rotation toggle states →
time off → overrides. Deterministic; same inputs, same schedule.

**Coverage targets**: VA weekday = (2×DVMs)+2 (monitor + floater), VA weekend
= (2×DVMs)+1; RVT weekday 3 (1 surgery + 2 dental), weekend 2; HSS 1 on
weekdays + Sat, Sun only when Bree's rotation is ON; PHARM 1 weekday, 0
weekends. MONITOR counts toward VA; ADMIN sits outside targets; Michaela's
Tuesday non-coverage role is shown but never counted.

### Rulebook

The standing rules become editable **rule instances** over a closed template
set: `roleCoverageTarget`, `personDayLock`, `forbiddenAssignment`,
`consecutiveDaysOff`, `maxDaysPerWeek`, `undertime`, `overtime`. Each instance
carries params, a violation-message template in the manager's language, and a
**flexibility rating** (`fixed` | `flexible` | `highlyFlexible`) per the
requirements doc — mapping to severity (red / amber / info) and ordering
repairs ("2 techs per DVM is not flexible; overtime is highly flexible").

Procedural policies are **engine configuration, not violation rules**: the
RVT→VA pull order (Angie → Chloe → Mariel → Theresa → Shana → Carla → Aaron →
Teagan), ADMIN priority (coverage first → Aaron 1/wk → Mariel Thu; Michelle's
standing Wed ADMIN), first-submitted-wins for competing time off, and PTO
makeup semantics. They drive the suggestion generator and import behavior.

A rule that can't be expressed in the template set is a **finding** to bring
back to the manager, not a failure — the closed set doubles as the interview
taxonomy for anything the workbook missed.

### Suggestions

Gap repairs walk the pull order filtered by availability, constraints, and
no-new-hard-violations; unpaid-PTO makeup shifts are proposed into thin days;
ADMIN allocation follows the priority policy. Every suggestion is an **ordered
list of real reducer actions** with impact **measured by simulating the move
and diffing** coverage/violations/hours — never asserted.

### Month metrics

Saturday-rotation equity uses a Gini coefficient over rotation participation
(max−min saturates on ordinary rosters — prototype lesson). Hours vs standard
per person surfaces undertime and overtime week by week and pooled across the
month (pooled, not averaged — averaging hides exactly what the horizon exists
to reveal).

## 3. State, persistence, import

- One reducer + selectors behind a `useSchedulerStore` hook; UI components are
  module-scope only (inline definitions remount subtrees and cancel drags —
  prototype hard rule carried over).
- Every action auto-saves through a **`SchedulerStore` interface**; MVP
  implementation is IndexedDB. Versioned schema with a migration hook. JSON
  export/import of full state (backup + future-backend seam).
- First run seeds: real roster (28 staff, patterns, constraints, rotations,
  pull order), rulebook instances with flexibility ratings, and the workbook's
  Aug 2–8 week (week setup, time off, overrides) as a worked example.
- **`ImportAdapter` contract**: `parse(rawText) → {records, issues}`. MVP
  ships the deterministic Paylocity time-off parser (known columns: Submitted,
  Employee, Emp #, Status, Request Start, Hours, Days; both observed datetime
  formats: `03/10/2026 01:43 PM` and `06/16/2026 13:57:17`) and a roster
  paste parser. The later AI adapter (freeform text/screenshots via Claude
  API) implements the same contract and feeds the same preview/confirm UI —
  human confirmation stays in front of AI-extracted data.

## 4. Error handling & edge semantics

- **Import never commits blind.** Preview table with per-row classifications
  and issues; unknown names get fuzzy-match suggestions against display *and*
  Paylocity names (`Gallegos, Angie` ↔ `Gallegos, Angela` is real), manual
  mapping, never silent guessing. Nothing applies until confirmed.
- **Edits flag, never block.** Any override lands; coverage strip and
  violations react. An unfillable gap shows an honest "no repair available
  given current rules" state.
- **Storage failures degrade loudly.** Failed IndexedDB writes raise a
  persistent banner; JSON export remains the escape hatch. Schema version
  mismatch runs migrations or refuses with a clear message — never silently
  drops data.
- **Rotation edges.** Weeks with unconfirmed toggles are buildable but marked
  provisional on the dashboard. A rotation without an anchor prompts for one
  rather than guessing. The domain is pure and synchronous — no async failure
  modes.

## 5. Testing

Vitest, domain-first (fast, no browser):

- **Excel-parity test (the centerpiece):** seed the workbook's exact Week
  Setup, time-off rows, and overrides for Aug 2–8 → `buildWeek` reproduces
  the Proposed Schedule sheet cell-for-cell (including `PTO`, `UNPAID OFF`,
  `EARLY LEAVE`, and time-annotated chips) and `coverageCheck` reproduces the
  Coverage Check sheet including Thursday's `OVER +1`. This is the proof the
  automation can be trusted with the real workflow.
- Each rule template: ≥1 violation case and ≥1 non-violation case, plus
  flexibility→severity mapping.
- Rotation cadence: every-other and every-3rd proposals across multi-week
  spans; linked effects (Vero's Fri OFF, Shana's alternating shapes, Paulina
  C-M's dropped weekday); anchor handling.
- Time-off semantics: paid/unpaid/partial classification,
  first-submitted-wins, makeup-owed tracking.
- Suggestions: pull order respected, unavailable staff skipped,
  no-new-hard-violations guarantee, and measured impact equals applied result
  (dispatch every generated suggestion — prototype lesson).
- Parser: real export rows in both datetime formats; malformed rows produce
  issues, not exceptions.
- UI: smoke-level (screens render from seeded state). Flows verified in the
  browser pane against the walkthrough below.

## 6. Acceptance walkthrough

1. First run lands on the Month Dashboard: four weeks seeded, Aug 2–8 built,
   decision queue shows the two REVIEW-state pending requests (Pearl 8/8,
   Rodriguez 8/7–8/9) with coverage impact.
2. Open the Aug 2 week: the grid matches the workbook's Proposed Schedule;
   coverage strip shows Thursday `OVER +1`, all else on target.
3. Paste a Paylocity export with a new request → preview classifies it →
   apply → the affected week's chips and coverage react.
4. Break coverage (set an RVT OFF on a dental day) → violation appears with
   severity from its flexibility rating → rail suggests repairs in pull
   order → one-click apply → coverage strip clears, impact matches the badge.
5. Advance to next week: rotation toggles arrive pre-proposed from cadence
   (Bree's Sunday flips, Vero's every-3rd cycle); confirm, adjust, publish →
   CSV + printable grid keyed by Paylocity names.

## Out of scope

DVM roster/names and synergy grids (requirements doc Phase 2), Paylocity /
Covetrus Pulse / WhenIWork integration (Phases 3–7), AI ingestion (seam only),
multi-user/auth/roles, notifications, mobile layout, solver/optimizer (the
epic's argument stands: rule-checked human authorship first).

## Ubiquitous language

**Roster** (the staff list), **Pattern** (a person's default week),
**Rotation** (a cadenced on/off day, e.g. every-other-Saturday), **Toggle**
(a rotation's state for one week), **Week Setup** (DVM counts + confirmed
toggles), **Time Off** (a Paylocity request: paid, unpaid, or partial),
**Makeup Shift** (owed when time off is unpaid), **Override** (a manual
person×day change: role, time, or OFF), **Proposed Schedule** (the built
week), **Coverage** (scheduled vs target per role per day), **Gap** (negative
variance), **Violation** (a broken rule instance, severity from flexibility),
**Pull Order** (the RVT→VA repair sequence), **Publish** (export for manual
Paylocity entry).
