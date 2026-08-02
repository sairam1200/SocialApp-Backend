# `community-smoke.js` — the layer no unit test covers

Boots the compiled server against a **scratch** Postgres and drives the
Community API over HTTP: profiles, posting, drafts, visibility, threads,
reactions, polls, disclosure, follows, both feeds, the algorithm controls,
signals, sharing, search, messaging, streaming, money, invites and analytics.

It exists because typecheck and unit tests were both green while aggregated
search results were saved by the backend, returned by the API, and never
rendered. Every unit was correct; the gap was between them. The same shape of
gap is what this catches — 44 assertions that only fail if the layers disagree.

## Not part of `ci.sh`

`ci.sh` must run without a database. This needs one, so it is a manual gate:
run it before shipping anything that touches the social layer.

## Running it

```bash
createdb gaddr_smoke
psql -d gaddr_smoke -c 'CREATE SCHEMA identity; CREATE SCHEMA notification; CREATE SCHEMA analytics; CREATE EXTENSION "uuid-ossp"; CREATE EXTENSION pg_trgm;'
```

Build an env file from the test bootstrap, which already supplies every
required variable, then point it at the scratch database:

```bash
node -e 'require("ts-node").register({transpileOnly:true,compilerOptions:{module:"commonjs"}});require("./test/jest-setup-env.ts");const e={...process.env,POSTGRES_DATABASE:"gaddr_smoke",POSTGRES_MIGRATIONS_RUN:"true"};delete e.DATABASE_URL;require("fs").writeFileSync("/tmp/smoke-env.json",JSON.stringify(e))'
```

Seed two users — registration is skipped on purpose, because it uploads a
default avatar through Cloudinary and that has nothing to do with what is under
test:

```bash
node scripts/seed-smoke-users.js
```

Then:

```bash
npm run build && SMOKE_ENV_FILE=/tmp/smoke-env.json node scripts/community-smoke.js
```

Exit code 0 means every assertion held.

**It resets its own tables first.** Without that, a second run finds Bo already
in Anna's close friends from the first, and the visibility assertion fails
against state the previous run created. A test that only passes once is a test
nobody runs twice. `identity.users` is left alone — the seeded users are the
fixture.

## What it proved, last run

44/44, including the three that are easiest to get wrong:

- an anonymous reader sees the public post and **not** the close-friends one;
- a reply to a close-friends post is forced to `close_friends`, even when the
  client asks for `public`;
- a stored `NaN` half-life is clamped back to the default rather than to the
  minimum.
