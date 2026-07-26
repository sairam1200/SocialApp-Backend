# Deploy status — 26 July 2026

Community is merged to `main` in both repositories and **neither deployment
pipeline has run**. This note records exactly what was verified, so whoever
picks it up does not have to re-derive it.

## What is true

| | |
|---|---|
| Backend `main` | `7028bd1` — pushed 08:25 CEST |
| Frontend `main` | `aa01e49` — pushed 08:10 CEST |
| Live frontend | still serving `8e1cbaf` (04:24 CEST), the commit *before* this work |
| Live backend | `/api/v1/community/*` → 404; `/api/v1/search/results` → 200 |

Both pipelines were working immediately before: the error pages from `8e1cbaf`
are live and were deployed automatically. Nothing deployed after ~07:20.

## It is not the code

Verified from a **cold clone of the pushed commit**, which is what the build
machines do:

```bash
git clone --branch main <repo> /tmp/cold && cd /tmp/cold
corepack yarn install --immutable   # succeeded
corepack yarn build                 # succeeded, all 10 /community routes emitted
```

Both repositories' own gates are green on the pushed commits:

- backend `./scripts/ci.sh` — typecheck, lint (276 warnings, at budget), 358
  tests, secret scan, build
- frontend `./scripts/ci.sh` — typecheck, lint, 112 unit tests, secret scan,
  production build, 52 Playwright tests
- `node scripts/community-smoke.js` — 44/44 over HTTP against real Postgres,
  twice in a row

The backend also boots cleanly with the new module: no unresolved dependencies,
Community routes mapped, and the migration creates 36 tables and 21 indexes on
`posts`.

## Why it was not fixed here

Neither deployment account is reachable from this machine:

- `vercel whoami` → `ricky-billkrantz`, whose team does not contain the Gaddr
  project. The `demo.gaddr.com` project lives on a different account.
- `gcloud auth list` → `dena.azarang@gmail.com`, whose projects do not include
  the one in `cloudbuild.yaml`.

Deploying with either would push to the wrong account and could change what
serves a production domain. That is not a call to make without the owner.

## What to check first

Most likely, cheapest first:

1. **Vercel → the project → Deployments.** Is there a build for `aa01e49` at
   all? If none, the Git integration is disconnected or paused. If there is one
   and it failed, the log says why — but note the cold-clone build above
   succeeded, so a code-level failure would be surprising.
2. **Is `demo.gaddr.com` aliased to a pinned deployment** rather than following
   production? That would produce exactly this: an old commit serving
   indefinitely while new deployments land on preview URLs.
3. **Is the project's production branch `main`?** `staging` exists and is 18
   commits behind; nothing has been pushed to it.
4. **Cloud Build → Triggers** for the backend. Same three questions.

## After it deploys

`POSTGRES_MIGRATIONS_RUN` defaults to **false**, so
`1785000000000-CreateSocialSchema` will not apply on boot. Run it deliberately:

```bash
npm run migration:run
```

It is idempotent — every statement is `IF NOT EXISTS` or guarded — so a
partially-applied run can be re-run rather than hand-repaired.

Then confirm:

```bash
curl -s https://demo.gaddr.com/api/v1/community/feed?limit=1     # expect 200
curl -s -o /dev/null -w '%{http_code}' https://demo.gaddr.com/community   # expect 200
```

Set `MEDIA_SERVER_*` when a media server exists. Until then streaming reports
itself as unconfigured, which is correct — the rest of Community does not
depend on it.
