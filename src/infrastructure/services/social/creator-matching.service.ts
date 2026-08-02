import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import _const from '../../../core/utils/const';
import {
  Campaign,
  CampaignApplication,
  SocialProfile,
} from '../../../domain/entities/social';
import {
  CampaignApplicationStatus,
  CampaignStatus,
  ProfileKind,
} from '../../../domain/enums';
import {
  ICommerceRepository,
  ISocialProfileRepository,
} from '../../../domain/repositories/isocial.repository';
import {
  cosineSimilarity,
  jaccard,
  logSaturate,
  reciprocalRankFusion,
  topicVector,
} from '../../../core/utils/recommendation';

/**
 * How much each signal contributes to a creator↔brand match.
 *
 * Topical fit dominates because it is the thing a brand actually buys.
 * Audience size matters but saturates — a 2M-follower account is not twenty
 * times better than a 100k one for most briefs, and treating it that way is
 * how mid-tier creators get squeezed out of a marketplace.
 */
const MATCH_WEIGHTS = {
  topicFit: 0.45,
  categoryFit: 0.15,
  audienceSize: 0.15,
  authorQuality: 0.15,
  geography: 0.1,
} as const;

export interface MatchResult {
  profileId: string;
  score: number;
  reasons: string[];
}

/**
 * Matches creators to brand campaigns, and campaigns to creators.
 *
 * Deliberately symmetric: `matchCreatorsToCampaignAsync` and
 * `matchCampaignsToCreatorAsync` compute the *same* score from the same
 * features, so a creator sees the same fit a brand does. A marketplace where
 * the two sides are scored differently is a marketplace where one side is
 * being sold something.
 *
 * Retrieval uses the recommender's fusion primitives rather than a second
 * ranking stack — "the same engine matches creators to brands" is an
 * architectural commitment, not a description.
 */
@Injectable()
export class CreatorMatchingService {
  constructor(
    @Inject(_const.ISOCIALPROFILE_REPOSITORY)
    private readonly profiles: ISocialProfileRepository,
    @Inject(_const.ICOMMERCE_REPOSITORY)
    private readonly commerce: ICommerceRepository,
  ) {}

  public async matchCreatorsToCampaignAsync(
    campaignId: string,
    limit = 25,
  ): Promise<MatchResult[]> {
    const campaign = await this.commerce.getCampaignAsync(campaignId);
    if (!campaign) throw new NotFoundException('Campaign not found.');

    const brand = await this.profiles.getByIdAsync(campaign.brandProfileId);
    const pool = await this.profiles.getCollaborationPoolAsync(
      campaign.topics,
      campaign.minFollowers ?? 0,
      300,
    );

    // Two retrieval views of the same pool — topical and audience — fused, so
    // a strong topical fit with a small audience still surfaces.
    const scored = pool.map((creator) => ({
      creator,
      score: this.score(campaign, creator, brand ?? null),
    }));

    const fused = reciprocalRankFusion([
      {
        source: 'topic-fit',
        ids: [...scored]
          .sort((a, b) => b.score.topicFit - a.score.topicFit)
          .map((s) => s.creator.id),
        weight: 1,
      },
      {
        source: 'audience',
        ids: [...scored]
          .sort((a, b) => b.creator.followersCount - a.creator.followersCount)
          .map((s) => s.creator.id),
        weight: 0.5,
      },
      {
        source: 'quality',
        ids: [...scored]
          .sort((a, b) => b.creator.authorQuality - a.creator.authorQuality)
          .map((s) => s.creator.id),
        weight: 0.5,
      },
    ]);

    const byId = new Map(scored.map((s) => [s.creator.id, s]));
    return fused
      .slice(0, limit)
      .map((f) => {
        const entry = byId.get(f.id);
        if (!entry) return null;
        return {
          profileId: f.id,
          score: entry.score.total,
          reasons: entry.score.reasons,
        };
      })
      .filter((m): m is MatchResult => m !== null)
      .sort((a, b) => b.score - a.score);
  }

  /** The creator's view of the same marketplace. */
  public async matchCampaignsToCreatorAsync(
    userId: string,
    limit = 25,
  ): Promise<Array<{ campaign: Campaign; score: number; reasons: string[] }>> {
    const creator = await this.profiles.getByUserIdAsync(userId);
    if (!creator) throw new NotFoundException('Community profile not found.');

    const open = await this.commerce.listCampaignsAsync(
      { status: CampaignStatus.Open },
      200,
    );

    return open
      .map((campaign) => {
        const score = this.score(campaign, creator, null);
        return { campaign, score: score.total, reasons: score.reasons };
      })
      .filter((m) => m.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * Apply to a campaign.
   *
   * The match score is stored on the application so the brand's shortlist is
   * ordered by fit rather than by who applied first — which is the only thing
   * that makes an open brief better than a DM.
   */
  public async applyAsync(input: {
    userId: string;
    campaignId: string;
    pitch?: string;
    quotedMinor?: bigint;
  }): Promise<CampaignApplication> {
    const creator = await this.profiles.getByUserIdAsync(input.userId);
    if (!creator) throw new NotFoundException('Community profile not found.');

    const campaign = await this.commerce.getCampaignAsync(input.campaignId);
    if (!campaign) throw new NotFoundException('Campaign not found.');
    if (campaign.status !== CampaignStatus.Open) {
      throw new ForbiddenException(
        'This campaign is not accepting applications.',
      );
    }
    if (
      campaign.applicationsCloseOn &&
      campaign.applicationsCloseOn.getTime() < Date.now()
    ) {
      throw new ForbiddenException(
        'Applications for this campaign have closed.',
      );
    }
    if (creator.kind === ProfileKind.Brand) {
      throw new ForbiddenException('Brands cannot apply to campaigns.');
    }

    const existing = await this.commerce.getApplicationAsync(
      campaign.id,
      creator.id,
    );
    if (existing) return existing;

    const score = this.score(campaign, creator, null);
    const application = await this.commerce.saveApplicationAsync(
      new CampaignApplication({
        campaignId: campaign.id,
        creatorProfileId: creator.id,
        status: CampaignApplicationStatus.Applied,
        pitch: input.pitch?.slice(0, 2000),
        quotedMinor: input.quotedMinor?.toString(),
        matchScore: score.total,
      }),
    );

    await this.commerce.saveCampaignAsync(
      Object.assign(campaign, {
        applicationsCount: campaign.applicationsCount + 1,
      }),
    );
    return application;
  }

  /**
   * The score, and why.
   *
   * Every term is in [0,1] and the weights sum to 1, so the total is directly
   * comparable across campaigns — which is what lets a creator sort their
   * opportunities and a brand sort its applicants with the same number.
   */
  private score(
    campaign: Campaign,
    creator: SocialProfile,
    brand: SocialProfile | null,
  ): { total: number; topicFit: number; reasons: string[] } {
    const campaignVector = topicVector({
      topics: campaign.topics,
      body: `${campaign.title} ${campaign.brief}`,
    });
    const creatorVector = topicVector({
      topics: creator.topics,
      body: `${creator.headline ?? ''} ${creator.bio ?? ''}`,
    });

    const topicFit = Math.max(
      cosineSimilarity(campaignVector, creatorVector),
      jaccard(campaign.topics, creator.topics),
    );

    const categoryFit =
      brand?.category && creator.category
        ? brand.category.toLowerCase() === creator.category.toLowerCase()
          ? 1
          : 0
        : creator.category
          ? 0.4
          : 0;

    // Saturating: past ~100k followers, more audience barely moves the score.
    const audienceSize = logSaturate(creator.followersCount, 100_000);

    const geography =
      campaign.targetCountries.length === 0
        ? 1
        : jaccard(
            campaign.targetCountries,
            creator.creatorProfile?.audienceCountries ?? [],
          );

    const total =
      MATCH_WEIGHTS.topicFit * topicFit +
      MATCH_WEIGHTS.categoryFit * categoryFit +
      MATCH_WEIGHTS.audienceSize * audienceSize +
      MATCH_WEIGHTS.authorQuality * creator.authorQuality +
      MATCH_WEIGHTS.geography * geography;

    const reasons: string[] = [];
    if (topicFit > 0.4) reasons.push('topic-fit');
    if (categoryFit === 1) reasons.push('same-category');
    if (audienceSize > 0.6) reasons.push('audience-size');
    if (creator.authorQuality > 0.65) reasons.push('high-quality');
    if (campaign.targetCountries.length > 0 && geography > 0.5) {
      reasons.push('audience-location');
    }

    return { total, topicFit, reasons: reasons.slice(0, 3) };
  }
}
