# oms-new Repository Analysis

**Scope assumptions** (placeholders unfilled in the request, defaults applied): repository = `/Users/hinchk/WestCoast.Vet/oms-new` @ `d9a2ca2` (main); range = **2026-08-16 → 2026-08-18** (PRs #1–#10). The repo's entire history is only 8 days old (92 commits, 2026-08-11 → 2026-08-18), so this window covers all PR-based work; the first week (foundation slice) is treated as context.

> ### ⚠️ Priority callout
> No Critical code defects were found, but two items need attention:
> 1. **Already-on-main bug:** editing one field of a need override in Week Setup silently pins the other field to today's standing default (`frontend/src/screens/WeekSetup.tsx:207`, `:228`), freezing that slot against future Configuration changes — it defeats the slice's core live-overlay guarantee (S2).
> 2. **Process gap:** PR #5 was merged at 16:09 with its backend check **failing**, leaving main red for ~55 minutes until PR #6 (`5381a22`) cleared the ruff errors. With no enforceable gate on the GitHub Free plan, the new pre-push hook plus a `gh pr checks` pre-merge check are the only guards — both currently opt-in/manual.

## Executive Summary

oms-new gained two sub-projects in three days: **Configuration & roster writes** (PR #1) and **Pacific Beach coverage + Week Setup #4a** (PR #5), adding write APIs, a fourth migration (22 tables total), and a third React screen — 61 files, +7,845/−712 in the window. DevOps delivered a bootstrap wizard, macOS stop script, and an opt-in pre-push hook (PR #10) after PR #5's red merge. Docs were reconciled across HANDOFF, README, and the developer runbook (PRs #8–#9); CI is green on main. A code-review subagent pass over the Week Setup commit (`c9af1c1..ead6472`) found no critical issues but five Important ones, led by the override-pinning bug above; the rest are error-handling hardening (500s where RFC 9457 4xx responses belong).

## 1. Latest Changes (2026-08-16 → 2026-08-18, main)

**Features**

- **Writes slice** — PR #1 (merge `032a10c`), commit `4c37e7a`: catalog/default-need/organization/employee/hospital-constraint write APIs with RFC 9457 problem details, migration `0004` (partial unique open title, W6 org default shift pattern), and edit UI on Configuration and Team.
- **Pacific Beach coverage** — `c9af1c1`: 20 PB `default_need` rows (85 total), roster pass over 44 employees with PB eligibility, plus a new `tools/dev/export_live_seed.py` (131 lines). Baked into `seed/wcah_seed.sql` (1,048-line diff).
- **Week Setup #4a** — `ead6472` (PR #5), the largest change: migration `0005` adding `schedule_week`, `day_plan`, `day_plan_department`, `need_override`; `/api/weeks` router (579 lines), `day_plans` router (204), pure `week_overlay`/`week_dates` modules; `WeekSetup.tsx` screen; ~500 lines of new backend tests plus `frontend/tests/weekSetup.test.tsx`.

**DevOps & fixes**

- `545bfff`/`61f7d82`/`87b167a` (PRs #2–#3): Unix bootstrap wizard, macOS service stop script, Docker auto-start and E402 fixes.
- `2ec70e6`/`5381a22`: ruff clearances keeping CI green — `5381a22` repaired the PR #5 red merge.
- `be8eca7` (PR #10): opt-in pre-push hook (`.githooks/pre-push`) running ruff + the domain-code scan — exactly the two checks that broke main on Aug 18.

**Breaking changes:** none — all API surface is additive. One tangential non-feature change: `backend/pyproject.toml` now packages `tools/` into the backend distribution (see Risks).

## 2. Documentation Changes

Twelve markdown files changed in the window, and the corpus is in good shape:

- **Reconciled:** `HANDOFF.md`, `README.md`, `CLAUDE.md`, `docs/developer.md`, `docs/README.md` (corpus index), `seed/CONVERSION.md` (PRs #8, #9, #10). HANDOFF declares itself current as of 2026-08-18 and its claims (22 tables, W7 deferred, S1–S13 met) match the code I verified.
- **New:** spec + plan pairs for Pacific Beach coverage and Week Setup (`docs/superpowers/specs|plans/2026-08-16…pacific-beach…`, `2026-08-17…week-setup…`), and the developer runbook (`4dd6d7c`, PR #4).
- **Enforced:** `backend/tests/test_docs_corpus.py` guards corpus consistency in CI, so docs drift fails the build rather than silently rotting.

**Gaps/inconsistencies:** (a) Week Setup spec §7's empty-clinic "standing needs for the selected location" view is not implemented — a plan-level omission (Task 6) that was never confirmed intentional; (b) `HANDOFF.md` §Machine notes still describes Tom's Windows box as the reference machine while current development is macOS-first; (c) the PRD reference path is a Windows OneDrive path unusable from this machine (background-only doc, low impact).

## 3. Next Sprint Suggestions

1. **[High] Fix the override-pinning bug and test the need grid.** In `WeekSetup.tsx:207`/`:228`, send `override?.weight ?? null` / `override?.quantity ?? null` (the existing-override value the component already computes for Revert) instead of the resolved standing value. Add the missing frontend test asserting the PUT body leaves the unedited field `null` — the current `existingWeek` fixture has empty `resolved_needs`, so the need grid ships untested. Impact: restores the S2 live-overlay guarantee in ordinary use; Effort: small.
2. **[High] Start #4b Week Board** (cells, away-from-home, FINAL/PUBLISH gates, PTO) — explicitly named as the next slice in `HANDOFF.md`. Impact: the largest remaining product value on the roadmap and the gateway to the scheduling engine; Effort: large (a full spec → plan → implement cycle).
3. **[Medium] Week API hardening trio** (from the code review): shared `department_ids` validation in `_materialize_manual` (`backend/app/api/weeks.py` ~180–230, today a duplicate/garbage UUID yields a 500 instead of 422); catch `IntegrityError` → 409 on the create/copy check-then-insert races (`weeks.py:446`, `:558`); wrap the bare `int(...)`/`uuid.UUID(...)` parses of admin-editable constraint parameters (`weeks.py:246-247`, verified — a schema-valid non-UUID `role_id` 500s `POST /api/weeks {mode:"defaults"}`). Impact: correct RFC 9457 behavior on data administrators can edit without code changes (mandate §2); Effort: small.
4. **[Medium] Make the no-red-merge guard routine.** Every machine runs `git config core.hooksPath .githooks` (documented in `docs/developer.md` since PR #10), and `gh pr checks` is verified green before every merge. Impact: prevents a repeat of the 55-minute red main; Effort: extra-small. (Branch protection remains ruled out on the GitHub Free plan — issue #7.)
5. **[Low] Spec hygiene decisions.** Record whether `PUT need-override` is replace- or merge-semantics (it replaces the full row today, which is what made bug #1 easy to write); confirm or fix the empty-clinic standing-needs omission; split the `pyproject.toml` tools-packaging change into its own justified commit. Impact: keeps the spec corpus trustworthy for the #4b cycle; Effort: small.

## 4. Risks & Concerns

- **Red-merge exposure (process):** PR #5 merged with `backend: FAILURE` (frontend and domain-code-scan passed) — with no enforceable merge gate, main's greenness depends entirely on operator discipline. The opt-in hook mitigates only the ruff/domain-scan classes, not full backend failures.
- **Week Setup review findings on main** (subagent review of `c9af1c1..ead6472`, verdict "with fixes" — merged before review, so these are fix-forward): the five Important items above (override pinning; unvalidated manual-create `department_ids`; create/copy race → 500; constraint-parameter parse → 500; untested need grid + spec §7 gap). Strengths confirmed: migration 0005 is reversible and constraint-faithful, S13's `ROOM_TECHS_PER_DVM` is fully data-driven (no domain codes in code — grep-verified), and tests exercise real SQL via savepoint rollback.
- **Build-config debt:** `backend/pyproject.toml` now bundles `tools/` into the backend distribution with an explicit package list that will silently omit future subpackages — unrelated to the feature it rode in on.
- **Tests/CI:** no failing tests — latest main run green (32173901772), frontend week-setup suite 4/4 locally; backend suites are Postgres-dependent and were validated via CI, not locally.
- **Bus factor:** two contributors, one primary maintainer; mitigated by an unusually strong handoff corpus (HANDOFF + specs + plans + CI-enforced docs).
