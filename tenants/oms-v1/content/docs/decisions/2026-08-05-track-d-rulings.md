# Track D rulings — 2026-08-05

Decisions from Tom closing the Aug 2 conformance open questions and clarifying
rotation semantics. Product surface: OMS Approach B / schema v3.

## 1. General-fill target-hours overage

**Ruling:** Maximum hours over weekly target during general-eligibility fill is a
**hospital constraint** (default value **10**), with an attached **weight** like
all other constraints.

Not an unbounded smallest-overage heuristic, and not a hard-coded constant buried
in generator logic. Seed / workbook expose
`GENERAL_FILL_MAX_OVERAGE_HOURS = 10` as a hospital-constraint row (not a
separate `systemConfig` catalog). Engine enforcement is a follow-on change
against this constraint.

## 2. Early leave

**Ruling:** The scheduling engine does **not** account for early leave as a
first-class flag or hours adjustment.

Capture early leave as a **note on the shift** (`timeNote` / label channel).
Do not add an `earlyLeave` field to the OMS document model.

## 3. Pacific Beach (formerly mislabeled Point Beach)

**Ruling:**

1. This is a **location**, not a role.
2. Correct name is **Pacific Beach**. Catalog code remains `PB`
   (`loc-pb`).

How the grid renders PB is no longer open — see §6: the board toggles between
location views, and cross-location assignments stay identifiable.

## 4. Rotation semantics

**Ruling:**

- Rotations are **optional**. An employee with no rotation rows is assumed
  flexible outside other configured constraints.
- When rotations exist, weeks are **sequential** (`sequence` 1..N). After N,
  the cycle resets to 1.
- The group is **anchored** to a Sunday week-start date so the algorithm knows
  which sequence week applies for any schedule week.
- Day cells: role code = assigned; `OFF` = unavailable; `ANY` / blank = no
  constraint (existing blank-cells ruling).
- "Optional" means the employee has no standing week either. Per §5, an
  employee *with* a standing week necessarily has a sequence-1 rotation.

## 5. Standing week vs rotation

**Ruling (Tom, 2026-08-05):** Option **B** — standing week is a sequence-1
rotation only. Do not duplicate as `FIXED_ASSIGNMENT`. Day cells may use `ANY`
(blank) for in-week flexibility. See `docs/oms-domain-model.md` §5.

## 6. Multi-location board (PB / LV)

**Ruling (Tom, 2026-08-05):** PB and LV are locations. The board toggles between
location views. Employees who work both must not be scheduled for two shifts on
the same day; other-location work must be identifiable to prevent double-booking.
See invariants I7–I8 in `docs/oms-domain-model.md`.

## 7. DVM count vs named team assignment

**Ruling (Tom, 2026-08-05):** Per-day **DVM count** is the permanent input for
schedule generation. Named DVMs and room-tech↔DVM team assignments come later,
as a step **after** the schedule is complete — they replace generic DVM slots
with specific names. See `docs/oms-domain-model.md` §3 / I9.

## 8. Permanent unavailable days via rotation OFF

**Ruling (Tom, 2026-08-05):** `unavailableDays` and `DAY_AVAILABILITY` are
removed. Permanent day-off is expressed only as rotation cell `OFF` (including
on sequence-1 standing weeks). See `docs/oms-domain-model.md` I11.

## 9. Role eligibility vs auto-assign (collapsed)

**Ruling (Tom, 2026-08-05):** Drop the separate `autoAssign` flag on role
eligibility.

- **Eligible** = the engine may place this employee in that role.
- A manager may place **anyone** in any role — that is her prerogative;
  software must not block manager overrides.
- There is no “eligible but solver must not touch” middle state. If the
  engine should not use someone for a role, leave them **not Eligible**;
  the manager can still assign them manually when needed.

## 10. Employee-scope constraints eliminated (implements §5)

**Ruling (Tom, 2026-08-05):** The seed emits **no employee-scope constraints**,
and the workbook has **no `Employee_Constraints` sheet**. Every fact those 179
rows carried has a first-class home:

| Was | Now |
| --- | --- |
| `FIXED_ASSIGNMENT` | the sequence-1 rotation cell (§5) |
| `LOCATION_ELIGIBILITY` + `blocksLv` | the cell's `@LOCATION` segment |
| `TARGET_HOURS` | `employee.targetHours` + one hospital weight row |
| `REST_PATTERN` (27 identical copies) | one hospital `REST_PATTERN` row, waived per person by `employee.consecutiveOffExempt` |
| `NOTE` | `employee.notes` |
| `DAY_AVAILABILITY` | rotation cell `OFF` (§8) |
| `FIXED_DAY_SET {exact: true}` | a rotation week with no blanks — every non-working day is `OFF` |
| `ROLE_ELIGIBILITY {allowed: false}` | absence from `employee.roleEligibilities` (§9) |

Employee scope stays in the document schema and in `CONSTRAINT_TYPE_CODES` as an
escape hatch for genuine one-offs. It is simply unused: a constraint that every
employee carries is a hospital rule, and a constraint that restates a rotation
is a second place for the truth to rot.

**Rotation cell grammar.** So the cell can carry what the constraint rows did,
it widens to `CODE[@LOCATION][/HOURS][ (note)]`, rendered and parsed by the same
module (`src/model/rotationCells.js`) so the workbook round-trips:

```
ROOM_TECH                    home location, 10h
SURGERY_TECH@PB              worked Pacific Beach that day, not Linda Vista
TECH_NC/5.5 (until 1:00 PM)  short shift with a time note
ROOM_TECH/8 (7:30–4:30)      a 5x8 day
OFF                          unavailable
(blank)                      ANY — no constraint that day
```

`countsTowardNeed` becomes a property of the **role**
(`counts_toward_need` on the Roles sheet), replacing the
`code !== 'ADMIN' && code !== 'TECH_NC'` test that was hardcoded in both
`mapRotations.js` and `buildSeed.js`.

**Consequence, signed:** counting needs per location is no longer optional once
`@PB` exists. Gardner Thu and Ross Tue used to be counted as Linda Vista bodies
on days they are in Pacific Beach. Fixing that removes both cells from the
conformance report's `inexpressible` bucket — they now project as the workbook's
`PB` — and opens one Thursday Linda Vista slot, which the engine backfills with
Chloe as `DENTAL_TECH`. See `HANDOFF.md` §5.

## Relation to HANDOFF

Supersedes HANDOFF §5 open questions 1–3 (2026-08-04 handoff). Rulings 1–7 are
recorded in `HANDOFF.md` §4 as decisions **10–16**, in order; ruling §9 is
decision **17**. Domain-model open items 1–3 and 5 closed 2026-08-05; item 4
(second conformance week) deferred until after seed workbook corrections.
Synthetic DVM question closed 2026-08-05 (count-based model). Home department
and unavailable-days fields dropped in schema v4 (ruling §8). `autoAssign`
collapsed into Eligible (ruling §9, 2026-08-05).

**Implementation status:** §10 is implemented — the seed emits no employee-scope
constraints and the workbook sheet is gone. The rest are recorded but not yet
enforced in code. `HANDOFF.md` §5 "Known doc↔code drift" tracks the two
remaining gaps (overage cap absent from `buildHospitalConstraints()`,
`System_Config` sheet still exported).
