# SP2a — Document API + Server-Authoritative Persistence (design)

*2026-08-09. The first half of the SP2 rollout milestone: stand up the backend
and swap the persistence seam from IndexedDB to an HTTP document API, **running
locally**. Deployment and auth are out of scope (see §12).*

**Status:** REVIEWED — revised for persistence-soundness 2026-08-09; ready for
implementation planning. Completion remains blocked on disposition of the known
conformance ratchet item.
**Parent design:** `docs/superpowers/specs/2026-08-04-production-migration-design.md` (§6)
**Owner:** Kasey (Track O — platform)
**Depends on:** SP1 conformance report exists (production-migration gate §3.8 —
satisfied). The report currently has one unsigned `Sharko Thu` extra and the
baseline ratchet is red; that is not a gate to *start* SP2a, but it must be
resolved or explicitly dispositioned before SP2a is declared complete.
**Governing decisions:** HANDOFF decisions 5 (server-authoritative), 19 (auth
punted), 20 (revision internal to store)

---

## 1. Context and goal

The OMS app persists its whole document to IndexedDB via a three-method seam
(`load` / `save` / `clear`) in `src/state/omsPersistence.js`. Decision 5 makes
Postgres the authoritative store: the browser edits against an API, and
IndexedDB becomes a read-only last-known-good cache. SP2a builds exactly that
seam swap and the backend behind it — **locally, with no authentication and no
deployment**. A working, server-authoritative scheduling product is the goal;
auth (decision 19) and the VPS rollout (SP2b) come after.

This is deliberately thin. SP2a stores a document the browser already knows how
to build; it does not port scheduling logic (SP3) or model the schedule
relationally (SP5). JSONB means Tom's ERD arrives later as a migration, not a
rewrite.

## 2. Scope

**In (SP2a):**
- FastAPI service exposing a single-document read/write API with optimistic
  concurrency (`revision`).
- Postgres with two `platform` tables, created by Alembic migration `0001`.
- `createOmsApiStore()` — a third implementation of the existing store seam.
- `OmsContext` selects the store and handles the two new failure paths
  (stale write, offline).
- Local Docker Compose (postgres + backend); frontend on `vite dev` proxying
  `/api` to the backend.
- CI runs both test suites (vitest + pytest).

**Out — deferred to SP2b:** Caddy, VPS deploy, containerized frontend, the
network-level access gate that a public instance requires.

**Out — deferred until auth is un-punted (decision 19):** Entra OIDC,
break-glass login, `platform.app_user`, and the `updated_by` / `written_by`
attribution columns on the document tables.

## 3. Acceptance criteria (definition of done)

Derived from production-migration §9, minus the deferred auth (§9.2) and
deployment (§9.4) items:

1. **No scheduling-semantic regression.** SP2a does not touch the engine, seed,
   oracle, or fixtures. `src/data/parity-aug02.test.js` remains green; the SP1
   report has no new divergence attributable to SP2a. The known pre-SP2a
   `Sharko Thu` baseline-ratchet item is resolved or explicitly dispositioned
   before completion — never hidden by editing expected fixtures.
2. **Round-trip with revision enforced.** `GET /api/document` returns the stored
   document, its `revision`, and its `schema_version`. `PUT /api/document` with
   the current `base_revision` succeeds, bumps the revision, and appends a
   history row. A `PUT` with a stale `base_revision` is rejected with `409` and
   does not mutate the document.
3. **The app runs against the API store.** With `VITE_API_BASE=/api`, the
   manager builds a week; a reload renders the scheduling document served from
   Postgres (not IDB). Local UI chrome is not written to Postgres.
4. **Honest-offline (decision 5).** With the API unreachable, the app renders
   the last-known schedule from the IDB cache in an explicit read-only mode.
   Scheduling mutations are rejected centrally. If connectivity fails during
   the first attempted edit, that edit is rolled back to the last accepted
   document and a persistent banner offers reconnect/reload; it never remains
   visible as though saved.
5. **Save ordering is deterministic.** At most one `PUT` is in flight. Edits
   made while it runs are coalesced into the next write, hydration/reload does
   not create a revision, and local UI-only actions create no write.
6. **Reset is server-authoritative.** Reset to seed is one revision-checked
   `PUT`; the displayed document and cache change only after acceptance. A
   failed reset leaves both the current server document and last-known-good
   cache intact.
7. **`docker compose -f infra/docker-compose.yml up` from a clean checkout**
   brings up postgres + backend, applies Alembic migration `0001` for local
   development, and `GET /healthz` returns `200`.

## 4. Data model

Schema `platform`, Alembic migration `0001`. Two tables (the third, `app_user`,
is deferred per decision 19).

### `platform.schedule_document`

The authoritative document. Migration `0001` creates exactly one sentinel row
(`id = 1`) at `revision = 0`; this removes the absent-row creation race and
makes the write path one atomic compare-and-swap. The document columns remain
nullable only while the sentinel is at revision zero.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `int` PK | Fixed to `1` in SP2a; `CHECK (id = 1)` |
| `schema_version` | `int` nullable | Mirrors the persistence wrapper (`4` today); null only at revision `0` |
| `revision` | `int` | Monotonic; starts at `0`; `CHECK (revision >= 0)` |
| `doc` | `jsonb` nullable | Persisted Approach B / v4 scheduling document; null only at revision `0`; excludes `doc.ui` |
| `updated_at` | `timestamptz` | Server clock on write |

### `platform.schedule_document_history`

Append-only record of every accepted write — what makes this a system of record.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `int` PK | |
| `document_id` | `int` FK → `schedule_document.id` | |
| `revision` | `int` | The revision this snapshot established; unique per document |
| `schema_version` | `int` | |
| `doc` | `jsonb` | Snapshot as accepted |
| `written_at` | `timestamptz` | |

`updated_by_user_id` / `written_by_user_id` are **omitted** until auth lands
(decision 19). They are added, nullable, when `app_user` ships.

Additional constraints: `UNIQUE (document_id, revision)` on history, and no
history row for the sentinel revision `0`. A row check enforces either
`revision = 0` with null document/version or `revision > 0` with both present.
There is no delete cascade or API delete path in SP2a.

## 5. HTTP API contract

Base path `/api`. JSON in and out. No auth headers (decision 19).

### `GET /api/document`
- **200** `{ "doc": <PersistedHospitalDocument> | null, "revision": <int>, "schema_version": <int> | null }`
- Before the first accepted write, the sentinel row yields
  `{ "doc": null, "revision": 0, "schema_version": null }`.
  The client keeps its locally seeded document; the first `PUT` (base `0`)
  establishes revision `1`.

### `PUT /api/document`
- **Body** `{ "doc": <PersistedHospitalDocument>, "base_revision": <int>, "schema_version": <int> }`
- **200** `{ "revision": <int> }` — the new revision. The write is one
  transaction: execute an atomic
  `UPDATE ... WHERE id = 1 AND revision = :base_revision RETURNING revision`
  that sets revision to `base_revision + 1`, then append the matching history
  row. If the update returns no row, roll back and return `409`. Do not
  implement this as `SELECT` followed by an unconditional update.
- **409** `{ "error": "stale-write", "current_revision": <int> }` — the
  `base_revision` is not current. The document is unchanged.
- **422** on a `schema_version` the server does not accept (mismatch against the
  expected wrapper version), a non-object `doc`, a `doc.version` the server
  does not accept, or a payload containing `doc.ui`. This is boundary
  validation, not a second scheduling-domain implementation.

### `GET /healthz`
- **200** `{ "status": "ok" }` once the DB connection is live. Used by Compose
  and (later) the SP2b reverse proxy.

## 6. The persistence seam

### Authoritative projection

`doc.ui` is client chrome, not scheduling source-of-truth data. It currently
contains screen selection, selected week/PTO, AI-panel state, validation
messages, and ephemeral PTO preview state. Persisting it would turn navigation
into history revisions and create false cross-tab conflicts.

SP2a therefore defines:

- `toPersistedOms(doc)` → the v4 document with `ui` removed.
- `hydrateOms(persisted, localUi)` → the persisted document with local/default
  UI state attached for the reducer.

The API and its history store only `PersistedHospitalDocument`. The ordinary
IDB/memory adapters may retain today's full local document behavior when the API
store is not selected. PTO preview remains non-persisted in every mode.

### `createOmsApiStore({ baseUrl, cache })`

A third adapter alongside `createOmsIdbStore` / `createOmsMemoryStore`, with the
same public method names (`load` / `save` / `clear`). **Revision remains
internal** (decision 20). The API adapter is a deep persistence module: it owns
the revision, accepted-document fingerprint, one-in-flight save queue,
coalescing, and the envelope-level last-known-good cache.

- `load()` — `GET`.
  - **online / document present** → retain revision and canonical persisted
    document, replace the envelope cache, return the persisted document.
  - **online / revision 0** → retain revision `0`, return `null`, and do not
    manufacture a history write. The first actual scheduling mutation (or an
    explicit reset) establishes revision `1`.
  - **network failure with cache** → throw
    `{ code: 'offline-cache', cachedDoc }`. The exception is deliberate:
    returning a cached doc as an ordinary successful load would hide from
    `OmsContext` that writes must be disabled.
  - **network failure without cache** → throw `{ code: 'offline' }`.
- `save(doc)` — project with `toPersistedOms`, then enqueue a revision-checked
  `PUT`.
  - A canonical document equal to the last accepted one is a no-op. Hydration,
    stale reload, and local UI actions therefore do not create revisions.
  - At most one `PUT` is in flight. Further calls replace one queued
    latest-document slot; after the current response advances the revision, the
    latest queued document is sent against that new revision. The adapter never
    sends two requests with the same internally tracked base revision.
  - **200** → advance revision, set the accepted canonical document, refresh
    the envelope cache, resolve callers covered by that accepted document.
  - **409** → discard the queued write, throw
    `{ code: 'stale-write', currentRevision }`, and require a fresh `load()`
    before another save.
  - **network failure** → discard the queued write and throw
    `{ code: 'offline' }`. Neither revision nor cache advances.
- `clear()` — clears only the local API envelope cache. It never reads, writes,
  or deletes the server document and is **not** part of reset-to-seed.

`baseUrl` is normalized once: with `VITE_API_BASE=/api`, the adapter calls
`/api/document`, not `/api/api/document`.

### Envelope cache and serialization

The public document seam cannot recover a revision if an IDB adapter has already
discarded the envelope. The API adapter therefore receives a private,
envelope-level cache with `loadEnvelope` / `saveEnvelope` / `clearEnvelope`.
Its serialized value is:

```json
{ "schemaVersion": 4, "revision": 12, "doc": { "...persisted v4 document..." } }
```

`deserializeOmsEnvelope` returns the full envelope to the API adapter.
`createOmsIdbStore` and `createOmsMemoryStore` can use the same codec internally
while continuing to return documents to their ordinary callers. A cached
revision is never treated as current after offline mode: reconnect always
performs `GET` before writes are re-enabled.

This is the concrete correction to production-migration §6.1's earlier “same
serialized payload / no caller change” simplification and implements HANDOFF
decision 20 without leaking revision into the domain document.

### `OmsContext` save state machine

Store selection: `import.meta.env.VITE_API_BASE` set →
`createOmsApiStore({ baseUrl, cache })`; unset → today's
`createOmsIdbStore()` (pure-frontend work remains unaffected).

`OmsContext` retains the last accepted hydrated document and exposes a guarded
dispatch in API mode:

1. **Hydrating.** `load()` success hydrates with local/default UI and sets
   `storeStatus = 'ok'`. `offline-cache` hydrates `cachedDoc`, sets
   `storeStatus = 'offline'`, and disables scheduling mutations. Hydration is
   not dirty and cannot schedule a write.
2. **Editing online.** The guarded dispatch marks only scheduling mutations
   dirty (for example, by incrementing a persistence epoch that the debounced
   effect observes). Hydration and UI-only actions do not advance that marker.
   The API store then serializes/coalesces actual requests.
3. **Network failure during save.** Replace the displayed persisted document
   with the last accepted one while retaining local UI, set
   `storeStatus = 'offline'`, and disable scheduling mutations. This rollback
   is what makes the failed edit honest.
4. **Offline interaction.** A central action classifier allows UI-only actions
   (navigation, selection, AI chrome, PTO preview) but rejects every scheduling
   mutation. The plan must enumerate every reducer action in exactly one class,
   with a test that fails when a new action is unclassified.
5. **Reconnect.** The banner exposes an explicit retry. It calls `store.load()`;
   only a successful server `GET` replaces the persisted document, updates the
   internal revision, returns status to `ok`, and re-enables scheduling
   mutations. There is no blind replay of rejected offline edits.
6. **Stale write.** Save the rejected edit only as transient diagnostic state,
   call `store.load()`, replace with latest server content while retaining local
   UI, and set `storeStatus = 'reloaded-remote-change'`: “Schedule changed
   elsewhere — your edit was not saved; reapply it.” The reload is not dirty.
7. **Reset to seed.** Call `store.save(toPersistedOms(seed))` first. Only after
   acceptance dispatch `REPLACE` and update the last-accepted ref. On stale or
   offline failure, leave the current display and cache untouched. Do not call
   `clear()`.

Unknown errors remain `save-error`, roll back the persisted portion to the last
accepted document, and do not claim that the edit succeeded.

## 7. Three version numbers — keep them distinct

The code already carries two; SP2a adds a third. The spec, the API, and the
column names must not conflate them:

| Name | Where | Meaning |
|------|-------|---------|
| `doc.version` | HospitalDocument field | Domain document schema (currently `4`) |
| `schemaVersion` / `schema_version` | persistence wrapper, API, DB column | Persistence envelope version `deserializeOms` checks (currently `4`) |
| `revision` | store (internal), API, DB column | Monotonic per-write counter for lost-update rejection |

`doc.version` and `schemaVersion` happen to both be `4` today; that coincidence
must not become a coupling. `revision` is unrelated to either.

## 8. Repo layout and tooling

```
backend/            FastAPI app, SQLAlchemy models, Alembic env + versions/, pytest
infra/              docker-compose.yml (postgres + backend), .env.example
.github/workflows/  CI: vitest + pytest
src/state/          envelope cache + createOmsApiStore; OmsContext state machine
```

- `backend/` is Python 3.12: FastAPI, SQLAlchemy 2.x, Alembic, psycopg 3,
  pytest + httpx. Pinned in `backend/requirements.txt` (or `pyproject.toml`).
- `infra/docker-compose.yml`: `postgres:16` + the backend image. For **local
  SP2a only**, the backend startup applies `alembic upgrade head` before
  uvicorn so the clean-checkout acceptance command is literal. SP2b separates
  migration into a release/admin command before the production app starts.
  Frontend is not containerized at 2a; it runs via `vite dev`.
- Vite proxies `/api` to the local backend, so browser requests are same-origin
  and no development CORS policy is required.
- `.env.example` documents `DATABASE_URL` (backend) and
  `VITE_API_BASE=/api` (frontend). `VITE_API_BASE` is a path and build-time mode
  selector, not a production host name; SP2b also serves the API at same-origin
  `/api`. No secrets in git.
- CI gains a Python job; the existing vitest job is unchanged.

The repo becomes polyglot here. That is expected — SP2 is where the backend
lands (migration §5.2 assigns `backend/`, `infra/`, `.github/` to Track O).

## 9. Testing strategy

- **Backend (pytest + httpx, real Postgres):** migration creates exactly one
  revision-0 sentinel; GET-empty returns revision 0; PUT base-0 establishes
  revision 1 and one history row; current-base PUT succeeds; stale-base PUT
  returns 409 without mutation; two concurrent base-N PUTs yield exactly one
  200 and one 409; history revisions are unique; schema/doc version mismatch,
  non-object docs, and `doc.ui` return 422; `/healthz` is 200. The concurrent
  test is mandatory because the transaction is the feature.
- **Envelope cache (vitest):** full `{ schemaVersion, revision, doc }`
  round-trip; version mismatch; API adapter can recover the cached document
  without exposing revision to callers; cache is not advanced on failed save.
- **Store (vitest, stubbed `fetch`):** load tracks revision; equal-document save
  is a no-op; two saves with the first response delayed produce sequential base
  revisions rather than a self-409; intermediate pending documents coalesce to
  the latest; 409 blocks further writes until load; network failure throws
  offline; offline load throws `offline-cache` with the cached document;
  reconnect always GETs before save; base URL normalization is exact.
- **Authoritative projection (vitest):** `toPersistedOms` removes all `ui`;
  hydration restores valid local/default UI; screen, week selection, AI toggle,
  errors, and PTO preview never cause a PUT.
- **`OmsContext` (vitest + Testing Library):** offline-cache renders read-only;
  every reducer action is classified as local-only or scheduling mutation;
  offline scheduling actions are rejected; a failed first edit rolls back;
  reconnect requires successful GET; stale write reloads without autosaving;
  reset changes display/cache only after accepted PUT; store selection follows
  `VITE_API_BASE`.
- **Conformance / parity:** unchanged per acceptance §3.1. Capture the known
  pre-SP2a ratchet state before implementation so SP2a cannot be blamed for or
  used to hide an unrelated domain divergence.

## 10. Twelve-factor notes (the subset 2a touches)

Config via env (III); dependencies declared with lockfiles (II); backing
service (Postgres) attached by `DATABASE_URL` (IV); logs to stdout (XI). SP2a's
Compose command applies migrations automatically only to make local clean-start
acceptance deterministic. SP2b owns the production release/run split and runs
Alembic as a one-off admin process (V/XII). Same-origin `/api` preserves the
frontend contract across Vite locally and Caddy later. Full image/topology
dev-prod parity and port binding arrive with SP2b.

## 11. Risks and open items

- **Debounced auto-save + revision.** The debounce controls when the context
  offers a document; the API store's one-in-flight/coalescing state machine
  controls network ordering. History records accepted scheduling states, not
  every keystroke or UI navigation. Tune 300ms in implementation only if tests
  or measured behavior justify it.
- **First accepted mutation seeds the server.** A fresh API at revision 0 keeps
  the local seed in memory. Hydration alone does not write. The first scheduling
  mutation (or explicit reset) sends the full seed-derived document and
  establishes revision 1.
- **No auth means no deploy.** SP2a is safe because it is local. SP2b must not
  expose this API publicly without the network-level gate (decision 19); the
  plan for 2b owns that.
- **Offline work is intentionally discarded, not queued.** The first failed
  mutation is rolled back and subsequent scheduling mutations are centrally
  rejected until reconnect. SP2a does not build conflict merge, background
  replay, or an outbox.
- **`clear()` is local-cache maintenance only.** Reset is a normal audited PUT.
  A true server wipe would require a separately designed endpoint; none exists.
- **Known conformance ratchet item.** `Sharko Thu` remains one unsigned extra on
  the current branch. SP2a may start because the report-exists gate is
  satisfied, but completion cannot claim a green full suite until that item is
  resolved or explicitly dispositioned under the conformance process.

## 12. Deferred, with pointers

- **SP2b** (next): VPS deploy, Caddy, containerized frontend, honest-offline
  verified on the real box, and the network access gate. Host likely the
  existing Hostinger VPS (tooling already connected).
- **Auth un-punt** (decision 19): Entra OIDC confidential client + break-glass,
  `platform.app_user`, attribution columns. The design is preserved in
  migration §6.4 and schema v2 §1.

## Success criteria recap

SP2a is done when the app, pointed at same-origin `/api`, reads and writes only
the authoritative scheduling projection to Postgres; atomic revision checks and
a serialized client save queue reject both external stale writes and internal
self-races; offline mode renders the last-known-good schedule without allowing
an unsaved edit to masquerade as accepted; reset is an audited PUT; and
`docker compose -f infra/docker-compose.yml up` stands the local backend up
green — all without auth, deployment, scheduling-logic changes, or hidden
conformance drift.
