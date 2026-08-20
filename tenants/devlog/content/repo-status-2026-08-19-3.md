# Repository Report: `oms-new` (TomWCAH/oms-new)

**Window:** since repo inception `e195100` (2026-08-11) → `main` @ `8025da4` (2026-08-19), 113 commits, PRs #1–#16 all merged. **Supersedes** this morning's report (`oms-new-repo-report-2026-08-19-morning.md`, cut at `44b1795` / PR #14) — this edition adds PRs #15–#16 and the live VPS deployment that happened after it.

> [!CAUTION]
> **Production went live on 2026-08-19 with no authentication and (as far as anything in-repo records) no firewall allowlist.** `https://app.wcahops.com` answered **HTTP 200** and served real organization data on `GET /api/reference` from an unauthenticated external request this session (VPS `93.188.162.248`). `backend/app/api/` has no auth module — writes are as open as reads — while the app already holds real employee/staffing data. Secondarily: the next `scripts/deploy.sh` run will fail until a **GitHub deploy key** is added to the VPS clone, and `pg-backup.sh` has no confirmed cron entry — the DR story is designed but unproven.

## Executive Summary

The board is empty (0 open PRs/issues) and CI is green on `main` HEAD (`8025da4`, run `32318107545`). After this morning's report, two more PRs landed: #15 closed the PATCH OpenAPI type gap (the standing risk in the morning edition), and #16 consolidated the stack into root Compose files, added the Caddy edge, `deploy.sh`/`pg-backup.sh`, and the VPS runbook. The app was then deployed live to the Hostinger VPS — after the runbook was written, so `docs/deployment.md` now says "VPS not provisioned" about a box that is serving traffic. Test suites: 237 backend test functions (29 modules), 70 frontend `it/test` blocks (7 files). The recurring red-merge problem (~41 h cumulative over #1/#5/#12) stayed quiet today. Top concerns: the unauthenticated public API, the un-runnable redeploy path, and the stale runbook.

---

## 1. Latest Changes

*(PRs #1–#14 are summarized only where the picture changed; detail lives in the morning report.)*

### PR #15 — PATCH OpenAPI fix (`8dd3965`, merged 2026-08-19 13:44 PDT, GREEN)
`715beb5`: PATCH request bodies now surface in `openapi.json` and the generated TypeScript client. This closes the hand-maintained-PATCH-types gap flagged at `docs/developer.md:140-144` in the morning report — the risk it described (silent wire drift as `queries.ts` outgrew `schemas_writes.py`) is resolved at the source rather than by a CI alignment check.

### PR #16 — Compose consolidation + VPS deployment (`8025da4`, merged 2026-08-19 17:39 PDT, GREEN)
Eight commits, the infra arc of the day:
- `d96fbe6` — deleted `infra/docker-compose.yml`; three root files now define the stack: `docker-compose.yml` (what services are; no published ports), `docker-compose.override.yml` (dev, auto-loaded: bind mounts, `--reload`, Vite, ports 5433/8000/5173), `docker-compose.prod.yml` (Caddy edge, restart policies, limits). Plain `docker compose up` is the whole dev flow now.
- `8fe3c5e` — CORS origins env-driven (`OMS_CORS_ORIGINS`); `2f1e900` — backend image builds from repo root so `tools/` resolves; `0fb3d29` + `cfadaeb` — frontend image + `infra/Caddyfile` single-origin edge.
- `5d5d761` — `scripts/deploy.sh` (SSH redeploy: git pull → rebuild → restart → wait for backend health, non-zero exit if never healthy) and `scripts/pg-backup.sh` (nightly single-DB dump with `.partial`-then-rename integrity and dated retention; explicitly amends the 2026-08-04 spec's "backups = Hostinger platform" line).
- `0fe2024` — `docs/deployment.md` runbook (provisioning → hardening → DNS → first deploy → backups → rollback → cutover), written against a box that did not yet exist.
- **Post-merge, outside the repo:** the VPS was provisioned and the app deployed live the same evening (no deploy commit exists; deployment was performed over SSH per the runbook). Compose touchpoints in docs were repointed at the root files (`6a9fba0`).

### Carried context from the morning window
- **Week management (PRs #5, #11)** remains the largest feature arc: `weeks.py` fill/replace endpoints, `WeekSetup.tsx` + draft state machine (`frontend/src/weeks/draft.ts`), `Departments.tsx` split from Configuration, migration `0005_week_setup`.
- **docs/wiki saga (PRs #12–#14):** generated wiki landed, broke the docs corpus guard (red merge #3, ~11.5 h), fixed by exclusion + export script + provenance stamp (`scripts/export_repo_wiki.py`, snapshot `00745dbd`).

**Breaking changes:** none on the wire. Operational breaks: (1) any `-f infra/docker-compose.yml` muscle memory now fails — the file is gone; (2) production secrets belong in `infra/prod.env` via `--env-file`, deliberately never a root `.env` (a prod password there breaks the dev stack in a way that presents as a Postgres auth failure far from the cause).

## 2. Documentation Changes

- **New:** `docs/deployment.md` — the VPS runbook; plan/design pair `2026-08-19-oms-new-compose-vps-deploy{,-design}.md`; wiki export tooling docs.
- **Updated:** every Compose touchpoint repointed at root files (`6a9fba0`); `docs/developer.md` and `docs/README.md` extended across the week-management and infra PRs.
- **Resolved inconsistency:** the morning report's top docs gap (PATCH types at `docs/developer.md:140-144`) is fixed by PR #15 — if that section still documents the workaround, it should now be retired.
- **New inconsistencies (from deploying after the runbook was written):**
  1. `docs/deployment.md:9-12` — "**Status: not yet executed** … the target VPS is not provisioned" is now false: the VPS exists, the app is live, and placeholder values (e.g., `scripts/deploy.sh:6` example `203.0.113.10`) have real counterparts (`93.188.162.248`, SSH user `oms`). The doc also records that the local Hostinger API token belongs to the wrong account (DNS `[DNS:4002]` error) — still true, so hPanel steps remain manual.
  2. `HANDOFF.md:107` correctly names the next slice (**#4b Week Board**: cells, away-from-home, FINAL/PUBLISH, PTO), but HANDOFF's inventory doesn't yet mention the infra sub-project, the live deployment, or the deploy-key/allowlist blockers — the record of what is actually running lives only outside the repo (`../devops-consolidation-vps-deploy-PROMPT.md`).
- **Standing:** no CHANGELOG/tags; PRD v0.7.6 lives outside the repo; `infra/prod.env` is intentionally untracked (local copy verified to contain only placeholders like `<strong_password>` — no leak; the ignore rule is doing its job).

## 3. Next Sprint Suggestions

1. **[High · medium effort] Authentication on the production API.** No auth module exists; a public, unauthenticated request already exfiltrates real org data, and write routes share the exposure. The mandate's governance competency (users, approvals, audit trail behind FINAL/PUBLISH) makes auth the prerequisite for slice #4b, which is next. If auth can't land quickly, land the pending hPanel IP allowlist as the interim control the runbook already anticipates.
2. **[High · low effort] Make redeploy actually work.** Add the GitHub deploy key (the VPS clone cannot `git pull` without it — first `deploy.sh` run will fail between fetch and `up -d`), execute one full deploy cycle end-to-end, and schedule `pg-backup.sh` in cron **plus rehearse one restore**. Until then every new merge on `main` is undeployable and the nightly-backup amendment to the spec is aspirational.
3. **[High · low effort] Bring `docs/deployment.md` to executed state.** Replace the "not provisioned" status block with actuals — IP, users, what differed during real provisioning, current allowlist/deploy-key state — and add the live deployment to HANDOFF's inventory. This is the only in-repo operator reference for a now-live system; today it describes a fictional box.
4. **[Medium · large effort] Start slice #4b — Week Board** (`HANDOFF.md:107`). Documented next slice; first workstream to exercise the mandate's core (publish gates, violation surfacing, PTO feasibility) and the D23 soft/hard weight threshold (0–50/51–100, already in the database). Note: `backend/app/api/weeks.py` is at 928 lines — the overrides/PTO additions should arrive with a router split, not more growth.
5. **[Low · small effort] Make the merge gate structural.** No red merge today, but the pattern (~41 h cumulative across #1/#5/#12) is one rushed click from recurring, and branch protection is off the table (issue #7, GitHub Free). Wire PR #10's opt-in pre-push hook into `scripts/bootstrap.sh` as a default install.

## 4. Risks & Concerns

- **Public unauthenticated production API (critical):** verified live data egress this session. System of record + employee data + open internet + writes unguarded.
- **Redeploy path is broken-by-missing-key:** `deploy.sh` assumes VPS git access that doesn't exist yet. Silent until the next attempt.
- **Backups unverified:** script exists, no evidence of a cron entry or restore test; Hostinger snapshots alone impose the 7-day RPO the script was built to eliminate.
- **Runbook/reality drift:** `docs/deployment.md:9-12` vs. the live server; operators following the doc would believe nothing is deployed.
- **Recurring red merges:** quiet today (both merges green, including #16's merge run), but the structural guard is still opt-in.
- **`weeks.py` at 928 lines** — fastest-growing module; split before #4b adds to it.
- **Wiki content drift invisible to CI by design:** corpus guard excludes `docs/wiki`; only the provenance stamp is checked. A stale wiki reads like a current one.
- **No issue tracker in use:** the auth, deploy-key, allowlist, and backup gaps tracked nowhere except prose docs and this report — nothing will age or remind.
- **Positives:** CI green on HEAD; 237 backend test functions / 70 frontend test blocks; clean tree synced to origin; PR #15 retired a standing wire-drift risk the same day it was reported; deployment tooling shipped with health-gated exit codes rather than fire-and-forget.

## Evidence and Limitations

- **Live checks this session:** `gh run list` (green at `8025da4`, run `32318107545`); `curl https://app.wcahops.com` → HTTP 200 in 0.11 s with real org JSON on `/api/reference`; `git status` clean.
- **Test counts:** backend by `def test_` grep (237 across 29 modules); frontend by `it(`/`test(` grep (70) — the morning report's "92" used a broader count; both are grep-based, not runner output.
- **Local pytest/vitest not run this session** — green-signal source is CI on the exact HEAD commit.
- **Deployment facts** (IP, SSH user, deploy-key and allowlist status) come from the deploy session's records outside the repo plus live verification of the endpoint, not from anything committed; that gap is itself finding #3.
