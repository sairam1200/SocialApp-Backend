import * as fs from 'fs';
import * as path from 'path';

/**
 * Security headers.
 *
 * The audit recorded their complete absence, and specifically that this is what made the
 * frontend's `localStorage` token storage exploitable: without a CSP, any injected script can
 * read the token and post it anywhere it likes.
 *
 * Pinned against the source because the alternative is booting the whole application to read
 * one response header — and the property that matters is structural: *which* directives are
 * emitted, and that Helmet's browser defaults are not silently merged back in.
 *
 * Verified once against a real running server in production mode:
 *
 *   Content-Security-Policy: default-src 'none';frame-ancestors 'none';base-uri 'none';form-action 'none'
 *   Strict-Transport-Security: max-age=63072000; includeSubDomains
 *   X-Frame-Options: DENY
 *   Referrer-Policy: no-referrer
 *   X-Content-Type-Options: nosniff
 */

const MAIN_PATH = path.join(__dirname, './main.ts');
const source = fs.readFileSync(MAIN_PATH, 'utf-8');

/** The helmet(...) call and its options. */
function helmetConfig(): string {
  const start = source.indexOf('app.use(\n    helmet(');
  const from = start === -1 ? source.indexOf('helmet(') : start;
  expect(from).toBeGreaterThan(-1);
  return source.slice(from, source.indexOf('app.use(cookieParser())'));
}

/**
 * The same slice with comments removed.
 *
 * Needed because the comments here legitimately *discuss* the values being forbidden — the
 * note explaining what Helmet's defaults would have added names `'unsafe-inline'` verbatim.
 * Matching that would assert on the explanation rather than the configuration.
 */
function helmetCode(): string {
  return helmetConfig()
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join('\n');
}

describe('helmet is applied', () => {
  it('is imported and used', () => {
    expect(source).toMatch(/import helmet from 'helmet'/);
    expect(source).toMatch(/app\.use\(\s*helmet\(/);
  });

  it('runs before the routes it protects', () => {
    // A header middleware registered after the router would not apply to those routes.
    expect(source.indexOf('helmet(')).toBeLessThan(
      source.indexOf('app.use(cookieParser())'),
    );
  });
});

describe('content security policy', () => {
  it('disables Helmet defaults so the policy is a real whitelist', () => {
    // The reason this test exists. Helmet merges `directives` into its browser-oriented
    // defaults unless told otherwise, and the first version of this config emitted
    // `default-src 'none'` alongside `script-src 'self'`, `font-src 'self' https: data:` and
    // `style-src … 'unsafe-inline'` — a deny-all with holes punched in it for content a JSON
    // API never serves. Caught by reading the emitted header, not by reading the code.
    expect(helmetConfig()).toContain('useDefaults: false');
  });

  it('denies everything by default', () => {
    const config = helmetConfig();
    expect(config).toMatch(/defaultSrc:\s*\["'none'"\]/);
    expect(config).toMatch(/frameAncestors:\s*\["'none'"\]/);
    expect(config).toMatch(/baseUri:\s*\["'none'"\]/);
    expect(config).toMatch(/formAction:\s*\["'none'"\]/);
  });

  it('never allows inline scripts or styles', () => {
    // If either of these appears the policy has stopped being a defence.
    const config = helmetCode();
    expect(config).not.toContain("'unsafe-inline'");
    expect(config).not.toContain("'unsafe-eval'");
  });

  it('is disabled outside production, deliberately', () => {
    // Swagger and Scalar are mounted in non-production and both need inline scripts and
    // styles. Loosening the *production* policy to accommodate a dev-only tool would be the
    // wrong trade — in production those routes do not exist at all.
    expect(helmetConfig()).toMatch(/configs\.env === 'production'/);
  });
});

describe('transport and framing', () => {
  it('sets HSTS with a long max-age and subdomains', () => {
    const config = helmetConfig();
    expect(config).toMatch(/maxAge:\s*63_072_000/);
    expect(config).toMatch(/includeSubDomains:\s*true/);
  });

  it('does NOT enable HSTS preload', () => {
    // Submitting to the browser preload list is effectively irreversible, and that belongs to
    // whoever owns the domain — not to a framework default.
    expect(helmetConfig()).toMatch(/preload:\s*false/);
  });

  it('denies framing outright rather than allowing same-origin', () => {
    // Helmet's default is SAMEORIGIN. There is no page here to frame, including by us.
    expect(helmetConfig()).toMatch(/frameguard:\s*\{\s*action:\s*'deny'\s*\}/);
  });

  it('sends no referrer', () => {
    // A referrer is meaningless for an API and can leak a request path to a third party.
    expect(helmetConfig()).toMatch(/policy:\s*'no-referrer'/);
  });
});

describe('cross-origin resource policy', () => {
  it('is disabled so the frontend can read responses', () => {
    // Helmet defaults CORP to `same-origin`, which would block the frontend — a different
    // origin — from reading any response. CORS above governs that explicitly and is the right
    // place for the decision; leaving both on would mean two mechanisms disagreeing.
    expect(helmetConfig()).toMatch(/crossOriginResourcePolicy:\s*false/);
  });
});
