---
name: gaddr-community
description: The Community social layer — the feed, posts, profiles, the composer, visibility and audiences, messaging, the creator economy, livestreaming and learning. Use when adding or debugging anything under features/community/, infrastructure/services/social/, or the social schema.
when_to_use: Trigger phrases include "the feed", "a post", "post kind", "comment", "reply", "repost", "story", "poll", "close friends", "brand partners", "who can see this", "visibility", "the composer", "schedule a post", "draft", "sponsored", "paid partnership", "disclosure", "storefront", "campaign", "affiliate", "tip", "payout", "go live", "stream key", "OBS", "clip", "live chat", "course", "certification", "invite", "creator analytics", and any edit under src/features/community/, src/infrastructure/services/social/, src/domain/entities/social/ or a migration touching the "social" schema.
---

# Community

The social layer. ~36 tables in a `social` schema, 17 services, 8 controllers.

**Read first:** [`docs/social/ARCHITECTURE.md`](../../../docs/social/ARCHITECTURE.md).
Then the one that matches: [`RECOMMENDER.md`](../../../docs/social/RECOMMENDER.md),
[`STREAMING.md`](../../../docs/social/STREAMING.md),
[`CREATOR_ECONOMY.md`](../../../docs/social/CREATOR_ECONOMY.md).

---

## Five things that will cost you a day if you get them wrong

### 1. One table for every timeline object

`social.posts` with a `kind` column. A comment is a post with `parentId`. A
repost is a post with `repostOfId`. A story is a post with `expiresOn`. A poll
is a post with `poll_options` rows. A live is a post with `streamId`.

**Do not add a `comments` table.** Splitting these forks visibility filtering,
ranking, moderation, metrics, notification fan-out and search — nine ways, each
drifting within a year.

`rootId` is denormalised so a thread loads in one indexed query. Set it on
create: `parent ? (parent.rootId ?? parent.id) : null`.

### 2. Never read a post without a `VisibilityScope`

`visibilityPredicate()` in `core/utils/recommendation/visibility-scope.ts` is
the **only** definition of who can see what. Feed, threads, search, profile
timelines, permalinks, sitemap, Open Graph — all of it.

The trap: a flat `visibility IN ('public','close_friends')` shows *every*
author's close-friends posts to anyone who is somebody else's close friend. The
predicate pairs each narrower level with the specific authors that granted it.

The second trap: filtering after the query. It silently shrinks pages — ask for
20, get 6 — and makes the keyset cursor skip rows at page boundaries. Apply it
in SQL, via `baseVisibleQuery`.

Close friends and brand partners are **explicit memberships**, never implied by
following. Both mistakes are real:
- `followers OR closeFriends` leaks the narrower audience to every follower;
- requiring a follow hides posts from a close friend who never followed.

A reply can never be wider than its parent — `effectiveReplyVisibility` enforces
it, and the composer calls it. A public reply to a close-friends post exposes
both the fact of the post and usually its substance.

### 3. One follow graph

Community dispatches `FollowUserCommand`/`UnfollowUserCommand` against
`identity.user_follows`. The Community endpoints take a *profile* id and resolve
to a user id.

**Do not register those handlers in `CommunityModule`.** `CqrsModule` scans
every module once and registers each handler into one global `CommandBus`, so
`FollowModule` doing it is enough. A second registration constructs a second
copy in this module's injector and fails at boot on `ProfileCacheService`.

### 4. Publishing here always succeeds

External platforms are recorded on the post as `pending` and dispatched
*afterwards*. A dead Instagram token produces a `failed` entry in
`externalTargets`, never a failed publish. `composeAsync` returns before the
external dispatch is awaited, and that ordering is the requirement.

### 5. Sponsored posts are never boosted

`blendSponsored` places them at a fixed cadence — one per seven organic, never
in the first three. Their score is computed identically to organic content and
multiplied by 1.0.

If you find yourself adding a ranker term for paid content, stop. Paid reach is
a fixed share of the feed, not something buyable.

The composer **refuses** a sponsored post that explicitly claims `disclosure:
none`. Omitting it is fine — it defaults to `paid_partnership`.

---

## Money

`bigint` minor units end to end, **strings on the wire**. `Number` loses
precision past 2^53 and JSON has no other integer type.

A balance is `SUM(amount − fee) WHERE status = 'cleared'`. There is no mutable
balance column, and adding one would be a regression, not an optimisation.

`idempotencyKey` is unique in the database. A repeat returns the existing row —
correct, not an error.

A payout writes its debit *before* the transfer, so the same balance cannot be
requested twice while one is in flight. `markPayoutFailedAsync` reverses it.

Read skill `gaddr-payments` before wiring a provider.

---

## Hydration

**Every list endpoint goes through `FeedService.mapPostsAsync`.** Six queries
regardless of page size — authors, media, poll options, product tags, viewer
reactions, viewer votes.

A bespoke mapping in a new endpoint is how an N+1 gets in. If you need
something it does not return, add it there.

---

## Writes that need care

- **`searchText` is written explicitly**, never defaulted in the column. A bulk
  INSERT that names its columns skips defaults — that is exactly how
  `contentStreams.searchText` landed NULL on every row, silently disabling the
  trigram index it existed for.
- **Topics are slugified** with `slugifyTopic` everywhere they are written.
  `topics && topics` overlap matches nothing if "Machine Learning" and
  "machine-learning" both exist.
- **Counters move by a delta in SQL**, never read-modify-write. Two concurrent
  likes would both read 10 and both write 11.
- **Reactions upsert on the unique pair.** A find-then-save races two taps of
  the like button into a unique violation.

---

## Scheduled work

Every job takes a Redis lock first. Cloud Run runs more than one instance and
`@Cron` fires on all of them.

**If Redis is unavailable the job is skipped, not run unguarded.** A missed tick
is recoverable; a double publish is not.

---

## Proving it

```bash
npx tsc -p tsconfig.json --noEmit   # 0 errors
npx jest                             # unit
npm run build && node dist/main.js   # DI graph — neither of the above evaluates it
node scripts/community-smoke.js      # 44 assertions, real Postgres, over HTTP
```

The last one is not in `ci.sh` (which must run without a database) and is a
manual gate before shipping social changes. See
[`scripts/README-smoke.md`](../../../scripts/README-smoke.md).

It exists because typecheck and unit tests were both green while aggregated
search results were saved, returned, and never rendered. Every unit was
correct; the gap was between them.

---

## Deliberate deviations, so you don't "fix" them

- **Controllers, not CQRS slices.** ~70 operations would be ~140 files with
  ~120 one-line handlers. Behaviour lives in the services, which are injectable
  and unit-testable. Recorded in `features/community/README.md`.
- **A brand is a profile with `kind = brand`**, not a separate entity. That is
  what lets one storefront, one campaign engine and one recommender serve
  people, creators and brands without branching.
- **A guide and an article are one-lesson courses.** Three entities would mean
  three enrolment paths, three progress models and three search integrations.
- **Feed preferences live on `profiles.creatorProfile` JSONB**, not their own
  table — a single small document read only by its owner.
