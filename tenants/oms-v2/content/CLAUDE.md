# OMS-New

**`AGENTS.md` is the entry point and outranks this file; this file is the
binding source for the operational hard rules below.** `HANDOFF.md` is history
and status, not a rule source — see `AGENTS.md` §0 for the full precedence
order.

Database-driven rebuild of the West Coast Animal Hospital shift-scheduling
module on Python FastAPI, PostgreSQL, and React. Spec:
`docs/superpowers/specs/2026-08-11-oms-new-foundation-slice-design.md`.
Implementation plan: `docs/superpowers/plans/2026-08-11-oms-new-foundation-slice.md`.
Authoritative model: Track D schema v2
(`docs/superpowers/specs/2026-08-07-oms-modular-database-schema-design.md`, as
amended by the foundation-slice spec §5.3) and `docs/oms-domain-model.md`.

`../oms` is a retained React mockup reference only. No code is carried across;
do not modify it from this work, and do not treat its JSONB document, hardcoded
seed, or in-source roster as a model (D9).

## Commands

- `docker compose -f infra/docker-compose.yml up -d postgres` — PostgreSQL 16 on
  host port 5433 (`oms` / `oms` / `oms_new`)
- Backend (from `backend/`): `uvicorn app.main:app --reload` — FastAPI after
  migrate + seed
- Frontend (from `frontend/`): `npm run dev` — Vite once the app exists
- `pytest` (from `backend/`) — backend + `tools/tests` against real Postgres
- Frontend: `npx vitest run`, `npm run build` — when `frontend/` exists
- `python tools/scan_domain_codes.py` — fails if any declared canonical code
  (converter manifest) appears under `backend/app` or `frontend/src`
- Converter (one-time): `python tools/convert_workbook.py` — writes
  `seed/wcah_seed.sql`; application runtime never reads the `.xlsx`

Platform is Windows / PowerShell: use `;` not `&&`; use `git commit -F <file>`
instead of heredocs. A fresh shell is required before `python` resolves to 3.12
rather than the Microsoft Store stub.

## Layout

PostgreSQL owns every domain value. Packages mirror database schemas.

```
oms-new/
  backend/                 Python 3.12, FastAPI, SQLAlchemy 2, Alembic
    app/core/              organization, location, title, employee, …
    app/scheduling/        department, role, default_need, rotations, …
    app/api/               routers and response schemas
    app/seed/              fixture loader command
    migrations/            structure only — no domain codes
    tests/
  frontend/                React 18, TypeScript, Vite, Tailwind v4
    src/api/               OpenAPI-generated client — never hand-written
    src/reference/         boot-time reference data provider
    src/screens/           Configuration, Team
  tools/
    convert_workbook.py    one-time V5 → SQL fixture converter
    code_map.py            canonical code rule and overrides
    scan_domain_codes.py   static no-hardcoded-code guard
  seed/
    wcah_seed.sql          committed frozen fixture
    CONVERSION.md          assumptions and full code map
    source/                archived .xlsx provenance, not an input
  docs/                    corpus + README index (current / superseded / mockup-only)
  infra/docker-compose.yml
```

## Hard rules

- **No domain data outside the database.** Departments, roles, people,
  constraints, and every value they carry live in PostgreSQL and reach the
  browser over HTTP. Components may keep static UI chrome; they must not embed
  domain values, enums, short labels, or sort orders (D7).
- **Canonical codes are namespaced by kind** (D10): `department_csr`,
  `role_csr`, `title_csr`. Rule: `{kind}_{snake_case(source_code)}` in
  `tools/code_map.py`. Never adopt workbook vocabulary as identifiers verbatim.
- **Domain-code set is declared, not harvested.** The converter generates both
  the declared code set / manifest and the seed rows from the same source of
  truth. Do not infer codes by scanning SQL text; do not use heuristic
  extraction from fixture values (see `AGENTS.md` §0 Fixture and schema design,
  and plan finding F11).
- **`tools/scan_domain_codes.py` has no exception list.** It fails CI if any
  declared canonical code appears in `backend/app` or `frontend/src`. It scans
  codes, not `name` / `short_label`.
- **`snake_case` on the wire** (D12). Database, Python, and JSON agree; no
  mapping layer.
- **UUID primary keys are UUIDv5** derived from the canonical code (D13).
  `(organization_id, code)` is the natural unique key.
- **`organization_id` on every table** except universal `core.title` and
  `core.day_of_week`. Tenancy seam only — always WCAH; no org in URLs (D3).
- **Migrations create structure only.** No domain codes in Alembic. Load
  `seed/wcah_seed.sql` via the separate seed command (D4).
- **No JSONB document envelope** (D9). Relational from migration 1.
- **No shift-hour constant** (D17). Paid hours resolve through
  `rotation_cell.paid_hours` else non-nullable
  `employee_profile.default_shift_pattern_id`.
- **Week start is data** (D18). Display order is computed from
  `organization.week_start_day_id` and `day_of_week.iso_index`; never hardcode
  Sunday.
- **`default_need` admits no unevaluable state** (D22): `location_id`,
  `quantity`, `weight` all `NOT NULL`; `quantity > 0`; no `formula`, no
  `condition`. Absent means no need.
- **Fixture design precedes fixture content.** Choose the cleanest schema and
  explicit code set first; rewrite seed rows, names, and tests to match. The
  fixture is flexible; do not reverse-engineer design from its current rows
  (D21, `AGENTS.md` §0).
- **Track D invariants I1–I15 hold.** No home department; no employee-scope
  constraints; no `auto_assign`; coverage is location-scoped;
  `counts_toward_need` is a column on `role`, not a code test. Do not resurrect
  dropped constraint types (`DAY_AVAILABILITY`, `FIXED_DAY_SET`, etc.).
- **Internal vocabulary is `constraint`; UI says "Policies"** (D20).
- **Frontend TypeScript from day one** (D11). API client is generated from
  OpenAPI; a renamed column must be a build failure.
- **Out of scope for this slice — do not build:** writes/CRUD, week lifecycle,
  time off, the board, schedule generation, DVM team assignment, auth,
  commission, department ordering / `department_constraint`,
  `employment_period`, `employee_location`, `employee_constraint` (spec §3 / §13).
- Design tokens live in frontend `@theme`; components use token classes, never
  raw hex.
- Ubiquitous language: Roster, Pattern, Rotation, Toggle, Week Setup, Time Off,
  Makeup Shift, Override, Proposed Schedule, Coverage, Gap, Violation, Pull
  Order, Publish, Location, DVM count, Team assignment. Glossary:
  `docs/oms-domain-model.md` §2.
- Domain rulings live in `docs/decisions/` — read the oms-new applicability
  note at the top of each file before applying mockup-era surface language.
  Docs status is in `docs/README.md`. Within the broader corpus (not the
  `AGENTS.md` precedence chain): foundation-slice spec > Track D schema prose
  > older / mockup-only docs. PRD v0.7.6 is background intent only — Track D
  wins (D1).
- Do not commit unless Tom asks, except where a plan task explicitly authorizes
  a local commit. Never push, force-push, amend, or rebase unless asked.
