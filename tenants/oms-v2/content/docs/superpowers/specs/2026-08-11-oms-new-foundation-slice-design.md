# OMS-New Foundation Slice — Design

*2026-08-11. The first sub-project of `oms-new`: a database-driven rebuild of the
OMS scheduling module on Python FastAPI, PostgreSQL, and React.*

**Status:** APPROVED — ready for implementation planning
**Decision owner:** Tom
**Authoritative model source:** `docs/superpowers/specs/2026-08-07-oms-modular-database-schema-design.md`
(schema v2) and `docs/oms-domain-model.md`, both carried over from `oms/docs`
**Background intent:** PRD v0.7.6 (`content7.js`) — requirements language and
long-term direction, not a schema specification
**Relationship to `oms/`:** `oms/` is retained as a working reference mockup. No
code is carried across. It is not modified by this work.

---

## 1. Context

`oms/` is a React 18 + Vite + Tailwind v4 mockup of a veterinary hospital shift
scheduler. Its entire state is one nested JSON document held in memory and cached
in IndexedDB. A small FastAPI backend exists, but its schema is two tables that
store that whole document as a single JSONB blob guarded by a revision counter —
there is no relational domain model. Real clinic data is compiled into source:
`src/data/roster.js` holds 37 hand-transcribed employees, `src/seed/fromWorkbook.js`
is a 4,913-line generated literal, and `src/ui/oms/OmsScreens.jsx:14-29` maps role
codes to display labels in a component.

`oms-new` is a ground-up rebuild with one governing rule: **no domain data resides
outside the database.** Departments, roles, people, constraints, and every value
they carry live in PostgreSQL and reach the browser over HTTP. Nothing is written
in a source file.

This document specifies the first sub-project only. Section 13 lists the rest.

---

## 2. Decisions of record

Each decision below was made deliberately during design. They are recorded so that
later work does not relitigate them without new information.

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | **Track D / modular schema v2 is authoritative** for the data model. PRD v0.7.6 is background intent. | Track D is newer (5–9 Aug vs 31 Jul), is validated against the real V5 seed data, and its rulings are grounded in operational analysis. Where the two disagree — tier as a table, `employee_department_auth`, home department, employee-scope constraints — Track D wins. |
| D2 | **The first sub-project is a thin vertical slice**, widened to cover both Configuration and Team. | Proves schema, API, frontend, and the no-hardcoded-data rule end to end on day one, and produces the screens through which converted data gets corrected. |
| D3 | **Tenancy seam, not tenant routing.** An `organization` table and `organization_id` on every local table from migration 1; always WCAH; no org in URLs, no tenant auth scoping, no org switching. | Retrofitting a tenant key across a live constraint set is the most expensive change on the open list (PRD A29). Adding the column costs almost nothing; building routing for one tenant costs real work for no return. |
| D4 | **The V5 workbook is a frozen historical artifact.** Converted once into a committed SQL fixture; the `.xlsx` is never read again by any tool or test. | Removes Excel from the runtime and CI dependency graph, and makes seeding deterministic. |
| D5 | **Flagged data quality issues are converted on documented best interpretation**, then corrected in the application. | The workbook flags 19 of 37 employees. Blocking the build on a data cleanup pass would stall the project; the config screens exist precisely so corrections have a home. |
| D6 | **The `oms/docs` corpus is copied into `oms-new/docs`** with a README index marking current, superseded, and mockup-only documents. Nothing is deleted. | The project is self-contained; the drift in the corpus is real and must be signposted rather than silently inherited. |
| D7 | **Hybrid reading of the no-hardcoded-data rule.** All domain values and enums come from the API. Display properties of domain things — short label, sort order — are columns on the domain tables. Static UI chrome stays in components. | A fully metadata-driven UI roughly doubles the build and makes every screen harder to debug, for a benefit (new fields with zero code change) that is not yet needed. Putting `short_label` on `role` gets most of the value at almost no cost. |
| D8 | **Resource-oriented REST, plus one cached `GET /api/reference` bootstrap.** | Narrow writes, independent testability, and OpenAPI-generated clients. The single reference call removes any excuse for a lookup map in a component, which is the failure mode the rule exists to prevent. |
| D9 | **No JSONB document envelope.** `platform.schedule_document` and its history table do not carry over. `oms-new` is relational from the first migration. | That design existed to hold the mockup's nested JSON document. There is no such document here. |
| D10 | **Canonical identifiers are namespaced by kind** at conversion time — `department_csr`, `role_csr`, `title_csr` — while human-readable labels are preserved for display. | Source vocabulary collides: CSR, VA, and RVT each name both a title and a role or department. Adopting source terms verbatim as identifiers makes that collision permanent and makes the static scan unenforceable for exactly the terms that most need it. Namespacing dissolves the problem at the boundary instead of building machinery around it. |
| D11 | **TypeScript on the frontend from day one.** | Starting fresh makes the migration free, and it is what makes the OpenAPI-generated client enforce anything: a renamed column becomes a build failure rather than `undefined` on screen. |
| D12 | **`snake_case` on the wire.** Database, Python, and JSON agree; there is no mapping layer to get wrong. | |
| D13 | **UUID primary keys with `(organization_id, code)` as the natural unique key.** UUIDs are UUIDv5, derived deterministically from the canonical code. | Text seed ids make the code the identity, so renaming a department code would cascade through foreign keys — exactly the per-deployment change that must stay cheap. Deterministic UUIDs keep the fixture diffable and let tests name a row without guessing. |
| D14 | **Department ordering (`PULL_ORDER`) is out of scope**, and `scheduling.department_constraint` is deferred with it. | Ruled by Tom: ordering gets its own design scheme later. Shipping an empty table that nothing reads adds no value. |
| D15 | **`default_need` is converted for display**, shaped by the rulings in the coverage-needs memo. | The data is real and is the most valuable content in the workbook after the roster. The model questions around it — location scoping, conditions, weight-on-need, and how "none" is encoded — were raised during design and answered by Tom the same day; see D22 and `docs/open-items/2026-08-11-coverage-needs-model.md`. |
| D16 | **No formula or driver model.** `default_need.formula` is dropped. A need is a number a person enters. | One formula existed in the entire workbook (`2 * DVMs`). A formula language is a public surface the moment anyone can type into it, and building one for a single instance is premature. Ruled by Tom 2026-08-11. |
| D17 | **No shift-hour constant anywhere.** Paid hours resolve through a chain that terminates in data: `rotation_cell.paid_hours`, else the employee's `default_shift_pattern_id`, which is non-nullable. | WCAH's 10-hour shift is a row in `shift_pattern`, not a property of the software. A hospital on 8-hour shifts seeds a different row and changes nothing else. Schema v2's phrasing — "default 10 when omitted" — would have put the number in code. |
| D18 | **The week start day is configurable.** `organization.week_start_day_id` references `core.day_of_week`; `day_of_week` carries a stable `iso_index` and display order is computed relative to the organization's start day. Rotation anchors and week starts are validated against that column. | Schema v2 fixes Sunday in prose throughout — "week anchors are Sunday dates". A hospital anchoring on Monday would otherwise require a code change, and Sunday would be a literal in both the backend and every calendar view. |
| D19 | **Ambiguous dental tech assignments resolve to the junior role.** | Both dental roles require RVT, so the title ceiling cannot discriminate between them. Under-granting is the safer default: correcting upward in the UI is a deliberate act, correcting downward requires noticing. Ruled by Tom 2026-08-11. |
| D20 | **`constraint` stays the internal and engine vocabulary; the UI says "Policies".** | What is stored at hospital scope is genuinely organizational policy, but one word covers three sibling tables of identical shape fed by one `constraint_type` registry, and it accurately names what the engine does with each record. An employee-scope record is an accommodation rather than a policy, so renaming would trade one imprecision for another. Under D7 the display term is a label, not a schema decision. |
| D21 | **The seed data is a slice, not a complete dataset.** It exists to drive the design conversation; the dataset is completed through the application once the software is functional. | Stated by Tom as a project-wide assumption 2026-08-11. A missing row is a row nobody has entered yet, not a fact to reverse-engineer. It also prioritizes the editing sub-project, which is what makes the assumption true. |
| D22 | **`default_need` admits no unevaluable state.** `location_id`, `quantity`, and `weight` are all not-null; `quantity` must be greater than zero; `formula` and `condition` do not exist. Removing a need means deleting the row. | Every nullable column in schema v2's version encoded an ambiguity that Tom's rulings dissolved: absent means no need (Q2), all coverage is location-scoped and Linda Vista is an R&D focus rather than a fact (Q1), weight is real business criticality (Q3), and conditional needs are not a requirement (Q5). A column that can only ever mean "unknown" is a permanent affordance for ambiguity. |
| D23 | **Weight is a 0–100 scale split at 50: 0–50 is soft policy, 51–100 is hard policy. Anything unweighted is stored as 40.** All four weight columns — `default_need`, `hospital_constraint`, `role_eligibility`, `rotation_cell` — are not-null, bounded by a check constraint, and default to 40 in the database. | Added by Tom 2026-08-12, completing the 0–100 weighting model that `AGENTS.md` §2 mandates and supplying the threshold `docs/oms-domain-model.md` already implied by defining a Violation as a breach "soft/hard by weight". The default is stored rather than resolved on read so the values can drive tie-breaking later: a value substituted at read time cannot be sorted, compared, or tuned per row. Storing it also extends D22's reasoning to the remaining weight columns and keeps `weight` uniformly `int` on the wire. The engine that acts on the soft/hard split is a later sub-project (§13); this slice records the model without branching on it. |

---

## 3. Scope

### In scope

- The 18 `core` and `scheduling` tables listed in §5, with Alembic migrations.
- An `organization` table and `organization_id` on every local table.
- A one-time converter turning `WCAH_OMS_Seed_Workbook-V5.xlsx` into a committed
  SQL fixture, with a documented canonical-code map and documented conversion
  assumptions.
- A read-only FastAPI surface, including `GET /api/reference`.
- A React + TypeScript app with two screens, Configuration and Team.
- A static scan that fails the build on any hardcoded canonical code or name.
- Tests on both sides, Docker Compose for local development, and CI.
- The `oms/docs` corpus copied in with a README index.

### Out of scope

Each of these is a later sub-project, listed in §13. None is forgotten; all are
deliberately excluded.

Writes and CRUD of any kind. The schedule week lifecycle (`schedule_week`,
`day_plan`, `day_plan_department`, `need_override`, `cell_override`,
`violation_authorization`). Time off (`time_off_request`, `time_off_day_ruling`).
The week board. Schedule generation, runs, and assignments. DVM team assignment.
Authentication and `platform.app_user`. All `commission` tables. Department
ordering and `department_constraint`. `core.employment_period`,
`core.employee_location`, and `scheduling.employee_constraint`.

---

## 4. Repository structure

`oms-new` is its own git repository. `oms-plus` is not a repository, and `oms` is
already a separate one; the two projects have independent lifecycles.

```
oms-new/
  backend/                    Python 3.12
    app/
      core/                   organization, location, title, employee,
                              employee_title, external_identity, day_of_week
      scheduling/             shift_pattern, constraint_type, hospital_constraint,
                              department, role, default_need, employee_profile,
                              role_eligibility, location_eligibility,
                              rotation, rotation_cell
      api/                    routers and response schemas
      seed/                   fixture loader command
    migrations/               Alembic
    tests/
  frontend/                   Node 24
    src/
      api/                    generated OpenAPI client
      reference/              boot-time reference data provider
      screens/                Configuration, Team
      components/
    tests/
  tools/
    convert_workbook.py       one-time converter
    code_map.py               canonical code rule and overrides
    scan_domain_codes.py      static scan
  seed/
    wcah_seed.sql             the frozen fixture (committed)
    CONVERSION.md             assumptions and the full code map
    source/                   archived original .xlsx, not an input
  docs/                       corpus copied from oms/docs, plus README index
  infra/
    docker-compose.yml
```

Python packages mirror the PostgreSQL schemas, so `core` and `scheduling` are
visible boundaries in both the database and the code. A cross-module import is as
obvious in a diff as a cross-schema foreign key.

**Stack.** Backend: Python 3.12, FastAPI, SQLAlchemy 2.x, Alembic, psycopg 3,
pytest, httpx. Frontend: React 18, TypeScript, Vite, Tailwind v4 with `@theme`
tokens, TanStack Query, Vitest, Testing Library. Database: PostgreSQL 16.
Infrastructure: Docker Compose.

---

## 5. Data model

Eighteen tables, drawn from the schema v2 catalog and trimmed to what Configuration
and Team require. Every table carries `id`, `created_at`, and `updated_at`. Every
table carries `organization_id` except `core.title` and `core.day_of_week`, which
are universal vocabulary rather than one hospital's invention — the AD-026
asymmetry made physical.

### 5.1 `core`

| Table | Purpose | Key columns |
|-------|---------|-------------|
| `organization` | One row: WCAH. The tenancy seam, and the owner of the week start day. | `code`, `name`, `week_start_day_id`, `active` |
| `location` | Linda Vista, Pacific Beach. | `code`, `name`, `short_label`, `sort_order`, `active` |
| `title` | CSR, VA, RVT, DVM. Universal reference data; no `organization_id`. | `code`, `name`, `short_label`, `rank`, `active` |
| `employee` | Stable identity across termination and rehire. | `display_name`, `status` |
| `employee_title` | Effective-dated title history. | `employee_id`, `title_id`, `effective_from`, `effective_to` |
| `external_identity` | External system keys; carries the workbook's Paylocity name. | `employee_id`, `system`, `external_key` |
| `day_of_week` | Seven rows. Universal; no `organization_id`. `iso_index` is stable (Monday 1 … Sunday 7); display order is computed relative to `organization.week_start_day_id`, never stored. | `code`, `name`, `short_label`, `iso_index` |

### 5.2 `scheduling`

| Table | Purpose | Key columns |
|-------|---------|-------------|
| `shift_pattern` | Named shift definitions. WCAH's 10-hour standard is one row, not a property of the software (D17). | `code`, `name`, `start_time`, `end_time`, `unpaid_meal_minutes`, `paid_hours` |
| `constraint_type` | Registry of legal type codes. An unrecognized code fails loudly at load. | `code`, `parameter_schema` (JSONB), `machine_consumable`, `active` |
| `hospital_constraint` | Rest pattern, target hours, overage cap, notes. | `type_code`, `name`, `parameters` (JSONB), `weight`, `temporal_scope`, `machine_consumable`, `rationale`, `owner`, `source_ref`, `active` |
| `department` | Eight departments. | `code`, `name`, `description`, `sort_order`, `active` |
| `role` | Twelve roles. | `department_id`, `code`, `name`, `short_label`, `description`, `min_title_id`, `counts_toward_need`, `sort_order`, `active` |
| `default_need` | 65 per-day coverage templates. Six columns of pure meaning; no nullable ambiguity (D22). Absent means no need. | `department_id`, `location_id`, `day_of_week_id`, `role_id`, `quantity`, `weight` — all not null, `quantity > 0` |
| `employee_profile` | Scheduling facts for a `core.employee`. No home department (I10). `default_shift_pattern_id` is **not nullable**, so the paid-hours chain always terminates in data (D17). | `employee_id` (PK/FK), `target_hours`, `home_location_id`, `default_shift_pattern_id`, `consecutive_off_exempt`, `notes`, `external_ref`, `active` |
| `role_eligibility` | The wide 24-column grid, normalized. No `auto_assign` (I12). | `employee_id`, `role_id`, `rank`, `weight`, `burnout_days` |
| `location_eligibility` | Who may work Pacific Beach. | `employee_id`, `location_id`, `rank` |
| `rotation` | Sequence and anchor date. Sequence 1 is the standing week. `anchor_date` must fall on `organization.week_start_day_id` (D18) — validated against the column, not against Sunday. | `employee_id`, `sequence`, `anchor_date`, `active` |
| `rotation_cell` | The parsed cell grammar. | `rotation_id`, `day_of_week_id`, `kind`, `role_id`, `location_id`, `paid_hours`, `start_time`, `end_time`, `time_note`, `label`, `weight` |

### 5.3 Deviations from schema v2, with reasons

**`core.employee.primary_title_id` is dropped.** Schema v2 offers it as a
convenience alongside `employee_title`, but two places holding the current title
is two places to disagree. Current title is a query against `employee_title`.

**`core.employee_location` is skipped.** Home location is a scheduling fact and
lives on `employee_profile`. A second home-location column invites the same drift.
It returns if a second module ever needs the association.

**`core.day_of_week` and `scheduling.constraint_type` are added as tables.** Under
D7 a component must not contain the string "Mon", and the constraint registry is
needed so an unrecognized type code fails at load rather than being silently
skipped. Both are cheap and both remove literals from source.

**`role` gains `short_label`; `role`, `department`, and `location` gain
`sort_order`.** This is D7 in practice: `ROLE_SHORT_LABEL` at
`OmsScreens.jsx:14-29` becomes `role.short_label` in PostgreSQL.

**`organization` gains `week_start_day_id`, and `day_of_week` carries `iso_index`
rather than a stored `sort_order`.** Schema v2 fixes Sunday in prose throughout.
Under D18 the week start is data, so day ordering is computed from the
organization's start day rather than baked into the reference rows.

**`default_need` loses `formula` and `condition`, and its remaining columns become
not-null** under D16 and D22. Schema v2's version had four nullable columns, each
encoding an ambiguity that Tom's rulings dissolved.

**`employee_profile.default_shift_pattern_id` becomes non-nullable** under D17, so
the paid-hours resolution chain can never fall through to a constant.

**`scheduling.department_constraint` is deferred** under D14.

### 5.4 Invariants honored

The Track D invariants I1–I15 shape this schema directly. In particular: no
department-authorization table, because role eligibility implies it (I1); no home
department (I10); no `unavailable_days` column, because permanent OFF is a rotation
cell (I11); no `auto_assign` flag (I12); no employee-scope constraint rows (I13);
`location_id` on needs because coverage is location-scoped (I14); and
`counts_toward_need` as a column on `role` rather than a hardcoded role-code test
(I15).

The dropped legacy constraint types must not reappear as tables or required
constraint rows: `DAY_AVAILABILITY`, `FIXED_DAY_SET`, `FIXED_ASSIGNMENT`,
`ROLE_ELIGIBILITY`, `LOCATION_ELIGIBILITY`, `DEPARTMENT_AUTH`.

---

## 6. Canonical identifiers

Source vocabulary is not adopted verbatim. Every `code` column holds an internal
identifier namespaced by kind, assigned during conversion and never derived at
runtime.

| Kind | Canonical code | Displayed as |
|------|----------------|--------------|
| Organization | `organization_wcah` | `name` |
| Title | `title_csr`, `title_va`, `title_rvt`, `title_dvm` | `name`, `short_label` |
| Department | `department_room`, `department_csr`, `department_dental`, … | `name` |
| Role | `role_room_tech`, `role_csr`, `role_csr_admin`, … | `name`, `short_label` |
| Location | `location_lv`, `location_pb` | `name`, `short_label` |
| Day | `day_sun` … `day_sat` | `name`, `short_label` |
| Shift pattern | `shift_pattern_standard_b` | `name` |

Human-readable text is unaffected. The UI still reads "CSR" because it renders
`name` and `short_label` from the database. What changes is that any identifier a
program compares against is unambiguous about what kind of thing it names.

This matters concretely: in the workbook the department named `CSR`, the role named
`CSR`, and the title `CSR` are three different things sharing one string, and the
role named `HSS` shares its string with its department. Namespacing the identifiers
is what makes each one addressable.

The rule is `{kind}_{snake_case(source_code)}`, implemented in `tools/code_map.py`
with a short override table for source values the rule renders badly.
`seed/CONVERSION.md` prints every input-to-output pair. The workbook's integer
`department_key` and `role_key` columns are discarded; the canonical code is the
natural key, and the deterministic UUIDv5 seeds off it.

Constraint type codes such as `TARGET_HOURS` are untouched. They are engine
vocabulary that translators legitimately register against, not per-hospital domain
data.

**PRD open item A22 does not apply to `oms-new`.** The collision it describes
exists only where source vocabulary becomes canonical identifiers verbatim. It is
closed by construction, and the docs index records it as such.

---

## 7. Seed conversion

`tools/convert_workbook.py` reads the V5 workbook with openpyxl and writes
`seed/wcah_seed.sql`. It runs once; its output is committed; the application never
depends on openpyxl or on the `.xlsx` existing. The workbook is copied to
`seed/source/` as an archived original, marked as provenance rather than input.

**Determinism.** UUIDs are UUIDv5 over a fixed namespace plus each row's canonical
code, so re-running the converter produces byte-identical output and tests can name
a row without guessing an id.

**Loading.** Not inside an Alembic migration. Migrations create structure; a
separate `seed` command loads the fixture. This keeps every migration free of
domain codes.

**The three real transformations.** The `Employees` sheet's 24 wide eligibility
columns collapse into `role_eligibility` rows with ranks. Rotation day cells parse
from `CODE[@LOCATION][/HOURS][ (note)]` into structured columns — the only bespoke
parser in the project, with unit tests over every distinct cell value in the
workbook. `System_Config`'s overage cap becomes a `hospital_constraint` row rather
than a key-value entry, per ruling I4.

**Coverage need rulings applied at conversion.** The `2 * DVMs` formula is not
carried across (D16); the seven room tech rows take the quantities Tom supplied — 4
on weekends, 10 on weekdays. The two `quantity = 0` rows on Dental Junior Tech are
dropped, since absent
means no need — they were an artifact of laying the full week out on a spreadsheet.
The 13 CSR rows with no location convert as Linda Vista. The one `condition` value is
discarded. Together these take the count from 67 to 65. Each ruling is recorded in
`docs/open-items/2026-08-11-coverage-needs-model.md`.

**Label corrections.** The HSS role's name becomes "Hospital Support Specialist"
rather than the bare acronym, with `short_label` of "HSS", now that the expansion is
known.

**Paid hours in rotation cells.** The workbook's grammar describes `/HOURS` as
overriding "the 10h default". The converter resolves that default from the seeded
`shift_pattern` row rather than writing the number, so the constant exists nowhere
(D17).

**Documented best-interpretation rulings** (D5), each recorded in
`seed/CONVERSION.md` with the affected employees named:

| Flag | Ruling |
|------|--------|
| `DUPLICATE_EMPLOYEE_ID` | Keep the first occurrence, discard the duplicate, list both. |
| `SPLIT_DENTAL_TECH→JR_OR_SR` | Grant the junior role (D19). Both dental roles require RVT, so the title ceiling cannot discriminate; under-granting is corrected upward in the UI as a deliberate act. |
| `MOVE_UNAVAILABLE_TO_ROTATION_OFF` | Convert legacy unavailable days into rotation `OFF` cells, as I11 requires. |
| `FILL_CSR_ROLE_ELIGIBILITY` | Grant CSR role eligibility where the title is CSR and the cell is blank. |
| `REVIEW_HSS` | Change nothing; flag for Tom's review. |

**One value the workbook does not supply.** `role.short_label` has no column in the
workbook. It is seeded from the `ROLE_SHORT_LABEL` map at `oms/src/ui/oms/OmsScreens.jsx:14-29`,
which is the only place that display knowledge currently exists — a legitimate
one-time conversion input, recorded in `CONVERSION.md`, and editable in the
application thereafter. This is the concrete instance of D7: a lookup map in a
component becomes a column in PostgreSQL.

**Dropped as dead.** The `TECH_NC` eligibility and rank columns are empty for all
37 employees. `Migration_Notes` contains only headers. `Week_Setup` and `Time_Off`
are out of scope for this slice.

**Conversion guard.** A test asserts exact row counts: 2 locations, 4 titles, 8
departments, 12 roles, 65 default needs, 37 employees, 39 rotations. If the converter
ever quietly drops a sheet, the test fails. The needs count is 65 rather than the
workbook's 67 because of the two dropped artifact rows; the test asserts the post-
ruling number, and the discrepancy is explained in `CONVERSION.md`.

---

## 8. API

FastAPI under `/api`, read-only for this sub-project, with OpenAPI published so the
frontend client is generated rather than written.

| Route | Returns |
|-------|---------|
| `GET /healthz` | Liveness. |
| `GET /api/reference` | Organization, locations, titles, days, shift patterns, constraint types, and departments with roles nested — including `short_label`, `sort_order`, `min_title_id`, and `counts_toward_need`. Cached client-side. |
| `GET /api/departments` | List. |
| `GET /api/departments/{id}` | Department with roles and default needs. |
| `GET /api/default-needs` | Filterable by department and day. |
| `GET /api/employees` | List with profile summary, current title, home location. |
| `GET /api/employees/{id}` | Employee with role eligibilities, location eligibilities, rotations and cells. |
| `GET /api/hospital-constraints` | List. |

**Conventions.** `snake_case` on the wire (D12). Organization scoping resolves
server-side from the single organization row and never appears in a URL (D3).
Errors use RFC 9457 problem details. Pagination is deliberately absent — 37
employees do not need it, and adding it later is additive.

---

## 9. Frontend

React 18, TypeScript, Vite, and Tailwind v4 with `@theme` tokens.

**Generated client.** Types are generated from the OpenAPI schema, so a component
cannot reference a field the backend does not return, and a renamed column breaks
the build.

**Server state via TanStack Query.** The mockup hand-wrote a state machine for
loading, staleness, offline, and rollback. That is a solved problem, and
re-implementing it is how the previous version accumulated its complexity.

**Reference data** loads once at boot into a provider. Every screen reads its
vocabulary from it; no screen holds a lookup map.

**Configuration** is a department list with a detail pane showing that department's
roles and its weekly needs grid, with days ordered from the organization's week
start day (D18).

**Team** is an employee list with a detail pane showing title, target hours, home
location, ranked role and location eligibilities, and the rotation grid rendered
from parsed cells.

---

## 10. Enforcement, testing, and operations

### 10.1 The static scan

`tools/scan_domain_codes.py` reads every canonical `code` from the seed fixture and
fails the build if any appears in `frontend/src` or `backend/app`. The list is
generated from the fixture, so adding a department extends the guard automatically.

**There is no exception list.** Because identifiers are namespaced (D10),
`department_csr`, `role_csr`, and `title_csr` are three distinct, unambiguous
strings, and each is enforced identically.

**The scan covers codes, not display text.** `name` and `short_label` are not
scanned, for two reasons. First, nothing keys off them: components render a label,
they never compare against it, and any behavior depending on identity must go
through a code, which is scanned. Second, scanning them would reintroduce the exact
ambiguity D10 removes — the department's name is literally `CSR`, the role's name is
literally `CSR`, and the role named `HSS` shares its string with its department, so
a name-based scan could not be enforced without the exception list this design
refuses to have.

### 10.2 Testing

**Backend.** pytest and httpx against a real PostgreSQL 16 — no SQLite substitute,
since the schema uses JSONB and cross-schema foreign keys. A migration test runs up
and back down. The rotation cell parser has unit tests over every distinct value in
the workbook. The row-count test guards conversion. API contract tests cover each
route.

**Frontend.** Vitest and Testing Library, with fixtures generated from the OpenAPI
schema so mocks cannot drift from what the API returns.

### 10.3 Local development

`docker compose up -d postgres` for the database, then uvicorn and vite natively on
the host for fast reload. Compose also defines the backend service so production
parity exists, though it is not the daily path.

Verified on this machine: Node 24.18, npm 11.16, Docker 29.7 with Compose v5.3.1
and the daemon running, git 2.55, and Python 3.12.10 installed at
`%LOCALAPPDATA%\Programs\Python\Python312`. Note that a fresh shell is required
before `python` resolves to it rather than the Microsoft Store stub.

### 10.4 CI

Three GitHub Actions jobs: backend with a PostgreSQL 16 service, frontend with
typecheck, tests, and build, and the domain-code scan standing alone so a failure
says exactly what it is.

---

## 11. Definition of done

Clone the repository, run Docker Compose, migrate, seed, and open the browser to
see West Coast Animal Hospital's real eight departments, twelve roles, coverage
grid, and thirty-seven employees with their titles, eligibilities, and rotations —
with the static scan passing, proving that none of those values is written anywhere
in source.

More precisely:

- All 18 tables exist with `organization_id` where required, created by Alembic.
- `seed/wcah_seed.sql` is committed, deterministic, and loads into an empty database.
- `seed/CONVERSION.md` documents every assumption and the full canonical code map.
- The conversion row-count test passes.
- Every route in §8 returns data sourced entirely from PostgreSQL.
- Configuration and Team render from the API with no domain literals in source.
- `tools/scan_domain_codes.py` passes with no exception list.
- Backend and frontend test suites pass in CI.
- The `oms/docs` corpus is present with a README index marking current, superseded,
  and mockup-only documents.

---

## 12. Open items handed forward

These are not blockers for this sub-project. They are recorded so they are not
lost.

1. **Pacific Beach coverage.** Linda Vista is an R&D focus, not a fact about the
   hospital (D21). Pacific Beach needs are rows entered through the application once
   it exists, not a schema gap.
2. **Department ordering.** Deferred to its own design scheme (D14). Not carried
   forward as a question here.
3. **Flagged employee data.** The duplicate employee id and the dental split are
   converted on best interpretation and need Tom's review once the Team screen
   exists. `REVIEW_HSS` is no longer among them — Q7 answered what HSS is.
4. **Two weight sanity checks**, both cosmetic. Sunday dental sits at 50 for Senior
   Tech and Monitor while Junior stays at 80, and HSS carries 70 despite being
   nice-to-have. Easier to judge once the Configuration screen renders them.
5. **Authentication.** Punted entirely (`oms` HANDOFF decision 19).
   `platform.app_user` and every `*_by_user_id` column arrive with it.
6. **Kasey's platform review** of the modular schema v2 was never recorded as given.
   The six items in its §10 — per-module schema feasibility, Alembic ownership,
   cross-schema foreign key permissions, `core` extraction timing, SP5 compatibility,
   and physical id strategy — remain open in principle, though D13 answers the last
   of them for `oms-new`.

---

## 13. Follow-on sub-projects

Each gets its own design, plan, and build cycle.

| # | Sub-project | Contents |
|---|-------------|----------|
| 2 | Configuration and roster writes | CRUD API and editing UI for everything the first slice reads. Corrections to converted data land here. Brings back `employee_constraint` as the escape hatch. |
| 3 | Pacific Beach coverage | Entering the second location's needs and roster, once editing exists. Folded into sub-project 2 if it turns out to be small. |
| 4 | Week lifecycle and board | `schedule_week`, `day_plan`, `day_plan_department`, `need_override`, `cell_override`, `violation_authorization`, PTO, and DRAFT → FINAL → PUBLISHED. |
| 5 | Generation engine | Python scheduling with weights, gaps, and violations; `schedule_run` and `assignment`. |
| 6 | DVM team assignment | `dvm_team_assignment`, post-schedule and manual. |
| 7 | Reporting and export | PDF and Excel output, audit views. |
| 8 | Deploy and authentication | VPS, Caddy, `platform.app_user`, Entra OIDC. |

---

## Success criteria

- A person can tell which PostgreSQL schema owns every table from its qualified name.
- No department, role, or location identifier appears in any source file, and the
  scan proves it with no exceptions.
- The seed fixture is deterministic and reproducible from the archived workbook.
- Track D invariants I1–I15 are expressible without legacy constraint tables.
- Configuration and Team render real clinic data fetched over HTTP.
- The vocabulary collision described by PRD A22 cannot occur in this design.
