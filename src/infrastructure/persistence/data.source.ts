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

export const postgresOptions: DataSourceOptions = {
  type: 'postgres',
  ...connection,
  synchronize: configs.postgres.synchronize,
  entities: [path.resolve(__dirname + configs.postgres.entities)],
  migrations: [path.resolve(__dirname + configs.postgres.migrations)],
  logging: configs.postgres.logging,
  migrationsRun: configs.postgres.migrationsRun,
  ssl: resolveSsl(),
} as DataSourceOptions;

const dataSource = new DataSource(postgresOptions);
export default dataSource;
