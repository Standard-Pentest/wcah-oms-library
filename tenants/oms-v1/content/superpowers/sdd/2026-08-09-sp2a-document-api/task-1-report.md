# Task 1 Report: Backend scaffold + settings + DB session + `/healthz`

Branch: `sp2a-document-api`
Commit: `f0c0bdf4d9bcd24836cd86d7a718c6dbc7d3a615` — "feat(backend): FastAPI scaffold + settings + DB session + healthz"

## What was implemented

Followed the task brief's steps exactly, verbatim, with no deviations or extra
abstractions:

- `backend/requirements.txt` — pinned dependencies (fastapi, uvicorn[standard],
  sqlalchemy, psycopg[binary], alembic, pydantic, pydantic-settings, pytest,
  httpx) at the exact versions listed in the brief.
- `backend/app/__init__.py` — empty, marks `app` as a package.
- `backend/app/settings.py` — `Settings(BaseSettings)` with `database_url`
  (default `postgresql+psycopg://oms:oms@localhost:5432/oms`) and
  `schema_version` (default `4`), loaded from `.env` if present, extra fields
  ignored. Module-level `settings = Settings()` instance.
- `backend/app/db.py` — SQLAlchemy `create_engine`/`sessionmaker` bound to
  `settings.database_url`; `Base(DeclarativeBase)` for future models;
  `get_session()` generator dependency that yields a `Session` and always
  closes it.
- `backend/app/main.py` — `FastAPI(title="OMS Document API")` instance
  exported as `app`; single `GET /healthz` endpoint that depends on
  `get_session`, runs `SELECT 1` against the DB, and returns
  `{"status": "ok"}`.
- `backend/tests/__init__.py` — empty, marks `tests` as a package.
- `backend/tests/conftest.py` — `client` fixture wrapping `app.main:app` in a
  `TestClient`.
- `backend/tests/test_health.py` — `test_healthz_ok` asserting `GET /healthz`
  returns 200 and `{"status": "ok"}`.
- Root `.gitignore` — appended `backend/.venv/`, `__pycache__/`, `*.pyc`
  (the venv itself was not committed).

No endpoints, models, or abstractions beyond what the brief specifies were
added (YAGNI honored).

## Environment setup

- Virtualenv: `python3.12 -m venv backend/.venv`
- Installed deps: `backend/.venv/bin/pip install -r backend/requirements.txt`
  — all 9 packages installed at the exact pinned versions (verified via
  `pip list`), no resolver conflicts.
- Postgres: started via
  `docker run --rm -d --name oms-pg -e POSTGRES_USER=oms -e POSTGRES_PASSWORD=oms -e POSTGRES_DB=oms -p 5432:5432 postgres:16`
  (no prior container existed). Confirmed ready with `pg_isready` within 1s.
  Left running at the end of this task — later SP2a tasks will likely reuse
  it for the same `settings.database_url`.

## TDD evidence

### RED — before `app/main.py` existed

Command (repo root, matches the brief's `-v` invocation):
```
backend/.venv/bin/python -m pytest tests/test_health.py -v
```
(run with cwd `backend/`, after `settings.py`, `db.py`, `__init__.py` files,
`conftest.py`, and `test_health.py` existed, but before `main.py` was created)

Output:
```
ImportError while loading conftest '/Users/hinchk/WestCoast.Vet/oms/backend/tests/conftest.py'.
tests/conftest.py:4: in <module>
    from app.main import app
E   ModuleNotFoundError: No module named 'app.main'
```
Exit code 4 — matches the brief's expected failure exactly
("`app.main` does not exist yet (ImportError)").

### GREEN — after `app/main.py` implemented + Postgres running

Command (repo root, as instructed so relative paths resolve for later tasks):
```
backend/.venv/bin/python -m pytest backend/tests/test_health.py -v
```
Output:
```
============================= test session starts ==============================
platform darwin -- Python 3.12.13, pytest-8.3.4, pluggy-1.6.0
rootdir: /Users/hinchk/WestCoast.Vet/oms
plugins: anyio-4.14.2
collecting ... collected 1 item

backend/tests/test_health.py::test_healthz_ok PASSED                     [100%]

============================== 1 passed in 0.08s ===============================
```

Also re-verified with the brief's literal invocation form
(`cd backend && .venv/bin/python -m pytest tests/test_health.py -v`) —
same PASSED result, confirming the import resolves correctly both ways
(pytest's rootdir insertion adds `backend/` to `sys.path` automatically
since `backend/__init__.py` does not exist but `backend/tests/__init__.py`
does; no explicit `PYTHONPATH` or `pytest.ini` was needed).

Re-ran once more after `git commit` to confirm no regression — still PASSED.

## Files changed

```
 .gitignore                   |  3 +++
 backend/app/__init__.py      |  0
 backend/app/db.py            | 19 +++++++++++++++++++
 backend/app/main.py          | 13 +++++++++++++
 backend/app/settings.py      | 10 ++++++++++
 backend/requirements.txt     |  9 +++++++++
 backend/tests/__init__.py    |  0
 backend/tests/conftest.py    |  9 +++++++++
 backend/tests/test_health.py |  4 ++++
 9 files changed, 67 insertions(+)
```

All file contents match the brief verbatim (settings.py, db.py, main.py,
conftest.py, test_health.py, requirements.txt).

## Self-review findings

- Verified via `find` (excluding `.venv`/`__pycache__`/`.pytest_cache`) that
  exactly the 8 files the brief lists exist under `backend/` — no stray
  files.
- Verified via `git status --short` after `git add` that exactly those 8
  files plus `.gitignore` were staged — no venv, no `__pycache__`, no
  `.pytest_cache` artifacts got committed.
- Confirmed `backend/.venv/` and `__pycache__/` are correctly matched by the
  new `.gitignore` rules via `git check-ignore -v`.
- `.pytest_cache/` at the repo root (created by running pytest from repo
  root) is self-ignoring — pytest drops its own `.gitignore` (`*`) inside
  that directory — so no extra root-`.gitignore` rule was needed for it.
- No files outside `backend/` and the root `.gitignore` were touched, per
  the task's scope constraint. Frontend suite (vitest) and
  `npm run conformance` were not run, per instructions.
- No authentication code, headers, or user tables were added, consistent
  with the "no auth anywhere" global constraint.
- Dependency versions in `requirements.txt` match the brief exactly
  (verified installed versions via `pip list` match the pins character for
  character).

## Concerns

None. Nothing was ambiguous; Postgres started cleanly on the first attempt;
all pinned dependencies installed without conflicts; the test went RED for
the expected reason and GREEN on the first implementation attempt with no
retries needed.

The `oms-pg` container is left running (not `docker stop`ped) since it is a
foreground `--rm -d` container the next SP2a task will likely need against
the same `database_url`; it will need to be stopped manually or by a later
task's teardown when no longer needed.
