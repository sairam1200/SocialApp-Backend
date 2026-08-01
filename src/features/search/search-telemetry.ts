export interface SearchRepoTelemetry {
  name: string;
  rows: number;
  latencyMs: number;
}

export interface SearchTelemetry {
  query: string;
  cacheHit: boolean;
  durationMs: number;
  repos: SearchRepoTelemetry[];
  merged: number;
  ranked: number;
  paginated: number;
  identityMs: number;
  rankingMs: number;
  returned: number;
}
