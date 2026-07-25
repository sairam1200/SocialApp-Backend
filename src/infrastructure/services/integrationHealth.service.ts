import { Injectable } from '@nestjs/common';
import axios from 'axios';
import configs from '../../configs';
import _const from '../../core/utils/const';
import redis from '../../core/utils/redis.util';
import logger from '../../core/utils/winston.util';

/**
 * Live health of each platform integration.
 *
 * ## Why this exists
 *
 * Every platform call in `GlobalSearchQueryHandler` is wrapped in `.catch()` so one
 * failure degrades only that platform. That is correct for resilience and terrible for
 * observability: a dead credential and "no results for this query" are
 * indistinguishable to the user *and* in the logs.
 *
 * Verified on 2026-07-25 by hand: the Pinterest token returns 401 and Reddit returns
 * 403, and nothing in the product said so. That check should not have to be a human
 * running curl.
 *
 * Note `/platform-status` in the frontend is a static marketing page driven by a
 * hardcoded feature list — a roadmap view, not health. This is the health source.
 */

export type IntegrationStatus =
  /** Credentials present and a live probe succeeded. */
  | 'operational'
  /** Credentials present, probe reachable, but capability is limited. */
  | 'degraded'
  /** Credentials present and rejected — expired or revoked. Needs action. */
  | 'misconfigured'
  /** No credentials configured. Expected for platforms not yet onboarded. */
  | 'not_configured'
  /** Probe could not complete — network or timeout. Says nothing about the credential. */
  | 'unknown';

export type IntegrationHealth = {
  platform: string;
  status: IntegrationStatus;
  /** Short, human-readable reason. Never contains credentials. */
  detail: string;
  /** HTTP status the probe received, when it got that far. */
  httpStatus?: number;
  /** Probe round-trip in milliseconds. */
  latencyMs?: number;
  /** What a maintainer should do next, when action is needed. */
  remediation?: string;
  checkedAt: string;
};

export type IntegrationHealthReport = {
  checkedAt: string;
  /** True when no platform needs action. */
  healthy: boolean;
  summary: Record<IntegrationStatus, number>;
  platforms: IntegrationHealth[];
  /** Whether this response came from cache rather than a live probe. */
  cached: boolean;
};

/**
 * Cached for 5 minutes.
 *
 * Probing is itself a request against a metered API. An unbounded health endpoint
 * would be a self-inflicted quota drain, and it is exactly the sort of endpoint that
 * gets polled by a dashboard every few seconds.
 */
const CACHE_TTL_SECONDS = 300;
const CACHE_KEY = 'integrations:health';

/** Probes must never hang a request. */
const PROBE_TIMEOUT_MS = 5000;

@Injectable()
export class IntegrationHealthService {
  async getHealthAsync(forceRefresh = false): Promise<IntegrationHealthReport> {
    const cacheKey = redis.getRedisKey(CACHE_KEY);

    if (!forceRefresh) {
      try {
        const cached =
          await redis.getFromRedisAsync<IntegrationHealthReport>(cacheKey);
        if (cached) return { ...cached, cached: true };
      } catch {
        // Redis is optional at boot; fall through to a live probe.
      }
    }

    // Probed in parallel — one slow platform must not serialise the rest.
    const platforms = await Promise.all([
      this.probeYoutube(),
      this.probePinterest(),
      this.probeTiktok(),
      this.probeSpotify(),
      this.probeReddit(),
      this.probeOauthOnly(
        _const.PLATFORMS.FACEBOOK,
        configs.facebook?.clientId,
        configs.facebook?.clientSecret,
      ),
      this.probeOauthOnly(
        _const.PLATFORMS.INSTAGRAM,
        configs.Instagram?.clientId,
        configs.Instagram?.clientSecret,
      ),
      this.probeOauthOnly(
        _const.PLATFORMS.TWITTER,
        configs.twitter?.clientId,
        configs.twitter?.clientSecret,
      ),
      this.probeOauthOnly(
        _const.PLATFORMS.LINKEDIN,
        configs.linkedin?.clientId,
        configs.linkedin?.clientSecret,
      ),
      this.probeOauthOnly(
        _const.PLATFORMS.THREADS,
        configs.threads?.clientId,
        configs.threads?.clientSecret,
      ),
      this.probeOauthOnly(
        _const.PLATFORMS.BEHANCE,
        configs.behance?.clientId,
        configs.behance?.clientSecret,
      ),
      this.probeOauthOnly(
        _const.PLATFORMS.SNAPCHAT,
        configs.snapchat?.clientId,
        configs.snapchat?.clientSecret,
      ),
    ]);

    const summary = platforms.reduce(
      (acc, p) => {
        acc[p.status] += 1;
        return acc;
      },
      {
        operational: 0,
        degraded: 0,
        misconfigured: 0,
        not_configured: 0,
        unknown: 0,
      } as Record<IntegrationStatus, number>,
    );

    const report: IntegrationHealthReport = {
      checkedAt: new Date().toISOString(),
      // `not_configured` is not a fault — a platform that was never onboarded is
      // expected. Only a rejected credential means someone must act.
      healthy: summary.misconfigured === 0,
      summary,
      platforms,
      cached: false,
    };

    try {
      await redis.storeInRedisAsync(cacheKey, report, CACHE_TTL_SECONDS);
    } catch {
      // Not caching is acceptable; the report is still correct.
    }

    if (summary.misconfigured > 0) {
      const broken = platforms
        .filter((p) => p.status === 'misconfigured')
        .map((p) => p.platform)
        .join(', ');
      logger.warn(`[IntegrationHealth] Credentials rejected for: ${broken}`);
    }

    return report;
  }

  /**
   * YouTube — the only platform whose search works without a user token, so a live
   * probe is meaningful. `search.list` costs 100 quota units, so the probe uses the
   * `i18nLanguages` endpoint instead, which costs 1.
   */
  private async probeYoutube(): Promise<IntegrationHealth> {
    const platform = _const.PLATFORMS.YOUTUBE;
    const apiKey = configs.youtube?.apiKey;

    if (!apiKey) {
      return this.notConfigured(platform, 'YOUTUBE_API_KEY is not set');
    }

    return this.probe(platform, async () => {
      const response = await axios.get(
        'https://www.googleapis.com/youtube/v3/i18nLanguages',
        {
          params: { part: 'snippet', key: apiKey },
          timeout: PROBE_TIMEOUT_MS,
          validateStatus: () => true,
        },
      );

      if (response.status === 200) {
        return {
          status: 'operational' as const,
          detail:
            'API key valid. Note the daily quota is 10,000 units and search.list costs 100, i.e. ~100 searches/day.',
          httpStatus: 200,
        };
      }

      if (response.status === 403) {
        return {
          status: 'misconfigured' as const,
          detail:
            'Rejected with 403 — key invalid, restricted, or quota exhausted.',
          httpStatus: 403,
          remediation:
            'Check key restrictions and remaining quota in the Google Cloud console.',
        };
      }

      return {
        status: 'misconfigured' as const,
        detail: `Unexpected status ${response.status}.`,
        httpStatus: response.status,
        remediation: 'Verify YOUTUBE_API_KEY.',
      };
    });
  }

  /**
   * Pinterest — verified failing on 2026-07-25 with 401. v5 access tokens expire, so
   * this is the platform most likely to be silently dead.
   */
  private async probePinterest(): Promise<IntegrationHealth> {
    const platform = _const.PLATFORMS.PINTEREST;
    const token = process.env.PINTEREST_ACCESS_TOKEN;

    if (!token) {
      return this.notConfigured(
        platform,
        'PINTEREST_ACCESS_TOKEN is not set (client id/secret alone cannot search)',
      );
    }

    return this.probe(platform, async () => {
      const response = await axios.get(
        'https://api.pinterest.com/v5/user_account',
        {
          headers: { Authorization: `Bearer ${token}` },
          timeout: PROBE_TIMEOUT_MS,
          validateStatus: () => true,
        },
      );

      if (response.status === 200) {
        return {
          status: 'operational' as const,
          detail: 'Access token valid.',
          httpStatus: 200,
        };
      }

      return {
        status: 'misconfigured' as const,
        detail: `Access token rejected (${response.status}).`,
        httpStatus: response.status,
        remediation:
          'Re-run the OAuth flow to mint a fresh token, and store the refresh token so oauth.service can renew it automatically.',
      };
    });
  }

  /**
   * TikTok — client credentials mint a token, but that grant only opens a narrow
   * endpoint set. Content search needs a user-authorised token, so a successful probe
   * is `degraded`, not `operational`.
   */
  private async probeTiktok(): Promise<IntegrationHealth> {
    const platform = _const.PLATFORMS.TIKTOK;
    const { clientId, clientSecret } = configs.tiktok ?? {};

    if (!clientId || !clientSecret) {
      return this.notConfigured(platform, 'TIKTOK_CLIENT_ID/SECRET not set');
    }

    return this.probe(platform, async () => {
      const response = await axios.post(
        'https://open.tiktokapis.com/v2/oauth/token/',
        new URLSearchParams({
          client_key: clientId,
          client_secret: clientSecret,
          grant_type: 'client_credentials',
        }),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: PROBE_TIMEOUT_MS,
          validateStatus: () => true,
        },
      );

      if (response.status === 200 && response.data?.access_token) {
        return {
          status: 'degraded' as const,
          detail:
            'Client credentials valid, but this grant cannot search content — that needs a user-authorised token.',
          httpStatus: 200,
          remediation:
            'Gate TikTok results on a connected account rather than attempting them for anonymous visitors.',
        };
      }

      return {
        status: 'misconfigured' as const,
        detail: `Token request failed (${response.status}).`,
        httpStatus: response.status,
        remediation:
          'Verify the client key/secret and that the app is approved.',
      };
    });
  }

  /** Spotify — client credentials are sufficient for catalogue search. */
  private async probeSpotify(): Promise<IntegrationHealth> {
    const platform = _const.PLATFORMS.SPOTIFY;
    const { clientId, clientSecret } = configs.spotify ?? {};

    if (!clientId || !clientSecret) {
      return this.notConfigured(platform, 'SPOTIFY_CLIENT_ID/SECRET not set');
    }

    return this.probe(platform, async () => {
      const response = await axios.post(
        'https://accounts.spotify.com/api/token',
        new URLSearchParams({ grant_type: 'client_credentials' }),
        {
          auth: { username: clientId, password: clientSecret },
          timeout: PROBE_TIMEOUT_MS,
          validateStatus: () => true,
        },
      );

      if (response.status === 200 && response.data?.access_token) {
        return {
          status: 'operational' as const,
          detail: 'Client credentials valid.',
          httpStatus: 200,
        };
      }

      return {
        status: 'misconfigured' as const,
        detail: `Token request failed (${response.status}).`,
        httpStatus: response.status,
        remediation: 'Verify the client id and secret.',
      };
    });
  }

  /**
   * Reddit — verified blocked on 2026-07-25. Public JSON returns 403 from datacenter
   * IPs and the direct API access request was refused, so this is expected to stay
   * unavailable rather than being a misconfiguration to fix.
   */
  private async probeReddit(): Promise<IntegrationHealth> {
    const platform = _const.PLATFORMS.REDDIT;
    const { clientId, clientSecret } = configs.reddit ?? {};

    if (!clientId || !clientSecret) {
      return this.notConfigured(
        platform,
        'REDDIT_CLIENT_ID/SECRET not set. Direct API access was refused; public JSON endpoints return 403 from datacenter IPs.',
      );
    }

    return this.probe(platform, async () => {
      const response = await axios.post(
        'https://www.reddit.com/api/v1/access_token',
        new URLSearchParams({ grant_type: 'client_credentials' }),
        {
          auth: { username: clientId, password: clientSecret },
          headers: { 'User-Agent': 'Gaddr/1.0' },
          timeout: PROBE_TIMEOUT_MS,
          validateStatus: () => true,
        },
      );

      if (response.status === 200 && response.data?.access_token) {
        return {
          status: 'operational' as const,
          detail: 'OAuth credentials valid.',
          httpStatus: 200,
        };
      }

      return {
        status: 'misconfigured' as const,
        detail: `Token request failed (${response.status}). Reddit blocks datacenter IPs on unauthenticated endpoints.`,
        httpStatus: response.status,
        remediation:
          'Confirm the app is approved for API access, or drop Reddit from the platform list rather than shipping a permanently failing integration.',
      };
    });
  }

  /**
   * Platforms whose search requires a user-authorised token, so there is nothing
   * useful to probe without one. Reports whether credentials are configured at all —
   * which is still worth knowing, and is the honest answer.
   */
  private probeOauthOnly(
    platform: string,
    clientId?: string,
    clientSecret?: string,
  ): IntegrationHealth {
    if (!clientId || !clientSecret) {
      return this.notConfigured(platform, 'OAuth client id/secret not set');
    }

    return {
      platform,
      status: 'degraded',
      detail:
        'OAuth credentials configured. Search requires a user-authorised token, so this cannot be probed server-side.',
      remediation:
        'Verify by connecting an account and running a search for that user.',
      checkedAt: new Date().toISOString(),
    };
  }

  private notConfigured(platform: string, detail: string): IntegrationHealth {
    return {
      platform,
      status: 'not_configured',
      detail,
      checkedAt: new Date().toISOString(),
    };
  }

  /**
   * Run a probe, timing it and converting any throw into `unknown`.
   *
   * A network failure says nothing about the credential, so it must not be reported as
   * `misconfigured` — that would send someone to rotate a key that is fine.
   */
  private async probe(
    platform: string,
    fn: () => Promise<
      Omit<IntegrationHealth, 'platform' | 'checkedAt' | 'latencyMs'>
    >,
  ): Promise<IntegrationHealth> {
    const startedAt = Date.now();

    try {
      const result = await fn();
      return {
        platform,
        ...result,
        latencyMs: Date.now() - startedAt,
        checkedAt: new Date().toISOString(),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`[IntegrationHealth] ${platform} probe failed: ${message}`);

      return {
        platform,
        status: 'unknown',
        detail: `Probe could not complete: ${message}`,
        latencyMs: Date.now() - startedAt,
        remediation:
          'Network or timeout issue — this says nothing about the credential. Retry.',
        checkedAt: new Date().toISOString(),
      };
    }
  }
}
