# Repository Analysis: `oms-new` (TomWCAH/oms-new)

> [!CAUTION]
> **No critical defects are open right now** — CI is green, working tree clean, no failing tests. But one **high-priority process risk** deserves immediate action: `main` has **no branch protection** (GitHub API returns 404 for `branches/main/protection`), which is why PR #1 merged on 2026-08-17 while its CI run was **failing**, leaving `main` red for ~30 hours until PR #2 landed. This will recur without required status checks.

## Executive Summary

Since 2026-08-16 the repo shipped its second sub-project — **Configuration and roster writes** (PR #1, `4c37e7a`: 50 files, +7,227/−363 — write APIs, migration 0004, editing UI on Configuration and Team) — then stabilized DevOps (PR #2: ruff fixes that ended the ~30-hour red `main`, plus a 336-line bootstrap wizard; PR #3: bootstrap Docker fix) and refreshed docs (PR #4: new `docs/developer.md` runbook, README/HANDOFF updates). CI is green across all three jobs; 172 backend and 44 frontend test functions pass. The team switched from direct-to-main to PRs during this window. Remaining concerns: unprotected `main`, migration 0004 cannot upgrade pre-writes databases in place, and PATCH TypeScript types are hand-maintained. Next sprint should start sub-project 4 (week lifecycle and board).

---

## 1. Latest Changes

**Assumption stated:** the repo is younger than the default two-week window (first commit 2026-08-11), so this covers **all 80 commits on `main` through `c656009` (2026-08-18)**, with depth on the last three days.

### PR #1 — Configuration and roster writes (`032a10c`, merged 2026-08-16)

The largest change in repo history: `4c37e7a` (+ design docs `770964f`, `4d01876`). Delivers writes spec **W1–W8 complete except W7** (`employee_constraint` deferred by explicit YAGNI ruling — writes spec line 50).

- **Backend writes:** `backend/app/api/catalog_writes.py` (438 lines), `employee_writes.py` (664), `organization.py` (60), `schemas_writes.py` (208); RFC 9457 problem details on all errors.
- **Schema:** migration `backend/migrations/versions/0004_writes_foundation_writes_foundation.py` — partial unique open title, W6 org default shift pattern, nullable employee override.
- **Paid-hours resolution chain** (W6/D17): `backend/app/scheduling/paid_hours.py` — rotation cell → employee override → org default.
- **Frontend:** Team screen editing (profile, titles, eligibilities, rotation `PUT`, `Team.tsx` +954), Practice settings and location-aware needs grid on Configuration (`NeedGrid.tsx`, `PracticeSettings.tsx`), generated client `schema.d.ts` +1,595 lines.
- **Tests:** nine new/expanded backend test modules and +457 lines of frontend tests.
- ⚠️ **Operational breaking change:** migration 0004 adds `organization.default_shift_pattern_id NOT NULL`, so **a database seeded before this slice cannot be upgraded in place** — it needs downgrade/reseed (documented at `docs/developer.md:178-181`).

### PR #2 — Green CI + bootstrap tooling (`e87c06a`, merged 2026-08-18)

- `2ec70e6` cleared the ruff errors that had left `main` red since PR #1's merge run failed at 2026-08-17T02:02Z.
- `545bfff` added `scripts/bootstrap.sh` — a 336-line idempotent Unix wizard (Postgres via compose on port 5433, Python 3.12 venv via `uv`, migrate + seed, frontend deps, then self-verifies with ruff and pytest). It detects the migration-0004 failure and offers the documented recovery.
- `61f7d82` added the macOS stop script (`scripts/stop-oms-macos.sh`) and tools packaging config.

### PR #3 — Bootstrap fixes (`bb2fd81`, 2026-08-18)

`87b167a`: Docker daemon auto-start handling in `bootstrap.sh`, a ruff E402 fix in `backend/app/api/codes.py`, and a `test_check_plan` adjustment.

### PR #4 — Documentation (`c656009`, 2026-08-18)

`4dd6d7c`: new developer runbook `docs/developer.md` (228 lines), README and HANDOFF refresh (detail in §2). Co-authored by `kasey@standardpentest.com` — the first contribution attributed outside Tom/Cursor.

### Earlier context (2026-08-11 → 08-15, foundation slice)

18 tables across `core`/`scheduling`, workbook→SQL converter with `seed/domain_codes.json` manifest, domain-code scan with no exception list (`4bd9c4e`), read API (`/healthz`, `/api/reference`, departments, default-needs, employees, hospital-constraints), React scaffold + Configuration/Team screens (`01812d6`, `5ed2afa`), three-job CI (`6ebfa24`). Authorship shifted mid-window: commits through 08-16 are by TomWCAH (Cursor agent co-author); merges from 08-17 are by HinchK.

## 2. Documentation Changes

- **New:** `docs/developer.md` (`4dd6d7c`) — the operational runbook: local setup per platform, complete mounted HTTP route tables ("verified against `backend/app/main.py`"), CI gates, and a symptoms/causes pitfalls table. It is wired into the docs-corpus guard (`backend/tests/test_docs_corpus.py`), so it can't silently go stale.
- **Refreshed:** `README.md` (+67 — it still described a read-only slice after writes landed), `HANDOFF.md` (status now dated 2026-08-18), `docs/README.md` index, and `CLAUDE.md` (+16 in `4c37e7a`, +19 in `4dd6d7c`).
- **Consistency check: good.** README, `docs/developer.md`, and HANDOFF agree on the shipped surface and the not-yet-built list (week lifecycle, board, generation engine, auth). The corpus index marks documents current/superseded/mockup-only (decision D6). 32 of 80 commits (40%) are `docs:` — that is the team's spec-first SDD workflow, not drift.
- **Documented-but-unfixed gap:** PATCH request bodies parsed via `patch_body()` in `backend/app/api/deps.py` don't appear in the generated OpenAPI types, so matching TypeScript is **hand-maintained** in `frontend/src/api/queries.ts` and must stay aligned with `backend/app/api/schemas_writes.py` (`docs/developer.md:140-144`). Documented as a pitfall rather than resolved.
- **Gaps:** no CHANGELOG and no tagged releases; the PRD (v0.7.6) lives outside the repo on a Windows OneDrive path (`HANDOFF.md:115-117`), so doc-vs-PRD consistency cannot be verified from the repository.

## 3. Next Sprint Suggestions

1. **[High] Add branch protection + required CI checks to `main`.** Effort: minutes; impact: high. Unprotected `main` already produced one incident (red `main`, 2026-08-17T02:02Z → 2026-08-18T07:46Z). Requiring the three existing CI jobs on merge closes the only repeatable path to a broken `main`.
2. **[High] Start sub-project 4: week lifecycle and board.** Effort: large (multi-sprint); impact: highest. It is the declared next sub-project (foundation spec §13, `2026-08-11-oms-new-foundation-slice-design.md:494-506`): `schedule_week`, `day_plan`, `need_override`, `cell_override`, `violation_authorization`, PTO, and DRAFT → FINAL → PUBLISHED. It's the prerequisite for the generation engine and delivers the mandate's audit-trail/lifecycle competency. Begin with the design doc, per the team's spec-first process.
3. **[Medium] Close the PATCH OpenAPI type gap.** Effort: medium; impact: prevents silent wire drift. Make `patch_body()` models surface in `openapi.json` so `schema.d.ts` covers them, or add a CI alignment check between `frontend/src/api/queries.ts` and `backend/app/api/schemas_writes.py`. The risk grows with every write endpoint added after 0004.
4. **[Medium] Spec the generation engine (sub-project 5) in parallel.** Effort: design-sized; impact: de-risks the biggest remaining build. Weighted best-achievable scheduling is the product's core competency (`AGENTS.md` §2), and the D23 weight model (0–50 soft / 51–100 hard / default 40) is already in the schema — the spec can proceed while sub-project 4 is built.
5. **[Low] Bootstrap parity and migration ergonomics.** Effort: small; impact: convenience. Windows/PowerShell still has no wizard (manual path in `README.md:37-57`), and a backfill-capable migration would let pre-writes databases upgrade in place instead of reset-and-reseed (`docs/developer.md:178-181`).

## 4. Risks & Concerns

- **Unprotected `main` (process):** the PR #1 red-merge incident above; no required status checks exist today.
- **Migration 0004 in-place upgrade impossible** for pre-writes seeded databases. Documented and wizard-detectable, but a real trap for anyone running alembic manually.
- **No authentication by design** (sub-project 8, not started): "writes are as open as reads" with permissive localhost CORS (`docs/developer.md:73`). Acceptable pre-deployment; must land before any real clinic use.
- **Hand-maintained PATCH TypeScript** (§2 above) — the main code-level debt introduced by the writes slice.
- **Environment coupling:** port 8000 is often the `../oms` mockup on this machine; `npm run generate:api` pointed at the wrong server will silently write mockup types into `schema.d.ts` (`docs/developer.md:134-138`). Documented, but silent-failure by nature.
- **Known flake:** `tools/tests/test_check_plan.py` fails on non-3.12 venvs (`HANDOFF.md:135-136`) — a reproducibility trap rather than a product bug.
- **Positives worth stating:** CI green on latest `main` (run 32115795526, 2026-08-18) across backend (ruff + alembic + seed + pytest), frontend (typecheck/test/build), and the domain-code scan; 172 backend test functions across 23 modules plus 44 frontend; clean working tree; no merge conflicts; zero open GitHub issues (though that also means no external bug queue — work is tracked in HANDOFF/specs instead).

## Evidence and Limitations

- **Window:** repo's entire history (2026-08-11 → 2026-08-18, 80 commits) falls inside the assumed two-week range; I did not run the test suites locally — "tests pass" rests on the latest green CI runs on `main`.
- **Issues/milestones:** `gh issue list --state open` returned none; I did not review GitHub Projects/milestones.
- **PRD** v0.7.6 is outside the repository and could not be consulted.
- All file/line references are as of `c656009` (current `main`).
