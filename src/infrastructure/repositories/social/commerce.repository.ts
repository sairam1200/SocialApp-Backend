import { InjectRepository } from '@nestjs/typeorm';
import { Injectable } from '@nestjs/common';
import { In, Repository } from 'typeorm';
import {
  AffiliateClick,
  AffiliateLink,
  Campaign,
  CampaignApplication,
  CreatorSubscription,
  LedgerEntry,
  Payout,
  Product,
  SubscriptionTier,
} from '../../../domain/entities/social';
import { CampaignStatus, LedgerEntryStatus } from '../../../domain/enums';
import { ICommerceRepository } from '../../../domain/repositories/isocial.repository';
import { escapeLike } from './socialProfile.repository';

@Injectable()
export class CommerceRepository implements ICommerceRepository {
  constructor(
    @InjectRepository(Product)
    private readonly products: Repository<Product>,
    @InjectRepository(Campaign)
    private readonly campaigns: Repository<Campaign>,
    @InjectRepository(CampaignApplication)
    private readonly applications: Repository<CampaignApplication>,
    @InjectRepository(AffiliateLink)
    private readonly affiliateLinks: Repository<AffiliateLink>,
    @InjectRepository(AffiliateClick)
    private readonly affiliateClicks: Repository<AffiliateClick>,
    @InjectRepository(LedgerEntry)
    private readonly ledger: Repository<LedgerEntry>,
    @InjectRepository(Payout)
    private readonly payouts: Repository<Payout>,
    @InjectRepository(SubscriptionTier)
    private readonly tiers: Repository<SubscriptionTier>,
    @InjectRepository(CreatorSubscription)
    private readonly subscriptions: Repository<CreatorSubscription>,
  ) {}

  /* -------------------------------------------------------------- products */

  public async getProductAsync(id: string): Promise<Product | null> {
    if (!id) return null;
    return this.products.findOne({ where: { id } });
  }

  public async getProductsAsync(ids: string[]): Promise<Product[]> {
    if (ids.length === 0) return [];
    return this.products.find({ where: { id: In(ids) } });
  }

  public async listProductsAsync(
    profileId: string,
    limit: number,
  ): Promise<Product[]> {
    return this.products.find({
      where: { profileId, isActive: true },
      order: { createdOn: 'DESC' },
      take: Math.min(limit, 200),
    });
  }

  public async saveProductAsync(product: Product): Promise<Product> {
    return this.products.save(product);
  }

  public async deleteProductAsync(id: string): Promise<void> {
    await this.products.delete(id);
  }

  public async searchProductsAsync(
    term: string,
    limit: number,
  ): Promise<Product[]> {
    const needle = escapeLike(term);
    if (!needle) return [];
    return this.products
      .createQueryBuilder('p')
      .where('p."isActive" = true')
      .andWhere('p."searchText" ILIKE :needle', { needle: `%${needle}%` })
      .orderBy('p."salesCount"', 'DESC')
      .limit(Math.min(limit, 100))
      .getMany();
  }

  public async getProductCandidateIdsAsync(
    topics: string[],
    limit: number,
  ): Promise<string[]> {
    const builder = this.products
      .createQueryBuilder('p')
      .select('p.id', 'id')
      .where('p."isActive" = true')
      .orderBy('p."salesCount"', 'DESC')
      .addOrderBy('p."clicksCount"', 'DESC')
      .limit(Math.min(limit, 300));
    if (topics.length > 0) {
      builder.andWhere('p."topics" && :topics', { topics });
    }
    const rows = await builder.getRawMany<{ id: string }>();
    return rows.map((r) => r.id);
  }

  public async incrementProductCountersAsync(
    id: string,
    deltas: Partial<Pick<Product, 'clicksCount' | 'salesCount'>>,
  ): Promise<void> {
    const entries = Object.entries(deltas).filter(
      ([, value]) => typeof value === 'number' && value !== 0,
    );
    if (entries.length === 0) return;
    const assignments = entries
      .map(
        ([column], index) =>
          `"${column}" = GREATEST(0, "${column}" + $${index + 2})`,
      )
      .join(', ');
    await this.products.query(
      `UPDATE "social"."products" SET ${assignments} WHERE "id" = $1`,
      [id, ...entries.map(([, value]) => value)],
    );
  }

  /* ------------------------------------------------------------- campaigns */

  public async getCampaignAsync(id: string): Promise<Campaign | null> {
    if (!id) return null;
    return this.campaigns.findOne({ where: { id } });
  }

  public async listCampaignsAsync(
    filters: {
      brandProfileId?: string;
      status?: CampaignStatus;
      topics?: string[];
    },
    limit: number,
  ): Promise<Campaign[]> {
    const builder = this.campaigns
      .createQueryBuilder('c')
      .orderBy('c."createdOn"', 'DESC')
      .limit(Math.min(limit, 200));
    if (filters.brandProfileId) {
      builder.andWhere('c."brandProfileId" = :brandProfileId', {
        brandProfileId: filters.brandProfileId,
      });
    }
    if (filters.status) {
      builder.andWhere('c."status" = :status', { status: filters.status });
    }
    if (filters.topics?.length) {
      builder.andWhere('c."topics" && :topics', { topics: filters.topics });
    }
    return builder.getMany();
  }

  public async saveCampaignAsync(campaign: Campaign): Promise<Campaign> {
    return this.campaigns.save(campaign);
  }

  public async getApplicationAsync(
    campaignId: string,
    creatorProfileId: string,
  ): Promise<CampaignApplication | null> {
    return this.applications.findOne({
      where: { campaignId, creatorProfileId },
    });
  }

  public async listApplicationsAsync(
    campaignId: string,
  ): Promise<CampaignApplication[]> {
    return this.applications.find({
      where: { campaignId },
      order: { matchScore: 'DESC' },
      take: 500,
    });
  }

  public async listApplicationsForCreatorAsync(
    creatorProfileId: string,
  ): Promise<CampaignApplication[]> {
    return this.applications.find({
      where: { creatorProfileId },
      order: { createdOn: 'DESC' },
      take: 200,
    });
  }

  public async saveApplicationAsync(
    application: CampaignApplication,
  ): Promise<CampaignApplication> {
    return this.applications.save(application);
  }

  /* ------------------------------------------------------------- affiliate */

  public async getAffiliateLinkByCodeAsync(
    code: string,
  ): Promise<AffiliateLink | null> {
    if (!code) return null;
    return this.affiliateLinks.findOne({ where: { code } });
  }

  public async listAffiliateLinksAsync(
    creatorProfileId: string,
  ): Promise<AffiliateLink[]> {
    return this.affiliateLinks.find({
      where: { creatorProfileId },
      order: { createdOn: 'DESC' },
      take: 200,
    });
  }

  public async saveAffiliateLinkAsync(
    link: AffiliateLink,
  ): Promise<AffiliateLink> {
    return this.affiliateLinks.save(link);
  }

  public async recordAffiliateClickAsync(
    click: AffiliateClick,
  ): Promise<AffiliateClick> {
    const saved = await this.affiliateClicks.save(click);
    await this.affiliateLinks.query(
      `UPDATE "social"."affiliate_links" SET "clicksCount" = "clicksCount" + 1 WHERE "id" = $1`,
      [click.linkId],
    );
    return saved;
  }

  /* ----------------------------------------------------------------- money */

  public async createLedgerEntryAsync(
    entry: LedgerEntry,
  ): Promise<LedgerEntry> {
    return this.ledger.save(entry);
  }

  public async getLedgerEntryByIdempotencyKeyAsync(
    key: string,
  ): Promise<LedgerEntry | null> {
    if (!key) return null;
    return this.ledger.findOne({ where: { idempotencyKey: key } });
  }

  public async listLedgerAsync(
    profileId: string,
    limit: number,
  ): Promise<LedgerEntry[]> {
    return this.ledger.find({
      where: { profileId },
      order: { createdOn: 'DESC' },
      take: Math.min(limit, 500),
    });
  }

  /**
   * The balance is derived, never stored.
   *
   * `SUM` over cleared entries is the whole definition; a cached column would
   * be one more thing that can disagree with the ledger, and for money the
   * ledger has to be the only thing that can be right.
   *
   * `bigint` comes back from `pg` as a string. Kept as a string all the way to
   * the client — `Number` silently loses precision past 2^53, and money is
   * exactly where that matters.
   */
  public async getBalanceMinorAsync(profileId: string): Promise<{
    availableMinor: string;
    pendingMinor: string;
    currency: string;
  }> {
    const rows = await this.ledger.query(
      `
      SELECT
        COALESCE(SUM(CASE WHEN "status" = $2 THEN "amountMinor" - "feeMinor" ELSE 0 END), 0)::text AS available,
        COALESCE(SUM(CASE WHEN "status" = $3 THEN "amountMinor" - "feeMinor" ELSE 0 END), 0)::text AS pending,
        COALESCE(MAX("currency"), 'EUR') AS currency
      FROM "social"."ledger_entries"
      WHERE "profileId" = $1
      `,
      [profileId, LedgerEntryStatus.Cleared, LedgerEntryStatus.Pending],
    );
    const row = (
      rows as Array<{
        available: string;
        pending: string;
        currency: string;
      }>
    )[0];
    return {
      availableMinor: row?.available ?? '0',
      pendingMinor: row?.pending ?? '0',
      currency: row?.currency ?? 'EUR',
    };
  }

  public async createPayoutAsync(payout: Payout): Promise<Payout> {
    return this.payouts.save(payout);
  }

  public async listPayoutsAsync(
    profileId: string,
    limit: number,
  ): Promise<Payout[]> {
    return this.payouts.find({
      where: { profileId },
      order: { createdOn: 'DESC' },
      take: Math.min(limit, 200),
    });
  }

  public async updatePayoutAsync(
    id: string,
    changes: Partial<Payout>,
  ): Promise<Payout | null> {
    await this.payouts.update(id, changes);
    return this.payouts.findOne({ where: { id } });
  }

  /* --------------------------------------------------------- subscriptions */

  public async listTiersAsync(
    creatorProfileId: string,
  ): Promise<SubscriptionTier[]> {
    return this.tiers.find({
      where: { creatorProfileId, isActive: true },
      order: { priceMinor: 'ASC' },
    });
  }

  public async getTierAsync(id: string): Promise<SubscriptionTier | null> {
    if (!id) return null;
    return this.tiers.findOne({ where: { id } });
  }

  public async saveTierAsync(
    tier: SubscriptionTier,
  ): Promise<SubscriptionTier> {
    return this.tiers.save(tier);
  }

  public async getSubscriptionAsync(
    tierId: string,
    subscriberProfileId: string,
  ): Promise<CreatorSubscription | null> {
    return this.subscriptions.findOne({
      where: { tierId, subscriberProfileId },
    });
  }

  public async listSubscriptionsForCreatorAsync(
    creatorProfileId: string,
  ): Promise<CreatorSubscription[]> {
    return this.subscriptions.find({
      where: { creatorProfileId },
      order: { createdOn: 'DESC' },
      take: 1000,
    });
  }

  public async listSubscriptionsForSubscriberAsync(
    subscriberProfileId: string,
  ): Promise<CreatorSubscription[]> {
    return this.subscriptions.find({
      where: { subscriberProfileId },
      order: { createdOn: 'DESC' },
      take: 200,
    });
  }

  public async saveSubscriptionAsync(
    subscription: CreatorSubscription,
  ): Promise<CreatorSubscription> {
    return this.subscriptions.save(subscription);
  }
}
