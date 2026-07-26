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
 * deployment.
 *
 * **Defaulting the glob is not the same as applying the migrations**, and conflating the two
 * caused a failed production deploy. Once the glob resolved correctly, `migrationsRun` — which
 * defaulted to `true` and had been a silent no-op everywhere — suddenly applied 53 migrations
 * to a database whose schema already existed, and `InitialCreate` failed on
 * `relation "userRoles" already exists`. `POSTGRES_MIGRATIONS_RUN` now defaults to **false**;
 * see the comment on it in `configs.ts`. Applying migrations is a deliberate step:
 * `npm run migration:run`.
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
 * Count the compiled migrations a glob actually matches.
 *
 * Used for the startup report below rather than for a decision. It is deliberately **not**
 * fatal: a diagnostic that can take the service down is worse than the thing it diagnoses.
 * An earlier version threw here, and that is a mistake worth not repeating — a config typo
 * would have blocked every deploy.
 */
function countMigrations(glob: string): number {
  // Everything up to the first wildcard is a literal path. `path.dirname` is wrong here:
  // the literal part already ends at the separator, so dirname climbs one level too high
  // (`…/infrastructure/migrations/` → `…/infrastructure`) and counts the wrong directory.
  const wildcardAt = glob.indexOf('*');
  const literalPath =
    wildcardAt === -1 ? path.dirname(glob) : glob.slice(0, wildcardAt);
  const directory = literalPath.replace(/[\\/]+$/, '');

  try {
    return fs.readdirSync(directory).filter((entry) => entry.endsWith('.js'))
      .length;
  } catch {
    return 0;
  }
}

/**
 * Say out loud what the migration configuration resolved to.
 *
 * The original defect was never the value — it was that **nothing reported it**. A garbage
 * glob produced zero migrations, a created bookkeeping table, and a clean startup log over
 * an empty database. One log line at boot removes that whole class of confusion, and unlike
 * a thrown error it cannot cost availability.
 */
const DISCOVERED_MIGRATIONS = countMigrations(MIGRATIONS_GLOB);

if (configs.postgres.migrationsRun) {
  console.log(
    `[data.source] POSTGRES_MIGRATIONS_RUN=true — applying ${DISCOVERED_MIGRATIONS} ` +
      `migration(s) from ${MIGRATIONS_GLOB} on startup`,
  );
} else {
  console.log(
    `[data.source] POSTGRES_MIGRATIONS_RUN=false — ${DISCOVERED_MIGRATIONS} migration(s) ` +
      `discovered at ${MIGRATIONS_GLOB} but NOT applied. Run "npm run migration:run" to apply.`,
  );
}

/**
 * How long to keep retrying the database before giving up.
 *
 * TypeORM's Nest integration defaults to **10 attempts, 3 s apart**, and it does that retry
 * loop *inside* `NestFactory.create()` — before the HTTP server is created. So an
 * unreachable database does not produce an error: it produces a process that is alive,
 * healthy-looking, and never listening.
 *
 * On Cloud Run that is the worst possible shape. The platform's only startup contract is
 * "listen on $PORT", so the result is:
 *
 *   ERROR: The user-provided container failed to start and listen on the port defined
 *   provided by the PORT=8080 environment variable within the allocated timeout.
 *
 * — a generic message, 4m40s after the deploy started, naming neither the database nor the
 * connection error. Reproduced locally by pointing DATABASE_URL at a closed port: the
 * process stayed up, logged "Unable to connect to the database. Retrying (1)…", and never
 * opened the port.
 *
 * Five attempts at 2 s fails in about ten seconds instead. The deploy still fails — it must,
 * because a service with no database cannot serve — but it fails *fast*, and `main.ts`
 * catches the rejection and logs `FATAL` with the real reason. Cloud Run keeps the previous
 * revision serving either way, so failing fast costs nothing and buys a usable error.
 */
const DB_RETRY_ATTEMPTS = 5;
const DB_RETRY_DELAY_MS = 2_000;

/**
 * Nest-only connection options, applied at the `TypeOrmModule.forRoot` call site.
 *
 * Deliberately not folded into `postgresOptions`: they are read by `@nestjs/typeorm`, not by
 * `DataSource`, so putting them here would only typecheck behind a cast and would mislead
 * anyone using this data source from the CLI.
 */
export const nestRetryOptions = {
  retryAttempts: DB_RETRY_ATTEMPTS,
  retryDelay: DB_RETRY_DELAY_MS,
  // Log every attempt with its error. Without this the retries are silent, and the only
  // symptom is a startup timeout that names nothing.
  verboseRetryLog: true,
} as const;

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
