# OMS Seed Workbook + Domain Model Template Design

*2026-08-05. Track D artifacts: domain-model outline, decision rulings, and
Excel seed workbook populated from Approach B schema v4.*

## Goal

Give Tom editable, hybrid human/machine-readable artifacts to finalize the
logical model and correct clinic seed data—especially employees and
rotations—without requiring code changes for every data edit.

## Locked decisions (Tom, 2026-08-05)

| # | Topic | Ruling |
|---|--------|--------|
| 1 | Target-hours overage on general fill | **Hospital constraint with a weight**, default **10 hours**. Not hard-coded engine policy. *Revised the evening of 2026-08-05 — originally recorded as system configuration; `SystemConfig` is struck from the model.* |
| 2 | Early leave | Engine does **not** model early leave. Capture as a **shift note** (`timeNote` / label channel). |
| 3 | Point Beach | **Location**, not a role. Correct name: **Pacific Beach** (code remains `PB`). |
| 4 | Standing week | A **sequence-1 rotation**, not a duplicate `FIXED_ASSIGNMENT` set (ruling 5). |
| 5 | DVM staffing | Per-day **count** is the generation input; named DVMs are a post-schedule step (ruling 7). |

Full record: `docs/decisions/2026-08-05-track-d-rulings.md` (rulings 1–7).

## Rotation semantics (Tom, 2026-08-05)

- Rotations are **optional**. No rotation rows ⇒ employee is flexible outside
  other constraints (eligibilities, day availability, etc.).
- When present, rotation weeks form an ordered cyclic sequence: after the last
  week, sequence wraps to 1.
- The whole group shares one **anchor week** (Sunday `YYYY-MM-DD`) so the
  engine can compute which sequence week applies:
  `selectedIndex = weeksBetween(anchor, weekStart) % sequenceCount`.
- Day cell values: role **code** (assigned), `OFF` (unavailable), or
  `ANY` / **blank** (no constraint that day — blank-cells ruling).

## Artifacts

| Artifact | Path |
|----------|------|
| Domain model + ERD outline (Tom completes) | `docs/oms-domain-model.md` |
| Decision record | `docs/decisions/2026-08-05-track-d-rulings.md` |
| Populated seed workbook | `docs/seed/WCAH_OMS_Seed_Workbook.xlsx` |
| Export script (regenerate from live seed) | `scripts/export-oms-seed-workbook.mjs` |

Import of the corrected workbook back into `src/seed` / `src/data` is a
**follow-on** after Tom returns the file. This pass only exports.

## Workbook principles

1. **Hybrid readability** — every entity has an integer `*_key` for FK joins
   and human-readable names/codes on the same row.
2. **Stable string ids retained** — existing OMS ids (`alonzo-evelyn`,
   `role-room-tech`) stay in columns so round-trip import can map without
   inventing new runtime ids.
3. **Employees first** — one row per employee; one column group per role
   eligibility (`Eligible` / `Rank` / `Auto Assign`).
4. **Rotations employee-centric** — one row per employee per sequence week;
   name + `employee_key` on every row.

## Sheet layout

### `README`

How to edit; cell vocabulary; which sheets Tom must correct first
(Employees, Employee_Rotations).

### ~~`System_Config`~~ (superseded)

The shipped export still writes this sheet
(`scripts/export-oms-seed-workbook.mjs:161`), but the concept was struck the
evening of 2026-08-05: the overage cap is a **hospital constraint row with a
weight**, not a config entry.

| config_key | value | notes |
|------------|-------|-------|
| `GENERAL_FILL_MAX_OVERAGE_HOURS` | `10` | Cap on general-eligibility fill over target — belongs in `Hospital_Constraints` |

Retiring the sheet and moving the row is follow-on work, sequenced after Tom
returns the corrected workbook so the edits don't collide. Do **not** regenerate
the workbook in the meantime — it would clobber in-progress corrections.

### `Locations`

`location_key`, `location_id`, `code`, `name` — Pacific Beach, not Point Beach.

### `Titles`

`title_key`, `title_id`, `code`, `name`, `rank`

### `Departments`

`department_key`, `department_id`, `code`, `name`, `active`, `description`

### `Roles`

`role_key`, `role_id`, `department_key`, `department_code`, `code`, `name`, `min_title_code`

### `Default_Needs`

Department Mon–Sat need templates (quantity / formula).

### `Employees` (priority)

| Columns | Notes |
|---------|--------|
| `employee_key` | Integer PK for workbook FKs |
| `employee_id` | Stable OMS string id |
| `display_name` | Human name (`Last, First`) |
| `paylocity_name` | External identity |
| `title_code`, `target_hours`, `home_location_code` | Core attrs; no home department — ranked role eligibility carries preference |
| `consecutive_off_exempt`, `notes` | Notes; permanent offs live in Employee_Rotations as `OFF` |
| Per role: `{CODE} Eligible`, `{CODE} Rank` | Y/blank, rank int; Eligible ⇒ engine may place; manager may override anyone |

Synthetic DVMs are excluded from this sheet (runtime placeholders only).

### `Employee_Rotations` (priority)

| Columns | Notes |
|---------|--------|
| `employee_key`, `display_name`, `employee_id` | Hybrid join |
| `anchor_week` | Sunday date for the cycle |
| `sequence` | 1-based week in cycle |
| `Sun`…`Sat` | Role code / `OFF` / blank |

Omit employees with no meaningful rotation cells (fully flexible).
Include standing weekly pattern as `sequence = 1` when cells are non-empty.

### `Employee_Constraints`

Normalized machine-oriented bag (`type_code`, `parameters_json`) for review;
Tom may leave alone on first pass.

### `Hospital_Constraints`

Global rules. This is where `GENERAL_FILL_MAX_OVERAGE_HOURS` (with its weight)
belongs per the revised ruling 1 — it is not there yet.

### `Week_Setup` / `Time_Off`

Session seed weeks and sample PTO for completeness; lower edit priority.

## Domain model template

`docs/oms-domain-model.md` is an outline Tom fills in:

- Ubiquitous language
- Aggregate roots and owned children
- Cardinalities / invariants
- Constraint type catalog
- Rotation / Week Setup / need-override rules
- Mermaid ERD skeleton
- Open fields for SP5 physical mapping notes

It does **not** invent Postgres DDL (Track O / SP5).

## Out of scope this pass

- Import script / seed rewrite from corrected workbook
- Engine enforcement of the 10h overage constraint (record decision; implement later)
- Retiring the `System_Config` sheet and dropping the duplicate standing-week
  `FIXED_ASSIGNMENT` rows (rulings 1 and 5; tracked in `HANDOFF.md` §5 drift table)
- Dental role rename (`Dental_1-3` / `Dental_4-5`)
- Second conformance week fixture
- UI chrome follow-ons

## Success criteria

- Spec + domain outline + decision doc exist under `docs/`
- `docs/seed/WCAH_OMS_Seed_Workbook.xlsx` opens with populated Employees and
  Employee_Rotations sheets matching live seed
- Location catalog shows **Pacific Beach**
- Overage default of 10 is present and discoverable (shipped in `System_Config`;
  target home is `Hospital_Constraints` per the revised ruling 1)
- Export script regenerates the workbook from `buildSeedDocument()`
