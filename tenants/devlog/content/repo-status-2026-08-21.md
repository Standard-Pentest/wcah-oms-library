# oms-new — Repository Sitrep

**Date:** 2026-08-21 · **HEAD:** `0c7b6a8` (`main`, clean, synced with origin) · **Window analyzed:** 2026-08-14 → 2026-08-21 (74 commits, 189 files, +37,219/−1,391) · **CI:** green — last 6 runs on `main` all `success` · **Open PRs/issues:** 0 / 0

**Assumptions** (command placeholders were unfilled): repository = local working tree at `/Users/hinchk/WestCoast.Vet/oms-new`; branch = `main`; range = last 7 days, focusing on the five PRs merged in-window (#15–#19). Production runtime facts (deployed commit, health checks) come from `docs/deployment.md` and the 2026-08-20 verification recorded there; the VPS was not re-probed live during this read-only analysis.

> **⚠️ CRITICAL — Production API has zero authentication and is internet-exposed.**
> `backend/app/api/deps.py` resolves only the database session and organization — no auth dependency exists anywhere in the API layer (re-verified at HEAD today). The full stack is live at `app.wcahops.com` (93.188.162.248) with port 443 open on all interfaces, including the interactive `/docs`. The only access control is an out-of-repo VPS firewall rule; the hPanel allowlist remains pending. PRs #18/#19 added no auth. Foundation spec §13 lists auth as unbuilt — internet exposure has changed its urgency.

## Executive summary

`main` is clean, synced, and green: 74 commits this week (189 files, +37.2k/−1.4k), all five merged PRs (#15–#19) passed `gh pr checks` before merge, and CI has passed on every run since 2026-08-19. The week shipped two major features — the interactive Week Board (PR #18: migration 0006, board read/override API, projection arithmetic, WeekBoard screen, ~8.2k lines) and the OpenAPI PATCH-generation fix (PR #15) — plus a documentation PR this morning (#19: five ADRs, a CONTEXT.md ubiquitous-language file, agent guides) that closed both architecture-review prep gaps. Documentation debt is the main drag: three verified spots contradict shipped reality, and the generated wiki predates Week Board. The critical open risk is unchanged from 2026-08-20: no authentication on an internet-facing production API.

## 1. Latest Changes (2026-08-14 → 2026-08-21)

Early window (08-14 → 08-19): PR #11 — largest change of the project (+4.8k lines), week management/lifecycle (W7); PR #12 — a red merge that broke `main` on 08-19 until green fix PR #13 landed; PR #14 — wiki provenance + export script.

The five most recent PRs, newest first:

| PR | Merged | Commit | Summary |
|---|---|---|---|
| #19 | 08-21 12:11 | `9c348d2` → `0c7b6a8` | Docs: 5 short ADRs restating architecture-binding spec decisions, `CONTEXT.md` (143-line ubiquitous-language file), `docs/agents/{domain,issue-tracker,triage-labels}.md`; `CLAUDE.md` +20; corpus test updated. No code changes. |
| #18 | 08-21 05:13 | `dfdc48b` | **Week Board (follow-on 4b), ~8.2k lines.** Migration `0006_week_board` (1 new table: cell overrides), board read endpoint, override writes with reference validation (`9baa4d7`), projection arithmetic (`37d0747`), client-side draft with escaped fingerprints (`2473fd7`, `9dacf57`), interactive WeekBoard screen (`4186f1b`). Post-review fixes: synchronous edit tracking (`2f09431`), edit preservation during save (`7e6f596`), undefined-weeks handling and dirty-leave prompting (`084d525`). |
| #17 | 08-20 10:08 | `f8c360b` | Docs + hardening: VPS deployment actuals (runbook flipped to *deployed*), smoke test, dockerignore fix for `prod.env` (`e78da3f`, now CI-enforced), frontend fast-refresh fix. |
| #16 | 08-20 00:39 | `8025da4` | Infra: compose consolidation to repo root (old `infra/docker-compose.yml` deleted) + Hostinger VPS deployment runbook. **This is the commit currently deployed to production.** |
| #15 | 08-19 20:43 | `8dd3965` | Fix: PATCH request bodies surfaced in OpenAPI and the generated TS client. |

**Breaking changes:** none. Schema grew additively (0005 → 0006); API surface only gained endpoints. Note migration 0006 must run on any deploy past `8025da4`.

**Cadence note:** file touches in-window split docs 134 / backend 112 / frontend 80 — the docs-heavy pattern (~40% docs churn) continues, and this week docs PRs outnumbered feature PRs.

## 2. Documentation Changes

**Added by PR #19 (all verified at HEAD):**
- `CONTEXT.md` — ubiquitous language (Department/Role/Title/Location terms with "avoid" aliases). Closes the "no CONTEXT.md" prep gap flagged 2026-08-20.
- `docs/adr/0001`–`0005` — relational schema (no document envelope), week-start-is-data, canonical codes are seed data, constraint weights 0–100 soft/hard, declared code-set converter manifest. Closes the "no `docs/adr/`" prep gap.
- `docs/agents/domain.md`, `issue-tracker.md`, `triage-labels.md` — new agent-facing guides.
- `backend/tests/test_docs_corpus.py` now enforces existence of all the above.

**Stale or contradictory (each verified against code today, none fixed):**
1. `docs/README.md:39` — deployment runbook row still says "**Not yet executed**", while `docs/deployment.md:10` says "**Status: deployed — live since 2026-08-19**". The stale line dates from `0fe2024` (08-19, written pre-deploy) and was never flipped. PR #19 edited this same table without fixing it.
2. `docs/developer.md:21-24` — claims "Shipped: **eighteen** tables … Not yet built: week lifecycle, the board, schedule generation, auth". Actual: **23 tables** (`op.create_table` across migrations 0001–0006 = 7+6+5+0+4+1); week lifecycle shipped in PR #11 and the board in PR #18. The line dates from `4dd6d7c` (08-18). Related: the "UI workflows these routes serve" section (`developer.md:237-261`) still lists only Configuration / Team / Week Setup — no Departments or Week Board entries.
3. Generated wiki (`docs/wiki/`, export of the ZCode repo wiki — never hand-edit):
   - No Week Board pages anywhere: `04-week-setup-and-coverage/` has 3 pages (all pre-board), `06-frontend/` has 8 (none for the WeekBoard screen).
   - `docs/wiki/06-frontend/02-api-client-generated-schema-contract-and-queries.md:59` still documents the "Known gap: PATCH request bodies not represented in the generated schema" that PR #15 closed.
   - Fix path: regenerate the wiki in the app, then run `scripts/export_repo_wiki.py`.

**Inline comments:** the API layer and wiki carry good explanatory comments (e.g., `deps.py:21` explaining the `Depends` B008 workaround); no new inconsistencies noticed in code comments.

## 3. Next Sprint Suggestions

1. **[High] Add authentication to the production API.** `deps.py` has no auth dependency and 443 is world-open with `/docs` live (see critical callout). Even a minimal single-org token/API-key gate beats the status quo, and mandate §2's audit trail (users, timestamps, reasons) requires identity anyway. Impact: critical security. Effort: M.
2. **[High] Redeploy the VPS to `main`.** Production is pinned at `8025da4` — it has none of the Week Board work and is two PRs behind, and migration 0006 is unapplied there. Blocked on adding the GitHub deploy key (noted 2026-08-20). Impact: prod/schema drift grows daily. Effort: S once the key exists.
3. **[Medium] Close the three doc contradictions.** `docs/README.md:39`, `docs/developer.md:21-24`, and a wiki regeneration (Week Board pages + api-client §"Known gap"). One small PR plus an app-side wiki regen. The corpus test now enforces file *existence*, not accuracy — stale lines like these pass CI silently. Impact: this repo's docs are load-bearing for agents and humans. Effort: S.
4. **[Medium] Week Board follow-on: PTO / FINAL / PUBLISH lifecycle.** `docs/README.md:37` explicitly parks these ("PTO / FINAL / PUBLISH are later"); FINAL/PUBLISH decision gates are the mandate's draft-to-published governance backbone, and time-off feasibility is a named core competency. Impact: highest remaining product value. Effort: L.
5. **[Low] Delete the vestigial `as never` PATCH casts.** `frontend/src/api/queries.ts` still hand-writes six patch types and casts `body as never` (lines 164, 210, 247, 271, 313, 361) even though PR #15 made PATCH bodies present in the generated schema. The stale wiki page correctly warns these casts defeat compiler checking. Impact: removes a silent type-mismatch trap. Effort: S.

## 4. Risks & Concerns

- **Zero auth behind open 443 (critical, unchanged):** see callout. Only mitigation is an out-of-repo VPS firewall; hPanel allowlist decision still pending.
- **Production drift:** deployed `8025da4` vs `main` `0c7b6a8`; migration 0006 pending on prod; redeploy blocked on the deploy key; the Hostinger MCP token is bound to the wrong account, so VPS management stays SSH-only for now.
- **Red-merge history vs. no branch protection:** `main` was broken by a red merge as recently as 08-19 (PR #12 → fixed by #13). The pre-merge `gh pr checks` guard has held for five consecutive merges (#15–#19), but branch protection has been explicitly ruled out by the owner, so the guard remains manual and fallible.
- **Docs corpus tests check existence, not truth:** all three stale spots in §2 pass CI. Consider a corpus assertion tying `docs/README.md`'s deployment row to `docs/deployment.md`'s status line (they are one edit apart today).
- **Local-test red herrings:** stale `.claude/` worktrees have produced local-only docs-test failures while CI was green; check `git worktree list` before diagnosing local red.
- **Backlog visibility:** zero open issues/PRs; upcoming work lives only in `docs/superpowers/` specs and `docs/README.md` notes — fine for now, but the new `docs/agents/issue-tracker.md` suggests issue-based tracking is coming and nothing is seeded in it yet.

---
*Generated read-only from git/gh/filesystem inspection; no tests were executed for this report (CI status used as the green/red signal).*
