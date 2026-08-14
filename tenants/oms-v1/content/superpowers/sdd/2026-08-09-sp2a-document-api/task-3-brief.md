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

