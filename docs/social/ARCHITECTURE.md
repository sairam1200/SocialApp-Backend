# Community — architecture

The social layer: what it is made of, and the decisions that shaped it.

---

## One table

`social.posts` holds **every** timeline object.

| Object | How it differs |
|---|---|
| Update | the base case |
| Photo / video | has `post_media` rows |
| Comment | has `parentId` (and `rootId`, denormalised) |
| Repost | has `repostOfId`; add a `body` and the client renders a quote |
| Story | has `expiresOn` |
| Poll | has `poll_options` rows |
| Live | has `streamId` |
| Clip | `kind = clip`, bound to a `stream_clips` row |
| Article | long `body`, same everything else |

Splitting these into separate tables would fork visibility filtering, ranking,
moderation, metrics, notification fan-out and search — nine ways, each of which
would drift within a year. `kind` costs one column and a `WHERE`.

`rootId` is denormalised so a whole thread loads in one indexed query rather
than a recursive walk.

## One visibility decision

`visibilityPredicate()` in
[`visibility-scope.ts`](../../src/core/utils/recommendation/visibility-scope.ts)
is the only definition of who can see what. The feed, threads, search, profile
timelines, permalinks, the sitemap and the Open Graph metadata endpoint all go
through it.

**The subtle part:** a flat `visibility IN ('public','close_friends')` is
wrong. It shows *every* author's close-friends posts to anyone who is somebody
else's close friend. The predicate pairs each narrower level with the specific
authors that granted it:

```sql
(   visibility = 'public'
 OR authorProfileId = :viewer
 OR (visibility = 'followers'                       AND authorProfileId IN :following)
 OR (visibility IN ('followers','close_friends')    AND authorProfileId IN :closeFriendOf)
 OR (visibility IN ('followers','brand_partners')   AND authorProfileId IN :brandPartnerOf))
```

Applied **in SQL**. Filtering a fetched page afterwards shrinks it silently —
ask for 20, get 6 — and makes the keyset cursor skip rows at page boundaries.

Close friends and brand partners are explicit memberships, not implied by
following. Both mistakes are real: `followers OR closeFriends` leaks the
narrower audience to every follower, and requiring a follow hides posts from a
close friend who never followed.

## One follow graph

Community uses `identity.user_follows`. It does not keep its own.

The Community endpoints take a profile id and resolve to a user id, so the
client never has to hold both. Two graphs would need reconciling forever, and
the existing one already carries the rate limits, the request/approve flow and
the block semantics.

## One profile, three kinds

A brand is not a separate entity. It is a `social.profiles` row with
`kind = brand`. That is what lets one storefront, one campaign engine, one
recommender and one feed serve people, creators and brands without branching.

`social.profiles` is a satellite of `identity.users`, not more columns on it:
a person becomes a creator or a brand without touching the auth tables, and
nothing monetisation-related sits in the login path.

## One ledger

Every movement of value is one `ledger_entries` row. A balance is
`SUM(amount - fee) WHERE status = 'cleared'`.

There is no mutable balance column, because for money the only property that
matters is that a wrong number can be reconstructed from what actually
happened. Amounts are `bigint` minor units end to end — `Number` loses
precision past 2^53, and `0.1 + 0.2 ≠ 0.3`.

`idempotencyKey` is unique in the database, so a retried webhook cannot pay
twice. Returning the existing row on a repeat is correct, not an error: the
caller asked for the same thing.

A payout writes its debit **before** attempting the transfer, so the same
balance cannot be requested twice while one is in flight. A failure reverses
it — which is exactly why a ledger beats a mutable column.

## Layout

```
domain/entities/social/       10 files, ~36 tables
domain/repositories/isocial.repository.ts    7 aggregate contracts
domain/contracts/social.model.ts             API shapes
domain/mappers/social.mapper.ts              entity → model, one place
core/utils/recommendation/    pure kernel — no Nest, no DB, no clock
infrastructure/repositories/social/          7 implementations
infrastructure/services/social/              17 services
features/community/                          8 controllers
modules/community.module.ts                  wiring
```

The kernel is pure on purpose: the feed's behaviour is what has to be provable,
and a function you can call from a test with three numbers is provable in a way
a method on an injected service is not. 87 unit tests exercise it directly.

## Controllers, not CQRS slices

Every other feature is a vertical slice with an endpoint and a handler per
operation, dispatched through `CommandBus`. Community is ~70 operations.
Following that literally would produce ~140 files, and about 120 handlers would
be one line delegating to a service.

The behaviour lives in the services, which are injectable and unit-testable on
their own. Controllers here validate, resolve the caller, delegate and map.
Same layering, one less hop. Recorded in
[`features/community/README.md`](../../src/features/community/README.md) so the
deviation is deliberate rather than discovered.

## Scheduled work

Every job takes a Redis lock first. Cloud Run runs more than one instance and
`@Cron` fires on all of them; two instances publishing the same scheduled post
would double-post it. The lock is best-effort — **if Redis is unavailable the
job is skipped rather than run unguarded**, because a missed tick is
recoverable and a double publish is not.

| Job | Cadence | Why |
|---|---|---|
| `publishScheduled` | 1 min | "Scheduled for 09:00" has to mean 09:00 |
| `refreshHotScores` | 10 min | Retrieval score only; personalised ranking is per request |
| `archiveExpired` | 1 h | Housekeeping — reads already filter on `expiresOn` |

## Verification

- **87** unit tests on the pure kernel
- **21** on the composer
- **112** frontend unit tests, **52** browser tests
- **44** end-to-end assertions over HTTP against real Postgres
  ([`scripts/community-smoke.js`](../../scripts/community-smoke.js))

The last one exists because a green typecheck and green unit tests were both
true while aggregated search results were saved, returned, and never rendered.
Every unit was correct; the gap was between them.

## See also

[`RECOMMENDER.md`](RECOMMENDER.md) · [`STREAMING.md`](STREAMING.md) ·
[`CREATOR_ECONOMY.md`](CREATOR_ECONOMY.md) ·
[`../ENGINEERING_PHILOSOPHY.md`](../ENGINEERING_PHILOSOPHY.md)
