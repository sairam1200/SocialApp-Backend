import * as Joi from 'joi';
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post as HttpPost,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  ProfileModel,
  ProfileSummaryModel,
} from '../../domain/contracts/social.model';
import { ProfileKind, Visibility } from '../../domain/enums';
import { mapProfileSummary } from '../../domain/mappers/social.mapper';
import { HttpContext } from '../../core/middlewares/httpContext.middleware';
import { UserAccoutGuard } from '../../core/passport';
import { CommunityProfileService } from '../../infrastructure/services/social/community-profile.service';
import { EngagementService } from '../../infrastructure/services/social/engagement.service';
import { Inject, NotFoundException } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import _const from '../../core/utils/const';
import { ISocialProfileRepository } from '../../domain/repositories/isocial.repository';
import { FollowUserCommand } from '../user/following/follow/follow.handler';
import { UnfollowUserCommand } from '../user/following/unfollow/unfollow.handler';

const updateValidations = Joi.object({
  handle: Joi.string().max(64),
  displayName: Joi.string().max(120),
  headline: Joi.string().max(160).allow('', null),
  bio: Joi.string().max(2000).allow('', null),
  avatarUrl: Joi.string().uri().max(512).allow('', null),
  bannerUrl: Joi.string().uri().max(512).allow('', null),
  location: Joi.string().max(120).allow('', null),
  websiteUrl: Joi.string().uri().max(512).allow('', null),
  category: Joi.string().max(80).allow('', null),
  topics: Joi.array().items(Joi.string().max(80)).max(20),
  kind: Joi.string().valid(...Object.values(ProfileKind)),
  defaultPostVisibility: Joi.string().valid(...Object.values(Visibility)),
  profileVisibility: Joi.string().valid(
    Visibility.Public,
    Visibility.Followers,
    Visibility.Private,
  ),
  openToCollaborations: Joi.boolean(),
  tipsEnabled: Joi.boolean(),
  subscriptionsEnabled: Joi.boolean(),
  creatorProfile: Joi.object({
    ratePerPost: Joi.number().min(0),
    currency: Joi.string().length(3),
    audienceCountries: Joi.array().items(Joi.string().max(4)).max(50),
    audienceAgeRanges: Joi.array().items(Joi.string().max(12)).max(10),
    pastBrands: Joi.array().items(Joi.string().max(80)).max(50),
    languages: Joi.array().items(Joi.string().max(8)).max(20),
  }),
  brandProfile: Joi.object({
    legalName: Joi.string().max(200),
    vatNumber: Joi.string().max(40),
    industry: Joi.string().max(80),
    sizeBucket: Joi.string().max(20),
    campaignBudgetCurrency: Joi.string().length(3),
  }),
});

@ApiTags('Community')
@Controller({ path: '/community', version: '1' })
export class CommunityProfileController {
  constructor(
    private readonly profiles: CommunityProfileService,
    private readonly engagement: EngagementService,
    @Inject(_const.ISOCIALPROFILE_REPOSITORY)
    private readonly profileRepository: ISocialProfileRepository,
    private readonly commandBus: CommandBus,
  ) {}

  @Get('me')
  @UseGuards(UserAccoutGuard)
  @ApiOperation({
    summary: "The caller's Community profile",
    description:
      'Creates one on first use — a user who never opens Community never has a handle reserved on their behalf.',
  })
  @ApiResponse({ status: 200, type: ProfileModel })
  public async me(@Query('invite') invite?: string): Promise<ProfileModel> {
    const profile = await this.profiles.ensureAsync(
      HttpContext.getCurrentUserId,
      { inviteCode: invite },
    );
    return this.profiles.getByHandleAsync(
      profile.handle,
      HttpContext.getCurrentUserId,
    );
  }

  @Get('profiles/:handle')
  @ApiResponse({ status: 200, type: ProfileModel })
  public async getProfile(
    @Param('handle') handle: string,
  ): Promise<ProfileModel> {
    const viewerUserId = HttpContext.getCurrentUserId;
    return this.profiles.getByHandleAsync(
      handle,
      viewerUserId && viewerUserId.length > 0 ? viewerUserId : null,
    );
  }

  @Patch('me')
  @UseGuards(UserAccoutGuard)
  @ApiResponse({ status: 200, type: ProfileModel })
  public async update(
    @Body() body: Record<string, unknown>,
  ): Promise<ProfileModel> {
    const value = await updateValidations.validateAsync(body ?? {}, {
      stripUnknown: true,
    });
    const updated = await this.profiles.updateAsync(
      HttpContext.getCurrentUserId,
      value,
    );
    return this.profiles.getByHandleAsync(
      updated.handle,
      HttpContext.getCurrentUserId,
    );
  }

  @Get('handles/:handle/available')
  @ApiOperation({ summary: 'Is this handle free?' })
  public async handleAvailable(
    @Param('handle') handle: string,
  ): Promise<{ available: boolean; normalised: string; reason?: string }> {
    const userId = HttpContext.getCurrentUserId;
    return this.profiles.isHandleAvailableAsync(
      handle,
      userId && userId.length > 0 ? userId : null,
    );
  }

  /* -------------------------------------------------------------- audiences */

  @Get('audiences/:audience')
  @UseGuards(UserAccoutGuard)
  @ApiOperation({
    summary: 'Who is in one of your narrower audiences',
    description:
      'Close friends and brand partners are explicit memberships, not implied by following.',
  })
  @ApiResponse({ status: 200, type: [ProfileSummaryModel] })
  public async listAudience(
    @Param('audience') audience: string,
  ): Promise<ProfileSummaryModel[]> {
    const members = await this.profiles.listAudienceAsync(
      HttpContext.getCurrentUserId,
      audience as Visibility,
    );
    return members.map((m) => mapProfileSummary(m));
  }

  @HttpPost('audiences/:audience/:profileId')
  @UseGuards(UserAccoutGuard)
  public async setAudience(
    @Param('audience') audience: string,
    @Param('profileId') profileId: string,
    @Body() body: { included?: boolean },
  ): Promise<{ ok: true }> {
    await this.profiles.setAudienceMembershipAsync({
      userId: HttpContext.getCurrentUserId,
      memberProfileId: profileId,
      audience: audience as Visibility,
      included: body?.included !== false,
    });
    return { ok: true };
  }

  /* ---------------------------------------------------------------- follow */

  /**
   * Follow or unfollow by *profile* id.
   *
   * Resolves to the user id and delegates to the existing follow handlers.
   * Community deliberately does not keep its own follow graph: two graphs
   * would need reconciling forever, and the one in `identity.user_follows`
   * already carries the rate limits, the request/approve flow and the block
   * semantics.
   */
  @HttpPost('profiles/:profileId/follow')
  @UseGuards(UserAccoutGuard)
  @ApiOperation({ summary: 'Follow a Community profile' })
  public async follow(
    @Param('profileId') profileId: string,
  ): Promise<{ following: true }> {
    const target = await this.profileRepository.getByIdAsync(profileId);
    if (!target) throw new NotFoundException('Profile not found.');

    await this.commandBus.execute(
      new FollowUserCommand(HttpContext.getCurrentUserId, target.userId),
    );
    await this.profileRepository.incrementCountersAsync(target.id, {
      followersCount: 1,
    });

    const viewer = await this.profileRepository.getByUserIdAsync(
      HttpContext.getCurrentUserId,
    );
    if (viewer) {
      await this.profileRepository.incrementCountersAsync(viewer.id, {
        followingCount: 1,
      });
    }
    return { following: true };
  }

  @HttpPost('profiles/:profileId/unfollow')
  @UseGuards(UserAccoutGuard)
  @ApiOperation({ summary: 'Stop following a Community profile' })
  public async unfollow(
    @Param('profileId') profileId: string,
  ): Promise<{ following: false }> {
    const target = await this.profileRepository.getByIdAsync(profileId);
    if (!target) throw new NotFoundException('Profile not found.');

    await this.commandBus.execute(
      new UnfollowUserCommand(HttpContext.getCurrentUserId, target.userId),
    );
    await this.profileRepository.incrementCountersAsync(target.id, {
      followersCount: -1,
    });

    const viewer = await this.profileRepository.getByUserIdAsync(
      HttpContext.getCurrentUserId,
    );
    if (viewer) {
      await this.profileRepository.incrementCountersAsync(viewer.id, {
        followingCount: -1,
      });
    }
    return { following: false };
  }

  /* ------------------------------------------------------------- mute/block */

  @HttpPost('profiles/:profileId/mute')
  @UseGuards(UserAccoutGuard)
  @ApiOperation({
    summary: 'Mute or block a profile',
    description:
      'A mute is one-directional. A block is mutual invisibility — the blocked profile also stops seeing the blocker.',
  })
  public async mute(
    @Param('profileId') profileId: string,
    @Body() body: { isBlock?: boolean; enabled?: boolean },
  ): Promise<{ ok: true }> {
    await this.engagement.setMuteAsync({
      viewerUserId: HttpContext.getCurrentUserId,
      targetProfileId: profileId,
      isBlock: body?.isBlock === true,
      enabled: body?.enabled !== false,
    });
    return { ok: true };
  }
}
