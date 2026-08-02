---
name: gaddr-fraud-identity
description: Identity verification and fraud/abuse defence for Gaddr — Mobile BankID, KYC for sellers and investors, account-takeover prevention, bot and spam defence, tracking and audit trails, and trust signals. Use when implementing verification badges, seller onboarding, abuse controls, or asked about BankID, KYC/AML, or fraud detection.
when_to_use: Trigger phrases include "verified badge", "blue check", "verify a user", "BankID", "KYC", "AML", "onboard a seller", "prove identity", "account takeover", "suspicious login", "bot signup", "spam", "abuse report", "ban a user", "audit trail", "who changed this", "trust signal", and "is this account real".
---

# Gaddr fraud, identity and trust

## Two different meanings of "verified" — keep them apart

Gaddr already has a `verified` flag on profiles and linked accounts. That means
**"this person controls this social handle"** — proven by OAuth. It is not identity.

Mobile BankID proves **"this is a specific legal person"**. Conflating the two in
one boolean is a trust bug: a user with a verified TikTok handle is not
identity-verified, and a badge implying otherwise misleads buyers and investors.

Model them as separate fields with separate badges:

```
LinkedAccount.verified        platform control, via OAuth
User.identityVerifiedAt       legal identity, via BankID
User.kycTier                  none | identity | seller | investor
```

## Mobile BankID

**Never integrate the raw BankID API directly for a first build.** It requires an
RP certificate issued through a Swedish bank, mutual TLS, and a formal agreement.
Use a broker (Criipto, Signicat, ZignSec, Svensk e-identitet) which handles the
certificate and gives you OIDC. Move to direct integration only when volume
justifies it.

Rules that catch people out:

- **The personal number (personnummer) is sensitive personal data under GDPR.**
  Store a salted hash for deduplication, plus a truncated form (`YYYYMMDD`) if you
  need age. Do not store the full number unless a specific legal basis requires it,
  and document that basis.
- BankID returns the verified **name**. Treat it as authoritative for KYC and keep
  it separate from the user's chosen display name — people have legitimate reasons
  to display something else.
- **Sessions from BankID are not automatically more trusted later.** Record
  `identityVerifiedAt`; re-verify for high-risk actions rather than trusting a
  months-old check.
- Handle every terminal state: `userCancel`, `expiredTransaction`,
  `certificateErr`, `startFailed`. A flow that only handles success will strand
  users.
- Test with the BankID **test environment** and test personal numbers, never real ones.

## KYC tiers, driven by what the user does

Escalate on action, not at signup — friction at signup kills conversion:

| Tier | Trigger | Requires |
|---|---|---|
| none | Browsing, public profile | Email |
| identity | Verified badge, higher limits | BankID |
| seller | **Receiving money** | BankID + Stripe Connect onboarding (Stripe runs its own KYC/AML) |
| investor | Investment features | Identity + suitability assessment — get legal review; this may be a regulated activity |

Let Stripe Connect carry seller KYC/AML. Rebuilding it means becoming the regulated
party.

## Fraud and abuse surfaces in this product

Ranked by how exposed they are today:

1. **Account takeover.** Access tokens still sit in `localStorage` (XSS-readable) with
   no CSP. That is now the largest open surface. Session revocation itself is fixed —
   the guard falls back to the database and fails closed (C5).
2. **Public search.** Now rate-limited with atomic Redis counting, per user when
   authenticated and per client IP otherwise. Still worth watching as a scraping
   vector.
3. **Fake profiles and impersonation.** A universal-profile product is an
   impersonation target by design. OAuth-proven handles are the main defence; the
   badge must clearly distinguish proven from self-asserted.
4. **Payment fraud.** Stripe Radar covers card fraud. Gaddr-specific risk is
   *seller* fraud: paid content never delivered. Hold payouts for a dispute window.
5. **Spam and bots.** Cloudflare Turnstile is already wired (`TURNSTILE_SECRET_KEY`,
   `turnstile.guard.ts`) but applied to only **one** endpoint. Registration and
   any public write path should use it.

## Signals worth recording

Build the audit trail before you build scoring — you cannot detect patterns in data
you never kept. The `userLogins` table and `analyticsEvents` already exist; extend
rather than adding a parallel store.

Per authentication and per sensitive action: timestamp, IP, coarse geo
(`geoip-lite` is a dependency), user agent (`useragent` too), device ID,
and outcome. `ipUtil.hasIpChanged` already exists and is referenced in
`refresh-token.handler.ts` — where the notification is still a `TODO`. That
notification is a cheap, high-value win.

Rules that catch real abuse without a model:
- Impossible travel between consecutive logins.
- Many failed logins across *different* accounts from one IP (credential stuffing);
  per-account counting misses it.
- A new device plus a password change plus an email change in one session.
- Sudden follow or search volume beyond human rates — `DAILY_FOLLOW_LIMIT` exists.

## Privacy is a constraint on all of this

Tracking for fraud is legitimate, but under GDPR it needs a documented lawful basis
(legitimate interest), a retention limit, and a note in the privacy policy. Fraud
signals are personal data.

- Set a retention period per signal type and actually delete. Indefinite logs are a
  liability, as the committed database dump demonstrated.
- Never use fraud data for marketing or ranking. Purpose limitation is binding.
- `searchHistories` is behavioural data about real people. It needs the same
  retention discipline and must be included in data-export and deletion requests.
- A `/data-deletion` route exists. Verify it actually removes fraud and analytics
  records, not only the profile.
