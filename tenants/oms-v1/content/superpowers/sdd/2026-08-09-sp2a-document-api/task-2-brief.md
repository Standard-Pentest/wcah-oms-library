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

