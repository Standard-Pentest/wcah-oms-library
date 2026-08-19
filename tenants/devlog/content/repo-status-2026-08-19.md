# oms-new — Repository Analysis (2026-08-18, through PR #11)

_Supersedes the earlier same-day report `oms-new-repo-analysis-2026-08-18.md`, which covers only through PR #4 (`c656009`) and predates PRs #6, #8–#11. Its top recommendation — branch protection on `main` — was subsequently ruled out by HinchK on 2026-08-18 and is intentionally not re-suggested here._

**Scope assumptions (placeholders in the request were unfilled):** repository = local working tree `/Users/hinchk/WestCoast.Vet/oms-new`; range = last two weeks (2026-08-04 → `main` @ `4a053ce`), which covers the repo's entire history (first commit `e195100`, 2026-08-11; 94 commits). "Open issues" read from `docs/superpowers/plans/` + `docs/open-items/` — GitHub Issues is deliberately unused (`docs/README.md:13-15`). Verification ran locally on macOS (Postgres via `infra/docker-compose.yml`) plus GitHub Actions history; all facts below are directly verifiable.

> **No critical issues found.** All gates green: backend 331/331 pytest, frontend 92/92 vitest, `ruff` clean, domain-code scan clean (0/35 codes), `tsc` build succeeds, last 10 CI runs on `main` pass, working tree clean and in sync with `origin/main`.

## Executive Summary

oms-new is a one-week-old, docs-first rebuild of the West Coast Animal Hospital shift scheduler (FastAPI + PostgreSQL + React 18/Vite). In 94 commits across 11 PRs it delivered: the foundation slice (22 tables, deterministic seed converter, read/write API, Configuration/Team screens), Pacific Beach coverage, and Week Setup #4a (DRAFT weeks, fill/replace, explicit save), plus a Unix bootstrap wizard, opt-in pre-push hook, and three-job CI. Quality discipline is unusually strong: a no-exceptions domain-code scan, RFC 9457 problem details, generated API client, and CI-enforced docs checks. The named next slice is #4b Week Board. Main risks are mild: `HANDOFF.md` lags PR #11 by one merge, `CLAUDE.md`'s layout section is stale, and `Team.tsx` (1,267 lines) is becoming a god component. The mandate-critical scheduling engine (#5) is still entirely unbuilt.

## 1. Latest Changes

All 94 commits landed 2026-08-11 → 2026-08-18 on `main` (HEAD `4a053ce`, PR #11). Delivered in four waves:

**Foundation slice (Aug 11–13, ~50 commits).** Docs-first: spec `e195100` and handoff `cf6a4df` before any code; backend skeleton + Compose Postgres `d5b933d`; FastAPI app with RFC 9457 problem details `088882e`/`6eec37e`; read routes — reference bootstrap `658415c`, departments/default-needs `0e584da`, employees `06bd444`+`5439967`, hospital constraints `75d64a9`+`b359422`; snake_case wire fix `b1a7c52`; seed loader with not-already-seeded guard `88f8431`; workbook→SQL converter `3ce8af7`/`1042ae8`; static domain-code scan with no exception list `4bd9c4e`; plan checker `29dc96b`; three-job CI `6ebfa24`; React scaffold + generated client + reference provider `51e87e4`; Configuration `01812d6`+`5bfa43d` and Team `5ed2afa` screens.

**Writes + Pacific Beach (Aug 16–17, PR #1).** `4c37e7a` configuration and roster writes slice (catalog CRUD, employee profile/eligibilities/rotations, org PATCH, W6 default shift pattern); `c9af1c1` PB coverage (85 needs total, 44-employee roster pass baked into seed).

**Week Setup #4a (Aug 18, PRs #5/#6, #11).** `ead6472` Week Setup shell + API integration (migration `0005_week_setup`: `schedule_week`, `day_plan`, `day_plan_department`, `need_override`). `c12ea83` — the largest commit (26 files, +4,818/−968): week fill/replace endpoints (`backend/app/api/weeks.py`, now 928 lines) with new schemas (`LocationWeekReplaceIn`, `LocationDayOverrideIn`, etc. in `backend/app/api/schemas_writes.py`), a staging draft model (`frontend/src/weeks/draft.ts`, 336 lines + 337 lines of tests), the Departments screen extracted out of Configuration (`frontend/src/screens/Departments.tsx`), and 664 new backend test lines (`test_api_week_fill.py`, `test_api_week_replace.py`). Two new specs govern it: blank-location fill (F1–F9) and explicit save (E1–E9).

**DevOps + docs (Aug 18, PRs #2–#4, #8–#10).** Bootstrap wizard `545bfff`, macOS stop script + tools packaging `61f7d82`, developer runbook `4dd6d7c`, bootstrap/ruff fixes `87b167a`/`2ec70e6`/`5381a22`, HANDOFF/README/runbook reconciliation `482c85e`, cold-Docker pitfall + no-issue-tracker note `68dc838`, opt-in pre-push hook (ruff + domain-code scan) `be8eca7`.

**Breaking changes:** none. The API surface is additive (new endpoints/schemas), migration `0005` is additive, and the Configuration→Departments split is internal with tests updated in the same commit. No `xfail` markers remain (the three Task-12 xfails from `4ec2178` were later resolved).

## 2. Documentation Changes

Docs are ~52% of added lines (~29.3k of ~56.7k) — by design under the spec-driven (SDD) workflow, and drift is actively policed: `backend/tests/test_docs_corpus.py` and `test_definition_of_done.py` run in CI, and `docs/README.md` carries a current/superseded/mockup-only index.

- **Current:** `docs/README.md` was updated in `c12ea83` to index both 2026-08-18 specs (blank-location fill, explicit save). `docs/developer.md` gained the new HTTP surface (+21 lines in `c12ea83`). `docs/decisions/2026-08-05-track-d-rulings.md` and `docs/oms-domain-model.md` remain the authoritative model sources. Both `docs/open-items/` files are closed/resolved.
- **Stale (minor):** `HANDOFF.md` "Where things stand" was reconciled in `482c85e` (PR #8, 18:10) but predates PR #11 (22:58) — it does not mention blank-location fill, explicit save, the Departments screen, or the fill/replace endpoints. Its screen inventory ("Configuration and Team", `HANDOFF.md:17-18`) is one slice behind.
- **Stale (minor):** `CLAUDE.md` layout lists `src/screens/ Configuration, Team` (`CLAUDE.md:61`) — `WeekSetup.tsx` and `Departments.tsx` are missing. The out-of-scope rule "week lifecycle … do not build yet" (`CLAUDE.md:123-124`) is now ambiguous: Week Setup (DRAFT) is built; only the lifecycle proper (FINAL/PUBLISH, board, PTO) remains. A fresh agent reading only `CLAUDE.md` could conclude built work is forbidden.
- **Gap (external, by choice):** PRD v0.7.6 lives outside the repo on a Windows OneDrive path (`HANDOFF.md:147-148`) — unverifiable from this machine and a single point of failure for product intent.

## 3. Next Sprint Suggestions

1. **[High] Build #4b Week Board** — cells, away-from-home, PTO, DRAFT → FINAL → PUBLISHED. _Impact: highest — it is the explicitly named next slice (`HANDOFF.md:107`, foundation spec §13 #4) and unlocks the mandate's draft-to-final-to-published governance lifecycle. Effort: large (new tables `cell_override`, `violation_authorization`; new board UI)._ Follow it with a design/grill pass first, per the repo's own spec-first workflow.
2. **[Medium] Start the generation-engine design spec (#5)** — weights (D23: 0–50 soft / 51–100 hard), gaps, violations, `schedule_run`/`assignment`. _Impact: the mandate's core competency ("weighted, best-achievable schedule generation") is entirely unbuilt and is the highest-risk unknown; a design-only deliverable de-risks it before #4b finishes. Effort: low-medium (spec, not code)._
3. **[Medium] Close W7 — `employee_constraint` escape hatch** — the only writes-spec item still deferred (`HANDOFF.md:11-12`). _Impact: mandate §2 requires unusual/ambiguous cases to be captured as visible, configurable data; today employee-scope exceptions have no home, which invites the exact hardcoding the mandate forbids. Effort: medium (migration + CRUD + Team UI surface). Best done before the board and engine harden the model._
4. **[Low] Sync `HANDOFF.md` + `CLAUDE.md` with PR #11** — add the two 2026-08-18 slices and the Departments screen to the status/layout sections; reword the out-of-scope note to "board/PTO/publish lifecycle". _Impact: prevents a fresh agent session from misreading scope; docs checks limit but don't catch this class of drift. Effort: trivial._
5. **[Low] Decompose `Team.tsx` (1,267 lines)** and consider the same for `backend/app/api/weeks.py` (928 lines). _Impact: Team.tsx is the largest frontend file and grows with every roster-write feature; extracting sub-components now is cheaper than after #4b piles on. Effort: low-medium; behavior is already locked by `tests/team.test.tsx` (21 tests)._

## 4. Risks & Concerns

- **No failing tests, no merge conflicts, no open PRs.** Working tree clean; `main` in sync with `origin/main`; the three local branches (`docs/pitfalls-and-backlog-note`, `docs/sync-handoff-readme-developer`, `hinchk-devops/pre-push-hook`) are already merged and could be pruned.
- **Emerging god-file debt:** `frontend/src/screens/Team.tsx` (1,267 lines) and `backend/app/api/weeks.py` (928 lines after `c12ea83`). Both tested, but growing monolithically slice over slice.
- **Docs lag by one PR:** `HANDOFF.md`/`CLAUDE.md` predate PR #11 (detail in §2). Small now, but the repo's own precedence chain (`AGENTS.md` §0) makes stale rule-adjacent docs more consequential than in a typical repo.
- **W7 `employee_constraint` deferral** is a mandate-relevant gap (see sprint #3) — the "escape hatch" for unusual cases exists in neither schema nor UI yet.
- **Environment/process single points of failure:** the PRD lives on one Windows OneDrive path; port 8000 on Tom's machine is the old mockup (documented pitfall); GitHub Issues deliberately unused, so backlog visibility depends entirely on the docs corpus staying current. No issue tracker also means no external signal on backlog aging.
- **Two-contributor bus factor** (TomWCAH, HinchK, plus one Cursor Agent commit); commit policy prohibits pushes without an explicit ask, so long-lived unmerged branches would be invisible to CI — currently not an issue.
