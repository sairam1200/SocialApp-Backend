# The creator economy

How value moves: sponsored posts, brand campaigns, affiliate links, tips,
subscriptions and payouts.

---

## Disclosure is structural

A sponsored post **cannot be published without a disclosure**. The composer
refuses it — not a warning, a `400`.

The label is stored on the post rather than derived at render time, so it
survives export, syndication, and the Open Graph metadata we emit for external
shares. Deriving it would mean it could be lost on any of those paths, and a
paid post that loses its label somewhere between the composer and a link
preview is the failure mode the whole rule exists to prevent.

Omitting `disclosure` on a sponsored post is fine — it defaults to
`paid_partnership`. What is rejected is *explicitly* claiming `none` on a post
marked sponsored, because that is a contradiction the author has to resolve
rather than something to silently override.

Client side, the badge renders above the body, at full contrast, never behind a
"more" affordance. Asserted in the unit suite and again in the browser suite.

## Sponsored posts are never boosted

`blendSponsored` inserts them at a fixed cadence — one per seven organic items
by default, never in the first three. Their score is computed identically to
organic content and multiplied by 1.0.

This is structural, not policy: **an advertiser cannot buy its way to the top by
outbidding**, because the ranker has no term to outbid. Paid reach is a fixed
share of the feed, and the reader can predict where it appears. Setting
`sponsoredEveryN` to 0 removes it entirely.

## Matching is symmetric

`matchCreatorsToCampaignAsync` and `matchCampaignsToCreatorAsync` compute the
**same score from the same features**. A creator sees the same fit the brand
does.

A marketplace where each side is scored differently is one where somebody is
being sold something.

| Signal | Weight | Note |
|---|---|---|
| Topical fit | 0.45 | Cosine over topic vectors, or Jaccard — whichever is higher |
| Category fit | 0.15 | Exact category match |
| Audience size | 0.15 | **Log-saturated** at 100k |
| Author quality | 0.15 | Rolling engagement prior |
| Geography | 0.10 | Overlap with the campaign's target countries |

Audience size saturates deliberately. A 2M-follower account is not twenty times
better than a 100k one for most briefs, and treating it that way is how
mid-tier creators get squeezed out of a marketplace.

The score is stored on the application, so a brand's shortlist is ordered by
fit rather than by who applied first — which is the only thing that makes an
open brief better than a DM.

## Money

Every movement of value is one `ledger_entries` row. A balance is
`SUM(amount − fee) WHERE status = 'cleared'`. There is no mutable balance
column.

Amounts are `bigint` minor units end to end, and **strings on the wire** —
`Number` loses precision past 2^53 and JSON has no other integer type.

- `idempotencyKey` is unique in the database. A retried webhook cannot pay
  twice; a repeat returns the existing row, which is correct rather than an
  error.
- A payout writes its debit **before** attempting the transfer, so the same
  balance cannot be requested twice while one is in flight. A failure reverses
  it with an explicit adjustment entry.
- The platform fee is `COMMUNITY_PLATFORM_FEE_BPS` (default 1000 = 10%),
  applied per credit. Referral rewards are `feeExempt` — we fund those.

Payment *capture* is not here. Stripe (or Gaddr Pay) takes the card; this
records what happened once it has. Read skill `gaddr-payments` before wiring a
provider — its idempotency and webhook rules are load-bearing.

## Affiliate attribution

A short code resolves through our redirector, which records the click and 302s.
Deliberately unguarded — the whole point is that anyone can follow it — and it
never echoes the destination in a body, so it cannot be used as an
open-redirect probe with a readable response.

The visitor's IP is truncated to a /24 (or /48) before storage: enough to
deduplicate a refresh, not enough to single out a household. That trade keeps
the attribution useful and stops the row being personal data.

Commission is the product's `affiliateRateBps` applied to the sale value,
credited with the click reference as the idempotency key.

## Sharing grows the author

A share is recorded on the **outbound click**, not the inbound visit, so it
counts even when the recipient never opens it. The response carries a short
`referralCode` embedded in the shared URL; arriving traffic reports it back and
both the sharer and the author are credited.

That is what makes "sharing a post grows the author's profile" a number both
parties can see in their analytics rather than a slogan.

## The free tier stays usable

Nothing in the social layer is gated on payment:

- Posting, replying, reposting, polls, stories, messaging — free, unlimited
  within the abuse limits.
- Both feeds and the full algorithm controls — free.
- A channel, ingest keys, LL-HLS playback, VOD, clips, chat — free.
- Courses with a null price are free forever, certification included.
- Analytics — free.

What money buys is *distribution* (sponsored placement) and *transactions*
(tips, subscriptions, storefronts), not the ability to use the product.

## Reach means reach

Creator analytics reports `reach` as **distinct actors**, not impressions, and
says so on the card.

Conflating the two is the most common way a creator dashboard flatters its
numbers, and a creator who prices a brand deal off an inflated reach figure
finds out the expensive way.
