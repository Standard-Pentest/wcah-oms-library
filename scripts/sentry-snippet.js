// Builds and injects the Sentry Loader snippet into static HTML pages.

export const DEFAULT_SENTRY_DSN =
  'https://0e75bfeb955326e2442933f452a6f6a9@o4511948091883520.ingest.us.sentry.io/4511948627509248';

export const SENTRY_MARKER = 'data-wcah-sentry';

export function resolveSentryDsn(env = process.env) {
  if (Object.prototype.hasOwnProperty.call(env, 'SENTRY_DSN')) {
    return env.SENTRY_DSN || '';
  }
  return DEFAULT_SENTRY_DSN;
}

export function publicKeyFromDsn(dsn) {
  const match = /^https:\/\/([^@]+)@/i.exec(dsn);
  if (!match) {
    throw new Error('Invalid Sentry DSN: missing public key');
  }
  return match[1];
}

export function sentrySnippetHtml({
  dsn = resolveSentryDsn(),
  release = `wcah-docs-library@${process.env.npm_package_version || '1.0.0'}`,
} = {}) {
  if (!dsn) {
    return '';
  }

  const publicKey = publicKeyFromDsn(dsn);
  return `<!-- wcah-sentry -->
<script ${SENTRY_MARKER}>
  window.sentryOnLoad = function () {
    Sentry.init({
      dsn: ${JSON.stringify(dsn)},
      release: ${JSON.stringify(release)},
      environment: location.hostname === "localhost" ? "development" : "production",
      tracesSampleRate: location.hostname === "localhost" ? 1.0 : 0.2,
      tracePropagationTargets: ["localhost", /^https:\\/\\/.*\\.vercel\\.app/],
    });
  };
</script>
<script src="https://js.sentry-cdn.com/${publicKey}.min.js" crossorigin="anonymous" ${SENTRY_MARKER}></script>
`;
}

export function injectSentryIntoHtml(html, snippet = sentrySnippetHtml()) {
  if (!snippet || html.includes(SENTRY_MARKER)) {
    return html;
  }

  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${snippet}</body>`);
  }

  if (/<\/html>/i.test(html)) {
    return html.replace(/<\/html>/i, `${snippet}</html>`);
  }

  return `${html}\n${snippet}`;
}
