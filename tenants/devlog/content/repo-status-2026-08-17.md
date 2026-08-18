# oms-new — Repository Status Report

*Prepared 2026-08-17 · analyst pass, no files modified*

**Assumptions (placeholders were not filled in):**
- **Repository** — the local checkout at `/Users/hinchk/WestCoast.Vet/oms-new` (`origin` = `TomWCAH/oms-new`), at `main` / `032a10c`, working tree clean.
- **Range** — the full history, 2026-08-11 (`e195100`) → 2026-08-16 (`032a10c`), 60 commits, with §1 concentrating on the last 6.
- **Method** — CI results read from GitHub Actions via `gh`; backend suite re-run locally against a throwaway database (`oms_new_ci`, dropped afterwards) so the dev database was left untouched. Nothing was fixed, staged, or committed.

---

> ## ⛔ Critical — `main` is red and has never test-run the writes slice
>
> **1. CI fails on `main`.** Run [31986760372](https://github.com/TomWCAH/oms-new/actions/runs/31986760372) on `032a10c`: the `backend` job dies at `ruff check backend tools` with **5 errors**. `frontend` ✓ and `domain-code-scan` ✓.
>
> **2. Because lint runs first, `pytest` never executed.** The five test modules added by `4c37e7a` — `test_api_catalog_writes.py`, `test_api_employee_writes.py`, `test_api_default_needs_writes.py`, `test_api_constraints_writes.py`, `test_api_organization.py` (~45 tests) — have **zero CI coverage**. PR #1 was merged without a green run.
>
> **3. The fix is trivial** — 2 of 5 errors are `ruff --fix`-able, a 3rd with `--unsafe-fixes`. Local evidence says the suite underneath is healthy: **271 passed, 1 failed** (the 1 is a Python-3.14-only artifact, see §4.2).
>
> `main` has been red since 2026-08-17T00:06Z for **two different reasons in sequence**: `770964f` failed `test_docs_corpus.py` (index missing the two new docs); `4c37e7a` self-healed that by updating `docs/README.md` — and introduced the lint failures.

---

## Executive summary

Two sub-projects have shipped in six days: the foundation slice (schema, seed conversion, read-only API, two React screens) and, on 2026-08-16, the **Configuration and roster writes** slice — 50 files, +7,227/−363, turning both screens into editing surfaces (`4c37e7a`, merged as `032a10c`). Code quality is unusually disciplined: zero `TODO`/`FIXME`, zero skipped or xfailed tests, 271 backend and 44 frontend tests, a passing no-hardcoded-domain-data scan over 35 canonical codes, and a 595-row fixture that matches its asserted per-table counts exactly.

The problem is process, not code. `main` is red on 5 lint errors, which means the writes slice's own tests have never run in CI, and PR #1 merged anyway. `HANDOFF.md` still describes that slice as uncommitted. Both are hours of work, not days.

---

## 1. Latest changes

Sole author throughout: **TomWCAH** (`4c37e7a` co-authored by Cursor). 60 commits, 2026-08-11 → 2026-08-16.

### `4c37e7a` — feat: configuration and roster writes slice (2026-08-16)
The release. 50 files, **+7,227 / −363**. Implements decisions W1–W8 of `docs/superpowers/specs/2026-08-16-oms-new-configuration-roster-writes-design.md`.

**Backend (new):**
| File | Lines | What |
|---|---|---|
| `backend/app/api/employee_writes.py` | 664 | Employee profile, title transitions, eligibilities, rotations/cells |
| `backend/app/api/catalog_writes.py` | 438 | CRUD for departments, roles, locations, titles, shift patterns |
| `backend/app/api/schemas_writes.py` | 208 | Write-side Pydantic schemas |
| `backend/migrations/versions/0004_writes_foundation_...py` | 88 | Partial unique open-title index, `organization.default_shift_pattern_id`, nullable employee profile override |
| `backend/app/scheduling/paid_hours.py` | 27 | W6 resolution chain: `rotation_cell.paid_hours` → profile → organization |

Modified: `departments.py` (+176), `constraints.py` (+151), `organization.py` (+60, adds `PATCH /api/organization`), `deps.py`, `problems.py`, `main.py`, `core/models.py`, `scheduling/models.py`.

**Frontend:** `Team.tsx` (+954), `Configuration.tsx` (+552), new `NeedGrid.tsx` (274), `PracticeSettings.tsx` (100), `rotationCells.ts` (68), `problems.ts` (29), `InlineError.tsx` (7); `api/queries.ts` (+339) and a regenerated `api/schema.d.ts` (**+1,595**).

**Tests:** 5 new backend modules (~45 tests) plus `test_paid_hours.py` (4); `configuration.test.tsx` (+252) and `team.test.tsx` (+205).

**Breaking / migration-relevant:**
- **Schema migration `0004_writes_foundation`** is required — `alembic upgrade head` before running.
- **Fixture regenerated.** `tools/convert_workbook.py` (+25) and `seed/wcah_seed.sql` (82 lines changed) — org default shift pattern, `shift_pattern.active`, null echoes for 37 employees. Any database seeded before this needs re-seeding.
- **Generated API client changed** (`schema.d.ts` +1,595). Per D11 this is intentional: a renamed column becomes a build failure. Any parallel frontend work must regenerate.
- **Canonical `code` is now immutable after create (W3)** — the server derives `{kind}_{snake_case(slug)}` and rejects later `code` patches. Rename is `name` / `short_label` only.
- **Deletion semantics (W2):** durable identities soft-deactivate; only non-identity edges (`default_need`, eligibility rows, rotation cells, closed title history) hard-delete.

### Other recent commits
| Commit | Date | Type | Notes |
|---|---|---|---|
| `032a10c` | 08-16 | merge | PR #1 `August-16` → `main`. **Merged with CI red.** |
| `770964f` | 08-16 | docs | Writes spec + plan, +879 lines. Broke `test_docs_corpus.py` (index not updated in the same commit). |
| `4d01876` | 08-16 | docs | Practice-level default shift length ruling rewritten (109 lines) ahead of the W6 build. |
| `f63ab67` | 08-15 | feat | `.vscode/tasks.json` (81) — dev environment tasks. No product code. |
| `3a627c7` | 08-13 | docs | HANDOFF status + session guidelines (+55/−13). |
| `6ebfa24` | 08-13 | ci | Three-job pipeline, `test_definition_of_done.py` (134), README, `infra/backend.Dockerfile`. |

No refactor-only commits in this window; the last were `b1a7c52` / `52178ea` (snake_case JSONB parameter keys, D12).

---

## 2. Documentation changes

The corpus is unusually well-tended — `docs/README.md` classifies all 37 markdown files as Current / Superseded / Mockup-only, and `test_docs_corpus.py` enforces that index in CI. Recent doc work: `770964f` (+879, writes spec and plan), `4d01876` (practice default shift length), `3a627c7` (HANDOFF), plus in-commit updates inside `4c37e7a` to `CLAUDE.md` (+16), `HANDOFF.md` (+65), `docs/README.md` (+4), `seed/CONVERSION.md` (+7).

**Inconsistencies found — all in prose that no test guards:**

1. **`HANDOFF.md` contradicts the git history.** It states the writes slice is *"implemented locally as of 2026-08-16 — **uncommitted on the working tree**"*, that *"Two sub-projects are done **locally**"*, and lists the writes deliverables under *"Writes slice (local, uncommitted)"*. All of it shipped in `4c37e7a` and merged as `032a10c`. It also pins the foundation as *"complete on `main` at `6ebfa24`"* — `main` is five commits further on. `AGENTS.md` §0 explicitly instructs agents to call out stale `HANDOFF.md` rather than follow it; `CLAUDE.md` already carries the correct statement ("Configuration and roster writes (W1–W8) are implemented").
2. **`README.md:11` still says "a read-only API."** Untrue since W1–W8. The Checks section also omits `npm run build`, which CI runs and which is a real gate (`tsc -b && vite build`).
3. **`docs/open-items/2026-08-13-practice-default-shift-length.md` is still filed under `open-items/`** though both `HANDOFF.md` and `docs/README.md` mark it implemented (W6, 2026-08-16).
4. **`HANDOFF.md` "Machine notes" describe a different machine** — Windows, PowerShell, `backend\.venv\Scripts\python.exe`, Python 3.12.10, "`gh` is not on PATH". This checkout is macOS with a Python **3.14.7** venv at `backend/.venv/bin/` and `gh` **is** installed. `CLAUDE.md` repeats the PowerShell `;`-not-`&&` rule. Harmless for a single developer; actively misleading for anyone else or for an agent session.

**Root cause worth naming:** `test_docs_corpus.py` guards the *index*, and it did its job — it caught the drift at `770964f`. Nothing guards `HANDOFF.md` / `README.md` *prose* against git reality, which is exactly where the staleness shipped.

---

## 3. Next sprint suggestions

> **Gap:** `gh issue list --state all` returns **nothing** — there is no issue tracker on this repo, and only one PR ever (#1, merged). The backlog is inferred from foundation spec §13, decision W7, and `docs/open-items/`. Priorities below reflect impact/effort, not Tom's stated intent.

1. **[High · ~30 min] Clear the 5 lint errors and get a green `main`.** Blocks everything, and until it lands the writes slice's ~45 backend tests have never executed in CI.
   - `backend/app/api/employee_writes.py:5` — `F401` unused `decimal.Decimal` import (likely residue from a dropped numeric path; check before deleting)
   - `backend/tests/test_api_codes.py:1` — `I001` unsorted imports *(auto-fix)*
   - `backend/tests/test_api_default_needs_writes.py:42` and `backend/tests/test_api_employee_writes.py:38` — `E741` ambiguous variable `l` *(rename to `loc`)*
   - `backend/app/api/deps.py:49` — `UP047` generic function `patch_body` should use PEP 695 type parameters *(unsafe-fix; review by hand)*
   Then confirm the backend job reaches `pytest` and passes on Python 3.12.

2. **[High · ~1 hr] Reconcile `HANDOFF.md` and `README.md` with committed reality.** All four items in §2. `AGENTS.md` §0 makes this a correctness issue for agent sessions, not a nicety — an agent reading HANDOFF today will believe the writes slice is uncommitted and may try to re-do or re-commit it. Consider extending `test_definition_of_done.py` with a cheap guard (e.g. HANDOFF's asserted `main` SHA must be an ancestor of `HEAD`).

3. **[Medium · ~1 hr] Pin the backend toolchain.** CI resolved `ruff 0.16.3`, `pytest 9.1.1`, `fastapi 0.141.1`, `starlette 1.6.0`, `sqlalchemy 2.0.52` from unpinned floors (`ruff>=0.8`, `pytest>=8.3`, `fastapi>=0.115`). The frontend has `package-lock.json`; the backend has no equivalent, so a green build is not reproducible tomorrow and a new lint rule can redden `main` with no code change. Add a constraints/lock file, or at minimum pin `ruff` exactly.

4. **[Medium · ~15 min] Decouple `tools/tests/test_check_plan.py:17` from CPython's warning text.** It asserts the literal string `"invalid escape sequence '\d' on line 1 — use a raw string"`; CPython 3.14 rewords this to `'"\d" is an invalid escape sequence. Did you mean "\\d"?'`. Green on CI's 3.12, red on 3.14 — a latent blocker for any Python upgrade. Assert on a substring or the flagged line number instead. Pair with a decision on the interpreter gap (see §4.2).

5. **[Medium/High · sprint-sized] Choose the next product increment — this is Tom's call, not an obvious default.**
   - **(a) Complete the Pacific Beach dataset** (foundation spec §13 #3). W8 already shipped the *capability* — Configuration creates needs at either location, Team sets PB eligibility and `@PB` rotation cells. What remains is data entry through the app, deliberately not a schema project. Low risk, high visible completeness; also the first real exercise of the new write paths.
   - **(b) Open sub-project 4 — week lifecycle and the board** (`schedule_week`, `day_plan`, `need_override`, `cell_override`, DRAFT → FINAL → PUBLISHED). The larger, higher-value step, and W2 notes it is a *precondition* for revisiting hard-delete of durable identities. Needs its own design + plan cycle first.
   Doing (a) first de-risks (b) by proving the write surface against a second location's real data.

*Not sprint items, but worth a footnote:* three stale branch pointers can be deleted (`docs-update` and `origin/docs-update` at `3a627c7`, `origin/aug-16-2` at `4c37e7a`, `hinchk/devops-dev-ci-retrofit` identical to `main`); and CI emits Node 20 deprecation warnings for `actions/checkout@v4`, `actions/setup-node@v4`, `actions/setup-python@v5`.

---

## 4. Risks and concerns

### 4.1 CI and process
- **`main` is red** (§callout). The `backend` job never reaches `alembic upgrade head`, `seed.load`, or `pytest`.
- **PR #1 was merged into `main` with a failing check.** No branch protection is evident. One PR, one merge, one red `main` — the pattern is worth fixing before a second contributor arrives.
- **The failure is not toolchain drift** — worth stating because it looks like it. Run [31981005021](https://github.com/TomWCAH/oms-new/actions/runs/31981005021) (`770964f`, ~2 h earlier) shows `ruff check backend tools` **passing**, and both that run and my local venv resolved the *same* ruff 0.16.3. The 5 errors arrived with the writes code, in files that did not exist at `770964f`. The unpinned `ruff>=0.8` (item 3 above) is a separate forward-looking risk, not the cause here.
- **No lockfile for backend dependencies** (§3 item 3).

### 4.2 Environment drift — and the limit of my evidence
The local venv is **Python 3.14.7**; CI pins **3.12**; `pyproject.toml` says `requires-python = ">=3.12"` and `ruff.target-version = "py312"`. My local run — **271 passed, 1 failed in 15.24s**, against a throwaway `oms_new_ci` database — is strong evidence that the writes-slice tests are healthy, but it is **not proof CI will go green**, because it ran on a different interpreter than CI uses. The single failure (`tools/tests/test_check_plan.py:17`) is 3.14-only and is described in §3 item 4. Confirming the writes suite on 3.12 is part of sprint item 1.

### 4.3 Technical debt — evidenced, and thin
Deliberately not padded. The usual suspects are absent:
- `grep -rniE '\b(TODO|FIXME|HACK|XXX)\b'` over `backend/app`, `backend/tests`, `frontend/src`, `frontend/tests`, `tools` → **0 hits**.
- **Zero** `xfail`, `pytest.mark.skip`, or `it.todo` markers — every test asserts.
- Frontend fully green: `tsc -b --noEmit` clean, 44/44 vitest, `vite build` succeeds (228 kB / 66.5 kB gzip).
- `python -m tools.scan_domain_codes` → *"clean: none of 35 canonical codes appears in backend/app, frontend/src"*.
- Fixture integrity verified independently: 595 value tuples across 18 `INSERT` statements, exactly matching the sum of `EXPECTED_ROWS` in `backend/tests/test_seed_counts.py`.

What debt exists: the 5 lint errors; the interpreter-coupled test at `test_check_plan.py:17`; unpinned backend deps; the doc drift in §2. Two files are large enough to watch — `frontend/src/screens/Team.tsx` (~1,000 lines after +954) and `backend/app/api/employee_writes.py` (664) — but both are cohesive and test-covered; flagging them now would be speculative.

### 4.4 Merge conflicts — none
Verified, not assumed. `docs-update` is 5 commits **behind** `main` with 0 unique commits (a stale pointer at `3a627c7`); `hinchk/devops-dev-ci-retrofit` is **identical** to `main` (0 ahead / 0 behind); `origin/aug-16-2` is the merged PR branch at `4c37e7a`. `git merge-tree` is clean. Working tree clean. **No divergence, no conflict risk** — just three stale pointers.

### 4.5 Deferred by design (not findings)
Listed so they are not mistaken for gaps: **no authentication** (foundation spec §12 item 5, sub-project 8); **`scheduling.employee_constraint` absent** (W7 — I13 holds, every standing fact has a first-class home, and shipping an empty escape hatch was explicitly rejected as YAGNI); **week lifecycle, board, generation engine, DVM teams, reporting** (spec §13, sub-projects 4–8). `CLAUDE.md` lists all of these under "do not build yet."
