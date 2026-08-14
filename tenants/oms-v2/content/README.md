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
