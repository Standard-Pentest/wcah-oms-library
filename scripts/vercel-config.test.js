import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

test('vercel.json builds static dist and redirects / to /library/ portal hub', () => {
  const config = JSON.parse(
    readFileSync(path.join(repoRoot, 'vercel.json'), 'utf8'),
  );
  assert.equal(config.buildCommand, 'npm run build');
  assert.equal(config.outputDirectory, 'dist');
  assert.equal('framework' in config, false);
  assert.equal('rewrites' in config, false);
  assert.deepEqual(config.redirects, [
    { source: '/', destination: '/library/', permanent: false },
  ]);
});

test('package.json pins Node 22.x for Vercel', () => {
  const pkg = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  assert.deepEqual(pkg.engines, { node: '22.x' });
});

test('package.json injects the Sentry loader into generated HTML', () => {
  const pkg = JSON.parse(
    readFileSync(path.join(repoRoot, 'package.json'), 'utf8'),
  );
  assert.match(pkg.scripts.build, /node scripts\/inject-sentry\.js/);
  assert.equal('build:sentry' in pkg.scripts, false);
  assert.equal('vite' in (pkg.devDependencies || {}), false);
  assert.equal('@sentry/react' in (pkg.dependencies || {}), false);
});

test('.gitignore ignores Vercel link metadata', () => {
  const gitignore = readFileSync(path.join(repoRoot, '.gitignore'), 'utf8');
  assert.match(gitignore, /^\.vercel\/$/m);
});
