# The recommender

How the Recommended feed decides what you see, why it is built this way, and
where to change it.

**Code:** pure kernel in [`src/core/utils/recommendation/`](../../src/core/utils/recommendation/),
orchestration in [`recommendation.service.ts`](../../src/infrastructure/services/social/recommendation.service.ts).

---

## The shape

A two-stage pipeline — the shape every large feed converged on independently,
because the alternative does not fit in a request budget.

```
    retrieve                fuse              rank             diversify      blend
 ┌────────────┐          ┌───────┐        ┌──────────┐       ┌─────────┐   ┌────────┐
 │ following  │─┐        │       │        │  multi-  │       │   MMR   │   │  ads   │
 │ topics     │─┤        │  RRF  │        │ objective│       │    +    │   │  at a  │
 │ co-engage  │─┼──────▶ │ merge │──────▶ │  scorer  │─────▶ │ author  │──▶│ fixed  │
 │ trending   │─┤        │on rank│        │          │       │   cap   │   │cadence │
 │ fresh      │─┘        │       │        │          │       │         │   │        │
 └────────────┘          └───────┘        └──────────┘       └─────────┘   └────────┘
   ~120 each              ~600             ~120 scored          20            21
```

Retrieval is cheap and dumb; ranking is expensive and personalised. Doing it in
one pass would mean scoring the whole table per request.

---

## 1. Retrieval

Five independent sources, each producing a ranked list of ids. Ids only —
hydration happens once after fusion, not once per source.

| Source | What it finds | Lookback |
|---|---|---|
| `following` | Posts by profiles the viewer follows | 14 days |
| `topic-match` | Posts on topics the viewer engages with, by `hotScore` | 7 days |
| `similar-readers` | Item-to-item collaborative filtering | 7 days |
| `trending` | Engagement **per hour of age** | 48 h |
| `fresh` | Recent posts with the *fewest* impressions | 12 h |

`trending` divides by age deliberately. Ordering by raw engagement returns the
same all-time-popular posts every day; dividing by age is what makes "trending"
mean "rising now".

`fresh` orders by *ascending* impressions. It exists to break the
rich-get-richer loop that engagement-only ranking produces.

`similar-readers` is the classic Amazon item-item formulation: *people who
reacted to what you reacted to also reacted to these*. It needs no model,
updates the moment someone reacts, and degrades to nothing for a cold user.
Bounded at both hops so a heavy user cannot make it scan the table.

Sources run concurrently under `Promise.allSettled`. **A failing source drops
out; the feed still renders.** Half a feed beats a 500.

A source whose weight is 0 is not fetched at all — the reader turning it off
should cost the database nothing.

---

## 2. Fusion — Reciprocal Rank Fusion

```
RRF(d) = Σ_lists  weight_l / (k + rank_l(d))          k = 60
```

Cormack, Clarke & Büttcher, *Reciprocal Rank Fusion outperforms Condorcet and
individual Rank Learning Methods*, SIGIR 2009.

**Why rank and not score:** the sources produce incomparable numbers — one is a
cosine similarity in [0,1], another a raw co-occurrence count. Calibrating them
against each other needs labelled data we do not have. Fusing on rank sidesteps
it entirely, which is why every hybrid search engine (OpenSearch, Elasticsearch,
Azure AI Search, Weaviate) converged on the same one-line algorithm.

`k = 60` is the constant from the paper. It damps the influence of the very top
ranks, so one source cannot dictate the head of the list.

Ties break by first-seen order, so the result is deterministic. A feed that
reshuffles on every refresh reads as broken.

---

## 3. Ranking

Our equivalent of a "heavy ranker". Predicts a probability per engagement type
and takes a weighted sum:

```
score = Σ_objectives  weight_o × P(objective_o)
```

We have the same shape as a learned ranker and no labelled training data, so
each probability is **estimated** rather than learned:

```
P(engagement) = σ( logit(smoothed observed rate) + affinity terms )
```

- **Smoothed:** the observed rate is a Wilson lower bound blended with a
  cold-start prior, weighted by evidence. At 0 impressions it is entirely the
  prior; by ~500 it is almost entirely observed. This is why 3 likes on 3
  impressions cannot beat 900 on 1000.
- **Affinity terms are added in logit space**, so their effect is multiplicative
  on the odds. Following someone roughly triples the odds you engage, rather
  than adding a fixed amount that would swamp a rare event and be invisible on
  a common one.

Then, on top:

```
final = max(0, utility) × (0.75·recency + 0.25·popularity)
      + min(0, utility)
      + explorationBonus
```

The split on the sign of `utility` is load-bearing: multiplying a *negative*
utility by a decay factor would make an older bad post outrank a fresh one.

`explorationBonus = strength / sqrt(1 + impressions)` — the UCB1 upper-confidence
term without the log-total factor, which would need global state synchronised
across instances.

**When labelled interactions exist, `predictEngagement` is the single function
to replace.** Everything around it is already in the right shape for a learned
model.

---

## 4. Diversification

Maximal Marginal Relevance (Carbonell & Goldstein, SIGIR 1998):

```
MMR = argmax_d [ λ·score(d) − (1−λ)·max_{s ∈ selected} sim(d, s) ]
```

Greedy, O(limit × candidates). λ defaults to 0.7.

The **per-author cap** is applied alongside MMR rather than folded into the
similarity term, because "no more than three posts from one person" is a
promise to the reader, and a soft penalty cannot make a promise.

---

## 5. Sponsored blending

Sponsored posts are **not ranked in**. They are placed by `blendSponsored` at a
fixed cadence — one per seven organic items by default, never in the first
three.

This is deliberate and structural: an advertiser cannot buy its way to the top
by outbidding, and the reader can predict where paid content appears. Their
score is computed identically to organic content and neither boosted nor
penalised; only placement differs.

Setting `sponsoredEveryN` to 0 removes them entirely.

---

## The reader's controls

Every number above is in
[`ranking-weights.ts`](../../src/core/utils/recommendation/ranking-weights.ts),
named, with a published default, and editable at **Settings → Feed**.

That file is the honest documentation of the algorithm. If you change a
default, change it there — not in a magic number at a call site.

`resolveFeedPreferences` is a **trust boundary**: preferences arrive from a
JSONB column and from the settings API, and every field is clamped. Note that
`value ?? default` is not sufficient — `NaN` is not nullish, so it reaches
`clamp` and returns the *minimum*. A stored `NaN` half-life would silently
become 1 hour. `finiteOr` exists for exactly that.

---

## Learning

`EngagementService.applyAffinityAsync` folds each engagement into the reader's
topic affinities:

1. Decay the existing weight by elapsed time (30-day half-life).
2. Add the new signal, weighted by `ENGAGEMENT_LEARNING_WEIGHTS`.
3. Clamp to `[0, 50]` so one obsession cannot own the whole feed.

**Decay happens on write, not by a sweep job.** An affinity is therefore always
current, and there is no schedule to fall behind.

A **pinned** topic keeps its weight — the reader said so. A **muted** topic is
never raised by implicit behaviour, because muting something and then reading
it out of curiosity should not undo the mute.

Learning weights are separate from ranking weights on purpose: a reader can
turn down how much comments influence their ranking without erasing what the
system learned from their comments.

---

## One engine, four surfaces

`recommendEntitiesAsync` ranks creators, brands, products and courses through
the same fusion and diversification, with different retrieval.
`CreatorMatchingService` is the same machinery with the roles swapped — and
scores a creator↔campaign pairing **identically from both sides**, because a
marketplace where each side sees a different number is one where somebody is
being sold something.

---

## What this is not

Honest limits, so nobody mistakes this for more than it is:

- **Not a learned model.** Probabilities are estimated from observed rates and
  interpretable affinity features. That is a deliberate trade for
  explainability and for not needing a training pipeline — and it has a clean
  upgrade path (§3).
- **No embeddings.** Similarity is cosine over sparse topic/term vectors. A
  learned embedding would be better; `pgvector` on Neon is the obvious route,
  and `cosineSimilarity` is the seam.
- **No real-time index.** Retrieval is Postgres with GIN and trigram indexes.
  It is fast at this scale and will need a dedicated index long before it needs
  a rewrite of anything above.
- **`hotScore` is a retrieval score, not the ranking score.** It orders the
  topical candidate source cheaply. Personalised ranking still happens per
  request, which is why it can be ten minutes stale without anyone noticing.

## Sources

- Cormack, Clarke & Büttcher (2009), *Reciprocal Rank Fusion outperforms
  Condorcet and individual Rank Learning Methods*, SIGIR.
- Carbonell & Goldstein (1998), *The Use of MMR, Diversity-Based Reranking*, SIGIR.
- Wilson (1927), score interval for a binomial proportion — via Reddit's "best"
  comment sort.
- Twitter/X, [`the-algorithm`](https://github.com/twitter/the-algorithm) — the
  two-stage shape and the weighted multi-objective ranker.
