import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import configs from '../../configs';

export class BuildInfoModel {
  @ApiProperty({ description: 'Short commit hash, or "unknown"' })
  commit: string;

  @ApiPropertyOptional({
    description: 'Cloud Run revision, when deployed there',
  })
  revision?: string;

  @ApiProperty() environment: string;

  @ApiProperty({ description: 'When this process started' })
  startedOn: string;

  @ApiProperty({ description: 'Seconds since start' })
  uptimeSeconds: number;

  @ApiProperty({ description: 'Node major.minor.patch' })
  runtime: string;
}

/** Fixed at import: the process cannot start twice. */
const STARTED_ON = new Date().toISOString();

/**
 * The commit this process was built from.
 *
 * Resolved from the first of:
 *
 * 1. `BUILD_SHA` — set explicitly by a build that knows its own commit.
 * 2. `K_REVISION` — Cloud Run sets this to the revision name, and
 *    `cloudbuild.yaml` deploys with `--revision-suffix=$SHORT_SHA`, so the
 *    hash is already the last segment. **This means the check works against
 *    the current deployment with no pipeline change at all** — which matters,
 *    because the pipeline is the thing that is not currently reachable.
 * 3. `VERCEL_GIT_COMMIT_SHA` — for completeness; the Node service does not run
 *    on Vercel, but the same helper shape is used on the frontend.
 *
 * Returns `unknown` rather than throwing. A version endpoint that 500s when it
 * cannot identify itself is worse than one that admits it does not know.
 */
export function resolveCommit(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.BUILD_SHA ?? env.COMMIT_SHA ?? env.SHORT_SHA;
  if (explicit) return explicit.slice(0, 12);

  // `gaddr-backend-a1b2c3d` → `a1b2c3d`. Cloud Run revision names are
  // `<service>-<suffix>`, and the suffix is the short SHA.
  const revision = env.K_REVISION;
  if (revision) {
    const suffix = revision.split('-').pop();
    if (suffix && /^[0-9a-f]{6,12}$/i.test(suffix)) return suffix;
  }

  const vercel = env.VERCEL_GIT_COMMIT_SHA;
  if (vercel) return vercel.slice(0, 12);

  return 'unknown';
}

export function buildInfo(
  env: NodeJS.ProcessEnv = process.env,
): BuildInfoModel {
  return {
    commit: resolveCommit(env),
    revision: env.K_REVISION,
    environment: configs.env ?? env.NODE_ENV ?? 'unknown',
    startedOn: STARTED_ON,
    uptimeSeconds: Math.round(process.uptime()),
    runtime: process.versions.node,
  };
}
