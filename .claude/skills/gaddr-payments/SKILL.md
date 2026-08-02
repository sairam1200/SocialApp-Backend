---
name: gaddr-payments
description: Payments for Gaddr — Stripe, Gaddr Pay, international/SEPA, subscriptions, payouts to creators, selling posts and sponsored content, and on-chain settlement. Use when implementing checkout, webhooks, refunds, payout flows, marketplace splits, or asked about PCI, PSD2/SCA, or currency handling.
when_to_use: Trigger phrases include "take a payment", "checkout", "Stripe", "subscription", "billing", "invoice", "refund", "chargeback", "pay out to a creator", "Connect account", "marketplace split", "sell a post", "sponsored content", "SEPA", "3D Secure", "SCA", "VAT", "currency", "idempotency key", "payment webhook", and "how should money move".
---

# Gaddr payments

Nothing is implemented yet. This skill exists so the first implementation is built
correctly rather than retrofitted.

## Read this first

Payments assume sessions can be trusted and revoked. **The two critical findings that
blocked this are now closed** — C5 (revocation now falls back to the database and fails
closed) and C4 (tokens are authenticated AES-256-GCM). The auth layer is no longer the
reason to wait.

What remains genuinely blocking, and why each matters here:

- **`ENCRYPTION_KEY` has not been rotated** after being exposed in the committed
  database dump. Anything encrypted under it, including future payment metadata,
  should be treated as compromised until it is.
- **Better Auth session tokens are still plaintext** in the `session` table (H2). A
  database read is a session takeover, which on a payment flow is a chargeback engine.
- **No CSP, and access tokens sit in `localStorage`** on the client (H3). Card data
  never reaches Gaddr, but an XSS that steals a session can still spend a stored
  payment method.

Close H2 and rotate the key before taking money.

## Hard rules

- **Never touch raw card data.** Stripe Elements / Checkout only, so the browser
  posts card details straight to Stripe and the PAN never reaches Gaddr servers.
  This keeps scope at SAQ A. Any server-side card handling escalates PCI scope
  enormously.
- **Amounts are integer minor units.** `1250` = 12.50 SEK. Never floats — binary
  floating point cannot represent 0.10, and rounding drift in money is a
  reconciliation nightmare. Store the currency alongside every amount; never assume
  a default.
- **The webhook is the source of truth, not the redirect.** A user closing the tab
  after paying must still get their entitlement. Never grant access on the success
  redirect alone.
- **Verify webhook signatures** with `stripe.webhooks.constructEvent` and the raw
  body. NestJS parses JSON by default, which destroys the signature — the webhook
  route needs `rawBody`.
- **Idempotency everywhere.** Send an `Idempotency-Key` on every mutating Stripe
  call. Stripe redelivers webhooks, so persist processed `event.id` and no-op on
  repeats. Without this, a retry double-charges or double-credits.
- **Never log a full payment payload.** Route through `winston.util`, which redacts.

## Money in this product

Three distinct flows, with different regulatory weight:

1. **Platform subscriptions** — Gaddr charges the user. Simplest: Stripe Billing.
2. **Marketplace** — a creator sells a post, service, or sponsored content and Gaddr
   takes a fee. This makes Gaddr an intermediary, which means **Stripe Connect**
   (Express accounts), KYC on the seller, and payouts. Do not build this as
   "charge buyer, then transfer" from a single account; that is money
   transmission. Use Connect's `application_fee_amount` with a destination charge
   so Stripe is the regulated party.
3. **Gaddr Pay / on-chain** — see the boundary note below.

## European constraints (primary market)

- **SCA / PSD2** is mandatory for EEA cards. Use PaymentIntents and handle
  `requires_action`; a flow that assumes immediate success will fail on most
  European cards. Test with Stripe's SCA test cards, not just `4242…`.
- **VAT** on digital services is charged at the *customer's* location, not Gaddr's.
  Use Stripe Tax rather than hand-rolling rates. Collect and store the evidence
  used to determine location.
- **Strong customer identification** for sellers: Mobile BankID is the Swedish
  norm. See the `gaddr-fraud-identity` skill.
- **14-day withdrawal right** applies to consumers, with a documented waiver for
  immediately-delivered digital content. Get the waiver wording reviewed.
- **SEPA** for payouts in EUR; **Swish/Bankgirot** are the Swedish rails users
  expect. Stripe covers SEPA; Swish needs a separate provider.

## Fiat and crypto must not share a code path

Fiat (Stripe, Gaddr Pay) is reversible, custodial, and regulated. On-chain
settlement (ETH, Gaddr Chains, NFT-gated content) is irreversible and
non-custodial. They have opposite failure modes, so keep them behind one
`PaymentProvider` interface with separate implementations, and never let a crypto
failure roll back a fiat ledger entry or vice versa.

For on-chain: never hold user private keys. Sign client-side (wallet connect), and
treat a transaction as settled only after a documented confirmation depth. Reorgs
are real.

## Architecture in this codebase

Follow the existing clean-architecture slices — payments is not special:

```
features/payments/<use-case>/        endpoint + handler (CQRS)
domain/services/ipayment.service.ts  provider-agnostic interface
domain/entities/                     Ledger, Payout, Subscription entities
infrastructure/services/payments/    StripePaymentService, GaddrPayService
```

- Register the DI token in `core/utils/const.ts` and `infrastructure/dependency.ts`.
- Add every env var to `src/configs.ts` as `.required()` with **no default**.
- **Keep a double-entry ledger in Gaddr's own database.** Never treat Stripe as
  your ledger: you need to answer "what do we owe this creator" without an API
  call, and you need an audit trail that survives a provider change.
- Every ledger row is append-only. Corrections are compensating entries, never
  updates.

## Testing

- Stripe test mode + `stripe listen --forward-to localhost:8080/api/v1/payments/webhook`.
- Test the paths that actually break: webhook replay, `requires_action`, a webhook
  arriving *before* the redirect, refund after payout, and a failed payout.
- Assert idempotency explicitly: fire the same webhook twice, assert one ledger entry.
