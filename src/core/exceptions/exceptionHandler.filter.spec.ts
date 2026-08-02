import * as fs from 'fs';
import * as path from 'path';

/**
 * What a 500 response is allowed to say.
 *
 * The unhandled-error branch used to send `err.message` as the client-facing `title`,
 * **including in production**. The stack was correctly withheld and the message was not —
 * which is the half that leaks, because an unhandled error at that point is a TypeORM, driver
 * or programming error:
 *
 *   relation "userRoles" already exists            → internal schema
 *   connect ECONNREFUSED 10.0.0.5:5432             → internal network topology
 *   Cannot read properties of undefined (…)        → internal shape
 *
 * Every one of those went to any caller, unauthenticated included, and none of them tells a
 * user anything they can act on.
 *
 * Asserted against the source rather than by booting the filter: constructing the real
 * `ArgumentsHost`/`Response` pair needs most of Nest, and the property being pinned is
 * structural — *which value reaches `title`*. A behavioural test that stubbed those objects
 * would assert the stub, not the guarantee.
 */

const FILTER_PATH = path.join(__dirname, './exceptionHandler.filter.ts');
const source = fs.readFileSync(FILTER_PATH, 'utf-8');

/** The final branch: everything not recognised by the typed handlers above it. */
function unhandledBranch(): string {
  const marker = source.indexOf('// Unhandled error');
  expect(marker).toBeGreaterThan(-1);
  return source.slice(marker);
}

describe('the unhandled-error branch', () => {
  it('does not put the error message in the client-facing title', () => {
    const branch = unhandledBranch();

    // The regression, precisely: `title: err.message`.
    expect(branch).not.toMatch(/title:\s*err\.message/);
    expect(branch).not.toMatch(/title:\s*err\?\.message/);
  });

  it('uses a fixed, human title instead', () => {
    const branch = unhandledBranch();
    const title = branch.match(/title:\s*'([^']+)'/);

    expect(title).not.toBeNull();
    // Written for a person: takes responsibility and suggests a next step, rather than
    // "Internal Server Error".
    expect(title![1]).toMatch(/our end/i);
    expect(title![1]).toMatch(/try again/i);
  });

  it('attaches a reference the caller can quote', () => {
    // The information is not lost — it moves to the audience that can use it. The frontend
    // renders this verbatim on its error screens, which is what lets someone report a fault
    // without us exposing internals.
    const branch = unhandledBranch();
    expect(branch).toMatch(/reference/);
    expect(branch).toMatch(/randomUUID\(\)/);
  });

  it('logs the real message and stack under that same reference', () => {
    const branch = unhandledBranch();
    const logCall = branch.slice(branch.indexOf('Logger.error'));

    expect(logCall).toMatch(/reference/);
    expect(logCall).toMatch(/originalMessage/);
    expect(logCall).toMatch(/stack/);
  });

  it('withholds detail in production and keeps it outside production', () => {
    // The stack is the developer's, not the user's — but suppressing it in development would
    // make local debugging worse for no gain.
    const branch = unhandledBranch();
    expect(branch).toMatch(/detail:\s*isProduction\s*\?\s*undefined/);
  });

  it('sends a 500 status in the body, not whatever the error claimed', () => {
    // Previously the body carried `err.statusCode || 500` while the header was always 500, so
    // a body could claim 400 on a 500 response — and clients branch on the body.
    const branch = unhandledBranch();
    expect(branch).not.toMatch(/status:\s*err\.statusCode/);
    expect(branch).toMatch(/status:\s*HttpStatus\.INTERNAL_SERVER_ERROR/);
  });
});

describe('deliberate exceptions keep their own messages', () => {
  it('still prefers clientMessage when an ApplicationException sets one', () => {
    // The fix must not flatten every error into the generic message. A thrown
    // ApplicationException is us choosing to explain something, and that wording is the whole
    // point of `clientMessage`.
    expect(source).toContain('getClientTitle');
    expect(source).toMatch(/clientMessage/);
  });

  it('leaves the typed handlers above the fallback intact', () => {
    // Forbidden and NotFound carry meaning a user can act on, and each has its own branch.
    expect(source).toMatch(/HttpStatus\.FORBIDDEN/);
    expect(source).toMatch(/HttpStatus\.NOT_FOUND/);
  });
});
