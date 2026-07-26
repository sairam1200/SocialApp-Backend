---
name: gaddr-recommender
description: The Community recommender — candidate retrieval, Reciprocal Rank Fusion, the multi-objective ranker, MMR diversification, sponsored blending, topic-affinity learning, and the reader-facing algorithm controls. Use when changing how the feed ranks, adding a candidate source, debugging why a post does or does not appear, or tuning weights.
when_to_use: Trigger phrases include "ranking", "the algorithm", "why is this post in my feed", "why am I seeing this", "candidate source", "retrieval", "RRF", "rank fusion", "heavy ranker", "engagement weights", "recency", "half-life", "diversity", "MMR", "exploration", "cold start", "topic affinity", "For You feed", "recommended feed", "feed preferences", "tune the feed", and any edit under src/core/utils/recommendation/ or recommendation.service.ts.
---

# The recommender

**Read first:** [`docs/social/RECOMMENDER.md`](../../../docs/social/RECOMMENDER.md)
— it has the full derivation and the sources. This is the operational summary.

---

## Where things live

| Concern | File |
|---|---|
| Pure maths — decay, Wilson, cosine, saturation | `core/utils/recommendation/ranking-math.ts` |
| Rank fusion, MMR, sponsored blending | `core/utils/recommendation/fusion.ts` |
| **Every weight and default** | `core/utils/recommendation/ranking-weights.ts` |
| Prediction and scoring | `core/utils/recommendation/scorer.ts` |
| Text, topics, search documents | `core/utils/recommendation/text.ts` |
| Visibility | `core/utils/recommendation/visibility{,-scope}.ts` |
| Orchestration | `infrastructure/services/social/recommendation.service.ts` |
| Learning | `infrastructure/services/social/engagement.service.ts` |

**The kernel is pure: no Nest, no database, no clock.** That is deliberate —
the feed's behaviour is what has to be provable, and a function you can call
with three numbers is provable in a way a method on an injected service is not.
87 tests exercise it directly. Put behaviour there wherever it can be a function
of its arguments.

---

## The pipeline

```
retrieve (5 sources, concurrent) → RRF fuse on rank → multi-objective score
    → MMR + per-author cap → blend sponsored at a fixed cadence
```

### Adding a candidate source

1. A method on `IPostRepository` returning **ids only** — hydration happens once
   after fusion, not per source.
2. A weight in `SourceWeights`, with a default.
3. A job in `RecommendationService.retrieveAsync`, guarded by `weight > 0` so
   turning it off costs the database nothing.
4. An i18n key `community.reason.<source>` in **both** `en.json` and `sv.json`,
   or the "why this post" sheet renders a raw key.
5. Bound it: `PER_SOURCE_LIMIT`, a lookback window, and a `LIMIT` inside any CTE.

Sources run under `Promise.allSettled`. **Never `Promise.all`** — one failing
source must drop out, not empty the feed.

### Changing a weight

Change the default in `ranking-weights.ts`. Not a magic number at a call site —
that file *is* the published documentation of the algorithm, and Settings →
Feed renders from it.

---

## Traps

**`value ?? default` does not catch `NaN`.** `NaN` is not nullish, so it reaches
`clamp` and returns the *minimum*. A stored `NaN` half-life silently became 1
hour instead of 20. `finiteOr` exists for exactly this; use it for every numeric
preference. Caught by a test written for that case — keep the test.

**Recency must not multiply a negative utility.** Doing so makes an *older* bad
post outrank a fresh one. `scoreCandidate` splits on the sign and applies the
multiplier to the positive part only.

**Small samples must not claim perfect rates.** 3 likes on 3 impressions is not
a 100% like rate. `smoothedRate` blends the Wilson lower bound with a
cold-start prior, weighted by evidence.

**Ties must break deterministically.** A feed that reshuffles on every refresh
reads as broken. `reciprocalRankFusion` breaks on first-seen order.

**Trending must divide by age.** Ordering by raw engagement returns the same
all-time-popular posts every day.

**`hotScore` is a retrieval score, not the ranking score.** It orders the
topical candidate source cheaply. Personalised ranking still happens per
request, which is why a ten-minute-stale `hotScore` is fine.

---

## Learning

`applyAffinityAsync`: decay by elapsed time (30-day half-life) → add the signal
→ clamp to `[0, 50]`.

**Decay happens on write, not by a sweep.** An affinity is always current, and
there is no schedule to fall behind.

A **pinned** topic keeps its weight — the reader said so. A **muted** topic is
never raised by implicit behaviour: muting something and then reading it out of
curiosity must not undo the mute.

Learning weights (`ENGAGEMENT_LEARNING_WEIGHTS`) are separate from ranking
weights (`ObjectiveWeights`) on purpose. A reader can turn down how much
comments influence their ranking without erasing what was learned from theirs.

---

## The reader owns this

Not a slogan — a constraint on what you may add:

- Every weight is **named and published** in `ranking-weights.ts`.
- Every weight is **editable** at Settings → Feed.
- Setting every source but `following` to 0 must keep producing a working
  chronological timeline. If a change breaks that, the change is wrong.
- Every ranked post returns `reasons`. A new ranking factor strong enough to
  change ordering needs a reason string.
- **Sponsored content is placed, not ranked.** Do not add a term for it.

`resolveFeedPreferences` is a trust boundary — preferences arrive from JSONB and
from the settings API. Clamp everything.

---

## Upgrading to a learned model

`predictEngagement` is the **single function to replace**. Everything around it
is already in the right shape: features are assembled, objectives are weighted,
diversification and blending are downstream.

Likely next steps, in order of value: real embeddings (`pgvector` on Neon;
`cosineSimilarity` is the seam), a learned CTR model on `engagement_events`, and
offline evaluation from the stored `position` field.
