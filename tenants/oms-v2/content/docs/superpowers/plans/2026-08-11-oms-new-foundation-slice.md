# OMS-New Foundation Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a database-driven vertical slice of the WCAH scheduling module — 18 PostgreSQL tables, a one-time workbook conversion into a committed SQL fixture, a read-only FastAPI surface, and Configuration and Team screens in React — with a static scan proving no domain code appears in source.

**Architecture:** PostgreSQL owns every domain value. Alembic creates structure and contains no domain codes; a separate `seed` command loads a committed, deterministic SQL fixture produced once by `tools/convert_workbook.py`. FastAPI serves read-only resources plus one `GET /api/reference` bootstrap; its OpenAPI schema generates the frontend's TypeScript client, so a renamed column is a build failure. `tools/scan_domain_codes.py` extracts every canonical code from the fixture and fails CI if any appears under `backend/app` or `frontend/src`.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy 2.x, Alembic, psycopg 3, pytest, httpx, openpyxl (converter only). React 18, TypeScript, Vite, Tailwind v4, TanStack Query, Vitest, Testing Library, openapi-typescript, openapi-fetch. PostgreSQL 16, Docker Compose, GitHub Actions.

---

## Global Constraints

Every task's requirements implicitly include this section. Values are copied verbatim from the design spec (`docs/superpowers/specs/2026-08-11-oms-new-foundation-slice-design.md`).

- **Authority order, from `AGENTS.md` §0:** `AGENTS.md` > `CLAUDE.md` > `docs/decisions/` > `HANDOFF.md`. Read `AGENTS.md` and `CLAUDE.md` at the repository root before changing anything under `backend/`, `frontend/`, `tools/`, `seed/` or `infra/` — `CLAUDE.md` holds the binding operational hard rules. `HANDOFF.md` is history and status, never a rule source. Files in `docs/decisions/` predate `oms-new`; apply each through its "oms-new applicability" note rather than its mockup-era surface language. If this plan ever contradicts `AGENTS.md` or `CLAUDE.md`, they win — stop and surface the conflict instead of choosing silently.
- **No domain data resides outside the database.** Departments, roles, people, constraints, and every value they carry live in PostgreSQL and reach the browser over HTTP.
- **Canonical codes are namespaced by kind** (D10): `department_csr`, `role_csr`, `title_csr`. The rule is `{kind}_{snake_case(source_code)}`, implemented in `tools/code_map.py`.
- **The static scan has no exception list** (spec §10.1). It scans `backend/app` and `frontend/src`. It does not scan `name` or `short_label`.
- **`snake_case` on the wire** (D12). Database, Python, and JSON agree; no mapping layer.
- **UUID primary keys, UUIDv5, derived from the canonical code** (D13). `(organization_id, code)` is the natural unique key.
- **`organization_id` on every table except `core.title` and `core.day_of_week`** (spec §5).
- **No shift-hour constant anywhere** (D17). `employee_profile.default_shift_pattern_id` is `NOT NULL`.
- **The week start day is configurable** (D18). `organization.week_start_day_id` references `core.day_of_week`; display order is computed as `(iso_index - start_iso_index) % 7`, never stored.
- **`default_need` admits no unevaluable state** (D22). `location_id`, `quantity`, `weight` all `NOT NULL`; `quantity > 0`; no `formula`, no `condition`.
- **No JSONB document envelope** (D9). Relational from the first migration.
- **Migrations create structure only.** No domain code appears in any migration; the fixture is loaded by a separate command (spec §7).
- **Python packages mirror PostgreSQL schemas** (spec §4): `app/core/`, `app/scheduling/`.
- **TypeScript on the frontend from day one** (D11). The API client is generated, never hand-written.
- **`constraint` is internal vocabulary; the UI says "Policies"** (D20).
- **Out of scope, do not build:** writes of any kind, week lifecycle, time off, the board, generation, DVM team assignment, authentication, commission, department ordering and `department_constraint`, `core.employment_period`, `core.employee_location`, `scheduling.employee_constraint` (spec §3).
- **Platform:** Windows, PowerShell. `&&` is not a statement separator — use `;`. Heredocs do not work — use `git commit -F <file>`. A fresh shell is required before `python` resolves to 3.12.10 at `%LOCALAPPDATA%\Programs\Python\Python312` rather than the Microsoft Store stub.
- **Invoke Python by absolute path**, `backend\.venv\Scripts\python.exe`. A relative path breaks the moment you change directory, and the resulting "not recognized as the name of a cmdlet" error looks like a missing install rather than a wrong path.
- **Run pytest from `backend`.** `pyproject.toml` sets `testpaths = ["tests", "../tools/tests"]` and `pythonpath = [".", ".."]`, which is what collects both test trees and resolves `from tools.x import y`. `pythonpath` is a **pytest-only** setting: it does nothing for a bare `python -c`, so run one-liners that import `tools` from the repository root instead.
- **Lint both trees: `ruff check backend tools`.** `ruff check .` from `backend` silently skips `tools/` and reports clean while `tools/` is broken.
- **Invoke Alembic as `python -m alembic`, never bare `alembic`.** Because pytest runs as `.venv\Scripts\python.exe -m pytest` without activating the venv, `Scripts` is not on PATH and `shutil.which("alembic")` returns None. In a subprocess use `[sys.executable, "-m", "alembic", ...]`.
- **Run `python -m tools.*` from the REPOSITORY ROOT, never from `backend`.** The root is the only directory from which `tools` is importable, because `pythonpath` is pytest-only. Alembic and pytest run from `backend`; the converter and the domain-code scan run from the root. In a subprocess use `cwd=REPO`.
- **Every guard test ships with a mutation probe.** A test that asserts something is *absent* — no hardcoded codes, no data in a migration, no unbounded weight — is worthless unless it has been seen to fail. Before calling such a test done, plant the violation it forbids, watch it fail and name the offender, then remove the plant and confirm the tree is clean. Four guards on this build looked rigorous and could not fail: the D4 workbook scan, the `default_need` quantity check, the migration domain-code scan, and the `DATA_MANIPULATION` pattern that could not match a schema-qualified table.
- **When a ruling changes a column, sweep all eight layers.** In order: the SQLAlchemy model, the Alembic migration, the converter's row builders, the generated artifacts (`wcah_seed.sql`, `domain_codes.json`), the tests asserting the old shape, the API response schemas, the frontend fixtures, and the prose in `CONVERSION.md` and the findings. D23 was swept three times and still missed the converter and the prose, because each sweep covered the layers that came to mind rather than a list.
- **Run `python tools/dev/check_plan.py` from the repository root before dispatching any task.** It lints the plan's embedded Python, flags the invocation and guard anti-patterns above, and detects a task using a module that a later task creates. Every check exists because that defect cost a round trip here.
- **Never pattern-match canonical codes to detect hardcoded domain data** (finding F11). The grammar `{kind}_{snake_case}` also matches ordinary identifiers such as `organization_id`, `title_id` and `day_of_week`, so such a scan flags correct code. The declared manifest `seed/domain_codes.json` is the only authority on which strings are domain codes.
- **Commits:** Tom authorized local commits for this build on 2026-08-11, on `main`, in this repository. Commit at the end of each task using the message given in that task's Commit step; messages follow Conventional Commits. **Never push, never force-push, never amend, never rebase.** The per-task review gate diffs the commit range the task produced, so a task that does not commit cannot be reviewed.

---

## Findings from the workbook that amend the spec

These were discovered by reading `WCAH_OMS_Seed_Workbook-V5.xlsx` directly during planning. They do not change any of the spec's decisions (F13 records one Tom added later, D23). Four of them make a spec sentence inaccurate, and five fill gaps the spec left open. **Raise anything here with Tom before Task 7 if it looks wrong.**

### F1 — The `massage_flags` column records transformations already applied, not work remaining

Spec §7's "Documented best-interpretation rulings" table (D5) reads as instructions for the converter. The V5 data shows all four data rulings are already baked in:

| Flag | Spec ruling | What V5 actually contains |
|---|---|---|
| `DUPLICATE_EMPLOYEE_ID` | "Keep the first occurrence, discard the duplicate, list both." | 37 rows, 37 distinct `employee_id`. There is no duplicate to discard. Flag sits on `burchnell-cayla` alone. |
| `FILL_CSR_ROLE_ELIGIBILITY` | "Grant CSR role eligibility where the title is CSR and the cell is blank." | All 9 flagged employees already carry `CSR Eligible = Y`. No blank remains. |
| `SPLIT_DENTAL_TECH→JR_OR_SR` | "Grant the junior role (D19)." | All 7 flagged employees already carry `DENTAL_TECH_JR = Y` at rank 2. Four of them (`dimino-aaron`, `gardner-theresa`, `quinonez-mariel`, `ross-shana`) additionally carry `DENTAL_TECH_SR = Y` at rank 1. |
| `MOVE_UNAVAILABLE_TO_ROTATION_OFF` | "Convert legacy unavailable days into rotation `OFF` cells." | V5 has no `unavailable_days` column at all. `Employee_Rotations` already carries 131 `OFF` cells. |

**Consequence for the plan.** The converter reads the eligibility grid verbatim and applies no transformation. `massage_flags` is carried into `seed/CONVERSION.md` as provenance and into no database column. D5 and D19 are honored as the record of *why* V5 looks the way it does rather than as conversion logic.

**The one place this matters substantively:** applying D19 literally to the four employees who hold `DENTAL_TECH_SR` would mean *removing* their senior eligibility. That would be a downgrade of real data on the strength of a ruling written for an ambiguity that no longer exists. **Ruled by Tom 2026-08-11: keep what the workbook asserts and convert the grid verbatim; D19 stands as the record of why V5 looks this way.** Task 9 asserts the no-op with tests, so if this reading is ever wrong the suite says so loudly instead of silently.

### F2 — `role_eligibility.rank` must be nullable

Three cells are marked eligible with a blank rank: `gallegos-angie` / `DENTAL_MONITOR`, `mariscal-paulina` / `TECH_APPT`, `paz-vero` / `DENTAL_MONITOR`. Ranks are also mixed Python types in the sheet (83 int, 22 str) and must be coerced. Spec §5.2 lists `rank` without ruling on nullability. The plan makes it nullable and sorts nulls last.

### F3 — `role_eligibility.weight` and `burnout_days` have no workbook source

The `Employees` sheet carries only `{CODE} Eligible` and `{CODE} Rank` per role. Both columns exist in the schema per spec §5.2. They become editable in sub-project 2.

**Superseded in part by F13.** Only `burnout_days` is `NULL` for all 108 rows. `weight` is now `NOT NULL` and converts to the default 40.

### F4 — `shift_pattern` has no workbook source at all

There is no `Shift_Patterns` sheet and no shift-pattern column on `Employees`. But D17 makes `employee_profile.default_shift_pattern_id` `NOT NULL`, so the row must come from somewhere. It comes from the mockup's seed at `../oms/src/seed/fromWorkbook.js:1050-1058` — `STANDARD_B`, `07:30`, `18:30`, 30 unpaid meal minutes, 10 paid hours. This is a **second one-time conversion input of the same kind as `ROLE_SHORT_LABEL`** (spec §7), and it is recorded in `CONVERSION.md` alongside it. All 37 employees are assigned it.

### F5 — `employee_title.effective_from` has no workbook source

The `Employees` sheet has `title_code` but no dating. The mockup used `2020-01-01` with `effective_to = null`. The plan uses the same sentinel, records it in `CONVERSION.md` as **not a hire date**, and the Team screen does not display it.

### F6 — `sort_order` has no workbook source

Spec §5.3 adds `sort_order` to `department`, `role`, and `location` but the workbook has no such column. The plan derives it from the workbook's integer `department_key`, `role_key`, and `location_key` ordering — dense-ranked, so `role` sort_order is 1–12 even though `role_key` skips 8. The keys remain discarded as *identity* per spec §6; they are read once, for ordering, and that is recorded in `CONVERSION.md`.

### F7 — Rotation cells in V5 exercise almost none of the grammar

All 273 day cells reduce to 11 distinct values: blank (120), `OFF` (131), and nine bare role codes plus `SURGERY_TECH@PB` (2 cells, both `ross-shana` Tuesday). **No cell uses `/HOURS` and no cell uses `(note)`.** The parser still implements the full `CODE[@LOCATION][/HOURS][ (note)]` grammar because the authoring surface requires it, but its workbook-corpus test is 11 cases and the grammar coverage is synthetic. A useful consequence: every `rotation_cell.paid_hours` is `NULL`, so the D17 resolution chain terminates in `employee_profile.default_shift_pattern_id` for every employee, which is exactly the property D17 wanted.

### F8 — Blank rotation cells produce no row

The domain model's I3 says a blank / `ANY` cell carries no constraint. Storing 120 rows that mean "no constraint" is the same permanent-ambiguity affordance D22 removes from `default_need`. The converter emits rows only for `ROLE` and `OFF` kinds: **153 cells, not 273.** The `kind` CHECK still admits `ANY` so the authoring surface in sub-project 2 has somewhere to go. Absent means flexible.

### F9 — `gleason-margaret` is home Pacific Beach but is not Pacific Beach eligible

Her `home_location_code` is `PB` while `eligible_PB` is blank; `eligible_PB` is set only for `gardner-theresa` and `ross-shana`. The converter writes exactly what the sheet says, producing an employee whose home location is one she is not eligible for. This is a data question for the Team screen (spec §12 item 3), not a schema question, and no constraint forbids it. `location_eligibility` is 39 rows: 37 LV + 2 PB.

### F10 — One code-map override is required

The rule `{kind}_{snake_case(source_code)}` turns the department code `TECHAPPT` into `department_techappt`, while its only role `TECH_APPT` becomes `role_tech_appt`. The override table that spec §6 provisions exists for exactly this; the single entry maps department `TECHAPPT → tech_appt`, giving `department_tech_appt`.

### F11 — The domain-code set must be declared by the converter, not recovered from the fixture

**Found during Task 3's review, 2026-08-12. Amends Tasks 8, 9 and 11.**

Task 11 originally obtained the set of domain codes by running `CANONICAL_CODE_RE.findall()` over the text of `seed/wcah_seed.sql`. That cannot work. The canonical grammar is `{kind}_{snake_case}`, and the fixture's own SQL identifiers satisfy it: `organization_id`, `location_id`, `role_id`, `title_id`, `department_id`, `shift_pattern_id`, `day_of_week`, `role_eligibility` and `location_eligibility` all `fullmatch`. Harvesting them would break the expected-count assertion and then make the scan report ordinary application identifiers such as `organization_id` throughout `backend/app`, which would render the guard worthless.

The ambiguity is not fixable in the pattern. `organization_id` and `organization_wcah` are both well-formed canonical codes; no lexical rule separates a column name from a domain code. A word-boundary lookaround would stop the unrelated substring problem — `weekday_index` currently matches `day_index` — but it cannot help here.

**Ruled by Tom, 2026-08-12: do not infer the code set from the fixture's content. Make it explicit and unambiguous, generated by the converter from the same source of truth as the seed rows, and drop heuristic extraction entirely.**

The converter therefore keeps a **code registry**. Every canonical code it mints is registered once, and the registry is what emits both the `code` column values in the SQL and a separate structured manifest, `seed/domain_codes.json`. Task 11 reads the manifest and never parses SQL. `CANONICAL_CODE_RE` keeps a real job — validating that every manifest entry is well formed — but is no longer used to discover anything.

Two consequences worth stating:

- A registry is also the natural home for the collision guard that finding F12 requires, because it is the one place that sees every code together.
- Spec §10.1's intent is preserved exactly. The guard still extends itself when a department is added, because the manifest regenerates from the workbook whenever the fixture does.

A manifest is not domain data escaping the database in the sense the governing rule forbids. It is a generated build-time artifact consumed only by a lint tool, with exactly the same standing as the committed `seed/wcah_seed.sql` beside it. A `core.canonical_code` table was considered and rejected: it would add a nineteenth table to the frozen eighteen-table model in spec §5, and it would force the static scan to require a live database in CI.

### F12 — The converter must reject colliding canonical codes

**Found during Task 3's review, 2026-08-12. Amends Task 8.**

`_snake` collapses every run of non-alphanumeric characters to a single underscore, so distinct source spellings can yield one code: `CSR_ADMIN` and `CSR-Admin` both give `role_csr_admin`, and because `row_uuid` is derived from the code, a collision is also a primary-key collision. V5 is safe today — its 26 catalog source codes give 26 distinct canonical codes — so this is a guard against future workbook edits, not a present defect.

`canonical_code` is stateless and cannot detect a collision across calls, so the check belongs in the converter's code registry, which sees the whole input set. Registering a code that is already present must raise and name both source values. Left unguarded, the failure would otherwise surface much later as an opaque duplicate-key error when Task 10 loads the fixture.

### F13 — Weight is a bounded 0–100 scale with a soft/hard split and a default of 40

**Ruled by Tom, 2026-08-12. Amends Tasks 5, 6, 13, 15, 16 and 19, and supersedes part of F3.**

The weighting model `AGENTS.md` §2 mandates is now fully specified:

- **0–50 is soft policy; 51–100 is hard policy.** `docs/oms-domain-model.md` already defined a Violation as a "constraint breach (soft/hard by weight)"; this supplies the threshold that line was missing. The engine that acts on the distinction is a later sub-project (spec §13), so nothing in this slice branches on it — it is recorded, not built.
- **Anything without an assigned weight defaults to 40**, which sits deliberately in the soft band. An unweighted item is therefore a moderately important soft policy rather than an unknown.
- **The default is stored, not resolved at read time.** Every weight column is `NOT NULL` with a database default of 40, so every row carries a real number. Ruled this way so the values can drive tie-breaking logic later: a resolver that substitutes 40 on read cannot be compared, sorted, or tuned per row, and would leave the API typing weight as nullable for a value that is never genuinely absent.

All four weight columns are affected. `hospital_constraint.weight` and `default_need.weight` were already `NOT NULL` and gain the default. `role_eligibility.weight` and `rotation_cell.weight` were nullable with no source and become `NOT NULL DEFAULT 40`, each with a `BETWEEN 0 AND 100` check — `rotation_cell.weight` had no check at all before.

This is the same reasoning as D22 applied to a second column: a value that can only ever mean "unknown" is a permanent affordance for ambiguity. It also simplifies everything downstream, since `weight` is uniformly `int` in the API rather than `int | None`.

**Consequence for F3.** F3 said `role_eligibility.weight` and `burnout_days` are `NULL` for all 108 rows after conversion. That now holds only for `burnout_days`. Every `role_eligibility` row converts with `weight = 40`, and both columns still become editable in sub-project 2.

---

## File Structure

Every file below is created by this plan. Nothing is modified in `../oms`.

### Backend — `oms-new/backend/`

| File | Responsibility |
|---|---|
| `pyproject.toml` | Dependencies, pytest and ruff configuration. |
| `alembic.ini` | Alembic configuration pointing at `migrations/`. |
| `app/settings.py` | `Settings` — database URL from environment, nothing else. |
| `app/db.py` | SQLAlchemy engine, `SessionLocal`, `Base` with `id`/`created_at`/`updated_at`. |
| `app/core/models.py` | `Organization`, `Location`, `Title`, `Employee`, `EmployeeTitle`, `ExternalIdentity`, `DayOfWeek`. |
| `app/scheduling/models.py` | `ShiftPattern`, `ConstraintType`, `HospitalConstraint`, `Department`, `Role`, `DefaultNeed`, `EmployeeProfile`, `RoleEligibility`, `LocationEligibility`, `Rotation`, `RotationCell`. |
| `app/api/schemas.py` | Pydantic response models for every route. |
| `app/api/reference.py` | `GET /api/reference`. |
| `app/api/departments.py` | `GET /api/departments`, `/{id}`, `GET /api/default-needs`. |
| `app/api/employees.py` | `GET /api/employees`, `/{id}`. |
| `app/api/constraints.py` | `GET /api/hospital-constraints`. |
| `app/api/deps.py` | `get_db`, `get_organization` — resolves the single org server-side. |
| `app/api/problems.py` | RFC 9457 problem-details exception handlers. |
| `app/main.py` | FastAPI app, router registration, `GET /healthz`. |
| `app/seed/load.py` | `python -m app.seed.load` — executes `seed/wcah_seed.sql`. |
| `migrations/env.py`, `migrations/versions/0001_core.py`, `0002_scheduling_catalog.py`, `0003_scheduling_employee.py` | Structure only. |
| `tests/conftest.py` | Session-scoped engine, per-test transaction rollback, seeded-database fixture. |
| `tests/test_migrations.py`, `tests/test_seed_counts.py`, `tests/test_seed_content.py`, `tests/test_api_*.py` | Suites named per task. |

### Tools — `oms-new/tools/`

| File | Responsibility |
|---|---|
| `code_map.py` | `canonical_code`, `OVERRIDES`, `row_uuid`, `NAMESPACE`. No I/O. |
| `rotation_cells.py` | `parse_cell` and the `RotationCell` dataclass. Pure. |
| `convert_workbook.py` | Reads the archived `.xlsx`, writes `seed/wcah_seed.sql`. Only file importing openpyxl. |
| `scan_domain_codes.py` | Extracts codes from the fixture, scans source trees, exits non-zero on a hit. |
| `tests/test_code_map.py`, `tests/test_rotation_cells.py`, `tests/test_scan_domain_codes.py` | Unit tests for the pure tools. |

`tools/` is a package on the pytest path so `backend/tests` and `tools/tests` run in one session.

### Frontend — `oms-new/frontend/`

| File | Responsibility |
|---|---|
| `package.json`, `vite.config.ts`, `tsconfig.json` | Build and test configuration. |
| `src/index.css` | Tailwind v4 import and `@theme` tokens. |
| `src/api/schema.d.ts` | **Generated** by `openapi-typescript`. Never hand-edited. |
| `src/api/client.ts` | `openapi-fetch` client bound to the generated types. |
| `src/api/queries.ts` | TanStack Query hooks — one per route. |
| `src/reference/ReferenceProvider.tsx` | Loads `/api/reference` once at boot; `useReference()`. |
| `src/reference/ordering.ts` | `orderDays`, `bySortOrder`, `byRankThenName`. Pure, unit-tested. |
| `src/components/Shell.tsx`, `ListDetail.tsx`, `Field.tsx`, `Loading.tsx` | Static chrome only. |
| `src/screens/Configuration.tsx` | Department list, roles pane, weekly needs grid. |
| `src/screens/Team.tsx` | Employee list, profile pane, eligibility and rotation grid. |
| `src/App.tsx`, `src/main.tsx` | Routing between the two screens; providers. |
| `tests/*.test.tsx`, `tests/fixtures.ts` | Vitest suites; fixtures typed by the generated schema. |

### Repository root — `oms-new/`

| File | Responsibility |
|---|---|
| `README.md` | Clone-to-running instructions matching spec §11. |
| `infra/docker-compose.yml` | `postgres` service, plus a `backend` service for parity. |
| `seed/source/WCAH_OMS_Seed_Workbook-V5.xlsx` | Archived original. Provenance, not an input to any test. |
| `seed/wcah_seed.sql` | The committed fixture. |
| `seed/domain_codes.json` | Generated beside the fixture from the converter's code registry. The declared domain-code set the static scan reads (findings F11, F12). |
| `seed/CONVERSION.md` | Every assumption plus the full canonical code map. |
| `docs/README.md` | Index of the inherited corpus: current, superseded, mockup-only. |
| `docs/` (31 inherited `.md` files) | Copied from `../oms/docs`, structure preserved. |
| `.github/workflows/ci.yml` | Three jobs: `backend`, `frontend`, `domain-code-scan`. |

---

## Task Order and Rationale

| # | Task | Why here |
|---|---|---|
| 1 | Repository skeleton and PostgreSQL | Nothing is testable until a real database answers. |
| 2 | Docs corpus and archived workbook | Cheap, and Tasks 4–8 cite these paths. |
| 3 | Canonical code map | Every downstream identifier comes from it. |
| 4 | `core` schema migration | Structure before data. |
| 5 | `scheduling` catalog migration | |
| 6 | `scheduling` employee migration | |
| 7 | Rotation cell parser | Pure; the converter consumes it. |
| 8 | Converter — reference and catalogs | |
| 9 | Converter — employees and rotations | |
| 10 | Seed loader and conversion guard | The fixture now exists and loads. |
| 11 | **Static domain-code scan** | The earliest point the scan can exist, since it reads the fixture. Everything after this is built under it. |
| 12 | FastAPI app, `/healthz`, problem details | |
| 13 | `GET /api/reference` | The frontend cannot boot without it. |
| 14 | Department and default-need routes | |
| 15 | Employee routes | |
| 16 | Hospital-constraint route | |
| 17 | Frontend scaffold, generated client, reference provider | First React. Scan already guards it. |
| 18 | Configuration screen | |
| 19 | Team screen | |
| 20 | CI and definition-of-done verification | |

---

# Tasks

## Task 1: Repository skeleton and PostgreSQL

**Files:**
- Create: `oms-new/backend/pyproject.toml`
- Create: `oms-new/backend/app/__init__.py`
- Create: `oms-new/backend/app/settings.py`
- Create: `oms-new/backend/app/db.py`
- Create: `oms-new/infra/docker-compose.yml`
- Create: `oms-new/backend/tests/__init__.py`
- Create: `oms-new/backend/tests/conftest.py`
- Test: `oms-new/backend/tests/test_database_connection.py`
- Modify: `oms-new/.gitignore`

**Interfaces:**
- Consumes: nothing.
- Produces: `app.settings.Settings` with attribute `database_url: str`; `app.db.engine` (SQLAlchemy `Engine`), `app.db.SessionLocal` (`sessionmaker[Session]`), `app.db.Base` (DeclarativeBase), `app.db.TimestampMixin` with columns `id: Mapped[uuid.UUID]`, `created_at: Mapped[datetime]`, `updated_at: Mapped[datetime]`. pytest fixture `db_session: Session` in `tests/conftest.py`.

- [ ] **Step 1: Start PostgreSQL 16**

Create `oms-new/infra/docker-compose.yml`:

```yaml
services:
  postgres:
    image: postgres:16
    container_name: oms_new_postgres
    environment:
      POSTGRES_USER: oms
      POSTGRES_PASSWORD: oms
      POSTGRES_DB: oms_new
    ports:
      - "5433:5432"
    volumes:
      - oms_new_pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U oms -d oms_new"]
      interval: 5s
      timeout: 5s
      retries: 20

volumes:
  oms_new_pgdata:
```

Port 5433 avoids colliding with any PostgreSQL already on 5432.

Run: `docker compose -f infra/docker-compose.yml up -d postgres`
Expected: container `oms_new_postgres` reaches `healthy`. Confirm with `docker compose -f infra/docker-compose.yml ps`.

- [ ] **Step 2: Write the failing connection test**

Create `oms-new/backend/tests/test_database_connection.py`:

```python
from sqlalchemy import text

from app.db import engine


def test_database_is_postgres_16():
    with engine.connect() as conn:
        version = conn.execute(text("SHOW server_version")).scalar_one()
    assert version.startswith("16."), f"expected PostgreSQL 16, got {version}"


def test_core_and_scheduling_schemas_are_creatable():
    with engine.begin() as conn:
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS core"))
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS scheduling"))
        names = set(
            conn.execute(
                text("SELECT schema_name FROM information_schema.schemata")
            ).scalars()
        )
    assert {"core", "scheduling"} <= names
```

- [ ] **Step 3: Run it to make sure it fails**

Run: `cd backend; python -m pytest tests/test_database_connection.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app'`.

- [ ] **Step 4: Write `pyproject.toml`**

Create `oms-new/backend/pyproject.toml`:

```toml
[project]
name = "oms-new-backend"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
    "fastapi>=0.115",
    "uvicorn[standard]>=0.32",
    "sqlalchemy>=2.0.36",
    "alembic>=1.14",
    "psycopg[binary]>=3.2",
    "pydantic>=2.10",
    "pydantic-settings>=2.7",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.3",
    "httpx>=0.28",
    "openpyxl>=3.1.5",
    "ruff>=0.8",
]

[build-system]
requires = ["setuptools>=75"]
build-backend = "setuptools.build_meta"

[tool.setuptools.packages.find]
include = ["app*"]

[tool.pytest.ini_options]
testpaths = ["tests", "../tools/tests"]
pythonpath = [".", ".."]
addopts = "-ra"

[tool.ruff]
line-length = 100
target-version = "py312"

[tool.ruff.lint]
select = ["E", "F", "I", "UP", "B"]
```

`pythonpath` includes `..` so `import tools.code_map` resolves and `tools/tests` runs in the same session.

- [ ] **Step 5: Write settings and the database module**

Create `oms-new/backend/app/__init__.py` (empty file).

Create `oms-new/backend/app/settings.py`:

```python
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="OMS_", extra="ignore")

    database_url: str = "postgresql+psycopg://oms:oms@localhost:5433/oms_new"


settings = Settings()
```

Create `oms-new/backend/app/db.py`:

```python
import uuid
from datetime import datetime

from sqlalchemy import DateTime, create_engine, func
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

from app.settings import settings

engine = create_engine(settings.database_url, pool_pre_ping=True, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


class TimestampMixin:
    """`id`, `created_at`, `updated_at` — carried by all 18 tables (spec section 5)."""

    id: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
```

Primary keys have no default: every id is a UUIDv5 supplied by the fixture (D13).

- [ ] **Step 6: Write the shared conftest**

Create `oms-new/backend/tests/__init__.py` (empty file).

Create `oms-new/backend/tests/conftest.py`:

```python
import pytest
from sqlalchemy.orm import Session

from app.db import engine


@pytest.fixture
def db_session():
    """A session on a transaction that is always rolled back, so tests never mutate state."""
    connection = engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection, join_transaction_mode="create_savepoint")
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()
```

- [ ] **Step 7: Install and run the tests**

Run:
```
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -e ".[dev]"
python -m pytest tests/test_database_connection.py -v
```
Expected: 2 passed.

- [ ] **Step 8: Extend `.gitignore`**

Append to `oms-new/.gitignore`:

```
backend/.venv/
backend/**/__pycache__/
frontend/node_modules/
frontend/dist/
.pytest_cache/
.ruff_cache/
```

- [ ] **Step 9: Commit**

```powershell
git add backend/pyproject.toml backend/app backend/tests infra/docker-compose.yml .gitignore
git commit -m "feat: add backend skeleton and PostgreSQL 16 via Compose"
```

---

## Task 2: Docs corpus and archived workbook

Spec D6: the `oms/docs` corpus is copied in with a README index marking current, superseded, and mockup-only documents, and nothing is deleted. Spec §7: the workbook is copied to `seed/source/` as an archived original.

The corpus is **31 markdown files**. Two of them are the authoritative model source and must land at the exact paths the design spec's header cites: `docs/superpowers/specs/2026-08-07-oms-modular-database-schema-design.md` and `docs/oms-domain-model.md`. Structure is therefore mirrored, not flattened. `oms-new`'s own two documents already live under `docs/` and are indexed as current alongside the inherited ones.

**Files:**
- Create: `oms-new/docs/README.md`
- Create: 31 inherited `.md` files under `oms-new/docs/` mirroring `../oms/docs`
- Create: `oms-new/seed/source/WCAH_OMS_Seed_Workbook-V5.xlsx`
- Create: `oms-new/seed/source/README.md`
- Test: `oms-new/backend/tests/test_docs_corpus.py`

**Interfaces:**
- Consumes: nothing.
- Produces: the file paths above. Task 8's converter reads `seed/source/WCAH_OMS_Seed_Workbook-V5.xlsx`.

- [ ] **Step 1: Write the failing corpus test**

Create `oms-new/backend/tests/test_docs_corpus.py`:

```python
import re
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
DOCS = REPO / "docs"
INDEX = DOCS / "README.md"

# The two documents the design spec's header names as the authoritative model source.
AUTHORITATIVE = [
    "docs/superpowers/specs/2026-08-07-oms-modular-database-schema-design.md",
    "docs/oms-domain-model.md",
]


def markdown_files() -> list[str]:
    return sorted(
        p.relative_to(REPO).as_posix()
        for p in DOCS.rglob("*.md")
        if p != INDEX
    )


def test_inherited_corpus_is_complete():
    """31 inherited files plus oms-new's own spec, plan, and coverage-needs memo."""
    assert len(markdown_files()) == 34


def test_authoritative_documents_are_at_the_paths_the_spec_cites():
    for path in AUTHORITATIVE:
        assert (REPO / path).is_file(), f"{path} missing"


def test_every_document_appears_in_the_index():
    index = INDEX.read_text(encoding="utf-8")
    missing = [p for p in markdown_files() if Path(p).name not in index]
    assert missing == [], f"not listed in docs/README.md: {missing}"


def test_index_classifies_every_document():
    """Each listed document carries exactly one of the three D6 statuses."""
    index = INDEX.read_text(encoding="utf-8")
    rows = [line for line in index.splitlines() if line.startswith("| `")]
    assert len(rows) == len(markdown_files())
    for row in rows:
        statuses = [s for s in ("Current", "Superseded", "Mockup-only") if s in row]
        assert len(statuses) == 1, f"row must carry exactly one status: {row}"


def test_archived_workbook_is_present():
    workbook = REPO / "seed" / "source" / "WCAH_OMS_Seed_Workbook-V5.xlsx"
    assert workbook.is_file()
    assert workbook.stat().st_size > 30_000


def test_no_test_reads_the_workbook_outside_the_converter():
    """D4: the .xlsx is never read again by any tool or test."""
    offenders = []
    for path in (REPO / "backend").rglob("*.py"):
        if re.search(r"\.xlsx", path.read_text(encoding="utf-8")):
            if path.name != "test_docs_corpus.py":
                offenders.append(path.relative_to(REPO).as_posix())
    assert offenders == [], f"backend must not reference the workbook: {offenders}"
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `cd backend; python -m pytest tests/test_docs_corpus.py -v`
Expected: all six fail — `docs/README.md` does not exist and the corpus is not copied.

- [ ] **Step 3: Copy the corpus and the workbook**

```powershell
cd C:\Users\TomGibbings\Documents\GitHub\oms-plus\oms-new
Copy-Item -Path ..\oms\docs\* -Destination docs\ -Recurse -Force -Exclude 'seed'
New-Item -ItemType Directory -Force -Path seed\source
Copy-Item ..\oms\docs\seed\WCAH_OMS_Seed_Workbook-V5.xlsx seed\source\
Get-ChildItem -Recurse -File -Filter *.md docs | Measure-Object
```

Expected: 34 markdown files (31 inherited plus `oms-new`'s spec, plan, and coverage-needs memo, before `docs/README.md` is written). Verify `docs/oms-domain-model.md` and `docs/superpowers/specs/2026-08-07-oms-modular-database-schema-design.md` both exist. If `Copy-Item -Exclude` does not prune the `seed` directory (it filters leaf names, not directories on all PowerShell versions), remove `docs/seed/` afterwards with `Remove-Item -Recurse -Force docs\seed` — the workbook belongs in `seed/source/`, not in `docs/`.

- [ ] **Step 4: Write the index**

Create `oms-new/docs/README.md`. Status meanings, from D6: **Current** — describes `oms-new` as built or is an authoritative model source; **Superseded** — a later document in this corpus replaces it; **Mockup-only** — describes `../oms`, retained for reference, does not govern `oms-new`.

```markdown
# Documentation index

`oms-new` carries the whole `oms/docs` corpus. Nothing was deleted. This index marks
what still governs the project and what is history, because the drift in the corpus
is real (design decision D6).

- **Current** — governs `oms-new`, or is an authoritative model source for it.
- **Superseded** — a later document in this corpus replaces it.
- **Mockup-only** — describes the `../oms` React mockup. Retained for reference; it
  does not govern `oms-new`. In particular the JSONB document envelope, the hardcoded
  seed, and the in-source roster are explicitly rejected (D9, and spec section 1).

## oms-new's own documents

| Document | Status | Note |
|---|---|---|
| `2026-08-11-oms-new-foundation-slice-design.md` | Current | The spec. 23 decisions. Authoritative for this project. |
| `2026-08-11-oms-new-foundation-slice.md` | Current | The implementation plan for that spec. |
| `2026-08-11-coverage-needs-model.md` | Current | Coverage-needs rulings Q1–Q7. All closed. |

## Model sources

| Document | Status | Note |
|---|---|---|
| `2026-08-07-oms-modular-database-schema-design.md` | Current | Track D schema v2. Authoritative for the data model (D1), as amended by spec section 5.3. |
| `oms-domain-model.md` | Current | Ubiquitous language and invariants I1–I15. Authoritative. |
| `2026-08-05-track-d-rulings.md` | Current | The rulings that produced I1–I15. |
| `2026-08-05-oms-modular-database-schema-design.md` | Superseded | Replaced by the 2026-08-07 revision. |
| `2026-08-03-oms-approach-b-schema-design.md` | Superseded | Pre-Track-D schema exploration. |
| `2026-08-03-oms-approach-b-schema.md` | Superseded | Plan for the above. |

## Seed and conversion

| Document | Status | Note |
|---|---|---|
| `2026-08-05-oms-seed-workbook-design.md` | Current | Documents the V5 workbook's sheets and columns. Input to the converter. |
| `2026-08-05-oms-seed-workbook.md` | Mockup-only | Plan that produced the workbook exporter in `../oms`. |
| `2026-08-05-nonstandard-shift-hours-design.md` | Current | Origin of the rotation-cell `/HOURS` grammar. |
| `2026-08-05-nonstandard-shift-hours.md` | Mockup-only | Plan for the above, against the mockup. |
| `2026-08-05-drop-home-department.md` | Current | The work that produced invariant I10. |

## Mockup design and delivery

| Document | Status | Note |
|---|---|---|
| `2026-07-24-wcah-scheduler-mvp-design.md` | Mockup-only | Original mockup design. |
| `2026-07-24-wcah-scheduler-mvp.md` | Mockup-only | Plan for the above. |
| `2026-07-27-login-lock-screen-design.md` | Mockup-only | Authentication is punted (spec section 12 item 5). |
| `2026-07-27-login-lock-screen.md` | Mockup-only | Plan for the above. |
| `2026-08-01-oms-taxonomy-workflow-design.md` | Mockup-only | Superseded as a model by Track D; useful for product intent. |
| `2026-08-01-oms-taxonomy-workflow.md` | Mockup-only | Plan for the above. |
| `2026-08-01-oms-configuration-team-design.md` | Mockup-only | The mockup's Configuration and Team. Useful for product intent; no code carried across. |
| `2026-08-01-oms-configuration-team.md` | Mockup-only | Plan for the above. |
| `2026-07-31-oms-mockup-design.md` | Mockup-only | Mockup shell and navigation. |

## Mockup stabilization, conformance, and the document API

| Document | Status | Note |
|---|---|---|
| `2026-08-04-production-migration-design.md` | Mockup-only | Migration path for the mockup's JSONB envelope. Rejected for `oms-new` by D9. |
| `2026-08-04-sp0-sp1-stabilize-and-conformance-design.md` | Mockup-only | |
| `2026-08-04-sp0-sp1-stabilize-and-conformance.md` | Mockup-only | |
| `2026-08-04-conformance-triage-design.md` | Mockup-only | |
| `2026-08-04-conformance-triage.md` | Mockup-only | |
| `2026-08-04-conformance-triage-tom-queue.md` | Mockup-only | |
| `2026-08-06-oms-document-export-import-design.md` | Mockup-only | Export/import of the JSONB document. Not applicable (D9). |
| `2026-08-06-oms-document-export-import.md` | Mockup-only | |
| `2026-08-09-sp2a-document-api-design.md` | Mockup-only | The two-table JSONB API `oms-new` replaces. |
| `2026-08-09-sp2a-document-api.md` | Mockup-only | |
| `2026-08-07-tom-week-review-and-sp2-kickoff.md` | Current | Direction-setting review; context for why `oms-new` exists. |

## Closed by construction

PRD open item **A22** — the vocabulary collision where `CSR` names a department, a role,
and a title — cannot occur in `oms-new`. Canonical identifiers are namespaced by kind at
conversion time (D10), so `department_csr`, `role_csr`, and `title_csr` are three distinct
strings. Recorded here as spec section 6 requires.
```

Adjust the row set so it matches the files actually copied; the test in Step 1 fails if any file is unlisted or if a row carries zero or two statuses.

- [ ] **Step 5: Mark the archived workbook as provenance**

Create `oms-new/seed/source/README.md`:

```markdown
# Archived source

`WCAH_OMS_Seed_Workbook-V5.xlsx` is a frozen historical artifact (design decision D4).

It was converted **once** into `seed/wcah_seed.sql` by `tools/convert_workbook.py`. That
SQL file is the committed fixture and the only thing the application loads. Nothing in
`backend/app`, `frontend/src`, or any test reads this `.xlsx`. Only
`tools/convert_workbook.py` does, and it is not run in CI.

It is kept so the fixture's provenance is inspectable, not because anything depends on it.
Corrections to the data are made through the application (D5, D21), not by editing this
file and re-running the converter.
```

- [ ] **Step 6: Run the tests**

Run: `cd backend; python -m pytest tests/test_docs_corpus.py -v`
Expected: 6 passed.

- [ ] **Step 7: Commit**

```powershell
git add docs seed
git commit -m "docs: carry the oms docs corpus and archive the V5 workbook"
```

---

## Task 3: Canonical code map

**Files:**
- Create: `oms-new/tools/__init__.py`
- Create: `oms-new/tools/code_map.py`
- Create: `oms-new/tools/tests/__init__.py`
- Test: `oms-new/tools/tests/test_code_map.py`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `tools.code_map.NAMESPACE: uuid.UUID`
  - `tools.code_map.canonical_code(kind: str, source_code: str) -> str`
  - `tools.code_map.row_uuid(seed: str) -> uuid.UUID`
  - `tools.code_map.OVERRIDES: dict[tuple[str, str], str]`
  - `tools.code_map.CANONICAL_CODE_RE: re.Pattern[str]` — matches any namespaced code; used by the scan in Task 11.
  - `tools.code_map.KINDS: tuple[str, ...]` — `("organization", "location", "title", "day", "department", "role", "shift_pattern")`

- [ ] **Step 1: Write the failing tests**

Create `oms-new/tools/tests/test_code_map.py`:

```python
import uuid

import pytest

from tools.code_map import (
    CANONICAL_CODE_RE,
    KINDS,
    OVERRIDES,
    canonical_code,
    row_uuid,
)


@pytest.mark.parametrize(
    "kind,source,expected",
    [
        ("organization", "WCAH", "organization_wcah"),
        ("location", "LV", "location_lv"),
        ("location", "PB", "location_pb"),
        ("title", "CSR", "title_csr"),
        ("title", "DVM", "title_dvm"),
        ("day", "Sun", "day_sun"),
        ("day", "Sat", "day_sat"),
        ("department", "ROOM", "department_room"),
        ("department", "CSR", "department_csr"),
        ("department", "DENTAL", "department_dental"),
        ("role", "ROOM_TECH", "role_room_tech"),
        ("role", "CSR", "role_csr"),
        ("role", "CSR_ADMIN", "role_csr_admin"),
        ("role", "TECH_APPT", "role_tech_appt"),
        ("shift_pattern", "STANDARD_B", "shift_pattern_standard_b"),
    ],
)
def test_rule_namespaces_by_kind(kind, source, expected):
    assert canonical_code(kind, source) == expected


def test_the_csr_collision_is_dissolved():
    """The workbook's three CSRs are one string; the codes are three (D10)."""
    codes = {
        canonical_code("department", "CSR"),
        canonical_code("role", "CSR"),
        canonical_code("title", "CSR"),
    }
    assert len(codes) == 3


def test_the_hss_collision_is_dissolved():
    assert canonical_code("department", "HSS") != canonical_code("role", "HSS")


def test_override_table_fixes_techappt():
    """F10: the bare rule gives department_techappt beside role_tech_appt."""
    assert OVERRIDES == {("department", "TECHAPPT"): "tech_appt"}
    assert canonical_code("department", "TECHAPPT") == "department_tech_appt"


def test_unknown_kind_is_rejected():
    with pytest.raises(ValueError, match="unknown kind"):
        canonical_code("widget", "THING")


def test_blank_source_is_rejected():
    with pytest.raises(ValueError, match="empty source code"):
        canonical_code("role", "   ")


@pytest.mark.parametrize("kind", KINDS)
def test_every_kind_produces_a_code_the_scan_recognises(kind):
    assert CANONICAL_CODE_RE.fullmatch(canonical_code(kind, "EXAMPLE_ONE"))


def test_regex_does_not_match_engine_vocabulary():
    """Spec section 6: constraint type codes are untouched and must not be scanned."""
    for code in ("TARGET_HOURS", "REST_PATTERN", "GENERAL_FILL_MAX_OVERAGE_HOURS", "NOTE"):
        assert not CANONICAL_CODE_RE.fullmatch(code)


def test_row_uuid_is_deterministic():
    assert row_uuid("department_room") == row_uuid("department_room")


def test_row_uuid_differs_by_seed():
    assert row_uuid("department_csr") != row_uuid("role_csr")


def test_row_uuid_is_version_5():
    assert row_uuid("department_room").version == 5


def test_row_uuid_is_pinned():
    """Pins the namespace. If this changes, every id in the fixture changes."""
    assert row_uuid("department_room") == uuid.UUID("2c8ca87e-1dc7-5d0d-9d0f-32d24e1eb1cd")
```

The literal in the final test is a placeholder until Step 4 prints the real value; Step 5 replaces it with the printed UUID. That is the only value in this plan derived at implementation time, and it is pinned immediately so it can never drift.

- [ ] **Step 2: Run to verify failure**

Run: `cd backend; python -m pytest ../tools/tests/test_code_map.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'tools'`.

- [ ] **Step 3: Write the code map**

Create `oms-new/tools/__init__.py` and `oms-new/tools/tests/__init__.py` (both empty).

Create `oms-new/tools/code_map.py`:

```python
"""Canonical identifiers and deterministic ids (design decisions D10 and D13).

Source vocabulary is not adopted verbatim. In the V5 workbook the department named
CSR, the role named CSR, and the title CSR are three different things sharing one
string, and the role HSS shares its string with its department. Namespacing by kind
dissolves that at the conversion boundary rather than building machinery around it.
"""

import re
import uuid

KINDS: tuple[str, ...] = (
    "organization",
    "location",
    "title",
    "day",
    "department",
    "role",
    "shift_pattern",
)

# Source values the bare rule renders badly (spec section 6 provisions this table).
# The department code TECHAPPT would give `department_techappt` beside `role_tech_appt`.
OVERRIDES: dict[tuple[str, str], str] = {
    ("department", "TECHAPPT"): "tech_appt",
}

CANONICAL_CODE_RE = re.compile(rf"(?:{'|'.join(KINDS)})_[a-z0-9]+(?:_[a-z0-9]+)*")

# Deterministic and self-documenting: the namespace is itself a UUIDv5 over a fixed
# name, so it can be regenerated from this line alone.
NAMESPACE = uuid.uuid5(uuid.NAMESPACE_DNS, "oms-new.wcah")


def _snake(source_code: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9]+", "_", source_code.strip()).strip("_")
    return cleaned.lower()


def canonical_code(kind: str, source_code: str) -> str:
    """`{kind}_{snake_case(source_code)}`, with the override table applied first."""
    if kind not in KINDS:
        raise ValueError(f"unknown kind: {kind!r}; expected one of {KINDS}")
    if not source_code or not source_code.strip():
        raise ValueError(f"empty source code for kind {kind!r}")
    suffix = OVERRIDES.get((kind, source_code.strip()), _snake(source_code))
    if not suffix:
        raise ValueError(f"empty source code for kind {kind!r}")
    return f"{kind}_{suffix}"


def row_uuid(seed: str) -> uuid.UUID:
    """UUIDv5 over the fixed namespace.

    For rows with a canonical code the seed is that code, so the code is the natural
    key and the id follows from it. For rows without one the seed is a stable path
    such as `role_eligibility:alonzo-evelyn:ROOM_TECH`. Either way, re-running the
    converter produces byte-identical output and a test can name a row without
    guessing an id.
    """
    return uuid.uuid5(NAMESPACE, seed)
```

- [ ] **Step 4: Print the pinned UUID**

Run: `cd backend; python -c "from tools.code_map import row_uuid; print(row_uuid('department_room'))"`
Expected: a stable UUID, printed.

- [ ] **Step 5: Pin it and run the suite**

Replace the placeholder in `test_row_uuid_is_pinned` with the printed value.

Run: `cd backend; python -m pytest ../tools/tests/test_code_map.py -v`
Expected: all pass (24 parametrized cases plus 10 tests).

- [ ] **Step 6: Commit**

```powershell
git add tools
git commit -m "feat: add canonical code map with deterministic UUIDv5 ids"
```

---

## Task 4: `core` schema migration

Seven tables: `organization`, `location`, `title`, `employee`, `employee_title`, `external_identity`, `day_of_week`. `title` and `day_of_week` carry no `organization_id` — they are universal vocabulary rather than one hospital's invention (spec §5).

`organization.week_start_day_id` references `core.day_of_week`, and every other `core` table references `organization`. `day_of_week` therefore has to exist before `organization`, and the two are mutually referential only in the sense that `day_of_week` has no `organization_id` — so ordering is `day_of_week`, `organization`, then the rest. No circularity.

**Files:**
- Create: `oms-new/backend/alembic.ini`
- Create: `oms-new/backend/migrations/env.py`
- Create: `oms-new/backend/migrations/script.py.mako`
- Create: `oms-new/backend/migrations/versions/0001_core.py`
- Create: `oms-new/backend/app/core/__init__.py`
- Create: `oms-new/backend/app/core/models.py`
- Test: `oms-new/backend/tests/test_migrations.py`

**Interfaces:**
- Consumes: `app.db.Base`, `app.db.TimestampMixin` (Task 1).
- Produces: SQLAlchemy models `Organization`, `Location`, `Title`, `Employee`, `EmployeeTitle`, `ExternalIdentity`, `DayOfWeek` in `app.core.models`; Alembic revision `0001_core` with `down_revision = None`.

- [ ] **Step 1: Write the failing migration test**

Create `oms-new/backend/tests/test_migrations.py`:

```python
import re
import subprocess
import sys
from pathlib import Path

import pytest
from sqlalchemy import inspect, text

from app.db import engine

BACKEND = Path(__file__).resolve().parents[1]

CORE_TABLES = {
    "organization",
    "location",
    "title",
    "employee",
    "employee_title",
    "external_identity",
    "day_of_week",
}

# Spec section 5: every table carries organization_id except core.title and
# core.day_of_week, which are universal vocabulary. `organization` is excluded too —
# it is the tenancy seam itself, not a tenant-scoped table, and a self-referencing
# organization_id would be meaningless. Spec section 5.1 lists its columns as exactly
# code, name, week_start_day_id, active, and D3 reads "an organization table AND
# organization_id on every local table".
CORE_WITHOUT_ORG = {"organization", "title", "day_of_week"}


def alembic(*args: str) -> None:
    """Invoke Alembic through the running interpreter.

    A bare `alembic` is not resolvable here: pytest is started as
    `.venv\\Scripts\\python.exe -m pytest` without activating the venv, so the venv's
    `Scripts` directory is not on PATH and `shutil.which("alembic")` returns None.
    `sys.executable -m alembic` always works and cannot pick up a different install.
    """
    result = subprocess.run(
        [sys.executable, "-m", "alembic", *args],
        cwd=BACKEND,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stdout + result.stderr


@pytest.fixture(scope="module", autouse=True)
def migrated():
    alembic("upgrade", "head")
    yield


def test_core_tables_exist():
    tables = set(inspect(engine).get_table_names(schema="core"))
    assert CORE_TABLES <= tables


def test_organization_id_present_where_required():
    inspector = inspect(engine)
    for table in CORE_TABLES:
        columns = {c["name"] for c in inspector.get_columns(table, schema="core")}
        has_org = "organization_id" in columns
        assert has_org is (table not in CORE_WITHOUT_ORG), table


def test_every_core_table_has_id_and_timestamps():
    inspector = inspect(engine)
    for table in CORE_TABLES:
        columns = {c["name"] for c in inspector.get_columns(table, schema="core")}
        assert {"id", "created_at", "updated_at"} <= columns, table


def test_day_of_week_iso_index_is_unique():
    with engine.connect() as conn:
        rows = conn.execute(
            text(
                "SELECT indexdef FROM pg_indexes "
                "WHERE schemaname = 'core' AND tablename = 'day_of_week'"
            )
        ).scalars()
    assert any("UNIQUE" in r and "iso_index" in r for r in rows)


def test_downgrade_removes_everything_and_upgrade_restores_it():
    alembic("downgrade", "base")
    inspector = inspect(engine)
    assert "core" not in inspector.get_schema_names()
    alembic("upgrade", "head")
    assert CORE_TABLES <= set(inspect(engine).get_table_names(schema="core"))


DATA_MANIPULATION = re.compile(
    # The table name may be schema-qualified and quoted, as in `UPDATE core.title SET`,
    # so the identifier class has to admit dots and quotes, not just \w.
    r"op\.bulk_insert|INSERT\s+INTO|UPDATE\s+[\w.\"']+\s+SET|DELETE\s+FROM",
    re.IGNORECASE,
)


def test_migrations_create_structure_and_never_data():
    """Spec section 7: migrations create structure; `python -m app.seed.load` loads data.

    This cannot be checked by matching canonical codes. The grammar
    `{kind}_{snake_case}` also describes ordinary column names — `organization_id`,
    `title_id`, `day_of_week` — so a pattern scan flags every migration ever written
    (finding F11). What actually separates a structural migration from a data one is
    that it performs no data manipulation, which is what this asserts.
    """
    for path in (BACKEND / "migrations" / "versions").glob("*.py"):
        found = sorted(set(DATA_MANIPULATION.findall(path.read_text(encoding="utf-8"))))
        assert found == [], f"{path.name} manipulates data: {found}"
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend; python -m pytest tests/test_migrations.py -v`
Expected: FAIL — `alembic` is not configured; the subprocess returns non-zero.

- [ ] **Step 3: Configure Alembic**

Run: `cd backend; python -m alembic init migrations`

Then replace `oms-new/backend/alembic.ini`'s `sqlalchemy.url` line with an empty value (the URL comes from settings):

```ini
[alembic]
script_location = migrations
prepend_sys_path = .
version_path_separator = os
sqlalchemy.url =

[loggers]
keys = root,sqlalchemy,alembic

[handlers]
keys = console

[formatters]
keys = generic

[logger_root]
level = WARN
handlers = console
qualname =

[logger_sqlalchemy]
level = WARN
handlers =
qualname = sqlalchemy.engine

[logger_alembic]
level = INFO
handlers =
qualname = alembic

[handler_console]
class = StreamHandler
args = (sys.stderr,)
level = NOTSET
formatter = generic

[formatter_generic]
format = %(levelname)-5.5s [%(name)s] %(message)s
datefmt = %H:%M:%S
```

Replace `oms-new/backend/migrations/env.py`:

```python
from logging.config import fileConfig

from alembic import context
from sqlalchemy import text

from app.core import models as core_models  # noqa: F401  (registers metadata)
from app.db import Base, engine
from app.scheduling import models as scheduling_models  # noqa: F401

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def include_name(name, type_, parent_names):
    if type_ == "schema":
        return name in ("core", "scheduling")
    return True


def run_migrations_online() -> None:
    with engine.connect() as connection:
        connection.execute(text("CREATE SCHEMA IF NOT EXISTS core"))
        connection.execute(text("CREATE SCHEMA IF NOT EXISTS scheduling"))
        connection.commit()
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            include_schemas=True,
            include_name=include_name,
            version_table_schema="public",
        )
        with context.begin_transaction():
            context.run_migrations()


run_migrations_online()
```

`app.scheduling.models` is imported here from the start; create `oms-new/backend/app/scheduling/__init__.py` and an empty `oms-new/backend/app/scheduling/models.py` now so the import resolves, and fill it in Tasks 5 and 6.

- [ ] **Step 4: Write the `core` models**

Create `oms-new/backend/app/core/__init__.py` (empty).

Create `oms-new/backend/app/core/models.py`:

```python
import uuid
from datetime import date

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base, TimestampMixin

SCHEMA = "core"


class DayOfWeek(TimestampMixin, Base):
    """Seven rows. Universal vocabulary — no organization_id (spec section 5).

    `iso_index` is stable (Monday 1 ... Sunday 7). Display order is computed relative
    to `organization.week_start_day_id` and is never stored (D18).
    """

    __tablename__ = "day_of_week"
    __table_args__ = (
        UniqueConstraint("code", name="uq_day_of_week_code"),
        UniqueConstraint("iso_index", name="uq_day_of_week_iso_index"),
        CheckConstraint("iso_index BETWEEN 1 AND 7", name="ck_day_of_week_iso_index"),
        {"schema": SCHEMA},
    )

    code: Mapped[str] = mapped_column(String(64), nullable=False)
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    short_label: Mapped[str] = mapped_column(String(16), nullable=False)
    iso_index: Mapped[int] = mapped_column(Integer, nullable=False)


class Organization(TimestampMixin, Base):
    """One row: WCAH. The tenancy seam (D3) and owner of the week start day (D18)."""

    __tablename__ = "organization"
    __table_args__ = (
        UniqueConstraint("code", name="uq_organization_code"),
        {"schema": SCHEMA},
    )

    code: Mapped[str] = mapped_column(String(128), nullable=False)
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    week_start_day_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey(f"{SCHEMA}.day_of_week.id"), nullable=False
    )
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    week_start_day: Mapped[DayOfWeek] = relationship()


class Title(TimestampMixin, Base):
    """CSR, VA, RVT, DVM. Universal reference data — no organization_id."""

    __tablename__ = "title"
    __table_args__ = (
        UniqueConstraint("code", name="uq_title_code"),
        {"schema": SCHEMA},
    )

    code: Mapped[str] = mapped_column(String(128), nullable=False)
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    short_label: Mapped[str] = mapped_column(String(32), nullable=False)
    rank: Mapped[int] = mapped_column(Integer, nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class Location(TimestampMixin, Base):
    __tablename__ = "location"
    __table_args__ = (
        UniqueConstraint("organization_id", "code", name="uq_location_org_code"),
        {"schema": SCHEMA},
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey(f"{SCHEMA}.organization.id"), nullable=False
    )
    code: Mapped[str] = mapped_column(String(128), nullable=False)
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    short_label: Mapped[str] = mapped_column(String(32), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class Employee(TimestampMixin, Base):
    """Stable identity across termination and rehire.

    `primary_title_id` is deliberately absent (spec section 5.3): two places holding
    the current title is two places to disagree. Current title is a query against
    `employee_title`.
    """

    __tablename__ = "employee"
    __table_args__ = (
        CheckConstraint("status IN ('active', 'inactive')", name="ck_employee_status"),
        {"schema": SCHEMA},
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey(f"{SCHEMA}.organization.id"), nullable=False
    )
    display_name: Mapped[str] = mapped_column(String(256), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="active")


class EmployeeTitle(TimestampMixin, Base):
    """Effective-dated title history. `effective_to IS NULL` means current."""

    __tablename__ = "employee_title"
    __table_args__ = ({"schema": SCHEMA},)

    organization_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey(f"{SCHEMA}.organization.id"), nullable=False
    )
    employee_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey(f"{SCHEMA}.employee.id", ondelete="CASCADE"),
        nullable=False,
    )
    title_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey(f"{SCHEMA}.title.id"), nullable=False
    )
    effective_from: Mapped[date] = mapped_column(Date, nullable=False)
    effective_to: Mapped[date | None] = mapped_column(Date, nullable=True)


class ExternalIdentity(TimestampMixin, Base):
    """External system keys; carries the workbook's Paylocity name."""

    __tablename__ = "external_identity"
    __table_args__ = (
        UniqueConstraint("system", "external_key", name="uq_external_identity_key"),
        {"schema": SCHEMA},
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey(f"{SCHEMA}.organization.id"), nullable=False
    )
    employee_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey(f"{SCHEMA}.employee.id", ondelete="CASCADE"),
        nullable=False,
    )
    system: Mapped[str] = mapped_column(String(64), nullable=False)
    external_key: Mapped[str] = mapped_column(String(256), nullable=False)
```

- [ ] **Step 5: Autogenerate and review the migration**

Run:
```
cd backend
python -m alembic revision --autogenerate -m "core" --rev-id 0001_core
```

Open `migrations/versions/0001_core*.py`. Verify: `down_revision = None`; `day_of_week` is created before `organization`; `op.create_table` calls carry `schema="core"`; the `downgrade()` body drops all seven tables and ends with `op.execute("DROP SCHEMA IF EXISTS core CASCADE")`. Add the schema creation to the top of `upgrade()`:

```python
def upgrade() -> None:
    op.execute("CREATE SCHEMA IF NOT EXISTS core")
    # ... generated create_table calls, day_of_week first ...
```

- [ ] **Step 6: Run the migration test**

Run: `cd backend; python -m pytest tests/test_migrations.py -v`
Expected: 6 passed.

- [ ] **Step 7: Commit**

```powershell
git add backend/alembic.ini backend/migrations backend/app/core backend/app/scheduling backend/tests/test_migrations.py
git commit -m "feat: add core schema with Alembic migration"
```

---

## Task 5: `scheduling` catalog migration

Six tables: `shift_pattern`, `constraint_type`, `hospital_constraint`, `department`, `role`, `default_need`.

**Files:**
- Modify: `oms-new/backend/app/scheduling/models.py`
- Create: `oms-new/backend/migrations/versions/0002_scheduling_catalog.py`
- Modify: `oms-new/backend/tests/test_migrations.py`

**Interfaces:**
- Consumes: `app.core.models.Organization`, `Location`, `Title`, `DayOfWeek` (Task 4).
- Produces: `ShiftPattern`, `ConstraintType`, `HospitalConstraint`, `Department`, `Role`, `DefaultNeed` in `app.scheduling.models`; revision `0002_scheduling_catalog` with `down_revision = "0001_core"`.

- [ ] **Step 1: Extend the migration test**

Append to `oms-new/backend/tests/test_migrations.py`:

```python
CATALOG_TABLES = {
    "shift_pattern",
    "constraint_type",
    "hospital_constraint",
    "department",
    "role",
    "default_need",
}


def test_catalog_tables_exist():
    tables = set(inspect(engine).get_table_names(schema="scheduling"))
    assert CATALOG_TABLES <= tables


def test_every_catalog_table_carries_organization_id():
    inspector = inspect(engine)
    for table in CATALOG_TABLES:
        columns = {c["name"] for c in inspector.get_columns(table, schema="scheduling")}
        assert "organization_id" in columns, table
        assert {"id", "created_at", "updated_at"} <= columns, table


def test_default_need_has_no_formula_or_condition():
    """D16 and Q5: both columns are removed, not nullable."""
    columns = {
        c["name"] for c in inspect(engine).get_columns("default_need", schema="scheduling")
    }
    assert "formula" not in columns
    assert "condition" not in columns


def test_default_need_columns_are_all_not_null():
    """D22: the table admits no unevaluable state."""
    nullable = {
        c["name"]: c["nullable"]
        for c in inspect(engine).get_columns("default_need", schema="scheduling")
    }
    for column in ("department_id", "location_id", "day_of_week_id", "role_id",
                   "quantity", "weight"):
        assert nullable[column] is False, column


def check_definitions(table: str) -> dict[str, str]:
    with engine.connect() as conn:
        return {
            name: definition
            for name, definition in conn.execute(
                text(
                    "SELECT c.conname, pg_get_constraintdef(c.oid) FROM pg_constraint c "
                    "JOIN pg_class t ON t.oid = c.conrelid "
                    "JOIN pg_namespace n ON n.oid = t.relnamespace "
                    "WHERE n.nspname = 'scheduling' AND t.relname = :table "
                    "AND c.contype = 'c'"
                ),
                {"table": table},
            )
        }


def test_default_need_check_constraints_exist():
    """D22: the quantity and weight guards are real constraints, not conventions."""
    definitions = check_definitions("default_need")
    assert {"ck_default_need_quantity", "ck_default_need_weight"} <= set(definitions)


def test_weight_is_bounded_to_the_zero_to_hundred_model():
    """`AGENTS.md` §2 mandates a consistent 0–100 weighting model.

    A lower bound alone would leave the ceiling to convention. Asserting the definition
    rather than only the constraint's existence is what stops it silently reverting to
    `weight >= 0`.
    """
    for table, name in (
        ("default_need", "ck_default_need_weight"),
        ("hospital_constraint", "ck_hospital_constraint_weight"),
    ):
        definition = check_definitions(table).get(name)
        assert definition is not None, f"{table} is missing {name}"
        assert "100" in definition, f"{table}.{name} has no upper bound: {definition}"


def test_weight_defaults_to_forty():
    """F13: an unweighted item is a moderately important soft policy, not an unknown."""
    inspector = inspect(engine)
    for table in ("default_need", "hospital_constraint"):
        column = next(
            c
            for c in inspector.get_columns(table, schema="scheduling")
            if c["name"] == "weight"
        )
        assert column["nullable"] is False, table
        assert column["default"] is not None and "40" in str(column["default"]), (
            f"{table}.weight has no server default: {column['default']}"
        )


def test_default_need_rejects_weight_above_one_hundred():
    from sqlalchemy.exc import IntegrityError

    with engine.connect() as conn:
        with pytest.raises(IntegrityError) as caught:
            conn.execute(
                text(
                    "INSERT INTO scheduling.default_need "
                    "(id, organization_id, department_id, location_id, day_of_week_id, "
                    " role_id, quantity, weight) VALUES "
                    "(gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), "
                    " gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 1, 101)"
                )
            )
        assert "ck_default_need_weight" in str(caught.value), caught.value
        conn.rollback()


def test_default_need_rejects_zero_quantity():
    """D22 and coverage-needs Q2: removing a need means deleting the row.

    Asserting only `IntegrityError` would be vacuous. The foreign keys below are random
    UUIDs that match nothing, so the insert raises `IntegrityError` whether or not the
    quantity check exists. The constraint name must appear in the error for this test to
    prove anything at all.
    """
    from sqlalchemy.exc import IntegrityError

    with engine.connect() as conn:
        with pytest.raises(IntegrityError) as caught:
            conn.execute(
                text(
                    "INSERT INTO scheduling.default_need "
                    "(id, organization_id, department_id, location_id, day_of_week_id, "
                    " role_id, quantity, weight) VALUES "
                    "(gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), "
                    " gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 0, 80)"
                )
            )
        assert "ck_default_need_quantity" in str(caught.value), (
            "expected the quantity check to fire, not a foreign-key violation: "
            f"{caught.value}"
        )
        conn.rollback()


def test_role_has_short_label_and_sort_order():
    """D7 in practice: the ROLE_SHORT_LABEL map becomes a column."""
    columns = {c["name"] for c in inspect(engine).get_columns("role", schema="scheduling")}
    assert {"short_label", "sort_order", "min_title_id", "counts_toward_need"} <= columns


def test_deferred_tables_are_absent():
    """D14 defers department_constraint; spec section 3 excludes the rest."""
    tables = set(inspect(engine).get_table_names(schema="scheduling"))
    forbidden = {
        "department_constraint",
        "employee_constraint",
        "schedule_week",
        "day_plan",
        "need_override",
        "cell_override",
        "assignment",
        "schedule_run",
        "time_off_request",
    }
    assert tables & forbidden == set()
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend; python -m pytest tests/test_migrations.py -v`
Expected: the new tests fail — the `scheduling` tables do not exist.

- [ ] **Step 3: Write the catalog models**

Write `oms-new/backend/app/scheduling/models.py`:

```python
import uuid
from datetime import time
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    Time,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.models import SCHEMA as CORE
from app.db import Base, TimestampMixin

SCHEMA = "scheduling"


class ShiftPattern(TimestampMixin, Base):
    """Named shift definitions.

    WCAH's 10-hour standard is one row, not a property of the software (D17). A
    hospital on 8-hour shifts seeds a different row and changes nothing else.
    """

    __tablename__ = "shift_pattern"
    __table_args__ = (
        UniqueConstraint("organization_id", "code", name="uq_shift_pattern_org_code"),
        CheckConstraint("paid_hours > 0", name="ck_shift_pattern_paid_hours"),
        {"schema": SCHEMA},
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey(f"{CORE}.organization.id"), nullable=False
    )
    code: Mapped[str] = mapped_column(String(128), nullable=False)
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)
    unpaid_meal_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    paid_hours: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)


class ConstraintType(TimestampMixin, Base):
    """Registry of legal type codes. An unrecognized code fails loudly at load.

    These codes (TARGET_HOURS and friends) are engine vocabulary that translators
    legitimately register against, not per-hospital domain data, so they are not
    namespaced and the static scan does not cover them (spec section 6).
    """

    __tablename__ = "constraint_type"
    __table_args__ = (
        UniqueConstraint("organization_id", "code", name="uq_constraint_type_org_code"),
        {"schema": SCHEMA},
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey(f"{CORE}.organization.id"), nullable=False
    )
    code: Mapped[str] = mapped_column(String(128), nullable=False)
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    parameter_schema: Mapped[dict] = mapped_column(JSONB, nullable=False)
    machine_consumable: Mapped[bool] = mapped_column(Boolean, nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class HospitalConstraint(TimestampMixin, Base):
    """Rest pattern, target hours, overage cap, notes.

    The UI calls these Policies (D20); `constraint` stays the internal and engine
    vocabulary.
    """

    __tablename__ = "hospital_constraint"
    __table_args__ = (
        # `AGENTS.md` §2 mandates a consistent 0–100 weighting model. Bounding the column
        # is what makes that a property of the data rather than a convention the engine
        # has to trust. Ruled by Tom 2026-08-12.
        CheckConstraint("weight BETWEEN 0 AND 100", name="ck_hospital_constraint_weight"),
        {"schema": SCHEMA},
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey(f"{CORE}.organization.id"), nullable=False
    )
    type_code: Mapped[str] = mapped_column(String(128), nullable=False)
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    parameters: Mapped[dict] = mapped_column(JSONB, nullable=False)
    weight: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("40")
    )
    temporal_scope: Mapped[str | None] = mapped_column(String(32), nullable=True)
    machine_consumable: Mapped[bool] = mapped_column(Boolean, nullable=False)
    rationale: Mapped[str | None] = mapped_column(Text, nullable=True)
    owner: Mapped[str | None] = mapped_column(String(128), nullable=True)
    source_ref: Mapped[str | None] = mapped_column(String(256), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class Department(TimestampMixin, Base):
    """Eight departments. Ordering (PULL_ORDER) is out of scope (D14)."""

    __tablename__ = "department"
    __table_args__ = (
        UniqueConstraint("organization_id", "code", name="uq_department_org_code"),
        {"schema": SCHEMA},
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey(f"{CORE}.organization.id"), nullable=False
    )
    code: Mapped[str] = mapped_column(String(128), nullable=False)
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    roles: Mapped[list["Role"]] = relationship(
        back_populates="department", order_by="Role.sort_order"
    )


class Role(TimestampMixin, Base):
    """Twelve roles.

    `counts_toward_need` is a column rather than a hardcoded role-code test (I15).
    `short_label` is D7 in practice: `ROLE_SHORT_LABEL` at OmsScreens.jsx:14-29 becomes
    a column in PostgreSQL.
    """

    __tablename__ = "role"
    __table_args__ = (
        UniqueConstraint("organization_id", "code", name="uq_role_org_code"),
        {"schema": SCHEMA},
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey(f"{CORE}.organization.id"), nullable=False
    )
    department_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey(f"{SCHEMA}.department.id"), nullable=False
    )
    code: Mapped[str] = mapped_column(String(128), nullable=False)
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    short_label: Mapped[str] = mapped_column(String(32), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    min_title_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey(f"{CORE}.title.id"), nullable=True
    )
    counts_toward_need: Mapped[bool] = mapped_column(Boolean, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    department: Mapped[Department] = relationship(back_populates="roles")


class DefaultNeed(TimestampMixin, Base):
    """65 per-day coverage templates.

    Six columns of pure meaning and no nullable ambiguity (D22). Absent means no need;
    removing a need means deleting the row.
    """

    __tablename__ = "default_need"
    __table_args__ = (
        UniqueConstraint(
            "organization_id",
            "department_id",
            "location_id",
            "day_of_week_id",
            "role_id",
            name="uq_default_need_slot",
        ),
        CheckConstraint("quantity > 0", name="ck_default_need_quantity"),
        # `AGENTS.md` §2's 0–100 weighting model, enforced rather than assumed.
        CheckConstraint("weight BETWEEN 0 AND 100", name="ck_default_need_weight"),
        {"schema": SCHEMA},
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey(f"{CORE}.organization.id"), nullable=False
    )
    department_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey(f"{SCHEMA}.department.id"), nullable=False
    )
    location_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey(f"{CORE}.location.id"), nullable=False
    )
    day_of_week_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey(f"{CORE}.day_of_week.id"), nullable=False
    )
    role_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey(f"{SCHEMA}.role.id"), nullable=False
    )
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    weight: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("40")
    )
```

`text` comes from `sqlalchemy`; add it to the import list at the top of the file. The
server-side default of 40 is finding F13: an unweighted item is a moderately important
soft policy, never an unknown.

- [ ] **Step 4: Generate the migration**

Run:
```
cd backend
python -m alembic revision --autogenerate -m "scheduling catalog" --rev-id 0002_scheduling_catalog
```

Verify `down_revision = "0001_core"`, add `op.execute("CREATE SCHEMA IF NOT EXISTS scheduling")` at the top of `upgrade()`, and add `op.execute("DROP SCHEMA IF EXISTS scheduling CASCADE")` at the end of `downgrade()`. Confirm `department` is created before `role`, and `role` before `default_need`.

- [ ] **Step 5: Run the tests**

Run: `cd backend; python -m pytest tests/test_migrations.py -v`
Expected: 17 passed — Task 4's six plus the eleven appended here. (`check_definitions` is a
helper, not a test, so it does not add to the count.)

- [ ] **Step 6: Commit**

```powershell
git add backend/app/scheduling/models.py backend/migrations backend/tests/test_migrations.py
git commit -m "feat: add scheduling catalog tables"
```

---

## Task 6: `scheduling` employee migration

Five tables: `employee_profile`, `role_eligibility`, `location_eligibility`, `rotation`, `rotation_cell`. This completes all 18.

**Files:**
- Modify: `oms-new/backend/app/scheduling/models.py`
- Create: `oms-new/backend/migrations/versions/0003_scheduling_employee.py`
- Modify: `oms-new/backend/tests/test_migrations.py`

**Interfaces:**
- Consumes: everything from Tasks 4 and 5.
- Produces: `EmployeeProfile`, `RoleEligibility`, `LocationEligibility`, `Rotation`, `RotationCell`; revision `0003_scheduling_employee` with `down_revision = "0002_scheduling_catalog"`.

- [ ] **Step 1: Extend the migration test**

Append to `oms-new/backend/tests/test_migrations.py`:

```python
EMPLOYEE_TABLES = {
    "employee_profile",
    "role_eligibility",
    "location_eligibility",
    "rotation",
    "rotation_cell",
}


def test_all_eighteen_tables_exist():
    inspector = inspect(engine)
    core = set(inspector.get_table_names(schema="core"))
    scheduling = set(inspector.get_table_names(schema="scheduling"))
    assert len(CORE_TABLES) + len(CATALOG_TABLES) + len(EMPLOYEE_TABLES) == 18
    assert CORE_TABLES <= core
    assert (CATALOG_TABLES | EMPLOYEE_TABLES) <= scheduling


def test_default_shift_pattern_is_not_nullable():
    """D17: the paid-hours chain always terminates in data."""
    nullable = {
        c["name"]: c["nullable"]
        for c in inspect(engine).get_columns("employee_profile", schema="scheduling")
    }
    assert nullable["default_shift_pattern_id"] is False


def test_employee_profile_has_no_home_department():
    """I10: ranked role eligibility is the sole department preference source."""
    columns = {
        c["name"]
        for c in inspect(engine).get_columns("employee_profile", schema="scheduling")
    }
    assert "home_department_id" not in columns
    assert "unavailable_days" not in columns  # I11


def test_role_eligibility_has_no_auto_assign():
    """I12: eligibility drives placement; there is no flag."""
    columns = {
        c["name"]
        for c in inspect(engine).get_columns("role_eligibility", schema="scheduling")
    }
    assert "auto_assign" not in columns
    assert {"rank", "weight", "burnout_days"} <= columns


def test_role_eligibility_rank_is_nullable():
    """F2: three V5 cells are eligible with a blank rank."""
    nullable = {
        c["name"]: c["nullable"]
        for c in inspect(engine).get_columns("role_eligibility", schema="scheduling")
    }
    assert nullable["rank"] is True


def test_rotation_cell_kind_is_constrained():
    with engine.connect() as conn:
        definitions = conn.execute(
            text(
                "SELECT pg_get_constraintdef(oid) FROM pg_constraint "
                "WHERE conrelid = 'scheduling.rotation_cell'::regclass AND contype = 'c'"
            )
        ).scalars().all()
    joined = " ".join(definitions)
    for kind in ("ROLE", "OFF", "ANY"):
        assert kind in joined
    assert "role_id" in joined  # role_id required when kind = ROLE


def test_employee_weights_are_stored_and_bounded():
    """F13 for the last two weight columns, which were nullable before D23.

    Reuses `check_definitions` from the Task 5 block. Without this, half the weight
    columns would carry the 0–100 model only by assertion in the plan.
    """
    inspector = inspect(engine)
    for table in ("role_eligibility", "rotation_cell"):
        column = next(
            c
            for c in inspector.get_columns(table, schema="scheduling")
            if c["name"] == "weight"
        )
        assert column["nullable"] is False, table
        assert column["default"] is not None and "40" in str(column["default"]), (
            f"{table}.weight has no server default: {column['default']}"
        )
        definition = check_definitions(table).get(f"ck_{table}_weight")
        assert definition is not None, f"{table} is missing ck_{table}_weight"
        assert "100" in definition, f"{table}.weight is unbounded: {definition}"
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend; python -m pytest tests/test_migrations.py -v`
Expected: the six new tests fail.

- [ ] **Step 3: Append the employee-scoped models**

Append to `oms-new/backend/app/scheduling/models.py`:

```python
class EmployeeProfile(TimestampMixin, Base):
    """Scheduling facts for a core.employee.

    No home department (I10). `default_shift_pattern_id` is not nullable, so the
    paid-hours chain always terminates in data (D17). No employee-scope constraint
    rows exist; a weekly target is this column, a rest waiver is
    `consecutive_off_exempt`, and rationale is `notes` (I13).
    """

    __tablename__ = "employee_profile"
    __table_args__ = (
        CheckConstraint("target_hours >= 0", name="ck_employee_profile_target_hours"),
        {"schema": SCHEMA},
    )

    # `id` from TimestampMixin is the employee id: the profile is one-to-one.
    employee_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey(f"{CORE}.employee.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey(f"{CORE}.organization.id"), nullable=False
    )
    target_hours: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    home_location_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey(f"{CORE}.location.id"), nullable=False
    )
    default_shift_pattern_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey(f"{SCHEMA}.shift_pattern.id"), nullable=False
    )
    consecutive_off_exempt: Mapped[bool] = mapped_column(Boolean, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    external_ref: Mapped[str | None] = mapped_column(String(256), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class RoleEligibility(TimestampMixin, Base):
    """The workbook's wide 24-column grid, normalized. No auto_assign (I12).

    `rank` is nullable because three V5 cells are eligible with a blank rank.
    Neither `weight` nor `burnout_days` has a workbook source. `burnout_days` stays null
    after conversion; `weight` takes the stored default of 40, a moderately important
    soft policy (F13). Both become editable in sub-project 2.
    """

    __tablename__ = "role_eligibility"
    __table_args__ = (
        UniqueConstraint("employee_id", "role_id", name="uq_role_eligibility_pair"),
        CheckConstraint("rank IS NULL OR rank > 0", name="ck_role_eligibility_rank"),
        # F13: 0–100, soft below 51. The workbook has no source for this column, so
        # every converted row takes the default 40 rather than being left unknown.
        CheckConstraint(
            "weight BETWEEN 0 AND 100", name="ck_role_eligibility_weight"
        ),
        {"schema": SCHEMA},
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey(f"{CORE}.organization.id"), nullable=False
    )
    employee_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey(f"{CORE}.employee.id", ondelete="CASCADE"),
        nullable=False,
    )
    role_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey(f"{SCHEMA}.role.id"), nullable=False
    )
    rank: Mapped[int | None] = mapped_column(Integer, nullable=True)
    weight: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("40")
    )
    burnout_days: Mapped[int | None] = mapped_column(Integer, nullable=True)


class LocationEligibility(TimestampMixin, Base):
    """Who may work each location."""

    __tablename__ = "location_eligibility"
    __table_args__ = (
        UniqueConstraint("employee_id", "location_id", name="uq_location_eligibility_pair"),
        {"schema": SCHEMA},
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey(f"{CORE}.organization.id"), nullable=False
    )
    employee_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey(f"{CORE}.employee.id", ondelete="CASCADE"),
        nullable=False,
    )
    location_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey(f"{CORE}.location.id"), nullable=False
    )
    rank: Mapped[int | None] = mapped_column(Integer, nullable=True)


class Rotation(TimestampMixin, Base):
    """Sequence and anchor date. Sequence 1 is the standing week.

    `anchor_date` must fall on `organization.week_start_day_id` (D18). That is
    validated by the converter and by a seed test against the column, never against a
    hardcoded Sunday.
    """

    __tablename__ = "rotation"
    __table_args__ = (
        UniqueConstraint("employee_id", "sequence", name="uq_rotation_employee_sequence"),
        CheckConstraint("sequence > 0", name="ck_rotation_sequence"),
        {"schema": SCHEMA},
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey(f"{CORE}.organization.id"), nullable=False
    )
    employee_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey(f"{CORE}.employee.id", ondelete="CASCADE"),
        nullable=False,
    )
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    anchor_date: Mapped[date] = mapped_column(Date, nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    cells: Mapped[list["RotationCell"]] = relationship(back_populates="rotation")


class RotationCell(TimestampMixin, Base):
    """The parsed cell grammar `CODE[@LOCATION][/HOURS][ (note)]`.

    Rows exist only for ROLE and OFF. A day with no row is ANY — available but not
    pinned (I3), the same reading of absence that D22 gives `default_need`.
    """

    __tablename__ = "rotation_cell"
    __table_args__ = (
        UniqueConstraint("rotation_id", "day_of_week_id", name="uq_rotation_cell_day"),
        CheckConstraint("kind IN ('ROLE', 'OFF', 'ANY')", name="ck_rotation_cell_kind"),
        CheckConstraint(
            "(kind = 'ROLE') = (role_id IS NOT NULL)", name="ck_rotation_cell_role_id"
        ),
        # F13: rotation cells carry a weight too, and had no bound before.
        CheckConstraint("weight BETWEEN 0 AND 100", name="ck_rotation_cell_weight"),
        CheckConstraint(
            "paid_hours IS NULL OR paid_hours > 0", name="ck_rotation_cell_paid_hours"
        ),
        {"schema": SCHEMA},
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey(f"{CORE}.organization.id"), nullable=False
    )
    rotation_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey(f"{SCHEMA}.rotation.id", ondelete="CASCADE"),
        nullable=False,
    )
    day_of_week_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey(f"{CORE}.day_of_week.id"), nullable=False
    )
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    role_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey(f"{SCHEMA}.role.id"), nullable=True
    )
    location_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey(f"{CORE}.location.id"), nullable=True
    )
    paid_hours: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    start_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    end_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    time_note: Mapped[str | None] = mapped_column(String(128), nullable=True)
    label: Mapped[str | None] = mapped_column(String(128), nullable=True)
    weight: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("40")
    )

    rotation: Mapped[Rotation] = relationship(back_populates="cells")
```

Two imports at the top of the file need extending, not one. Add `date` to the `datetime`
import — `from datetime import date, time` — and add `Date` to the SQLAlchemy import list
alongside `Time`, for `rotation.anchor_date`. Task 5's version of this file imports `Time`
and `Numeric` but not `Date`, so without the second change `mapped_column(Date, ...)`
raises `NameError`.

- [ ] **Step 4: Generate the migration**

Run:
```
cd backend
python -m alembic revision --autogenerate -m "scheduling employee" --rev-id 0003_scheduling_employee
```

Verify `down_revision = "0002_scheduling_catalog"` and that `rotation` is created before `rotation_cell`.

- [ ] **Step 5: Run the tests**

Run: `cd backend; python -m pytest tests/test_migrations.py -v`
Expected: 24 passed — 17 after Task 5 plus the seven appended here.

- [ ] **Step 6: Commit**

```powershell
git add backend/app/scheduling/models.py backend/migrations backend/tests/test_migrations.py
git commit -m "feat: add employee-scoped scheduling tables, completing all 18"
```

---

## Task 7: Rotation cell parser

The only bespoke parser in the project. Grammar: `CODE[@LOCATION][/HOURS][ (note)]`, plus the bare tokens `OFF` and blank.

Per F7, the V5 workbook exercises only 11 of the grammar's shapes. The parser implements all of it because the authoring surface in sub-project 2 requires it; the workbook corpus is one test and the grammar coverage is another.

**Files:**
- Create: `oms-new/tools/rotation_cells.py`
- Test: `oms-new/tools/tests/test_rotation_cells.py`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `tools.rotation_cells.ParsedCell` — frozen dataclass with fields `kind: str`, `role_code: str | None`, `location_code: str | None`, `paid_hours: Decimal | None`, `time_note: str | None`, `label: str | None`
  - `tools.rotation_cells.parse_cell(raw: str | None) -> ParsedCell`
  - `tools.rotation_cells.WORKBOOK_CELL_VALUES: tuple[str, ...]` — the 11 distinct V5 values

- [ ] **Step 1: Write the failing tests**

Create `oms-new/tools/tests/test_rotation_cells.py`:

```python
from decimal import Decimal

import pytest

from tools.rotation_cells import WORKBOOK_CELL_VALUES, parse_cell


def test_blank_is_any():
    """I3: a blank cell carries no constraint — the day is flexible."""
    for raw in ("", "   ", None):
        cell = parse_cell(raw)
        assert cell.kind == "ANY"
        assert cell.role_code is None


def test_off_is_off():
    cell = parse_cell("OFF")
    assert cell.kind == "OFF"
    assert cell.role_code is None
    assert cell.location_code is None


def test_bare_code_is_a_role_at_the_home_location():
    cell = parse_cell("ROOM_TECH")
    assert cell.kind == "ROLE"
    assert cell.role_code == "ROOM_TECH"
    assert cell.location_code is None
    assert cell.paid_hours is None


def test_at_location_pins_the_day_away_from_home():
    """I14: a day worked at PB is not Linda Vista coverage."""
    cell = parse_cell("SURGERY_TECH@PB")
    assert cell.kind == "ROLE"
    assert cell.role_code == "SURGERY_TECH"
    assert cell.location_code == "PB"


def test_slash_hours_overrides_the_shift_pattern():
    cell = parse_cell("TECH_NC/5.5")
    assert cell.role_code == "TECH_NC"
    assert cell.paid_hours == Decimal("5.5")


def test_note_is_captured_as_a_time_note():
    cell = parse_cell("TECH_NC/5.5 (until 1:00 PM)")
    assert cell.role_code == "TECH_NC"
    assert cell.paid_hours == Decimal("5.5")
    assert cell.time_note == "until 1:00 PM"
    assert cell.label is None


def test_equals_note_is_an_exact_display_label():
    cell = parse_cell("TECH_NC/5.5 (= Tech NC)")
    assert cell.label == "Tech NC"
    assert cell.time_note is None


def test_all_three_modifiers_together():
    cell = parse_cell("ROOM_TECH@PB/8 (7:30-4:30)")
    assert cell.kind == "ROLE"
    assert cell.role_code == "ROOM_TECH"
    assert cell.location_code == "PB"
    assert cell.paid_hours == Decimal("8")
    assert cell.time_note == "7:30-4:30"


def test_whitespace_is_tolerated():
    assert parse_cell("  SURGERY_TECH@PB  ").location_code == "PB"


def test_off_with_a_modifier_is_rejected():
    with pytest.raises(ValueError, match="OFF takes no modifiers"):
        parse_cell("OFF@PB")


def test_a_role_code_beginning_with_off_is_not_mistaken_for_off():
    """The OFF check matches the whole token, not a prefix.

    No current role starts with OFF, but this parser is also the authoring surface for
    sub-project 2, where OFFICE_ADMIN is an entirely plausible code.
    """
    cell = parse_cell("OFFICE_ADMIN")
    assert cell.kind == "ROLE"
    assert cell.role_code == "OFFICE_ADMIN"


def test_zero_hours_is_rejected():
    with pytest.raises(ValueError, match="paid hours must be greater than zero"):
        parse_cell("ROOM_TECH/0")


def test_unparseable_cell_is_rejected_loudly():
    with pytest.raises(ValueError, match="cannot parse rotation cell"):
        parse_cell("ROOM TECH !!")


@pytest.mark.parametrize("raw", WORKBOOK_CELL_VALUES)
def test_every_distinct_workbook_value_parses(raw):
    """Spec section 7: unit tests over every distinct cell value in the workbook."""
    parse_cell(raw)


def test_workbook_corpus_is_the_eleven_values_v5_actually_contains():
    assert set(WORKBOOK_CELL_VALUES) == {
        "",
        "OFF",
        "ADMIN",
        "CSR_ADMIN",
        "DENTAL_TECH_SR",
        "HSS",
        "PHARM",
        "ROOM_TECH",
        "SURGERY_TECH",
        "SURGERY_TECH@PB",
        "TECH_APPT",
    }


def test_no_workbook_cell_overrides_paid_hours():
    """F7: every rotation_cell.paid_hours is null, so D17's chain always terminates
    in employee_profile.default_shift_pattern_id."""
    assert all(parse_cell(raw).paid_hours is None for raw in WORKBOOK_CELL_VALUES)
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend; python -m pytest ../tools/tests/test_rotation_cells.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'tools.rotation_cells'`.

- [ ] **Step 3: Write the parser**

Create `oms-new/tools/rotation_cells.py`:

```python
"""Parser for the rotation day-cell grammar.

    CODE[@LOCATION][/HOURS][ (note)]   a worked day
    OFF                                 unavailable
    (blank)                             ANY — no constraint that day (I3)

A `(= text)` note is an exact-display override and becomes `label`; any other note
becomes `time_note`.
"""

import re
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation

# The eleven distinct values in Employee_Rotations across all 273 day cells of
# WCAH_OMS_Seed_Workbook-V5.xlsx. No cell uses /HOURS and no cell uses a note.
WORKBOOK_CELL_VALUES: tuple[str, ...] = (
    "",
    "OFF",
    "ADMIN",
    "CSR_ADMIN",
    "DENTAL_TECH_SR",
    "HSS",
    "PHARM",
    "ROOM_TECH",
    "SURGERY_TECH",
    "SURGERY_TECH@PB",
    "TECH_APPT",
)

_CELL = re.compile(
    r"^(?P<code>[A-Za-z0-9_]+)"
    r"(?:@(?P<location>[A-Za-z0-9_]+))?"
    r"(?:/(?P<hours>\d+(?:\.\d+)?))?"
    r"(?P<notes>(?:\s*\([^()]*\))*)$"
)
_NOTE = re.compile(r"\(([^()]*)\)")
_OFF_WITH_MODIFIER = re.compile(r"^OFF\s*[@/(]", re.IGNORECASE)


@dataclass(frozen=True)
class ParsedCell:
    kind: str  # ROLE | OFF | ANY
    role_code: str | None = None
    location_code: str | None = None
    paid_hours: Decimal | None = None
    time_note: str | None = None
    label: str | None = None


def parse_cell(raw: str | None) -> ParsedCell:
    text = "" if raw is None else str(raw).strip()
    if not text:
        return ParsedCell(kind="ANY")

    if text.upper() == "OFF":
        return ParsedCell(kind="OFF")
    # Only a modifier directly after OFF is an OFF-with-modifier error. Testing
    # `startswith("OFF")` would reject a legitimate future role code such as
    # OFFICE_ADMIN, and this parser also serves sub-project 2's authoring surface.
    if _OFF_WITH_MODIFIER.match(text):
        raise ValueError(f"OFF takes no modifiers: {raw!r}")

    match = _CELL.match(text)
    if not match:
        raise ValueError(f"cannot parse rotation cell: {raw!r}")

    hours: Decimal | None = None
    if match.group("hours"):
        try:
            hours = Decimal(match.group("hours"))
        except InvalidOperation as exc:  # pragma: no cover - regex prevents this
            raise ValueError(f"cannot parse rotation cell: {raw!r}") from exc
        if hours <= 0:
            raise ValueError(f"paid hours must be greater than zero: {raw!r}")

    time_note: str | None = None
    label: str | None = None
    for note in _NOTE.findall(match.group("notes") or ""):
        note = note.strip()
        if note.startswith("="):
            label = note[1:].strip()
        else:
            time_note = note

    return ParsedCell(
        kind="ROLE",
        role_code=match.group("code"),
        location_code=match.group("location"),
        paid_hours=hours,
        time_note=time_note,
        label=label,
    )
```

- [ ] **Step 4: Run the tests**

Run: `cd backend; python -m pytest ../tools/tests/test_rotation_cells.py -v`
Expected: 26 collected and passing — 15 tests plus 11 parametrized cases.

- [ ] **Step 5: Commit**

```powershell
git add tools/rotation_cells.py tools/tests/test_rotation_cells.py
git commit -m "feat: add rotation cell grammar parser"
```

---

## Task 8: Converter — reference data and catalogs

`tools/convert_workbook.py` reads `seed/source/WCAH_OMS_Seed_Workbook-V5.xlsx` and writes `seed/wcah_seed.sql`. It runs once by hand; its output is committed; nothing in CI runs it.

This task produces the reference and catalog half: `organization`, `day_of_week`, `location`, `title`, `shift_pattern`, `constraint_type`, `department`, `role`, `hospital_constraint`, `default_need`.

**Files:**
- Create: `oms-new/tools/convert_workbook.py`
- Create: `oms-new/seed/CONVERSION.md`
- Create: `oms-new/seed/wcah_seed.sql` (generated)
- Create: `oms-new/seed/domain_codes.json` (generated — findings F11 and F12)
- Test: `oms-new/backend/tests/test_seed_counts.py`
- Test: `oms-new/tools/tests/test_code_registry.py`
- Test: `oms-new/tools/tests/test_constraint_parameters.py`

**Interfaces:**
- Consumes: `tools.code_map.canonical_code`, `row_uuid`; `tools.rotation_cells.parse_cell` (used in Task 9).
- Produces:
  - `tools.convert_workbook.convert(workbook_path: Path, out_path: Path) -> dict[str, int]` — returns a table-name-to-row-count map.
  - `tools.convert_workbook.CodeRegistry` — see below.
  - `tools.convert_workbook.sql_literal(value) -> str`
  - `tools.convert_workbook.snake_case_parameter_key(key: str) -> str`
  - `tools.convert_workbook.normalize_parameter_keys(parameters: dict[str, object]) -> dict[str, object]`
  - `tools.convert_workbook.validate_constraint_parameter_keys(rows: list[list]) -> None`
  - `tools.convert_workbook.read_sheet(wb, name) -> list[dict[str, object]]`
  - `tools.convert_workbook.ROLE_SHORT_LABEL: dict[str, str]`
  - `tools.convert_workbook.DAYS: tuple[tuple[str, str, str, int], ...]` — `(source, name, short_label, iso_index)`

**The code registry (findings F11 and F12).** Every canonical code the converter mints goes through one registry, which is the single source of truth for both the `code` column values in the SQL and the declared manifest `seed/domain_codes.json`. Nothing downstream recovers codes by pattern-matching the fixture.

`CodeRegistry` is defined with the other shared machinery in Step 3, and `convert()` creates exactly one instance and calls `registry.register(kind, source)` in place of a direct `canonical_code(...)` at all seven minting sites: day, organization, title, location, shift_pattern, department and role. **`constraint_type.code` is deliberately not registered** — those codes are engine vocabulary rather than namespaced canonical codes (spec §6), which is also why `CANONICAL_CODE_RE` does not match them.

`convert()` then writes `seed/domain_codes.json` from `registry.manifest()` in the same run that writes the SQL. Because both outputs come from one registry they cannot drift.

`tools/tests/test_code_registry.py` covers the registry as a unit, with no workbook involved: registering the same `(kind, source_code)` twice is idempotent; registering two different source spellings that collapse to one code raises `ValueError` naming both; the manifest is sorted by code; and every manifest entry `fullmatch`es `CANONICAL_CODE_RE`. Test the collision path with the pair proven to collide, `("role", "CSR_ADMIN")` and `("role", "CSR-Admin")`.

Add to `test_seed_counts.py` a check that every `code` the manifest declares actually appears as a `code` value in the generated SQL, and that the manifest's count equals the number of catalog rows carrying a canonical code. That cross-check is what catches a registry that silently forgets to register something.

**Parameter key normalization and consistency guards (D12).** Normalize every key in
workbook-sourced `Hospital_Constraints.parameters_json` from camelCase to snake_case at
the read boundary. Use a parameter-specific helper because `tools.code_map._snake` is
separator-oriented and would silently turn `minConsecutiveOff` into
`minconsecutiveoff`. Refuse to build if two distinct source keys collapse to one
normalized key, naming both source keys, or if a hospital constraint's actual key set
does not exactly equal the `parameter_schema` declared by its constraint type, naming
the constraint and both key sets. Cover both successful and failing paths in
`tools/tests/test_constraint_parameters.py`.

- [ ] **Step 1: Write the failing row-count test**

Create `oms-new/backend/tests/test_seed_counts.py`. This is the conversion guard from spec §7, extended with the counts verified against V5 during planning.

```python
import json
from pathlib import Path

import pytest
from sqlalchemy import text

from app.db import engine

REPO = Path(__file__).resolve().parents[2]
FIXTURE = REPO / "seed" / "wcah_seed.sql"
MANIFEST = REPO / "seed" / "domain_codes.json"

# 1 organization + 7 days + 4 titles + 2 locations + 1 shift pattern + 8 departments
# + 12 roles. Constraint type codes are engine vocabulary and are NOT canonical codes,
# so they are absent by design (spec §6). Confirm on the first real run and reconcile
# any difference in seed/CONVERSION.md before changing this number.
EXPECTED_CODE_COUNT = 35

# Verified against WCAH_OMS_Seed_Workbook-V5.xlsx. If the converter ever quietly
# drops a sheet, or a ruling changes, this table fails.
# This task converts the reference and catalog half only — ten tables. Task 9 appends the
# employee half and extends this map to all eighteen. Listing all eighteen here would make
# Task 8 impossible to finish green, since the other eight are legitimately still empty.
EXPECTED_ROWS = {
    "core.organization": 1,
    "core.day_of_week": 7,
    "core.location": 2,
    "core.title": 4,
    "scheduling.shift_pattern": 1,
    "scheduling.constraint_type": 4,
    "scheduling.hospital_constraint": 4,
    "scheduling.department": 8,
    "scheduling.role": 12,
    "scheduling.default_need": 65,
}


@pytest.fixture(scope="module")
def seeded():
    """Migrate from scratch and load the fixture, once for this module.

    The SQL is executed directly rather than through `python -m app.seed.load`. That
    loader arrives in Task 10, which consumes the fixture this task generates — so
    depending on it here would make the two tasks circular and leave Task 8 unable to
    go green on its own. Task 10 tests the loader through its own suite, and
    deliberately does not rewrite this fixture to use it.
    """
    import subprocess
    import sys

    backend = REPO / "backend"
    for args in (
        [sys.executable, "-m", "alembic", "downgrade", "base"],
        [sys.executable, "-m", "alembic", "upgrade", "head"],
    ):
        result = subprocess.run(args, cwd=backend, capture_output=True, text=True)
        assert result.returncode == 0, result.stdout + result.stderr

    with engine.begin() as conn:
        conn.execute(text(FIXTURE.read_text(encoding="utf-8")))
    yield


def test_fixture_is_committed():
    assert FIXTURE.is_file(), "seed/wcah_seed.sql must be committed"


def test_the_manifest_and_the_fixture_agree():
    """F11: both come from one registry, so a disagreement means the wiring broke.

    Checks the direction that matters — every declared code is actually inserted. The
    reverse direction is covered by `EXPECTED_CODE_COUNT`, since a code inserted without
    being registered would leave the manifest short.
    """
    assert MANIFEST.is_file(), "seed/domain_codes.json must be committed"
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    sql = FIXTURE.read_text(encoding="utf-8")

    declared = [entry["code"] for entry in manifest["codes"]]
    missing = [code for code in declared if f"'{code}'" not in sql]
    assert missing == [], f"declared in the manifest but never inserted: {missing}"
    assert len(declared) == len(set(declared)), "the manifest repeats a code"
    assert len(declared) == EXPECTED_CODE_COUNT


def test_the_manifest_excludes_engine_vocabulary():
    """Spec §6: constraint type codes are untouched, so they are not canonical codes."""
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    declared = {entry["code"] for entry in manifest["codes"]}
    for code in ("TARGET_HOURS", "REST_PATTERN", "GENERAL_FILL_MAX_OVERAGE_HOURS"):
        assert code not in declared


def test_converter_default_weight_matches_the_schema():
    """D23's 40 is written in two places; this is what stops them drifting apart.

    The schema's `server_default` fills `role_eligibility` and `rotation_cell`, whose
    weight the workbook never supplies, while the converter's constant fills a blank
    weight cell on the two tables that do have a source.
    """
    from sqlalchemy import inspect
    from tools.convert_workbook import DEFAULT_WEIGHT

    column = next(
        c
        for c in inspect(engine).get_columns("default_need", schema="scheduling")
        if c["name"] == "weight"
    )
    assert str(DEFAULT_WEIGHT) in str(column["default"]), (
        f"converter default {DEFAULT_WEIGHT} disagrees with schema {column['default']}"
    )


@pytest.mark.parametrize("table,expected", sorted(EXPECTED_ROWS.items()))
def test_row_counts(seeded, table, expected):
    with engine.connect() as conn:
        actual = conn.execute(text(f"SELECT count(*) FROM {table}")).scalar_one()
    assert actual == expected


def test_the_needs_count_reflects_the_two_dropped_artifact_rows(seeded):
    """Coverage-needs Q2: the workbook's 67 rows become 65. The two Dental Junior
    Tech quantity-zero rows were an artifact of laying the full week out."""
    with engine.connect() as conn:
        total = conn.execute(text("SELECT count(*) FROM scheduling.default_need")).scalar_one()
    assert total == 65


def test_every_converted_table_is_populated(seeded):
    """Task 9 extends EXPECTED_ROWS to all eighteen and asserts the total there."""
    assert len(EXPECTED_ROWS) == 10
    assert all(count > 0 for count in EXPECTED_ROWS.values())
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend; python -m pytest tests/test_seed_counts.py -v`
Expected: FAIL — `seed/wcah_seed.sql` does not exist.

- [ ] **Step 3: Write the converter's shared machinery and reference data**

Create `oms-new/tools/convert_workbook.py`:

```python
"""One-time conversion of WCAH_OMS_Seed_Workbook-V5.xlsx into seed/wcah_seed.sql.

Run by hand. Its output is committed and the application never depends on openpyxl or
on the .xlsx existing (design decision D4). Every assumption this file encodes is
written up in seed/CONVERSION.md.

    python -m tools.convert_workbook
"""

import argparse
import json
import re
from datetime import date, time
from decimal import Decimal
from pathlib import Path

import openpyxl

from tools.code_map import canonical_code, row_uuid

# `parse_cell` is NOT imported here. It is first used in Task 9, and an unused import
# fails ruff's F401.

REPO = Path(__file__).resolve().parents[1]
WORKBOOK = REPO / "seed" / "source" / "WCAH_OMS_Seed_Workbook-V5.xlsx"
FIXTURE = REPO / "seed" / "wcah_seed.sql"

ORGANIZATION_SOURCE_CODE = "WCAH"
ORGANIZATION_NAME = "West Coast Animal Hospital"
WEEK_START_SOURCE_DAY = "Sun"

# D23: 0–50 is soft policy, 51–100 is hard, and anything unassigned is 40. This mirrors
# the `server_default` on every weight column; `test_converter_default_weight_matches_the
# _schema` fails if the two ever drift. Columns whose weight has no workbook source at all
# (role_eligibility, rotation_cell) are omitted from their INSERT entirely so the schema
# supplies the value and 40 is written down in exactly one place.
DEFAULT_WEIGHT = 40

# (source token, name, short_label, iso_index). iso_index is stable Monday 1 ...
# Sunday 7; display order is computed from organization.week_start_day_id (D18).
DAYS: tuple[tuple[str, str, str, int], ...] = (
    ("Mon", "Monday", "Mon", 1),
    ("Tue", "Tuesday", "Tue", 2),
    ("Wed", "Wednesday", "Wed", 3),
    ("Thu", "Thursday", "Thu", 4),
    ("Fri", "Friday", "Fri", 5),
    ("Sat", "Saturday", "Sat", 6),
    ("Sun", "Sunday", "Sun", 7),
)

# The one value the workbook does not supply. Seeded from the ROLE_SHORT_LABEL map at
# ../oms/src/ui/oms/OmsScreens.jsx:14-29, which is the only place this display
# knowledge currently exists. A legitimate one-time conversion input (spec section 7),
# and editable in the application thereafter.
ROLE_SHORT_LABEL: dict[str, str] = {
    "ROOM_TECH": "Room",
    "TECH_NC": "Float",
    "SURGERY_TECH": "Surg",
    "DENTAL_TECH_JR": "Dental 1-3",
    "DENTAL_TECH_SR": "Dental 4-5",
    "DENTAL_MONITOR": "Monitor",
    "HSS": "HSS",
    "PHARM": "Pharm",
    "CSR": "CSR",
    "CSR_ADMIN": "CSR Admin",
    "TECH_APPT": "Tech Appt",
    "ADMIN": "Admin",
}

# The second value the workbook does not supply (finding F4). There is no
# Shift_Patterns sheet, but D17 makes employee_profile.default_shift_pattern_id
# non-nullable. Taken from ../oms/src/seed/fromWorkbook.js:1050-1058.
SHIFT_PATTERN = {
    "source_code": "STANDARD_B",
    "name": "Standard 10-hour day",
    "start_time": time(7, 30),
    "end_time": time(18, 30),
    "unpaid_meal_minutes": 30,
    "paid_hours": Decimal("10"),
}

# The third (finding F5). The Employees sheet dates no title. This is a sentinel, not
# a hire date, and the Team screen does not display it.
TITLE_EFFECTIVE_FROM = date(2020, 1, 1)

# Q7: HSS stands for Hospital Support Specialist. The role's name is corrected at
# conversion now that the expansion is known.
ROLE_NAME_CORRECTIONS = {"HSS": "Hospital Support Specialist"}

# Registry of legal constraint type codes. Engine vocabulary, not per-hospital domain
# data, so these are not namespaced and the static scan does not cover them.
CONSTRAINT_TYPES = (
    ("TARGET_HOURS", "Weekly target hours", {"period": "str", "tolerance": "number"}, True),
    ("REST_PATTERN", "Consecutive days off", {"min_consecutive_off": "number"}, True),
    (
        "GENERAL_FILL_MAX_OVERAGE_HOURS",
        "General fill overage cap",
        {"max_overage_hours": "number"},
        True,
    ),
    ("NOTE", "Human rationale", {"summary": "str"}, False),
)


def sql_literal(value) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    if isinstance(value, (int, Decimal)):
        return str(value)
    if isinstance(value, dict):
        return "'" + json.dumps(value, sort_keys=True).replace("'", "''") + "'::jsonb"
    if isinstance(value, (date, time)):
        return f"'{value.isoformat()}'"
    return "'" + str(value).replace("'", "''") + "'"


def snake_case_parameter_key(key: str) -> str:
    """Normalize workbook JSON keys; `_snake` does not split camelCase boundaries."""
    with_word_boundaries = re.sub(r"(.)([A-Z][a-z]+)", r"\1_\2", key)
    return re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", with_word_boundaries).lower()


def normalize_parameter_keys(parameters: dict[str, object]) -> dict[str, object]:
    normalized: dict[str, object] = {}
    source_by_key: dict[str, str] = {}
    for source_key, value in parameters.items():
        target_key = snake_case_parameter_key(source_key)
        existing_source = source_by_key.get(target_key)
        if existing_source is not None and existing_source != source_key:
            raise ValueError(
                f"parameter key collision: {existing_source!r} and {source_key!r} "
                f"both normalize to {target_key!r}"
            )
        normalized[target_key] = value
        source_by_key[target_key] = source_key
    return normalized


def validate_constraint_parameter_keys(rows: list[list]) -> None:
    declared_by_type = {
        code: set(parameter_schema)
        for code, _, parameter_schema, _ in CONSTRAINT_TYPES
    }
    for row in rows:
        type_code, name, parameters = row[2], row[3], row[4]
        declared = declared_by_type[type_code]
        actual = set(parameters)
        if actual != declared:
            raise ValueError(
                f"constraint {type_code!r} ({name!r}) parameter keys mismatch: "
                f"declared {sorted(declared)!r}, actual {sorted(actual)!r}"
            )


def insert(table: str, columns: list[str], rows: list[list]) -> str:
    head = f"INSERT INTO {table} ({', '.join(columns)}) VALUES\n"
    body = ",\n".join("  (" + ", ".join(sql_literal(v) for v in row) + ")" for row in rows)
    return head + body + ";\n\n"


def read_sheet(wb, name: str) -> list[dict[str, object]]:
    ws = wb[name]
    rows = list(ws.iter_rows(values_only=True))
    header = [str(h) if h is not None else "" for h in rows[0]]
    return [
        dict(zip(header, row, strict=True))
        for row in rows[1:]
        if any(c is not None and str(c).strip() != "" for c in row)
    ]


def cell(row: dict, key: str) -> str | None:
    value = row.get(key)
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def flag(row: dict, key: str) -> bool:
    return (cell(row, key) or "").upper() == "Y"


def as_int(row: dict, key: str) -> int | None:
    """The sheet stores numbers as a mix of int and str."""
    value = cell(row, key)
    return None if value is None else int(float(value))


def as_decimal(row: dict, key: str) -> Decimal | None:
    value = cell(row, key)
    return None if value is None else Decimal(value)


def weight_of(row: dict, key: str = "weight") -> int:
    """D23: a blank weight cell means 40, not unknown.

    Written as an explicit None test rather than `as_int(...) or DEFAULT_WEIGHT`, because
    a legitimate weight of 0 is falsy and would otherwise be silently rewritten to 40.
    """
    value = as_int(row, key)
    return DEFAULT_WEIGHT if value is None else value


class CodeRegistry:
    """The one place that sees every canonical code, so it can declare and police them."""

    def __init__(self) -> None:
        self._entries: dict[str, tuple[str, str]] = {}

    def register(self, kind: str, source_code: str) -> str:
        """Mint a canonical code, rejecting a collision from two source spellings (F12)."""
        code = canonical_code(kind, source_code)
        existing = self._entries.get(code)
        if existing is not None and existing != (kind, source_code):
            raise ValueError(
                f"canonical code collision: {code!r} is produced by both "
                f"{existing[1]!r} and {source_code!r} for kind {kind!r}. "
                f"Add an entry to tools.code_map.OVERRIDES to separate them."
            )
        self._entries[code] = (kind, source_code)
        return code

    def manifest(self) -> dict[str, object]:
        """Structured, sorted, and deterministic, so the file never churns."""
        return {
            "generated_by": "tools/convert_workbook.py",
            "codes": [
                {"code": code, "kind": kind, "source_code": source_code}
                for code, (kind, source_code) in sorted(self._entries.items())
            ],
        }
```

- [ ] **Step 4: Add the reference and catalog emitters**

Append to `oms-new/tools/convert_workbook.py`:

```python
def convert(workbook_path: Path = WORKBOOK, out_path: Path = FIXTURE) -> dict[str, int]:
    wb = openpyxl.load_workbook(workbook_path, data_only=True)
    counts: dict[str, int] = {}
    # Every canonical code is minted through this one registry, which emits both the
    # `code` values below and the declared manifest (F11) and rejects collisions (F12).
    # Note `constraint_type.code` does NOT go through it: those are engine vocabulary,
    # not namespaced canonical codes (spec §6).
    registry = CodeRegistry()
    chunks: list[str] = [
        "-- Generated by tools/convert_workbook.py from\n"
        "-- seed/source/WCAH_OMS_Seed_Workbook-V5.xlsx.\n"
        "-- Do not edit by hand. Every assumption is documented in seed/CONVERSION.md.\n"
        "-- Corrections to this data are made through the application (D5, D21).\n\n"
    ]

    # --- core.day_of_week -------------------------------------------------
    day_id: dict[str, str] = {}
    rows = []
    for source, name, short_label, iso_index in DAYS:
        code = registry.register("day", source)
        day_id[source] = str(row_uuid(code))
        rows.append([day_id[source], code, name, short_label, iso_index])
    chunks.append(
        insert("core.day_of_week", ["id", "code", "name", "short_label", "iso_index"], rows)
    )
    counts["core.day_of_week"] = len(rows)

    # --- core.organization ------------------------------------------------
    org_code = registry.register("organization", ORGANIZATION_SOURCE_CODE)
    org_id = str(row_uuid(org_code))
    chunks.append(
        insert(
            "core.organization",
            ["id", "code", "name", "week_start_day_id", "active"],
            [[org_id, org_code, ORGANIZATION_NAME, day_id[WEEK_START_SOURCE_DAY], True]],
        )
    )
    counts["core.organization"] = 1

    # --- core.title -------------------------------------------------------
    title_id: dict[str, str] = {}
    rows = []
    for row in read_sheet(wb, "Titles"):
        source = cell(row, "code")
        code = registry.register("title", source)
        title_id[source] = str(row_uuid(code))
        # short_label is the workbook's own code: CSR, VA, RVT, DVM.
        rows.append([title_id[source], code, cell(row, "name"), source, as_int(row, "rank"), True])
    chunks.append(
        insert("core.title", ["id", "code", "name", "short_label", "rank", "active"], rows)
    )
    counts["core.title"] = len(rows)

    # --- core.location ----------------------------------------------------
    location_id: dict[str, str] = {}
    rows = []
    for order, row in enumerate(
        sorted(read_sheet(wb, "Locations"), key=lambda r: as_int(r, "location_key")), start=1
    ):
        source = cell(row, "code")
        code = registry.register("location", source)
        location_id[source] = str(row_uuid(code))
        rows.append([location_id[source], org_id, code, cell(row, "name"), source, order, True])
    chunks.append(
        insert(
            "core.location",
            ["id", "organization_id", "code", "name", "short_label", "sort_order", "active"],
            rows,
        )
    )
    counts["core.location"] = len(rows)

    # --- scheduling.shift_pattern ----------------------------------------
    sp_code = registry.register("shift_pattern", SHIFT_PATTERN["source_code"])
    shift_pattern_id = str(row_uuid(sp_code))
    chunks.append(
        insert(
            "scheduling.shift_pattern",
            [
                "id", "organization_id", "code", "name", "start_time", "end_time",
                "unpaid_meal_minutes", "paid_hours",
            ],
            [[
                shift_pattern_id, org_id, sp_code, SHIFT_PATTERN["name"],
                SHIFT_PATTERN["start_time"], SHIFT_PATTERN["end_time"],
                SHIFT_PATTERN["unpaid_meal_minutes"], SHIFT_PATTERN["paid_hours"],
            ]],
        )
    )
    counts["scheduling.shift_pattern"] = 1

    # --- scheduling.constraint_type --------------------------------------
    rows = [
        [str(row_uuid(f"constraint_type:{code}")), org_id, code, name, schema, machine, True]
        for code, name, schema, machine in CONSTRAINT_TYPES
    ]
    chunks.append(
        insert(
            "scheduling.constraint_type",
            ["id", "organization_id", "code", "name", "parameter_schema",
             "machine_consumable", "active"],
            rows,
        )
    )
    counts["scheduling.constraint_type"] = len(rows)

    # --- scheduling.department -------------------------------------------
    department_id: dict[str, str] = {}
    rows = []
    for order, row in enumerate(
        sorted(read_sheet(wb, "Departments"), key=lambda r: as_int(r, "department_key")), start=1
    ):
        source = cell(row, "code")
        code = registry.register("department", source)
        department_id[source] = str(row_uuid(code))
        rows.append([
            department_id[source], org_id, code, cell(row, "name"),
            cell(row, "description"), order, flag(row, "active"),
        ])
    chunks.append(
        insert(
            "scheduling.department",
            ["id", "organization_id", "code", "name", "description", "sort_order", "active"],
            rows,
        )
    )
    counts["scheduling.department"] = len(rows)

    # --- scheduling.role --------------------------------------------------
    role_id: dict[str, str] = {}
    rows = []
    for order, row in enumerate(
        sorted(read_sheet(wb, "Roles"), key=lambda r: as_int(r, "role_key")), start=1
    ):
        source = cell(row, "code")
        code = registry.register("role", source)
        role_id[source] = str(row_uuid(code))
        min_title = cell(row, "min_title_code")
        rows.append([
            role_id[source], org_id, department_id[cell(row, "department_code")], code,
            ROLE_NAME_CORRECTIONS.get(source, cell(row, "name")),
            ROLE_SHORT_LABEL[source], None,
            title_id[min_title] if min_title else None,
            flag(row, "counts_toward_need"), order, True,
        ])
    chunks.append(
        insert(
            "scheduling.role",
            ["id", "organization_id", "department_id", "code", "name", "short_label",
             "description", "min_title_id", "counts_toward_need", "sort_order", "active"],
            rows,
        )
    )
    counts["scheduling.role"] = len(rows)

    # --- scheduling.hospital_constraint ----------------------------------
    known = {code for code, _, _, _ in CONSTRAINT_TYPES}
    rows = []
    for row in read_sheet(wb, "Hospital_Constraints"):
        type_code = cell(row, "type_code")
        if type_code not in known:
            raise ValueError(f"unregistered constraint type: {type_code}")
        rows.append([
            str(row_uuid(f"hospital_constraint:{cell(row, 'constraint_id')}")), org_id,
            type_code, cell(row, "name"),
            normalize_parameter_keys(json.loads(cell(row, "parameters_json"))), weight_of(row),
            None, flag(row, "machine_consumable"), None, None,
            f"WCAH_OMS_Seed_Workbook-V5.xlsx!Hospital_Constraints:{cell(row, 'constraint_id')}",
            True,
        ])
    # I4: the overage cap is a hospital_constraint row, not a key-value config entry.
    for row in read_sheet(wb, "System_Config"):
        key = cell(row, "config_key")
        if key != "GENERAL_FILL_MAX_OVERAGE_HOURS":
            raise ValueError(f"unhandled System_Config key: {key}")
        rows.append([
            str(row_uuid(f"hospital_constraint:{key}")), org_id, key,
            "General fill overage cap", {"max_overage_hours": int(float(cell(row, "value")))},
            0, "WEEK", True, cell(row, "notes"), None,
            f"WCAH_OMS_Seed_Workbook-V5.xlsx!System_Config:{key}", True,
        ])
    validate_constraint_parameter_keys(rows)
    chunks.append(
        insert(
            "scheduling.hospital_constraint",
            ["id", "organization_id", "type_code", "name", "parameters", "weight",
             "temporal_scope", "machine_consumable", "rationale", "owner", "source_ref",
             "active"],
            rows,
        )
    )
    counts["scheduling.hospital_constraint"] = len(rows)

    # --- scheduling.default_need -----------------------------------------
    # Coverage-needs rulings: Q4 supplies room tech quantities (the 2 * DVMs formula is
    # not carried across, D16); Q2 drops the two quantity-zero rows; Q1 converts the 13
    # location-less CSR rows as Linda Vista; Q5 discards the one condition value.
    room_tech_quantity = {"Sun": 4, "Mon": 10, "Tue": 10, "Wed": 10, "Thu": 10,
                          "Fri": 10, "Sat": 4}
    rows = []
    for row in read_sheet(wb, "Default_Needs"):
        role_code = cell(row, "role_code")
        day = cell(row, "day_of_week")
        quantity = as_int(row, "quantity")
        if cell(row, "formula"):
            if role_code != "ROOM_TECH":
                raise ValueError(f"unexpected formula on {role_code}")
            quantity = room_tech_quantity[day]
        if not quantity:
            continue  # Q2: absent means no need
        rows.append([
            str(row_uuid(
                f"default_need:{cell(row, 'department_code')}"
                f":{cell(row, 'location_code') or 'LV'}"
                f":{day}:{role_code}"
            )),
            org_id, department_id[cell(row, "department_code")],
            location_id[cell(row, "location_code") or "LV"], day_id[day],
            role_id[role_code], quantity, weight_of(row),
        ])
    chunks.append(
        insert(
            "scheduling.default_need",
            ["id", "organization_id", "department_id", "location_id", "day_of_week_id",
             "role_id", "quantity", "weight"],
            rows,
        )
    )
    counts["scheduling.default_need"] = len(rows)

    # Task 9 appends the employee half here.

    out_path.write_text("".join(chunks), encoding="utf-8", newline="\n")

    # F11: the declared code set, written from the same registry that produced every
    # `code` value above, so the manifest and the fixture cannot disagree. Task 11 reads
    # this instead of pattern-matching the SQL.
    manifest_path = out_path.parent / "domain_codes.json"
    manifest_path.write_text(
        json.dumps(registry.manifest(), indent=2) + "\n", encoding="utf-8", newline="\n"
    )

    return counts


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workbook", type=Path, default=WORKBOOK)
    parser.add_argument("--out", type=Path, default=FIXTURE)
    args = parser.parse_args()
    for table, count in convert(args.workbook, args.out).items():
        print(f"{count:>5}  {table}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 5: Run the converter**

Run from the REPOSITORY ROOT, not from `backend`: `python -m tools.convert_workbook`

The root is where `tools` is importable. `pythonpath = [".", ".."]` in `backend/pyproject.toml`
is a pytest-only setting and does nothing for `python -m`, so running this from `backend`
raises `ModuleNotFoundError: No module named 'tools'`.
Expected: a count per table, with `core.day_of_week 7`, `core.title 4`, `core.location 2`, `scheduling.department 8`, `scheduling.role 12`, `scheduling.hospital_constraint 4`, `scheduling.default_need 65`.

If `default_need` is not 65, print the rows the loop skipped and reconcile against the coverage-needs memo before continuing.

- [ ] **Step 6: Verify determinism**

Run:
```
python -m tools.convert_workbook --out seed\_check.sql
fc seed\wcah_seed.sql seed\_check.sql
del seed\_check.sql
```
Run from the repository root — `tools` is not importable from `backend`.
Expected: `FC: no differences encountered`.

- [ ] **Step 7: Start `CONVERSION.md`**

Create `oms-new/seed/CONVERSION.md`:

```markdown
# Seed conversion

`seed/wcah_seed.sql` was produced once by `tools/convert_workbook.py` from
`seed/source/WCAH_OMS_Seed_Workbook-V5.xlsx`. The workbook is a frozen historical
artifact (D4); nothing in `backend/app`, `frontend/src`, or any test reads it.
Corrections to this data are made through the application (D5, D21), not by editing
the workbook and re-running the converter.

## Determinism

Ids are UUIDv5 over a fixed namespace, `uuid5(NAMESPACE_DNS, "oms-new.wcah")`. For a
row with a canonical code the seed string is that code, so the code is the natural key
and the id follows from it. For a row without one it is a stable path such as
`role_eligibility:alonzo-evelyn:ROOM_TECH`. Re-running the converter produces a
byte-identical file.

## Canonical code map

Every `code` column holds `{kind}_{snake_case(source_code)}` (D10). The workbook's
integer `department_key` and `role_key` columns are discarded as identity; they are
read once, to derive `sort_order` (see below).

| Kind | Source | Canonical code |
|---|---|---|
| Organization | WCAH | `organization_wcah` |
| Location | LV | `location_lv` |
| Location | PB | `location_pb` |
| Title | CSR | `title_csr` |
| Title | VA | `title_va` |
| Title | RVT | `title_rvt` |
| Title | DVM | `title_dvm` |
| Day | Sun | `day_sun` |
| Day | Mon | `day_mon` |
| Day | Tue | `day_tue` |
| Day | Wed | `day_wed` |
| Day | Thu | `day_thu` |
| Day | Fri | `day_fri` |
| Day | Sat | `day_sat` |
| Department | ROOM | `department_room` |
| Department | SURGERY | `department_surgery` |
| Department | DENTAL | `department_dental` |
| Department | HSS | `department_hss` |
| Department | PHARM | `department_pharm` |
| Department | CSR | `department_csr` |
| Department | ADMIN | `department_admin` |
| Department | TECHAPPT | `department_tech_appt` (override) |
| Role | ROOM_TECH | `role_room_tech` |
| Role | TECH_NC | `role_tech_nc` |
| Role | SURGERY_TECH | `role_surgery_tech` |
| Role | DENTAL_TECH_SR | `role_dental_tech_sr` |
| Role | DENTAL_TECH_JR | `role_dental_tech_jr` |
| Role | DENTAL_MONITOR | `role_dental_monitor` |
| Role | HSS | `role_hss` |
| Role | PHARM | `role_pharm` |
| Role | CSR | `role_csr` |
| Role | CSR_ADMIN | `role_csr_admin` |
| Role | TECH_APPT | `role_tech_appt` |
| Role | ADMIN | `role_admin` |
| Shift pattern | STANDARD_B | `shift_pattern_standard_b` |

**One override.** The department code `TECHAPPT` would give `department_techappt`
beside `role_tech_appt`. `tools/code_map.OVERRIDES` maps it to `tech_appt`. It is the
only entry.

**A22 is closed by construction.** `department_csr`, `role_csr`, and `title_csr` are
three distinct strings, so the collision PRD A22 describes cannot occur.

## Values the workbook does not supply

Three, each a one-time conversion input recorded here and editable in the application
thereafter.

| Value | Source | Why it is needed |
|---|---|---|
| `role.short_label` | `ROLE_SHORT_LABEL` at `../oms/src/ui/oms/OmsScreens.jsx:14-29` | D7 in practice: a lookup map in a component becomes a column in PostgreSQL. |
| `scheduling.shift_pattern` (the single row) | `../oms/src/seed/fromWorkbook.js:1050-1058` — `STANDARD_B`, 07:30–18:30, 30 unpaid meal minutes, 10 paid hours | There is no `Shift_Patterns` sheet, but D17 makes `employee_profile.default_shift_pattern_id` non-nullable. All 37 employees are assigned this pattern. |
| `employee_title.effective_from` | Sentinel `2020-01-01`, matching the mockup's seed | The `Employees` sheet has `title_code` but no dating. **This is not a hire date** and no screen presents it as one. |

`core.day_of_week` is generated by the converter, not read from any sheet.
`organization` likewise: `organization_wcah` / West Coast Animal Hospital, with
`week_start_day_id` = `day_sun`, which is the day every `anchor_week` in
`Employee_Rotations` falls on.

## Sort order

`department.sort_order`, `role.sort_order`, and `location.sort_order` have no workbook
column. They are dense-ranked from the workbook's integer keys, read once for ordering
only: departments 1–8 from `department_key`, locations 1–2 from `location_key`, and
roles 1–12 from `role_key` (whose values skip 8).

## Coverage need rulings applied

From `docs/open-items/2026-08-11-coverage-needs-model.md`. The workbook's 67 rows
become 65.

| Ruling | Effect |
|---|---|
| Q4 / D16 — no formula model | The seven `2 * DVMs` room tech rows take the quantities Tom supplied: 4 on Sunday and Saturday, 10 Monday through Friday. `default_need.formula` does not exist. |
| Q2 — absent means no need | The two Dental Junior Tech rows with `quantity = 0` (Sunday and Saturday) are dropped. They were an artifact of laying the full week out on a spreadsheet. 67 → 65. |
| Q1 — coverage is location-scoped | The 13 CSR-department rows with a blank `location_code` (7 CSR, 6 CSR Admin) convert as Linda Vista. |
| Q5 — no conditional needs | The single `condition = bree_on` value, on Sunday HSS, is discarded. This also removes the last place an employee's name was embedded in a staffing rule. |
| Q7 — HSS is Hospital Support Specialist | The role's `name` becomes "Hospital Support Specialist"; `short_label` stays "HSS". |

## Constraint rows

`scheduling.constraint_type` is a converter-generated registry of four codes:
`TARGET_HOURS`, `REST_PATTERN`, `GENERAL_FILL_MAX_OVERAGE_HOURS`, `NOTE`. An
unrecognized code in the workbook raises rather than being silently skipped.
`ORDERED_PREFERENCE` is not registered because department-scoped constraints are
deferred with department ordering (D14).

`scheduling.hospital_constraint` is four rows: three from the `Hospital_Constraints`
sheet, plus the `GENERAL_FILL_MAX_OVERAGE_HOURS` entry lifted out of `System_Config`,
which becomes a constraint row rather than a key-value entry per ruling I4.

## Dropped as dead

`TECH_NC Eligible` and `TECH_NC Rank` are empty for all 37 employees. `Migration_Notes`
contains only headers. `Week_Setup` and `Time_Off` are out of scope for this slice
(spec section 3).
```

- [ ] **Step 8: Commit**

```powershell
git add tools/convert_workbook.py seed/wcah_seed.sql seed/domain_codes.json seed/CONVERSION.md backend/tests/test_seed_counts.py tools/tests/test_code_registry.py
git commit -m "feat: convert workbook reference data and catalogs to SQL fixture"
```

---

## Task 9: Converter — employees and rotations

Eight tables: `employee`, `employee_title`, `external_identity`, `employee_profile`, `role_eligibility`, `location_eligibility`, `rotation`, `rotation_cell`.

Per F1, the `massage_flags` transformations are already applied in V5. The converter reads the grid verbatim and this task asserts the no-op.

**Files:**
- Modify: `oms-new/tools/convert_workbook.py`
- Modify: `oms-new/seed/wcah_seed.sql` (regenerated)
- Modify: `oms-new/seed/domain_codes.json` (regenerated — expected to be unchanged; see below)
- Modify: `oms-new/seed/CONVERSION.md`
- Modify: `oms-new/backend/tests/test_seed_counts.py`
- Test: `oms-new/backend/tests/test_seed_content.py`

**Interfaces:**
- Consumes: everything from Task 8, plus `tools.rotation_cells.parse_cell`.
- Produces: the complete fixture. `tools.convert_workbook.ROLE_CODES: tuple[str, ...]` — the 12 role codes whose wide columns are read.

**Add the import** `from tools.rotation_cells import parse_cell` to `convert_workbook.py`. Task 8 deliberately omits it, because an import with no use yet fails ruff's F401; this task is where `parse_cell` is first called.

**Move the `seeded` fixture from `test_seed_counts.py` into `backend/tests/conftest.py`.** Task 8 defined it locally because it was the only user. Two modules need it now, and importing a fixture across test modules makes ruff report F811 at every test that takes `seeded` as a parameter — the parameter reads as a redefinition of the imported name. Aliasing the import does not help either, because pytest registers a fixture under its attribute name, so `import seeded as _seeded` would register `_seeded` and no test could resolve `seeded`. A `conftest.py` fixture is auto-discovered by every module in the directory, which is the idiomatic answer and removes the import entirely.

Cut the fixture verbatim into `conftest.py`, adding the imports it needs there (`subprocess`, `sys`, `Path`, `text`, and `engine`, which is already imported), and delete `subprocess`/`sys` from `test_seed_counts.py` if nothing else uses them. Keep `import pytest` in `test_seed_counts.py` — `@pytest.mark.parametrize` still needs it — and drop it from `test_seed_content.py` if that file has no other use for it.

**Extend `EXPECTED_ROWS` in `test_seed_counts.py` to all eighteen tables.** Task 8 deliberately listed only the ten it converts, because the other eight were legitimately empty then. Add these, and change `test_every_converted_table_is_populated` to assert 18 rather than 10:

```python
    "core.employee": 37,
    "core.employee_title": 37,
    "core.external_identity": 37,
    "scheduling.employee_profile": 37,
    "scheduling.role_eligibility": 108,
    "scheduling.location_eligibility": 39,
    "scheduling.rotation": 39,
    "scheduling.rotation_cell": 153,
```

**`seed/domain_codes.json` should not change in this task.** Employees, rotations and eligibility rows carry no canonical codes — their ids come from `row_uuid` over stable paths such as `role_eligibility:alonzo-evelyn:ROOM_TECH`. If regenerating alters the manifest, something has been registered that should not be; stop and report rather than committing the change.

- [ ] **Step 1: Write the failing content tests**

Create `oms-new/backend/tests/test_seed_content.py`:

```python
from pathlib import Path

import pytest
from sqlalchemy import text

from app.db import engine
# `seeded` comes from backend/tests/conftest.py — no import, so ruff sees no redefinition.

REPO = Path(__file__).resolve().parents[2]


def query(sql: str, **params):
    with engine.connect() as conn:
        return conn.execute(text(sql), params).mappings().all()


def test_the_organization_is_wcah_starting_on_the_seeded_week_start_day(seeded):
    rows = query(
        "SELECT o.code, o.name, d.code AS start_day, d.iso_index "
        "FROM core.organization o JOIN core.day_of_week d ON d.id = o.week_start_day_id"
    )
    assert rows[0]["name"] == "West Coast Animal Hospital"
    assert rows[0]["iso_index"] == 7


def test_every_rotation_anchor_falls_on_the_organizations_week_start_day(seeded):
    """D18: validated against the column, not against a hardcoded Sunday."""
    bad = query(
        "SELECT r.anchor_date FROM scheduling.rotation r "
        "CROSS JOIN core.organization o "
        "JOIN core.day_of_week d ON d.id = o.week_start_day_id "
        "WHERE EXTRACT(ISODOW FROM r.anchor_date) <> d.iso_index"
    )
    assert bad == []


def test_every_employee_has_exactly_one_current_title(seeded):
    rows = query(
        "SELECT e.id FROM core.employee e "
        "LEFT JOIN core.employee_title t "
        "  ON t.employee_id = e.id AND t.effective_to IS NULL "
        "GROUP BY e.id HAVING count(t.id) <> 1"
    )
    assert rows == []


def test_every_employee_profile_names_a_shift_pattern(seeded):
    """D17: the paid-hours chain always terminates in data."""
    rows = query(
        "SELECT count(*) AS n FROM scheduling.employee_profile "
        "WHERE default_shift_pattern_id IS NULL"
    )
    assert rows[0]["n"] == 0


def test_no_rotation_cell_overrides_paid_hours(seeded):
    """F7: V5 uses no /HOURS, so resolution always reaches the shift pattern."""
    rows = query(
        "SELECT count(*) AS n FROM scheduling.rotation_cell WHERE paid_hours IS NOT NULL"
    )
    assert rows[0]["n"] == 0


def test_rotation_cells_are_only_role_and_off(seeded):
    """F8: a day with no row is ANY. No ANY rows are stored."""
    kinds = {r["kind"]: r["n"] for r in query(
        "SELECT kind, count(*) AS n FROM scheduling.rotation_cell GROUP BY kind"
    )}
    assert kinds == {"OFF": 131, "ROLE": 22}


def test_the_one_away_from_home_cell_is_pinned_to_pacific_beach(seeded):
    """I14: a day worked at PB is not Linda Vista coverage."""
    rows = query(
        "SELECT e.display_name, l.short_label FROM scheduling.rotation_cell c "
        "JOIN core.location l ON l.id = c.location_id "
        "JOIN scheduling.rotation r ON r.id = c.rotation_id "
        "JOIN core.employee e ON e.id = r.employee_id"
    )
    assert len(rows) == 2
    assert {r["short_label"] for r in rows} == {"PB"}
    assert {r["display_name"] for r in rows} == {"Ross, Shana"}


def test_room_tech_needs_take_the_supplied_quantities(seeded):
    """Coverage-needs Q4: 4 on weekends, 10 on weekdays."""
    rows = query(
        "SELECT d.short_label, n.quantity FROM scheduling.default_need n "
        "JOIN scheduling.role r ON r.id = n.role_id "
        "JOIN core.day_of_week d ON d.id = n.day_of_week_id "
        "WHERE r.short_label = 'Room'"
    )
    quantities = {r["short_label"]: r["quantity"] for r in rows}
    assert quantities == {"Sun": 4, "Mon": 10, "Tue": 10, "Wed": 10,
                          "Thu": 10, "Fri": 10, "Sat": 4}


def test_every_need_is_at_linda_vista(seeded):
    """Coverage-needs Q1: the 13 location-less CSR rows convert as Linda Vista."""
    rows = query(
        "SELECT DISTINCT l.short_label FROM scheduling.default_need n "
        "JOIN core.location l ON l.id = n.location_id"
    )
    assert [r["short_label"] for r in rows] == ["LV"]


def test_hss_role_is_named_in_full(seeded):
    """Coverage-needs Q7."""
    rows = query(
        "SELECT name, short_label FROM scheduling.role WHERE short_label = 'HSS'"
    )
    assert rows[0]["name"] == "Hospital Support Specialist"


def test_three_roles_do_not_count_toward_need(seeded):
    """I15: a column on role, not a hardcoded role-code test."""
    rows = query(
        "SELECT short_label FROM scheduling.role "
        "WHERE counts_toward_need IS FALSE ORDER BY short_label"
    )
    assert [r["short_label"] for r in rows] == ["Admin", "CSR Admin", "Float"]


# --- Finding F1: the massage_flags transformations are already applied in V5 ---


def test_no_duplicate_employee_exists_to_discard(seeded):
    """The DUPLICATE_EMPLOYEE_ID flag has no duplicate behind it in V5."""
    rows = query(
        "SELECT display_name FROM core.employee "
        "GROUP BY display_name HAVING count(*) > 1"
    )
    assert rows == []


def test_every_csr_titled_employee_is_csr_role_eligible(seeded):
    """FILL_CSR_ROLE_ELIGIBILITY was already applied in the workbook."""
    rows = query(
        "SELECT e.display_name FROM core.employee e "
        "JOIN core.employee_title et ON et.employee_id = e.id AND et.effective_to IS NULL "
        "JOIN core.title t ON t.id = et.title_id AND t.short_label = 'CSR' "
        "WHERE NOT EXISTS ("
        "  SELECT 1 FROM scheduling.role_eligibility re "
        "  JOIN scheduling.role r ON r.id = re.role_id AND r.short_label = 'CSR' "
        "  WHERE re.employee_id = e.id)"
    )
    assert rows == []


def test_every_dental_senior_holder_also_holds_junior(seeded):
    """D19 under-grants when ambiguous. V5 already resolved the split: all seven
    flagged employees hold the junior role, four additionally hold senior. The
    converter does not strip senior eligibility that the workbook asserts."""
    rows = query(
        "SELECT e.display_name FROM core.employee e "
        "JOIN scheduling.role_eligibility sr ON sr.employee_id = e.id "
        "JOIN scheduling.role rs ON rs.id = sr.role_id AND rs.short_label = 'Dental 4-5' "
        "WHERE NOT EXISTS ("
        "  SELECT 1 FROM scheduling.role_eligibility jr "
        "  JOIN scheduling.role rj ON rj.id = jr.role_id AND rj.short_label = 'Dental 1-3' "
        "  WHERE jr.employee_id = e.id)"
    )
    assert rows == []


def test_three_eligibilities_have_no_rank(seeded):
    """F2: rank is nullable because V5 leaves three cells blank."""
    rows = query(
        "SELECT count(*) AS n FROM scheduling.role_eligibility WHERE rank IS NULL"
    )
    assert rows[0]["n"] == 3


def test_eligibility_weight_and_burnout_days_have_no_workbook_source(seeded):
    """F3 as amended by F13/D23.

    Neither column has a workbook source, but they encode that differently now.
    `burnout_days` stays null until sub-project 2 makes it editable, while `weight` is
    stored as the 40 default rather than left unknown — a weight that can only mean
    "unspecified" is the ambiguity D22 and D23 exist to remove.
    """
    rows = query(
        "SELECT count(*) AS n FROM scheduling.role_eligibility "
        "WHERE burnout_days IS NOT NULL"
    )
    assert rows[0]["n"] == 0

    rows = query(
        "SELECT count(*) AS n FROM scheduling.role_eligibility WHERE weight <> 40"
    )
    assert rows[0]["n"] == 0, "every converted eligibility row takes the 40 default"


def test_no_legacy_constraint_type_reappears(seeded):
    """Spec section 5.4: the dropped types must not come back as constraint rows."""
    rows = query(
        "SELECT code FROM scheduling.constraint_type WHERE code IN "
        "('DAY_AVAILABILITY', 'FIXED_DAY_SET', 'FIXED_ASSIGNMENT', 'ROLE_ELIGIBILITY', "
        " 'LOCATION_ELIGIBILITY', 'DEPARTMENT_AUTH')"
    )
    assert rows == []


def test_every_hospital_constraint_names_a_registered_type(seeded):
    rows = query(
        "SELECT hc.type_code FROM scheduling.hospital_constraint hc "
        "WHERE NOT EXISTS (SELECT 1 FROM scheduling.constraint_type ct "
        "                  WHERE ct.code = hc.type_code)"
    )
    assert rows == []


def test_the_overage_cap_is_a_constraint_row_not_a_config_entry(seeded):
    """Ruling I4."""
    rows = query(
        "SELECT parameters FROM scheduling.hospital_constraint "
        "WHERE type_code = 'GENERAL_FILL_MAX_OVERAGE_HOURS'"
    )
    assert rows[0]["parameters"] == {"max_overage_hours": 10}


def test_ids_are_uuid_v5_over_the_pinned_namespace(seeded):
    """D13: a test can name a row without guessing an id."""
    from tools.code_map import canonical_code, row_uuid

    rows = query(
        "SELECT id FROM scheduling.department WHERE code = :code",
        code=canonical_code("department", "ROOM"),
    )
    assert rows[0]["id"] == row_uuid(canonical_code("department", "ROOM"))
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend; python -m pytest tests/test_seed_content.py -v`
Expected: the employee-dependent tests fail — those tables are empty.

- [ ] **Step 3: Add the employee emitters**

Replace the `# Task 9 appends the employee half here.` marker in `convert()` with the block below, and add the module constant near `ROLE_SHORT_LABEL`:

```python
# The wide eligibility grid: two columns per role, `{CODE} Eligible` and `{CODE} Rank`.
ROLE_CODES: tuple[str, ...] = (
    "ADMIN", "CSR_ADMIN", "DENTAL_MONITOR", "DENTAL_TECH_JR", "DENTAL_TECH_SR",
    "CSR", "HSS", "PHARM", "ROOM_TECH", "SURGERY_TECH", "TECH_APPT", "TECH_NC",
)
```

```python
    # --- core.employee and its satellites --------------------------------
    employees = read_sheet(wb, "Employees")
    employee_id: dict[str, str] = {}

    employee_rows, title_rows, identity_rows = [], [], []
    profile_rows, role_elig_rows, location_elig_rows = [], [], []

    for row in employees:
        source = cell(row, "employee_id")
        eid = str(row_uuid(f"employee:{source}"))
        employee_id[source] = eid
        employee_rows.append([eid, org_id, cell(row, "display_name"), "active"])

        title_code = cell(row, "title_code")
        title_rows.append([
            str(row_uuid(f"employee_title:{source}:{title_code}")), org_id, eid,
            title_id[title_code], TITLE_EFFECTIVE_FROM, None,
        ])

        paylocity = cell(row, "paylocity_name")
        identity_rows.append([
            str(row_uuid(f"external_identity:paylocity:{source}")), org_id, eid,
            "paylocity", paylocity,
        ])

        profile_rows.append([
            eid, eid, org_id, as_decimal(row, "target_hours"),
            location_id[cell(row, "home_location_code")], shift_pattern_id,
            flag(row, "consecutive_off_exempt"), cell(row, "notes"), source, True,
        ])

        for code in ROLE_CODES:
            if not flag(row, f"{code} Eligible"):
                continue
            # `weight` is deliberately absent: the column is NOT NULL DEFAULT 40 (D23),
            # so the schema supplies it and 40 is stated in exactly one place.
            role_elig_rows.append([
                str(row_uuid(f"role_eligibility:{source}:{code}")), org_id, eid,
                role_id[code], as_int(row, f"{code} Rank"), None,
            ])

        for location_code, column in (("LV", "eligible_LV"), ("PB", "eligible_PB")):
            if flag(row, column):
                location_elig_rows.append([
                    str(row_uuid(f"location_eligibility:{source}:{location_code}")),
                    org_id, eid, location_id[location_code], None,
                ])

    chunks.append(insert(
        "core.employee", ["id", "organization_id", "display_name", "status"], employee_rows))
    counts["core.employee"] = len(employee_rows)

    chunks.append(insert(
        "core.employee_title",
        ["id", "organization_id", "employee_id", "title_id", "effective_from", "effective_to"],
        title_rows))
    counts["core.employee_title"] = len(title_rows)

    chunks.append(insert(
        "core.external_identity",
        ["id", "organization_id", "employee_id", "system", "external_key"], identity_rows))
    counts["core.external_identity"] = len(identity_rows)

    chunks.append(insert(
        "scheduling.employee_profile",
        ["id", "employee_id", "organization_id", "target_hours", "home_location_id",
         "default_shift_pattern_id", "consecutive_off_exempt", "notes", "external_ref",
         "active"],
        profile_rows))
    counts["scheduling.employee_profile"] = len(profile_rows)

    chunks.append(insert(
        "scheduling.role_eligibility",
        ["id", "organization_id", "employee_id", "role_id", "rank", "burnout_days"],
        role_elig_rows))
    counts["scheduling.role_eligibility"] = len(role_elig_rows)

    chunks.append(insert(
        "scheduling.location_eligibility",
        ["id", "organization_id", "employee_id", "location_id", "rank"],
        location_elig_rows))
    counts["scheduling.location_eligibility"] = len(location_elig_rows)

    # --- scheduling.rotation and rotation_cell ---------------------------
    # A blank cell is ANY and produces no row (I3, and the same reading of absence
    # D22 gives default_need). 273 day cells become 153 rows.
    day_tokens = [source for source, _, _, _ in DAYS]
    rotation_rows, cell_rows = [], []

    for row in read_sheet(wb, "Employee_Rotations"):
        source = cell(row, "employee_id")
        sequence = as_int(row, "sequence")
        rid = str(row_uuid(f"rotation:{source}:{sequence}"))
        anchor = date.fromisoformat(cell(row, "anchor_week"))
        if anchor.isoweekday() != dict((d[0], d[3]) for d in DAYS)[WEEK_START_SOURCE_DAY]:
            raise ValueError(f"anchor {anchor} is not the organization's week start day")
        rotation_rows.append([rid, org_id, employee_id[source], sequence, anchor, True])

        for token in day_tokens:
            parsed = parse_cell(cell(row, token))
            if parsed.kind == "ANY":
                continue
            # As with role_eligibility, `weight` is omitted so the schema's
            # NOT NULL DEFAULT 40 supplies it (D23).
            cell_rows.append([
                str(row_uuid(f"rotation_cell:{source}:{sequence}:{token}")), org_id, rid,
                day_id[token], parsed.kind,
                role_id[parsed.role_code] if parsed.role_code else None,
                location_id[parsed.location_code] if parsed.location_code else None,
                parsed.paid_hours, None, None, parsed.time_note, parsed.label,
            ])

    chunks.append(insert(
        "scheduling.rotation",
        ["id", "organization_id", "employee_id", "sequence", "anchor_date", "active"],
        rotation_rows))
    counts["scheduling.rotation"] = len(rotation_rows)

    chunks.append(insert(
        "scheduling.rotation_cell",
        ["id", "organization_id", "rotation_id", "day_of_week_id", "kind", "role_id",
         "location_id", "paid_hours", "start_time", "end_time", "time_note", "label"],
        cell_rows))
    counts["scheduling.rotation_cell"] = len(cell_rows)
```

- [ ] **Step 4: Regenerate and verify counts**

Run from the REPOSITORY ROOT: `python -m tools.convert_workbook`
Expected, exactly:

```
    7  core.day_of_week
    1  core.organization
    4  core.title
    2  core.location
    1  scheduling.shift_pattern
    4  scheduling.constraint_type
    8  scheduling.department
   12  scheduling.role
    4  scheduling.hospital_constraint
   65  scheduling.default_need
   37  core.employee
   37  core.employee_title
   37  core.external_identity
   37  scheduling.employee_profile
  108  scheduling.role_eligibility
   39  scheduling.location_eligibility
   39  scheduling.rotation
  153  scheduling.rotation_cell
```

- [ ] **Step 5: Append the flag findings to `CONVERSION.md`**

Append to `oms-new/seed/CONVERSION.md`:

```markdown
## The `massage_flags` column

Spec section 7 lists five documented best-interpretation rulings under D5. Reading V5
directly shows that four of them were already applied when the workbook was built. The
converter therefore reads the eligibility grid verbatim and applies no transformation;
the flags are provenance, and land in no database column. Tests in
`backend/tests/test_seed_content.py` assert each no-op, so if this reading is ever
wrong the suite says so.

| Flag | Employees | What V5 contains |
|---|---|---|
| `DUPLICATE_EMPLOYEE_ID` | `burchnell-cayla` | 37 rows, 37 distinct `employee_id`. No duplicate exists to discard. |
| `FILL_CSR_ROLE_ELIGIBILITY` | `perez-kiara`, `hummeldorf-cassidy`, `cunningham-dylan`, `hammerstrom-gracie`, `shearer-tori`, `berndt-angela`, `gleason-margaret`, `pulopot-briana`, `davalos-fernanda` | All nine already carry `CSR Eligible = Y`. No blank remains to fill. |
| `SPLIT_DENTAL_TECH→JR_OR_SR` | `dimino-aaron`, `gallegos-angie`, `gardner-theresa`, `prado-carla`, `quinonez-mariel`, `ross-shana`, `sharko-chloe` | All seven already carry `DENTAL_TECH_JR` at rank 2. Four (`dimino-aaron`, `gardner-theresa`, `quinonez-mariel`, `ross-shana`) additionally carry `DENTAL_TECH_SR` at rank 1. D19 under-grants where the split is *ambiguous*; here it is already resolved, and stripping the senior grant would downgrade real data. The grid converts as-is. |
| `MOVE_UNAVAILABLE_TO_ROTATION_OFF` | `mariscal-paulina`, `prado-carla`, `ross-shana` | V5 has no `unavailable_days` column. `Employee_Rotations` already carries 131 `OFF` cells, as I11 requires. |
| `REVIEW_HSS` | `burchnell-cayla`, `torres-damali` | Nothing changed. Coverage-needs Q7 answered what HSS is, so this is no longer an open review item. |

## Rotation cells

All 273 day cells in `Employee_Rotations` reduce to eleven distinct values: blank
(120), `OFF` (131), nine bare role codes (20 cells), and `SURGERY_TECH@PB` (2 cells,
both `ross-shana` Tuesday). **No cell uses `/HOURS` and no cell uses a note.** The
parser implements the whole `CODE[@LOCATION][/HOURS][ (note)]` grammar because the
authoring surface in sub-project 2 requires it; the workbook simply does not exercise
it yet.

A blank cell is `ANY` and produces no row (I3). Storing rows that mean "no constraint"
is the affordance for ambiguity D22 removes from `default_need`, so 273 day cells
become **153 rows**: 131 `OFF` and 22 `ROLE`.

Because no cell overrides paid hours, every `rotation_cell.paid_hours` is null and the
D17 resolution chain terminates in `employee_profile.default_shift_pattern_id` for
every employee — which is the property D17 wanted.

All four distinct `anchor_week` values (2026-07-12, 07-19, 07-26, 08-02) fall on a
Sunday, matching `organization.week_start_day_id`. The converter raises if one does
not, and a seed test re-checks it against the column rather than against a hardcoded
Sunday.

## Employee data notes carried forward

- **`gleason-margaret`** has `home_location_code = PB` but is not among the two
  employees with `eligible_PB` set (`gardner-theresa`, `ross-shana`). The converter
  writes what the sheet says, so she is home at a location she has no eligibility row
  for. No constraint forbids it. This is one for the Team screen (spec section 12
  item 3).
- **`willis-bree`** has `target_hours = 0`. The check constraint permits zero.
- **Ten employees have no rotation** and are unconstrained outside other rules, which
  is the intended reading of an absent rotation.
- **Ranks are a mix of int and str** in the sheet and are coerced. Three eligible
  cells have a blank rank (`gallegos-angie` / DENTAL_MONITOR, `mariscal-paulina` /
  TECH_APPT, `paz-vero` / DENTAL_MONITOR), which is why `role_eligibility.rank` is
  nullable.
- **`role_eligibility.weight` and `burnout_days`** have no workbook column. They encode
  that differently: `burnout_days` is null for all 108 rows, while `weight` is stored as
  the default 40 — a moderately important soft policy on the 0–100 scale, where 0–50 is
  soft and 51–100 is hard (D23). Both become editable in sub-project 2.
```

- [ ] **Step 6: Verify determinism again**

Run:
```
python -m tools.convert_workbook --out seed\_check.sql
fc seed\wcah_seed.sql seed\_check.sql
del seed\_check.sql
```
Run from the repository root — `tools` is not importable from `backend`.
Expected: `FC: no differences encountered`.

- [ ] **Step 7: Commit**

```powershell
git add tools/convert_workbook.py seed/wcah_seed.sql seed/CONVERSION.md backend/tests/test_seed_content.py backend/tests/test_seed_counts.py
git commit -m "feat: convert employees, eligibility, and rotations to SQL fixture"
```

---

## Task 10: Seed loader and conversion guard

The fixture is loaded by a command, not by a migration, so every migration stays free of domain codes (spec §7).

**Files:**
- Create: `oms-new/backend/app/seed/__init__.py`
- Create: `oms-new/backend/app/seed/load.py`
- Test: `oms-new/backend/tests/test_seed_loader.py`

**Interfaces:**
- Consumes: `app.db.engine`; `seed/wcah_seed.sql` from Task 9.
- Produces: `app.seed.load.load_fixture(path: Path | None = None) -> None` and the entry point `python -m app.seed.load`.

**Do not rewrite Task 8's `seeded` fixture to call this loader.** `test_seed_counts.py` executes the fixture SQL directly on purpose: Task 8 generates the file this loader consumes, so pointing that fixture at the loader would make the two tasks circular and stop Task 8 going green on its own. This task proves the loader through `test_seed_loader.py`, which is the loader's real contract — including that a second load fails rather than duplicating.

- [ ] **Step 1: Write the failing loader test**

Create `oms-new/backend/tests/test_seed_loader.py`:

```python
import subprocess
import sys
from pathlib import Path

from sqlalchemy import text

from app.db import engine

REPO = Path(__file__).resolve().parents[2]
BACKEND = REPO / "backend"


def run(*args: str) -> subprocess.CompletedProcess:
    """Always run modules through this interpreter.

    Neither `alembic` nor `python` resolves on PATH here: pytest is started by invoking
    the venv interpreter directly rather than activating the venv, so the venv's Scripts
    directory is not on PATH and a bare command raises FileNotFoundError.
    """
    return subprocess.run(
        [sys.executable, "-m", *args], cwd=BACKEND, capture_output=True, text=True
    )


def test_fixture_loads_into_an_empty_database():
    """Spec section 11: the fixture loads into an empty database."""
    assert run("alembic", "downgrade", "base").returncode == 0
    assert run("alembic", "upgrade", "head").returncode == 0
    result = run("app.seed.load")
    assert result.returncode == 0, result.stdout + result.stderr
    with engine.connect() as conn:
        count = conn.execute(text("SELECT count(*) FROM scheduling.role")).scalar_one()
    assert count == 12


def test_loading_twice_fails_rather_than_duplicating():
    """The fixture is not idempotent by design; a second load is a mistake."""
    result = run("app.seed.load")
    assert result.returncode != 0
    assert "already" in (result.stdout + result.stderr).lower()
```

There is deliberately no test here scanning `load.py` for canonical codes. An earlier draft
had one, using `CANONICAL_CODE_RE.findall`, which is exactly the technique finding F11
rules out: the grammar also matches ordinary identifiers such as `organization_id`, so the
test would fail the moment the loader mentioned one. Task 11's scan already covers
`backend/app`, including this file, against the **declared manifest** — the only authority
on which strings are domain codes.

- [ ] **Step 2: Run to verify failure**

Run: `cd backend; python -m pytest tests/test_seed_loader.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.seed'`, since the package does
not exist yet. The exact module named in the message is `app.seed` rather than
`app.seed.load`; either is the correct red step.

- [ ] **Step 3: Write the loader**

Create `oms-new/backend/app/seed/__init__.py` (empty).

Create `oms-new/backend/app/seed/load.py`:

```python
"""Load the committed seed fixture.

Deliberately not an Alembic migration. Migrations create structure; this loads data,
which keeps every migration free of domain codes (spec section 7).

    python -m app.seed.load
"""

import sys
from pathlib import Path

from sqlalchemy import text

from app.db import engine

FIXTURE = Path(__file__).resolve().parents[3] / "seed" / "wcah_seed.sql"


def load_fixture(path: Path | None = None) -> None:
    fixture = path or FIXTURE
    if not fixture.is_file():
        raise FileNotFoundError(f"seed fixture not found: {fixture}")

    with engine.begin() as conn:
        existing = conn.execute(text("SELECT count(*) FROM core.organization")).scalar_one()
        if existing:
            raise RuntimeError(
                "database already seeded; run `python -m alembic downgrade base` then "
                "`python -m alembic upgrade head` before loading again"
            )
        conn.execute(text(fixture.read_text(encoding="utf-8")))


def main() -> int:
    try:
        load_fixture()
    except (FileNotFoundError, RuntimeError) as exc:
        print(f"seed failed: {exc}", file=sys.stderr)
        return 1
    print(f"seeded from {FIXTURE.name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 4: Run the loader and the guards**

Run:
```
cd backend
python -m alembic downgrade base
python -m alembic upgrade head
python -m app.seed.load
python -m pytest tests/test_seed_loader.py tests/test_seed_counts.py tests/test_seed_content.py -v
```
Expected: all pass, including all 18 row-count assertions.

- [ ] **Step 5: Commit**

```powershell
git add backend/app/seed backend/tests/test_seed_loader.py
git commit -m "feat: add seed loader command with a not-already-seeded guard"
```

---

## Task 11: Static domain-code scan

This is the earliest point the scan can exist, because it reads its code list from the fixture (spec §10.1). Everything built after this task is built under it.

**Files:**
- Create: `oms-new/tools/scan_domain_codes.py`
- Test: `oms-new/tools/tests/test_scan_domain_codes.py`

**Interfaces:**
- Consumes: `tools.code_map.CANONICAL_CODE_RE`; `seed/domain_codes.json` (the converter's declared manifest, finding F11).
- Produces:
  - `tools.scan_domain_codes.codes_from_manifest(path: Path) -> set[str]`
  - `tools.scan_domain_codes.scan(roots: list[Path], codes: set[str]) -> list[Violation]`
  - `tools.scan_domain_codes.Violation` — frozen dataclass with `path: Path`, `line: int`, `code: str`, `text: str`
  - `tools.scan_domain_codes.SCANNED_ROOTS: tuple[str, ...]` — `("backend/app", "frontend/src")`
  - Entry point `python -m tools.scan_domain_codes`, exit 0 clean / 1 on any hit.

- [ ] **Step 1: Write the failing scan tests**

Create `oms-new/tools/tests/test_scan_domain_codes.py`:

```python
from pathlib import Path

from tools.code_map import CANONICAL_CODE_RE
from tools.scan_domain_codes import (
    SCANNED_ROOTS,
    codes_from_manifest,
    scan,
)

REPO = Path(__file__).resolve().parents[2]
MANIFEST = REPO / "seed" / "domain_codes.json"

# Replace with the count Task 8's registry declares, on the test's first real run.
EXPECTED_CODE_COUNT = 35


def test_codes_come_from_the_manifest_so_the_guard_extends_itself():
    """Spec section 10.1: adding a department extends the guard automatically."""
    codes = codes_from_manifest(MANIFEST)
    assert "department_room" in codes
    assert "role_csr_admin" in codes
    assert "title_dvm" in codes
    assert "day_sun" in codes
    assert "shift_pattern_standard_b" in codes
    assert "organization_wcah" in codes
    # Pin the exact count Task 8's registry declares. NOTE: the original plan asserted
    # 34 while enumerating 1 org + 7 days + 2 locations + 4 titles + 8 departments +
    # 12 roles + 1 shift pattern, which totals 35. Do not guess. Take the number the
    # converter actually registers, and record the breakdown in seed/CONVERSION.md.
    assert len(codes) == EXPECTED_CODE_COUNT


def test_the_fixture_column_names_are_not_mistaken_for_codes():
    """Finding F11: these all satisfy the canonical grammar but are not domain codes."""
    codes = codes_from_manifest(MANIFEST)
    for identifier in (
        "organization_id",
        "location_id",
        "role_id",
        "title_id",
        "department_id",
        "shift_pattern_id",
        "day_of_week",
        "role_eligibility",
        "location_eligibility",
    ):
        assert identifier not in codes


def test_every_declared_code_is_well_formed():
    for code in codes_from_manifest(MANIFEST):
        assert CANONICAL_CODE_RE.fullmatch(code), code


def test_engine_vocabulary_is_not_scanned():
    """Spec section 6: constraint type codes are untouched."""
    codes = codes_from_manifest(MANIFEST)
    assert "TARGET_HOURS" not in codes
    assert "GENERAL_FILL_MAX_OVERAGE_HOURS" not in codes


def test_a_hardcoded_code_is_caught(tmp_path):
    source = tmp_path / "screen.tsx"
    source.write_text(
        "const dept = departments.find(d => d.code === 'department_csr');\n",
        encoding="utf-8",
    )
    violations = scan([tmp_path], {"department_csr"})
    assert len(violations) == 1
    assert violations[0].code == "department_csr"
    assert violations[0].line == 1


def test_the_three_csrs_are_enforced_identically(tmp_path):
    """D10 and spec section 10.1: no exception list, because namespacing makes each
    one unambiguous."""
    (tmp_path / "a.py").write_text("X = 'department_csr'\n", encoding="utf-8")
    (tmp_path / "b.py").write_text("Y = 'role_csr'\n", encoding="utf-8")
    (tmp_path / "c.py").write_text("Z = 'title_csr'\n", encoding="utf-8")
    found = {v.code for v in scan([tmp_path], {"department_csr", "role_csr", "title_csr"})}
    assert found == {"department_csr", "role_csr", "title_csr"}


def test_display_text_is_not_scanned(tmp_path):
    """Spec section 10.1: name and short_label are not scanned. The department's name
    is literally CSR and so is the role's."""
    (tmp_path / "a.tsx").write_text(
        "<h1>CSR</h1><span>Hospital Support Specialist</span>\n", encoding="utf-8"
    )
    assert scan([tmp_path], {"department_csr", "role_csr"}) == []


def test_a_longer_code_does_not_mask_a_shorter_one(tmp_path):
    (tmp_path / "a.ts").write_text("const k = 'role_csr_admin';\n", encoding="utf-8")
    found = {v.code for v in scan([tmp_path], {"role_csr", "role_csr_admin"})}
    assert found == {"role_csr_admin"}


def test_a_code_inside_a_longer_identifier_is_not_a_violation(tmp_path):
    """Token boundaries must bind to the whole alternation, not just its ends.

    Regression test. An earlier revision built the pattern without parentheses around
    the alternation, so the lookbehind applied only to the first code and the lookahead
    only to the last. Every code in between then matched inside a longer identifier, and
    the guard reported ordinary variables as hardcoded domain data.
    """
    (tmp_path / "a.py").write_text(
        "my_role_csrx = 1\nx_department_csr_y = 2\n", encoding="utf-8"
    )
    assert scan([tmp_path], {"role_csr", "department_csr", "role_csr_admin"}) == []


def test_binary_and_generated_lockfiles_are_skipped(tmp_path):
    (tmp_path / "blob.png").write_bytes(b"\x89PNG\r\n\x1a\n department_room")
    assert scan([tmp_path], {"department_room"}) == []


def test_the_real_source_trees_are_clean():
    """The gate itself. Runs against backend/app and frontend/src as they stand."""
    codes = codes_from_manifest(MANIFEST)
    roots = [REPO / root for root in SCANNED_ROOTS if (REPO / root).is_dir()]
    violations = scan(roots, codes)
    assert violations == [], "\n".join(
        f"{v.path.relative_to(REPO).as_posix()}:{v.line}  {v.code}  {v.text}"
        for v in violations
    )
```

Note on the count assertion: the plan originally said 34, while enumerating 1 organization, 7 days, 2 locations, 4 titles, 8 departments, 12 roles and 1 shift pattern — which totals 35. The literal is provisional. Take the count the converter's registry actually declares, reconcile it against `seed/CONVERSION.md`'s code map, and record the breakdown there.

- [ ] **Step 2: Run to verify failure**

Run: `cd backend; python -m pytest ../tools/tests/test_scan_domain_codes.py -v`
Expected: FAIL — `No module named tools.scan_domain_codes`.

- [ ] **Step 3: Write the scan**

Create `oms-new/tools/scan_domain_codes.py`:

```python
"""Fail the build if any canonical domain code appears in source.

The code list is generated from the committed seed fixture, so adding a department
extends the guard automatically. There is no exception list: because identifiers are
namespaced by kind (D10), `department_csr`, `role_csr`, and `title_csr` are three
distinct, unambiguous strings and each is enforced identically.

The scan covers codes, not display text. Nothing keys off `name` or `short_label` —
components render a label and never compare against it — and scanning them would
reintroduce the ambiguity D10 removes.

    python -m tools.scan_domain_codes
"""

import argparse
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path

from tools.code_map import CANONICAL_CODE_RE

REPO = Path(__file__).resolve().parents[1]
MANIFEST = REPO / "seed" / "domain_codes.json"

SCANNED_ROOTS: tuple[str, ...] = ("backend/app", "frontend/src")

SCANNED_SUFFIXES = frozenset(
    {".py", ".ts", ".tsx", ".js", ".jsx", ".json", ".css", ".html", ".sql", ".yml", ".yaml"}
)
SKIPPED_DIRS = frozenset({"node_modules", "__pycache__", ".venv", "dist", ".git"})


@dataclass(frozen=True)
class Violation:
    path: Path
    line: int
    code: str
    text: str


def codes_from_manifest(path: Path = MANIFEST) -> set[str]:
    """The codes the converter declared, read from structured data (finding F11).

    No SQL is parsed and nothing is inferred. The fixture's own column names —
    `organization_id`, `day_of_week`, `role_eligibility` — are well-formed canonical
    codes, so recovering the set by pattern-matching the fixture is not possible.
    `CANONICAL_CODE_RE` validates the declaration rather than discovering it.
    """
    if not path.is_file():
        raise FileNotFoundError(
            f"code manifest not found: {path}. Run tools/convert_workbook.py first."
        )
    document = json.loads(path.read_text(encoding="utf-8"))
    codes = {entry["code"] for entry in document["codes"]}
    malformed = sorted(code for code in codes if not CANONICAL_CODE_RE.fullmatch(code))
    if malformed:
        raise ValueError(f"manifest declares malformed canonical codes: {malformed}")
    return codes


def _files(root: Path):
    for path in sorted(root.rglob("*")):
        if not path.is_file() or path.suffix.lower() not in SCANNED_SUFFIXES:
            continue
        if SKIPPED_DIRS & set(path.parts):
            continue
        yield path


def scan(roots: list[Path], codes: set[str]) -> list[Violation]:
    if not codes:
        return []
    # Longest first, so `role_csr_admin` is reported rather than `role_csr`.
    # The parentheses are load-bearing twice over: they give `match.group(1)`, and they
    # bind the boundary lookarounds to the whole alternation. Without them the lookbehind
    # applies only to the first code and the lookahead only to the last, so every code in
    # between matches inside a longer identifier.
    alternation = "|".join(re.escape(c) for c in sorted(codes, key=len, reverse=True))
    pattern = re.compile(rf"(?<![A-Za-z0-9_])({alternation})(?![A-Za-z0-9_])")
    violations: list[Violation] = []
    for root in roots:
        for path in _files(root):
            try:
                text = path.read_text(encoding="utf-8")
            except UnicodeDecodeError:
                continue
            for number, line in enumerate(text.splitlines(), start=1):
                for match in pattern.finditer(line):
                    violations.append(
                        Violation(path, number, match.group(1), line.strip()[:120])
                    )
    return violations


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, default=MANIFEST)
    args = parser.parse_args()

    codes = codes_from_manifest(args.manifest)
    roots = [REPO / root for root in SCANNED_ROOTS if (REPO / root).is_dir()]
    violations = scan(roots, codes)

    if violations:
        print(
            f"{len(violations)} hardcoded domain code(s) found. Every domain value must "
            f"come from the API.\n",
            file=sys.stderr,
        )
        for v in violations:
            rel = v.path.relative_to(REPO).as_posix()
            print(f"  {rel}:{v.line}  {v.code}\n      {v.text}", file=sys.stderr)
        return 1

    scanned = ", ".join(SCANNED_ROOTS)
    print(f"clean: none of {len(codes)} canonical codes appears in {scanned}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 4: Run the tests and the scan**

Run:
```
cd backend
python -m pytest ../tools/tests/test_scan_domain_codes.py -v
cd ..
python -m tools.scan_domain_codes
```
Pytest runs from `backend`; the scan runs from the repository root, because `tools` is
only importable from there.
Expected: 11 passed. The scan prints that none of the declared canonical codes appears in
`backend/app` or `frontend/src`. The manifest holds **35** codes — the plan's earlier figure
of 34 predated finding F11, and Task 8 confirmed 35 against the real workbook. Take the
number from the manifest at runtime rather than hardcoding it in the message.

- [ ] **Step 5: Prove the scan actually fails**

Temporarily add `DEPT = "department_room"` to `oms-new/backend/app/settings.py`.

Run from the repository root: `python -m tools.scan_domain_codes`
Expected: exit 1, and the output names `backend/app/settings.py` and `department_room`.

Remove the line and re-run. Expected: exit 0.

- [ ] **Step 6: Commit**

```powershell
git add tools/scan_domain_codes.py tools/tests/test_scan_domain_codes.py
git commit -m "feat: add static domain-code scan with no exception list"
```

---

## Task 12: FastAPI application, health, and problem details

**Files:**
- Create: `oms-new/backend/app/main.py`
- Create: `oms-new/backend/app/api/__init__.py`
- Create: `oms-new/backend/app/api/deps.py`
- Create: `oms-new/backend/app/api/problems.py`
- Modify: `oms-new/backend/tests/conftest.py`
- Test: `oms-new/backend/tests/test_api_health.py`

**Interfaces:**
- Consumes: `app.db.SessionLocal`; `app.core.models.Organization`.
- Produces:
  - `app.main.app: FastAPI`
  - `app.api.deps.get_db() -> Iterator[Session]`
  - `app.api.deps.get_organization(db: Session) -> Organization` — resolves the single organization row server-side; never a URL parameter (D3).
  - `app.api.problems.install_problem_handlers(app: FastAPI) -> None`
  - `app.api.problems.not_found(resource: str, identifier) -> HTTPException`
  - pytest fixture `client: TestClient` in `tests/conftest.py`

- [ ] **Step 1: Write the failing tests**

Create `oms-new/backend/tests/test_api_health.py`:

```python
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.deps import get_organization
from app.api.problems import install_problem_handlers, not_found


def test_healthz_is_live(client):
    response = client.get("/healthz")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_unmatched_path_returns_rfc9457_problem_details(client):
    response = client.get("/api/does-not-exist")

    assert response.status_code == 404
    assert response.headers["content-type"].startswith("application/problem+json")
    assert response.json() == {
        "type": "https://oms-new.invalid/problems/http-error",
        "title": "Not Found",
        "status": 404,
        "detail": "Not Found",
    }


def test_method_not_allowed_preserves_allow_header(client):
    response = client.post("/healthz")

    assert response.status_code == 405
    assert response.headers["content-type"].startswith("application/problem+json")
    assert response.headers["allow"] == "GET"
    assert response.json() == {
        "type": "https://oms-new.invalid/problems/http-error",
        "title": "Method Not Allowed",
        "status": 405,
        "detail": "Method Not Allowed",
    }


def test_fastapi_http_exception_uses_problem_details_handler():
    test_app = FastAPI()
    install_problem_handlers(test_app)

    @test_app.get("/resource/{identifier}")
    def resource(identifier: str):
        raise not_found("resource", identifier)

    with TestClient(test_app) as test_client:
        response = test_client.get("/resource/missing")

    assert response.status_code == 404
    assert response.headers["content-type"].startswith("application/problem+json")
    assert response.json()["detail"] == "no resource with id missing"


def test_unseeded_organization_returns_rfc9457_service_unavailable():
    class EmptyResult:
        def scalar_one_or_none(self):
            return None

    class EmptySession:
        def execute(self, statement):
            return EmptyResult()

    test_app = FastAPI()
    install_problem_handlers(test_app)

    @test_app.get("/organization")
    def organization():
        return get_organization(EmptySession())

    with TestClient(test_app, raise_server_exceptions=False) as test_client:
        response = test_client.get("/organization")

    assert response.status_code == 503
    assert response.headers["content-type"].startswith("application/problem+json")
    assert response.json() == {
        "type": "https://oms-new.invalid/problems/http-error",
        "title": "Service Unavailable",
        "status": 503,
        "detail": "no organization row; run `python -m app.seed.load`",
    }


@pytest.mark.xfail(reason="routes land in Tasks 13 and 14", strict=True)
def test_openapi_is_published(client):
    """The frontend client is generated from this, not written by hand (D11)."""
    schema = client.get("/openapi.json").json()
    assert schema["openapi"].startswith("3.")
    assert "/api/reference" in schema["paths"]


@pytest.mark.xfail(reason="routes land in Tasks 13 and 14", strict=True)
def test_unknown_resource_returns_rfc9457_problem_details(client):
    response = client.get("/api/departments/00000000-0000-0000-0000-000000000000")
    assert response.status_code == 404
    assert response.headers["content-type"].startswith("application/problem+json")
    body = response.json()
    assert set(body) >= {"type", "title", "status", "detail"}
    assert body["status"] == 404
    assert body["detail"] == (
        "no department with id 00000000-0000-0000-0000-000000000000"
    )


@pytest.mark.xfail(reason="routes land in Tasks 13 and 14", strict=True)
def test_validation_error_is_also_a_problem(client):
    response = client.get("/api/departments/not-a-uuid")
    assert response.status_code == 422
    assert response.headers["content-type"].startswith("application/problem+json")


def test_no_url_carries_an_organization(client):
    """D3: organization scoping resolves server-side and never appears in a URL."""
    paths = client.get("/openapi.json").json()["paths"]
    offending = [path for path in paths if "organization" in path]
    assert not offending, f"organization appears in URL path(s): {offending}"
```

- [ ] **Step 2: Add the client fixture**

Append to `oms-new/backend/tests/conftest.py`:

```python
from fastapi.testclient import TestClient


@pytest.fixture(scope="session")
def client():
    from app.main import app

    with TestClient(app) as test_client:
        yield test_client
```

- [ ] **Step 3: Run to verify failure**

Run: `cd backend; python -m pytest tests/test_api_health.py -v`
Expected: FAIL — `No module named app.main`.

- [ ] **Step 4: Write dependencies and problem details**

Create `oms-new/backend/app/api/__init__.py` (empty).

Create `oms-new/backend/app/api/deps.py`:

```python
from collections.abc import Iterator
from typing import Annotated

from fastapi import Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.models import Organization
from app.db import SessionLocal


def get_db() -> Iterator[Session]:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


# Dependencies are declared with `Annotated`, not as argument defaults. A bare
# `db: Session = Depends(get_db)` is a function call in a default, which ruff's B008
# rejects; the alternative would be configuring an exemption for it. The aliases also
# stop every route repeating the same two long parameter declarations.
DbSession = Annotated[Session, Depends(get_db)]


def get_organization(db: DbSession) -> Organization:
    """The single organization row.

    Tenancy is a seam, not routing (D3): there is one organization, it is resolved
    server-side, and it never appears in a URL.
    """
    organization = db.execute(select(Organization).limit(1)).scalar_one_or_none()
    if organization is None:
        raise HTTPException(
            status_code=503,
            detail="no organization row; run `python -m app.seed.load`",
        )
    return organization


CurrentOrganization = Annotated[Organization, Depends(get_organization)]
```

Create `oms-new/backend/app/api/problems.py`:

```python
"""RFC 9457 problem details (spec section 8)."""

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

MEDIA_TYPE = "application/problem+json"
BASE = "https://oms-new.invalid/problems"


def _problem(
    status: int,
    title: str,
    detail: str,
    kind: str,
    headers: dict[str, str] | None = None,
) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        media_type=MEDIA_TYPE,
        headers=headers,
        content={"type": f"{BASE}/{kind}", "title": title, "status": status,
                 "detail": detail},
    )


def not_found(resource: str, identifier) -> HTTPException:
    return HTTPException(status_code=404, detail=f"no {resource} with id {identifier}")


def install_problem_handlers(app: FastAPI) -> None:
    @app.exception_handler(StarletteHTTPException)
    async def _http(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        titles = {
            400: "Bad Request",
            404: "Not Found",
            405: "Method Not Allowed",
            503: "Service Unavailable",
        }
        return _problem(
            exc.status_code,
            titles.get(exc.status_code, "Error"),
            str(exc.detail),
            "http-error",
            exc.headers,
        )

    @app.exception_handler(RequestValidationError)
    async def _validation(request: Request, exc: RequestValidationError) -> JSONResponse:
        detail = "; ".join(
            f"{'.'.join(str(p) for p in e['loc'])}: {e['msg']}" for e in exc.errors()
        )
        return _problem(422, "Unprocessable Content", detail, "validation-error")
```

- [ ] **Step 5: Write the application**

Create `oms-new/backend/app/main.py`:

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import constraints, departments, employees, reference
from app.api.problems import install_problem_handlers

app = FastAPI(
    title="OMS-New API",
    version="0.1.0",
    description=(
        "Read-only surface over the organization's scheduling data. "
        "snake_case on the wire; organization scoping resolves server-side."
    ),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

install_problem_handlers(app)
app.include_router(reference.router)
app.include_router(departments.router)
app.include_router(employees.router)
app.include_router(constraints.router)


@app.get("/healthz", tags=["ops"])
def healthz() -> dict[str, str]:
    return {"status": "ok"}
```

Create empty router modules now so the imports resolve — `oms-new/backend/app/api/reference.py`, `departments.py`, `employees.py`, `constraints.py`, each containing:

```python
from fastapi import APIRouter

router = APIRouter(prefix="/api")
```

Tasks 13–16 fill them in.

- [ ] **Step 6: Run the tests**

Run: `cd backend; python -m pytest tests/test_api_health.py -v`
Expected after implementation: 6 pass, 3 xfail. The three xfailed tests depend on routes that do not exist:

| Test | Needs | Arrives in |
|---|---|---|
| `test_openapi_is_published` | `/api/reference` in the schema | Task 13 |
| `test_unknown_resource_returns_rfc9457_problem_details` | `/api/departments/{department_id}` | Task 14 |
| `test_validation_error_is_also_a_problem` | the same route, to reject `not-a-uuid` with 422 | Task 14 |

The third is easy to overlook: without the route, `/api/departments/not-a-uuid` is simply an unmatched path and FastAPI answers 404, so the test cannot see the 422 that path validation would produce.

Mark all three with `@pytest.mark.xfail(reason="routes land in Tasks 13 and 14", strict=True)` and remove the markers in Task 14. `strict=True` means the suite fails if one starts passing while still marked, which is what forces the markers to be removed rather than left to rot.

- [ ] **Step 7: Commit**

```powershell
git add backend/app/main.py backend/app/api backend/tests/conftest.py backend/tests/test_api_health.py
git commit -m "feat: add FastAPI application with RFC 9457 problem details"
```

---

## Task 13: `GET /api/reference`

The single bootstrap call. It removes any excuse for a lookup map in a component, which is the failure mode the no-hardcoded-data rule exists to prevent (D8).

**Files:**
- Create: `oms-new/backend/app/api/schemas.py`
- Modify: `oms-new/backend/app/api/reference.py`
- Test: `oms-new/backend/tests/test_api_reference.py`

**Interfaces:**
- Consumes: `app.api.deps.get_db`, `get_organization`; all models.
- Produces, in `app.api.schemas`: `OrganizationOut`, `DayOut`, `LocationOut`, `TitleOut`, `ShiftPatternOut`, `ConstraintTypeOut`, `RoleOut`, `DepartmentWithRolesOut`, `ReferenceOut`. All are `snake_case` and all ids are `UUID`.

- [ ] **Step 1: Write the failing tests**

Create `oms-new/backend/tests/test_api_reference.py`:

```python
import pytest


@pytest.fixture(scope="module", autouse=True)
def _seed(seeded):
    """These tests read real rows, so the module must own its data.

    `client` is session-scoped and cannot depend on the module-scoped `seeded`
    fixture, so without this the module reads whatever the previously-run module
    left in the database and passes or fails on collection order.
    """


def test_reference_returns_the_whole_vocabulary(client):
    body = client.get("/api/reference").json()
    assert set(body) == {
        "organization", "days", "locations", "titles", "shift_patterns",
        "constraint_types", "departments",
    }


def test_counts_match_the_seed(client):
    body = client.get("/api/reference").json()
    assert len(body["days"]) == 7
    assert len(body["locations"]) == 2
    assert len(body["titles"]) == 4
    assert len(body["shift_patterns"]) == 1
    assert len(body["constraint_types"]) == 4
    assert len(body["departments"]) == 8
    assert sum(len(d["roles"]) for d in body["departments"]) == 12


def test_organization_names_its_week_start_day(client):
    """D18: the week start is data, so the client can order days without a constant."""
    organization = client.get("/api/reference").json()["organization"]
    assert organization["name"] == "West Coast Animal Hospital"
    assert organization["week_start_day_id"]


def test_days_carry_a_stable_iso_index_and_no_sort_order(client):
    """Display order is computed from the organization's start day, never stored."""
    days = client.get("/api/reference").json()["days"]
    assert sorted(d["iso_index"] for d in days) == [1, 2, 3, 4, 5, 6, 7]
    assert "sort_order" not in days[0]
    assert {d["short_label"] for d in days} == {
        "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"
    }


def test_roles_carry_the_display_properties_d7_puts_on_the_domain_table(client):
    body = client.get("/api/reference").json()
    roles = [role for d in body["departments"] for role in d["roles"]]
    for role in roles:
        assert set(role) >= {
            "id", "code", "name", "short_label", "sort_order",
            "min_title_id", "counts_toward_need",
        }
    assert {r["short_label"] for r in roles} >= {"Room", "Surg", "Dental 1-3", "CSR Admin"}


def test_three_roles_do_not_count_toward_need(client):
    """I15 reaches the browser as data, not as a role-code test."""
    body = client.get("/api/reference").json()
    labels = sorted(
        role["short_label"]
        for d in body["departments"]
        for role in d["roles"]
        if not role["counts_toward_need"]
    )
    assert labels == ["Admin", "CSR Admin", "Float"]


def test_departments_and_roles_arrive_pre_sorted(client):
    body = client.get("/api/reference").json()
    orders = [d["sort_order"] for d in body["departments"]]
    assert orders == sorted(orders)
    for department in body["departments"]:
        role_orders = [r["sort_order"] for r in department["roles"]]
        assert role_orders == sorted(role_orders)


def test_the_wire_is_snake_case(client):
    """D12: database, Python, and JSON agree; there is no mapping layer.

    The status check is load-bearing. This assertion is a negative over whatever
    comes back, so without it the test passes on the 404 problem-details body
    before the route exists, and would keep passing if the route ever started
    failing — a guard that cannot fail is worth nothing.
    """
    import json
    import re

    response = client.get("/api/reference")
    assert response.status_code == 200
    body = json.dumps(response.json())
    assert re.search(r'"[a-z]+[A-Z]', body) is None
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend; python -m pytest tests/test_api_reference.py -v`
Expected: all 8 fail, because `/api/reference` does not exist yet and answers 404.

Note `test_the_wire_is_snake_case` fails on its `status_code == 200` assertion rather
than on the regex — the 404 problem-details body contains no camelCase, so the regex
alone would pass. That is precisely why the status check is there.

- [ ] **Step 3: Write the schemas**

Create `oms-new/backend/app/api/schemas.py`:

```python
"""Response models. snake_case on the wire (D12); every field name matches its column."""

import uuid
from datetime import date, time
from decimal import Decimal

from pydantic import BaseModel, ConfigDict


class Out(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class OrganizationOut(Out):
    id: uuid.UUID
    code: str
    name: str
    week_start_day_id: uuid.UUID


class DayOut(Out):
    id: uuid.UUID
    code: str
    name: str
    short_label: str
    iso_index: int


class LocationOut(Out):
    id: uuid.UUID
    code: str
    name: str
    short_label: str
    sort_order: int
    active: bool


class TitleOut(Out):
    id: uuid.UUID
    code: str
    name: str
    short_label: str
    rank: int
    active: bool


class ShiftPatternOut(Out):
    id: uuid.UUID
    code: str
    name: str
    start_time: time
    end_time: time
    unpaid_meal_minutes: int
    paid_hours: Decimal


class ConstraintTypeOut(Out):
    id: uuid.UUID
    code: str
    name: str
    parameter_schema: dict
    machine_consumable: bool
    active: bool


class RoleOut(Out):
    id: uuid.UUID
    department_id: uuid.UUID
    code: str
    name: str
    short_label: str
    description: str | None
    min_title_id: uuid.UUID | None
    counts_toward_need: bool
    sort_order: int
    active: bool


class DepartmentOut(Out):
    id: uuid.UUID
    code: str
    name: str
    description: str | None
    sort_order: int
    active: bool


class DepartmentWithRolesOut(DepartmentOut):
    roles: list[RoleOut]


class ReferenceOut(Out):
    organization: OrganizationOut
    days: list[DayOut]
    locations: list[LocationOut]
    titles: list[TitleOut]
    shift_patterns: list[ShiftPatternOut]
    constraint_types: list[ConstraintTypeOut]
    departments: list[DepartmentWithRolesOut]


class DefaultNeedOut(Out):
    id: uuid.UUID
    department_id: uuid.UUID
    location_id: uuid.UUID
    day_of_week_id: uuid.UUID
    role_id: uuid.UUID
    quantity: int
    weight: int


class DepartmentDetailOut(DepartmentWithRolesOut):
    default_needs: list[DefaultNeedOut]


class RoleEligibilityOut(Out):
    role_id: uuid.UUID
    rank: int | None
    weight: int
    burnout_days: int | None


class LocationEligibilityOut(Out):
    location_id: uuid.UUID
    rank: int | None


class RotationCellOut(Out):
    day_of_week_id: uuid.UUID
    kind: str
    role_id: uuid.UUID | None
    location_id: uuid.UUID | None
    paid_hours: Decimal | None
    start_time: time | None
    end_time: time | None
    time_note: str | None
    label: str | None


class RotationOut(Out):
    id: uuid.UUID
    sequence: int
    anchor_date: date
    active: bool
    cells: list[RotationCellOut]


class EmployeeSummaryOut(Out):
    id: uuid.UUID
    display_name: str
    status: str
    title_id: uuid.UUID | None
    target_hours: Decimal
    home_location_id: uuid.UUID
    default_shift_pattern_id: uuid.UUID
    active: bool


class EmployeeDetailOut(EmployeeSummaryOut):
    consecutive_off_exempt: bool
    notes: str | None
    role_eligibilities: list[RoleEligibilityOut]
    location_eligibilities: list[LocationEligibilityOut]
    rotations: list[RotationOut]


class HospitalConstraintOut(Out):
    id: uuid.UUID
    type_code: str
    name: str
    parameters: dict
    weight: int
    temporal_scope: str | None
    machine_consumable: bool
    rationale: str | None
    active: bool
```

- [ ] **Step 4: Write the reference route**

Write `oms-new/backend/app/api/reference.py`:

```python
"""The one bootstrap call (D8).

Every screen reads its vocabulary from this response, so no component ever needs a
lookup map. That is the failure mode the no-hardcoded-data rule exists to prevent.
"""

from fastapi import APIRouter
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.deps import CurrentOrganization, DbSession
from app.api.schemas import ReferenceOut
from app.core.models import DayOfWeek, Location, Title
from app.scheduling.models import ConstraintType, Department, ShiftPattern

router = APIRouter(prefix="/api", tags=["reference"])


@router.get("/reference", response_model=ReferenceOut)
def get_reference(
    db: DbSession,
    organization: CurrentOrganization,
) -> ReferenceOut:
    departments = db.execute(
        select(Department)
        .options(selectinload(Department.roles))
        .where(Department.organization_id == organization.id)
        .order_by(Department.sort_order)
    ).scalars().all()

    return ReferenceOut(
        organization=organization,
        days=db.execute(select(DayOfWeek).order_by(DayOfWeek.iso_index)).scalars().all(),
        locations=db.execute(
            select(Location)
            .where(Location.organization_id == organization.id)
            .order_by(Location.sort_order)
        ).scalars().all(),
        titles=db.execute(select(Title).order_by(Title.rank)).scalars().all(),
        shift_patterns=db.execute(
            select(ShiftPattern)
            .where(ShiftPattern.organization_id == organization.id)
            .order_by(ShiftPattern.code)
        ).scalars().all(),
        constraint_types=db.execute(
            select(ConstraintType)
            .where(ConstraintType.organization_id == organization.id)
            .order_by(ConstraintType.code)
        ).scalars().all(),
        departments=departments,
    )
```

`Department.roles` is already ordered by `Role.sort_order` through the relationship declared in Task 5.

- [ ] **Step 5: Remove the `test_openapi_is_published` xfail marker**

This task publishes `/api/reference`, which is the only thing
`test_openapi_is_published` in `backend/tests/test_api_health.py` was waiting for. It
was marked `@pytest.mark.xfail(..., strict=True)` in Task 12, and `strict=True` means a
test that starts passing while still marked fails the suite as an XPASS. So the marker
has to come off here, in the task that satisfies it — not in Task 14.

Delete only that one marker. The other two,
`test_unknown_resource_returns_rfc9457_problem_details` and
`test_validation_error_is_also_a_problem`, both need Task 14's
`/api/departments/{department_id}` route and stay xfailed until then.

- [ ] **Step 6: Run the tests**

Run: `cd backend; python -m pytest tests/test_api_reference.py tests/test_api_health.py -v`
Expected: 8 passed in `test_api_reference.py`; in `test_api_health.py`, the previously
xfailed `test_openapi_is_published` now passes and 2 remain xfailed.

Then run the whole suite — `cd backend; python -m pytest -q` — because a strict XPASS
elsewhere would not show up in a single-file run.

- [ ] **Step 7: Commit**

```powershell
git add backend/app/api/schemas.py backend/app/api/reference.py backend/tests/test_api_reference.py backend/tests/test_api_health.py
git commit -m "feat: add GET /api/reference bootstrap"
```

---

## Task 14: Department and default-need routes

**Files:**
- Modify: `oms-new/backend/app/api/departments.py`
- Modify: `oms-new/backend/tests/test_api_health.py` (remove the three xfail markers)
- Modify: `oms-new/backend/pyproject.toml`
- Test: `oms-new/backend/tests/test_api_departments.py`

**Interfaces:**
- Consumes: `app.api.schemas.DepartmentOut`, `DepartmentDetailOut`, `DefaultNeedOut`; `app.api.problems.not_found`.
- Produces: `GET /api/departments`, `GET /api/departments/{department_id}`, `GET /api/default-needs?department_id=&day_of_week_id=`.

- [ ] **Step 1: Write the failing tests**

Create `oms-new/backend/tests/test_api_departments.py`:

```python
import uuid

import pytest


@pytest.fixture(scope="module", autouse=True)
def _seed(seeded):
    """These tests read real rows; see the note in `test_api_reference.py`."""


@pytest.fixture(scope="module")
def reference(client):
    return client.get("/api/reference").json()


def _need_sort_keys(needs, reference):
    role_sort_orders = {
        role["id"]: role["sort_order"]
        for department in reference["departments"]
        for role in department["roles"]
    }
    day_iso_indices = {day["id"]: day["iso_index"] for day in reference["days"]}
    return [
        (role_sort_orders[need["role_id"]], day_iso_indices[need["day_of_week_id"]])
        for need in needs
    ]


def test_list_returns_all_eight_in_sort_order(client):
    body = client.get("/api/departments").json()
    assert len(body) == 8
    assert [d["sort_order"] for d in body] == sorted(d["sort_order"] for d in body)


def test_detail_carries_roles_and_needs(client, reference):
    dental = next(d for d in reference["departments"] if len(d["roles"]) == 3)
    body = client.get(f"/api/departments/{dental['id']}").json()
    assert len(body["roles"]) == 3
    # Dental: Junior 5 weekdays + Senior 7 days + Monitor 7 days = 19.
    # Junior is weekdays only, which is coverage-needs ruling Q2.
    assert len(body["default_needs"]) == 19
    keys = _need_sort_keys(body["default_needs"], reference)
    assert keys == sorted(keys)


def test_detail_for_an_unknown_id_is_a_problem(client):
    """The detail assertion is load-bearing.

    Since Task 12 registered the problem-details handler on Starlette's base
    exception, an unmatched path ALSO answers 404 `application/problem+json`. So
    the status and media type alone cannot tell "this route rejected an unknown
    id" from "this route does not exist" — the test would pass before the route
    was written. Only the body distinguishes them: a route miss says
    "no department with id …", an unmatched path says "Not Found".
    """
    unknown = uuid.uuid4()
    response = client.get(f"/api/departments/{unknown}")
    assert response.status_code == 404
    assert response.headers["content-type"].startswith("application/problem+json")
    assert response.json()["detail"] == f"no department with id {unknown}"


def test_default_needs_lists_all_sixty_five(client, reference):
    needs = client.get("/api/default-needs").json()
    assert len(needs) == 65
    keys = _need_sort_keys(needs, reference)
    assert keys == sorted(keys)


def test_default_needs_filters_by_department(client, reference):
    csr = next(d for d in reference["departments"] if len(d["roles"]) == 2
               and {r["short_label"] for r in d["roles"]} == {"CSR", "CSR Admin"})
    body = client.get(f"/api/default-needs?department_id={csr['id']}").json()
    assert len(body) == 13  # 7 CSR + 6 CSR Admin


def test_default_needs_filters_by_day(client, reference):
    sunday = next(d for d in reference["days"] if d["iso_index"] == 7)
    body = client.get(f"/api/default-needs?day_of_week_id={sunday['id']}").json()
    # Sunday has no Dental Junior and no Pharmacy row (coverage-needs Q2).
    assert len(body) == 7


def test_every_need_quantity_is_positive(client):
    """D22 reaching the wire."""
    assert all(n["quantity"] > 0 for n in client.get("/api/default-needs").json())


def test_no_need_carries_a_formula_or_condition(client):
    """D16 and Q5: detect formula or condition returning to the response schema."""
    need = client.get("/api/default-needs").json()[0]
    assert "formula" not in need
    assert "condition" not in need
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend; python -m pytest tests/test_api_departments.py -v`
Expected: all 8 fail, because none of these routes exists yet and the paths answer 404.

Note `test_detail_for_an_unknown_id_is_a_problem` fails on its `detail` assertion, not on
the status or media type. Since Task 12 registered the problem handler on Starlette's base
exception, an unmatched path already returns 404 `application/problem+json` — so those two
assertions pass before the route is written, and only the body distinguishes a real route
miss from a missing route.

- [ ] **Step 3: Write the routes**

Write `oms-new/backend/app/api/departments.py`:

```python
import uuid
from typing import Annotated

from fastapi import APIRouter, Query
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.deps import CurrentOrganization, DbSession
from app.api.problems import not_found
from app.api.schemas import DefaultNeedOut, DepartmentDetailOut, DepartmentOut
from app.core.models import DayOfWeek
from app.scheduling.models import DefaultNeed, Department, Role

router = APIRouter(prefix="/api", tags=["configuration"])


@router.get("/departments", response_model=list[DepartmentOut])
def list_departments(
    db: DbSession,
    organization: CurrentOrganization,
):
    return db.execute(
        select(Department)
        .where(Department.organization_id == organization.id)
        .order_by(Department.sort_order)
    ).scalars().all()


@router.get("/departments/{department_id}", response_model=DepartmentDetailOut)
def get_department(
    department_id: uuid.UUID,
    db: DbSession,
    organization: CurrentOrganization,
):
    department = db.execute(
        select(Department)
        .options(
            selectinload(
                Department.roles.and_(Role.organization_id == organization.id)
            )
        )
        .where(
            Department.id == department_id,
            Department.organization_id == organization.id,
        )
    ).scalar_one_or_none()
    if department is None:
        raise not_found("department", department_id)

    needs = db.execute(
        select(DefaultNeed)
        .join(Role, Role.id == DefaultNeed.role_id)
        .join(DayOfWeek, DayOfWeek.id == DefaultNeed.day_of_week_id)
        .where(
            DefaultNeed.department_id == department.id,
            DefaultNeed.organization_id == organization.id,
        )
        .order_by(Role.sort_order, DayOfWeek.iso_index)
    ).scalars().all()

    return DepartmentDetailOut(
        **DepartmentOut.model_validate(department).model_dump(),
        roles=department.roles,
        default_needs=needs,
    )


@router.get("/default-needs", response_model=list[DefaultNeedOut])
def list_default_needs(
    db: DbSession,
    organization: CurrentOrganization,
    # `Annotated[..., Query()] = None` rather than `= Query(default=None)`: a call in
    # an argument default is ruff B008, the same rule that moved `Depends` into
    # `Annotated` aliases in `deps.py`. Behaviour and OpenAPI output are identical.
    department_id: Annotated[uuid.UUID | None, Query()] = None,
    day_of_week_id: Annotated[uuid.UUID | None, Query()] = None,
):
    statement = (
        select(DefaultNeed)
        .join(Role, Role.id == DefaultNeed.role_id)
        .join(DayOfWeek, DayOfWeek.id == DefaultNeed.day_of_week_id)
        .where(DefaultNeed.organization_id == organization.id)
        .order_by(Role.sort_order, DayOfWeek.iso_index)
    )
    if department_id is not None:
        statement = statement.where(DefaultNeed.department_id == department_id)
    if day_of_week_id is not None:
        statement = statement.where(DefaultNeed.day_of_week_id == day_of_week_id)
    return db.execute(statement).scalars().all()
```

- [ ] **Step 4: Remove the xfail markers**

Delete the two remaining `@pytest.mark.xfail` decorators added in Task 12, Step 6 — on
`test_unknown_resource_returns_rfc9457_problem_details` and
`test_validation_error_is_also_a_problem`. Both were waiting for this task's
`/api/departments/{department_id}` route. The third, on `test_openapi_is_published`, was
already removed in Task 13, which is where `/api/reference` landed.

Because they were marked `strict=True`, leaving either in place once the route exists fails
the suite as an XPASS, so this step cannot be skipped silently.

**Also delete `import pytest` from the top of `backend/tests/test_api_health.py`.** Those two
markers are its only remaining users — Task 13 removed the third — so once they are gone the
import is unused and ruff reports F401. Confirm with
`backend\.venv\Scripts\python.exe -m ruff check backend tools` from the repository root.

- [ ] **Step 4b: Mutation-probe the formula/condition guard**

Probe it: temporarily add a `formula: str | None = None` field to `DefaultNeedOut` in
`app/api/schemas.py`, run the test, and confirm it FAILS because `formula` now appears in
the serialized need. Then remove the field and confirm the test passes and the tree is
clean. Quote the verbatim failure in your report.

What this proves is worth being precise about: the guard cannot detect a column added to
the *database*, because `DefaultNeedOut` would not expose it. What it does detect is the
response schema regaining a `formula` or `condition` field, which is the way D16 and Q5
would actually be violated in this codebase — someone re-adding it to the API surface.
Say so in your report rather than claiming more.

- [ ] **Step 4c: Mutation-probe both need-ordering guards**

The joins to `Role` and `DayOfWeek` exist only to order both need responses by
`Role.sort_order`, then `DayOfWeek.iso_index`. Prove each ordering assertion is
load-bearing: temporarily remove the detail query's `order_by`, run
`test_detail_carries_roles_and_needs`, and confirm it fails on the composite key list.
Restore it, then repeat for the collection query and
`test_default_needs_lists_all_sixty_five`. Restore both clauses, confirm both tests pass,
and quote the failures in the report.

- [ ] **Step 4d: Suppress only the obsolete TestClient warning**

Add to `backend/pyproject.toml`:

```toml
# Remove when FastAPI's TestClient adopts httpx2 instead of Starlette's deprecated adapter.
filterwarnings = [
    'ignore:Using `httpx` with `starlette\.testclient` is deprecated; install `httpx2` instead\.:starlette.exceptions.StarletteDeprecationWarning',
]
```

This exact message-and-category filter removes the known compatibility warning without
hiding unrelated warnings. Verify that with a temporary test which raises a distinct
`DeprecationWarning`: pytest must still report it. Remove the temporary test afterward.

- [ ] **Step 5: Run the tests**

Run: `cd backend; python -m pytest tests/test_api_departments.py tests/test_api_health.py -v`
Expected: 17 passed — 8 in `test_api_departments.py` and 9 in `test_api_health.py`, with
no xfails or warnings left in either. Then run the full suite and expect
`188 passed, 0 xfailed, 0 warnings`.

- [ ] **Step 6: Commit**

```powershell
git add backend/app/api/departments.py backend/tests/test_api_departments.py backend/tests/test_api_health.py backend/pyproject.toml
git commit -m "feat: add department and default-need routes"
```

---

## Task 15: Employee routes

**Files:**
- Modify: `oms-new/backend/app/api/employees.py`
- Test: `oms-new/backend/tests/test_api_employees.py`

**Interfaces:**
- Consumes: `app.api.schemas.EmployeeSummaryOut`, `EmployeeDetailOut`, `RoleEligibilityOut`, `LocationEligibilityOut`, `RotationOut`, `RotationCellOut`.
- Produces: `GET /api/employees`, `GET /api/employees/{employee_id}`.

- [ ] **Step 1: Write the failing tests**

Create `oms-new/backend/tests/test_api_employees.py`:

```python
import uuid

import pytest
from sqlalchemy import update

from app.api.deps import get_db
from app.core.models import Employee
from app.main import app


@pytest.fixture(scope="module", autouse=True)
def _seed(seeded):
    """These tests read real rows; see the note in `test_api_reference.py`."""


@pytest.fixture(scope="module")
def employees(client):
    return client.get("/api/employees").json()


def test_list_returns_thirty_seven(employees):
    assert len(employees) == 37


def test_list_is_alphabetical(client, db_session):
    db_session.execute(
        update(Employee)
        .where(Employee.display_name == "Alonzo, Evelyn")
        .values(display_name="Zulu, Evelyn")
    )
    db_session.execute(
        update(Employee)
        .where(Employee.display_name == "Willis, Bree")
        .values(display_name="Aardvark, Bree")
    )
    app.dependency_overrides[get_db] = lambda: db_session
    try:
        names = [
            e["display_name"] for e in client.get("/api/employees").json()
        ]
    finally:
        app.dependency_overrides.pop(get_db)

    assert names == sorted(names)
    assert names[0] == "Aardvark, Bree"
    assert names[-1] == "Zulu, Evelyn"


def test_summary_carries_the_profile_facts_the_team_list_shows(employees):
    for employee in employees:
        assert set(employee) >= {
            "id", "display_name", "status", "title_id", "target_hours",
            "home_location_id", "default_shift_pattern_id", "active",
        }
        assert employee["title_id"] is not None
        assert employee["default_shift_pattern_id"] is not None


def test_no_summary_field_reveals_a_home_department(employees):
    """I10: ranked role eligibility is the sole department preference source."""
    assert "home_department_id" not in employees[0]


def test_detail_carries_eligibilities_and_rotations(client, employees):
    shana = next(e for e in employees if e["display_name"] == "Ross, Shana")
    body = client.get(f"/api/employees/{shana['id']}").json()
    assert len(body["rotations"]) == 2
    assert {r["sequence"] for r in body["rotations"]} == {1, 2}
    assert len(body["role_eligibilities"]) == 6
    assert len(body["location_eligibilities"]) == 2


def test_rotation_cells_omit_flexible_days(client, employees):
    """F8: a day with no cell is ANY — available but not pinned (I3)."""
    shana = next(e for e in employees if e["display_name"] == "Ross, Shana")
    body = client.get(f"/api/employees/{shana['id']}").json()
    for rotation in body["rotations"]:
        assert len(rotation["cells"]) < 7
        assert all(c["kind"] in ("ROLE", "OFF") for c in rotation["cells"])


def test_the_pacific_beach_pin_reaches_the_wire(client, employees):
    shana = next(e for e in employees if e["display_name"] == "Ross, Shana")
    body = client.get(f"/api/employees/{shana['id']}").json()
    pinned = [c for r in body["rotations"] for c in r["cells"] if c["location_id"]]
    assert len(pinned) == 2


def test_role_eligibility_rank_may_be_null(client, employees):
    """F2."""
    vero = next(e for e in employees if e["display_name"].startswith("Paz"))
    body = client.get(f"/api/employees/{vero['id']}").json()
    assert any(e["rank"] is None for e in body["role_eligibilities"])


def test_eligibilities_are_ranked_with_unranked_last(client, employees):
    vero = next(e for e in employees if e["display_name"].startswith("Paz"))
    body = client.get(f"/api/employees/{vero['id']}").json()
    ranks = [e["rank"] for e in body["role_eligibilities"]]
    assert ranks == sorted(r for r in ranks if r is not None) + [
        r for r in ranks if r is None
    ]


def test_an_employee_with_no_rotation_returns_an_empty_list(client, employees):
    """Ten employees have none; that means unconstrained, not missing data."""
    with_none = [
        e for e in employees
        if client.get(f"/api/employees/{e['id']}").json()["rotations"] == []
    ]
    assert len(with_none) == 10


def test_detail_for_an_unknown_id_is_a_problem(client):
    """The detail assertion is load-bearing — see the note in Task 14's copy.

    An unmatched path also answers 404 `application/problem+json`, so without the
    body check this passes before the route exists.
    """
    unknown = uuid.uuid4()
    response = client.get(f"/api/employees/{unknown}")
    assert response.status_code == 404
    assert response.headers["content-type"].startswith("application/problem+json")
    assert response.json()["detail"] == f"no employee with id {unknown}"
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend; python -m pytest tests/test_api_employees.py -v`
Expected: all fail, because none of these routes exists yet and the paths answer 404.

As in Task 14, `test_detail_for_an_unknown_id_is_a_problem` fails on its `detail`
assertion rather than on the status or media type — an unmatched path already returns
404 `application/problem+json`.

- [ ] **Step 3: Write the routes**

Write `oms-new/backend/app/api/employees.py`:

```python
import uuid

from fastapi import APIRouter
from sqlalchemy import and_, select
from sqlalchemy.orm import selectinload

from app.api.deps import CurrentOrganization, DbSession
from app.api.problems import not_found
from app.api.schemas import EmployeeDetailOut, EmployeeSummaryOut
from app.core.models import DayOfWeek, Employee, EmployeeTitle
from app.scheduling.models import (
    EmployeeProfile,
    LocationEligibility,
    Role,
    RoleEligibility,
    Rotation,
)

router = APIRouter(prefix="/api", tags=["team"])


def _current_title_subquery(organization_id: uuid.UUID):
    """Current title is a query against employee_title, not a denormalized column
    (spec section 5.3)."""
    return (
        select(EmployeeTitle.employee_id, EmployeeTitle.title_id)
        .where(
            EmployeeTitle.effective_to.is_(None),
            EmployeeTitle.organization_id == organization_id,
        )
        .subquery()
    )


def _summary(
    employee: Employee,
    profile: EmployeeProfile,
    title_id: uuid.UUID | None,
) -> dict:
    return {
        "id": employee.id,
        "display_name": employee.display_name,
        "status": employee.status,
        "title_id": title_id,
        "target_hours": profile.target_hours,
        "home_location_id": profile.home_location_id,
        "default_shift_pattern_id": profile.default_shift_pattern_id,
        "active": profile.active,
    }


@router.get("/employees", response_model=list[EmployeeSummaryOut])
def list_employees(
    db: DbSession,
    organization: CurrentOrganization,
):
    titles = _current_title_subquery(organization.id)
    rows = db.execute(
        select(Employee, EmployeeProfile, titles.c.title_id)
        .join(
            EmployeeProfile,
            and_(
                EmployeeProfile.employee_id == Employee.id,
                EmployeeProfile.organization_id == organization.id,
            ),
        )
        .outerjoin(titles, titles.c.employee_id == Employee.id)
        .where(Employee.organization_id == organization.id)
        .order_by(Employee.display_name)
    ).all()
    return [_summary(e, p, t) for e, p, t in rows]


@router.get("/employees/{employee_id}", response_model=EmployeeDetailOut)
def get_employee(
    employee_id: uuid.UUID,
    db: DbSession,
    organization: CurrentOrganization,
):
    titles = _current_title_subquery(organization.id)
    row = db.execute(
        select(Employee, EmployeeProfile, titles.c.title_id)
        .join(
            EmployeeProfile,
            and_(
                EmployeeProfile.employee_id == Employee.id,
                EmployeeProfile.organization_id == organization.id,
            ),
        )
        .outerjoin(titles, titles.c.employee_id == Employee.id)
        .where(
            Employee.id == employee_id,
            Employee.organization_id == organization.id,
        )
    ).one_or_none()
    if row is None:
        raise not_found("employee", employee_id)
    employee, profile, title_id = row

    # Each sub-collection filters on `organization_id` as well as `employee_id`. The
    # employee was already proven org-owned above, so this is defence in depth rather
    # than a fix for a reachable leak — but D3 requires every organization-owned query
    # to filter on the resolved organization, and these tables have plain foreign keys
    # to `employee.id` with no composite key tying the two columns together. Same
    # ruling Tom made for Task 14's needs sub-query.
    role_eligibilities = db.execute(
        select(RoleEligibility)
        .join(Role, Role.id == RoleEligibility.role_id)
        .where(
            RoleEligibility.employee_id == employee.id,
            RoleEligibility.organization_id == organization.id,
        )
        .order_by(RoleEligibility.rank.asc().nullslast(), Role.sort_order)
    ).scalars().all()

    location_eligibilities = db.execute(
        select(LocationEligibility)
        .where(
            LocationEligibility.employee_id == employee.id,
            LocationEligibility.organization_id == organization.id,
        )
        .order_by(LocationEligibility.rank.asc().nullslast())
    ).scalars().all()

    rotations = db.execute(
        select(Rotation)
        .options(selectinload(Rotation.cells))
        .where(
            Rotation.employee_id == employee.id,
            Rotation.organization_id == organization.id,
        )
        .order_by(Rotation.sequence)
    ).scalars().all()

    if rotations:
        iso = dict(db.execute(select(DayOfWeek.id, DayOfWeek.iso_index)).all())
        for rotation in rotations:
            rotation.cells.sort(key=lambda c: iso[c.day_of_week_id])

    return EmployeeDetailOut(
        **_summary(employee, profile, title_id),
        consecutive_off_exempt=profile.consecutive_off_exempt,
        notes=profile.notes,
        role_eligibilities=role_eligibilities,
        location_eligibilities=location_eligibilities,
        rotations=rotations,
    )
```

- [ ] **Step 4: Run the tests**

Run: `cd backend; python -m pytest tests/test_api_employees.py -v`
Expected: 11 passed.

- [ ] **Step 5: Commit**

```powershell
git add backend/app/api/employees.py backend/tests/test_api_employees.py
git commit -m "feat: add employee list and detail routes"
```

---

## Task 16: Hospital constraint route

**Files:**
- Modify: `oms-new/backend/app/api/constraints.py`
- Test: `oms-new/backend/tests/test_api_constraints.py`

**Interfaces:**
- Consumes: `app.api.schemas.HospitalConstraintOut`.
- Produces: `GET /api/hospital-constraints`.

- [ ] **Step 1: Write the failing tests**

Create `oms-new/backend/tests/test_api_constraints.py`:

```python
import pytest
from sqlalchemy import update

from app.api.deps import get_db
from app.main import app
from app.scheduling.models import ShiftPattern


@pytest.fixture(scope="module", autouse=True)
def _seed(seeded):
    """These tests read real rows; see the note in `test_api_reference.py`."""


def test_all_four_constraints_are_returned(client):
    body = client.get("/api/hospital-constraints").json()
    assert len(body) == 4
    assert {c["type_code"] for c in body} == {
        "NOTE", "REST_PATTERN", "TARGET_HOURS", "GENERAL_FILL_MAX_OVERAGE_HOURS",
    }


def test_every_type_code_is_registered(client):
    """An unrecognized code fails loudly at load; this proves the registry agrees."""
    registered = {t["code"] for t in client.get("/api/reference").json()["constraint_types"]}
    used = {c["type_code"] for c in client.get("/api/hospital-constraints").json()}
    assert used <= registered


def test_parameters_arrive_as_structured_json(client):
    body = client.get("/api/hospital-constraints").json()
    rest = next(c for c in body if c["type_code"] == "REST_PATTERN")
    assert rest["parameters"] == {"min_consecutive_off": 2}


def test_the_overage_cap_is_a_constraint_not_a_config_entry(client):
    """Ruling I4."""
    body = client.get("/api/hospital-constraints").json()
    cap = next(c for c in body if c["type_code"] == "GENERAL_FILL_MAX_OVERAGE_HOURS")
    assert cap["parameters"] == {"max_overage_hours": 10}


def test_paid_hours_reach_the_api_from_the_shift_pattern_row(client):
    pattern = client.get("/api/reference").json()["shift_patterns"][0]
    assert float(pattern["paid_hours"]) == 10.0


def test_paid_hours_change_when_the_shift_pattern_row_changes(client, db_session):
    db_session.execute(update(ShiftPattern).values(paid_hours=8))
    app.dependency_overrides[get_db] = lambda: db_session
    try:
        pattern = client.get("/api/reference").json()["shift_patterns"][0]
    finally:
        app.dependency_overrides.pop(get_db)

    assert float(pattern["paid_hours"]) == 8.0
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend; python -m pytest tests/test_api_constraints.py -v`
Expected: the first four fail with 404; both paid-hours tests pass through the
already-existing `/api/reference` route.

- [ ] **Step 3: Write the route**

Write `oms-new/backend/app/api/constraints.py`:

```python
"""Hospital constraints.

`constraint` is the internal and engine vocabulary; the UI calls these Policies (D20).
"""

from fastapi import APIRouter
from sqlalchemy import select

from app.api.deps import CurrentOrganization, DbSession
from app.api.schemas import HospitalConstraintOut
from app.scheduling.models import HospitalConstraint

router = APIRouter(prefix="/api", tags=["policies"])


@router.get("/hospital-constraints", response_model=list[HospitalConstraintOut])
def list_hospital_constraints(
    db: DbSession,
    organization: CurrentOrganization,
):
    return db.execute(
        select(HospitalConstraint)
        .where(HospitalConstraint.organization_id == organization.id)
        .order_by(HospitalConstraint.type_code, HospitalConstraint.id)
    ).scalars().all()
```

- [ ] **Step 4: Run the whole backend suite**

Run:
```
cd backend
python -m pytest -v
cd ..
python -m tools.scan_domain_codes
```
Expected: everything passes; the scan is clean.

- [ ] **Step 5: Commit**

```powershell
git add backend/app/api/constraints.py backend/tests/test_api_constraints.py
git commit -m "feat: add hospital constraint route"
```

---

## Task 17: Frontend scaffold, generated client, and reference provider

First React. The scan from Task 11 already guards `frontend/src`.

**Files:**
- Create: `oms-new/frontend/package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`
- Create: `oms-new/frontend/src/index.css`, `main.tsx`, `App.tsx`
- Create: `oms-new/frontend/src/api/schema.d.ts` (generated)
- Create: `oms-new/frontend/src/api/client.ts`, `src/api/queries.ts`
- Create: `oms-new/frontend/src/reference/ReferenceProvider.tsx`, `src/reference/ordering.ts`
- Create: `oms-new/frontend/src/components/Shell.tsx`, `Loading.tsx`
- Test: `oms-new/frontend/tests/ordering.test.ts`, `tests/reference.test.tsx`, `tests/fixtures.ts`

**Interfaces:**
- Consumes: the running API from Tasks 12–16.
- Produces:
  - `src/api/client.ts` → `client` (an `openapi-fetch` `Client<paths>`), `API_BASE`
  - `src/api/queries.ts` → `useReferenceQuery`, `useDepartments`, `useDepartment(id)`, `useEmployees`, `useEmployee(id)`, `useHospitalConstraints`
  - `src/reference/ReferenceProvider.tsx` → `ReferenceProvider`, `useReference(): Reference`, and the type `Reference` (the `/api/reference` response plus the lookup maps `roleById`, `departmentById`, `locationById`, `titleById`, `dayById`)
  - `src/reference/ordering.ts` → `orderDays(days, weekStartDayId)`, `bySortOrder(a, b)`, `byRankThenName(a, b)`

- [ ] **Step 1: Scaffold and install**

```powershell
cd oms-new
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
npm install @tanstack/react-query openapi-fetch
npm install -D tailwindcss @tailwindcss/vite openapi-typescript vitest @vitejs/plugin-react `
  jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

Replace `oms-new/frontend/vite.config.ts`:

```ts
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:8000' },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
  },
});
```

Create `oms-new/frontend/tests/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
```

Add to `package.json` scripts:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "typecheck": "tsc -b --noEmit",
    "test": "vitest run",
    "generate:api": "openapi-typescript http://localhost:8000/openapi.json -o src/api/schema.d.ts"
  }
}
```

- [ ] **Step 2: Generate the client types**

Start the API in a second shell: `cd backend; uvicorn app.main:app --reload --port 8000`

Run: `cd frontend; npm run generate:api`
Expected: `src/api/schema.d.ts` is written and contains `"/api/reference"` under `paths`.

- [ ] **Step 3: Write the failing ordering tests**

Create `oms-new/frontend/tests/ordering.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { bySortOrder, byRankThenName, orderDays } from '../src/reference/ordering';

const days = [
  { id: 'a', name: 'Monday', short_label: 'Mon', iso_index: 1, code: 'x' },
  { id: 'b', name: 'Tuesday', short_label: 'Tue', iso_index: 2, code: 'x' },
  { id: 'c', name: 'Wednesday', short_label: 'Wed', iso_index: 3, code: 'x' },
  { id: 'd', name: 'Thursday', short_label: 'Thu', iso_index: 4, code: 'x' },
  { id: 'e', name: 'Friday', short_label: 'Fri', iso_index: 5, code: 'x' },
  { id: 'f', name: 'Saturday', short_label: 'Sat', iso_index: 6, code: 'x' },
  { id: 'g', name: 'Sunday', short_label: 'Sun', iso_index: 7, code: 'x' },
];

describe('orderDays', () => {
  it('starts the week at the organization\'s configured day', () => {
    // D18: the week start is data. Sunday is not a constant anywhere in source.
    expect(orderDays(days, 'g').map((d) => d.short_label)).toEqual([
      'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat',
    ]);
  });

  it('reorders when the organization starts on a different day', () => {
    expect(orderDays(days, 'a').map((d) => d.short_label)).toEqual([
      'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun',
    ]);
  });

  it('falls back to ISO order when the start day is unknown', () => {
    expect(orderDays(days, 'missing').map((d) => d.short_label)).toEqual([
      'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun',
    ]);
  });

  it('does not mutate its input', () => {
    const before = days.map((d) => d.id);
    orderDays(days, 'g');
    expect(days.map((d) => d.id)).toEqual(before);
  });
});

describe('bySortOrder', () => {
  it('orders ascending', () => {
    const items = [{ sort_order: 3 }, { sort_order: 1 }, { sort_order: 2 }];
    expect([...items].sort(bySortOrder).map((i) => i.sort_order)).toEqual([1, 2, 3]);
  });
});

describe('byRankThenName', () => {
  it('puts unranked entries last', () => {
    const items = [
      { rank: null, name: 'Monitor' },
      { rank: 2, name: 'Room' },
      { rank: 1, name: 'Surg' },
    ];
    expect([...items].sort(byRankThenName).map((i) => i.name)).toEqual([
      'Surg', 'Room', 'Monitor',
    ]);
  });
});
```

- [ ] **Step 4: Run to verify failure**

Run: `cd frontend; npm test`
Expected: FAIL — cannot resolve `../src/reference/ordering`.

- [ ] **Step 5: Write the ordering helpers**

Create `oms-new/frontend/src/reference/ordering.ts`:

```ts
/**
 * Ordering helpers. Every ordering rule reads from data.
 *
 * `orderDays` computes display order from the organization's week start day (D18).
 * The hospital's Sunday start is a row in `core.organization`, not a constant here.
 */

interface Day {
  id: string;
  iso_index: number;
}

export function orderDays<T extends Day>(days: readonly T[], weekStartDayId: string): T[] {
  const start = days.find((d) => d.id === weekStartDayId);
  const startIso = start?.iso_index ?? 1;
  return [...days].sort(
    (a, b) => ((a.iso_index - startIso + 7) % 7) - ((b.iso_index - startIso + 7) % 7),
  );
}

export function bySortOrder(a: { sort_order: number }, b: { sort_order: number }): number {
  return a.sort_order - b.sort_order;
}

export function byRankThenName(
  a: { rank: number | null; name: string },
  b: { rank: number | null; name: string },
): number {
  if (a.rank === null && b.rank === null) return a.name.localeCompare(b.name);
  if (a.rank === null) return 1;
  if (b.rank === null) return -1;
  return a.rank - b.rank;
}
```

- [ ] **Step 6: Write the client, queries, and provider**

Create `oms-new/frontend/src/api/client.ts`:

```ts
import createClient from 'openapi-fetch';
import type { paths } from './schema';

export const API_BASE = import.meta.env.VITE_API_BASE ?? '';

export const client = createClient<paths>({ baseUrl: API_BASE });
```

Create `oms-new/frontend/src/api/queries.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { client } from './client';

async function unwrap<T>(promise: Promise<{ data?: T; error?: unknown }>): Promise<T> {
  const { data, error } = await promise;
  if (error || data === undefined) {
    throw new Error(typeof error === 'object' ? JSON.stringify(error) : String(error));
  }
  return data;
}

/** Reference data loads once at boot and never goes stale within a session. */
export const useReferenceQuery = () =>
  useQuery({
    queryKey: ['reference'],
    queryFn: () => unwrap(client.GET('/api/reference')),
    staleTime: Infinity,
  });

export const useDepartments = () =>
  useQuery({
    queryKey: ['departments'],
    queryFn: () => unwrap(client.GET('/api/departments')),
  });

export const useDepartment = (departmentId: string | null) =>
  useQuery({
    queryKey: ['department', departmentId],
    enabled: departmentId !== null,
    queryFn: () =>
      unwrap(
        client.GET('/api/departments/{department_id}', {
          params: { path: { department_id: departmentId as string } },
        }),
      ),
  });

export const useEmployees = () =>
  useQuery({
    queryKey: ['employees'],
    queryFn: () => unwrap(client.GET('/api/employees')),
  });

export const useEmployee = (employeeId: string | null) =>
  useQuery({
    queryKey: ['employee', employeeId],
    enabled: employeeId !== null,
    queryFn: () =>
      unwrap(
        client.GET('/api/employees/{employee_id}', {
          params: { path: { employee_id: employeeId as string } },
        }),
      ),
  });

export const useHospitalConstraints = () =>
  useQuery({
    queryKey: ['hospital-constraints'],
    queryFn: () => unwrap(client.GET('/api/hospital-constraints')),
  });
```

Create `oms-new/frontend/src/reference/ReferenceProvider.tsx`:

```tsx
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useReferenceQuery } from '../api/queries';
import type { components } from '../api/schema';
import { Loading } from '../components/Loading';

type ReferenceResponse = components['schemas']['ReferenceOut'];
type Role = components['schemas']['RoleOut'];

export interface Reference extends ReferenceResponse {
  roles: Role[];
  roleById: Map<string, Role>;
  departmentById: Map<string, ReferenceResponse['departments'][number]>;
  locationById: Map<string, ReferenceResponse['locations'][number]>;
  titleById: Map<string, ReferenceResponse['titles'][number]>;
  dayById: Map<string, ReferenceResponse['days'][number]>;
}

const ReferenceContext = createContext<Reference | null>(null);

function index<T extends { id: string }>(items: readonly T[]): Map<string, T> {
  return new Map(items.map((item) => [item.id, item]));
}

/**
 * Loads the vocabulary once at boot.
 *
 * Every screen reads its labels from here, so no component holds a lookup map. The
 * maps below are keyed by id and built from the response — they contain no literals.
 */
export function ReferenceProvider({ children }: { children: ReactNode }) {
  const { data, isPending, error } = useReferenceQuery();

  const value = useMemo<Reference | null>(() => {
    if (!data) return null;
    const roles = data.departments.flatMap((department) => department.roles);
    return {
      ...data,
      roles,
      roleById: index(roles),
      departmentById: index(data.departments),
      locationById: index(data.locations),
      titleById: index(data.titles),
      dayById: index(data.days),
    };
  }, [data]);

  if (isPending) return <Loading label="Loading reference data" />;
  if (error || !value) {
    return (
      <div role="alert" className="p-8 text-danger">
        Could not load reference data. Is the API running?
      </div>
    );
  }
  return <ReferenceContext.Provider value={value}>{children}</ReferenceContext.Provider>;
}

export function useReference(): Reference {
  const value = useContext(ReferenceContext);
  if (!value) throw new Error('useReference must be used inside ReferenceProvider');
  return value;
}
```

Create `oms-new/frontend/src/components/Loading.tsx`:

```tsx
export function Loading({ label }: { label: string }) {
  return (
    <div role="status" className="flex items-center gap-3 p-8 text-ink-muted">
      <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      {label}
    </div>
  );
}
```

- [ ] **Step 7: Write the theme and shell**

Replace `oms-new/frontend/src/index.css`:

```css
@import 'tailwindcss';

@theme {
  --color-ink: oklch(0.22 0.02 250);
  --color-ink-muted: oklch(0.55 0.02 250);
  --color-surface: oklch(0.99 0.003 250);
  --color-surface-raised: oklch(1 0 0);
  --color-line: oklch(0.91 0.006 250);
  --color-accent: oklch(0.55 0.14 235);
  --color-accent-soft: oklch(0.95 0.03 235);
  --color-danger: oklch(0.55 0.19 25);
  --radius-panel: 0.75rem;
}

html,
body,
#root {
  height: 100%;
}

body {
  background: var(--color-surface);
  color: var(--color-ink);
}
```

Create `oms-new/frontend/src/components/Shell.tsx`:

```tsx
import type { ReactNode } from 'react';

export type ScreenId = 'configuration' | 'team';

/** Static UI chrome. Under D7 the screen names are not domain data. */
const SCREENS: { id: ScreenId; label: string }[] = [
  { id: 'configuration', label: 'Configuration' },
  { id: 'team', label: 'Team' },
];

export function Shell({
  active,
  onNavigate,
  children,
}: {
  active: ScreenId;
  onNavigate: (id: ScreenId) => void;
  children: ReactNode;
}) {
  const { organization } = { organization: null };
  void organization;
  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-6 border-b border-line bg-surface-raised px-6 py-3">
        <span className="text-sm font-semibold tracking-tight">OMS</span>
        <nav className="flex gap-1" aria-label="Screens">
          {SCREENS.map((screen) => (
            <button
              key={screen.id}
              type="button"
              onClick={() => onNavigate(screen.id)}
              aria-current={active === screen.id ? 'page' : undefined}
              className={
                active === screen.id
                  ? 'rounded-md bg-accent-soft px-3 py-1.5 text-sm font-medium text-accent'
                  : 'rounded-md px-3 py-1.5 text-sm text-ink-muted hover:bg-surface'
              }
            >
              {screen.label}
            </button>
          ))}
        </nav>
      </header>
      <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
    </div>
  );
}
```

Remove the unused `organization` stub lines before committing; they are shown only to mark where the header could later display `reference.organization.name`.

- [ ] **Step 8: Wire the application root**

Replace `oms-new/frontend/src/main.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';
import { ReferenceProvider } from './reference/ReferenceProvider';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ReferenceProvider>
        <App />
      </ReferenceProvider>
    </QueryClientProvider>
  </StrictMode>,
);
```

Replace `oms-new/frontend/src/App.tsx`:

```tsx
import { useState } from 'react';
import { Shell, type ScreenId } from './components/Shell';
import { Configuration } from './screens/Configuration';
import { Team } from './screens/Team';

export function App() {
  const [screen, setScreen] = useState<ScreenId>('configuration');
  return (
    <Shell active={screen} onNavigate={setScreen}>
      {screen === 'configuration' ? <Configuration /> : <Team />}
    </Shell>
  );
}
```

Create placeholder `oms-new/frontend/src/screens/Configuration.tsx` and `Team.tsx`, each exporting a named component returning `null`, so the build passes. Tasks 18 and 19 fill them in.

- [ ] **Step 9: Write the provider test and fixtures**

Create `oms-new/frontend/tests/fixtures.ts`. Fixtures are typed by the generated schema, so a mock cannot drift from what the API returns.

```ts
import type { components } from '../src/api/schema';

type Reference = components['schemas']['ReferenceOut'];

const DAY_IDS = ['d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7'] as const;

export const referenceFixture: Reference = {
  organization: {
    id: 'org', code: 'organization_x', name: 'Test Hospital', week_start_day_id: 'd7',
  },
  days: [
    { id: 'd1', code: 'day_a', name: 'Monday', short_label: 'Mon', iso_index: 1 },
    { id: 'd2', code: 'day_b', name: 'Tuesday', short_label: 'Tue', iso_index: 2 },
    { id: 'd3', code: 'day_c', name: 'Wednesday', short_label: 'Wed', iso_index: 3 },
    { id: 'd4', code: 'day_d', name: 'Thursday', short_label: 'Thu', iso_index: 4 },
    { id: 'd5', code: 'day_e', name: 'Friday', short_label: 'Fri', iso_index: 5 },
    { id: 'd6', code: 'day_f', name: 'Saturday', short_label: 'Sat', iso_index: 6 },
    { id: 'd7', code: 'day_g', name: 'Sunday', short_label: 'Sun', iso_index: 7 },
  ],
  locations: [
    { id: 'l1', code: 'location_a', name: 'Main', short_label: 'MN',
      sort_order: 1, active: true },
  ],
  titles: [
    { id: 't1', code: 'title_a', name: 'Assistant', short_label: 'AS',
      rank: 1, active: true },
  ],
  shift_patterns: [
    { id: 'sp1', code: 'shift_pattern_a', name: 'Standard', start_time: '07:30:00',
      end_time: '18:30:00', unpaid_meal_minutes: 30, paid_hours: '10.00' },
  ],
  constraint_types: [
    { id: 'ct1', code: 'TARGET_HOURS', name: 'Weekly target hours',
      parameter_schema: {}, machine_consumable: true, active: true },
  ],
  departments: [
    {
      id: 'dep1', code: 'department_a', name: 'First', description: null,
      sort_order: 1, active: true,
      roles: [
        { id: 'r1', department_id: 'dep1', code: 'role_a', name: 'Alpha',
          short_label: 'Al', description: null, min_title_id: 't1',
          counts_toward_need: true, sort_order: 1, active: true },
      ],
    },
  ],
};

export { DAY_IDS };
```

Note that even the fixture's codes are invented (`department_a`, not `department_room`), so `frontend/tests` never contains a real canonical code. The scan does not read `tests/`, but keeping fixtures synthetic means the tests still pass if the real data changes.

Create `oms-new/frontend/tests/reference.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReferenceProvider, useReference } from '../src/reference/ReferenceProvider';
import { referenceFixture } from './fixtures';

vi.mock('../src/api/queries', async () => {
  const actual = await vi.importActual('../src/api/queries');
  return { ...actual, useReferenceQuery: () => mockQuery };
});

let mockQuery: { data?: unknown; isPending: boolean; error?: unknown };

function Probe() {
  const reference = useReference();
  return (
    <div>
      <span data-testid="role-count">{reference.roles.length}</span>
      <span data-testid="role-label">{reference.roleById.get('r1')?.short_label}</span>
      <span data-testid="org">{reference.organization.name}</span>
    </div>
  );
}

function renderProbe() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ReferenceProvider>
        <Probe />
      </ReferenceProvider>
    </QueryClientProvider>,
  );
}

describe('ReferenceProvider', () => {
  beforeEach(() => {
    mockQuery = { data: referenceFixture, isPending: false };
  });

  it('flattens roles across departments and indexes them by id', async () => {
    renderProbe();
    await waitFor(() => expect(screen.getByTestId('role-count')).toHaveTextContent('1'));
    expect(screen.getByTestId('role-label')).toHaveTextContent('Al');
  });

  it('exposes the organization so screens never name the hospital', async () => {
    renderProbe();
    await waitFor(() => expect(screen.getByTestId('org')).toHaveTextContent('Test Hospital'));
  });

  it('shows a status while loading', () => {
    mockQuery = { isPending: true };
    renderProbe();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows an alert when the API is unreachable', () => {
    mockQuery = { isPending: false, error: new Error('offline') };
    renderProbe();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
```

- [ ] **Step 10: Run everything**

Run:
```
cd frontend
npm run typecheck
npm test
cd ..
python -m tools.scan_domain_codes
```
Expected: typecheck clean, 8 frontend tests pass, scan reports clean across both trees.

- [ ] **Step 11: Commit**

```powershell
git add frontend
git commit -m "feat: add React scaffold, generated API client, and reference provider"
```

---

## Task 18: Configuration screen

A department list with a detail pane showing that department's roles and its weekly needs grid, with days ordered from the organization's week start day (spec §9).

**Files:**
- Create: `oms-new/frontend/src/components/ListDetail.tsx`
- Create: `oms-new/frontend/src/components/Field.tsx`
- Modify: `oms-new/frontend/src/screens/Configuration.tsx`
- Test: `oms-new/frontend/tests/configuration.test.tsx`

**Interfaces:**
- Consumes: `useReference`, `useDepartments`, `useDepartment`, `orderDays`, `bySortOrder`.
- Produces: `ListDetail` (props `items`, `selectedId`, `onSelect`, `renderItem`, `label`, `children`); `Field` (props `label`, `children`); `Configuration`.

- [ ] **Step 1: Write the failing tests**

Create `oms-new/frontend/tests/configuration.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Configuration } from '../src/screens/Configuration';
import { referenceFixture } from './fixtures';

const department = {
  ...referenceFixture.departments[0],
  default_needs: [
    { id: 'n1', department_id: 'dep1', location_id: 'l1', day_of_week_id: 'd7',
      role_id: 'r1', quantity: 4, weight: 50 },
    { id: 'n2', department_id: 'dep1', location_id: 'l1', day_of_week_id: 'd1',
      role_id: 'r1', quantity: 10, weight: 80 },
  ],
};

vi.mock('../src/reference/ReferenceProvider', () => ({
  useReference: () => ({
    ...referenceFixture,
    roles: referenceFixture.departments.flatMap((d) => d.roles),
    roleById: new Map(referenceFixture.departments.flatMap((d) =>
      d.roles.map((r) => [r.id, r] as const))),
    departmentById: new Map(referenceFixture.departments.map((d) => [d.id, d] as const)),
    locationById: new Map(referenceFixture.locations.map((l) => [l.id, l] as const)),
    titleById: new Map(referenceFixture.titles.map((t) => [t.id, t] as const)),
    dayById: new Map(referenceFixture.days.map((d) => [d.id, d] as const)),
  }),
}));

vi.mock('../src/api/queries', () => ({
  useDepartments: () => ({ data: referenceFixture.departments, isPending: false }),
  useDepartment: () => ({ data: department, isPending: false }),
}));

describe('Configuration', () => {
  it('lists departments', () => {
    render(<Configuration />);
    expect(screen.getByRole('option', { name: /First/ })).toBeInTheDocument();
  });

  it('selects the first department by default', () => {
    render(<Configuration />);
    expect(screen.getByRole('option', { name: /First/ })).toHaveAttribute(
      'aria-selected', 'true');
  });

  it('shows the department\'s roles with their short labels', async () => {
    render(<Configuration />);
    const roles = screen.getByRole('table', { name: /roles/i });
    expect(within(roles).getByText('Alpha')).toBeInTheDocument();
    expect(within(roles).getByText('Al')).toBeInTheDocument();
  });

  it('orders the needs grid from the organization\'s week start day', () => {
    // The fixture organization starts on d7, so Sun is the first column (D18).
    render(<Configuration />);
    const grid = screen.getByRole('table', { name: /needs/i });
    const headers = within(grid).getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers.slice(1)).toEqual(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
  });

  it('renders a quantity in each day cell that has a need', () => {
    render(<Configuration />);
    const grid = screen.getByRole('table', { name: /needs/i });
    const row = within(grid).getByRole('row', { name: /Alpha/ });
    const cells = within(row).getAllByRole('cell').map((c) => c.textContent?.trim());
    expect(cells).toEqual(['Alpha', '4', '10', '', '', '', '', '']);
  });

  it('shows the weight, which is real business criticality', () => {
    // Coverage-needs Q3: lower-weighted roles are sacrificed to fill higher ones.
    render(<Configuration />);
    expect(screen.getByText('50')).toBeInTheDocument();
    expect(screen.getByText('80')).toBeInTheDocument();
  });

  it('marks roles that do not count toward need', async () => {
    render(<Configuration />);
    const roles = screen.getByRole('table', { name: /roles/i });
    expect(within(roles).getByText(/counts toward need/i)).toBeInTheDocument();
  });

  it('switches departments on click', async () => {
    render(<Configuration />);
    await userEvent.click(screen.getByRole('option', { name: /First/ }));
    expect(screen.getByRole('option', { name: /First/ })).toHaveAttribute(
      'aria-selected', 'true');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd frontend; npm test -- configuration`
Expected: FAIL — `Configuration` renders `null`.

- [ ] **Step 3: Write the shared components**

Create `oms-new/frontend/src/components/ListDetail.tsx`:

```tsx
import type { ReactNode } from 'react';

export function ListDetail<T extends { id: string }>({
  label,
  items,
  selectedId,
  onSelect,
  renderItem,
  children,
}: {
  label: string;
  items: readonly T[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  renderItem: (item: T) => ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0">
      <ul
        role="listbox"
        aria-label={label}
        className="w-72 shrink-0 overflow-y-auto border-r border-line bg-surface-raised py-2"
      >
        {items.map((item) => {
          const selected = item.id === selectedId;
          return (
            <li key={item.id}>
              <button
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => onSelect(item.id)}
                className={
                  selected
                    ? 'w-full border-l-2 border-accent bg-accent-soft px-4 py-2 text-left text-sm'
                    : 'w-full border-l-2 border-transparent px-4 py-2 text-left text-sm hover:bg-surface'
                }
              >
                {renderItem(item)}
              </button>
            </li>
          );
        })}
      </ul>
      <section className="min-w-0 flex-1 overflow-y-auto p-6">{children}</section>
    </div>
  );
}
```

Create `oms-new/frontend/src/components/Field.tsx`:

```tsx
import type { ReactNode } from 'react';

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs uppercase tracking-wide text-ink-muted">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}
```

- [ ] **Step 4: Write the screen**

Write `oms-new/frontend/src/screens/Configuration.tsx`:

```tsx
import { useState } from 'react';
import { useDepartment, useDepartments } from '../api/queries';
import { Field } from '../components/Field';
import { ListDetail } from '../components/ListDetail';
import { Loading } from '../components/Loading';
import { bySortOrder, orderDays } from '../reference/ordering';
import { useReference } from '../reference/ReferenceProvider';

export function Configuration() {
  const { data: departments, isPending } = useDepartments();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (isPending || !departments) return <Loading label="Loading departments" />;

  const sorted = [...departments].sort(bySortOrder);
  const currentId = selectedId ?? sorted[0]?.id ?? null;

  return (
    <ListDetail
      label="Departments"
      items={sorted}
      selectedId={currentId}
      onSelect={setSelectedId}
      renderItem={(department) => (
        <span className="flex items-baseline justify-between gap-2">
          <span className="font-medium">{department.name}</span>
          {!department.active && <span className="text-xs text-ink-muted">inactive</span>}
        </span>
      )}
    >
      {currentId && <DepartmentDetail departmentId={currentId} key={currentId} />}
    </ListDetail>
  );
}

function DepartmentDetail({ departmentId }: { departmentId: string }) {
  const reference = useReference();
  const { data: department, isPending } = useDepartment(departmentId);

  if (isPending || !department) return <Loading label="Loading department" />;

  const days = orderDays(reference.days, reference.organization.week_start_day_id);
  const roles = [...department.roles].sort(bySortOrder);

  // Quantity by role and day. Absent means no need (D22) and renders as an empty cell.
  const quantity = new Map(
    department.default_needs.map((need) => [`${need.role_id}:${need.day_of_week_id}`,
      need.quantity] as const),
  );
  const roleOrder = new Map(roles.map((role) => [role.id, role.sort_order]));
  const dayOrder = new Map(days.map((day, index) => [day.id, index]));
  const needs = [...department.default_needs].sort((a, b) => {
    const byRole = (roleOrder.get(a.role_id) ?? 0) - (roleOrder.get(b.role_id) ?? 0);
    if (byRole !== 0) return byRole;
    return (dayOrder.get(a.day_of_week_id) ?? 0) - (dayOrder.get(b.day_of_week_id) ?? 0);
  });

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold tracking-tight">{department.name}</h1>
        {department.description && (
          <p className="text-sm text-ink-muted">{department.description}</p>
        )}
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">Roles</h2>
        <table aria-label="Roles" className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase
                           tracking-wide text-ink-muted">
              <th scope="col" className="py-2 pr-4 font-medium">Role</th>
              <th scope="col" className="py-2 pr-4 font-medium">Short</th>
              <th scope="col" className="py-2 pr-4 font-medium">Minimum title</th>
              <th scope="col" className="py-2 font-medium">Counts toward need</th>
            </tr>
          </thead>
          <tbody>
            {roles.map((role) => (
              <tr key={role.id} className="border-b border-line/60">
                <td className="py-2 pr-4">{role.name}</td>
                <td className="py-2 pr-4 text-ink-muted">{role.short_label}</td>
                <td className="py-2 pr-4 text-ink-muted">
                  {role.min_title_id
                    ? reference.titleById.get(role.min_title_id)?.short_label
                    : '—'}
                </td>
                <td className="py-2">{role.counts_toward_need ? 'Yes' : 'No'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">Weekly needs</h2>
        <table aria-label="Weekly needs" className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-xs uppercase tracking-wide
                           text-ink-muted">
              <th scope="col" className="py-2 pr-4 text-left font-medium">Role</th>
              {days.map((day) => (
                <th key={day.id} scope="col" className="py-2 px-2 text-center font-medium">
                  {day.short_label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {roles.map((role) => (
              <tr key={role.id} className="border-b border-line/60">
                <td className="py-2 pr-4 text-left font-normal">{role.name}</td>
                {days.map((day) => (
                  <td key={day.id} className="py-2 px-2 text-center tabular-nums">
                    {quantity.get(`${role.id}:${day.id}`) ?? ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <dl className="flex flex-wrap gap-6 pt-2">
          {needs.map((need) => (
            <Field
              key={need.id}
              label={`${reference.roleById.get(need.role_id)?.short_label} ${reference.dayById.get(need.day_of_week_id)?.short_label} weight`}
            >
              {need.weight}
            </Field>
          ))}
        </dl>
      </section>
    </div>
  );
}
```

- [ ] **Step 5: Run the tests**

Run: `cd frontend; npm test -- configuration; npm run typecheck`
Expected: 8 tests pass, typecheck clean.

- [ ] **Step 6: Check it in the browser**

With `uvicorn` on 8000 and `npm run dev` on 5173, open `http://localhost:5173`. Confirm eight departments, and that selecting Dental shows three roles and a seven-column grid beginning at Sun.

- [ ] **Step 7: Commit**

```powershell
git add frontend/src/screens/Configuration.tsx frontend/src/components frontend/tests/configuration.test.tsx
git commit -m "feat: add Configuration screen"
```

---

## Task 19: Team screen

An employee list with a detail pane showing title, target hours, home location, ranked role and location eligibilities, and the rotation grid rendered from parsed cells (spec §9).

**Files:**
- Modify: `oms-new/frontend/src/screens/Team.tsx`
- Test: `oms-new/frontend/tests/team.test.tsx`

**Interfaces:**
- Consumes: `useReference`, `useEmployees`, `useEmployee`, `orderDays`, `byRankThenName`, `ListDetail`, `Field`.
- Produces: `Team`.

- [ ] **Step 1: Write the failing tests**

Create `oms-new/frontend/tests/team.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Team } from '../src/screens/Team';
import { referenceFixture } from './fixtures';

const summary = {
  id: 'e1', display_name: 'Example, Ada', status: 'active', title_id: 't1',
  target_hours: '40.00', home_location_id: 'l1', default_shift_pattern_id: 'sp1',
  active: true,
};

const detail = {
  ...summary,
  consecutive_off_exempt: false,
  notes: 'Part-time three days',
  role_eligibilities: [
      { role_id: 'r1', rank: 1, weight: 40, burnout_days: null },
      { role_id: 'r1', rank: null, weight: 40, burnout_days: null },
  ],
  location_eligibilities: [{ location_id: 'l1', rank: null }],
  rotations: [
    {
      id: 'rot1', sequence: 1, anchor_date: '2026-08-02', active: true,
      cells: [
        { day_of_week_id: 'd7', kind: 'OFF', role_id: null, location_id: null,
          paid_hours: null, start_time: null, end_time: null, time_note: null,
          label: null },
        { day_of_week_id: 'd1', kind: 'ROLE', role_id: 'r1', location_id: 'l1',
          paid_hours: null, start_time: null, end_time: null, time_note: null,
          label: null },
      ],
    },
  ],
};

vi.mock('../src/reference/ReferenceProvider', () => ({
  useReference: () => ({
    ...referenceFixture,
    roles: referenceFixture.departments.flatMap((d) => d.roles),
    roleById: new Map(referenceFixture.departments.flatMap((d) =>
      d.roles.map((r) => [r.id, r] as const))),
    departmentById: new Map(referenceFixture.departments.map((d) => [d.id, d] as const)),
    locationById: new Map(referenceFixture.locations.map((l) => [l.id, l] as const)),
    titleById: new Map(referenceFixture.titles.map((t) => [t.id, t] as const)),
    dayById: new Map(referenceFixture.days.map((d) => [d.id, d] as const)),
  }),
}));

vi.mock('../src/api/queries', () => ({
  useEmployees: () => ({ data: [summary], isPending: false }),
  useEmployee: () => ({ data: detail, isPending: false }),
}));

describe('Team', () => {
  it('lists employees', () => {
    render(<Team />);
    expect(screen.getByRole('option', { name: /Example, Ada/ })).toBeInTheDocument();
  });

  it('shows the title as a short label resolved from reference data', () => {
    render(<Team />);
    expect(screen.getByText('AS')).toBeInTheDocument();
  });

  it('shows target hours and home location', () => {
    render(<Team />);
    expect(screen.getByText('40')).toBeInTheDocument();
    // Home location and location-eligibility both render "Main".
    expect(screen.getAllByText('Main').length).toBeGreaterThanOrEqual(1);
  });

  it('lists role eligibilities ranked, unranked last', () => {
    render(<Team />);
    const list = screen.getByRole('list', { name: /role eligibility/i });
    const entries = within(list).getAllByRole('listitem').map((li) => li.textContent);
    expect(entries[0]).toMatch(/^1/);
    expect(entries[1]).toMatch(/unranked/i);
  });

  it('orders the rotation grid from the week start day', () => {
    render(<Team />);
    const grid = screen.getByRole('table', { name: /rotation/i });
    const headers = within(grid).getAllByRole('columnheader').map((h) => h.textContent);
    // Unlike Configuration's needs grid, this table has no leading Role column.
    expect(headers).toEqual(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
  });

  it('renders OFF, a role short label, and blanks for flexible days', () => {
    // A day with no cell is ANY — available but not pinned (I3).
    render(<Team />);
    const grid = screen.getByRole('table', { name: /rotation/i });
    const row = within(grid).getAllByRole('row')[1];
    const cells = within(row).getAllByRole('cell').map((c) => c.textContent?.trim());
    expect(cells).toEqual(['OFF', 'Al @MN', '', '', '', '', '']);
  });

  it('shows the anchor date and sequence for each rotation', () => {
    render(<Team />);
    expect(screen.getByText(/2026-08-02/)).toBeInTheDocument();
    expect(screen.getByText(/Sequence 1/)).toBeInTheDocument();
  });

  it('shows the profile note', () => {
    render(<Team />);
    expect(screen.getByText('Part-time three days')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd frontend; npm test -- team`
Expected: FAIL — `Team` renders `null`.

- [ ] **Step 3: Write the screen**

Write `oms-new/frontend/src/screens/Team.tsx`:

```tsx
import { useState } from 'react';
import { useEmployee, useEmployees } from '../api/queries';
import { Field } from '../components/Field';
import { ListDetail } from '../components/ListDetail';
import { Loading } from '../components/Loading';
import { orderDays } from '../reference/ordering';
import { useReference } from '../reference/ReferenceProvider';

export function Team() {
  const { data: employees, isPending } = useEmployees();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (isPending || !employees) return <Loading label="Loading team" />;

  const currentId = selectedId ?? employees[0]?.id ?? null;

  return (
    <ListDetail
      label="Team"
      items={employees}
      selectedId={currentId}
      onSelect={setSelectedId}
      renderItem={(employee) => (
        <span className="font-medium">{employee.display_name}</span>
      )}
    >
      {currentId && <EmployeeDetail employeeId={currentId} key={currentId} />}
    </ListDetail>
  );
}

function EmployeeDetail({ employeeId }: { employeeId: string }) {
  const reference = useReference();
  const { data: employee, isPending } = useEmployee(employeeId);

  if (isPending || !employee) return <Loading label="Loading employee" />;

  const days = orderDays(reference.days, reference.organization.week_start_day_id);
  const title = employee.title_id ? reference.titleById.get(employee.title_id) : undefined;
  const home = reference.locationById.get(employee.home_location_id);
  const shift = reference.shift_patterns.find(
    (pattern) => pattern.id === employee.default_shift_pattern_id,
  );

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <h1 className="text-xl font-semibold tracking-tight">{employee.display_name}</h1>
        <dl className="flex flex-wrap gap-8">
          <Field label="Title">{title?.short_label ?? '—'}</Field>
          <Field label="Target hours">{Number(employee.target_hours)}</Field>
          <Field label="Home location">{home?.name ?? '—'}</Field>
          <Field label="Shift pattern">{shift?.name ?? '—'}</Field>
          <Field label="Rest waiver">
            {employee.consecutive_off_exempt ? 'Exempt' : 'Applies'}
          </Field>
        </dl>
        {employee.notes && <p className="text-sm text-ink-muted">{employee.notes}</p>}
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">Role eligibility</h2>
        <ul aria-label="Role eligibility" className="flex flex-col gap-1 text-sm">
          {employee.role_eligibilities.map((eligibility, index) => {
            const role = reference.roleById.get(eligibility.role_id);
            return (
              <li key={`${eligibility.role_id}-${index}`} className="flex gap-3">
                <span className="w-16 tabular-nums text-ink-muted">
                  {eligibility.rank ?? 'Unranked'}
                </span>
                <span>{role?.name ?? '—'}</span>
                <span className="text-ink-muted">
                  {reference.departmentById.get(role?.department_id ?? '')?.name}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">Location eligibility</h2>
        <ul aria-label="Location eligibility" className="flex flex-col gap-1 text-sm">
          {employee.location_eligibilities.map((eligibility) => (
            <li key={eligibility.location_id}>
              {reference.locationById.get(eligibility.location_id)?.name ?? '—'}
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold">Rotation</h2>
        {employee.rotations.length === 0 && (
          <p className="text-sm text-ink-muted">
            No rotation. This employee is flexible outside other rules.
          </p>
        )}
        {employee.rotations.map((rotation) => {
          const byDay = new Map(rotation.cells.map((cell) => [cell.day_of_week_id, cell]));
          return (
            <div key={rotation.id} className="flex flex-col gap-2">
              <p className="text-xs text-ink-muted">
                Sequence {rotation.sequence} · anchored {rotation.anchor_date}
              </p>
              <table aria-label="Rotation" className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-xs uppercase tracking-wide
                                 text-ink-muted">
                    {days.map((day) => (
                      <th key={day.id} scope="col" className="py-2 px-2 text-center
                                                              font-medium">
                        {day.short_label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {days.map((day) => {
                      const cell = byDay.get(day.id);
                      return (
                        <td key={day.id} className="py-2 px-2 text-center">
                          {cell ? <RotationCell cell={cell} /> : ''}
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          );
        })}
      </section>
    </div>
  );
}

function RotationCell({
  cell,
}: {
  cell: {
    kind: string;
    role_id: string | null;
    location_id: string | null;
    paid_hours: string | null;
    time_note: string | null;
    label: string | null;
  };
}) {
  const reference = useReference();

  if (cell.label) return <>{cell.label}</>;
  if (cell.kind !== 'ROLE') return <span className="text-ink-muted">{cell.kind}</span>;

  const role = cell.role_id ? reference.roleById.get(cell.role_id) : undefined;
  const location = cell.location_id
    ? reference.locationById.get(cell.location_id)
    : undefined;

  return (
    <span className="inline-flex flex-col leading-tight">
      <span>
        {role?.short_label ?? '—'}
        {location ? ` @${location.short_label}` : ''}
      </span>
      {cell.paid_hours && (
        <span className="text-xs text-ink-muted">{Number(cell.paid_hours)}h</span>
      )}
      {cell.time_note && <span className="text-xs text-ink-muted">{cell.time_note}</span>}
    </span>
  );
}
```

The rotation cell renders `role.short_label` and `location.short_label`, both resolved by id from reference data. The `@` separator is punctuation, not a domain code.

- [ ] **Step 4: Run the tests**

Run: `cd frontend; npm test; npm run typecheck; npm run build`
Expected: all suites pass; typecheck and build clean.

- [ ] **Step 5: Check it in the browser**

Open `http://localhost:5173`, switch to Team, and confirm 37 employees. Select `Ross, Shana` and confirm two rotations with a Tuesday cell reading `Surg @PB`. Select a CSR employee with no rotation and confirm the flexible-employee message.

- [ ] **Step 6: Run the scan**

Run from the repository root: `python -m tools.scan_domain_codes`
Expected: clean.

- [ ] **Step 7: Commit**

```powershell
git add frontend/src/screens/Team.tsx frontend/tests/team.test.tsx
git commit -m "feat: add Team screen"
```

---

## Task 20: CI and definition of done

Three GitHub Actions jobs, with the scan standing alone so a failure says exactly what it is (spec §10.4). Then verify every bullet of spec §11.

**Files:**
- Create: `oms-new/.github/workflows/ci.yml`
- Create: `oms-new/README.md`
- Create: `oms-new/frontend/.npmrc` (`legacy-peer-deps=true` — TypeScript 6 vs openapi-typescript peer `^5.x`; without it `npm ci` in CI fails)
- Modify: `oms-new/infra/docker-compose.yml` (add the backend service)
- Test: `oms-new/backend/tests/test_definition_of_done.py`

**Interfaces:**
- Consumes: everything.
- Produces: a green CI run and a README whose instructions actually work from a clean clone.

- [ ] **Step 1: Write the definition-of-done test**

Create `oms-new/backend/tests/test_definition_of_done.py`. It restates spec §11 as executable assertions, so "done" is checkable rather than argued.

```python
import re
import subprocess
import sys
from pathlib import Path

from sqlalchemy import inspect, text

from app.db import engine
# `seeded` comes from backend/tests/conftest.py.

REPO = Path(__file__).resolve().parents[2]
BACKEND = REPO / "backend"


def test_all_eighteen_tables_exist_created_by_alembic(seeded):
    inspector = inspect(engine)
    total = len(inspector.get_table_names(schema="core")) + len(
        inspector.get_table_names(schema="scheduling")
    )
    assert total == 18


# D17 says the length of a working day is data, not a property of the software: it
# resolves through `rotation_cell.paid_hours`, else the non-nullable
# `employee_profile.default_shift_pattern_id`. Task 16 shipped a test NAMED for this
# rule that only confirmed the seeded value round-trips, so a module constant such as
# `SHIFT_HOURS = 10` would have passed it. This is the guard that actually looks.
#
# Every branch of this pattern was probed against a table of cases before it was
# written down, because the first draft — anchored at `^[A-Z_]*` — could not match
# `const SHIFT_HOURS = 10;`, which is exactly the TypeScript plant Step 2b requires,
# and could not match `SHIFT_LENGTH = 10` either. An unprobed guard regex has already
# cost this build one round trip.
#
# Matches: bare, indented, annotated (`: int`, `: Final[int]`), and declared forms
# (`const`/`let`/`var`/`final`/`export`/`readonly`), integer or float, negative.
# Deliberately does NOT match: lowercase names, because `total_hours = 0` and
# `shift_hours = sum(...)` are legitimate accumulators; a value assigned from an
# attribute rather than a literal, which is the correct data-sourced form; or a
# mention inside a comment.
# Known imprecision, accepted: an unrelated upper-case name containing SHIFT or HOUR
# assigned a number is reported — `MAX_HOURS_PER_WEEK = 40` would be. If a legitimate
# one ever appears, rename it or raise it; do not add an exception list, since the
# project's other static guard deliberately has none.
# Still misses, by design: a lowercase local, an inline literal, or a value from an
# environment variable. This is a tripwire for the obvious mistake, not a proof. The
# behavioural guarantee belongs to the sub-project that resolves hours.
# Ruled in by Tom 2026-08-13.
SHIFT_HOUR_CONSTANT = re.compile(
    r"(?m)^[ \t]*"
    r"(?:(?:export|public|private|readonly|static)[ \t]+)*"
    r"(?:(?:const|let|var|final)[ \t]+)?"
    r"([A-Z0-9_]*(?:SHIFT|HOUR)[A-Z0-9_]*)"
    r"[ \t]*(?::[^=\n]*?)?"
    r"=[ \t]*-?\d"
)


def test_no_shift_hour_constant_is_declared_in_application_code():
    offenders = []
    for root in ("backend/app", "frontend/src"):
        directory = REPO / root
        if not directory.is_dir():
            continue
        for path in list(directory.rglob("*.py")) + list(directory.rglob("*.ts")) + list(
            directory.rglob("*.tsx")
        ):
            for match in SHIFT_HOUR_CONSTANT.finditer(path.read_text(encoding="utf-8")):
                offenders.append(f"{path.relative_to(REPO)}: {match.group(0).strip()}")
    assert not offenders, f"D17: shift-hour constants in application code: {offenders}"


def test_the_fixture_is_committed_and_deterministic():
    fixture = REPO / "seed" / "wcah_seed.sql"
    assert fixture.is_file()
    check = REPO / "seed" / "_determinism_check.sql"
    try:
        result = subprocess.run(
            [sys.executable, "-m", "tools.convert_workbook", "--out", str(check)],
            cwd=REPO, capture_output=True, text=True,
        )
        assert result.returncode == 0, result.stdout + result.stderr
        assert check.read_bytes() == fixture.read_bytes()
    finally:
        check.unlink(missing_ok=True)


def test_conversion_md_documents_the_full_code_map():
    conversion = (REPO / "seed" / "CONVERSION.md").read_text(encoding="utf-8")
    with engine.connect() as conn:
        codes = [
            row[0]
            for table in (
                "core.organization", "core.day_of_week", "core.location", "core.title",
                "scheduling.department", "scheduling.role", "scheduling.shift_pattern",
            )
            for row in conn.execute(text(f"SELECT code FROM {table}"))
        ]
    missing = [code for code in codes if code not in conversion]
    assert missing == [], f"undocumented canonical codes: {missing}"


def test_every_route_in_the_spec_exists(client):
    paths = set(client.get("/openapi.json").json()["paths"])
    assert paths == {
        "/healthz",
        "/api/reference",
        "/api/departments",
        "/api/departments/{department_id}",
        "/api/default-needs",
        "/api/employees",
        "/api/employees/{employee_id}",
        "/api/hospital-constraints",
    }


def test_the_scan_passes_with_no_exception_list():
    result = subprocess.run(
        [sys.executable, "-m", "tools.scan_domain_codes"],
        cwd=REPO, capture_output=True, text=True,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    source = (REPO / "tools" / "scan_domain_codes.py").read_text(encoding="utf-8")
    for forbidden in ("ALLOWLIST", "EXCEPTIONS", "IGNORE_CODES", "# noqa: domain"):
        assert forbidden not in source


def test_the_docs_corpus_is_present_with_an_index():
    index = REPO / "docs" / "README.md"
    assert index.is_file()
    body = index.read_text(encoding="utf-8")
    for status in ("Current", "Superseded", "Mockup-only"):
        assert status in body
```

- [ ] **Step 2: Run it**

Run: `cd backend; python -m pytest tests/test_definition_of_done.py -v`
Expected: 7 passed — the six §11 bullets plus the D17 shift-hour-constant guard. Any
failure names the unmet bullet directly.

- [ ] **Step 2b: Mutation-probe the D17 guard**

`test_no_shift_hour_constant_is_declared_in_application_code` is an absence guard, so it
is worthless until it has been seen to fail. Plant `SHIFT_HOURS = 10` in a module under
`backend/app`, run the test, confirm it FAILS and names the file and the offending line.
Then remove the plant and confirm the tree is clean and the test passes. Quote the verbatim
failure in your report.

Probe the TypeScript side too if `frontend/src` exists by then: plant
`const SHIFT_HOURS = 10;` and confirm it is reported, since the regex and the file
globbing are separate things that can each be wrong. The pattern was probed against
that exact declaration form, so if it is NOT reported the fault is in the file globbing
or the roots — say which, rather than loosening the regex.

Say plainly in your report what this guard does NOT catch — a lowercase local variable, an
inline literal, or a value read from an environment variable would all pass. It is a
tripwire for the obvious mistake, and the real guarantee arrives when the scheduling engine
resolves hours and can be tested behaviourally.

- [ ] **Step 3: Add the backend service to Compose**

Append to `oms-new/infra/docker-compose.yml`, above the `volumes:` block:

```yaml
  backend:
    build:
      context: ../backend
      dockerfile: ../infra/backend.Dockerfile
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      OMS_DATABASE_URL: postgresql+psycopg://oms:oms@postgres:5432/oms_new
    ports:
      - "8000:8000"
    profiles: ["parity"]
```

Create `oms-new/infra/backend.Dockerfile`:

```dockerfile
FROM python:3.12-slim
WORKDIR /srv
COPY pyproject.toml ./
COPY app ./app
RUN pip install --no-cache-dir .
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

The `parity` profile keeps it out of `docker compose up -d postgres`, which stays the daily path (spec §10.3).

- [ ] **Step 4: Write the CI workflow**

Create `oms-new/.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  backend:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: oms
          POSTGRES_PASSWORD: oms
          POSTGRES_DB: oms_new
        ports: ["5433:5432"]
        options: >-
          --health-cmd "pg_isready -U oms -d oms_new"
          --health-interval 5s --health-timeout 5s --health-retries 20
    defaults:
      run:
        working-directory: backend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
          cache: pip
      - run: pip install -e ".[dev]"
      # Both trees, from the repo root, so root ruff.toml applies.
      # `ruff check .` from `backend` silently skips `tools/`.
      - run: ruff check backend tools
        working-directory: .
      - run: python -m alembic upgrade head
      - run: python -m app.seed.load
      - run: python -m pytest -v

  frontend:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: frontend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "24"
          cache: npm
          cache-dependency-path: frontend/package-lock.json
      - run: npm ci
        # frontend/.npmrc sets legacy-peer-deps=true (TypeScript 6 vs openapi-typescript ^5).
      - run: npm run typecheck
      - run: npm test
      - run: npm run build

  domain-code-scan:
    # Stands alone so a failure says exactly what it is (spec section 10.4).
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
      - name: No canonical domain code may appear in source
        run: python -m tools.scan_domain_codes
```

The scan job installs nothing: `tools/scan_domain_codes.py` imports only the standard library and `tools.code_map`.

It also sets no `working-directory`, which is deliberate — the job runs at the checkout root, and that root is where `tools` is importable. Every `python -m tools.*` invocation in this plan runs from the repository root for the same reason: `pythonpath = [".", ".."]` in `backend/pyproject.toml` is a pytest-only setting and has no effect on `python -m`.

- [ ] **Step 5: Write the README**

Create `oms-new/README.md`:

```markdown
# oms-new

A database-driven rebuild of the OMS shift-scheduling module for West Coast Animal
Hospital, on Python FastAPI, PostgreSQL, and React.

**The governing rule: no domain data resides outside the database.** Departments,
roles, people, constraints, and every value they carry live in PostgreSQL and reach the
browser over HTTP. A static scan fails the build on any hardcoded canonical code, with
no exception list.

This first sub-project is a thin vertical slice: schema, seed conversion, a read-only
API, and two screens. See `docs/superpowers/specs/2026-08-11-oms-new-foundation-slice-design.md`
for the design and its 23 decisions, and `docs/README.md` for the documentation index.

## Running it

Requires Docker, Python 3.12, and Node 24.

```
docker compose -f infra/docker-compose.yml up -d postgres

cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1        # PowerShell; use source .venv/bin/activate elsewhere
pip install -e ".[dev]"
python -m alembic upgrade head
python -m app.seed.load
uvicorn app.main:app --reload --port 8000
```

In a second shell:

```
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. You should see the hospital's eight departments, twelve
roles, coverage grid, and thirty-seven employees with their titles, eligibilities, and
rotations — none of which is written anywhere in source.

## Checks

```
cd backend
python -m pytest                    # backend and tools
cd ..
python -m tools.scan_domain_codes   # the no-hardcoded-data gate, from the root

cd frontend
npm run typecheck
npm test
```

## Regenerating the seed fixture

`seed/wcah_seed.sql` is committed and deterministic. It is regenerated only if the
converter changes:

```
python -m tools.convert_workbook
```

Run it from the repository root; `tools` is not importable from `backend`.

The archived workbook at `seed/source/` is provenance, not an input to the application
or to CI. Corrections to the data are made through the application, not by editing it.

## Layout

| Path | What it is |
|---|---|
| `backend/app/core/`, `backend/app/scheduling/` | Python packages mirroring the PostgreSQL schemas. |
| `backend/migrations/` | Alembic. Structure only; no domain codes. |
| `frontend/src/api/schema.d.ts` | Generated from OpenAPI. Never hand-edited. |
| `tools/` | Code map, rotation cell parser, one-time converter, static scan. |
| `seed/` | The committed fixture, its conversion notes, and the archived workbook. |
| `docs/` | The full inherited corpus with an index marking what still governs. |
```

- [ ] **Step 6: Verify from a clean state**

Run, following the README exactly:
```
docker compose -f infra/docker-compose.yml down -v
docker compose -f infra/docker-compose.yml up -d postgres
cd backend
python -m alembic upgrade head
python -m app.seed.load
python -m pytest -v
cd ..
python -m tools.scan_domain_codes
cd frontend
npm run typecheck
npm test
npm run build
```
Expected: every command succeeds. If a README step does not work verbatim, fix the README, not the shell history.

- [ ] **Step 7: Commit**

```powershell
git add .github README.md infra backend/tests/test_definition_of_done.py frontend/.npmrc docs/superpowers/plans/2026-08-11-oms-new-foundation-slice.md
git commit -m "ci: add three-job pipeline and definition-of-done checks"
```

---

## Self-review against the spec

Run this before declaring the plan finished.

### Spec coverage

| Spec section | Requirement | Task |
|---|---|---|
| §3 in scope | 18 tables with Alembic migrations | 4, 5, 6 |
| §3 | `organization` table and `organization_id` everywhere required | 4, 5, 6 |
| §3 | One-time converter with documented code map and assumptions | 8, 9 |
| §3 | Read-only FastAPI including `GET /api/reference` | 12–16 |
| §3 | React + TypeScript with Configuration and Team | 17, 18, 19 |
| §3 | Static scan failing the build | 11, 20 |
| §3 | Tests both sides, Docker Compose, CI | 1, 20 |
| §3 | `oms/docs` corpus with README index | 2 |
| §4 | Repository structure as drawn | 1, 2, 17 |
| §5 | Every table's key columns | 4, 5, 6 |
| §5.3 | Each deviation from schema v2 | 4, 5, 6 (asserted in `test_migrations.py`) |
| §5.4 | Invariants I1, I10–I15; dropped legacy types absent | 5, 6, 9 |
| §6 | Namespaced identifiers, override table, `CONVERSION.md` map, A22 closed | 3, 8 |
| §7 | Determinism, loading outside migrations, the three transformations, coverage rulings, label corrections, paid hours, D5 rulings, `role.short_label`, dead columns, row-count guard | 7, 8, 9, 10 |
| §8 | All eight routes, `snake_case`, server-side org scoping, RFC 9457, no pagination | 12–16 |
| §9 | Generated client, TanStack Query, boot-time reference, both screens | 17, 18, 19 |
| §10.1 | Scan from the fixture, no exception list, codes not display text | 11 |
| §10.2 | Real PostgreSQL, migration up/down, parser corpus, row counts, contract tests, typed frontend fixtures | 1, 4, 7, 8, 12–16, 17 |
| §10.3 | Compose for PostgreSQL, native uvicorn and vite | 1, 20 |
| §10.4 | Three CI jobs with the scan standing alone | 20 |
| §11 | Every definition-of-done bullet | 20 |

Deliberately not built, per spec §3 and §13: all writes, the week lifecycle, time off, the board, generation, DVM team assignment, authentication, commission, department ordering and `department_constraint`, `employment_period`, `employee_location`, `employee_constraint`. `test_migrations.py::test_deferred_tables_are_absent` asserts they stay absent.

### Two values to confirm at implementation time

Both are pinned by a test the moment they are known, so neither can drift.

1. `tools/tests/test_code_map.py::test_row_uuid_is_pinned` carries a placeholder UUID until Task 3 Step 4 prints the real one.
2. `tools/tests/test_scan_domain_codes.py` pins `EXPECTED_CODE_COUNT`. The arithmetic 1 + 7 + 2 + 4 + 8 + 12 + 1 totals 35, not the 34 the plan first asserted; take the registry's real count on first run (findings F11 and F12).

### Type consistency

`canonical_code(kind, source_code)`, `row_uuid(seed)`, `parse_cell(raw) -> ParsedCell`, `codes_from_manifest(path)`, `scan(roots, codes) -> list[Violation]`, `load_fixture(path)`, `convert(workbook_path, out_path) -> dict[str, int]`, `get_organization(db)`, `not_found(resource, identifier)`, `orderDays(days, weekStartDayId)`, `bySortOrder`, `byRankThenName`, `useReference(): Reference` — each is defined once and referenced under the same name everywhere it appears.

`ParsedCell.kind` is `"ROLE" | "OFF" | "ANY"` in the parser, in the `rotation_cell.kind` CHECK constraint, in `RotationCellOut.kind`, and in the Team screen's `RotationCell`. `EmployeeSummaryOut` is extended by `EmployeeDetailOut`, and `DepartmentOut` by `DepartmentWithRolesOut` by `DepartmentDetailOut`, so no field is declared twice with different types.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-11-oms-new-foundation-slice.md`. Two execution options:

1. **Subagent-Driven (recommended)** — a fresh subagent per task with review between tasks, using superpowers:subagent-driven-development.
2. **Inline Execution** — tasks executed in one session with checkpoints, using superpowers:executing-plans.

Per the handoff note, development and coding tasks go to a GPT-5.6 model.
