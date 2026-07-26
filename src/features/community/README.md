# `features/community` — the social layer

The HTTP surface for Community: the feed, posts, profiles, the composer,
streaming, commerce, learning and growth.

## Why these are controllers, not CQRS slices

Every other feature here is a vertical slice with a `*.endpoint.ts` and a
`*.handler.ts` per operation, dispatched through `CommandBus`. Community is
about seventy operations. Following that pattern literally would produce ~140
files, and roughly 120 of the handlers would be a single line delegating to a
service.

The behaviour lives in `infrastructure/services/social/` — eleven injectable
services that own the real logic and are unit-testable on their own. The
controllers here are thin: validate, resolve the caller, delegate, map. That is
still the same layering (`features → domain interfaces → infrastructure`), with
one less hop.

Where an operation has genuine orchestration across aggregates, it lives in a
service, not in a controller. If you find yourself writing a third `if` in a
controller method, it belongs in a service.

## Layout

| File | Covers |
|---|---|
| `feed.endpoint.ts` | Both feeds, single posts, threads, replies, reactions, polls, shares, engagement signals, feed preferences |
| `profile.endpoint.ts` | Profiles, handles, audiences (close friends, brand partners), mutes and blocks |
| `composer.endpoint.ts` | Compose, publish, schedule, drafts, the content calendar |
| `commerce.endpoint.ts` | Storefronts, product tagging, campaigns, applications, affiliate links, tips, balance, payouts, subscription tiers |
| `stream.endpoint.ts` | Channel settings, ingest keys, playback, simulcast targets, clips, live chat, moderation, media-server callbacks |
| `learning.endpoint.ts` | Courses, lessons, enrolment, quizzes, certifications and their public verification |
| `growth.endpoint.ts` | Explore and search, invites, creator analytics, share attribution |
| `messaging.endpoint.ts` | Conversations and messages |

## Rules specific to this feature

1. **Never read a post without a `VisibilityScope`.** `visibilityPredicate` in
   `core/utils/recommendation/visibility-scope.ts` is the only definition of
   who can see what. Filtering after the query silently shrinks pages and
   breaks keyset pagination at page boundaries.
2. **Sponsored posts are never boosted.** They are placed by
   `blendSponsored` at a fixed cadence. If you find yourself adding a term to
   the ranker for paid content, stop.
3. **Publishing here always succeeds.** External syndication is recorded on the
   post and dispatched afterwards. A dead third-party token must never fail a
   publish.
4. **Money is `bigint` minor units, end to end.** `Number` loses precision past
   2^53 and `0.1 + 0.2` is not `0.3`.
5. **Every list endpoint hydrates through `FeedService.mapPostsAsync`.** It is
   six queries regardless of page size. A bespoke mapping in a new endpoint is
   how an N+1 gets in.
