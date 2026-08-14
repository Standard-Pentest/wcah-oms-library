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

