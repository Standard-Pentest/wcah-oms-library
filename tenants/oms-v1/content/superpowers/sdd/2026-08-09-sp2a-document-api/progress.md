# SDD ledger — plan: docs/superpowers/plans/2026-08-09-sp2a-document-api.md

Task 0: complete — branch sp2a-document-api created off conformance/pin-seed-fixture (docs @ c35f41f).
Baseline (pre-SP2a): vitest 322 pass / 1 fail (baseline.test.js ratchet, by design), conformance schedule extra:1 (Sharko Thu), parity-aug02 green. SP2a must not change these except pass count rising.
Model map: impl haiku=5,6,11 · sonnet=1,2,3,4,7,8,9,10 ; review sonnet=1,2,3,5,6,7,8,11 · opus=4,9,10 ; final review opus.

Task 1: complete (commits c35f41f..f0c0bdf, review clean — spec ✅, quality Approved).
Task 1: minor (deferred): backend/.env not gitignored (credential-leak risk) — fold `.env` into Task 5 gitignore (Task 5 creates .env.example).
Task 1: minor (deferred): implicit pytest import path (no pyproject/pytest.ini); consider requires-python/.python-version + pytest config in a later task.

Task 2: complete (commits f0c0bdf..a4245bd, review clean — spec ✅, quality Approved; disclosed prepend_sys_path deviation accepted as minimal/justified).
Task 2: CARRIED to Task 3 (Important, brief-inherited — does not block Task 2): migrated_db fixture + settings default both point at the dev DB (oms), so Task 3+ document tests would clobber local scratch. Fix in Task 3: isolate tests to a dedicated oms_test DB (set DATABASE_URL in conftest BEFORE importing app; auto-create oms_test via psycopg autocommit).
Task 2: minor (deferred): CHECK/UNIQUE constraint teeth have no automated regression test.
Task 2: minor (deferred): ORM/DDL autogenerate drift — only matters if a later task enables --autogenerate (migrations are hand-written).

Task 3: complete (commits a4245bd..ad6cbe6, review clean — spec ✅, quality Approved). GET route + test-DB isolation (carried Task-2 item resolved: tests now use oms_test; dev oms untouched, verified empirically).
Task 3: minor (deferred): conftest sets DATABASE_URL via setdefault but _ensure_test_db targets a hardcoded cluster — add `assert DATABASE_URL endswith "_test"` guard.
Task 3: minor (deferred): _ensure_test_db connects to dev `oms` as admin DB; prefer the `postgres` maintenance DB for fresh-clone/CI robustness (CI works today since it creates `oms`).
Task 3: minor→forward to Task 4: get_document/put 500 (not 404/graceful) if the sentinel row is ever missing; unreachable (migration seeds it) but note in Task 4 PUT path.

Task 4: review (opus) — spec ✅, quality Approved, but 1 Important + 2 minor → fix loop entered.
  Important: concurrency test drives a copy of the SQL (_swap), not the route; a SELECT-then-update refactor would still pass. Fix: extract write to a service fn used by BOTH route and the concurrency test (drives real path).
  minor: rb_thread[0] can IndexError if thread's _swap raises (masks real error) — capture+re-raise after join.
  minor: test_put_with_stale_base_is_rejected lacks a no-mutation assertion — add history-count==1 after the 409.
  Concurrency test hardening (pg_stat_activity sync) accepted as a strict improvement over the brief's literal Step 5.

Task 4: fix round 1/5 (3 addressed, 0 open — service extraction guards real path; thread re-raise; no-mutation assertion; commits bfad222..e352fa6). Re-review (opus): all addressed, atomicity preserved through extraction, no new breakage.
Task 4: complete (commits ad6cbe6..e352fa6, review clean after 1 fix round).
Task 4: minor (deferred): concurrency test error path raises before a.close()/b.close() (cosmetic; fixture tears down).

Task 5: IMPLEMENTED, REVIEW PENDING (commit e352fa6..e7f4341) — PAUSED for token limit before the task-5 review.
  Verified by implementer: docker compose up → /healthz {"status":"ok"}, /api/document {"doc":null,"revision":0,"schema_version":null}, clean down.
  Implementer concern to review/address: NO .dockerignore — `COPY . .` bakes backend/.venv, __pycache__, and (once created) backend/.env into the image (bloat + secret-leak risk). Likely a fix-round item or fold into Task 5 review.
  RESUME HERE: run the Task 5 review — review-package base e352fa6, head e7f4341 (BASE recorded before Task 5 = e352fa6). Reviewer model: sonnet. Then Tasks 6 (haiku),7 (sonnet),8 (sonnet),9 (sonnet/opus review),10 (sonnet/opus review),11 (haiku), then final whole-branch review (opus).
  ENV NOTE: no Postgres container is running now (Task 5 removed oms-pg and tore down compose). Backend/Task-11 local verify must start one: docker run --rm -d --name oms-pg -e POSTGRES_USER=oms -e POSTGRES_PASSWORD=oms -e POSTGRES_DB=oms -p 5432:5432 postgres:16

Task 5: review (sonnet) — spec ✅, quality Approved; 1 Important → fix loop.
  Important: no .dockerignore; `COPY . .` bakes backend/.venv (73MB) + caches, and once backend/.env exists it is copied AND read by Settings() (env_file=".env") in-container. .gitignore does not affect Docker build context. Fix: add backend/.dockerignore.
  minors (deferred): pg_isready false-healthy pattern; host 5432 bound unconditionally; .env.example DATABASE_URL uses localhost (only backend/.env or exported var takes effect).

Task 5: fix round 1/5 (1 addressed, 0 open — backend/.dockerignore; commit b707185). Re-review (haiku): ADDRESSED, no breakage (context 69.25MB→2.25kB, .env/.venv excluded, needed files preserved).
Task 5: complete (commits e352fa6..b707185, review clean after 1 fix round). Backend + infra DONE.
--- Frontend tasks begin (no Postgres needed for 6-10) ---

Task 6: complete (commits b707185..2e7690f, review clean — spec ✅, quality Approved). Immutability test verified load-bearing. Trailer confirmed present.
Task 6: minor (deferred): defaultUi assertion is self-referential (only selectedWeek pinned to a literal); add full-shape toEqual.
Task 6: minor (deferred): null/empty weekOrder branch of defaultUi untested.

Task 7: complete (commits 2e7690f..ce9e82a, review clean — spec ✅, quality Approved). IDB cross-instance persistence test genuine; revision confined to envelope.
Task 7: minor (deferred, carry to 9/10): version-mismatch test asserts on message not err.code; the code:'version-mismatch' contract is what 9/10 consume — add a `.code` assertion. Also toThrowError deprecated (use toThrow) in that test.

Task 8: review (sonnet) — spec ✅ (39-action bijection verified against source), quality Approved; 1 Important → fix loop.
  Important: completeness guard passes vacuously if regex/paths break (inherited from brief test). Fix = strengthen (not weaken): assert types.toContain('REPLACE') AND types.toContain('UPSERT_DEPARTMENT') (one sentinel per source file) so a scan break hard-fails.
  minor: regex [A-Z_]+ blind to digits/lowercase in future action names — add a note comment.
  minor (carry): toThrowError deprecated in the test — switch to toThrow.
ENV: full vitest suite FLAKY at default concurrency (14 timeouts, resource contention); clean at `npx vitest run --max-workers=2` (333 pass/1 pre-existing fail). Confirmed environmental, not caused by any SP2a diff. USE --max-workers=2 for Task 11 CI verify + final review; consider a pool/maxWorkers setting in Task 11.

Task 8: fix round 1/5 (3 addressed, 0 open — per-file sentinels, regex comment, toThrow; commit b38f357). Re-review (haiku): all addressed, test-only, module untouched, no breakage.
Task 8: complete (commits ce9e82a..b38f357, review clean after 1 fix round).

Task 9: implemented DONE_WITH_CONCERNS (commit 5c480ae). Correctness concern → fix BEFORE task review (per skill).
  Important (concern 1): queue never-settles a superseded/queued save's promise on 409/offline or when a 3rd save supersedes (brief's pump() overwrites single `queued` slot). Fix: settle-all-waiters queue.
  minor (concern 2): fingerprint no-op compares client JSON.stringify vs server JSONB key-order → one redundant no-op PUT after load. Judgment; opus to assess.
  minor (concern 3): 409 test name implies a reload guard the store doesn't enforce (Task 10 enforces). Rename.
  minor (lint): unused `url` var in test line ~62.
  FIX_BASE for eventual re-review = 5c480ae. Opus task review runs AFTER the correctness fix.

Task 9: task review (opus) on corrected code (b38f357..096f177) — spec ✅ on all contract bullets, queue core correct, BUT quality = Needs fixes → fix loop round 1.
  CRITICAL 1: post-fetch awaits in the PUT IIFE are unguarded — a rejection from resp.json() (409 body) or cache.saveEnvelope() leaves inFlight stuck true → every future save() hangs (permanent lockup). Fix: guard 409 body (resp.json().catch(()=>({}))); best-effort cache write (try/catch, resolve anyway since revision already advanced); + outer safety catch so ANY throw still releases inFlight + settles waiters.
  IMPORTANT 2: load() doesn't check resp.ok — a 5xx GET → revision=undefined → next PUT drops base_revision key (malformed) and returns undefined (not null) to Task 10. Fix: throw tagged error on !resp.ok.
  minor 3: duplicate in-flight PUT of identical doc not caught (acceptedFingerprint only updates post-write) — guard in pump().
  minor 4: load() success resp.json() parse error untagged.
  minor 5: no test asserts 'revision' absent from body.doc / load() return.
  FIX_BASE for re-review = 096f177.

Task 9: fix round 1/5 post-review (5 addressed, 0 open — guarded 409 parse + best-effort cache + outer safety net + load resp.ok + dup-PUT guard + tagging + revision-leak tests; commit b2806c4). Re-review (opus): all addressed, every throw site traced, no path strands inFlight, no double-settle.
Task 9: complete (commits b38f357..b2806c4, review clean after 1 pre-review correctness fix + 1 post-review fix round). 19/19 store tests.
Task 9: minor (deferred → FINAL REVIEW triage): load() cache write (omsApiStore.js:57) is unguarded — same class as the PUT fix; an IDB failure rejects a successful load with an UNTAGGED error (Task 10 branching won't match). No lockup (no inFlight on load). Cheap fix: wrap in try/catch like the PUT path.
Task 9: minor (deferred): 5xx load reuses code:'offline' (no cachedDoc) — asymmetric with network-failure's offline-cache; consider a distinct code or cache fallback later.
--- Task 10 (OmsContext state machine) next: sonnet impl / opus review ---

Task 10: implementer hit an API error (connection closed) but had ALREADY committed 2ca391e + written its report before the drop. Controller-verified the committed state directly (never-trust-GREEN): API-mode test 3/3, existing IDB-mode test 2/2 (unbroken), full suite --max-workers=2 = 355 pass / 1 pre-existing fail (baseline ratchet, confirmed by name) / 2 skipped; parity-aug02 3/3 green. Vite /api proxy present. Proceeding to opus task review of 2ca391e.
Task 10: minor (note for review): unused `React` import in OmsContext.jsx and OmsContext.api.test.jsx (lint).

Task 10: task review (opus) on 2ca391e — headline epoch-gate correct, API transitions correct, BUT quality = Needs fixes → fix loop round 1.
  CRITICAL 1: lastAccepted.current never advanced on ordinary save SUCCESS (only on loads). After an accepted edit A, a later save-error on edit B rolls back to stale lastAccepted (S0) and re-saves it → server clobbered (silent lost edit). Fix: advance lastAccepted on save success (.then); do NOT force read-only on save-error (only network offline → read-only).
  IMPORTANT 2: IDB "behaves exactly as before" violated — (a) hydrate `hydrateOms(toPersistedOms(raw), undefined)` strips persisted ui; fix → pass raw.ui; restore `&& raw.scheduleWeeks` guard. (b) resetToSeed reordered save-first + dropped clear() → IDB version-mismatch recovery degraded; fix → branch resetToSeed by apiMode (API = audited PUT; IDB = original dispatch-first + clear()+save recover-always).
  IMPORTANT 3: no test for success-save-THEN-failing-save (the transition exposing Critical 1); also missing offline/save-error rollback, reset success/failure, reconnect, empty-API load→null. Add them.
  minor: unused React import (both files); reconnect/resetToSeed missing from value useMemo deps; no mounted-guard in async save catch; malformed-doc guard.
  FIX_BASE for re-review = 2ca391e. Original implementer agent a30af8a475e39b083 (died on API error post-commit; resume from transcript).

Task 10: complete (commit 320c539) — VIA CONTROLLER INLINE FIX (subagents session-limited; agent a30af8a died on session limit after applying OmsContext.jsx edits but before tests/commit). Controller added the missing tests + fixed fixtures, VERIFIED: Critical rollback test proven load-bearing (fails vs buggy 2ca391e, passes vs fix), API 9/9, IDB-mode 2/2 unbroken, full suite 361 pass / 1 pre-existing fail, parity 3/3. NOTE: this fix skipped independent subagent re-review — final whole-branch review must scrutinize OmsContext.
Task 11: complete (commit fcb63b3) — VIA CONTROLLER INLINE (CI yaml). Verified: yaml parses (2 jobs, pg service), vitest --max-workers=2 361/1, backend pytest 11/11.
ALL 11 TASKS IMPLEMENTED. Next: final whole-branch review (opus) over c35f41f..HEAD (SP2a impl range). Deferred-minors to triage are tagged 'minor (deferred)' above; the notable ones: Task9 load() line ~57 cache write unguarded (untagged reject on IDB failure); Task9 5xx reuses offline code w/o cachedDoc; Task3 _ensure_test_db uses oms not postgres maintenance db; Task2 no constraint-teeth regression test.

FINAL whole-branch review (opus, c35f41f..fcb63b3): "No — with fixes". Backend/migration/queue CONFIRMED solid. Findings (frontend seam + CI):
  CRITICAL 1 (data loss): offline → StorageBanner's only button is "Reset to seed"; resetToSeed API path PUTs seed with NO writesEnabled guard → clobbers authoritative doc after a blip. reconnect() exists but is wired to NO UI (acceptance §4 unmet).
  IMPORTANT 2 (data loss, was "deferred minor"): omsApiStore load() cache write (~ln54-57) unguarded — only untagged throw AFTER revision is set → IDB failure → app shows seed writable → next edit clobbers server. MUST FIX.
  IMPORTANT 3 (regression): OmsContext save-error else-branch rollback applies to IDB mode (no .code → else); IDB store has no equal-projection no-op → rollback REPLACE → re-save → loop. IDB is the SHIPPING config.
  IMPORTANT 4 (CI red-from-birth): vitest runs baseline.test.js (Sharko Thu ratchet, fails). Resolution = Tom's Sharko Thu confirm (SP2a completion already gated on this per acceptance §3.1) → ESCALATE, not a code fix.
  IMPORTANT 5: no IDB-mode failing-save test (let #3 slip).
  Minors: banner copy wrong for 3/4 statuses; storeStatus never returns to ok after recovery; doc.version coupled to schema_version; 409-blocks-writes untested; value memo defeated.
  Triage: load-cache-guard = MUST FIX; 5xx/conftest-oms-db/migration-constraint-test = defer (add UNIQUE case).
FIX WAVE (one sonnet subagent, then opus scoped re-review): close data-loss/regression in omsApiStore.js + OmsContext.jsx + tests ONLY (NOT App.jsx). App.jsx recovery-UX (wire reconnect / relabel reset) + CI ratchet disposition = ESCALATE to user (product surface + Tom's confirm). FIX_BASE = fcb63b3.

FINAL fix wave: commit ba76ea3 (Fix1 load-cache guard / Fix2 IDB rollback gate / Fix3 reset writesEnabled guard / Fix4 status-clear) + commit 725bfd3 (Fix4 correction: don't clobber reloaded-remote-change banner). Scoped opus re-review: Fix1/2/3 fully ADDRESSED w/ proving tests; Fix4 defect (banner clobber) then fixed in 725bfd3 + persistence test.
STATE: all 11 tasks implemented; final-review DATA-LOSS + regression CLOSED. Full suite 364 pass / 1 pre-existing ratchet fail / 2 skipped; parity 3/3; backend pytest 11/11.
NOT merge-clean yet — ESCALATED to user (decisions, not code bugs):
  1. App.jsx recovery UX: wire reconnect() into StorageBanner + relabel/guard "Reset to seed" for API mode + honest per-status banner copy. (Data-loss already closed by Fix3; this is the recovery-UX gap, acceptance §4. Product surface — user's call. App.jsx was outside the plan's file scope.)
  2. CI red-from-birth = the Sharko Thu ratchet (SP2a completion gated on Tom's confirm + conformance:update per acceptance §3.1). Needs Tom. Until then CI's frontend job is red by the baseline ratchet.
  3. Deferred minors: omsApiStore 5xx reuses offline w/o cachedDoc; conftest _ensure_test_db uses oms not postgres maintenance db; no migration CHECK/UNIQUE regression test (add UNIQUE case); doc.version coupled to schema_version (spec §7); 409-blocks-writes untested; value useMemo defeated; unused React import in OmsContext.oms.test.jsx.
Workspace NOT deleted; finishing-a-development-branch NOT run (branch not merge-clean pending #1/#2). Nothing pushed.

#1 DONE (commit 921071a): status-aware StorageBanner — offline→Reconnect (wired), reloaded-remote-change→Dismiss (new dismissStatus), version-mismatch→Reset (sole reset use), save-error/error→Reload. Pure StorageBannerView unit-tested per status (offline never offers reset). info theme tokens added. Full suite 371 pass/0 fail; build green.
#2 DONE (commit a3f30b8): Sharko Thu signed intended (blank-cells ruling) + re-baseline → ratchet GREEN. CI no longer red-from-birth. Tom to confirm the annotation (one-sided, Kasey-authorized).
SP2a now MERGE-READY: 371 pass / 0 fail / 2 skipped, parity green, backend pytest 11/11, build green, data-loss + recovery-UX closed, CI green. Nothing pushed. finishing-a-development-branch not yet run (awaiting user's push/PR call).
