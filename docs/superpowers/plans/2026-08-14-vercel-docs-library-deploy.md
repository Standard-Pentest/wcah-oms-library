# Vercel Docs Library Deploy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the Pagenary docs library on a public Vercel production `*.vercel.app` URL, git-connected to GitHub, with the `wcah` Hall of Records as `/`.

**Architecture:** Vercel builds static output (`npm run build` → `dist/`). A temporary redirect sends `/` to `/wcah/`. The existing hub moves to `/library/` with root-absolute tenant links. No Node server, no env vars, no Deployment Protection.

**Tech Stack:** Pagenary (`@pagenary/publisher`), Node 22 on Vercel, Vercel CLI, GitHub repo `Standard-Pentest/wcah-oms-library` (production branch `master`).

**Spec:** `docs/superpowers/specs/2026-08-14-vercel-docs-library-deploy-design.md`

## Global Constraints

- Public — anyone with the URL. No Deployment Protection, password, or Vercel SSO gate.
- First deploy is production (`vercel deploy --prod`). No custom domain.
- Git-connected to `https://github.com/Standard-Pentest/wcah-oms-library.git`. Production branch is `master`, not `main`.
- Static files only. Vercel runs `npm run build` and publishes `dist/`. Do not run `pagenary serve` on Vercel.
- Pin Node with `"engines": { "node": "22.x" }`.
- No environment variables.
- Do not add SPA `rewrites` that swallow tenant paths.
- Do not commit `dist/` or `.vercel/`.
- Do not curl or fetch the live production URL to verify it.
- If the Vercel CLI cannot authenticate, stop and ask for a token. Do not use a no-auth claim-URL fallback.
- If the account has multiple teams, stop and ask which team slug to use before `vercel link`.
- Never pass `VERCEL_TOKEN` as a `--token` flag; export it as an environment variable.
- Do not change tenant markdown, branding, or Pagenary tenant config.

## File map

| File | Role |
|---|---|
| `scripts/build-portal.test.js` | Asserts hub path, absolute links, and no root hub file |
| `scripts/vercel-config.test.js` | Asserts `vercel.json`, `engines`, and `.gitignore` |
| `scripts/build-portal.js` | Writes hub to `dist/library/index.html` with `/wcah/` (etc.) hrefs |
| `vercel.json` | Build command, `dist` output, `/` → `/wcah/` redirect |
| `package.json` | `"engines": { "node": "22.x" }` |
| `.gitignore` | Ignore `.vercel/` |

---

### Task 1: Relocate the portal hub to `/library/`

**Files:**
- Create: `scripts/build-portal.test.js`
- Modify: `scripts/build-portal.js` (hrefs near lines 242, 257, 269, 281; write block at lines 302–305)

**Interfaces:**
- Consumes: `scripts/build-portal.js` as a CLI script (`node scripts/build-portal.js`), `process.cwd()/dist`
- Produces: `dist/library/index.html` containing `href="/wcah/"`, `href="/oms-v0/"`, `href="/oms-v1/"`, `href="/oms-v2/"`; does not write `dist/index.html`

- [ ] **Step 1: Write the failing test**

Create `scripts/build-portal.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const scriptPath = path.join(repoRoot, 'scripts', 'build-portal.js');

function runPortalBuild(cwd) {
  execFileSync(process.execPath, [scriptPath], { cwd, encoding: 'utf8' });
}

test('writes the hub to dist/library/index.html with root-absolute tenant links', () => {
  const cwd = mkdtempSync(path.join(tmpdir(), 'wcah-portal-'));
  try {
    mkdirSync(path.join(cwd, 'dist'));
    runPortalBuild(cwd);

    const hubPath = path.join(cwd, 'dist', 'library', 'index.html');
    assert.equal(existsSync(hubPath), true, 'expected dist/library/index.html');
    assert.equal(
      existsSync(path.join(cwd, 'dist', 'index.html')),
      false,
      'must not write dist/index.html; root is the Vercel redirect',
    );

    const html = readFileSync(hubPath, 'utf8');
    for (const href of ['/wcah/', '/oms-v0/', '/oms-v1/', '/oms-v2/']) {
      assert.match(html, new RegExp(`href="${href}"`));
    }
    assert.doesNotMatch(html, /href="\.\//);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('does not overwrite a leftover dist/index.html as the hub', () => {
  const cwd = mkdtempSync(path.join(tmpdir(), 'wcah-portal-leftover-'));
  try {
    mkdirSync(path.join(cwd, 'dist'));
    const leftover = path.join(cwd, 'dist', 'index.html');
    writeFileSync(leftover, 'LEFTOVER_ROOT');
    runPortalBuild(cwd);
    assert.equal(readFileSync(leftover, 'utf8'), 'LEFTOVER_ROOT');
    assert.equal(existsSync(path.join(cwd, 'dist', 'library', 'index.html')), true);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run:

```bash
node --test scripts/build-portal.test.js
```

Expected: FAIL. The current script writes `dist/index.html` and uses `href="./wcah/"` (and the other `./` tenant paths), so `dist/library/index.html` is missing.

- [ ] **Step 3: Update hub hrefs to root-absolute paths**

In `scripts/build-portal.js`, replace these four attributes only (leave card copy and CSS unchanged):

```js
    <a href="/wcah/" class="featured-card">
```

```js
      <a href="/oms-v0/" class="card card-v0">
```

```js
      <a href="/oms-v1/" class="card card-v1">
```

```js
      <a href="/oms-v2/" class="card card-v2">
```

Do not change the Google Fonts `href`s.

- [ ] **Step 4: Write the hub to `dist/library/index.html`**

Replace the write block at the bottom of `scripts/build-portal.js` with:

```js
const libraryDir = path.join(distDir, 'library');

if (fs.existsSync(distDir)) {
  fs.mkdirSync(libraryDir, { recursive: true });
  fs.writeFileSync(path.join(libraryDir, 'index.html'), portalHtml);
  console.log('Generated portal hub at dist/library/index.html');
}
```

- [ ] **Step 5: Run the test and confirm it passes**

Run:

```bash
node --test scripts/build-portal.test.js
```

Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add scripts/build-portal.test.js scripts/build-portal.js
git commit -m "$(cat <<'EOF'
fix: serve the docs hub at /library/ with root-absolute tenant links.

EOF
)"
```

---

### Task 2: Add Vercel static-site config

**Files:**
- Create: `scripts/vercel-config.test.js`
- Create: `vercel.json`
- Modify: `package.json` (add `engines` next to `"type": "module"`)
- Modify: `.gitignore` (after the Build Output block)

**Interfaces:**
- Consumes: Task 1 hub output paths (`/library/`, `/wcah/`)
- Produces: `vercel.json` with `buildCommand` `npm run build`, `outputDirectory` `dist`, one non-permanent redirect `/` → `/wcah/`; `package.json` `"engines": { "node": "22.x" }`; `.gitignore` entry `.vercel/`

- [ ] **Step 1: Write the failing config test**

Create `scripts/vercel-config.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

test('vercel.json builds static dist and redirects / to /wcah/', () => {
  const config = JSON.parse(
    readFileSync(path.join(repoRoot, 'vercel.json'), 'utf8'),
  );
  assert.equal(config.buildCommand, 'npm run build');
  assert.equal(config.outputDirectory, 'dist');
  assert.equal('framework' in config, false);
  assert.equal('rewrites' in config, false);
  assert.deepEqual(config.redirects, [
    { source: '/', destination: '/wcah/', permanent: false },
  ]);
});

test('package.json pins Node 22.x for Vercel', () => {
  const pkg = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  assert.deepEqual(pkg.engines, { node: '22.x' });
});

test('.gitignore ignores Vercel link metadata', () => {
  const gitignore = readFileSync(path.join(repoRoot, '.gitignore'), 'utf8');
  assert.match(gitignore, /^\.vercel\/$/m);
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run:

```bash
node --test scripts/vercel-config.test.js
```

Expected: FAIL with `ENOENT` for `vercel.json` (and missing `engines` / `.vercel/` once that file exists).

- [ ] **Step 3: Add `vercel.json`**

Create `vercel.json` at the repo root with exactly:

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "redirects": [
    {
      "source": "/",
      "destination": "/wcah/",
      "permanent": false
    }
  ]
}
```

Do not add `framework`, `rewrites`, or serverless `builds`.

- [ ] **Step 4: Pin Node 22 in `package.json`**

Add this field after `"type": "module"`:

```json
  "engines": {
    "node": "22.x"
  },
```

Do not add other `package.json` keys.

- [ ] **Step 5: Ignore `.vercel/`**

In `.gitignore`, add this immediately after the existing Build Output block (after `*.tsbuildinfo`):

```gitignore
# Vercel CLI link metadata
.vercel/
```

- [ ] **Step 6: Run the test and confirm it passes**

Run:

```bash
node --test scripts/vercel-config.test.js scripts/build-portal.test.js
```

Expected: PASS (all tests from Tasks 1 and 2).

- [ ] **Step 7: Commit**

```bash
git add vercel.json package.json .gitignore scripts/vercel-config.test.js
git commit -m "$(cat <<'EOF'
chore: add Vercel static build config with wcah as the root redirect.

EOF
)"
```

---

### Task 3: Verify a full local production build

**Files:**
- Test: local `dist/` output from `npm run build` (gitignored; do not commit)

**Interfaces:**
- Consumes: Task 1 `scripts/build-portal.js`, existing `npm run build` (`pagenary build --all && node scripts/build-portal.js`)
- Produces: `dist/wcah/index.html`, `dist/library/index.html` with `href="/wcah/"`, no hub at `dist/index.html`

- [ ] **Step 1: Run the full build**

Run:

```bash
npm run build
```

Expected: command exits 0. Log includes `Generated portal hub at dist/library/index.html`. Pagenary writes `dist/wcah/`, `dist/oms-v0/`, `dist/oms-v1/`, `dist/oms-v2/`.

- [ ] **Step 2: Assert the spec's local checks**

Run:

```bash
test -f dist/wcah/index.html
test -f dist/library/index.html
test -f dist/oms-v0/index.html
test -f dist/oms-v1/index.html
test -f dist/oms-v2/index.html
grep -q 'href="/wcah/"' dist/library/index.html
! grep -q 'href="./wcah/"' dist/library/index.html
if [ -f dist/index.html ]; then
  echo "FAIL: dist/index.html exists; root must be the Vercel redirect, not a hub file"
  exit 1
fi
echo "local build checks passed"
```

Expected: `local build checks passed`. If `dist/index.html` exists from an older local build, delete only that leftover file (`rm dist/index.html`) and re-run the checks — do not delete tenant folders. A Vercel build starts with a clean output, so a leftover local root index is not what production will publish; still do not deploy while the generator is writing a root hub.

- [ ] **Step 3: Commit only if Step 2 required a script fix**

If the checks passed with no further code changes, do not create an empty commit. If `build-portal.js` still wrote `dist/index.html`, fix it (Task 1 write block) and amend is forbidden — make a new commit:

```bash
git add scripts/build-portal.js
git commit -m "$(cat <<'EOF'
fix: stop writing a root hub so Vercel can redirect / to /wcah/.

EOF
)"
```

---

### Task 4: Link the GitHub repo and deploy production

**Files:**
- None in git (`.vercel/` is gitignored). Do not commit link metadata.

**Interfaces:**
- Consumes: Tasks 1–3 committed on `master`; git remote `https://github.com/Standard-Pentest/wcah-oms-library.git`
- Produces: a public production `*.vercel.app` URL; git integration on `master`

- [ ] **Step 1: Check CLI, auth, and current link state**

Run (do not run `vercel link` or `vercel project inspect` yet):

```bash
git remote get-url origin
cat .vercel/project.json 2>/dev/null || cat .vercel/repo.json 2>/dev/null || echo "not linked"
command -v vercel || npx --yes vercel --version
printenv VERCEL_TOKEN >/dev/null && echo "VERCEL_TOKEN is set" || echo "VERCEL_TOKEN unset"
npx --yes vercel whoami
npx --yes vercel teams list --format json
```

Expected:

- origin is `https://github.com/Standard-Pentest/wcah-oms-library.git`
- not linked, unless `.vercel/` already exists — then use that `orgId` and skip the team question
- `whoami` prints a username. If it fails with authentication required, run `npx --yes vercel login`, wait for the user to finish the browser flow, then re-run `whoami`. If login is impossible, stop and ask the user for a token from https://vercel.com/account/tokens. Export it as `VERCEL_TOKEN`. Do not pass `--token`.

- [ ] **Step 2: Choose the team**

If `vercel teams list` returns more than one team, **stop** and ask the user which team slug to use. Do not guess.

If there is only one team (or a personal account), use that slug as `<team-slug>` in every later command.

If already linked, do not re-ask; read `orgId` from `.vercel/project.json` or `.vercel/repo.json`.

- [ ] **Step 3: Link the GitHub repo**

Tell the user: linking this project to `<team>` on Vercel will create or attach a Vercel project and enable automatic deployments on future git pushes.

Then run:

```bash
npx --yes vercel link --repo --scope <team-slug> -y
```

Expected: `.vercel/repo.json` (or `project.json`) exists and is gitignored. Confirm with `git check-ignore -v .vercel/repo.json .vercel/project.json` — the files must be ignored.

- [ ] **Step 4: Confirm production branch is `master`**

Run:

```bash
npx --yes vercel project inspect --scope <team-slug>
```

Expected: git connection points at `Standard-Pentest/wcah-oms-library` and the production branch is `master`. If inspect is interactive or does not show the branch, open the project in the Vercel dashboard and set Production Branch to `master`. **Do not deploy until the production branch is `master`.**

- [ ] **Step 5: Deploy production**

Push committed Tasks 1–3 to `origin/master` only if those commits are not already on the remote (`git status` should be clean except untracked `.aiwg/` / `.cursor/` scaffolding — do not add those). Then:

```bash
npx --yes vercel deploy --prod -y --no-wait --scope <team-slug>
```

Expected: CLI prints a deployment URL immediately. Do not wait for the build in the foreground.

- [ ] **Step 6: Inspect the deployment and return the URL**

Run:

```bash
npx --yes vercel inspect <deployment-url> --scope <team-slug>
```

If the build is still running, wait and inspect again. On failure, run:

```bash
npx --yes vercel inspect <deployment-url> --logs --scope <team-slug>
```

Do not curl or fetch the URL. Give the user the production `*.vercel.app` URL and ask them to confirm in a browser:

- `/` ends on the Hall of Records (`/wcah/`)
- `/library/` shows the hub
- `/oms-v0/`, `/oms-v1/`, `/oms-v2/` still load

If inspect reports an error, do not announce a working production URL. Keep the previous deployment live (Vercel default) and fix from the logs.

- [ ] **Step 7: Commit only if a repo file changed during deploy**

Link metadata must not be committed. There is usually nothing to commit after this task. If `vercel.json` needed a correction, commit that fix with a new message, then redeploy `--prod`.
