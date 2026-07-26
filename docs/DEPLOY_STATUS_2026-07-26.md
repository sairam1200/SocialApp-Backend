# Deploy status — 26 July 2026

> **Update, 16:45 CEST — partly moved, still not automatic.**
>
> The live site advanced on its own from `8e1cbaf` to **`eb738ff`**, so the whole
> Community layer *is* deployed, and `/api/v1/community/feed` now returns 200 —
> the backend went out too. Nothing in this repository caused that, and nobody
> touched either provider's settings from here.
>
> **But new pushes still do not deploy.** Two commits pushed at 15:32 and 15:35
> CEST produced no new deployment: 70 minutes of polling `/api/version` returned
> the same commit *and the same deployment id* throughout. So the backlog drained
> once; the trigger did not come back. The checklist below still applies, and
> the GitHub App installation is still the first thing to check.
>
> Everything below is kept as-is. The lasting outcome is
> `scripts/verify-deploy.sh` and the two `/version` endpoints, which turn "is it
> live?" from a two-hour inference into one command.
>
> Also still open: the backend serves but does not report its commit. Setting
> `BUILD_SHA` in the Cloud Build pipeline would close the last `?` in the
> verification output.

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

## The pipelines stopped between 04:24 and 07:20

This is the most useful fact, and it took a while to establish.

`8e1cbaf` **is** the deployed commit. Not inferred loosely — `src/app/not-found.tsx`
and `src/components/ui/error-state.tsx` were both added in exactly that commit
(`git log --diff-filter=A`), and that component's output is what
`demo.gaddr.com` serves on a 404 today.

So the frontend pipeline was healthy at 04:24 CEST. The first commit of this
work landed at 07:20. Nothing else happened in between.

**Both pipelines stopped at the same time**, across two independent providers
and two independent accounts. That is the shape of a single upstream cause, not
two coincidental ones.

## It is not the code

Verified from a **cold clone of the pushed commit**, which is what the build
machines do:

```bash
git clone --branch main <repo> /tmp/cold && cd /tmp/cold
corepack yarn install --immutable   # succeeded
corepack yarn build                 # succeeded, all 10 /community routes emitted
```

The backend's pipeline commands were run the same way, from a cold clone of the
pushed commit — these are literally lines 12 and 16 of the `Dockerfile`:

```bash
npm ci          # exit 0
npm run build   # exit 0
```

`dist/templates/email/layout.html` is present afterwards, so the new email asset
survives `COPY --from=builder /app/dist ./dist`. (The Docker image itself was
not built — the daemon is not running on this machine — but the only steps my
work touches are those two, and the base image and apt layers are unchanged.)

The frontend was additionally built on **Node 22** with a **2 GB heap cap**, to
rule out Vercel's runtime and build-container memory. Clean.

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

Or in one command, which does the comparison for you:

```bash
./scripts/verify-deploy.sh                     # against demo.gaddr.com
./scripts/verify-deploy.sh https://other.host  # anywhere else
```

Exit 0 means both services are serving your checked-out commit. Non-zero says
which one is not, and why — including the case that matters right now, where
there is no version endpoint at all, because the running build predates it.

**Neither needs a pipeline change.** The backend reads Cloud Run's `K_REVISION`,
which already carries the short SHA because `cloudbuild.yaml` deploys with
`--revision-suffix=$SHORT_SHA`. The frontend reads `VERCEL_GIT_COMMIT_SHA`,
which Vercel injects into every build automatically. Both fall back to
`unknown` rather than throwing — a version endpoint that 500s when it cannot
identify itself is worse than one that admits it does not know.

## What to check first

**Start at the organisation, not the two providers.** Both integrations are
GitHub Apps installed on `TeamGaddr`, and both stopped at once. A single
org-level event — a lapsed plan or payment, a suspended or revoked app
installation, an owner leaving — takes both out simultaneously, and `git push`
keeps working throughout because that uses an SSH key, not those apps. That
fits every observation; two independent provider faults happening in the same
hour does not.

1. **`github.com/organizations/TeamGaddr/settings/installations`** — are the
   **Vercel** and **Google Cloud Build** apps still installed, and does their
   repository access still include these two repos? A suspended installation
   shows a banner here and nowhere else.
2. **Billing on both providers.** A lapsed Vercel plan pauses deployments and a
   disabled GCP billing account stops Cloud Build, both while leaving the last
   deployment serving.
3. **Vercel → the project → Deployments.** Is there a build for `c74b117` at
   all? *No build queued* means the trigger never fired — go back to (1). *A
   failed build* means read the log, though the cold-clone build above makes a
   code-level failure unlikely.
4. **Is `demo.gaddr.com` aliased to a pinned deployment** rather than following
   production? That produces an old commit serving indefinitely while new
   deployments land on preview URLs.
5. **Is the production branch `main`?** `staging` exists and is 18 commits
   behind; nothing has been pushed to it.

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
