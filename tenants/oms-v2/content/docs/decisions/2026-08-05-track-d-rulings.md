# Track D rulings — 2026-08-05

Decisions from Tom closing the Aug 2 conformance open questions and clarifying
rotation semantics. Originally written against the `../oms` mockup product
surface (Approach B / nested document). The **rulings themselves** produced
invariants I1–I15 and remain binding for the domain model.

## oms-new applicability

On conflict: `AGENTS.md` > `CLAUDE.md` > this file > `HANDOFF.md`. Where this
file's surface language disagrees with the foundation-slice decisions D1–D22,
the foundation-slice spec and `CLAUDE.md` win. Do not reintroduce mockup
mechanics rejected for `oms-new`.

| Phrasing in the rulings below | oms-new reading |
|---|---|
| OMS document model / Approach B schema / schema v3–v4 | Relational Track D tables in PostgreSQL; **no** JSONB document envelope (D9). |
| Catalog code `PB` / `loc-pb` | Canonical code `location_pb` (D10). Display remains Pacific Beach via `name` / `short_label`. |
| Sunday week-start / Sunday rotation anchor | Week start is data: `organization.week_start_day_id` (D18). Anchors and display order are validated/computed against that column. WCAH may still *seed* Sunday; Sunday is not a software constant. |
| `src/model/rotationCells.js`, camelCase fields (`timeNote`, `targetHours`, `consecutiveOffExempt`, `roleEligibilities`, …) | `scheduling.rotation_cell` and related columns (`time_note`, `paid_hours`, …); `employee_profile.target_hours`, `consecutive_off_exempt`; `role_eligibility` rows. Parser lives with the converter / backend, not the mockup module. |
| Employee-scope escape hatch kept in the document schema | Foundation slice: `scheduling.employee_constraint` is **out of scope** and must not appear as required seed (I13, spec §3). Do not emit employee-scope constraint rows. |
| `GENERAL_FILL_MAX_OVERAGE_HOURS = 10` as seed | Remains a **hospital_constraint** row (domain data), never a generator constant. Engine enforcement is a later sub-project. |
| "Implementation status" / references to mockup `HANDOFF.md` §4–§5 | Historical notes about the `../oms` mockup. For oms-new status use this repository's `HANDOFF.md`. |

Authoritative oms-new sources for how these rulings land in schema and code:
`docs/superpowers/specs/2026-08-11-oms-new-foundation-slice-design.md`,
`docs/oms-domain-model.md`, and `CLAUDE.md`.

---

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

Capture early leave as a **note on the shift** (`time_note` / label channel on
`rotation_cell` or the eventual assignment). Do not add an `early_leave` field
to the schema.

## 3. Pacific Beach (formerly mislabeled Point Beach)

**Ruling:**

1. This is a **location**, not a role.
2. Correct name is **Pacific Beach**. In oms-new the canonical code is
   `location_pb` (D10); the workbook source token remains `PB`.

How the grid renders PB is no longer open — see §6: the board toggles between
location views, and cross-location assignments stay identifiable.
(Board UI is a later sub-project; the location model applies now.)

## 4. Rotation semantics

**Ruling:**

- Rotations are **optional**. An employee with no rotation rows is assumed
  flexible outside other configured constraints.
- When rotations exist, weeks are **sequential** (`sequence` 1..N). After N,
  the cycle resets to 1.
- The group is **anchored** to a date that falls on the organization's
  configured week-start day (`organization.week_start_day_id`, D18) so the
  algorithm knows which sequence week applies for any schedule week.
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

**Ruling (Tom, 2026-08-05):** `unavailable_days` / `DAY_AVAILABILITY` are
removed. Permanent day-off is expressed only as rotation cell `OFF` (including
on sequence-1 standing weeks). See `docs/oms-domain-model.md` I11.

## 9. Role eligibility vs auto-assign (collapsed)

**Ruling (Tom, 2026-08-05):** Drop the separate `auto_assign` flag on role
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
| `TARGET_HOURS` | `employee_profile.target_hours` + one hospital weight row |
| `REST_PATTERN` (27 identical copies) | one hospital `REST_PATTERN` row, waived per person by `employee_profile.consecutive_off_exempt` |
| `NOTE` | `employee_profile.notes` |
| `DAY_AVAILABILITY` | rotation cell `OFF` (§8) |
| `FIXED_DAY_SET {exact: true}` | a rotation week with no blanks — every non-working day is `OFF` |
| `ROLE_ELIGIBILITY {allowed: false}` | absence from `role_eligibility` (§9) |

In oms-new, do not reintroduce employee-scope constraint rows. The foundation
slice leaves `scheduling.employee_constraint` out of scope; a constraint every
employee shares is a hospital rule, and a constraint that restates a rotation is
a second place for the truth to rot (I13).

**Rotation cell grammar.** So the cell can carry what the constraint rows did,
it widens to `CODE[@LOCATION][/HOURS][ (note)]`, parsed into
`scheduling.rotation_cell` columns:

```
ROOM_TECH                    home location, paid hours from shift pattern (D17)
SURGERY_TECH@PB              worked Pacific Beach that day, not Linda Vista
TECH_NC/5.5 (until 1:00 PM)  short shift with a time note
ROOM_TECH/8 (7:30–4:30)      a 5x8 day
OFF                          unavailable
(blank)                      ANY — no constraint that day (no row emitted; F8)
```

`counts_toward_need` is a column on `role`, replacing any hardcoded role-code
test in application source.

**Consequence (mockup-era note):** counting needs per location is required once
`@PB` exists — otherwise PB-worked days are miscounted against Linda Vista.

## Relation to other documents

These rulings closed open questions in the `../oms` mockup handoff and seeded
`docs/oms-domain-model.md` invariants I1–I15. That mockup handoff is not this
repository's `HANDOFF.md`.

In oms-new, treat this file as the decision record behind those invariants;
treat the foundation-slice spec as the authoritative landing of the same
rulings onto the relational schema and first vertical slice.
