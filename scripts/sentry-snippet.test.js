import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SENTRY_DSN,
  SENTRY_MARKER,
  injectSentryIntoHtml,
  publicKeyFromDsn,
  resolveSentryDsn,
  sentrySnippetHtml,
} from './sentry-snippet.js';

test('extracts the public key from a DSN', () => {
  assert.equal(
    publicKeyFromDsn(DEFAULT_SENTRY_DSN),
    '0e75bfeb955326e2442933f452a6f6a9',
  );
  assert.throws(() => publicKeyFromDsn('not-a-dsn'), /Invalid Sentry DSN/);
});

test('uses the project DSN unless SENTRY_DSN is set', () => {
  assert.equal(resolveSentryDsn({}), DEFAULT_SENTRY_DSN);
  assert.equal(resolveSentryDsn({ SENTRY_DSN: '' }), '');
  assert.equal(
    resolveSentryDsn({ SENTRY_DSN: 'https://abc@o0.ingest.sentry.io/1' }),
    'https://abc@o0.ingest.sentry.io/1',
  );
});

test('builds a loader snippet with sentryOnLoad before the CDN script', () => {
  const html = sentrySnippetHtml({
    dsn: DEFAULT_SENTRY_DSN,
    release: 'wcah-docs-library@1.0.0',
  });
  const loaderIndex = html.indexOf('js.sentry-cdn.com/0e75bfeb955326e2442933f452a6f6a9.min.js');
  const onLoadIndex = html.indexOf('window.sentryOnLoad');
  assert.notEqual(onLoadIndex, -1);
  assert.notEqual(loaderIndex, -1);
  assert.equal(onLoadIndex < loaderIndex, true);
  assert.match(html, new RegExp(SENTRY_MARKER));
  assert.match(html, /tracesSampleRate/);
});

test('returns an empty snippet when DSN is disabled', () => {
  assert.equal(sentrySnippetHtml({ dsn: '' }), '');
});

test('injects the snippet before </body> and is idempotent', () => {
  const snippet = sentrySnippetHtml({ dsn: DEFAULT_SENTRY_DSN });
  const once = injectSentryIntoHtml('<html><body><p>hi</p></body></html>', snippet);
  assert.match(once, /<\/script>\s*<\/body>/);
  assert.match(once, /js\.sentry-cdn\.com/);
  const twice = injectSentryIntoHtml(once, snippet);
  assert.equal(twice, once);
});

test('appends the snippet when the page has no body tag', () => {
  const snippet = sentrySnippetHtml({ dsn: DEFAULT_SENTRY_DSN });
  const result = injectSentryIntoHtml('<p>fragment</p>', snippet);
  assert.match(result, /<p>fragment<\/p>/);
  assert.match(result, /js\.sentry-cdn\.com/);
});
