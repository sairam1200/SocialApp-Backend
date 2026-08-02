import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { nanoid } from 'nanoid';
import configs from '../../../configs';
import _const from '../../../core/utils/const';
import {
  AffiliateClick,
  AffiliateLink,
  LedgerEntry,
  Payout,
} from '../../../domain/entities/social';
import {
  LedgerEntryKind,
  LedgerEntryStatus,
  PayoutStatus,
} from '../../../domain/enums';
import { BalanceModel } from '../../../domain/contracts/social.model';
import {
  ICommerceRepository,
  ISocialProfileRepository,
} from '../../../domain/repositories/isocial.repository';

/** Below this, a payout costs more in fees than it moves. */
const MINIMUM_PAYOUT_MINOR = 2000n;

/**
 * Money.
 *
 * Every movement of value is one `ledger_entries` row and a balance is the sum
 * of the cleared ones. There is no mutable balance column, because the only
 * property that matters for money is that a wrong number can be reconstructed
 * from what actually happened.
 *
 * Amounts are `bigint` throughout — minor units, never floats, never `number`.
 * `Number` loses precision past 2^53 and JavaScript's `0.1 + 0.2` is exactly
 * the class of bug that must not reach a creator's earnings.
 *
 * Payment *capture* is not here. Stripe (or Gaddr Pay) takes the card; this
 * records what happened once it has. See skill `gaddr-payments` before wiring
 * a provider — the idempotency and webhook rules there are load-bearing.
 */
@Injectable()
export class MonetizationService {
  constructor(
    @Inject(_const.ICOMMERCE_REPOSITORY)
    private readonly commerce: ICommerceRepository,
    @Inject(_const.ISOCIALPROFILE_REPOSITORY)
    private readonly profiles: ISocialProfileRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Credit a creator, taking the platform fee.
   *
   * `idempotencyKey` is mandatory and unique in the database, so a retried
   * webhook cannot pay twice. Returning the existing row on a repeat is the
   * correct behaviour, not an error — the caller asked for the same thing.
   */
  public async creditAsync(input: {
    profileId: string;
    kind: LedgerEntryKind;
    amountMinor: bigint;
    currency?: string;
    counterpartyProfileId?: string;
    relatedPostId?: string;
    relatedEntityId?: string;
    idempotencyKey: string;
    description?: string;
    /** Skip the platform fee — used for referral rewards we fund ourselves. */
    feeExempt?: boolean;
  }): Promise<LedgerEntry> {
    if (input.amountMinor <= 0n) {
      throw new BadRequestException('Amount must be positive.');
    }
    if (!input.idempotencyKey) {
      throw new BadRequestException('An idempotency key is required.');
    }

    const existing = await this.commerce.getLedgerEntryByIdempotencyKeyAsync(
      input.idempotencyKey,
    );
    if (existing) return existing;

    const feeBps = input.feeExempt
      ? 0
      : (configs.community?.platformFeeBps ?? 1000);
    const feeMinor = (input.amountMinor * BigInt(feeBps)) / 10000n;

    const entry = await this.commerce.createLedgerEntryAsync(
      new LedgerEntry({
        profileId: input.profileId,
        kind: input.kind,
        status: LedgerEntryStatus.Cleared,
        amountMinor: input.amountMinor.toString(),
        feeMinor: feeMinor.toString(),
        currency: input.currency ?? 'EUR',
        counterpartyProfileId: input.counterpartyProfileId ?? null,
        relatedPostId: input.relatedPostId ?? null,
        relatedEntityId: input.relatedEntityId ?? null,
        idempotencyKey: input.idempotencyKey,
        description: input.description,
      }),
    );

    this.eventEmitter.emit('social.earnings.credited', {
      profileId: input.profileId,
      kind: input.kind,
      amountMinor: input.amountMinor.toString(),
      netMinor: (input.amountMinor - feeMinor).toString(),
    });
    return entry;
  }

  /** A tip from one profile to another. */
  public async tipAsync(input: {
    fromUserId: string;
    toProfileId: string;
    amountMinor: bigint;
    currency?: string;
    postId?: string;
    message?: string;
    idempotencyKey?: string;
  }): Promise<LedgerEntry> {
    const from = await this.profiles.getByUserIdAsync(input.fromUserId);
    if (!from) throw new NotFoundException('Community profile not found.');

    const to = await this.profiles.getByIdAsync(input.toProfileId);
    if (!to) throw new NotFoundException('Recipient not found.');
    if (!to.tipsEnabled) {
      throw new ForbiddenException('This profile is not accepting tips.');
    }
    if (from.id === to.id) {
      throw new BadRequestException('You cannot tip yourself.');
    }

    return this.creditAsync({
      profileId: to.id,
      kind: LedgerEntryKind.Tip,
      amountMinor: input.amountMinor,
      currency: input.currency,
      counterpartyProfileId: from.id,
      relatedPostId: input.postId,
      idempotencyKey: input.idempotencyKey ?? `tip:${from.id}:${nanoid(16)}`,
      description: input.message?.slice(0, 400),
    });
  }

  public async getBalanceAsync(userId: string): Promise<BalanceModel> {
    const profile = await this.profiles.getByUserIdAsync(userId);
    if (!profile) throw new NotFoundException('Community profile not found.');

    const balance = await this.commerce.getBalanceMinorAsync(profile.id);
    const entries = await this.commerce.listLedgerAsync(profile.id, 500);

    const lifetimeEarned = entries
      .filter(
        (e) =>
          e.status === LedgerEntryStatus.Cleared &&
          e.kind !== LedgerEntryKind.Payout,
      )
      .reduce((sum, e) => sum + BigInt(e.amountMinor) - BigInt(e.feeMinor), 0n);

    return {
      availableMinor: balance.availableMinor,
      pendingMinor: balance.pendingMinor,
      currency: balance.currency,
      lifetimeEarnedMinor: lifetimeEarned.toString(),
    };
  }

  /**
   * Request a payout.
   *
   * The debit is written *before* the transfer is attempted, so a creator
   * cannot request the same balance twice while the first is in flight. If the
   * transfer fails, `markPayoutFailedAsync` reverses the debit — which is
   * exactly why a ledger beats a mutable balance.
   */
  public async requestPayoutAsync(input: {
    userId: string;
    amountMinor: bigint;
  }): Promise<Payout> {
    const profile = await this.profiles.getByUserIdAsync(input.userId);
    if (!profile) throw new NotFoundException('Community profile not found.');

    const balance = await this.commerce.getBalanceMinorAsync(profile.id);
    const available = BigInt(balance.availableMinor);

    if (input.amountMinor < MINIMUM_PAYOUT_MINOR) {
      throw new BadRequestException(
        `The minimum payout is ${Number(MINIMUM_PAYOUT_MINOR) / 100} ${balance.currency}.`,
      );
    }
    if (input.amountMinor > available) {
      throw new BadRequestException('Amount exceeds your available balance.');
    }

    const payout = await this.commerce.createPayoutAsync(
      new Payout({
        profileId: profile.id,
        amountMinor: input.amountMinor.toString(),
        currency: balance.currency,
        status: PayoutStatus.Requested,
      }),
    );

    await this.commerce.createLedgerEntryAsync(
      new LedgerEntry({
        profileId: profile.id,
        kind: LedgerEntryKind.Payout,
        status: LedgerEntryStatus.Cleared,
        amountMinor: (-input.amountMinor).toString(),
        feeMinor: '0',
        currency: balance.currency,
        relatedEntityId: payout.id,
        idempotencyKey: `payout:${payout.id}`,
        description: 'Payout requested',
      }),
    );

    this.eventEmitter.emit('social.payout.requested', {
      payoutId: payout.id,
      profileId: profile.id,
      amountMinor: input.amountMinor.toString(),
    });
    return payout;
  }

  /** Reverse a failed payout, returning the funds to the available balance. */
  public async markPayoutFailedAsync(
    payoutId: string,
    reason: string,
  ): Promise<void> {
    const payouts = await this.commerce.updatePayoutAsync(payoutId, {
      status: PayoutStatus.Failed,
      failureReason: reason.slice(0, 400),
    });
    if (!payouts) return;

    await this.commerce.createLedgerEntryAsync(
      new LedgerEntry({
        profileId: payouts.profileId,
        kind: LedgerEntryKind.Adjustment,
        status: LedgerEntryStatus.Cleared,
        amountMinor: payouts.amountMinor.replace(/^-/, ''),
        feeMinor: '0',
        currency: payouts.currency,
        relatedEntityId: payouts.id,
        idempotencyKey: `payout-reversal:${payouts.id}`,
        description: `Payout reversed: ${reason}`.slice(0, 400),
      }),
    );
  }

  /* -------------------------------------------------------------- affiliate */

  public async createAffiliateLinkAsync(input: {
    userId: string;
    targetUrl: string;
    productId?: string;
    postId?: string;
  }): Promise<AffiliateLink> {
    const profile = await this.profiles.getByUserIdAsync(input.userId);
    if (!profile) throw new NotFoundException('Community profile not found.');

    if (!/^https?:\/\//i.test(input.targetUrl)) {
      throw new BadRequestException('The link must be an http(s) URL.');
    }

    return this.commerce.saveAffiliateLinkAsync(
      new AffiliateLink({
        code: nanoid(10),
        creatorProfileId: profile.id,
        productId: input.productId ?? null,
        postId: input.postId ?? null,
        targetUrl: input.targetUrl.slice(0, 1024),
      }),
    );
  }

  /**
   * Resolve an affiliate code to its destination, recording the click.
   *
   * The visitor's IP is truncated before storage — enough to deduplicate a
   * refresh, not enough to identify a person. That is a deliberate trade: the
   * attribution stays useful and the row stops being personal data.
   */
  public async resolveAffiliateClickAsync(input: {
    code: string;
    visitorProfileId?: string | null;
    ip?: string;
    referrer?: string;
  }): Promise<string | null> {
    const link = await this.commerce.getAffiliateLinkByCodeAsync(input.code);
    if (!link || !link.isActive) return null;

    await this.commerce.recordAffiliateClickAsync(
      new AffiliateClick({
        linkId: link.id,
        visitorProfileId: input.visitorProfileId ?? null,
        ipPrefix: truncateIp(input.ip),
        referrer: input.referrer?.slice(0, 256),
      }),
    );

    if (link.productId) {
      await this.commerce.incrementProductCountersAsync(link.productId, {
        clicksCount: 1,
      });
    }
    return link.targetUrl;
  }

  /**
   * A conversion attributed to an affiliate link.
   *
   * Called by the merchant webhook. The commission is the product's rate
   * applied to the sale value, credited with the click id as the idempotency
   * key so a replayed webhook pays once.
   */
  public async recordAffiliateConversionAsync(input: {
    code: string;
    saleValueMinor: bigint;
    currency?: string;
    externalReference: string;
  }): Promise<LedgerEntry | null> {
    const link = await this.commerce.getAffiliateLinkByCodeAsync(input.code);
    if (!link) return null;

    const product = link.productId
      ? await this.commerce.getProductAsync(link.productId)
      : null;
    const rateBps = BigInt(product?.affiliateRateBps ?? 0);
    if (rateBps === 0n) return null;

    const commission = (input.saleValueMinor * rateBps) / 10000n;
    if (commission <= 0n) return null;

    await this.commerce.saveAffiliateLinkAsync(
      Object.assign(link, {
        conversionsCount: link.conversionsCount + 1,
        earnedMinor: (BigInt(link.earnedMinor) + commission).toString(),
      }),
    );
    if (link.productId) {
      await this.commerce.incrementProductCountersAsync(link.productId, {
        salesCount: 1,
      });
    }

    return this.creditAsync({
      profileId: link.creatorProfileId,
      kind: LedgerEntryKind.AffiliateCommission,
      amountMinor: commission,
      currency: input.currency ?? product?.currency ?? 'EUR',
      relatedEntityId: link.id,
      idempotencyKey: `affiliate:${link.id}:${input.externalReference}`,
      description: `Commission on ${product?.title ?? 'a sale'}`,
    });
  }
}

/**
 * Truncate an IP to a /24 (IPv4) or /48 (IPv6).
 *
 * Enough to tell two clicks from the same network apart from two clicks from
 * different continents; not enough to single out a household.
 */
export function truncateIp(ip?: string): string | undefined {
  if (!ip) return undefined;
  if (ip.includes(':')) {
    return `${ip.split(':').slice(0, 3).join(':')}::`;
  }
  const parts = ip.split('.');
  return parts.length === 4 ? `${parts.slice(0, 3).join('.')}.0` : undefined;
}
