# Task 5 Report: Docker Compose + Dockerfile + entrypoint + .env.example

## Status: DONE

## Files created

- `backend/Dockerfile` — verbatim per brief (python:3.12-slim, pip install, copy, chmod +x entrypoint.sh, expose 8000, CMD ./entrypoint.sh).
- `backend/entrypoint.sh` — verbatim per brief (`alembic upgrade head` then `exec uvicorn app.main:app --host 0.0.0.0 --port 8000`). Made executable locally with `chmod +x` (mode 755); confirmed the git index recorded mode `100755` after staging (`git ls-files -s backend/entrypoint.sh`).
- `infra/docker-compose.yml` — verbatim per brief (`db` postgres:16 service with healthcheck, `backend` service building `../backend`, `depends_on: db: condition: service_healthy`).
- `.env.example` (repo root) — verbatim per brief (`DATABASE_URL` for backend, `VITE_API_BASE=/api` for frontend).

## Files changed

- `.gitignore` — added `.env` and `backend/.env` below the existing `backend/.venv/`, `__pycache__/`, `*.pyc` lines (fold-in requested in the task, to keep `backend/.env` credentials from ever being committed once `.env.example` establishes that convention).

## Pre-flight check (before running anything)

Read `backend/alembic/env.py` and `backend/app/settings.py` to confirm the migrate-on-start step would resolve the right host inside the container. Confirmed:
- `alembic/env.py` line 11: `config.set_main_option("sqlalchemy.url", settings.database_url)` — overrides the hardcoded `localhost` URL in `alembic.ini` at runtime.
- `app/settings.py`: `database_url` is a pydantic-settings field, so it reads the `DATABASE_URL` env var. Compose sets `DATABASE_URL: postgresql+psycopg://oms:oms@db:5432/oms` for the `backend` service, so alembic connects to the `db` service by its compose network hostname, not `localhost`. This is why the migration succeeded inside the container even though `alembic.ini`'s literal `sqlalchemy.url` points at `localhost`.

## Verification transcript

### Freed the conflicting port
```
$ docker rm -f oms-pg
oms-pg
$ docker ps -a --format '{{.Names}}\t{{.Status}}\t{{.Ports}}'
admiring_montalcini	Up 5 hours	8082/tcp
```

### Build + bring-up
```
$ docker compose -f infra/docker-compose.yml up -d --build
...
 Image infra-backend Built
 Network infra_default Created
 Container infra-db-1 Created
 Container infra-backend-1 Created
 Container infra-db-1 Started
 Container infra-db-1 Waiting
 Container infra-db-1 Healthy
 Container infra-backend-1 Starting
 Container infra-backend-1 Started
```
Build succeeded cleanly (base image pull, `pip install -r requirements.txt` — 32 packages, `COPY . .`, `chmod +x entrypoint.sh`). No errors.

### Health poll (bounded poll instead of a bare fixed sleep, to avoid a false BLOCKED on a slow first build)
```
$ for i in $(seq 1 30); do curl -fsS localhost:8000/healthz 2>/dev/null && break || sleep 2; done
{"status":"ok"}
READY after 1 attempt(s)
```

### Both required curls
```
$ curl -fsS localhost:8000/healthz
{"status":"ok"}

$ curl -fsS localhost:8000/api/document
{"doc":null,"revision":0,"schema_version":null}
```
Both match the brief's expected output exactly.

### Container logs (confirms request path + startup, no errors)
```
$ docker compose -f infra/docker-compose.yml logs backend
backend-1  | INFO:     Started server process [1]
backend-1  | INFO:     Waiting for application startup.
backend-1  | INFO:     Application startup complete.
backend-1  | INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
backend-1  | INFO:     192.168.97.1:58332 - "GET /healthz HTTP/1.1" 200 OK
backend-1  | INFO:     192.168.97.1:47420 - "GET /api/document HTTP/1.1" 200 OK
```

### Migration sanity check (extra verification beyond the brief's ask)
```
$ docker exec infra-db-1 psql -U oms -d oms -c "\dt"
            List of relations
 Schema |      Name       | Type  | Owner
--------+-----------------+-------+-------
 public | alembic_version | table | oms

$ docker exec infra-db-1 psql -U oms -d oms -c "select * from alembic_version;"
 version_num
-------------
 0001
```
Confirms `alembic upgrade head` actually ran inside the `backend` container against the `db` service and applied migration `0001` (not a false pass from a stale/pre-migrated volume — this was a fresh `postgres:16` container with no prior volume).

### Teardown
```
$ docker compose -f infra/docker-compose.yml down
 Container infra-backend-1 Stopping
 Container infra-backend-1 Stopped
 Container infra-backend-1 Removing
 Container infra-backend-1 Removed
 Container infra-db-1 Stopping
 Container infra-db-1 Stopped
 Container infra-db-1 Removing
 Container infra-db-1 Removed
 Network infra_default Removing
 Network infra_default Removed
```
No `-v` flag used (no named volumes were declared in the compose file to begin with — postgres data lived in the container's anonymous layer, which `down` without `-v` still leaves around only as an orphaned anonymous volume; there is no compose-managed named volume here per the brief's file, so nothing extra to clean).

Post-teardown docker state: only the pre-existing, unrelated `admiring_montalcini` container remains; `oms-pg` was not recreated (as instructed — freeing port 5432 was for this verification only).

## Commit

```
git add backend/Dockerfile backend/entrypoint.sh infra/ .env.example .gitignore
git commit -m "feat(infra): local Docker Compose (postgres + backend) with migrate-on-start

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```
Result: commit `e7f4341` on branch `sp2a-document-api`, 5 files changed (39 insertions), `backend/entrypoint.sh` recorded with mode `100755`.

Note: the brief's own Step 5 `git add` line (`git add backend/Dockerfile backend/entrypoint.sh infra/ .env.example`) omits `.gitignore`. I added `.gitignore` explicitly to the `git add` so the fold-in requested in the task instructions actually lands in the commit — staged and committed together with the four brief files, since committing them separately would leave the working tree dirty for no reason and the task explicitly asked for one commit including this fix.

## Self-review

- All four brief files created with byte-for-byte verbatim content from the brief (Dockerfile, entrypoint.sh, docker-compose.yml, .env.example).
- `entrypoint.sh` executable bit set locally (`chmod +x`) and confirmed to survive into the git index as `100755` — this matters because the Dockerfile's own `RUN chmod +x entrypoint.sh` would mask a non-executable file in the image, but a non-executable file in git is still worth avoiding for anyone who runs the script directly outside Docker.
- Verified the migration actually executed against the correct host by inspecting `alembic/env.py` before running anything (it overrides `alembic.ini`'s hardcoded `localhost` URL with `settings.database_url`, which is populated from the `DATABASE_URL` env var compose injects as `db:5432`) — and then confirmed post-hoc via `psql` that `alembic_version` shows `0001` inside a fresh Postgres container.
- Used a bounded poll loop (max 30 x 2s = 60s) instead of a bare `sleep 8` for the health check, so a slow first build/migration would not produce a false BLOCKED — in practice the app was ready on the first attempt.
- Confirmed no scope creep: `git status` before staging showed exactly the 5 intended changes (4 new files + `.gitignore`) plus one pre-existing unrelated untracked directory (`docs/superpowers/specs/.clearance-rendered-preview-*`) that was left alone.
- Did not touch `src/`, `conformance/`, or the frontend.
- No secrets committed: `.env.example` contains only placeholder/dev credentials (`oms:oms`) matching what's already hardcoded in `alembic.ini` and `settings.py` defaults — not new secret material. `.gitignore` now blocks `.env` and `backend/.env` from ever being committed.
- Did not add a `.dockerignore` (out of the brief's file list; brief says keep contents verbatim) — see concerns below.

## Concerns (not blocking, flagged for follow-up)

1. **No `.dockerignore` in `backend/`.** `COPY . .` in the Dockerfile pulls in `backend/.venv/`, `backend/.pytest_cache/`, and `__pycache__/` directories into the build context/image. This is not a correctness problem today (the image installs its own dependencies via `pip install -r requirements.txt`; nothing execs from `.venv/bin`), but it bloats the image and slows the build. More importantly: once `backend/.env` exists as a real file (which this task's `.gitignore` fold-in anticipates), `COPY . .` would bake real credentials into the image layer unless a `.dockerignore` excludes it. This is a genuine follow-up for whoever owns the next infra task — I did not add a `.dockerignore` myself because it isn't in the brief's enumerated file list and the brief calls for verbatim contents on the files it does list.
2. **`docker-compose.yml` binds host port 5432 unconditionally.** As flagged in the task setup, this collides with any other local Postgres on 5432 (like the `oms-pg` container from earlier tasks, which I removed only for this verification run and did not recreate). This is per the brief's verbatim spec, not a defect — just a known friction point for local dev noted here for visibility.
3. The brief's own Step 5 git-add command was incomplete for this task's added `.gitignore` fold-in; I corrected it by adding `.gitignore` to the same commit (see Commit section above).

## Report file

`/Users/hinchk/WestCoast.Vet/oms/.superpowers/sdd/2026-08-09-sp2a-document-api/task-5-report.md`

---

## Fix report (post-review): add `backend/.dockerignore`

Review flagged Concern #1 above (self-flagged, then confirmed by reviewer with concrete numbers) as **Important**: `backend/.venv` is ~73MB and was being copied into every image build via `COPY . .`; more critically, the `.gitignore` fold-in from the base task protects `git` but not the Docker build context — once `backend/.env` exists (the convention `.env.example` establishes), `COPY . .` would copy it to `/app/.env`, where `Settings()` (`env_file=".env"`) actively reads it at container start. That is a real secret-exposure vector, not just image bloat.

### What was added

`backend/.dockerignore`:
```
.venv/
__pycache__/
.pytest_cache/
*.pyc
.env
```

### Verification

Confirmed the gap was real before fixing: `backend/.venv` measured 73M (`du -sh backend/.venv`), and no `backend/.env` existed yet, so I created a throwaway `backend/.env` with dummy content to make the exclusion test meaningful (a test against a nonexistent file would trivially pass for the wrong reason):
```
$ echo "DATABASE_URL=postgresql+psycopg://test:test@should-not-be-in-image:5432/oms" > backend/.env
```

Built the image directly from `backend/` (no compose, no port 5432, no DB needed — per the reviewer's suggested build-context-only check):
```
$ docker build -t oms-backend-dockerignore-test backend/
...
#6 [internal] load build context
#6 transferring context: 2.25kB 0.0s done
...
#12 naming to docker.io/library/oms-backend-dockerignore-test:latest done
```
Build context dropped from 69.25MB (the original Task-5 build, before `.dockerignore` existed) to 2.25kB — confirms `.venv` (and everything else ignored) never reached the Docker daemon.

Ran the exclusion check inside the built image:
```
$ docker run --rm oms-backend-dockerignore-test sh -c 'test ! -e /app/.venv && test ! -e /app/.env && echo EXCLUDED_OK; ls -a /app'
EXCLUDED_OK
---listing /app---
.
..
.dockerignore
Dockerfile
alembic
alembic.ini
app
entrypoint.sh
requirements.txt
tests
```
`EXCLUDED_OK` printed; the `/app` listing contains no `.venv`, `.env`, `__pycache__`, or `.pytest_cache`. Both the venv-bloat and the secret-exposure vector are closed.

### Cleanup

```
$ rm backend/.env
$ docker rmi oms-backend-dockerignore-test
Untagged: oms-backend-dockerignore-test:latest
Deleted: sha256:c4d64e461af9fcb9b370082568cbbf245bdc2c4bebe2d70a6618fe2cf514d3d0
```
Confirmed `backend/.env` removed and absent from `git status` afterward (it was never tracked — the earlier `.gitignore` fold-in kept it out of git, as expected; the gap being fixed here was Docker's build context, not git). Did not touch port 5432 or run compose for this fix, per the reviewer's suggested scope.

### Commit

```
git add backend/.dockerignore
git commit -m "fix(infra): add backend/.dockerignore to keep venv and .env out of image

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```
Result: commit `b707185` on branch `sp2a-document-api`, 1 file changed (5 insertions).

### Self-review of the fix

- Verified the problem concretely (measured `.venv` size, confirmed `.env` wasn't yet excluded from the build context) rather than taking the reviewer's numbers on faith.
- Used a throwaway `.env` with dummy, non-real credentials to make the exclusion test genuine (avoids a false-positive "pass" against a file that doesn't exist).
- Rebuilt from `backend/` directly to avoid unnecessary compose/port-5432 churn, as the reviewer suggested — no DB was needed for this check.
- Cleaned up both the throwaway `.env` file and the throwaway test image after verifying; `git status` confirms only `backend/.dockerignore` was added, nothing else touched.
- Concern #1 from the original report is now resolved and can be considered closed.
