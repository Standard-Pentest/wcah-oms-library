# SP2a — Document API + Server-Authoritative Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a local FastAPI + Postgres backend that stores the OMS scheduling document with atomic revision-based lost-update rejection, and swap the frontend persistence seam from IndexedDB to that API — with honest-offline behavior and no authentication.

**Architecture:** A thin FastAPI service persists one JSONB document (single sentinel row, `id=1`) plus an append-only history table; writes are one atomic `UPDATE … WHERE revision = :base RETURNING`. On the frontend, a new `createOmsApiStore` adapter (same `load`/`save`/`clear` names) owns the revision, a single-in-flight/coalescing save queue, and an envelope-level last-known-good cache; `OmsContext` gains a small save/read-only state machine. The server persists only the scheduling projection (`doc.ui` stripped).

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy 2.x, Alembic, psycopg 3, pytest + httpx (backend); JavaScript ESM, native `fetch`, Vitest + Testing Library + jsdom (frontend); Postgres 16, Docker Compose (infra).

**Spec:** `docs/superpowers/specs/2026-08-09-sp2a-document-api-design.md` (§6 is authoritative for queueing, cache, and UI behavior).

## Global Constraints

- **No authentication** (HANDOFF decision 19). No Entra, no break-glass, no `app_user`, no `*_by_user_id` columns. No auth headers on any route.
- **Server persists only `PersistedHospitalDocument`** — the v4 document with `ui` removed. `doc.ui` never reaches Postgres or history. A `PUT` whose `doc` contains `ui` is rejected `422`.
- **`revision` never enters the domain document.** It lives in the DB column, the API envelope, and inside the store adapter only (decision 20).
- **The write is one atomic statement:** `UPDATE platform.schedule_document SET revision = revision + 1, … WHERE id = 1 AND revision = :base_revision RETURNING revision`. Never `SELECT` then unconditional `UPDATE`.
- **One `PUT` in flight per client**, latest-write coalescing, and an equal-projection no-op (hydration, reload, and UI-only changes never create a revision).
- **`clear()` is local-cache maintenance only.** Reset-to-seed is an audited `PUT`, not a `clear()`.
- **Same-origin API.** `VITE_API_BASE=/api`; Vite dev proxies `/api` to the backend, so no CORS policy exists.
- **Do not touch `src/engine`, `src/seed`, `src/domain`, `src/data`, or any `conformance/` fixture.** `src/data/parity-aug02.test.js` and `npm run conformance` must be unchanged by this work. Capture the pre-SP2a conformance report state before starting (Task 0) so SP2a is never blamed for the known `Sharko Thu` ratchet item.
- **Frontend adds no new runtime dependencies** (use native `fetch`). Backend deps are pinned in `backend/requirements.txt`.
- **Component/context tests** start with `// @vitest-environment jsdom` and rely on `src/test-setup.js` (already registers Testing Library cleanup).
- **Commits:** one working branch for SP2a (e.g. `sp2a-document-api`); commit at each step marked *Commit*. End every commit message with:
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
- **Versions to keep distinct** (spec §7): `doc.version` (domain, `4`), `schemaVersion`/`schema_version` (persistence envelope, `4`), `revision` (write counter). Never couple them.

---

## Module contracts (shared signatures used across tasks)

These names are fixed. Tasks that consume them must use these exact signatures.

**`src/state/omsProjection.js`** (Task 6)
- `toPersistedOms(doc) -> persisted` — returns `{ ...doc }` with `ui` deleted.
- `defaultUi(persisted) -> ui` — `{ screen: 'board', selectedWeek: persisted.weekOrder?.[0] ?? null, aiOpen: false, selectedPtoId: null }`.
- `hydrateOms(persisted, localUi) -> doc` — `{ ...persisted, ui: localUi ?? defaultUi(persisted) }`.

**`src/state/omsEnvelope.js`** (Task 7)
- `serializeOmsEnvelope({ revision, doc }) -> string` — JSON of `{ schemaVersion: 4, revision, doc }` where `doc` is already persisted (no `ui`).
- `deserializeOmsEnvelope(string) -> { schemaVersion, revision, doc }` — throws `{ code: 'version-mismatch' }` when `schemaVersion !== 4`.
- `createOmsEnvelopeCache({ dbName }) -> { loadEnvelope(): Promise<envelope|null>, saveEnvelope(envelope): Promise<void>, clearEnvelope(): Promise<void> }` — IndexedDB-backed.
- `createMemoryEnvelopeCache() -> { loadEnvelope, saveEnvelope, clearEnvelope }` — in-memory, for tests.

**`src/state/omsActionClass.js`** (Task 8)
- `SCHEDULING_MUTATIONS: Set<string>`, `LOCAL_ONLY_ACTIONS: Set<string>`, `SYSTEM_ACTIONS: Set<string>`.
- `classifyAction(type) -> 'scheduling' | 'local' | 'system'` — throws `Error('unclassified action: ' + type)` for anything unknown.

**`src/state/omsApiStore.js`** (Task 9)
- `createOmsApiStore({ baseUrl, cache }) -> { load(): Promise<persisted|null>, save(doc): Promise<void>, clear(): Promise<void> }`.
  - `load()` resolves the persisted doc (or `null` at revision 0); throws `{ code: 'offline-cache', cachedDoc }` or `{ code: 'offline' }` on network failure.
  - `save(doc)` resolves on acceptance; throws `{ code: 'stale-write', currentRevision }` or `{ code: 'offline' }`.
  - `clear()` clears only the injected `cache`.

**Backend service** (Tasks 1–4)
- `GET /api/document -> { doc: persisted|null, revision: int, schema_version: int|null }`
- `PUT /api/document { doc, base_revision, schema_version } -> { revision } | 409 { error, current_revision } | 422`
- `GET /healthz -> { status: "ok" }`

---

## Task 0: Capture pre-SP2a baseline

**Files:** none committed (evidence only).

- [ ] **Step 1: Record the current conformance + suite state**

Run:
```bash
npx vitest run 2>&1 | tail -5
npm run conformance --silent 2>&1 | tail -1
```
Expected: `322 pass / 1 fail` (the `baseline.test.js` ratchet), conformance report `schedule {…,"extra":1,…}`. Save this output in the task ledger. SP2a must not change these numbers except the pass count rising as new tests are added.

- [ ] **Step 2: Create the working branch**

```bash
git checkout -b sp2a-document-api
```

---

## Task 1: Backend scaffold + settings + DB session + `/healthz`

**Files:**
- Create: `backend/requirements.txt`, `backend/app/__init__.py`, `backend/app/settings.py`, `backend/app/db.py`, `backend/app/main.py`
- Create: `backend/tests/__init__.py`, `backend/tests/conftest.py`, `backend/tests/test_health.py`

**Interfaces:**
- Produces: `app.main:app` (FastAPI instance), `app.db:get_session` (FastAPI dependency yielding a SQLAlchemy `Session`), `app.settings:settings.database_url`.

- [ ] **Step 1: Pin dependencies**

Create `backend/requirements.txt`:
```
fastapi==0.115.6
uvicorn[standard]==0.34.0
sqlalchemy==2.0.36
psycopg[binary]==3.2.3
alembic==1.14.0
pydantic==2.10.4
pydantic-settings==2.7.0
pytest==8.3.4
httpx==0.28.1
```

- [ ] **Step 2: Settings + DB session**

Create `backend/app/settings.py`:
```python
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    database_url: str = "postgresql+psycopg://oms:oms@localhost:5432/oms"
    schema_version: int = 4


settings = Settings()
```

Create `backend/app/db.py`:
```python
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .settings import settings

engine = create_engine(settings.database_url, future=True)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False, future=True)


class Base(DeclarativeBase):
    pass


def get_session():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
```

Create `backend/app/__init__.py` (empty) and `backend/tests/__init__.py` (empty).

- [ ] **Step 3: Write the failing health test**

Create `backend/tests/conftest.py`:
```python
import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client():
    return TestClient(app)
```

Create `backend/tests/test_health.py`:
```python
def test_healthz_ok(client):
    resp = client.get("/healthz")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}
```

- [ ] **Step 4: Run it and watch it fail**

Run: `cd backend && python -m pytest tests/test_health.py -v`
Expected: FAIL — `app.main` does not exist yet (ImportError).

- [ ] **Step 5: Implement the app + healthz**

Create `backend/app/main.py`:
```python
from fastapi import Depends, FastAPI
from sqlalchemy import text
from sqlalchemy.orm import Session

from .db import get_session

app = FastAPI(title="OMS Document API")


@app.get("/healthz")
def healthz(session: Session = Depends(get_session)):
    session.execute(text("SELECT 1"))
    return {"status": "ok"}
```

- [ ] **Step 6: Run it and watch it pass**

Requires a local Postgres reachable at `settings.database_url`. Start one:
```bash
docker run --rm -d --name oms-pg -e POSTGRES_USER=oms -e POSTGRES_PASSWORD=oms -e POSTGRES_DB=oms -p 5432:5432 postgres:16
```
Run: `cd backend && python -m pytest tests/test_health.py -v`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/
git commit -m "feat(backend): FastAPI scaffold + settings + DB session + healthz"
```

---

## Task 2: Alembic migration `0001` — tables + sentinel row

**Files:**
- Create: `backend/alembic.ini`, `backend/alembic/env.py`, `backend/alembic/script.py.mako`, `backend/alembic/versions/0001_platform_document.py`
- Create: `backend/app/models.py`
- Test: `backend/tests/test_migration.py`

**Interfaces:**
- Produces: ORM models `app.models:ScheduleDocument`, `app.models:ScheduleDocumentHistory`; a migrated `platform` schema with one sentinel row (`id=1, revision=0, doc=NULL, schema_version=NULL`).

- [ ] **Step 1: Define ORM models**

Create `backend/app/models.py`:
```python
from sqlalchemy import BigInteger, CheckConstraint, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, TIMESTAMP
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from .db import Base

SCHEMA = "platform"


class ScheduleDocument(Base):
    __tablename__ = "schedule_document"
    __table_args__ = (
        CheckConstraint("id = 1", name="schedule_document_singleton"),
        CheckConstraint("revision >= 0", name="schedule_document_revision_nonneg"),
        CheckConstraint(
            "(revision = 0 AND doc IS NULL AND schema_version IS NULL) "
            "OR (revision > 0 AND doc IS NOT NULL AND schema_version IS NOT NULL)",
            name="schedule_document_revision_zero_shape",
        ),
        {"schema": SCHEMA},
    )
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    schema_version: Mapped[int | None] = mapped_column(Integer, nullable=True)
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    doc: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    updated_at: Mapped[object] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now())


class ScheduleDocumentHistory(Base):
    __tablename__ = "schedule_document_history"
    __table_args__ = (
        UniqueConstraint("document_id", "revision", name="schedule_document_history_rev_unique"),
        {"schema": SCHEMA},
    )
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    document_id: Mapped[int] = mapped_column(
        ForeignKey(f"{SCHEMA}.schedule_document.id"), nullable=False
    )
    revision: Mapped[int] = mapped_column(Integer, nullable=False)
    schema_version: Mapped[int] = mapped_column(Integer, nullable=False)
    doc: Mapped[dict] = mapped_column(JSONB, nullable=False)
    written_at: Mapped[object] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now())
```

- [ ] **Step 2: Alembic config**

Create `backend/alembic.ini` (minimal):
```ini
[alembic]
script_location = alembic
sqlalchemy.url = postgresql+psycopg://oms:oms@localhost:5432/oms

[loggers]
keys = root
[handlers]
keys = console
[formatters]
keys = generic
[logger_root]
level = WARN
handlers = console
[handler_console]
class = StreamHandler
args = (sys.stderr,)
level = NOTSET
formatter = generic
[formatter_generic]
format = %(levelname)-5.5s [%(name)s] %(message)s
```

Create `backend/alembic/env.py`:
```python
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from app.db import Base
from app.settings import settings
import app.models  # noqa: F401  (register tables on Base.metadata)

config = context.config
config.set_main_option("sqlalchemy.url", settings.database_url)
if config.config_file_name:
    fileConfig(config.config_file_name)
target_metadata = Base.metadata


def run_migrations_online():
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


run_migrations_online()
```

Create `backend/alembic/script.py.mako` (standard Alembic template):
```mako
"""${message}

Revision ID: ${up_revision}
Revises: ${down_revision | comma,n}
"""
from alembic import op
import sqlalchemy as sa
${imports if imports else ""}

revision = ${repr(up_revision)}
down_revision = ${repr(down_revision)}
branch_labels = ${repr(branch_labels)}
depends_on = ${repr(depends_on)}


def upgrade():
    ${upgrades if upgrades else "pass"}


def downgrade():
    ${downgrades if downgrades else "pass"}
```

- [ ] **Step 3: Write the failing migration test**

Create `backend/tests/test_migration.py`:
```python
from sqlalchemy import text


def test_sentinel_row_exists_at_revision_zero(migrated_db):
    with migrated_db.connect() as conn:
        row = conn.execute(
            text("SELECT id, revision, doc, schema_version "
                 "FROM platform.schedule_document")
        ).fetchall()
    assert len(row) == 1
    assert row[0].id == 1
    assert row[0].revision == 0
    assert row[0].doc is None
    assert row[0].schema_version is None
```

Add a `migrated_db` fixture to `backend/tests/conftest.py`:
```python
import subprocess
import pytest
from sqlalchemy import create_engine, text
from app.settings import settings


@pytest.fixture
def migrated_db():
    subprocess.run(["alembic", "downgrade", "base"], check=False, cwd="backend")
    subprocess.run(["alembic", "upgrade", "head"], check=True, cwd="backend")
    engine = create_engine(settings.database_url, future=True)
    yield engine
    engine.dispose()
```
(Run pytest from the repo root so `cwd="backend"` resolves; if you run from `backend/`, set `cwd="."`.)

- [ ] **Step 4: Run it and watch it fail**

Run: `python -m pytest backend/tests/test_migration.py -v`
Expected: FAIL — no migration script / `platform.schedule_document` does not exist.

- [ ] **Step 5: Write migration `0001`**

Create `backend/alembic/versions/0001_platform_document.py`:
```python
"""platform schedule_document + history + sentinel

Revision ID: 0001
Revises:
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, TIMESTAMP

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.execute("CREATE SCHEMA IF NOT EXISTS platform")
    op.create_table(
        "schedule_document",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=False),
        sa.Column("schema_version", sa.Integer, nullable=True),
        sa.Column("revision", sa.Integer, nullable=False, server_default="0"),
        sa.Column("doc", JSONB, nullable=True),
        sa.Column("updated_at", TIMESTAMP(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint("id = 1", name="schedule_document_singleton"),
        sa.CheckConstraint("revision >= 0", name="schedule_document_revision_nonneg"),
        sa.CheckConstraint(
            "(revision = 0 AND doc IS NULL AND schema_version IS NULL) "
            "OR (revision > 0 AND doc IS NOT NULL AND schema_version IS NOT NULL)",
            name="schedule_document_revision_zero_shape",
        ),
        schema="platform",
    )
    op.create_table(
        "schedule_document_history",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("document_id", sa.Integer, sa.ForeignKey("platform.schedule_document.id"), nullable=False),
        sa.Column("revision", sa.Integer, nullable=False),
        sa.Column("schema_version", sa.Integer, nullable=False),
        sa.Column("doc", JSONB, nullable=False),
        sa.Column("written_at", TIMESTAMP(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("document_id", "revision", name="schedule_document_history_rev_unique"),
        schema="platform",
    )
    op.execute("INSERT INTO platform.schedule_document (id, revision) VALUES (1, 0)")


def downgrade():
    op.drop_table("schedule_document_history", schema="platform")
    op.drop_table("schedule_document", schema="platform")
    op.execute("DROP SCHEMA IF EXISTS platform CASCADE")
```

- [ ] **Step 6: Run it and watch it pass**

Run: `python -m pytest backend/tests/test_migration.py -v`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/
git commit -m "feat(backend): alembic 0001 — platform document tables + sentinel row"
```

---

## Task 3: `GET /api/document`

**Files:**
- Create: `backend/app/schemas.py`, `backend/app/documents.py` (router)
- Modify: `backend/app/main.py` (include router)
- Test: `backend/tests/test_get_document.py`

**Interfaces:**
- Consumes: `ScheduleDocument` (Task 2).
- Produces: `GET /api/document` returning `{ doc, revision, schema_version }`.

- [ ] **Step 1: Response/request schemas**

Create `backend/app/schemas.py`:
```python
from pydantic import BaseModel


class DocumentResponse(BaseModel):
    doc: dict | None
    revision: int
    schema_version: int | None


class DocumentPut(BaseModel):
    doc: dict
    base_revision: int
    schema_version: int
```

- [ ] **Step 2: Write the failing test**

Create `backend/tests/test_get_document.py`:
```python
def test_get_returns_sentinel_when_empty(client, migrated_db):
    resp = client.get("/api/document")
    assert resp.status_code == 200
    assert resp.json() == {"doc": None, "revision": 0, "schema_version": None}
```

- [ ] **Step 3: Run it and watch it fail**

Run: `python -m pytest backend/tests/test_get_document.py -v`
Expected: FAIL — 404 (route not defined).

- [ ] **Step 4: Implement the GET route**

Create `backend/app/documents.py`:
```python
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .db import get_session
from .models import ScheduleDocument
from .schemas import DocumentResponse

router = APIRouter(prefix="/api")
DOC_ID = 1


@router.get("/document", response_model=DocumentResponse)
def get_document(session: Session = Depends(get_session)):
    row = session.get(ScheduleDocument, DOC_ID)
    return DocumentResponse(doc=row.doc, revision=row.revision, schema_version=row.schema_version)
```

Modify `backend/app/main.py` — add after `app = FastAPI(...)`:
```python
from .documents import router as document_router
app.include_router(document_router)
```

- [ ] **Step 5: Run it and watch it pass**

Run: `python -m pytest backend/tests/test_get_document.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/
git commit -m "feat(backend): GET /api/document returns sentinel/current document"
```

---

## Task 4: `PUT /api/document` — atomic swap, history, validation, concurrency

**Files:**
- Modify: `backend/app/documents.py`
- Test: `backend/tests/test_put_document.py`, `backend/tests/test_put_concurrency.py`

**Interfaces:**
- Consumes: `ScheduleDocument`, `ScheduleDocumentHistory`, `DocumentPut`, `settings.schema_version`.
- Produces: `PUT /api/document` → `{ revision }` | `409 { error, current_revision }` | `422`.

- [ ] **Step 1: Write the failing happy-path + stale + validation tests**

Create `backend/tests/test_put_document.py`:
```python
import copy

DOC = {"version": 4, "departments": [], "employees": [], "scheduleWeeks": {}}


def test_put_base_zero_creates_revision_one(client, migrated_db):
    resp = client.put("/api/document", json={"doc": DOC, "base_revision": 0, "schema_version": 4})
    assert resp.status_code == 200
    assert resp.json() == {"revision": 1}
    got = client.get("/api/document").json()
    assert got["revision"] == 1
    assert got["doc"]["version"] == 4


def test_put_appends_one_history_row(client, migrated_db):
    from sqlalchemy import text
    client.put("/api/document", json={"doc": DOC, "base_revision": 0, "schema_version": 4})
    with migrated_db.connect() as conn:
        n = conn.execute(text("SELECT count(*) FROM platform.schedule_document_history")).scalar_one()
    assert n == 1


def test_put_with_current_base_succeeds(client, migrated_db):
    client.put("/api/document", json={"doc": DOC, "base_revision": 0, "schema_version": 4})
    resp = client.put("/api/document", json={"doc": DOC, "base_revision": 1, "schema_version": 4})
    assert resp.status_code == 200
    assert resp.json() == {"revision": 2}


def test_put_with_stale_base_is_rejected(client, migrated_db):
    client.put("/api/document", json={"doc": DOC, "base_revision": 0, "schema_version": 4})
    resp = client.put("/api/document", json={"doc": DOC, "base_revision": 0, "schema_version": 4})
    assert resp.status_code == 409
    assert resp.json() == {"error": "stale-write", "current_revision": 1}


def test_put_rejects_ui_in_doc(client, migrated_db):
    bad = copy.deepcopy(DOC)
    bad["ui"] = {"screen": "board"}
    resp = client.put("/api/document", json={"doc": bad, "base_revision": 0, "schema_version": 4})
    assert resp.status_code == 422


def test_put_rejects_bad_schema_version(client, migrated_db):
    resp = client.put("/api/document", json={"doc": DOC, "base_revision": 0, "schema_version": 3})
    assert resp.status_code == 422


def test_put_rejects_bad_doc_version(client, migrated_db):
    bad = copy.deepcopy(DOC)
    bad["version"] = 3
    resp = client.put("/api/document", json={"doc": bad, "base_revision": 0, "schema_version": 4})
    assert resp.status_code == 422
```

- [ ] **Step 2: Run and watch it fail**

Run: `python -m pytest backend/tests/test_put_document.py -v`
Expected: FAIL — PUT route not defined (405/404).

- [ ] **Step 3: Implement the PUT route (atomic swap)**

Add to `backend/app/documents.py`:
```python
from fastapi import HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy import update
from sqlalchemy.sql import func

from .models import ScheduleDocumentHistory
from .schemas import DocumentPut
from .settings import settings


@router.put("/document")
def put_document(payload: DocumentPut, session: Session = Depends(get_session)):
    if payload.schema_version != settings.schema_version:
        raise HTTPException(status_code=422, detail="unsupported schema_version")
    if not isinstance(payload.doc, dict) or "ui" in payload.doc:
        raise HTTPException(status_code=422, detail="doc must be an object without ui")
    if payload.doc.get("version") != settings.schema_version:
        raise HTTPException(status_code=422, detail="unsupported doc.version")

    stmt = (
        update(ScheduleDocument)
        .where(ScheduleDocument.id == DOC_ID, ScheduleDocument.revision == payload.base_revision)
        .values(
            revision=ScheduleDocument.revision + 1,
            doc=payload.doc,
            schema_version=payload.schema_version,
            updated_at=func.now(),
        )
        .returning(ScheduleDocument.revision)
    )
    new_rev = session.execute(stmt).scalar_one_or_none()
    if new_rev is None:
        current = session.get(ScheduleDocument, DOC_ID).revision
        session.rollback()
        return JSONResponse(status_code=409, content={"error": "stale-write", "current_revision": current})

    session.add(ScheduleDocumentHistory(
        document_id=DOC_ID, revision=new_rev,
        schema_version=payload.schema_version, doc=payload.doc,
    ))
    session.commit()
    return {"revision": new_rev}
```

- [ ] **Step 4: Run and watch it pass**

Run: `python -m pytest backend/tests/test_put_document.py -v`
Expected: PASS (all seven).

- [ ] **Step 5: Write the mandatory concurrency test**

Create `backend/tests/test_put_concurrency.py` — two overlapping transactions with the same base contend on the sentinel row; exactly one advances:
```python
from sqlalchemy import update, func
from sqlalchemy.orm import Session
from app.db import engine
from app.models import ScheduleDocument

DOC = {"version": 4, "departments": [], "employees": [], "scheduleWeeks": {}}


def _swap(session, base):
    stmt = (
        update(ScheduleDocument)
        .where(ScheduleDocument.id == 1, ScheduleDocument.revision == base)
        .values(revision=ScheduleDocument.revision + 1, doc=DOC,
                schema_version=4, updated_at=func.now())
        .returning(ScheduleDocument.revision)
    )
    return session.execute(stmt).scalar_one_or_none()


def test_two_writers_same_base_one_wins(migrated_db):
    # Seed revision 1 so both writers race from base 1.
    s0 = Session(engine)
    _swap(s0, 0); s0.commit(); s0.close()

    a, b = Session(engine), Session(engine)
    ra = _swap(a, 1)          # A updates the row, holds the lock (uncommitted)
    rb_thread = []
    import threading
    def run_b():
        rb_thread.append(_swap(b, 1))  # blocks on A's row lock until A commits
    t = threading.Thread(target=run_b)
    t.start()
    a.commit()                # release lock; B re-evaluates WHERE revision=1 → no row
    t.join()
    b.commit()
    a.close(); b.close()

    outcomes = sorted([ra is not None, rb_thread[0] is not None])
    assert outcomes == [False, True]  # exactly one winner
```

- [ ] **Step 6: Run and watch it pass**

Run: `python -m pytest backend/tests/test_put_concurrency.py -v`
Expected: PASS — one writer gets a revision, the other gets `None`.

- [ ] **Step 7: Commit**

```bash
git add backend/
git commit -m "feat(backend): PUT /api/document atomic revision swap + history + validation"
```

---

## Task 5: Docker Compose + Dockerfile + env example (local up green)

**Files:**
- Create: `backend/Dockerfile`, `backend/entrypoint.sh`, `infra/docker-compose.yml`, `.env.example`

**Interfaces:**
- Produces: `docker compose -f infra/docker-compose.yml up` → postgres + backend, Alembic migrated, `GET /healthz` 200.

- [ ] **Step 1: Backend image + entrypoint**

Create `backend/Dockerfile`:
```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
RUN chmod +x entrypoint.sh
EXPOSE 8000
CMD ["./entrypoint.sh"]
```

Create `backend/entrypoint.sh` (local SP2a: migrate then serve — SP2b will split this):
```bash
#!/usr/bin/env sh
set -e
alembic upgrade head
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
```

- [ ] **Step 2: Compose file**

Create `infra/docker-compose.yml`:
```yaml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: oms
      POSTGRES_PASSWORD: oms
      POSTGRES_DB: oms
    ports: ["5432:5432"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U oms"]
      interval: 3s
      timeout: 3s
      retries: 10
  backend:
    build: ../backend
    environment:
      DATABASE_URL: postgresql+psycopg://oms:oms@db:5432/oms
    depends_on:
      db:
        condition: service_healthy
    ports: ["8000:8000"]
```

- [ ] **Step 3: Env example**

Create `.env.example`:
```
# Backend
DATABASE_URL=postgresql+psycopg://oms:oms@localhost:5432/oms
# Frontend (same-origin path, not a host)
VITE_API_BASE=/api
```

- [ ] **Step 4: Verify a clean bring-up**

Run:
```bash
docker compose -f infra/docker-compose.yml up -d --build
sleep 8
curl -fsS localhost:8000/healthz
curl -fsS localhost:8000/api/document
docker compose -f infra/docker-compose.yml down
```
Expected: `{"status":"ok"}` then `{"doc":null,"revision":0,"schema_version":null}`.

- [ ] **Step 5: Commit**

```bash
git add backend/Dockerfile backend/entrypoint.sh infra/ .env.example
git commit -m "feat(infra): local Docker Compose (postgres + backend) with migrate-on-start"
```

---

## Task 6: Frontend — authoritative projection (`toPersistedOms` / `hydrateOms`)

**Files:**
- Create: `src/state/omsProjection.js`
- Test: `src/state/omsProjection.test.js`

**Interfaces:**
- Produces: `toPersistedOms`, `hydrateOms`, `defaultUi` (see Module contracts).

- [ ] **Step 1: Write the failing test**

Create `src/state/omsProjection.test.js`:
```javascript
import { describe, expect, it } from 'vitest';
import { toPersistedOms, hydrateOms, defaultUi } from './omsProjection.js';

const doc = {
  version: 4,
  weekOrder: ['2026-08-02'],
  employees: [],
  ui: { screen: 'team', selectedWeek: '2026-08-02', aiOpen: true, selectedPtoId: 'x' },
};

describe('toPersistedOms', () => {
  it('removes ui entirely', () => {
    const p = toPersistedOms(doc);
    expect('ui' in p).toBe(false);
    expect(p.version).toBe(4);
    expect(p.employees).toEqual([]);
  });
  it('does not mutate the input', () => {
    toPersistedOms(doc);
    expect(doc.ui).toBeTruthy();
  });
});

describe('hydrateOms', () => {
  it('attaches provided local ui', () => {
    const p = toPersistedOms(doc);
    const ui = { screen: 'board', selectedWeek: '2026-08-02', aiOpen: false, selectedPtoId: null };
    expect(hydrateOms(p, ui).ui).toEqual(ui);
  });
  it('falls back to defaultUi derived from the persisted doc', () => {
    const p = toPersistedOms(doc);
    expect(hydrateOms(p).ui).toEqual(defaultUi(p));
    expect(defaultUi(p).selectedWeek).toBe('2026-08-02');
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run src/state/omsProjection.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/state/omsProjection.js`:
```javascript
/** The scheduling projection persisted server-side: the v4 document without
 * client UI chrome. `ui` never reaches Postgres or history (spec §6). */
export function toPersistedOms(doc) {
  const { ui, ...persisted } = doc;
  void ui;
  return persisted;
}

export function defaultUi(persisted) {
  return {
    screen: 'board',
    selectedWeek: persisted.weekOrder?.[0] ?? null,
    aiOpen: false,
    selectedPtoId: null,
  };
}

export function hydrateOms(persisted, localUi) {
  return { ...persisted, ui: localUi ?? defaultUi(persisted) };
}
```

- [ ] **Step 4: Run and watch it pass**

Run: `npx vitest run src/state/omsProjection.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/state/omsProjection.js src/state/omsProjection.test.js
git commit -m "feat(oms): authoritative projection toPersistedOms/hydrateOms"
```

---

## Task 7: Frontend — envelope codec + last-known-good cache

**Files:**
- Create: `src/state/omsEnvelope.js`
- Test: `src/state/omsEnvelope.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `serializeOmsEnvelope`, `deserializeOmsEnvelope`, `createOmsEnvelopeCache`, `createMemoryEnvelopeCache` (see Module contracts).

- [ ] **Step 1: Write the failing test**

Create `src/state/omsEnvelope.test.js`:
```javascript
// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import {
  serializeOmsEnvelope, deserializeOmsEnvelope,
  createMemoryEnvelopeCache, createOmsEnvelopeCache,
} from './omsEnvelope.js';

describe('envelope codec', () => {
  it('round-trips { schemaVersion, revision, doc }', () => {
    const env = { revision: 12, doc: { version: 4, employees: [] } };
    const back = deserializeOmsEnvelope(serializeOmsEnvelope(env));
    expect(back).toEqual({ schemaVersion: 4, revision: 12, doc: { version: 4, employees: [] } });
  });
  it('throws version-mismatch on wrong schemaVersion', () => {
    const bad = JSON.stringify({ schemaVersion: 3, revision: 1, doc: {} });
    expect(() => deserializeOmsEnvelope(bad)).toThrowError(/version-mismatch|schema/i);
  });
});

describe('memory envelope cache', () => {
  it('stores and returns the envelope, and clears', async () => {
    const c = createMemoryEnvelopeCache();
    expect(await c.loadEnvelope()).toBeNull();
    await c.saveEnvelope({ revision: 2, doc: { version: 4 } });
    expect((await c.loadEnvelope()).revision).toBe(2);
    await c.clearEnvelope();
    expect(await c.loadEnvelope()).toBeNull();
  });
});

describe('idb envelope cache', () => {
  it('persists across cache instances (same dbName)', async () => {
    const a = createOmsEnvelopeCache({ dbName: 'oms-env-test' });
    await a.saveEnvelope({ revision: 5, doc: { version: 4 } });
    const b = createOmsEnvelopeCache({ dbName: 'oms-env-test' });
    expect((await b.loadEnvelope()).revision).toBe(5);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run src/state/omsEnvelope.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/state/omsEnvelope.js`:
```javascript
const SCHEMA = 4;

export function serializeOmsEnvelope({ revision, doc }) {
  return JSON.stringify({ schemaVersion: SCHEMA, revision, doc });
}

export function deserializeOmsEnvelope(json) {
  const env = JSON.parse(json);
  if (env.schemaVersion !== SCHEMA) {
    const err = new Error(`envelope expects schema v${SCHEMA}, got v${env.schemaVersion}`);
    err.code = 'version-mismatch';
    throw err;
  }
  return env;
}

export function createMemoryEnvelopeCache() {
  let saved = null;
  return {
    async loadEnvelope() { return saved ? deserializeOmsEnvelope(saved) : null; },
    async saveEnvelope(env) { saved = serializeOmsEnvelope(env); },
    async clearEnvelope() { saved = null; },
  };
}

export function createOmsEnvelopeCache({ dbName = 'wcah-oms-envelope' } = {}) {
  const open = () => new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  const run = async (mode, op) => {
    const db = await open();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction('kv', mode);
        const request = op(tx.objectStore('kv'));
        let result;
        request.onsuccess = () => { result = request.result; };
        request.onerror = () => reject(request.error ?? new Error('IDB request failed'));
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error ?? new Error('IDB tx failed'));
        tx.onabort = () => reject(tx.error ?? new Error('IDB tx aborted'));
      });
    } finally { db.close(); }
  };
  return {
    async loadEnvelope() {
      const json = await run('readonly', (s) => s.get('envelope'));
      return json ? deserializeOmsEnvelope(json) : null;
    },
    async saveEnvelope(env) {
      await run('readwrite', (s) => s.put(serializeOmsEnvelope(env), 'envelope'));
    },
    async clearEnvelope() {
      await run('readwrite', (s) => s.delete('envelope'));
    },
  };
}
```

- [ ] **Step 4: Run and watch it pass**

Run: `npx vitest run src/state/omsEnvelope.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/state/omsEnvelope.js src/state/omsEnvelope.test.js
git commit -m "feat(oms): envelope codec + last-known-good cache (revision internal)"
```

---

## Task 8: Frontend — action classifier + completeness guard

**Files:**
- Create: `src/state/omsActionClass.js`
- Test: `src/state/omsActionClass.test.js`

**Interfaces:**
- Produces: `classifyAction`, `SCHEDULING_MUTATIONS`, `LOCAL_ONLY_ACTIONS`, `SYSTEM_ACTIONS`.

**Classification rationale:** an action is `scheduling` if it can change the persisted projection (anything `applyOmsMutation` handles, plus week-setup / PTO-decision / finalize / publish / DVM-team, plus `JUMP_TO_WEEK` and `THIS_WEEK` because they call `ensureWeek`, which creates a draft week — a persisted change). It is `local` if it only touches `doc.ui` (`SET_SCREEN`, `SELECT_WEEK`, `SHIFT_WEEK`, `TOGGLE_AI`, `SELECT_PTO`, `PREVIEW_PTO`, `CLEAR_PTO_PREVIEW`). `REPLACE` is `system` (hydration/reload/reset apply it; the guard always allows it and the equal-projection no-op keeps it from writing).

- [ ] **Step 1: Write the failing completeness test**

Create `src/state/omsActionClass.test.js`:
```javascript
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { classifyAction } from './omsActionClass.js';

// Every action type the reducer or applyOmsMutation switches on must be
// classified. This test fails when a new action is added without a class.
function actionTypesInSource() {
  const files = ['src/state/omsStore.js', 'src/state/omsMutations.js'];
  const types = new Set();
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/case '([A-Z_]+)':/g)) types.add(m[1]);
  }
  return [...types];
}

describe('classifyAction', () => {
  it('classifies every reducer/mutation action type', () => {
    for (const t of actionTypesInSource()) {
      expect(['scheduling', 'local', 'system']).toContain(classifyAction(t));
    }
  });
  it('throws on an unknown action', () => {
    expect(() => classifyAction('NOT_A_REAL_ACTION')).toThrowError(/unclassified/);
  });
  it('treats week-setup edits as scheduling and navigation as local', () => {
    expect(classifyAction('SET_DVM_COUNT')).toBe('scheduling');
    expect(classifyAction('JUMP_TO_WEEK')).toBe('scheduling'); // ensureWeek creates a draft week
    expect(classifyAction('SHIFT_WEEK')).toBe('local');
    expect(classifyAction('SET_SCREEN')).toBe('local');
    expect(classifyAction('REPLACE')).toBe('system');
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run src/state/omsActionClass.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/state/omsActionClass.js`:
```javascript
/** Central action classifier (spec §6). Every reducer / applyOmsMutation
 * action is in exactly one class. The offline guard allows `local` and
 * `system`, rejects `scheduling`. JUMP_TO_WEEK / THIS_WEEK are `scheduling`
 * because ensureWeek can create a draft week (a persisted change). */
export const SCHEDULING_MUTATIONS = new Set([
  // applyOmsMutation
  'UPSERT_DEPARTMENT', 'REMOVE_DEPARTMENT', 'UPSERT_ROLE', 'REMOVE_ROLE',
  'UPSERT_RESOURCE_NEED', 'REMOVE_RESOURCE_NEED', 'UPSERT_CONSTRAINT', 'REMOVE_CONSTRAINT',
  'UPSERT_EMPLOYEE', 'REMOVE_EMPLOYEE', 'SET_EMPLOYEE_TITLE',
  'UPSERT_ROLE_PREFERENCE', 'REMOVE_ROLE_PREFERENCE',
  'UPSERT_LOCATION_ELIGIBILITY', 'REMOVE_LOCATION_ELIGIBILITY',
  'UPSERT_ROTATION', 'REMOVE_ROTATION', 'SET_DAY_DEPARTMENT',
  'UPSERT_NEED_OVERRIDE', 'CLEAR_NEED_OVERRIDE',
  // reducer switch — persisted effects
  'SET_DVM_COUNT', 'SET_OVERRIDE', 'CLEAR_OVERRIDES', 'DECIDE_PTO',
  'AUTHORIZE_VIOLATION', 'FINALIZE', 'REVERT_DRAFT', 'PUBLISH', 'ASSIGN_DVM_TEAM',
  'JUMP_TO_WEEK', 'THIS_WEEK',
]);

export const LOCAL_ONLY_ACTIONS = new Set([
  'SET_SCREEN', 'SELECT_WEEK', 'SHIFT_WEEK', 'TOGGLE_AI',
  'SELECT_PTO', 'PREVIEW_PTO', 'CLEAR_PTO_PREVIEW',
]);

export const SYSTEM_ACTIONS = new Set(['REPLACE']);

export function classifyAction(type) {
  if (SCHEDULING_MUTATIONS.has(type)) return 'scheduling';
  if (LOCAL_ONLY_ACTIONS.has(type)) return 'local';
  if (SYSTEM_ACTIONS.has(type)) return 'system';
  throw new Error(`unclassified action: ${type}`);
}
```

- [ ] **Step 4: Run and watch it pass**

Run: `npx vitest run src/state/omsActionClass.test.js`
Expected: PASS. If it fails listing an unclassified action, add it to the correct set — do not weaken the completeness test.

- [ ] **Step 5: Commit**

```bash
git add src/state/omsActionClass.js src/state/omsActionClass.test.js
git commit -m "feat(oms): central action classifier with completeness guard"
```

---

## Task 9: Frontend — `createOmsApiStore` (revision, single-flight queue, offline)

**Files:**
- Create: `src/state/omsApiStore.js`
- Test: `src/state/omsApiStore.test.js`

**Interfaces:**
- Consumes: `toPersistedOms` (Task 6), an envelope cache (Task 7).
- Produces: `createOmsApiStore({ baseUrl, cache })` (see Module contracts).

- [ ] **Step 1: Write the failing tests**

Create `src/state/omsApiStore.test.js`:
```javascript
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createOmsApiStore } from './omsApiStore.js';
import { createMemoryEnvelopeCache } from './omsEnvelope.js';

const P = { version: 4, employees: [], scheduleWeeks: {} };
const withUi = { ...P, ui: { screen: 'board' } };

function jsonResponse(body, status = 200) {
  return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
}

beforeEach(() => { vi.restoreAllMocks(); });

describe('createOmsApiStore load', () => {
  it('returns null and tracks revision 0 for the empty sentinel', async () => {
    global.fetch = vi.fn(() => jsonResponse({ doc: null, revision: 0, schema_version: null }));
    const store = createOmsApiStore({ baseUrl: '/api', cache: createMemoryEnvelopeCache() });
    expect(await store.load()).toBeNull();
  });
  it('returns the persisted doc and caches the envelope', async () => {
    const cache = createMemoryEnvelopeCache();
    global.fetch = vi.fn(() => jsonResponse({ doc: P, revision: 3, schema_version: 4 }));
    const store = createOmsApiStore({ baseUrl: '/api', cache });
    expect(await store.load()).toEqual(P);
    expect((await cache.loadEnvelope()).revision).toBe(3);
  });
  it('throws offline-cache with the cached doc on network failure', async () => {
    const cache = createMemoryEnvelopeCache();
    await cache.saveEnvelope({ revision: 7, doc: P });
    global.fetch = vi.fn(() => Promise.reject(new Error('down')));
    const store = createOmsApiStore({ baseUrl: '/api', cache });
    await expect(store.load()).rejects.toMatchObject({ code: 'offline-cache', cachedDoc: P });
  });
  it('throws offline with no cache', async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error('down')));
    const store = createOmsApiStore({ baseUrl: '/api', cache: createMemoryEnvelopeCache() });
    await expect(store.load()).rejects.toMatchObject({ code: 'offline' });
  });
});

describe('createOmsApiStore save', () => {
  it('sends base_revision and advances on 200; strips ui', async () => {
    const fetchMock = vi.fn(() => jsonResponse({ revision: 1 }));
    global.fetch = fetchMock;
    const store = createOmsApiStore({ baseUrl: '/api', cache: createMemoryEnvelopeCache() });
    await store.save(withUi);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.base_revision).toBe(0);
    expect('ui' in body.doc).toBe(false);
  });
  it('is a no-op when the projection equals the last accepted doc', async () => {
    const fetchMock = vi.fn(() => jsonResponse({ revision: 1 }));
    global.fetch = fetchMock;
    const store = createOmsApiStore({ baseUrl: '/api', cache: createMemoryEnvelopeCache() });
    await store.save(withUi);
    await store.save({ ...P, ui: { screen: 'team' } }); // same projection, different ui
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('coalesces overlapping saves into sequential base revisions', async () => {
    let resolveFirst;
    const calls = [];
    global.fetch = vi.fn((url, opts) => {
      calls.push(JSON.parse(opts.body).base_revision);
      if (calls.length === 1) return new Promise((r) => { resolveFirst = () => r({ ok: true, status: 200, json: () => Promise.resolve({ revision: 1 }) }); });
      return jsonResponse({ revision: 2 });
    });
    const store = createOmsApiStore({ baseUrl: '/api', cache: createMemoryEnvelopeCache() });
    const a = store.save({ ...P, employees: [{ id: 'a' }] });
    const b = store.save({ ...P, employees: [{ id: 'b' }] });
    resolveFirst();
    await Promise.all([a, b]);
    expect(calls).toEqual([0, 1]); // second write used the advanced base, never 0 twice
  });
  it('throws stale-write on 409 and requires reload before next save', async () => {
    global.fetch = vi.fn(() => jsonResponse({ error: 'stale-write', current_revision: 9 }, 409));
    const store = createOmsApiStore({ baseUrl: '/api', cache: createMemoryEnvelopeCache() });
    await expect(store.save({ ...P, employees: [{ id: 'x' }] }))
      .rejects.toMatchObject({ code: 'stale-write', currentRevision: 9 });
  });
  it('throws offline on network failure and does not advance', async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error('down')));
    const store = createOmsApiStore({ baseUrl: '/api', cache: createMemoryEnvelopeCache() });
    await expect(store.save({ ...P, employees: [{ id: 'x' }] })).rejects.toMatchObject({ code: 'offline' });
  });
});

describe('base url normalization', () => {
  it('does not double the /api segment', async () => {
    const fetchMock = vi.fn(() => jsonResponse({ doc: null, revision: 0, schema_version: null }));
    global.fetch = fetchMock;
    const store = createOmsApiStore({ baseUrl: '/api/', cache: createMemoryEnvelopeCache() });
    await store.load();
    expect(fetchMock.mock.calls[0][0]).toBe('/api/document');
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run src/state/omsApiStore.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/state/omsApiStore.js`:
```javascript
import { toPersistedOms } from './omsProjection.js';

const SCHEMA = 4;

function normalize(baseUrl) {
  return (baseUrl || '/api').replace(/\/+$/, '');
}

export function createOmsApiStore({ baseUrl, cache }) {
  const docUrl = `${normalize(baseUrl)}/document`;
  let revision = 0;
  let acceptedFingerprint = null;   // JSON of last accepted persisted doc
  let inFlight = null;              // Promise of the current PUT
  let queued = null;               // { doc, resolve, reject } — latest pending only

  async function load() {
    let resp;
    try {
      resp = await fetch(docUrl, { method: 'GET' });
    } catch {
      const env = await cache.loadEnvelope();
      if (env) { const e = new Error('offline'); e.code = 'offline-cache'; e.cachedDoc = env.doc; throw e; }
      const e = new Error('offline'); e.code = 'offline'; throw e;
    }
    const body = await resp.json();
    revision = body.revision;
    if (body.doc) {
      acceptedFingerprint = JSON.stringify(body.doc);
      await cache.saveEnvelope({ revision, doc: body.doc });
    }
    return body.doc;
  }

  async function put(persisted, base) {
    let resp;
    try {
      resp = await fetch(docUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doc: persisted, base_revision: base, schema_version: SCHEMA }),
      });
    } catch { const e = new Error('offline'); e.code = 'offline'; throw e; }
    if (resp.status === 409) {
      const body = await resp.json();
      const e = new Error('stale-write'); e.code = 'stale-write'; e.currentRevision = body.current_revision; throw e;
    }
    if (!resp.ok) { const e = new Error(`save failed ${resp.status}`); e.code = 'save-error'; throw e; }
    const body = await resp.json();
    revision = body.revision;
    acceptedFingerprint = JSON.stringify(persisted);
    await cache.saveEnvelope({ revision, doc: persisted });
    return revision;
  }

  function pump() {
    if (inFlight || !queued) return;
    const job = queued; queued = null;
    const persisted = toPersistedOms(job.doc);
    inFlight = put(persisted, revision)
      .then(() => { job.resolve(); })
      .catch((e) => { queued = null; job.reject(e); })
      .finally(() => { inFlight = null; pump(); });
  }

  async function save(doc) {
    const fingerprint = JSON.stringify(toPersistedOms(doc));
    if (fingerprint === acceptedFingerprint) return;           // equal-projection no-op
    return new Promise((resolve, reject) => {
      queued = { doc, resolve, reject };                       // single latest slot
      pump();
    });
  }

  async function clear() { await cache.clearEnvelope(); }

  return { load, save, clear };
}
```

- [ ] **Step 4: Run and watch it pass**

Run: `npx vitest run src/state/omsApiStore.test.js`
Expected: PASS (all cases, including coalescing `[0, 1]`).

- [ ] **Step 5: Commit**

```bash
git add src/state/omsApiStore.js src/state/omsApiStore.test.js
git commit -m "feat(oms): createOmsApiStore — internal revision, single-flight queue, offline"
```

---

## Task 10: Frontend — `OmsContext` state machine + store selection + Vite proxy

**Files:**
- Modify: `src/state/OmsContext.jsx`
- Modify: `vite.config.js`
- Test: `src/state/OmsContext.api.test.jsx`

**Interfaces:**
- Consumes: `createOmsApiStore` (Task 9), `createOmsEnvelopeCache` (Task 7), `classifyAction` (Task 8), `toPersistedOms`/`hydrateOms` (Task 6), existing `createOmsIdbStore`, `reducer`, `seedDocument`.
- Produces: an `OmsProvider` that, in API mode, hydrates from the server, guards dispatch offline, rolls back failed edits, reloads on stale writes, and resets via an audited PUT.

- [ ] **Step 1: Add the Vite proxy**

Modify `vite.config.js`:
```javascript
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5174,
    proxy: { '/api': 'http://localhost:8000' },
  },
  test: { setupFiles: ['./src/test-setup.js'] },
});
```

- [ ] **Step 2: Write the failing state-machine tests**

Create `src/state/OmsContext.api.test.jsx`:
```javascript
// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { OmsProvider, useOms } from './OmsContext.jsx';

function Probe() {
  const { doc, storeStatus, dispatch, ready } = useOms();
  return (
    <div>
      <span data-testid="status">{storeStatus}</span>
      <span data-testid="ready">{String(ready)}</span>
      <span data-testid="emp">{doc?.employees?.length ?? -1}</span>
      <button onClick={() => dispatch({ type: 'SET_SCREEN', screen: 'team' })}>nav</button>
      <button onClick={() => dispatch({ type: 'UPSERT_EMPLOYEE', employee: { id: 'z', displayName: 'Z' } })}>edit</button>
    </div>
  );
}

function fakeStore(overrides = {}) {
  return {
    load: vi.fn(async () => null),
    save: vi.fn(async () => {}),
    clear: vi.fn(async () => {}),
    ...overrides,
  };
}

describe('OmsContext API mode', () => {
  it('hydrates from the server load without scheduling a write', async () => {
    const store = fakeStore({ load: vi.fn(async () => ({ version: 4, weekOrder: ['2026-08-02'], employees: [{ id: 'a' }] })) });
    render(<OmsProvider store={store} apiMode><Probe /></OmsProvider>);
    await waitFor(() => expect(screen.getByTestId('ready').textContent).toBe('true'));
    expect(screen.getByTestId('emp').textContent).toBe('1');
    expect(store.save).not.toHaveBeenCalled();
  });

  it('goes read-only on offline-cache and rejects scheduling mutations, allows navigation', async () => {
    const err = Object.assign(new Error('offline'), { code: 'offline-cache', cachedDoc: { version: 4, weekOrder: ['2026-08-02'], employees: [] } });
    const store = fakeStore({ load: vi.fn(async () => { throw err; }) });
    render(<OmsProvider store={store} apiMode><Probe /></OmsProvider>);
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('offline'));
    act(() => { screen.getByText('edit').click(); });        // scheduling mutation → rejected
    expect(store.save).not.toHaveBeenCalled();
    act(() => { screen.getByText('nav').click(); });          // navigation → allowed
    // no throw; still offline
    expect(screen.getByTestId('status').textContent).toBe('offline');
  });

  it('reloads latest on a stale write and surfaces reloaded-remote-change', async () => {
    let n = 0;
    const store = fakeStore({
      load: vi.fn(async () => (n++ === 0
        ? { version: 4, weekOrder: ['2026-08-02'], employees: [] }
        : { version: 4, weekOrder: ['2026-08-02'], employees: [{ id: 'server' }] })),
      save: vi.fn(async () => { throw Object.assign(new Error('stale'), { code: 'stale-write', currentRevision: 5 }); }),
    });
    render(<OmsProvider store={store} apiMode><Probe /></OmsProvider>);
    await waitFor(() => expect(screen.getByTestId('ready').textContent).toBe('true'));
    act(() => { screen.getByText('edit').click(); });
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('reloaded-remote-change'));
    expect(screen.getByTestId('emp').textContent).toBe('1'); // server content, not local edit
  });
});
```

- [ ] **Step 3: Run and watch it fail**

Run: `npx vitest run src/state/OmsContext.api.test.jsx`
Expected: FAIL — provider does not implement the state machine.

- [ ] **Step 4: Rewrite `OmsProvider` (API-aware; IDB mode unchanged)**

Replace `src/state/OmsContext.jsx` with:
```javascript
import React, {
  createContext, useContext, useEffect, useMemo, useReducer, useRef, useState,
} from 'react';
import { seedDocument, reducer } from './omsStore.js';
import { createOmsIdbStore } from './omsPersistence.js';
import { createOmsApiStore } from './omsApiStore.js';
import { createOmsEnvelopeCache } from './omsEnvelope.js';
import { classifyAction } from './omsActionClass.js';
import { toPersistedOms, hydrateOms } from './omsProjection.js';

const OmsContext = createContext(null);

const apiBase = import.meta.env?.VITE_API_BASE;
const defaultStore = apiBase
  ? createOmsApiStore({ baseUrl: apiBase, cache: createOmsEnvelopeCache() })
  : createOmsIdbStore();
const API_MODE = Boolean(apiBase);

export function OmsProvider({ children, store = defaultStore, apiMode = API_MODE }) {
  const [doc, dispatch] = useReducer(reducer, null, seedDocument);
  const [storeStatus, setStoreStatus] = useState('loading');
  const [writesEnabled, setWritesEnabled] = useState(false);
  const [ready, setReady] = useState(false);
  const [saveEpoch, setSaveEpoch] = useState(0); // bumps only on scheduling mutations (API mode)
  const lastAccepted = useRef(null);   // last accepted PERSISTED doc (no ui)

  // ---- hydrate ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await store.load();
        if (cancelled) return;
        if (raw?.version === 4) {
          lastAccepted.current = toPersistedOms(raw);
          dispatch({ type: 'REPLACE', doc: hydrateOms(toPersistedOms(raw), undefined) });
        } else {
          lastAccepted.current = toPersistedOms(seedDocument());
        }
        setWritesEnabled(true);
        setStoreStatus('ok');
      } catch (e) {
        if (cancelled) return;
        if (e.code === 'offline-cache') {
          lastAccepted.current = toPersistedOms(e.cachedDoc);
          dispatch({ type: 'REPLACE', doc: hydrateOms(toPersistedOms(e.cachedDoc), undefined) });
          setWritesEnabled(false);
          setStoreStatus('offline');
        } else if (e.code === 'offline') {
          setWritesEnabled(false);
          setStoreStatus('offline');
        } else {
          setWritesEnabled(true);
          setStoreStatus(e.code === 'version-mismatch' ? 'version-mismatch' : 'error');
          if (e.code === 'version-mismatch') setWritesEnabled(false);
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, [store]);

  // ---- guarded dispatch (API mode only) ----
  const guardedDispatch = useMemo(() => {
    if (!apiMode) return dispatch;
    return (action) => {
      const kind = classifyAction(action.type);
      if (kind === 'scheduling') {
        if (!writesEnabled || storeStatus === 'offline') return; // reject while read-only
        dispatch(action);
        setSaveEpoch((e) => e + 1); // only scheduling edits schedule a write
      } else {
        dispatch(action); // local + system actions never write
      }
    };
  }, [apiMode, writesEnabled, storeStatus]);

  // ---- debounced save ----
  // IDB mode: save on any doc change (unchanged legacy behavior).
  // API mode: gated on saveEpoch so mount/hydration never seeds the server
  //   (spec §11); the first scheduling mutation establishes revision 1. The
  //   equal-projection no-op in the store still absorbs any UI-only change.
  useEffect(() => {
    if (!ready || !writesEnabled) return undefined;
    if (apiMode && saveEpoch === 0) return undefined; // nothing edited yet
    // `doc` is in deps, so the effect re-runs on every change; the closure doc
    // is always current when the debounce fires.
    const timeout = setTimeout(() => {
      store.save(doc).catch(async (e) => {
        if (e.code === 'stale-write') {
          try {
            const latest = await store.load();
            if (latest?.version === 4) {
              lastAccepted.current = toPersistedOms(latest);
              dispatch({ type: 'REPLACE', doc: hydrateOms(toPersistedOms(latest), doc.ui) });
            }
            setStoreStatus('reloaded-remote-change');
          } catch { setStoreStatus('error'); }
        } else if (e.code === 'offline') {
          if (lastAccepted.current) {
            dispatch({ type: 'REPLACE', doc: hydrateOms(lastAccepted.current, doc.ui) });
          }
          setWritesEnabled(false);
          setStoreStatus('offline');
        } else {
          if (lastAccepted.current) {
            dispatch({ type: 'REPLACE', doc: hydrateOms(lastAccepted.current, doc.ui) });
          }
          setStoreStatus('save-error');
        }
      });
    }, 300);
    return () => clearTimeout(timeout);
  }, [doc, saveEpoch, ready, writesEnabled, store, apiMode]);

  // ---- reconnect ----
  const reconnect = async () => {
    try {
      const latest = await store.load();
      if (latest?.version === 4) {
        lastAccepted.current = toPersistedOms(latest);
        dispatch({ type: 'REPLACE', doc: hydrateOms(toPersistedOms(latest), doc.ui) });
      }
      setWritesEnabled(true);
      setStoreStatus('ok');
    } catch { setStoreStatus('offline'); }
  };

  // ---- reset to seed: audited PUT first, then REPLACE ----
  const resetToSeed = async () => {
    const seed = seedDocument();
    try {
      await store.save(toPersistedOms(seed));   // no-op-safe; establishes acceptance
      lastAccepted.current = toPersistedOms(seed);
      dispatch({ type: 'REPLACE', doc: seed });
      setWritesEnabled(true);
      setStoreStatus('ok');
      return seed;
    } catch (e) {
      setStoreStatus(e.code === 'offline' ? 'offline' : 'save-error');
      return doc; // display + cache untouched on failure
    }
  };

  const value = useMemo(
    () => ({ doc, dispatch: guardedDispatch, storeStatus, writesEnabled, ready, reconnect, resetToSeed }),
    [doc, guardedDispatch, storeStatus, writesEnabled, ready],
  );
  return <OmsContext.Provider value={value}>{children}</OmsContext.Provider>;
}

export function useOms() {
  const ctx = useContext(OmsContext);
  if (!ctx) throw new Error('useOms outside provider');
  return ctx;
}
```

Note: the tests pass `apiMode` explicitly because `VITE_API_BASE` is unset under Vitest (so the runtime default `API_MODE` is false). The `apiMode` prop exists precisely so the state machine is testable without env vars; production selects it from `import.meta.env.VITE_API_BASE`.

- [ ] **Step 5: Run the new tests and the existing context tests**

Run:
```bash
npx vitest run src/state/OmsContext.api.test.jsx src/state/OmsContext.oms.test.jsx
```
Expected: PASS. The existing IDB-mode test must still pass (IDB path is unchanged when `apiMode` is false).

- [ ] **Step 6: Commit**

```bash
git add src/state/OmsContext.jsx vite.config.js src/state/OmsContext.api.test.jsx
git commit -m "feat(oms): OmsContext API state machine (offline read-only, rollback, stale reload, audited reset) + vite /api proxy"
```

---

## Task 11: CI — run vitest + pytest

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Write the workflow**

Create `.github/workflows/ci.yml`:
```yaml
name: CI
on:
  push: { branches: ["**"] }
  pull_request:

jobs:
  frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22', cache: 'npm' }
      - run: npm ci
      - run: npx vitest run

  backend:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env: { POSTGRES_USER: oms, POSTGRES_PASSWORD: oms, POSTGRES_DB: oms }
        ports: ["5432:5432"]
        options: >-
          --health-cmd "pg_isready -U oms" --health-interval 5s
          --health-timeout 5s --health-retries 10
    env:
      DATABASE_URL: postgresql+psycopg://oms:oms@localhost:5432/oms
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: '3.12' }
      - run: pip install -r backend/requirements.txt
      - run: python -m pytest backend/tests -v
```

- [ ] **Step 2: Verify locally what CI runs**

Run:
```bash
npx vitest run 2>&1 | tail -3
python -m pytest backend/tests -v 2>&1 | tail -5
```
Expected: vitest green (Task 0 count + the SP2a suites); pytest green (requires the local Postgres from Task 1/5).

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: run vitest and pytest (postgres service) on push and PR"
```

---

## Self-review

**Spec coverage:**
- §3.1 no regression → Task 0 baseline + Global Constraints (untouched engine/fixtures).
- §3.2 round-trip + revision enforced → Tasks 3, 4.
- §3.3 app runs against API store; UI not persisted → Tasks 6, 9, 10.
- §3.4 honest-offline read-only + rollback → Tasks 9 (offline/offline-cache), 10 (read-only, rollback).
- §3.5 deterministic save ordering (one in flight, coalesce, no write on hydration/UI) → Task 9 queue + Task 6 projection + Task 8 classifier.
- §3.6 reset is server-authoritative → Task 10 `resetToSeed`.
- §3.7 `docker compose … up` green → Task 5.
- §4 data model (sentinel, constraints, history uniqueness) → Task 2.
- §5 API contract (GET/PUT/422/409/healthz) → Tasks 1, 3, 4.
- §6 projection, api store, envelope cache, OmsContext state machine → Tasks 6, 7, 9, 10.
- §7 three version numbers → kept distinct across Tasks 2 (columns), 7 (envelope), 9 (store).
- §8 repo layout & same-origin proxy → Tasks 1, 5, 10.
- §9 testing (concurrent PUT mandatory, classifier completeness, coalescing) → Tasks 4, 8, 9, 10.

**Placeholder scan:** none — every step has runnable code or an exact command.

**Type consistency:** `toPersistedOms`/`hydrateOms`/`defaultUi` (Task 6) used verbatim in Tasks 9–10; `createOmsApiStore({ baseUrl, cache })` and its error codes (`offline`, `offline-cache`, `stale-write`) consistent across Tasks 9–10; envelope `{ schemaVersion, revision, doc }` consistent Tasks 7, 9; API shapes (`base_revision`, `current_revision`, `{ revision }`) consistent Tasks 3–4 and 9.

**Open risk to watch during execution:** the coalescing test (Task 9, Step 1) depends on `fetch` mock timing; if flaky, assert on the recorded `base_revision` sequence rather than call scheduling. The `OmsContext` debounced-save + stale-reload path uses `waitFor`; keep the 300ms debounce or the test's timeout must exceed it.
