# Fixture: a plan containing one of every defect the checker exists to catch.

## Task 8: Converter

**Files:**
- Test: `oms-new/backend/tests/test_seed_counts.py`

```python
import subprocess

from tests.test_other import shared_fixture


def seeded():
    """Loads data; the real one is added later."""
    subprocess.run(["alembic", "downgrade", "base"], cwd=backend)
    subprocess.run([sys.executable, "-m", "app.seed.load"], cwd=backend)


def pairs(header, row):
    return dict(zip(header, row))


def label(kind, code):
    return "%s_%s" % (kind, code)


def note():
    """Interpreter lives at .venv\Scripts\python.exe here."""


def test_rejects_zero():
    with pytest.raises(IntegrityError):
        conn.execute(text("INSERT INTO scheduling.default_need VALUES (0)"))


def codes():
    return set(CANONICAL_CODE_RE.findall(sql))
```

Run: `cd backend; python -m tools.convert_workbook`

## Task 10: Seed loader

**Files:**
- Create: `oms-new/backend/app/seed/load.py`
