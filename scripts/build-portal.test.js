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
