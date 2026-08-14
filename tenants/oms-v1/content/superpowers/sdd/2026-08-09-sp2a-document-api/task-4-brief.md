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

