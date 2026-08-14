# Task 2 report: Alembic migration `0001` — platform tables + sentinel row

## What I implemented

Exactly what the brief specifies, plus one environmental line in `alembic.ini` (see Deviations).

- `backend/app/models.py` — SQLAlchemy ORM models `ScheduleDocument` and
  `ScheduleDocumentHistory`, copied verbatim from the brief (Step 1).
- `backend/alembic.ini` — minimal config from the brief (Step 2), **plus**
  `prepend_sys_path = .` (see Deviations).
- `backend/alembic/env.py` — verbatim from the brief (Step 2).
- `backend/alembic/script.py.mako` — verbatim from the brief (Step 2).
- `backend/alembic/versions/0001_platform_document.py` — verbatim from the
  brief (Step 5): creates schema `platform`, tables
  `platform.schedule_document` and `platform.schedule_document_history` with
  the specified CHECK/UNIQUE/FK constraints, and inserts the single sentinel
  row `(id=1, revision=0)` (leaving `doc`/`schema_version` NULL and
  `revision` defaulted to `0`).
- `backend/tests/test_migration.py` — verbatim from the brief (Step 3).
- `backend/tests/conftest.py` — added the `migrated_db` fixture verbatim from
  the brief (Step 3), alongside the existing `client` fixture from Task 1.

No extra tables, columns, or migrations were added. No `app_user` table or
`*_by_user_id` columns were introduced.

## Deviation: `prepend_sys_path = .` added to `alembic.ini`

The brief's `alembic.ini` (Step 2) is minimal and doesn't include this line.
Without it, the RED run's `migrated_db` fixture's `alembic upgrade head`
subprocess failed with:

```
ModuleNotFoundError: No module named 'app'
```

Root cause: the fixture invokes the **installed `alembic` console script**
as a subprocess with `cwd="backend"`. Python sets `sys.path[0]` to the
console script's own directory (`backend/.venv/bin`), never to the process's
`cwd` — so `env.py`'s `from app.db import Base` cannot resolve regardless of
what `cwd=` is. This is a well-known Alembic gotcha with a documented,
built-in fix: Alembic's own `prepend_sys_path` config option
(`alembic/script/base.py:222-226` in the installed package) prepends the
given path — resolved against the process's cwd at env.py load time — onto
`sys.path`. Setting `prepend_sys_path = .` makes `.` resolve to `backend/`
(the fixture's `cwd`), which makes `app` importable, matching how `pytest`
already resolves `app` when run from the repo root.

This changes zero tables/columns/migration semantics — it's a subprocess
import-path fix for the exact `env.py` and fixture code specified verbatim
in the brief. Confirmed by testing `alembic upgrade head` directly from
`backend/` with the venv activated, and by the fixture-driven pytest GREEN
run below.

## TDD evidence

### RED

Command:
```
source backend/.venv/bin/activate
python -m pytest backend/tests/test_migration.py -v
```

This was run with `test_migration.py` and the `migrated_db` fixture in
`conftest.py` already in place, but before `alembic.ini` / `alembic/env.py` /
`alembic/script.py.mako` / `alembic/versions/0001_platform_document.py` /
`app/models.py` existed. This is legitimately a missing-migration-infra
failure (an `alembic` subprocess error), not an assertion failure on the
sentinel row — the test never got to the `SELECT` because setup errored:

```
============================= test session starts ==============================
platform darwin -- Python 3.12.13, pytest-8.3.4, pluggy-1.6.0
rootdir: /Users/hinchk/WestCoast.Vet/oms
plugins: anyio-4.14.2
collected 1 item

backend/tests/test_migration.py E                                        [100%]

==================================== ERRORS ====================================
_________ ERROR at setup of test_sentinel_row_exists_at_revision_zero __________
backend/tests/conftest.py:19: in migrated_db
    subprocess.run(["alembic", "upgrade", "head"], check=True, cwd="backend")
...
E   subprocess.CalledProcessError: Command '['alembic', 'upgrade', 'head']' returned non-zero exit status 255.
---------------------------- Captured stdout setup -----------------------------
FAILED: No config file 'alembic.ini' found, or file has no '[alembic]' section
FAILED: No config file 'alembic.ini' found, or file has no '[alembic]' section
=============================== 1 error in 0.57s ===============================
```

### GREEN

Command:
```
source backend/.venv/bin/activate
python -m pytest backend/tests/ -v
```

Output:
```
============================= test session starts ==============================
platform darwin -- Python 3.12.13, pytest-8.3.4, pluggy-1.6.0 -- /Users/hinchk/WestCoast.Vet/oms/backend/.venv/bin/python
cachedir: .pytest_cache
rootdir: /Users/hinchk/WestCoast.Vet/oms
plugins: anyio-4.14.2
collecting ... collected 2 items

backend/tests/test_health.py::test_healthz_ok PASSED                     [ 50%]
backend/tests/test_migration.py::test_sentinel_row_exists_at_revision_zero PASSED [100%]

============================== 2 passed in 0.66s ===============================
```

Both the pre-existing Task 1 `/healthz` test and the new migration test pass.

## Self-review: constraint teeth verification

Beyond confirming the constraints *exist* (via `\d platform.schedule_document`
/ `\d platform.schedule_document_history`), I directly probed that they
*reject* bad data (run against the live `oms-pg` container, then reset via
the fixture's downgrade/upgrade cycle so the DB was left clean for Task 3):

- **Shape CHECK** (`schedule_document_revision_zero_shape`): `UPDATE
  platform.schedule_document SET revision=1 WHERE id=1;` →
  `ERROR: new row for relation "schedule_document" violates check
  constraint "schedule_document_revision_zero_shape"`. The failed statement
  rolled back; a follow-up `SELECT` showed the sentinel untouched
  (`id=1, revision=0, doc=NULL, schema_version=NULL`).
- **FK** (`schedule_document_history_document_id_fkey`): inserting a history
  row with `document_id=2` → `ERROR: ... violates foreign key constraint
  ... Key (document_id)=(2) is not present in table "schedule_document"`.
- **UNIQUE** (`schedule_document_history_rev_unique`): inserting
  `(document_id=1, revision=1)` twice → the second insert failed with
  `ERROR: duplicate key value violates unique constraint
  "schedule_document_history_rev_unique"`.

After probing, I re-ran `python -m pytest backend/tests/ -v` (both tests
PASS — the fixture's `alembic downgrade base` + `upgrade head` cycle wipes
and recreates the schema) and confirmed directly in Postgres that
`platform.schedule_document` holds exactly the sentinel row and
`platform.schedule_document_history` is empty. The repo is left in a clean
state for Task 3.

Note on the `\d` rendering of the shape CHECK: `psql` prints it without the
outer parens —
`CHECK (revision = 0 AND doc IS NULL AND schema_version IS NULL OR revision > 0 AND doc IS NOT NULL AND schema_version IS NOT NULL)`
— this is cosmetic; `AND` binds tighter than `OR` in SQL, so the stored
semantics match the brief's parenthesized source exactly (verified
behaviorally by the probe above).

## Files changed

- `backend/app/models.py` (new)
- `backend/alembic.ini` (new)
- `backend/alembic/env.py` (new)
- `backend/alembic/script.py.mako` (new)
- `backend/alembic/versions/0001_platform_document.py` (new)
- `backend/tests/test_migration.py` (new)
- `backend/tests/conftest.py` (modified — added `migrated_db` fixture)

Only `backend/` was touched. `src/`, `conformance/`, and the frontend were
not touched.

## Concerns for later tasks (not fixed here — out of scope for Task 2)

- **ORM/DDL drift that will show up under `--autogenerate`**: `revision` is
  `default=0` (Python-side) in `models.py` but `server_default="0"` (DB-side)
  in the migration DDL — both are correct and consistent with the brief, but
  an `alembic revision --autogenerate` in a later task may flag this as a
  spurious diff. `updated_at`/`written_at` are typed `Mapped[object]` rather
  than a concrete Python datetime type. `env.py`'s `context.configure(...)`
  doesn't pass `include_schemas=True`, which autogenerate typically wants
  when models live in a non-`public` schema. None of this affects Task 2's
  correctness — flagging only so Task 3+ isn't surprised by autogenerate
  noise.
- The `prepend_sys_path = .` addition (see Deviations) is the only departure
  from the brief's literal file contents; everything else was copied
  verbatim.
