# oms-new — Handoff

*Status as of 2026-08-13. This file is orientation only. It is never a rule
source — see `AGENTS.md` §0. On conflict: `AGENTS.md` > `CLAUDE.md` >
`docs/decisions/` > this file.*

## Where things stand

The foundation slice is **complete** on `main` at `6ebfa24`. Local and
`origin/main` match. Spec §11 is met: 18 tables, committed deterministic
fixture, documented conversion, read-only API, Configuration and Team
screens, domain-code scan with no exception list, three-job CI.

| Document | What it is |
|---|---|
| `AGENTS.md` | Mandate and core competencies. Binding at all times. |
| `CLAUDE.md` | Operational hard rules for this stack. Binding for code edits. |
| `docs/superpowers/specs/2026-08-11-oms-new-foundation-slice-design.md` | **The spec.** 23 decisions (D23 is the weight model: 0–50 soft, 51–100 hard, blank stores 40), 18 tables, scope, API, frontend, enforcement, definition of done. |
| `docs/superpowers/plans/2026-08-11-oms-new-foundation-slice.md` | Implementation plan for that spec. Executed through Task 20. |
| `docs/open-items/2026-08-11-coverage-needs-model.md` | Coverage-needs rulings Q1–Q7. All closed. |
| `docs/open-items/2026-08-13-practice-default-shift-length.md` | Open: practice-level default shift length has nowhere to live. Decide in the next sub-project. |
| `docs/README.md` | Corpus index: current / superseded / mockup-only. |
| `README.md` | How to run and check the app. |

How to run: `README.md`. How to work in this repo: `CLAUDE.md`.

## What this project is

A ground-up, database-driven rebuild of the OMS shift-scheduling module for West
Coast Animal Hospital, on Python FastAPI, PostgreSQL, and React. It replaces a
mockup whose domain data lived in source files.

**The governing rule: no domain data resides outside the database.** Departments,
roles, people, constraints, and every value they carry live in PostgreSQL and
reach the browser over HTTP. A static scan fails the build on any hardcoded
canonical code, with no exception list. The domain-code set is declared by the
converter (manifest `seed/domain_codes.json`), not harvested from SQL text —
see `AGENTS.md` §0 Fixture and schema design.

This first sub-project was a thin vertical slice — schema, seed conversion,
read-only API, and two React screens (Configuration and Team). Writes, the week
lifecycle, the board, and the scheduling engine are later sub-projects, listed
in spec §13.

## What a new session should not redo

Already built and reviewed:

- 18 tables (`core` + `scheduling`), Alembic revisions, 595-row fixture
- Converter + `seed/domain_codes.json` (35 codes) + `tools/scan_domain_codes.py`
- FastAPI: `/healthz`, `/api/reference`, departments, default-needs, employees,
  hospital-constraints. RFC 9457 on Starlette's `HTTPException`. Organization
  is resolved server-side and never appears in a URL (D3).
- Frontend: generated client (`frontend/src/api/schema.d.ts`), reference
  provider, Configuration (needs grid from week start; weight per need), Team
- CI: `.github/workflows/ci.yml` (backend, frontend, standalone scan)

SDD ledger for this slice (scratch, gitignored):
`.superpowers/sdd/2026-08-11-oms-new-foundation-slice/progress.md`.

## Before the next sub-project

These are not defects in the read-only slice. They become load-bearing when
writes or a second location land:

1. Partial unique index on `employee_title` for open-ended rows
   (`effective_to IS NULL`) — two current titles would duplicate the list
   and 500 the detail route.
2. Configuration quantity map keys on `role_id:day` only. Safe while every
   need is Linda Vista. Must include location before Pacific Beach rows or
   need editing.
3. Practice-level default shift length — see the 2026-08-13 open item.

## Context a new session needs

**`../oms` is the reference mockup.** React 18 + Vite + Tailwind v4, its own git
repository, retained for reference and **not modified by this work**. No code is
carried across. Useful to read for what the product does; do not treat its
schema, its JSONB document envelope, or its hardcoded seed as a model (D9).

**Port 8000 on this machine is often the mockup** ("OMS Document API"), not
oms-new. Generate OpenAPI from `app.main:app` in-process, or run this API on
8001 and set `VITE_API_BASE=http://localhost:8001`. Do not kill the mockup.
The committed `generate:api` script and Vite proxy still assume 8000, which is
correct on a clean machine.

**The seed workbook** is archived at `seed/source/WCAH_OMS_Seed_Workbook-V5.xlsx`
(provenance only). It is converted once into a committed SQL fixture and then
never read again by the application or CI (D4). Only `tools/convert_workbook.py`
reads it.

**Docs corpus** is present under `docs/` with a README index marking current,
superseded, and mockup-only documents (D6). Authoritative model sources:
`docs/superpowers/specs/2026-08-07-oms-modular-database-schema-design.md`
(as amended by foundation-slice §5.3) and `docs/oms-domain-model.md`.

**Track D rulings** in `docs/decisions/2026-08-05-track-d-rulings.md` produced
invariants I1–I15. Read them through the oms-new applicability note at the top
of that file — mockup surface language (document model, `loc-pb`, fixed Sunday)
is superseded by foundation-slice D9 / D10 / D18.

**PRD v0.7.6** lives outside the repository at
`C:\Users\TomGibbings\OneDrive - West Coast Animal Hospital\Management-General\Operations\Shift Scheduling\PRD v0.7.6\content7.js`.
It is background intent and requirements language, **not** a schema
specification — where it conflicts with the Track D model, Track D wins (D1).

## Machine notes

Verified 2026-08-11: Node 24.18, npm 11.16, Docker 29.7 with Compose v5.3.1 and
the daemon running, git 2.55, Python 3.12.10 at
`%LOCALAPPDATA%\Programs\Python\Python312`. Invoke project Python as
`backend\.venv\Scripts\python.exe`.

Two gotchas. A fresh shell is required before `python` resolves to 3.12 rather
than the Microsoft Store stub. And the shell is PowerShell: `&&` is not a
statement separator (use `;`), and heredocs do not work (use
`git commit -F <file>`). `gh` is not on PATH.

Frontend installs need `legacy-peer-deps` (TypeScript 6 vs openapi-typescript
peer `^5.x`). `frontend/.npmrc` already sets that for `npm ci`.

## Working preferences

Tom is a product manager who works directly in code. Planning and organizational
work uses a Claude model; development and coding tasks use a GPT-5.6 model.

Commit policy is defined in `CLAUDE.md` (not here): do not commit unless Tom
asks, except where a plan task explicitly authorizes a local commit. Never push,
force-push, amend, or rebase unless asked.
