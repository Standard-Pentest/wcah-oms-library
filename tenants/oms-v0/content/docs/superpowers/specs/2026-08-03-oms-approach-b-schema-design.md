# OMS Approach B Schema Design

*2026-08-03. Full nested document shape; Excel seed workbook is a follow-on.*

## Goal

Commit the OMS mockup to the long-term nested schema (Approach B): department
and employee as aggregate roots, week-local need overrides, hospital-level
constraints. Rewrite seed to emit the new shape. Defer Excel seed workbook and
downstream UX (Propose Schedule, day view, PTO inbox, weight toggle) until
after this schema lands and can be tested against transformed seed.

## Locked decisions

| Decision | Choice |
|----------|--------|
| Nesting depth | Full Approach B: departments **and** employees nest their owned children |
| Constraints | Nest under department / employee; keep `hospitalConstraints[]` for GLOBAL rules |
| Local IndexedDB on bump | Schema `2 → 3`; mismatch → seed + existing banner (no A→B migrator) |
| Code cutover | Big bang nested store + thin pure selectors (no long-lived flattener) |
| Seed | May be rewritten / restructured; stable department IDs/codes retained |
| Department authorizations | **Eliminated** — role eligibility implies department authorization |
| Dental role rename (`Dental_1-3` / `Dental_4-5`) | Out of scope here — lands with Excel seed round |
| Excel workbook | Follow-on **after** Approach B ships |
| Legacy Excel parity (`src/domain`, `parity-aug02`) | Untouched |

## Document shape (schema v3)

```text
HospitalDocument
  version: 3
  location / locations / titles / shiftPatterns   # catalogs
  hospitalConstraints[]                          # former GLOBAL constraints
  departments[]
    ├── id, code, name, description, active
    ├── roles[]
    ├── defaultNeeds[]                           # Mon–Sat templates
    └── constraints[]                            # DEPARTMENT-scoped
  employees[]
    ├── id, displayName, targetHours, active, …
    ├── titles[]                                 # was employeeTitles
    ├── roleEligibilities[]                      # eligibility + preference metadata; implies dept auth
    ├── locationEligibilities[]
    ├── constraints[]                            # EMPLOYEE-scoped
    └── rotations[]                              # cell grids only
  identityMaps[]                                 # stays top-level (cross-cutting)
  timeOffRequests[]
  scheduleWeeks[weekStart]
    dayPlans[day]
      ├── dvmCount
      ├── departmentsEnabled[]                   # { departmentId, weight }
      └── needOverrides[]                        # week-local; never mutate defaults
  weekOrder, dvmDays, scheduleRuns, ui, meta
```

### Removed top-level collections

`roles`, `resourceNeeds`, `constraints`, `departmentAuths`, `roleEligibilities`,
`locationEligibilities`, `employeeTitles`, `rotations`, and any flat
`preferences` array.

### Department authorization eliminated

Roles belong to a department. An employee with a `roleEligibilities` entry for
a role is therefore authorized for that role’s department. There is **no**
separate `authorizations` / `departmentAuths` collection on the employee or
document.

- Engine hard-gate: candidate is eligible if they have a role eligibility for
  the need’s `roleId` (and `autoAssign !== false` for auto-fill), plus location
  eligibility and other existing filters.
- “Authorized for department X” in UI/reports = “has ≥1 role eligibility whose
  role’s `departmentId` is X” (selector helper, not stored data).
- Team screen: **checkbox group for role eligibilities** (not a separate
  department-auth group). Checking a role adds a `roleEligibilities` row
  (defaults: `autoAssign: true`, next rank, default weight). Unchecking removes
  it. Advanced fields (rank / weight / burnout / autoAssign) remain editable
  per checked role. Department coverage is inferred from checked roles.

### Field notes

- **Role** keeps `id`, `code`, `name`, `departmentId` (redundant with parent but
  useful for selectors and Excel export); parent department is source of truth.
- **defaultNeed** keeps `id`, `dayOfWeek`, `roleId`, `quantity` and/or
  `formula`, `weight`, `departmentId`.
- **needOverride** on a day plan: `{ roleId, quantity?, formula?, weight?,
  cleared?: boolean }`. `cleared: true` means “no need for this role this day”
  even if a default exists. Absent override → use department default for that
  weekday.
- **departmentsEnabled** replaces today’s `dayPlans[day].departments` naming;
  migrate seed/UI to the clearer name in this pass.
- **Rotations** are cell grids only under the employee; no parallel cadence
  collection at document root.
- **identityMaps** remain top-level (Paylocity / external ids span employees).

## Selectors

Pure helpers in a dedicated module (e.g. `src/model/omsSelectors.js`):

| Helper | Returns |
|--------|---------|
| `allRoles(doc)` | Flat role list across departments |
| `allDefaultNeeds(doc)` | Flat default needs |
| `allConstraints(doc)` | Hospital + department + employee constraints |
| `allRotations(doc)` | Flat rotations with `employeeId` |
| `findRole(doc, id)` / `findDepartment(doc, id)` / `findEmployee(doc, id)` | Lookup |
| `employeeDepartmentIds(doc, employeeId)` | Derived set of dept ids from that employee’s role eligibilities |
| `activeNeedsForDay(doc, week, day)` | Defaults for enabled depts ∩ weekday, then overrides |
| `activeNeedsForWeek(doc, week)` | Map/union of per-day active needs |

Engine and UI **must** use these selectors (or equivalently nest-aware APIs).
No ad-hoc `doc.roles` / `doc.resourceNeeds` reads after the cutover.

## Mutations

- Department upsert/delete cascades nested `roles`, `defaultNeeds`, `constraints`.
  Deleting a department removes it from all `departmentsEnabled` entries and
  drops overrides that only referenced its roles.
- Employee upsert/delete cascades nested titles, role eligibilities, location
  eligibilities, preferences, constraints, rotations. Stale employee ids left
  in constraint pull-order parameter lists are ignored via filter-on-read
  (no rewrite pass).
- No `UPSERT_DEPARTMENT_AUTH` / `REMOVE_DEPARTMENT_AUTH` actions.
- Constraint CRUD carries `owner: 'hospital' | 'department' | 'employee'` plus
  owning ids; writes into the correct bag.
- Role / defaultNeed CRUD writes inside the parent department only.
- Week Setup quantity/formula edits dispatch `UPSERT_NEED_OVERRIDE` /
  `CLEAR_NEED_OVERRIDE` against `dayPlans[day].needOverrides` — **never**
  `UPSERT` into `department.defaultNeeds`.
- Configuration screen remains the only UI that edits department defaults.

## Engine

- Replace `activeNeedsForWeek` flat `doc.resourceNeeds` filter with nested
  defaults + `departmentsEnabled` + `needOverrides`.
- Generation, coverage, PTO impact, and day recommendations consume selectors.
- Candidate eligibility uses nested `employee.roleEligibilities` /
  `locationEligibilities` / `rotations`. Department membership is derived from
  role → department; do not reintroduce a parallel auth check.
- Heuristic `generateWeek` stays; this pass does **not** introduce OR-Tools or
  a new solver architecture.
- Prefer under-hours fill and existing recommendation helpers remain behaviorally
  equivalent unless a test proves a nesting bug.

## Persistence

- `omsPersistence` schema constant: `2 → 3`.
- Deserialize mismatch → `version-mismatch` (existing banner / run from seed).
- No automatic v2→v3 transform of saved local edits.
- Document `version` field inside seed also set to `3`.

## Seed rewrite

- `buildSeedDocument()` emits nested v3 directly.
- Keep stable department ids/codes: `dept-room-techs` / `ROOM`, `dept-surgery` /
  `SURGERY`, `dept-dental` / `DENTAL`, etc.
- Keep current Dental role codes (`DENTAL_TECH`, `DENTAL_MONITOR`) until the
  Excel seed round renames to `Dental_1-3` / `Dental_4-5`.
- Restructure employee nesting from today’s join tables; content may be
  simplified where join noise existed — correctness over lossless flat→nest
  trivia.
- Session weeks, PTO sample rows, and dayPlans must still exercise Room Techs /
  Surgery / Dental enablement and override paths (include at least one
  `needOverrides` example in seed or tests).

## UI impact (this pass only)

Minimal chrome changes required for schema correctness:

- Configuration: read/write nested department roles/needs/constraints; hospital
  constraints on the Constraints surface.
- Team: read/write nested role eligibilities, location eligibilities, rotations,
  constraints; no separate department-auth editor.
- Week Setup: enable departments; edit needs as **overrides** for the selected
  week/day; show that defaults come from Configuration.
- Board / PTO / Hours: swap flat reads for selectors; no new UX features.

## Testing focus

- Seed emits `version: 3` and nested departments/employees; top-level removed
  collections are absent — including no `departmentAuths` / `authorizations`.
- Selectors flatten correctly; `allConstraints` includes hospital + dept + employee.
- `employeeDepartmentIds` matches departments implied by role eligibilities.
- Enabling/disabling a department changes active needs for that day.
- Week Setup override changes that week’s active need without mutating
  `department.defaultNeeds`.
- `cleared: true` override suppresses a default need for that day.
- Department/employee delete cascades nested children.
- Persistence rejects schema v2 with `version-mismatch`.
- Existing OMS behavior tests updated to nested shape; `parity-aug02` stays green
  and untouched.

## Follow-on (explicitly out of scope)

After Approach B is merged and green:

1. **Excel seed workbook** — sheets for departments/roles/needs, employees
   (titles, auths, rotations, constraints), hospital constraints, week dayPlans;
   populate from nested seed with assumptions; Tom corrects; re-import updates
   seed. Include Dental role rename then.
2. Configurable constraint weights + hide/show toggle in UI.
3. Explicit Propose Schedule control on Week Board.
4. Day view (department-centric cells, best-fit roster picker).
5. Coverage tile title summary + non-DVM headcount; calendar dates on columns.
6. Week Setup any-week navigate + copy-from-previous (beyond today’s
   `ensureWeek` clone).
7. PTO single inbox with status tabs; implications moved into details pane.

## Success criteria

- OMS document is nested Approach B; schema v3.
- Week Setup cannot silently mutate global/department defaults.
- Engine coverage/generation use nested defaults + overrides.
- Seed boots the mockup without flat collections.
- Excel workbook work can start from a stable nested schema.

## Relationship to prior specs

Supersedes the “Defer Approach B” section of
`2026-08-01-oms-taxonomy-workflow-design.md` for document shape and Week Setup
override behavior. Approach A taxonomy (Room Techs / Surgery / Dental) and
workflow intent remain; storage shape changes underneath them.
