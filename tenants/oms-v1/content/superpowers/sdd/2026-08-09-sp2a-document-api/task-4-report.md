# Task 4 Report — `PUT /api/document` atomic revision swap

## What I implemented

`backend/app/documents.py` gained a `PUT /api/document` route alongside the
existing `GET`:

- Validation (422), in order:
  1. `payload.schema_version != settings.schema_version` → 422
  2. `payload.doc` not a dict, or contains a `"ui"` key → 422
  3. `payload.doc.get("version") != settings.schema_version` → 422
- Atomic write: a single `UPDATE ... WHERE id = 1 AND revision = :base_revision
  RETURNING revision` via SQLAlchemy
  `update(ScheduleDocument).where(...).values(revision=ScheduleDocument.revision + 1, doc=..., schema_version=..., updated_at=func.now()).returning(ScheduleDocument.revision)`.
  No preceding `SELECT` of current revision — the `WHERE` clause on the
  `UPDATE` itself is the concurrency guard.
- On no matching row (`scalar_one_or_none() is None`): `session.rollback()`,
  return `409 {"error": "stale-write", "current_revision": <read via
  session.get(ScheduleDocument, DOC_ID).revision>}`.
- On success: append one `ScheduleDocumentHistory` row
  (`document_id=DOC_ID, revision=new_rev, schema_version=payload.schema_version,
  doc=payload.doc`), `session.commit()`, return `{"revision": new_rev}`.

Implementation matches the brief's Step 3 code verbatim.

## TDD evidence

**RED** — `backend/tests/test_put_document.py` (7 tests) against the
pre-implementation router:

```
7 failed
  test_put_base_zero_creates_revision_one    405 != 200
  test_put_appends_one_history_row            0 != 1 (no history row written)
  test_put_with_current_base_succeeds         405 != 200
  test_put_with_stale_base_is_rejected        405 != 409
  test_put_rejects_ui_in_doc                  405 != 422
  test_put_rejects_bad_schema_version         405 != 422
  test_put_rejects_bad_doc_version            405 != 422
```

All failed with `405` (route not defined — `PUT /api/document` didn't exist
yet), exactly as the brief predicted.

**GREEN** — after adding the route:

```
python -m pytest backend/tests/test_put_document.py -v
7 passed
```

## Concurrency test — approach, a real gap found, and how it was closed

I first implemented `backend/tests/test_put_concurrency.py` exactly as the
brief's Step 5 code specifies (`t.start()` immediately followed by
`a.commit()`, no synchronization). It passed on the first run and 15/15
consecutive runs, always with the correct `[False, True]` outcome. Before
declaring this sufficient, I ran it through the advisor, which flagged a
real problem: **the test's final assertion cannot distinguish "B was
genuinely blocked on A's row lock" from "B's UPDATE just happened to run
after A's commit already landed."** Both mechanisms produce the identical
observable result (`rb is None`), because B's `WHERE revision = 1` fails to
match either way — whether it's blocked-then-loses or simply-runs-late.
That's exactly the "purely sequential test" the brief warned against, and
it could creep in by accident even with the brief's own literal code, on a
fast enough local Postgres.

**I measured it.** Using a one-off instrumented script (not committed) that
timed B's `execute()` call with the brief's exact code (no sleep, no
synchronization), over 30 runs on this machine only **2/30** showed a
measurable block (>3ms elapsed in B's `execute()`); the other 28/30
completed in ~1-2ms, consistent with B's statement being sent to Postgres
*after* A's commit had already landed — i.e., no real lock contention, just
lucky sequential ordering that happens to produce the same pass/fail
signature. So the brief's literal Step 5 code, run as-is in this
environment, was **not reliably exercising the row lock at all** — it
mostly proved "these two UPDATEs ran in some order," not "one writer
blocked on the other's held lock," which is a materially weaker claim than
what Task 4 requires this test to demonstrate.

**Root cause**: `a.commit()` over a local socket is itself sub-millisecond,
and Python thread-start overhead is not guaranteed to land B's `execute()`
call before that commit completes. Relying on that race to "usually" work
is precisely the kind of accidental-sequential test the brief told me not
to ship.

**Fix (hardening, not weakening)**: rather than guess at a sleep duration, I
added `_wait_until_blocked_on_lock(pid)` to the test, which polls
`pg_stat_activity.wait_event_type` for B's own backend pid and waits until
Postgres itself reports that backend as blocked on a lock (`= 'Lock'`)
before letting `a.commit()` proceed. This is a direct, non-heuristic
observation of genuine DB-level contention — no sleep-duration guessing,
no chance of committing early. I verified this approach separately (one-off
script) at **30/30** runs confirming genuine blocking, then applied it to
the committed test and added `assert genuinely_blocked, "B never reached a
genuine lock wait — test would be sequential, not contended"` immediately
before the original outcome assertion, so a future regression back to
non-overlapping timing would fail loudly instead of silently passing for
the wrong reason.

**Observed outcome after hardening**: ran the hardened test **20/20**
times — every run passed, and every run's `genuinely_blocked` was `True`
(confirmed by the assertion succeeding each time; the assertion would have
raised immediately otherwise). The original outcome assertion
(`sorted([ra is not None, rb_thread[0] is not None]) == [False, True]`) is
unchanged — I did not touch the substance of what's being proved, only how
reliably the setup produces the real contention scenario the brief asked
for.

This is a deliberate, documented deviation from the brief's literal Step 5
code (which lacked synchronization), justified by direct measurement, and
it strengthens the test rather than watering it down — the assertion is
strictly stronger than before (it now also fails if genuine contention
doesn't occur), not weaker.

## Full backend suite

```
python -m pytest backend/tests/ -v
11 passed
```

(7 `test_put_document.py` + 1 `test_put_concurrency.py` + 1
`test_get_document.py` + 1 `test_health.py` + 1 `test_migration.py`.)

## Files changed

- `backend/app/documents.py` — added `PUT /api/document` route (modified)
- `backend/tests/test_put_document.py` — new, 7 tests (happy path × 3,
  stale-write, 3 validation cases)
- `backend/tests/test_put_concurrency.py` — new, mandatory concurrency test
  (hardened in a follow-up commit with `pg_stat_activity`-based
  synchronization after measurement showed the brief's literal
  no-synchronization version rarely exercised genuine lock contention on
  this machine — see "Concurrency test" section above)

No files outside `backend/` were touched.

## Self-review

- Route logic matches the brief's Step 3 code exactly — no paraphrasing, no
  deviation in validation order, error shapes, or the atomic-swap statement.
- Verified the write is genuinely one atomic statement: the `UPDATE` carries
  both the identity predicate (`id = 1`) and the concurrency predicate
  (`revision = base_revision`) in the same `WHERE`, with `RETURNING` used to
  detect whether the predicate matched — never a separate `SELECT` followed
  by an unconditional `UPDATE`.
- Confirmed validation ordering matches test expectations: bad
  `schema_version` is checked before `doc` shape, so
  `test_put_rejects_bad_schema_version` (which supplies a well-formed `doc`)
  gets 422 from the first check.
- Confirmed the 409 branch's `session.get(ScheduleDocument, DOC_ID).revision`
  read is safe here: the sentinel row always exists in SP2a (migration
  0001 seeds it, and there is no delete path), so this can't 500 in the
  current system. Per Task 3's forward note, I did not add defensive
  handling since the brief doesn't call for it — flagging only for
  awareness, matching the note's instruction.
- Ran the full backend suite (11 tests) after the hardening, plus 20 extra
  runs of the concurrency test alone — all green, and all 20 confirmed
  genuine lock contention via `genuinely_blocked`.
- Verified the brief's "422 must reject a non-object doc" requirement
  directly (one-off request, not added to the verbatim test file, per
  instruction not to speculatively expand it): `PUT /api/document` with
  `"doc": []` returns `422 {"detail": [{"type": "dict_type", "loc":
  ["body", "doc"], "msg": "Input should be a valid dictionary", ...}]}` —
  handled by Pydantic's own type validation on `DocumentPut.doc: dict`
  before the handler's `isinstance` check ever runs. Confirmed, not just
  assumed.

## Concerns

One real gap was found and closed before committing, not left standing:
the brief's literal Step 5 concurrency-test code (no synchronization
between `t.start()` and `a.commit()`) passed deterministically (15/15) but,
per direct measurement, mostly did **not** exercise genuine row-lock
contention on this machine (2/30 measurable blocks) — it was passing by
accidental sequential ordering, which produces the same observable result
as real contention and would not have been caught by re-running the
original test alone. I hardened the committed test with
`pg_stat_activity`-based synchronization (see "Concurrency test" section)
and added an explicit `assert genuinely_blocked` so this can't silently
regress. Verified 20/20 after the fix, with the mechanism itself
(not just the outcome) confirmed each run.

No other concerns. TDD sequence (RED → GREEN) for the PUT route and its
validation/stale-write tests is clean, and no scope crept outside
`backend/`.

---

## Fix report — review follow-up (Important + 2 Minor)

The Task 4 review (Spec approved, Quality approved) flagged three items,
all addressed below.

### Important — concurrency test guarded a copy of the SQL, not the route

**Problem**: `test_put_concurrency.py::_swap` reimplemented the route's
`UPDATE ... RETURNING` locally. It proved that SQL pattern was race-free,
but not that `put_document` actually used that pattern — a future regression
to SELECT-then-unconditional-UPDATE in the route would still have passed
the test.

**Fix**: extracted the write logic out of `put_document` into
`apply_document_write(session, *, doc, base_revision, schema_version) ->
int | None` in `backend/app/documents.py`. It runs the same atomic
`UPDATE ... WHERE id=1 AND revision=:base_revision ... RETURNING revision`,
adds the `ScheduleDocumentHistory` row on success, and returns the new
revision or `None` on a stale base — but does **not** commit/rollback; that
transaction boundary stays with the caller.

- `put_document` now calls `apply_document_write(...)`, keeps the 422
  validation, the 409 shaping (`session.get(...).revision` +
  `session.rollback()`), and the commit boundary — behavior is unchanged.
- `test_put_concurrency.py`'s two racers (`ra = apply_document_write(a,
  ...)` / the threaded `run_b`) now call that exact same function instead
  of a local `_swap`. The `pg_stat_activity` synchronization and the
  `assert genuinely_blocked` precondition are unchanged — only the target
  of the race changed, from a private copy of the SQL to the real
  production code path.

Net effect: there is now exactly one atomic-write implementation in the
codebase. The concurrency test racing on `apply_document_write` **is**
racing on the route's write path, because the route has no other way to
write.

### Minor — thread exception swallowed

**Problem**: if the racer's call raised inside the thread, `rb_thread[0]`
would `IndexError`, masking the real DB error.

**Fix**: `run_b` now wraps its call in `try/except Exception`, appends any
exception to an `errors` list, and after `t.join()` the main thread does
`if errors: raise errors[0]` before touching `rb_thread[0]`. A real DB
error now surfaces as itself, not as a misleading `IndexError`.

### Minor — stale test lacked a no-mutation assertion

**Problem**: `test_put_with_stale_base_is_rejected` asserted the 409 response
shape but never checked that the rejected write left no trace.

**Fix**: added, after the 409 assertions:
```python
with migrated_db.connect() as conn:
    n = conn.execute(text("SELECT count(*) FROM platform.schedule_document_history")).scalar_one()
assert n == 1
got = client.get("/api/document").json()
assert got["revision"] == 1
```
confirming the history table still has exactly one row and `GET` still
reports revision 1 after the rejected write.

### Covering tests run (with venv active, from repo root)

```
source backend/.venv/bin/activate
python -m pytest backend/tests/test_put_document.py -v
→ 7 passed

python -m pytest backend/tests/test_put_concurrency.py -q   # looped 20x
→ 20/20 runs: 1 passed each (genuinely_blocked confirmed every run)

python -m pytest backend/tests/ -v
→ 11 passed
```

Full backend suite stayed green throughout; no test's expected behavior
changed except the two additions described above (no-mutation assertions,
exception re-raise) and the concurrency test's target function.

### Files changed (this follow-up)

- `backend/app/documents.py` — extracted `apply_document_write`; `put_document`
  now delegates to it (behavior unchanged, verified by unchanged 200/409/422
  test outcomes)
- `backend/tests/test_put_concurrency.py` — racers call `apply_document_write`
  instead of a local `_swap`; thread exceptions captured and re-raised
- `backend/tests/test_put_document.py` — stale-write test gained
  no-mutation assertions

### Self-review

- Confirmed `apply_document_write` has no side effect beyond the `UPDATE`
  and the pending `session.add(...)` — no commit/rollback inside it, so the
  route's transaction semantics (rollback-then-409 vs commit-then-200) are
  identical to before.
- Confirmed the history row is still only added on the winning path (inside
  the `if new_rev is None: return None` guard) — matches prior behavior
  where the loser never got a history row.
- Re-ran the full suite and the concurrency test in a 20-iteration loop
  after every substantive change, not just once at the end.

### Concerns

None remaining. All three review items closed; full suite green; hardened
concurrency test now exercises the actual route's write path, not a
parallel copy of it.
