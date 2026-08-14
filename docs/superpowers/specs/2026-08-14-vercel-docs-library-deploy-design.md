# Vercel Production Deploy Design — WCAH Docs Library

*2026-08-14. Host the Pagenary documentation library as a public static site on
Vercel, with the `wcah` Hall of Records as the production front door.*

---

## 1. Goal

Ship `wcah-docs-library` to a public `*.vercel.app` production URL, git-connected
to `https://github.com/Standard-Pentest/wcah-oms-library.git`, so later pushes to
`master` update production.

Success is: opening the production domain lands on the **WCAH Hall of Records**
(`wcah` tenant), not a tenant picker. The other generation archives remain
reachable at their existing subpaths. The multi-tenant hub remains available at
`/library/`.

## 2. Constraints

| Constraint | Value | Consequence |
|---|---|---|
| Visibility | Public — anyone with the URL | No Deployment Protection, no password, no Vercel SSO gate |
| Target | Production on `*.vercel.app` | First deploy uses `--prod`; no custom domain in this spec |
| Integration | Git-connected Vercel project | CLI link against the GitHub remote, then production branch `master` |
| Runtime | Static files only | Vercel runs `npm run build` and publishes `dist/`. `pagenary serve` is local-only |
| Node | Vercel 22.x | Local Node 26 is unsupported on Vercel; pin via `package.json` `engines` |
| Secrets | None | No environment variables |
| Production branch | `master` | This repo does not use `main`; Vercel must not default to `main` |
| Out of scope | Custom domain, preview-only deploys, committing `dist/` | Follow-up work if needed |

## 3. Decisions — do not relitigate without new information

| # | Decision | Why |
|---|---|---|
| 1 | Static output (`dist/`), not a Node server | The library is already a Pagenary static build plus a generated hub page |
| 2 | Git-connected project, not CLI-only or `dist/` upload | Matches Vercel's durable setup; `master` pushes keep production current |
| 3 | `wcah` is the anchor tenant at `/` | Production front door is the Hall of Records, not a peer picker |
| 4 | Redirect `/` → `/wcah/` (temporary, not permanent) | Tenant HTML and assets already live under `/wcah/`; a 302/307 keeps the option to change the front door without cached 301s |
| 5 | Move the existing hub to `/library/` | Preserves cross-generation navigation without making it the homepage |
| 6 | Hub links must be root-absolute (`/wcah/`, `/oms-v0/`, …) | Relative `./wcah/` links from `/library/` would resolve to `/library/wcah/` and break |
| 7 | Public production | Explicit product choice; README's "proprietary" note does not override it |
| 8 | No serverless functions, rewrites-as-app, or SPA fallback | Each tenant is real HTML on disk; Vercel static serving is enough |

## 4. URL map

| URL | Serves |
|---|---|
| `/` | Redirect to `/wcah/` |
| `/wcah/` | Anchor tenant — WCAH Hall of Records |
| `/oms-v0/` | OMS v0 archive |
| `/oms-v1/` | OMS v1 archive |
| `/oms-v2/` | OMS v2 archive |
| `/library/` | Existing portal hub (featured `wcah` card + generation grid) |

`/wcah/`, `/oms-v0/`, `/oms-v1/`, and `/oms-v2/` keep the paths Pagenary already
emits. Do not rebuild tenants at the domain root.

## 5. Architecture

On each production (and later git) build, Vercel:

1. Installs dependencies with `npm install` (devDependencies included, so
   `@pagenary/publisher` is available).
2. Runs `npm run build` → `pagenary build --all` then `node scripts/build-portal.js`.
3. Publishes `dist/` as the static output directory.

Browser requests hit the CDN. There is no Node process at request time.

```text
GitHub master push
        │
        ▼
Vercel build (Node 22)
  npm run build
    pagenary build --all     → dist/wcah, dist/oms-v0, dist/oms-v1, dist/oms-v2
    scripts/build-portal.js  → dist/library/index.html
        │
        ▼
CDN  dist/
  /          → 302/307 /wcah/
  /wcah/     → Hall of Records
  /library/  → hub
  /oms-v*/   → generation archives
```

## 6. Repo changes

Four files. Nothing else.

### 6.1 `vercel.json`

- `buildCommand`: `npm run build`
- `outputDirectory`: `dist`
- Omit `framework` (this is not Next.js; Vercel publishes the static `dist/` output)
- Redirect: source `/` → destination `/wcah/`, `permanent: false`

Do not add SPA `rewrites` that swallow tenant paths.

### 6.2 `scripts/build-portal.js`

- Create `dist/library/` if needed.
- Write the current hub HTML to `dist/library/index.html`, not `dist/index.html`.
- Change hub `href`s from `./wcah/`, `./oms-v0/`, `./oms-v1/`, `./oms-v2/` to
  `/wcah/`, `/oms-v0/`, `/oms-v1/`, `/oms-v2/`.
- Leave card copy and styling as they are.

After this change, `dist/index.html` must not be the hub. Root is the Vercel
redirect.

### 6.3 `package.json`

Set `"engines": { "node": "22.x" }` so Vercel selects Node 22.

### 6.4 `.gitignore`

Ignore `.vercel/` (CLI link metadata). Do not commit `project.json` or
`repo.json`.

## 7. First deploy sequence

1. Install the Vercel CLI if it is not on `PATH`.
2. Authenticate (`vercel login`, or `VERCEL_TOKEN` from the environment / `.env`
   if already present). Never pass the token as a CLI flag.
3. If the account has multiple teams, stop and ask which team slug to use.
   If already linked (`.vercel/project.json` or `.vercel/repo.json`), use that
   `orgId` and do not re-ask.
4. Tell the user the project will be linked to that team, then run
   `vercel link --repo --scope <team-slug>` so GitHub
   `Standard-Pentest/wcah-oms-library` is the git source.
5. Set the Vercel production branch to `master`.
6. Commit the four repo changes on `master` (or the working branch) and deploy
   production with `vercel deploy --prod -y --no-wait --scope <team-slug>`.
   After git integration is live, further `master` pushes update production.
7. Return the production URL from `vercel inspect` / `vercel ls`. Do not curl or
   fetch the live URL to "verify" it.

If the CLI cannot authenticate in this environment, stop and ask for a token
rather than using a no-auth claim-URL fallback for this git-connected production
setup.

## 8. Error handling

- A failed Vercel build keeps the previous production deployment. Diagnose with
  `vercel inspect <url> --logs`.
- Auth or link failure must stop before a production URL is advertised.
- Missing `dist/wcah/` after a local build is a blocker — do not deploy.

## 9. Verification

Before `--prod`, run `npm run build` locally and confirm:

- `dist/wcah/index.html` exists
- `dist/library/index.html` exists
- `dist/library/index.html` links to `/wcah/` (not `./wcah/`)
- `dist/index.html` is not the hub page

After deploy, the operator confirms in a browser:

- `/` ends on the Hall of Records
- `/library/` still shows the hub
- `/oms-v0/`, `/oms-v1/`, `/oms-v2/` still load

## 10. Non-goals

- Custom domain
- Deployment Protection / SSO
- Changing tenant markdown, branding, or Pagenary config
- Running `pagenary serve` on Vercel
- Preview-only first deploy (production was requested explicitly)
