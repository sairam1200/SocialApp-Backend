import * as fs from 'fs';
import * as path from 'path';
import configs from '../../configs';
import { DataSource, DataSourceOptions } from 'typeorm';

/**
 * TypeORM data source.
 *
 * Two defects were fixed here, both of the same kind — configuration that
 * `configs.ts` validates and exposes but which nothing read:
 *
 * 1. **Connection settings were ignored.** Only `DATABASE_URL` was used, so
 *    `POSTGRES_HOST`, `_PORT`, `_USERNAME`, `_PASSWORD` and `_DATABASE` were
 *    validated at boot (with `POSTGRES_PASSWORD` even rejecting an empty string)
 *    and then discarded. Setting them appeared to work and silently did nothing.
 *
 * 2. **TLS was hardcoded.** `ssl: { rejectUnauthorized: false }` was
 *    unconditional, so `POSTGRES_SSL_REJECTUNAUTHORIZED` had no effect and
 *    certificate verification could not be enabled at all. It also made
 *    connecting to a non-TLS Postgres impossible, which is why the service could
 *    not run against a local database — "The server does not support SSL
 *    connections".
 *
 * Production behaviour is deliberately preserved: `DATABASE_URL` still takes
 * precedence, and TLS remains on by default.
 */

const isLocalHost = (host?: string): boolean =>
  !!host &&
  ['localhost', '127.0.0.1', '::1', 'host.docker.internal'].includes(host);

/**
 * Resolve the TLS setting.
 *
 * Managed Postgres (Neon, Cloud SQL) requires TLS, so it stays on by default —
 * flipping that default would break production. It is disabled only when the
 * target is plainly local, or when `POSTGRES_SSL=false` says so explicitly.
 *
 * `rejectUnauthorized` now honours `POSTGRES_SSL_REJECTUNAUTHORIZED`. Note the
 * config default is `false`, which accepts any certificate and therefore does not
 * protect against an active MITM — set it to `true` in production (finding M7).
 */
function resolveSsl(): boolean | { rejectUnauthorized: boolean } {
  const explicit = process.env.POSTGRES_SSL;
  if (explicit !== undefined) {
    if (explicit.toLowerCase() === 'false') return false;
    return { rejectUnauthorized: !!configs.postgres.ssl?.rejectUnauthorized };
  }

  // No DATABASE_URL and a local host means a developer's own Postgres, which
  // typically has TLS disabled.
  if (!configs.postgres.url && isLocalHost(configs.postgres.host)) {
    return false;
  }

  // A localhost DATABASE_URL is still local.
  if (configs.postgres.url) {
    try {
      const { hostname } = new URL(configs.postgres.url);
      if (isLocalHost(hostname)) return false;
    } catch {
      // Unparseable URL: fall through and keep TLS on rather than guessing.
    }
  }

  return { rejectUnauthorized: !!configs.postgres.ssl?.rejectUnauthorized };
}

/**
 * Prefer `DATABASE_URL` when present — that is what production sets, and changing
 * the precedence would repoint a live service. Fall back to the discrete
 * `POSTGRES_*` variables, which previously did nothing.
 */
const connection: Partial<DataSourceOptions> = configs.postgres.url
  ? { url: configs.postgres.url }
  : {
      host: configs.postgres.host,
      port: configs.postgres.port,
      username: configs.postgres.username,
      password: configs.postgres.password,
      database: configs.postgres.database,
    };

/**
 * Resolve a glob that is expressed relative to this compiled directory.
 *
 * `POSTGRES_ENTITIES` and `POSTGRES_MIGRATIONS` are optional in `configs.ts`, and the
 * previous `__dirname + configs.postgres.migrations` concatenated `undefined` straight
 * into the path when either was unset. The result is a directory that cannot exist
 * (`…/persistenceundefined`), and the failure is **silent**: TypeORM finds zero
 * migrations, creates the bookkeeping `migrations` table anyway, and the application
 * reports a successful start against a completely empty database.
 *
 * That was observed on a fresh environment — 1 table where 42 were expected, and nothing
 * in the log to say so. So the defaults live here rather than being required of every
 * deployment, and an unset variable now yields a working database instead of an empty one.
 *
 * Both defaults are **recursive** on purpose. A non-recursive `*.entity.js` misses
 * entities in subdirectories, and the symptom is a runtime
 * `Entity metadata for UserFollow#follower was not found` rather than anything pointing
 * at a glob.
 */
function resolveGlob(configured: string | undefined, fallback: string): string {
  return path.resolve(__dirname + (configured ?? fallback));
}

const ENTITIES_GLOB = resolveGlob(
  configs.postgres.entities,
  '/../../domain/entities/**/*.entity.js',
);
const MIGRATIONS_GLOB = resolveGlob(
  configs.postgres.migrations,
  '/../migrations/*.js',
);

/**
 * Fail fast when the migration glob matches nothing.
 *
 * A correct default fixes the *unset* case, but a wrong value fails the same silent way:
 * zero migrations applied, a `migrations` table created, and a clean startup log over an
 * empty database. The first symptom is then a confusing "relation does not exist" from
 * whichever query happens to run first, arbitrarily far from the cause.
 *
 * Only checked when `migrationsRun` is on. When it is off, an empty glob is a legitimate
 * configuration — someone is applying migrations out of band.
 */
function assertMigrationsDiscoverable(glob: string): void {
  if (!configs.postgres.migrationsRun) return;

  // Everything up to the first wildcard is a literal directory path.
  const wildcardAt = glob.indexOf('*');
  const literalPath = wildcardAt === -1 ? glob : glob.slice(0, wildcardAt);
  const directory = path.dirname(literalPath);

  let hasMigrations = false;
  try {
    hasMigrations = fs
      .readdirSync(directory)
      .some((entry) => entry.endsWith('.js'));
  } catch {
    // Unreadable or missing directory — treated the same as empty below.
  }

  if (!hasMigrations) {
    throw new Error(
      `POSTGRES_MIGRATIONS resolved to "${glob}", which contains no compiled ` +
        `migrations. Starting with POSTGRES_MIGRATIONS_RUN=true would report success ` +
        `against an empty database. Run "npm run build" first, or point ` +
        `POSTGRES_MIGRATIONS at the compiled migrations directory ` +
        `(default: /../migrations/*.js).`,
    );
  }
}

assertMigrationsDiscoverable(MIGRATIONS_GLOB);

export const postgresOptions: DataSourceOptions = {
  type: 'postgres',
  ...connection,
  synchronize: configs.postgres.synchronize,
  entities: [ENTITIES_GLOB],
  migrations: [MIGRATIONS_GLOB],
  logging: configs.postgres.logging,
  migrationsRun: configs.postgres.migrationsRun,
  ssl: resolveSsl(),
} as DataSourceOptions;

const dataSource = new DataSource(postgresOptions);
export default dataSource;
