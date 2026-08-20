# Repository Report: `oms-new` (TomWCAH/oms-new)

**Window:** `44b1795` → `8025da4` (since the 13:15 report): 2026-08-19 13:10 → 17:39 PDT, 11 commits, PRs #15–#16. Repo total: 113 commits. No open issues, no open PRs, working tree clean and synced to `origin/main`.

> [!CAUTION]
> **`main` is green** (CI run 32318107545; `gh pr checks 16` all pass), and this is the **fourth consecutive green merge** (#13–#16) — the red-merge streak is broken. But two things will bite the next developer:
> 1. **Local `pytest` fails 2/337 tests** while CI passes the same commit (`8025da4`). Cause: a stale registered git worktree at `.claude/worktrees/devops-consolidation-vps-deploy-f553c0` (checked out at `0fe2024`, the already-merged PR #16 branch). The docs-corpus guard walks it and flags the duplicate `tools/convert_workbook.py` / seed files (`backend/tests/test_docs_corpus.py:244, :280`). Local-only; GitHub can't see it.
> 2. **The entire VPS deployment path is unproven.** PR #16 ships the compose stack, `deploy.sh`, `pg-backup.sh`, and a 424-line runbook, but there is no evidence of a first real deployment or a backup-restore drill.

## Executive Summary

PR #15 (`715beb5`) closed the long-standing PATCH OpenAPI type gap: the 409-on-`code` rule moved onto a `Patch` base in `schemas_writes.py`, every PATCH route now declares a typed body, the frontend consumes generated types, and a `test_definition_of_done` guard enforces it. PR #16 (`8025da4`, +2,958/−57, 29 files — the largest infra change in repo history) consolidated the stack into root compose files (base/dev-override/prod), added the Caddy TLS edge, a frontend image, env-driven CORS (`OMS_CORS_ORIGINS`), SSH deploy and nightly pg_dump scripts, and the Hostinger VPS runbook. Ruff clean; backend 335/337 local (2 failures are a stale-worktree artifact, not code); frontend 92/92. Next: execute the first real deploy with a restore drill, continue the week lifecycle, and fix the worktree/guard blind spot.

---

## 1. Latest Changes

### PR #15 — PATCH bodies typed end to end (`715beb5`, merged 2026-08-19 13:44 PDT, GREEN)
This was sprint suggestion #4 from the 13:15 report, delivered same day. 10 files, +284/−111:
- **Mechanism:** the W3 409-on-`code` rule now lives on a `Patch` base class in `backend/app/api/schemas_writes.py`; every PATCH route declares its model directly as a body parameter, so all write bodies — PATCH included — surface in `openapi.json`. The `patch_body()` indirection in `backend/app/api/deps.py` is gone (−16).
- **Write routes updated:** `catalog_writes.py`, `constraints.py`, `departments.py`, `employee_writes.py` now declare typed bodies.
- **Frontend:** `frontend/src/api/schema.d.ts` regenerated (+199); `frontend/src/api/queries.ts` drops hand-maintained PATCH types (49 lines changed, net −).
- **Guard:** `backend/tests/test_definition_of_done.py` (+28) fails the build if a PATCH route stops declaring its typed request body — the alignment is now machine-checked instead of convention.
- **Docs:** `docs/developer.md:150-156` rewritten from the "PATCH schema gap" warning to "PATCH bodies are typed end to end."

### PR #16 — Compose consolidation + Hostinger VPS deployment (`8025da4`, merged 2026-08-19 17:39 PDT, GREEN)
29 files, **+2,958/−57** — largest infra PR in repo history. CI green on both the PR run (32317458062) and `main` (32318107545). Commits `6720c96`…`0fe2024`:
- **Root compose stack:** new `docker-compose.yml` (base, 73 lines), `docker-compose.override.yml` (dev: two CORS origins for Vite HMR, +45), `docker-compose.prod.yml` (+78: per-service CPU/memory limits, `restart: unless-stopped`, Caddy TLS edge on 80/443, **no published Postgres port** — debugging via SSH port-forward only, and required secrets enforced with `${VAR:?}` errors). Old `infra/docker-compose.yml` (−33) deleted; `scripts/bootstrap.sh` and `stop-oms-macos.sh` repointed at the root files.
- **Images & edge:** `infra/frontend.Dockerfile` (36) + `infra/frontend-static.Caddyfile` (20) — the frontend is now a served container, not just Vite; `infra/Caddyfile` (37) does single-origin routing; `infra/backend.Dockerfile` reworked to build from the repo root so `tools/` resolves (fix `2f1e900`); `infra/backend-entrypoint.sh` (38).
- **CORS is env-driven:** `OMS_CORS_ORIGINS` in `backend/app/settings.py:8-17` — deliberately comma-separated, not JSON, with an inline comment documenting the pydantic-settings JSON-parsing startup crash it avoids. `backend/app/main.py` uses `settings.cors_origin_list`. New `backend/tests/test_settings_cors.py` (+27).
- **Operational scripts:** `scripts/deploy.sh` (50) — SSH redeploy (`OMS_DEPLOY_HOST`), `git pull --ff-only`, `compose up -d --build`, then a 150s backend health-wait loop before exiting non-zero. `scripts/pg-backup.sh` (49) — nightly gzipped `pg_dump --clean --if-exists`, credentials sourced from the same `infra/prod.env` the stack runs on, atomic `.partial`→final rename so a truncated dump is never mistaken for a good one, `chmod 600`, 14-day retention. The header comments justify the design against Hostinger's weekly all-or-nothing snapshots.
- **Docs:** `docs/deployment.md` (424 lines — the Hostinger VPS runbook incl. first-time provisioning), plan (`docs/plans/2026-08-19-oms-new-compose-vps-deploy.md`, 1,350 lines) + design (530), README (+28), `docs/developer.md` compose touchpoints.
- **Secrets hygiene:** `infra/prod.env` is gitignored (`.gitignore:20`); the prod compose file documents why secrets must not live in a root `.env` (Compose auto-loads it in dev, and Postgres bakes the password into the volume at initdb while still reporting healthy — a genuinely nasty pitfall now written down).

**Breaking changes:** none on the API wire. Operational change: anyone with muscle memory of `docker compose -f infra/docker-compose.yml …` must switch to plain `docker compose` at the repo root. Verified this session: the new stack runs locally (`oms-new-backend-1` healthy, `oms-new-frontend-1` up, postgres up 3h).

## 2. Documentation Changes

- **New — `docs/deployment.md` (424 lines, PR #16):** the first real deployment runbook in the repo; covers first-time VPS provisioning, the `--env-file` rationale, backup/restore pairing, and debugging via SSH port-forward. Consistent with `deploy.sh` and `pg-backup.sh` as written.
- **New:** the 1,350-line plan + 530-line design docs for the consolidation (dated 2026-08-19), indexed in `docs/README.md`.
- **Updated:** `docs/developer.md` twice — the PATCH-gap section replaced with the typed-end-to-end contract (PR #15), and all compose touchpoints repointed at the root files (PR #16). README's quickstart matches the new `docker compose` invocation.
- **Gap closed:** the "hand-maintained PATCH types" standing risk from every report since the gap was documented is now resolved and CI-guarded.
- **Standing gaps (unchanged):** `docs/wiki` staleness is still manual (only the provenance stamp is guarded); no CHANGELOG or tags; PRD still lives outside the repo.

## 3. Next Sprint Suggestions

1. **[High] Execute the first real VPS deployment — and drill the restore.** Impact: highest (everything shipped in PR #16 is unproven against a real server); effort: medium. Run `docs/deployment.md` end to end: provision, `infra/prod.env`, DNS/ACME, `deploy.sh`, smoke-test both origins. Then install the `pg-backup.sh` cron and **actually restore one dump** into a scratch database — an untested backup is a hope, not a capability, and `pg-backup.sh`'s own header stakes the data-recovery story on it.
2. **[High] Continue sub-project 4 — the week lifecycle.** Impact: core mandate (AGENTS.md §2 audit-trail competency); effort: large. Still missing per foundation spec §13: `need_override`, `cell_override`, `violation_authorization`, PTO ingestion, and the DRAFT → FINAL → PUBLISHED states. Two specs' worth of schema momentum exists; this is also the direct prerequisite for the generation engine.
3. **[Medium] Fix the worktree/guard blind spot.** Impact: stops the confusing local-red/CI-green split for every maintainer; effort: small. Remove the stale worktree (`git worktree remove .claude/worktrees/devops-consolidation-vps-deploy-f553c0`) and teach `test_docs_corpus.py`'s `source_files()` to skip `.claude/` — same class of exclusion PR #13 added for `docs/wiki`.
4. **[Medium] Split `backend/app/api/weeks.py` (928 lines).** Impact: keeps the fastest-growing module reviewable; effort: medium. Do it before, not after, the next +300-line override/PTO addition lands in suggestion 2.
5. **[Low] Automate wiki staleness detection.** Impact: keeps the 37-page `docs/wiki` trustworthy; effort: small. Carried from the 13:15 report: warn when the provenance stamp's commit drifts too far behind `HEAD`.

## 4. Risks & Concerns

- **Stale worktree breaks local test runs (top near-term annoyance):** `.claude/worktrees/devops-consolidation-vps-deploy-f553c0` sits at `0fe2024` on the merged branch; `backend/tests/test_docs_corpus.py:244, :280` fail against it locally (2/337) while CI passes. Any contributor who runs `pytest` before reading this report will think `main` is broken.
- **Deployment path untested (top operational risk):** runbook and scripts exist, but no first deploy, no cron installation, and no restore drill is evidenced anywhere in the repo. `deploy.sh` also has no rollback step beyond checking out the previous revision and rebuilding — fine for two maintainers, but the runbook should say so explicitly.
- **Process, improving:** four consecutive green merges (#13–#16). The pre-push hook (PR #10) remains opt-in and `bootstrap.sh` was not changed to install it; with branch protection permanently off the table, the discipline is the only guard.
- **`weeks.py` at 928 lines** — unchanged since the 13:15 report, still the repo's largest module, still growing with the next lifecycle feature.
- **No observed quality regressions:** ruff clean (`backend tools`), frontend 92/92, backend 335/337 (failures explained above), domain-code scan green, working tree clean.

---

*Verified this session (2026-08-19, commit `8025da4`): `gh run list` (main run 32318107545 success), `gh pr checks 16` (3/3 pass), `gh issue list` / `gh pr list` (both empty), `git worktree list`, `ruff check backend tools` (clean), backend `pytest` (335 pass / 2 fail — stale worktree), frontend `vitest --run` (92/92), `docker ps` (root-compose stack healthy). Assumptions: the 13:15 report (`oms-new-repo-report-2026-08-19.md`) is the predecessor, so this report covers only PRs #15–#16; no first VPS deployment has occurred (inferred — nothing in the repo or run history records one).*
