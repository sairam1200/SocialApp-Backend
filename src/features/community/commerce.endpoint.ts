import * as Joi from 'joi';
import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post as HttpPost,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import _const from '../../core/utils/const';
import { HttpContext } from '../../core/middlewares/httpContext.middleware';
import { UserAccoutGuard } from '../../core/passport';
import { BalanceModel } from '../../domain/contracts/social.model';
import {
  Campaign,
  Product,
  SubscriptionTier,
} from '../../domain/entities/social';
import { CampaignStatus, ProfileKind } from '../../domain/enums';
import {
  ICommerceRepository,
  ISocialProfileRepository,
} from '../../domain/repositories/isocial.repository';
import { buildSearchText } from '../../core/utils/recommendation';
import { MonetizationService } from '../../infrastructure/services/social/monetization.service';
import { CreatorMatchingService } from '../../infrastructure/services/social/creator-matching.service';
import { CommunityProfileService } from '../../infrastructure/services/social/community-profile.service';
import { clampInt } from './feed.endpoint';

const productValidations = Joi.object({
  title: Joi.string().max(200).required(),
  description: Joi.string().max(4000).allow('', null),
  priceMinor: Joi.number().integer().min(0),
  currency: Joi.string().length(3).default('EUR'),
  imageUrl: Joi.string().uri().max(1024).allow('', null),
  externalUrl: Joi.string().uri().max(1024).allow('', null),
  sku: Joi.string().max(80).allow('', null),
  category: Joi.string().max(80).allow('', null),
  topics: Joi.array().items(Joi.string().max(80)).max(12),
  affiliateRateBps: Joi.number().integer().min(0).max(10000).default(0),
  isActive: Joi.boolean().default(true),
});

const campaignValidations = Joi.object({
  title: Joi.string().max(200).required(),
  brief: Joi.string().max(8000).required(),
  status: Joi.string().valid(...Object.values(CampaignStatus)),
  topics: Joi.array().items(Joi.string().max(80)).max(12),
  deliverables: Joi.array().items(Joi.string().max(200)).max(20),
  budgetMinor: Joi.number().integer().min(0),
  currency: Joi.string().length(3).default('EUR'),
  minFollowers: Joi.number().integer().min(0),
  targetCountries: Joi.array().items(Joi.string().max(4)).max(50),
  applicationsCloseOn: Joi.date().iso().allow(null),
  deliverBy: Joi.date().iso().allow(null),
});

/**
 * The creator economy surface: storefronts, campaigns, affiliate links, tips,
 * balances, payouts and subscription tiers.
 *
 * Money moves through `MonetizationService`; nothing here writes a ledger row
 * directly. Amounts are minor units as strings on the wire, because `Number`
 * loses precision past 2^53 and JSON has no other integer type.
 */
@ApiTags('Community')
@Controller({ path: '/community', version: '1' })
export class CommunityCommerceController {
  constructor(
    @Inject(_const.ICOMMERCE_REPOSITORY)
    private readonly commerce: ICommerceRepository,
    @Inject(_const.ISOCIALPROFILE_REPOSITORY)
    private readonly profiles: ISocialProfileRepository,
    private readonly monetization: MonetizationService,
    private readonly matching: CreatorMatchingService,
    private readonly profileService: CommunityProfileService,
  ) {}

  /* -------------------------------------------------------------- storefront */

  @Get('profiles/:handle/products')
  @ApiOperation({ summary: 'A brand or creator storefront' })
  public async storefront(
    @Param('handle') handle: string,
    @Query('limit') limit?: string,
  ): Promise<Product[]> {
    const profile = await this.profiles.getByHandleAsync(handle);
    if (!profile) throw new NotFoundException('Profile not found.');
    return this.commerce.listProductsAsync(
      profile.id,
      clampInt(limit, 50, 1, 200),
    );
  }

  @HttpPost('products')
  @UseGuards(UserAccoutGuard)
  public async saveProduct(
    @Body() body: Record<string, unknown>,
  ): Promise<Product> {
    const value = await productValidations.validateAsync(body ?? {}, {
      stripUnknown: true,
    });
    const profile = await this.profileService.ensureAsync(
      HttpContext.getCurrentUserId,
    );

    return this.commerce.saveProductAsync(
      new Product({
        ...value,
        profileId: profile.id,
        priceMinor:
          value.priceMinor !== undefined ? String(value.priceMinor) : undefined,
        topics: value.topics ?? [],
        // Written explicitly — a column default is skipped by any bulk insert
        // that names its columns.
        searchText: buildSearchText({
          title: value.title,
          body: value.description,
          topics: value.topics,
          authorHandle: profile.handle,
          authorName: profile.displayName,
        }),
      }),
    );
  }

  @Delete('products/:productId')
  @UseGuards(UserAccoutGuard)
  public async deleteProduct(
    @Param('productId') productId: string,
  ): Promise<{ ok: true }> {
    const profile = await this.profileService.ensureAsync(
      HttpContext.getCurrentUserId,
    );
    const product = await this.commerce.getProductAsync(productId);
    if (!product) return { ok: true };
    if (product.profileId !== profile.id) {
      throw new ForbiddenException('That product belongs to another profile.');
    }
    await this.commerce.deleteProductAsync(productId);
    return { ok: true };
  }

  /* --------------------------------------------------------------- campaigns */

  @Get('campaigns')
  @ApiOperation({
    summary: 'Open campaign briefs',
    description:
      'Filterable by brand and topic. Only open campaigns by default.',
  })
  public async listCampaigns(
    @Query('brandProfileId') brandProfileId?: string,
    @Query('status') status?: string,
    @Query('topics') topics?: string,
  ): Promise<Campaign[]> {
    return this.commerce.listCampaignsAsync(
      {
        brandProfileId,
        status: (status as CampaignStatus) ?? CampaignStatus.Open,
        topics: topics ? topics.split(',').map((t) => t.trim()) : undefined,
      },
      100,
    );
  }

  @HttpPost('campaigns')
  @UseGuards(UserAccoutGuard)
  @ApiOperation({ summary: 'Create or update a campaign brief' })
  public async saveCampaign(
    @Body() body: Record<string, unknown>,
  ): Promise<Campaign> {
    const value = await campaignValidations.validateAsync(body ?? {}, {
      stripUnknown: true,
    });
    const profile = await this.profileService.ensureAsync(
      HttpContext.getCurrentUserId,
    );
    if (profile.kind !== ProfileKind.Brand) {
      throw new ForbiddenException(
        'Switch your profile to a brand before creating campaigns.',
      );
    }

    return this.commerce.saveCampaignAsync(
      new Campaign({
        ...value,
        brandProfileId: profile.id,
        budgetMinor:
          value.budgetMinor !== undefined
            ? String(value.budgetMinor)
            : undefined,
        topics: value.topics ?? [],
        deliverables: value.deliverables ?? [],
        targetCountries: value.targetCountries ?? [],
        searchText: buildSearchText({
          title: value.title,
          body: value.brief,
          topics: value.topics,
          authorHandle: profile.handle,
          authorName: profile.displayName,
        }),
      }),
    );
  }

  @Get('campaigns/:campaignId/matches')
  @UseGuards(UserAccoutGuard)
  @ApiOperation({
    summary: 'Creators matched to a campaign',
    description:
      'The same score a creator sees for the same pairing. A marketplace where each side is scored differently is one where somebody is being sold something.',
  })
  public async campaignMatches(
    @Param('campaignId') campaignId: string,
  ): Promise<Array<{ profileId: string; score: number; reasons: string[] }>> {
    const campaign = await this.commerce.getCampaignAsync(campaignId);
    if (!campaign) throw new NotFoundException('Campaign not found.');

    const profile = await this.profileService.ensureAsync(
      HttpContext.getCurrentUserId,
    );
    if (campaign.brandProfileId !== profile.id) {
      throw new ForbiddenException('That campaign belongs to another brand.');
    }
    return this.matching.matchCreatorsToCampaignAsync(campaignId);
  }

  @Get('campaigns/for-me')
  @UseGuards(UserAccoutGuard)
  @ApiOperation({ summary: 'Campaigns matched to the calling creator' })
  public async campaignsForMe(): Promise<
    Array<{ campaign: Campaign; score: number; reasons: string[] }>
  > {
    return this.matching.matchCampaignsToCreatorAsync(
      HttpContext.getCurrentUserId,
    );
  }

  @HttpPost('campaigns/:campaignId/apply')
  @UseGuards(UserAccoutGuard)
  public async apply(
    @Param('campaignId') campaignId: string,
    @Body() body: { pitch?: string; quotedMinor?: number },
  ): Promise<{ id: string; status: string; matchScore: number }> {
    const application = await this.matching.applyAsync({
      userId: HttpContext.getCurrentUserId,
      campaignId,
      pitch: body?.pitch,
      quotedMinor:
        typeof body?.quotedMinor === 'number'
          ? BigInt(Math.round(body.quotedMinor))
          : undefined,
    });
    return {
      id: application.id,
      status: application.status,
      matchScore: application.matchScore,
    };
  }

  @Get('campaigns/:campaignId/applications')
  @UseGuards(UserAccoutGuard)
  public async applications(@Param('campaignId') campaignId: string) {
    const campaign = await this.commerce.getCampaignAsync(campaignId);
    if (!campaign) throw new NotFoundException('Campaign not found.');

    const profile = await this.profileService.ensureAsync(
      HttpContext.getCurrentUserId,
    );
    if (campaign.brandProfileId !== profile.id) {
      throw new ForbiddenException('That campaign belongs to another brand.');
    }
    return this.commerce.listApplicationsAsync(campaignId);
  }

  /* --------------------------------------------------------------- affiliate */

  @HttpPost('affiliate-links')
  @UseGuards(UserAccoutGuard)
  @ApiOperation({ summary: 'Mint a trackable affiliate link' })
  public async createAffiliateLink(
    @Body() body: { targetUrl: string; productId?: string; postId?: string },
  ) {
    const link = await this.monetization.createAffiliateLinkAsync({
      userId: HttpContext.getCurrentUserId,
      targetUrl: body?.targetUrl,
      productId: body?.productId,
      postId: body?.postId,
    });
    return {
      id: link.id,
      code: link.code,
      targetUrl: link.targetUrl,
      clicksCount: link.clicksCount,
      conversionsCount: link.conversionsCount,
      earnedMinor: link.earnedMinor,
    };
  }

  @Get('affiliate-links')
  @UseGuards(UserAccoutGuard)
  public async listAffiliateLinks() {
    const profile = await this.profileService.ensureAsync(
      HttpContext.getCurrentUserId,
    );
    return this.commerce.listAffiliateLinksAsync(profile.id);
  }

  /**
   * The affiliate redirector.
   *
   * Records the click, then 302s. Deliberately unguarded — the whole point is
   * that anyone can follow the link — and it never echoes the target back in a
   * body, so it cannot be used as an open-redirect probe with a readable
   * response.
   */
  @Get('r/:code')
  @ApiOperation({ summary: 'Follow an affiliate link' })
  @ApiResponse({ status: 302, description: 'Redirect to the destination' })
  public async redirect(
    @Param('code') code: string,
    @Res() res: Response,
  ): Promise<void> {
    const profile = HttpContext.getCurrentUserId
      ? await this.profiles.getByUserIdAsync(HttpContext.getCurrentUserId)
      : null;

    const target = await this.monetization.resolveAffiliateClickAsync({
      code,
      visitorProfileId: profile?.id ?? null,
      ip: (res.req.headers['x-forwarded-for'] as string) ?? res.req.ip,
      referrer: res.req.headers.referer,
    });

    if (!target) {
      res.status(404).json({ message: 'That link is no longer active.' });
      return;
    }
    res.redirect(302, target);
  }

  /* ------------------------------------------------------------------- money */

  @HttpPost('profiles/:profileId/tip')
  @UseGuards(UserAccoutGuard)
  @ApiOperation({ summary: 'Tip a creator' })
  public async tip(
    @Param('profileId') profileId: string,
    @Body() body: { amountMinor: number; postId?: string; message?: string },
  ): Promise<{ id: string; amountMinor: string }> {
    const value = await Joi.object({
      amountMinor: Joi.number().integer().min(100).max(100_000_00).required(),
      postId: Joi.string().uuid(),
      message: Joi.string().max(400).allow('', null),
    }).validateAsync(body ?? {}, { stripUnknown: true });

    const entry = await this.monetization.tipAsync({
      fromUserId: HttpContext.getCurrentUserId,
      toProfileId: profileId,
      amountMinor: BigInt(value.amountMinor),
      postId: value.postId,
      message: value.message,
    });
    return { id: entry.id, amountMinor: entry.amountMinor };
  }

  @Get('balance')
  @UseGuards(UserAccoutGuard)
  @ApiResponse({ status: 200, type: BalanceModel })
  public async balance(): Promise<BalanceModel> {
    return this.monetization.getBalanceAsync(HttpContext.getCurrentUserId);
  }

  @Get('ledger')
  @UseGuards(UserAccoutGuard)
  public async ledger(@Query('limit') limit?: string) {
    const profile = await this.profileService.ensureAsync(
      HttpContext.getCurrentUserId,
    );
    return this.commerce.listLedgerAsync(
      profile.id,
      clampInt(limit, 50, 1, 200),
    );
  }

  @HttpPost('payouts')
  @UseGuards(UserAccoutGuard)
  @ApiOperation({ summary: 'Request a payout of the available balance' })
  public async requestPayout(@Body() body: { amountMinor: number }) {
    const value = await Joi.object({
      amountMinor: Joi.number().integer().min(1).required(),
    }).validateAsync(body ?? {}, { stripUnknown: true });

    const payout = await this.monetization.requestPayoutAsync({
      userId: HttpContext.getCurrentUserId,
      amountMinor: BigInt(value.amountMinor),
    });
    return {
      id: payout.id,
      status: payout.status,
      amountMinor: payout.amountMinor,
      currency: payout.currency,
    };
  }

  @Get('payouts')
  @UseGuards(UserAccoutGuard)
  public async payouts() {
    const profile = await this.profileService.ensureAsync(
      HttpContext.getCurrentUserId,
    );
    return this.commerce.listPayoutsAsync(profile.id, 50);
  }

  /* ----------------------------------------------------------- subscriptions */

  @Get('profiles/:handle/tiers')
  public async tiers(
    @Param('handle') handle: string,
  ): Promise<SubscriptionTier[]> {
    const profile = await this.profiles.getByHandleAsync(handle);
    if (!profile) throw new NotFoundException('Profile not found.');
    return this.commerce.listTiersAsync(profile.id);
  }

  @HttpPost('tiers')
  @UseGuards(UserAccoutGuard)
  public async saveTier(
    @Body() body: Record<string, unknown>,
  ): Promise<SubscriptionTier> {
    const value = await Joi.object({
      id: Joi.string().uuid(),
      name: Joi.string().max(80).required(),
      description: Joi.string().max(2000).allow('', null),
      priceMinor: Joi.number().integer().min(100).required(),
      currency: Joi.string().length(3).default('EUR'),
      benefits: Joi.array().items(Joi.string().max(200)).max(12),
      isActive: Joi.boolean().default(true),
    }).validateAsync(body ?? {}, { stripUnknown: true });

    const profile = await this.profileService.ensureAsync(
      HttpContext.getCurrentUserId,
    );
    return this.commerce.saveTierAsync(
      new SubscriptionTier({
        ...value,
        creatorProfileId: profile.id,
        priceMinor: String(value.priceMinor),
        benefits: value.benefits ?? [],
      }),
    );
  }
}
