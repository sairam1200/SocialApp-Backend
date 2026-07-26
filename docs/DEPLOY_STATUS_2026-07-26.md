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

Neither deployment account is reachable from this machine. This was established
by querying the APIs directly, not inferred:

```
GET api.vercel.com/v2/teams        → 1 team: ricky-billkrantzs-projects
GET api.vercel.com/v9/projects     → 7 projects, none linked to a Gaddr repo
GET .../projects (personal scope)  → 0
gcloud auth list                   → dena.azarang@gmail.com
gcloud projects list               → no project matching cloudbuild.yaml
```

There is also **no CI-based deploy path** to fall back on: neither repository
has a GitHub Actions workflow (`backend/.github/` holds only a PR template),
and there are no deploy hooks in any config.

Deploying with either credential would push to the wrong account and could
change what serves a production domain. That is not a call to make without the
owner.

## Verified working, just not at that hostname

Because the domain could not be reached, the whole stack was run locally and
driven through a browser — production build, real Postgres, real API, no mocks:

| | |
|---|---|
| Backend | `dist/main.js` against a real database, 82 Community routes mapped, migration applied |
| Frontend | `next build` + `next start`, `AUTH_API_URL` pointed at it |
| Driven | a real browser, both colour schemes |

What that confirmed, beyond what the test suites cover:

- the feed renders real posts with real dates, avatars and linked hashtags;
- switching to Latest puts `?feed=latest` in the URL, returns different
  content, and shows **no** ranking reasons — while Recommended does;
- the **Paid partnership** label renders above the body of the sponsored post;
- the poll shows "No votes yet" rather than its tally;
- a profile page renders real follower/post counts and both timeline modes;
- server-rendered metadata carries title, description, keywords and JSON-LD;
- **a close-friends post produces generic metadata and `noindex`**, with no
  body text and no JSON-LD anywhere in the HTML;
- no console errors.

It also found two defects the test suites could not, both since fixed:

1. **The dashboard shell was `bg-white`** — invisible in dark mode. It survived
   because every previous child painted its own background; Community's right
   rail does not, so it rendered near-white text on white. Computed colour was
   correct on every element, so a contrast check on the text alone would have
   passed.
2. **A post was readable by id regardless of visibility.** `GET /posts/:id`
   used a raw primary-key lookup, so an anonymous caller with an id got a 200
   and the full body of a close-friends post. The metadata path was correct,
   which is precisely why this survived everything else.

## Telling whether a deploy landed, from now on

The reason this took two hours to even diagnose is that there was no way to ask
what was running. The live commit had to be inferred from the *contents of a
404 page* — grepping for a string only the newest build could produce. That
works once, by luck, and not at all for a change with no visible surface.

Both services now answer directly:

```bash
curl -s https://demo.gaddr.com/api/v1/version | jq   # backend
curl -s https://demo.gaddr.com/api/version    | jq   # frontend
```

Compare `commit` to `git rev-parse --short HEAD`. Equal means that commit is
serving.

**Neither needs a pipeline change.** The backend reads Cloud Run's `K_REVISION`,
which already carries the short SHA because `cloudbuild.yaml` deploys with
`--revision-suffix=$SHORT_SHA`. The frontend reads `VERCEL_GIT_COMMIT_SHA`,
which Vercel injects into every build automatically. Both fall back to
`unknown` rather than throwing — a version endpoint that 500s when it cannot
identify itself is worse than one that admits it does not know.

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
