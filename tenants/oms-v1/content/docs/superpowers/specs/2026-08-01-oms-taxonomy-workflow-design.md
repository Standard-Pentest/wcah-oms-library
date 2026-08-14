# OMS Taxonomy Remap and Workflow Design

*2026-08-01. Approach A for the functional mockup; Approach B deferred as the long-term model.*

## Goal

Transform the OMS mockup sample dataset and workflows away from the original
flat VA/RVT taxonomy toward department-owned staffing, while improving PTO
decision context, week navigation, rotation visualization, coverage fidelity,
day-level recommendations, and weekly hour minimization.

## Approach choice

**Ship Approach A now.** Keep the current normalized OMS collections
(`departments`, `roles`, `resourceNeeds`, `rotations`, `constraints`) and
remap seed/engine/UI around them.

**Defer Approach B.** Nest roles and default needs inside department objects
as the long-term database/schema shape once the mockup workflows stabilize.
See [Approach B implications](#approach-b-long-term) below.

## Locked assumptions

1. Employee **titles** remain CSR / VA / RVT / DVM. Rename/split applies to
   departments and assignment roles, not credentials.
2. **Room Techs** replaces Technician / Floor VA as the primary room-coverage
   department and role.
3. Aggregate Floor RVT demand splits into **Surgery** and **Dental**:
   - Weekday: 1 Surgery + 2 Dental
   - Weekend: 1 Surgery + 1 Dental
4. Default role requirements belong to the department. Enabling a department
   for a day activates those defaults for generation and coverage.
5. Clicking a pending/hold PTO item opens a **non-persisted** Week Board
   preview with that person marked off and coverage regenerated. Approve/Deny
   still commits via `DECIDE_PTO`.
6. Sample `pattern` + cadence `SEED_ROTATIONS` become cell-based rotation
   rows so Team can show a full week per row.
7. Avoid exceeding weekly target hours when filling gaps; if unavoidable,
   minimize each employee’s overage.
8. Legacy Excel-parity stack (`src/domain`, `parity-aug02`) remains untouched.

## Target taxonomy

| Department | Code | Primary roles | Default needs |
|------------|------|---------------|---------------|
| Room Techs | `ROOM` | Room Tech | Weekday `(2*DVM)+2`, weekend `(2*DVM)+1` |
| Surgery | `SURGERY` | Surgery Tech | Weekday 1, weekend 1 |
| Dental | `DENTAL` | Dental Tech, Dental Monitor | Weekday 2 (1 may be Monitor-capable), weekend 1 |
| Hospital Support | `HSS` | HSS | 1 (Sun gated by Bree rotation) |
| Pharmacy | `PHARM` | Pharmacy Tech | 1 weekdays |
| CSR / Front Desk | `CSR` | Front Desk / Phone CSR | None by default in seed |
| Admin | `ADMIN` | Admin (non-coverage) | None; does not count toward coverage |

### Seed mapping

| Source | Target |
|--------|--------|
| `pattern` role `VA` | Room Techs / Room Tech |
| `pattern` role `RVT` without dental lock | Surgery / Surgery Tech (also Room Tech–eligible for pull) |
| `pattern` role `MONITOR` / dental notes | Dental / Dental Monitor or Dental Tech |
| `pattern` role `HSS` / `PHARM` / `ADMIN` / `TECH_NC` | Matching department/role |
| Teagan “surgery or VA only” | Surgery + Room Techs eligibility; Dental forbidden |
| Chloe Mon VA / Fri MONITOR | Room Tech Mon + Dental Monitor Fri |
| Cadence rotations (`SEED_ROTATIONS`) + standing patterns | Multi-row cell rotations per employee |
| Pull order Angie→…→Teagan | Surgery/Dental → Room Tech pull when Room Techs short |

## Workflow surfaces

### Configuration (consolidated department detail)

One department master/detail:

1. Department metadata (name, description, active)
2. Roles owned by that department
3. Default Mon–Sat role requirements (quantity or DVM formula, weight)

The separate “Roles & needs” tab collapses into this department detail.
Global `resourceNeeds` remains the storage collection under Approach A;
UI presents them as department-owned defaults.

### Week Setup

- Toggle departments on/off per day with weights.
- Enabling a department activates that department’s default requirements for
  the day.
- Coverage preview matches the enabled department set.

Week-local quantity overrides remain optional: editing a need from Week Setup
may still write the shared default under Approach A. Approach B later
introduces true week-scoped overrides.

### Coverage summary

Grouped by **department → role → day**, including only departments enabled
in that day’s Week Setup. Status SHORT / OK / OVER uses the same need math
as generation.

### PTO decision in Week Board context

Selecting a pending/hold request:

1. Sets `selectedWeek` to the week containing the first affected day.
2. Sets non-persisted UI preview state
   (`ptoPreviewRequestId`, optional `previewOptionId`).
3. Navigates to Week Board.
4. Board renders `evaluatePendingPto(...).options[…].preview` (or an
   approve-preview run) instead of the baseline week.
5. Affected employee days show as PTO; coverage/gaps refresh.
6. Rail shows ranked accommodation options; Approve/Deny commits.

Closing preview clears preview state and restores the baseline board.

### Team rotations

- Seed populates cell-based rotation rows from sample patterns and cadence
  rotations.
- Each list row shows Sun–Sat chips: role name, OFF, or Any.
- Edit form remains the seven-day selector grid.
- Generator continues to execute cell rows; legacy cadence rows remain only
  where not yet converted.

### Week navigation

Shared controls on Week Board, Week Setup, PTO, and Hours:

- Date picker snaps any date to that week’s Sunday.
- **This week** jumps to the calendar week containing today (today injected
  from UI; domain stays pure).
- ← / → across known weeks.
- Jumping outside seed horizon creates a draft week with default dayPlans
  (Room Techs + Surgery + Dental enabled on weekdays; weekend defaults
  follow seed formulas).

### Day recommendations

For each day with gaps or hard violations, the Week Board rail lists ranked
actions:

1. Pull authorized Surgery/Dental staff into Room Techs (existing pull order).
2. Yield Admin to floor coverage.
3. Prefer under-hours employees before creating overages.
4. Ask for OT / fifth day only when still short.
5. When the gap is caused by a pending PTO preview, surface deny or
   accept-short options from PTO impact.

Recommendations are advisory in the mockup; Apply may dispatch overrides or
PTO decisions where already supported.

### Hours minimization rule

High-priority soft constraint (weight band ~80, soft unless authorized):

- Prefer candidates whose weekly scheduled hours remain ≤ `targetHours`.
- If every candidate would go over, choose the smallest resulting overage.
- Record soft violations when overage is required to close a gap.
- Do not invent unpaid overtime without an explicit OT recommendation path.

## Engine changes (Approach A)

1. Remap seed departments/roles/needs and dayPlans.
2. Expand active needs from enabled day departments × department defaults.
3. Remap standing assignments and preference fill to new role/department ids.
4. Convert rotations to cell rows where possible.
5. Add hours-aware candidate ranking in `fillGaps`.
6. Expose department-grouped coverage rows.
7. Add pure helpers: `weekStartForDate`, `activeNeedsForDay`,
   `recommendDayFixes`, `previewPtoWeek`.

## Testing focus

- Seed taxonomy: Room Techs / Surgery / Dental present; no aggregate Floor RVT need.
- Enabling/disabling a department changes coverage and gaps for that day.
- Coverage summary department grouping matches Week Setup.
- PTO click opens preview board with person marked off and regenerated coverage.
- Team rotation rows render full-week chips from seeded data.
- Date picker and This Week change `selectedWeek`.
- Fill prefers under-hours candidates; overages are minimized and flagged.
- Legacy `parity-aug02` remains green and untouched.

## Approach B (long-term)

Approach B nests structure so a department is the aggregate root:

```text
Department
  ├── roles[]
  ├── defaultNeeds[]          # Mon–Sat templates
  └── constraints[]
Week.dayPlans[day]
  ├── departmentsEnabled[]    # refs + weights
  └── needOverrides[]         # optional week-local deltas
Employee
  ├── title
  ├── authorizations[]
  ├── preferences[]
  └── rotations[]             # cell grids only
```

### Why B is better long-term

- Matches the workbook and future Postgres schema (department as parent).
- Eliminates the Configuration vs Roles & needs split by construction.
- Makes week-local overrides explicit instead of mutating global defaults.
- Simplifies “enable department → requirements flow” because needs are not
  a parallel global array requiring filters.
- Cleaner API/DB migrations once OR-Tools and persistence arrive.

### Implications of choosing B later

| Area | Impact |
|------|--------|
| Document shape | Breaking change to `buildSeedDocument` and IndexedDB schema version |
| Mutations | Department upsert/delete cascades roles/needs; week overrides become first-class |
| Configuration UI | Already converging under A; B mostly removes the dual collection |
| Week Setup | Must stop writing global `resourceNeeds`; write `needOverrides` instead |
| Generator | Read needs from department defaults + overrides instead of flat filter |
| Tests / fixtures | Full seed rewrite; snapshot updates across OMS tests |
| Approach A debt | Keep departmentId foreign keys stable (`dept-room-techs`, etc.) so B is mostly a nesting transform |

### Migration path A → B

1. Finish Approach A workflows and stabilize IDs/codes.
2. Introduce read adapters that present flat `resourceNeeds` as
   `department.defaultNeeds`.
3. Switch writers to nested form; keep a compatibility flattener for one
   schema version.
4. Add week-scoped `needOverrides`.
5. Drop the flat collection and bump OMS persistence schema.

Do **not** start Approach B until PTO preview, coverage grouping, rotation
seed conversion, and hours minimization are accepted in the mockup.

## Out of scope

- OR-Tools / production database
- Changing the Excel parity tripwire or legacy MVP shell
- Real AI capture beyond the existing panel stub
- Paylocity sync

## Success criteria

- Sample dataset reads as Room Techs / Surgery / Dental, not flat VA/RVT depts.
- Coverage summary and Week Setup describe the same department set.
- PTO decisions are evaluated on the Week Board with the person marked off.
- Team rotation rows show the full week.
- Users can jump to any week and return to This Week.
- Gaps show actionable recommendations; over-hours are minimized when filling.
