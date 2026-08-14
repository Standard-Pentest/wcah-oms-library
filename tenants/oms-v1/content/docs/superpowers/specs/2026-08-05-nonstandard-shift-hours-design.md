# Non-standard shift hours on rotations

*2026-08-05. Product design for the corner case where an employee’s standing
rotation day is not the standard 10-hour shift (8:00 AM – 6:00 PM).*

## Goal

Let managers configure flexible per-day start, end, and paid hours on rotation
ROLE cells so weekly target-hours math and Week Board notation stay accurate —
without changing coverage (headcount) calculations, and without conflating
pattern deviations with one-off early leave.

## Context

Workbook / seed analysis showed most per-employee constraints are redundant
once standing weeks live in rotation cells. The remaining hours corner case
(5×8s, short mornings, odd windows) is common enough to need first-class
authoring in the rotation pane, not buried constraint rows.

Related: Track D early-leave ruling (`docs/decisions/2026-08-05-track-d-rulings.md`
§2) — one-off early leave is note-only and does **not** adjust hours. This
spec covers **standing pattern** deviations only.

The engine and board already carry `paidHours` and `timeNote` on assignments;
the Week Board already renders `timeNote` under the cell. This design makes
rotation editing the authoring source for those fields when the day is
non-standard.

## Locked decisions

| # | Decision |
|---|----------|
| 1 | Pattern deviations are configured **only** on rotation ROLE days (Team → rotation editor). |
| 2 | One-off early leave / same-week time tweaks on the Week Board remain **notes only** — no start/end/paid-hours controls, no change to `paidHours`. |
| 3 | Custom hours mode exposes three **independent** inputs: Start, End, Paid hours. Paid hours does **not** auto-update when times change (avoids lunch-break weeds). |
| 4 | **Paid hours** is authoritative for weekly target / scheduled-hours totals. |
| 5 | **Start / end** are for human display; the system builds `timeNote` from them for the Week Board. |
| 6 | Coverage is **headcount**: a coverage-role assignment still fills one slot regardless of paid hours. Hours never flip `countsTowardNeed`. |
| 7 | Standard day = custom hours off: no start/end shown; paid hours not shown in the editor; engine defaults the day to **10** paid hours and no time note from this feature. |
| 8 | No shift-template catalog — any start/end/paid combination the manager enters is allowed. |

## Pattern deviation vs one-off note

### Pattern deviation (this feature)

“This person *usually* works different hours on these rotation days.”

- Authored on Team → rotation editor, on a **ROLE** day only (not `OFF`, not blank/`ANY`).
- Persists on the rotation cycle; every matching sequence week generates
  assignments with the configured `paidHours` and `timeNote`.
- Examples: Theresa’s 5×8s, Michaela’s short Tech-NC morning, other recurring
  odd windows.

### One-off exception (existing ruling)

“Just this week they left early / came late.”

- Week Board shift note only.
- Does not open custom-hours controls, does not change `paidHours`, does not
  rewrite the rotation.
- Weekly target continues to use the rotation’s paid hours for that day.

## Data model

Rotation **ROLE** cell when custom hours is on:

| Field | Required when custom on? | Meaning |
|-------|--------------------------|---------|
| `startTime` | Y | User-entered start (`HH:MM` storage) |
| `endTime` | Y | User-entered end |
| `paidHours` | Y | User-entered paid hours for target math (not derived from clock span) |
| `timeNote` | Y (system-built) | Display string from start/end (e.g. `8:00 AM – 4:30 PM`) for the Week Board |

Presence of custom times / explicit non-default authoring is the deviation —
no separate boolean flag is required beyond “custom hours” UI state that maps
to whether these fields are set.

**Standard ROLE day:** omit `startTime` / `endTime` / feature-owned `timeNote`;
do not surface paid hours in the editor; engine treats missing `paidHours` as
**10**.

**Clearing custom hours** or switching the day to Any/`OFF` strips the custom
fields and restores the standard default.

**Untouched:** `countsTowardNeed` (role property), location on cell, week-board
note-only edits, PTO partial-day math (existing separate path).

### Workbook / seed round-trip

Existing cell grammar `CODE[@LOCATION][/HOURS][ (note)]` remains the Excel
representation of hours + display note. The app is the authoring source for
start/end; `/HOURS` and `(note)` continue to round-trip paid hours and board
text. Seed data that already encodes non-10h days (e.g. Theresa Fri 8h) stays
valid.

## UI

### Rotation editor (Team)

For each day whose kind is **ROLE**:

1. Control: **Custom hours** (off by default).
2. When on: show **Start**, **End**, and **Paid hours** side by side.
   - Defaults when first opened: **8:00 AM**, **6:00 PM**, **10** — all
     independently editable afterward.
3. Paid hours is visible **only** in custom-hours mode.
4. On save: persist start, end, paid hours; set `timeNote` from start/end for
   board display.
5. When off: strip custom fields; day is standard 10h with no feature-owned
   time note.
6. Changing the day to Any or OFF clears custom hours.

### Week Board

- Generated cells continue to show `timeNote` under the role label (existing
  rendering). No new board chrome required for this feature.
- Board “optional shift note” edits remain notes-only and must not mutate
  `paidHours`.

## Engine / data flow

```
Rotation ROLE cell (custom hours)
  → standing assignment: paidHours, timeNote (and role/location as today)
  → Week Board cell: show timeNote
  → weekly scheduled hours / target comparison: sum paidHours
  → coverage countByRoleDay: ignore paidHours; use countsTowardNeed + headcount
```

- Gap-fill / solver placements that are not rotation-driven remain standard
  **10** paid hours unless a later design says otherwise.
- Do not treat custom hours as a coverage debit or credit.

## Error handling / validation (minimal)

- Custom hours on ⇒ start, end, and paid hours required before save.
- `paidHours` must be a finite number **> 0**.
- End must be after start on the same calendar day (no overnight shifts in v1).
- Invalid input blocks save with an inline message; do not persist partial
  custom state.

## Testing

| Case | Expect |
|------|--------|
| Custom ROLE day with start/end/paid | Generated cell shows `timeNote`; employee weekly scheduled hours include that `paidHours` |
| Same assignment in a coverage role | Still counts as **one** filled slot for the day |
| Clear custom hours | Day reverts to 10h default; no feature `timeNote` |
| Week Board note-only edit | Does not change assignment `paidHours` |
| Seed non-10h standing day (e.g. Theresa) | Continues to produce correct `paidHours` through the cell rotation path |

Do not edit conformance fixtures to force a pass if engine output shifts —
re-sign divergences per project rules.

## Out of scope

- Shift template / named-pattern catalog
- Lunch / break deduction rules
- Overnight shifts
- Week-board editing of start/end/paid hours
- Changing hospital open hours or the conceptual “standard” window beyond the
  UI defaults (8:00 AM – 6:00 PM / 10h)
- Retiring the Employee_Constraints sheet (separate track; this feature does
  not depend on deleting constraints)

## Success criteria

- Manager can mark any rotation ROLE day as non-standard and enter arbitrary
  start, end, and paid hours.
- Week Board shows the configured times via `timeNote`.
- Weekly target math uses the entered paid hours.
- Coverage counts are unchanged by custom hours.
- One-off board notes still cannot alter hours.
