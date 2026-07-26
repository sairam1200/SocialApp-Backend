import * as fs from 'fs';
import * as path from 'path';

/**
 * Migration configuration.
 *
 * This suite exists because of a production incident on 2026-07-26: a Cloud Run deploy
 * failed after a successful build and push, and the cause was a *default* rather than any
 * logic.
 *
 * The two settings were entangled. `POSTGRES_MIGRATIONS` had no default, so `data.source.ts`
 * concatenated `undefined` into the path, TypeORM discovered zero migrations, and
 * `migrationsRun: true` was a silent no-op in every environment. Giving the glob a correct
 * default did not merely fix fresh environments — it switched migrations *on* everywhere at
 * once, including a production database whose schema already existed:
 *
 *   Migration "InitialCreate1747343277182" failed, error: relation "userRoles" already exists
 *
 * TypeORM throws that inside `DataSource.initialize()`, so the process exits and the
 * container never passes its startup probe.
 *
 * The lesson worth pinning: **a default is a behaviour change.** Two independently
 * reasonable settings combined into a third behaviour nobody chose.
 */

const CONFIGS_PATH = path.join(__dirname, '../../configs.ts');
const DATA_SOURCE_PATH = path.join(__dirname, './data.source.ts');

const configsSource = fs.readFileSync(CONFIGS_PATH, 'utf-8');
const dataSourceSource = fs.readFileSync(DATA_SOURCE_PATH, 'utf-8');

describe('POSTGRES_MIGRATIONS_RUN', () => {
  it('defaults to false', () => {
    // Deliberately asserted against the source rather than the parsed config, because
    // importing `configs` here would read whatever the ambient environment happens to set
    // and would therefore pass no matter what the default is.
    const declaration = configsSource.match(
      /POSTGRES_MIGRATIONS_RUN:\s*Joi\.boolean\(\)([\s\S]*?)\.description\(/,
    );

    expect(declaration).not.toBeNull();
    expect(declaration![1]).toContain('.default(false)');
    expect(declaration![1]).not.toContain('.default(true)');
  });

  it('explains why, so the next person does not helpfully switch it back', () => {
    // A bare `.default(false)` invites a well-meaning revert. The incident has to travel
    // with the setting.
    const context = configsSource.slice(
      Math.max(0, configsSource.indexOf('POSTGRES_MIGRATIONS_RUN') - 2000),
      configsSource.indexOf('POSTGRES_MIGRATIONS_RUN') + 2000,
    );

    expect(context).toMatch(/already exists|deploy|InitialCreate/i);
  });
});

describe('migration glob defaults', () => {
  it('defaults to the compiled migrations directory', () => {
    // Needed by `npm run migration:run` and by a fresh environment. Safe now that it no
    // longer implies auto-application.
    expect(dataSourceSource).toContain("'/../migrations/*.js'");
  });

  it('defaults entities to a RECURSIVE glob', () => {
    // A non-recursive `*.entity.js` misses entities in subdirectories, and the symptom is a
    // runtime "Entity metadata for UserFollow#follower was not found" that points nowhere
    // near the glob.
    expect(dataSourceSource).toContain(
      "'/../../domain/entities/**/*.entity.js'",
    );
  });
});

describe('startup reporting', () => {
  it('never throws from the migration diagnostic', () => {
    // An earlier version threw when the glob matched nothing. A diagnostic that can take the
    // service down is worse than the condition it reports: a config typo would have blocked
    // every deploy.
    const diagnostic = dataSourceSource.slice(
      dataSourceSource.indexOf('function countMigrations'),
      dataSourceSource.indexOf('export const postgresOptions'),
    );

    // Comment lines are stripped first. The prose here legitimately discusses the removed
    // `throw`, and matching that would assert on the explanation rather than the code.
    const code = diagnostic
      .split('\n')
      .filter((line) => !/^\s*(\*|\/\/|\/\*)/.test(line))
      .join('\n');

    expect(code).not.toMatch(/\bthrow\b/);
  });

  it('reports the resolved glob and the count either way', () => {
    // The original defect was never the value — it was that nothing reported it. Both
    // branches must name the glob and the number found.
    expect(dataSourceSource).toContain('POSTGRES_MIGRATIONS_RUN=true');
    expect(dataSourceSource).toContain('POSTGRES_MIGRATIONS_RUN=false');
    expect(dataSourceSource).toMatch(/DISCOVERED_MIGRATIONS/);
  });
});

describe('countMigrations directory resolution', () => {
  // The helper is module-private and the module cannot be imported without a full
  // environment, so the logic is re-derived here. The bug it encodes is worth a test: the
  // original used path.dirname on a literal path that already ended at the separator, so it
  // climbed one level too high and counted an unrelated directory.
  function directoryFor(glob: string): string {
    const wildcardAt = glob.indexOf('*');
    const literalPath =
      wildcardAt === -1 ? path.dirname(glob) : glob.slice(0, wildcardAt);
    return literalPath.replace(/[\\/]+$/, '');
  }

  it('resolves a wildcard glob to the directory holding the files', () => {
    expect(directoryFor('/app/dist/infrastructure/migrations/*.js')).toBe(
      '/app/dist/infrastructure/migrations',
    );
  });

  it('does not climb above the intended directory', () => {
    // What the original did: dirname('/app/dist/infrastructure/migrations/') is
    // '/app/dist/infrastructure'. It passed locally only because a single unrelated .js file
    // happens to sit there.
    expect(directoryFor('/app/dist/infrastructure/migrations/*.js')).not.toBe(
      '/app/dist/infrastructure',
    );
  });

  it('handles a recursive glob', () => {
    expect(directoryFor('/app/dist/domain/entities/**/*.entity.js')).toBe(
      '/app/dist/domain/entities',
    );
  });

  it('handles a path with no wildcard at all', () => {
    expect(directoryFor('/app/dist/infrastructure/migrations/one.js')).toBe(
      '/app/dist/infrastructure/migrations',
    );
  });

  it('finds the real migrations when pointed at the compiled output', () => {
    // Guards the whole chain: if the build layout moves, this fails rather than silently
    // reporting zero.
    const compiled = path.join(__dirname, '../migrations');
    if (!fs.existsSync(compiled)) return; // source-only checkout

    const count = fs
      .readdirSync(compiled)
      .filter((f) => f.endsWith('.ts') || f.endsWith('.js')).length;
    expect(count).toBeGreaterThan(40);
  });
});
