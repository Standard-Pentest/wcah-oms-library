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
import { injectSentryIntoDist } from './inject-sentry.js';
import { DEFAULT_SENTRY_DSN, sentrySnippetHtml } from './sentry-snippet.js';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const scriptPath = path.join(repoRoot, 'scripts', 'inject-sentry.js');

test('injects Sentry into nested dist HTML and skips a second pass', () => {
  const cwd = mkdtempSync(path.join(tmpdir(), 'wcah-sentry-'));
  try {
    const distDir = path.join(cwd, 'dist');
    mkdirSync(path.join(distDir, 'wcah'), { recursive: true });
    mkdirSync(path.join(distDir, 'library'), { recursive: true });
    writeFileSync(
      path.join(distDir, 'wcah', 'index.html'),
      '<!doctype html><html><body><h1>Hall</h1></body></html>',
    );
    writeFileSync(
      path.join(distDir, 'library', 'index.html'),
      '<!doctype html><html><body><h1>Hub</h1></body></html>',
    );

    const snippet = sentrySnippetHtml({ dsn: DEFAULT_SENTRY_DSN });
    assert.equal(injectSentryIntoDist(distDir, snippet), 2);
    assert.equal(injectSentryIntoDist(distDir, snippet), 0);

    const tenant = readFileSync(path.join(distDir, 'wcah', 'index.html'), 'utf8');
    const hub = readFileSync(path.join(distDir, 'library', 'index.html'), 'utf8');
    assert.match(tenant, /js\.sentry-cdn\.com\/0e75bfeb955326e2442933f452a6f6a9\.min\.js/);
    assert.match(hub, /window\.sentryOnLoad/);
    assert.match(hub, /<h1>Hub<\/h1>/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('does nothing when dist is missing', () => {
  const cwd = mkdtempSync(path.join(tmpdir(), 'wcah-sentry-missing-'));
  try {
    assert.equal(injectSentryIntoDist(path.join(cwd, 'dist')), 0);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('CLI injects HTML under the current working directory dist/', () => {
  const cwd = mkdtempSync(path.join(tmpdir(), 'wcah-sentry-cli-'));
  try {
    mkdirSync(path.join(cwd, 'dist'));
    writeFileSync(
      path.join(cwd, 'dist', 'index.html'),
      '<html><body>ok</body></html>',
    );
    execFileSync(process.execPath, [scriptPath], { cwd, encoding: 'utf8' });
    const html = readFileSync(path.join(cwd, 'dist', 'index.html'), 'utf8');
    assert.match(html, /data-wcah-sentry/);
    assert.equal(existsSync(path.join(cwd, 'dist', 'sentry-assets')), false);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
