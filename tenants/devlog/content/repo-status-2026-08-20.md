# oms-new Repo Report — 2026-08-20

**Scope:** `main`, 2026-08-13 → 2026-08-20 (last 7 days — the command's date/commit placeholders were unfilled, so this default is assumed). 74 commits in window (57 non-merge), **16 PRs merged** (PR #7 is an issue, not a PR), 198 files changed, +40,177/−4,793. Repo history actually begins 2026-08-11 (`e195100`; full history: 121 commits, +68,772/−5,170). CI on the latest main run (32357465260): backend 338 passed, frontend 92 passed, domain-code-scan green, 1m27s. Zero open PRs, zero open issues (the project deliberately has no issue tracker — backlog lives in `docs/open-items/` and `HANDOFF.md`).

> ### 🔴 Critical callout
> **The production VPS (app.wcahops.com, 93.188.162.248) serves on port 443 world-open with no application authentication** (`docs/deployment.md:28` — the hPanel IP allowlist is still pending and the runbook marks it "treat as urgent"; §4 at `:107–151` documents that the allowlist *is* the access control). Real hospital employee data (44-employee roster) is live. Separately, redeploy is blocked on a missing GitHub deploy key for the `oms` user, so the VPS is one PR behind main (at `8025da4` vs `f8c360b`).

## Executive Summary

The window opens with the backend foundation landing in a single day (Aug 13: FastAPI app with RFC 9457 problem details, the read-route set, and the domain-code scan), then runs through three product slices — configuration/roster writes (`4c37e7a`), Pacific Beach coverage (`c9af1c1`), and Week Setup #4a (`c12ea83`, PR #11, the largest change at +4,818/−968) — and closes with delivery infrastructure: Compose consolidation, a Caddy-served frontend image, deploy/backup scripts, and an executed Hostinger VPS deployment (PR #16), followed by deployment-actuals docs, a smoke-test script, and frontend fast-refresh fixes (PR #17). Documentation churn ran ~40% of commits, with the generated `docs/wiki` export now guarded by tests. Main is fully green; the next declared slice is #4b Week Board. The one urgent item is operational, not code: applying the firewall allowlist.

## 1. Latest Changes (2026-08-13 → 2026-08-20, `main`)

### Backend foundation (Aug 13)
- `088882e` FastAPI application with RFC 9457 problem details (registered on Starlette exceptions in `6eec37e`); read routes for reference bootstrap (`658415c`), departments/default-needs (`0e584da`), employees (`06bd444`), and hospital constraints (`75d64a9`), with invariant-hardening fixes (`bd134e1`, `5439967`, `b359422`).
- `4bd9c4e` static domain-code scan with no exception list — the CI enforcement of the "no hospital-specific rules in code" mandate.
- `51e87e4` React scaffold + generated API client + reference provider (+4,996); `01812d6` Configuration screen; `5ed2afa` Team screen; `6ebfa24` three-job CI pipeline with definition-of-done checks.

### Features (Aug 16–20)
- **Configuration & roster writes** (`4c37e7a`, PR #1, +7,227): catalog CRUD, default-needs, organization PATCH, employee profile/titles/eligibilities/rotations write APIs; edit UI on Configuration and Team screens; paid-hours resolution chain (W6).
- **Pacific Beach coverage** (`c9af1c1`): 20 PB `default_need` rows (85 total with LV), 44-employee roster pass, baked into `seed/wcah_seed.sql` with structural tests (`backend/tests/test_pacific_beach_coverage.py`).
- **Week Setup #4a** (`ead6472` + `c12ea83`, PR #11): migration `0005_week_setup` adds `schedule_week`, `day_plan`, `day_plan_department`, `need_override` (22 tables total); `/api/weeks` read/write API incl. create/copy and day-plan patches; Week Setup frontend shell with location toggle and overlay need edits. **Next declared slice: #4b Week Board** (HANDOFF.md:115).
- **Dev machine bootstrap wizard** (`545bfff`) and macOS service stop script (`61f7d82`).
- **Compose consolidation + VPS deployment** (PR #16, merged 8-20, executed on the VPS 8-19): root `docker-compose.yml`/`.override`/`.prod`, frontend image served by Caddy (`0fb3d29`, `cfadaeb`), backend image builds from repo root (`2f1e900`), env-driven CORS via `OMS_CORS_ORIGINS` (`8fe3c5e`, with `backend/tests/test_settings_cors.py`), `scripts/deploy.sh` + `scripts/pg-backup.sh` with nightly cron.
- **Deployment smoke test** (`8a28b59`, PR #17): `scripts/smoke-test.sh`.

### Bug fixes
- `87b167a`, `5381a22`, `2ec70e6` — three rounds of ruff/bootstrap CI repairs (red merges #5/#12 each repaired within a day).
- `5a90f61` (PR #13) — excluded generated `docs/wiki` from the docs corpus guard after PR #12's merge broke `tests/test_docs_corpus.py`.
- `715beb5` (PR #15) — **API contract fix:** PATCH request bodies were missing from OpenAPI and the generated TypeScript client. Consumers must regenerate the client (`npm run generate:api`); the in-repo client was regenerated in the same PR.

### Refactors
- `e88b87f`, `aace773` (PR #17) — isolated non-component exports from `ReferenceProvider`/`NeedGrid` for clean React fast-refresh; memoized rotation-editor `dayIds` to satisfy `react-hooks/exhaustive-deps`. No behavior change.

### Breaking changes
- PR #15's OpenAPI/client fix (above) is the only contract-level change. PR #16 moved compose files from `infra/` to repo root — any script or muscle-memory command assuming `docker compose -f infra/docker-compose.yml` will break (docs were reconciled in `6a9fba0`).

## 2. Documentation Changes

Churn was heavy and mostly current:

| File | Edits in window | Notes |
|---|---|---|
| `docs/README.md` | 9 | Corpus index; marks current/superseded/mockup-only docs |
| `docs/developer.md` | 8 | Updated through PR #17 incl. smoke-test docs (`cefd635`) |
| `HANDOFF.md` | 7 | Now reflects executed deployment (runbook §11 SSH ship path) |
| `docs/deployment.md` | 3 | New runbook (`0fe2024`, +426), moved to "executed" state (`3e76bff`) |
| `docs/wiki/**` | ~40 files | **Generated export — never hand-edit**; refresh via app + `scripts/export_repo_wiki.py`, provenance stamp guarded by corpus test (PR #14) |

Consistency checks: HANDOFF's "next slice #4b" and deployment state match the code; `CLAUDE.md`/`AGENTS.md` remain the operational rule sources. Gaps: none blocking, but the PRD (v0.7.6) lives outside the repo on Tom's OneDrive — background intent only, Track D rulings win on conflict (D1). The smoke-test script added in PR #17 is documented in the developer guide but has not yet been demonstrated against production (it postdates the last deploy).

## 3. Next Sprint Suggestions

1. **[High · low effort] Apply the §4 firewall allowlist.** The runbook itself marks this "treat as urgent" (`docs/deployment.md:28`), and the procedure is already written (`:107–151`): create the hPanel group, attach **and sync**, verify from an allowlisted machine and a non-allowlisted network. The only real input needed is a human decision on which IPs get access.
2. **[High · trivial] Add the GitHub deploy key for the VPS `oms` user.** Unblocks scripted redeploy (`scripts/deploy.sh`), retires the manual SSH pull/rebuild/restart path (runbook §11), lets `scripts/smoke-test.sh` gate deploys, and clears the VPS drift (`8025da4` → current).
3. **[High · large] Ship slice #4b Week Board** — cells, away-from-home, FINAL/PUBLISH, PTO. Explicitly the declared next slice (HANDOFF.md:115); highest product value; builds directly on #4a's tables and `/api/weeks`. Multi-session — take it through spec → tickets as #4a did.
4. **[Medium · small] Exercise `scripts/smoke-test.sh` against production and wire it into `deploy.sh`.** It was added after the last deploy and is currently unproven end-to-end.
5. **[Low · trivial] Branch housekeeping** — delete the seven merged local branches (`docs/create-wiki`, `fix/patch-openapi-type-gap`, `docs/vps-deployment-actuals`, etc.), resolve the dangling empty `docs/automations` branch (needs HinchK's intent — it's already contained in main at `c7c9b38`), and clean up the `claudio/devops-consolidation-vps-deploy-f553c0` worktree (still checked out at `0fe2024` under `.claude/worktrees/`).

## 4. Risks & Concerns

- **Production security posture:** world-open 443, no app auth, real employee data (critical callout above). App-level auth is deliberately out of scope (`AGENTS.md` W7), so the allowlist is the only control until applied.
- **No branch protection (deliberate, ruled out 2026-08-18 — do not re-propose).** The sole guard is manual `gh pr checks` before merge, and it has failed three times (#1, #5, #12 — #12 broke main until #13). The pattern recurs roughly every 2–3 days of active merging.
- **VPS drift:** live stack at `8025da4`, main at `f8c360b`. The delta is docs/refactors/scripts, so low functional risk, but it will compound once #4b lands — another reason for the deploy key.
- **Review-load trend:** multiple PRs over +2.8k lines this window (#1 +7.2k, #11 +4.8k, #5 +4.7k). Velocity is high; effective review depth on slices that large is the risk.
- **Bus factor / access:** VPS is manageable only over SSH as `oms` (Hostinger MCP token points at the wrong account); nightly `pg_dump` lands but restore has never been rehearsed.
- Postgres check-constraint ERRORs in `--log-failed` CI logs are noise from passing boundary tests, not failures — don't chase them.

---
*Generated 2026-08-20 by ZCode from git/gh data on `main` at `f8c360b`. Test counts cited from CI run 32357465260 (2026-08-20T10:08Z), not a fresh local run. Period defaults assumed where command placeholders were unfilled.*
***Revision 2** — supersedes an earlier same-day draft at this path. Corrections vs. that draft: window extended to include 2026-08-13 (the backend-foundation day), PR count corrected to 16 merged PRs (#7 is an issue), repo start date confirmed as 2026-08-11, frontend test inventory confirmed at 7 files (`frontend/tests/` + `src/weeks/draft.test.ts`), local branch count corrected to seven merged + one dangling.*
