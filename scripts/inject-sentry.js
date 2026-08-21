// Walks dist/**/*.html and injects the Sentry Loader snippet after Pagenary builds.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { injectSentryIntoHtml, sentrySnippetHtml } from './sentry-snippet.js';

export function listHtmlFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) {
    return acc;
  }

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      listHtmlFiles(full, acc);
    } else if (entry.name.endsWith('.html')) {
      acc.push(full);
    }
  }

  return acc;
}

export function injectSentryIntoDist(distDir, snippet = sentrySnippetHtml()) {
  if (!fs.existsSync(distDir) || !snippet) {
    return 0;
  }

  let written = 0;
  for (const file of listHtmlFiles(distDir)) {
    const original = fs.readFileSync(file, 'utf8');
    const next = injectSentryIntoHtml(original, snippet);
    if (next !== original) {
      fs.writeFileSync(file, next);
      written += 1;
    }
  }
  return written;
}

const isCli =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isCli) {
  const distDir = path.resolve(process.cwd(), 'dist');
  const written = injectSentryIntoDist(distDir);
  console.log(`Injected Sentry into ${written} HTML file(s)`);
}
