# oms-new Repo Report — 2026-08-20 (evening edition)

**Scope:** `main`, `f8c360b` → `dfdc48b`. The command's date/commit placeholders were unfilled, so the window defaults to *everything since this morning's report* (`oms-new-repo-report-2026-08-20.md`, 12:27, which covered 2026-08-13 → 2026-08-20 through PR #17). That delta is exactly one merge: **PR #18** ("August 20 tg"), 17 commits, all by TomWCAH, merged 2026-08-20 22:13 PDT (`2026-08-21T05:13Z`). Zero open PRs, zero open issues; main CI green.

> ### 🔴 Critical callout
> **app.wcahops.com (93.188.162.248) serves the full read *and* write API on port 443 with no application authentication** — re-verified at `dfdc48b`: `backend/app/main.py:19` constructs `FastAPI()` with no auth wiring, and `backend/app/api/deps.py` provides only `get_db`/`get_organization` (its "session" references are SQLAlchemy `Session`s, not auth sessions); CORS is the only gate. Real hospital roster data (44 employees) is live. The runbook-designated mitigation (hPanel IP allowlist) is **still pending**, and the VPS is now **two merges behind** (`8025da4` vs `dfdc48b`) with redeploy blocked on a GitHub deploy key for the `oms` user.

## Executive Summary

Since this morning's report (Aug 13–20, through PR #17), one PR merged: **#18** (`dfdc48b`), 39 files, +8,150/−62 — the **Week Board slice #4b**, built end-to-end: an approved design spec (decisions B1–B18), migration `0006` adding the `week_board` table (23rd), board projection arithmetic, read/write board API, and an interactive WeekBoard screen with a client-side draft model, synchronous edit tracking, and dirty-leave prompting. It also adds cross-platform start/stop-local dev scripts. CI was green on **both sides** of the merge — the `gh pr checks` guard held for the first time since the #12 break. Documentation drift **worsened**: `developer.md` still lists the board as "not yet built" and claims eighteen tables (now 23). Production remains unauthenticated and is now two merges behind main. Priorities: access control, deploy-key redeploy, doc truth pass, then the generation engine.

## 1. Latest Changes (`f8c360b..dfdc48b` = PR #18)

### Week Board — backend
- `d5dd98f` / `45a52f9` — approved design spec first (`docs/superpowers/specs/2026-08-20-oms-new-week-board-design.md`, decisions B1–B18; **PTO / FINAL / PUBLISH explicitly deferred**), then `2eb81a8` implementation docs.
- `3119851` — cell-override foundation; `backend/migrations/versions/0006_week_board_week_board.py` adds the `week_board` table (**23rd table** in the schema).
- `37d0747` — `backend/app/scheduling/board_projection.py`: projection arithmetic over week-setup needs and overrides.
- `78e3803` — read endpoint (`backend/app/api/board.py`); `ac201c5` — cell-override write endpoints; `9baa4d7` — override-reference validation.

### Week Board — frontend
- `2473fd7` — `frontend/src/board/draft.ts` client-side draft model (with fingerprint escaping fixed in `9dacf57`).
- `4186f1b` — interactive `frontend/src/screens/WeekBoard.tsx`; wired in `App.tsx`/`Shell.tsx`.
- `7e6f596` / `2f09431` — preserve Week Board edits during save; track edits synchronously (both responding to review findings, finalized in `039c239`).
- `084d525` — undefined weeks now route the user to Week Setup; dirty state prompts on navigation away.

### Tests
Six new test files: `test_board_projection.py`, `test_api_board.py`, `test_api_board_writes.py` (backend); `app.test.tsx`, `boardDraft.test.ts`, `weekBoard.test.tsx` (frontend), plus updates to the definition-of-done, migrations, and docs-corpus tests. Tree now contains **282 backend test functions and 105 frontend test cases** (CI pass counts run higher via parametrization; this morning's run: 338 backend / 92 frontend passed).

### Dev runtime (non-feature)
- `ab6ba4f` + start/stop-local scripts (`scripts/start-local.{sh,ps1,cmd}`, `stop-local.{ps1,cmd}`, ~361 lines), `.gitattributes`, README/CLAUDE.md/developer.md setup updates, `infra/backend.Dockerfile` tweak.

### Breaking changes
None to the API contract — new endpoints and one additive migration; regenerate the TS client only if you consume the new board routes. The local-dev surface changed (new bootstrap scripts). **No seed data changed** despite `ab6ba4f`'s commit message (see §4).

## 2. Documentation Changes

**Updated and current:** `HANDOFF.md` records Week Board completion; `docs/README.md` adds both Week Board spec/plan rows (marked "PTO / FINAL / PUBLISH are later"); `developer.md`'s local-setup section covers the new start/stop scripts; spec, plan, and SDD task artifacts committed per repo convention.

**Stale or inconsistent — all re-verified at `dfdc48b` today, none fixed:**
1. `docs/developer.md:21–24` — claims "eighteen tables" and "Not yet built: week lifecycle, the board, schedule generation, auth." Now wrong on **three** counts: 23 tables (18→22 in PR #11, →23 in #18); week lifecycle shipped in PR #11; **the board shipped today in PR #18**. Only schedule generation and auth genuinely remain.
2. `docs/developer.md:236+` (UI workflows) — still only Configuration, Team, and Week Setup entries; **no Week Board entry** (zero "Week Board" mentions in the entire file), and the previously flagged missing Departments entry is still missing.
3. `docs/README.md:38` — the `deployment.md` row still says "Not yet executed," contradicting `docs/deployment.md:10` ("**Status: deployed — live since 2026-08-19**").
4. `docs/wiki/06-frontend/02-api-client-generated-schema-contract-and-queries.md:59` — still documents the PATCH request-body generation gap ("Task 10 gap") that PR #15 closed. The wiki is a generated export; fix by regenerating (app + `scripts/export_repo_wiki.py`), never by hand-editing.

## 3. Next Sprint Suggestions

1. **[High] Add the GitHub deploy key and redeploy the VPS.** Impact: production is two merges behind — missing the entire Week Board feature and the CI-enforced `prod.env` dockerignore fix (`e78da3f`). Effort: under a day including `scripts/smoke-test.sh https://app.wcahops.com` verification. Blocked only on key creation for the `oms` user.
2. **[High] Close the access-control gap.** Interim (hours): apply the hPanel IP allowlist the deployment runbook already designates as the access control. Real fix (days+): begin the foundation-spec §13 auth slice — every write endpoint (employee roster, needs, week plans, board overrides) is currently callable unauthenticated.
3. **[Medium] Documentation truth pass.** Effort: half a day. Correct `developer.md:21–24`, add Week Board and Departments UI-workflow entries, fix `docs/README.md:38`, regenerate the wiki export. Justification: the repo's own quality gates treat docs as source of truth; four known-false statements shipped through green CI undermine that premise.
4. **[Medium] Schedule generation engine slice.** Highest product impact, largest effort (multi-week). Every input is now modeled — needs, eligibility, rotations, target hours, week setup, board overrides — so the weighted best-achievable generator with gap/violation reporting (mandate §2, the last unbuilt core competency) can begin.
5. **[Low] Week lifecycle completion (PTO / FINAL / PUBLISH).** Explicitly deferred by the Week Board spec (B-decisions); required before the draft-to-final-to-published audit-trail competency is satisfied. Fold in a commit/PR hygiene nudge (§4) — traceability currently leans entirely on the in-repo spec docs.

## 4. Risks & Concerns

- **Unauthenticated production exposure (critical, unchanged).** Evidence at `dfdc48b`: `backend/app/main.py:19` — bare `FastAPI()`; `backend/app/api/deps.py` — only `get_db`/`get_organization` dependencies; `/docs` remains exposed (verified in the 2026-08-20 risk review). Only mitigation is the out-of-repo VPS firewall; the allowlist is pending.
- **Prod/repo drift.** VPS pinned at `8025da4` while main advances; nightly backup is landing, but prod lacks Week Board and the dockerignore enforcement.
- **Semantic doc drift the guards can't catch.** `test_docs_corpus.py` checks file inventory, not factual truth, and the wiki is excluded by design — all four stale items in §2 passed green CI.
- **Commit/PR hygiene.** PR #18 is titled "August 20 tg"; commit `ab6ba4f` says "Updated seed database" but touched **no seed file** (10 files: dev scripts, docs, Dockerfile). Not blocking, but it degrades log-based archaeology.
- **Positive notes.** The merge guard demonstrably held: PR #18's checks were green pre-merge (run `32449612701`: backend 1m25s, frontend 42s, domain-code-scan 6s) and post-merge (`32449729470`, 1m44s) — the first clean both-sides merge since #12 broke main on 2026-08-19. No open PRs, issues, or observed test failures. *Caveat: findings rely on CI evidence; no local test suite was run this session.*

---
*Generated by `/sitrep` on 2026-08-20 (evening). Window `f8c360b..dfdc48b`; verification via `git`, `gh pr/issue/run`, and direct file reads at `dfdc48b`. Prior editions: `oms-new-repo-report-2026-08-20.md` (morning), `-2026-08-19-{morning,2,3}.md`.*
