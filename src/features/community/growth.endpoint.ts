import {
  Body,
  Controller,
  Get,
  Param,
  Post as HttpPost,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CreatorAnalyticsModel } from '../../domain/contracts/social.model';
import { HttpContext } from '../../core/middlewares/httpContext.middleware';
import { UserAccoutGuard } from '../../core/passport';
import {
  ExploreResult,
  ExploreService,
} from '../../infrastructure/services/social/explore.service';
import { CreatorAnalyticsService } from '../../infrastructure/services/social/creator-analytics.service';
import { InviteService } from '../../infrastructure/services/social/invite.service';
import { EngagementService } from '../../infrastructure/services/social/engagement.service';
import { clampInt } from './feed.endpoint';

/**
 * Discovery, growth and measurement.
 *
 * Explore, search, invites, share attribution and creator analytics. Grouped
 * because they are the same loop from the creator's side: reach people, see
 * what worked, do more of it.
 */
@ApiTags('Community')
@Controller({ path: '/community', version: '1' })
export class CommunityGrowthController {
  constructor(
    private readonly explore: ExploreService,
    private readonly analytics: CreatorAnalyticsService,
    private readonly invites: InviteService,
    private readonly engagement: EngagementService,
  ) {}

  @Get('explore')
  @ApiOperation({
    summary: 'Explore, or search',
    description:
      'With `q`, searches posts, people, brands, products, courses and live channels in one pass. Without it, the recommender picks — the same engine the feed uses, so discovery and the feed agree about what is good.',
  })
  public async exploreOrSearch(
    @Query('q') q?: string,
    @Query('limit') limit?: string,
  ): Promise<ExploreResult> {
    const viewerUserId = HttpContext.getCurrentUserId || null;
    return this.explore.searchAsync({
      query: q ?? '',
      viewerUserId,
      limit: clampInt(limit, 12, 1, 40),
    });
  }

  @Get('analytics')
  @UseGuards(UserAccoutGuard)
  @ApiOperation({
    summary: 'Creator analytics',
    description:
      'Traffic, interactions, reach, earnings and per-post performance. Reach is distinct viewers, not impressions — conflating them is the most common way a creator dashboard lies.',
  })
  @ApiResponse({ status: 200, type: CreatorAnalyticsModel })
  public async analyticsFor(
    @Query('days') days?: string,
  ): Promise<CreatorAnalyticsModel> {
    return this.analytics.getAsync(
      HttpContext.getCurrentUserId,
      clampInt(days, 28, 1, 365),
    );
  }

  /* --------------------------------------------------------------- invites */

  @HttpPost('invites')
  @UseGuards(UserAccoutGuard)
  @ApiOperation({
    summary: 'Create an invite',
    description:
      'With an email we send it; without one you get a link. Rewards land when the invitee sets up a profile, not when they sign up.',
  })
  public async createInvite(
    @Body() body: { email?: string },
  ): Promise<{ code: string; url: string; status: string }> {
    const { invite, url } = await this.invites.createAsync({
      userId: HttpContext.getCurrentUserId,
      email: body?.email,
    });
    return { code: invite.code, url, status: invite.status };
  }

  @Get('invites')
  @UseGuards(UserAccoutGuard)
  public async listInvites() {
    const result = await this.invites.listAsync(HttpContext.getCurrentUserId);
    return {
      acceptedCount: result.acceptedCount,
      rewardedCount: result.rewardedCount,
      rewardLabel: result.rewardLabel,
      invites: result.invites.map((i) => ({
        code: i.code,
        // The invitee's address is not echoed back in full — an inviter needs
        // to recognise who they invited, not to harvest a list.
        invitedEmail: i.invitedEmail ? maskEmail(i.invitedEmail) : null,
        status: i.status,
        acceptedOn: i.acceptedOn,
        expiresOn: i.expiresOn,
      })),
    };
  }

  @Get('invites/:code')
  @ApiOperation({ summary: 'Preview an invite on the signup screen' })
  public async previewInvite(@Param('code') code: string) {
    return this.invites.previewAsync(code);
  }

  /* --------------------------------------------------- share attribution */

  @HttpPost('shares/:referralCode/visit')
  @ApiOperation({
    summary: 'Record a visit arriving from a share',
    description:
      'Credits the sharer and the author. Called by the frontend when a page loads with a `?ref=` parameter.',
  })
  public async recordShareVisit(
    @Param('referralCode') referralCode: string,
  ): Promise<{ ok: true }> {
    await this.engagement.recordShareVisitAsync(referralCode);
    return { ok: true };
  }
}

/** `anna.andersson@example.com` → `an•••@example.com`. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '•••';
  const head = local.slice(0, 2);
  return `${head}•••@${domain}`;
}
