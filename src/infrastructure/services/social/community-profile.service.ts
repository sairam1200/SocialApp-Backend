import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import _const from '../../../core/utils/const';
import logger from '../../../core/utils/winston.util';
import { ProfileModel } from '../../../domain/contracts/social.model';
import { AudienceMember, SocialProfile } from '../../../domain/entities/social';
import { FollowStatus, ProfileKind, Visibility } from '../../../domain/enums';
import { mapProfile } from '../../../domain/mappers/social.mapper';
import {
  IIdentityRepository,
  IUserFollowRepository,
} from '../../../domain/repositories';
import {
  IEngagementRepository,
  ILearningRepository,
  ISocialProfileRepository,
} from '../../../domain/repositories/isocial.repository';
import {
  normaliseHandle,
  slugifyTopic,
} from '../../../core/utils/recommendation';
import { InviteService } from './invite.service';

/** Handles that would collide with routes or impersonate the platform. */
const RESERVED_HANDLES = new Set([
  'admin',
  'api',
  'gaddr',
  'support',
  'help',
  'settings',
  'community',
  'explore',
  'search',
  'login',
  'signup',
  'about',
  'terms',
  'privacy',
  'me',
  'you',
  'new',
  'live',
  'shop',
  'learn',
  'brand',
  'official',
]);

/**
 * Community profiles: create, read, update, and the audiences they own.
 *
 * A profile is created lazily on first Community use rather than at signup, so
 * a user who never opens Community never gets a handle reserved on their
 * behalf — and the handle they eventually pick is the one they want.
 */
@Injectable()
export class CommunityProfileService {
  constructor(
    @Inject(_const.ISOCIALPROFILE_REPOSITORY)
    private readonly profiles: ISocialProfileRepository,
    @Inject(_const.IENGAGEMENT_REPOSITORY)
    private readonly engagement: IEngagementRepository,
    @Inject(_const.ILEARNING_REPOSITORY)
    private readonly learning: ILearningRepository,
    @Inject(_const.IUSERFOLLOW_REPOSITORY)
    private readonly follows: IUserFollowRepository,
    @Inject(_const.IIDENTITY_REPOSITORY)
    private readonly users: IIdentityRepository,
    private readonly invites: InviteService,
  ) {}

  /**
   * The caller's profile, creating one if this is their first visit.
   *
   * Derives a handle from the username or email and disambiguates on
   * collision. Never fails for want of a free handle — that would make
   * Community unreachable for anyone with a common name.
   */
  public async ensureAsync(
    userId: string,
    options?: { inviteCode?: string },
  ): Promise<SocialProfile> {
    const existing = await this.profiles.getByUserIdAsync(userId);
    if (existing) return existing;

    const user = await this.users.getUserByIdAsync(userId);
    if (!user) throw new NotFoundException('User not found.');

    const displayName =
      [user.firstName, user.lastName].filter(Boolean).join(' ').trim() ||
      user.userName ||
      'Someone';

    const profile = await this.profiles.createAsync(
      new SocialProfile({
        userId,
        handle: await this.mintHandleAsync(
          user.userName || user.email?.split('@')[0] || 'member',
        ),
        displayName: displayName.slice(0, 120),
        kind: ProfileKind.Person,
        topics: [],
        defaultPostVisibility: Visibility.Public,
        profileVisibility: Visibility.Public,
      }),
    );

    if (options?.inviteCode) {
      // A bad invite code must not block profile creation.
      try {
        await this.invites.redeemAsync({
          code: options.inviteCode,
          newProfileId: profile.id,
        });
      } catch (error) {
        logger.warn('[community-profile] invite redemption failed', error);
      }
    }

    return profile;
  }

  public async getByHandleAsync(
    handle: string,
    viewerUserId: string | null,
  ): Promise<ProfileModel> {
    const profile = await this.profiles.getByHandleAsync(handle);
    if (!profile) throw new NotFoundException('Profile not found.');

    const viewer = viewerUserId
      ? await this.profiles.getByUserIdAsync(viewerUserId)
      : null;

    if (
      profile.profileVisibility !== Visibility.Public &&
      viewer?.id !== profile.id
    ) {
      // A private profile is not "forbidden" — saying so confirms it exists.
      const relation = viewer
        ? await this.engagement.getAudienceMembershipAsync(
            profile.id,
            viewer.id,
          )
        : [];
      const isFollower = viewer
        ? Boolean(
            (await this.follows.getAsync(viewer.userId, profile.userId))
              ?.status === FollowStatus.Accepted,
          )
        : false;
      if (relation.length === 0 && !isFollower) {
        throw new NotFoundException('Profile not found.');
      }
    }

    const [certifications, follow] = await Promise.all([
      this.learning.listCertificationsAsync(profile.id),
      viewer
        ? this.follows.getAsync(viewer.userId, profile.userId)
        : Promise.resolve(null),
    ]);

    return mapProfile(profile, {
      viewerProfileId: viewer?.id ?? null,
      isFollowedByViewer: follow?.status === FollowStatus.Accepted,
      certifications,
    });
  }

  public async updateAsync(
    userId: string,
    changes: {
      handle?: string;
      displayName?: string;
      headline?: string;
      bio?: string;
      avatarUrl?: string;
      bannerUrl?: string;
      location?: string;
      websiteUrl?: string;
      category?: string;
      topics?: string[];
      kind?: ProfileKind;
      defaultPostVisibility?: Visibility;
      profileVisibility?: Visibility;
      openToCollaborations?: boolean;
      tipsEnabled?: boolean;
      subscriptionsEnabled?: boolean;
      creatorProfile?: SocialProfile['creatorProfile'];
      brandProfile?: SocialProfile['brandProfile'];
    },
  ): Promise<SocialProfile> {
    const profile = await this.ensureAsync(userId);

    const patch: Partial<SocialProfile> = {};

    if (changes.handle !== undefined) {
      const handle = normaliseHandle(changes.handle);
      if (handle.length < 3) {
        throw new BadRequestException(
          'A handle needs at least three characters.',
        );
      }
      if (RESERVED_HANDLES.has(handle)) {
        throw new ConflictException('That handle is reserved.');
      }
      if (
        handle !== profile.handle &&
        (await this.profiles.handleExistsAsync(handle, profile.id))
      ) {
        throw new ConflictException('That handle is taken.');
      }
      patch.handle = handle;
    }

    if (changes.displayName !== undefined) {
      patch.displayName =
        changes.displayName.trim().slice(0, 120) || profile.displayName;
    }
    if (changes.headline !== undefined)
      patch.headline = changes.headline.slice(0, 160);
    if (changes.bio !== undefined) patch.bio = changes.bio.slice(0, 2000);
    if (changes.avatarUrl !== undefined) patch.avatarUrl = changes.avatarUrl;
    if (changes.bannerUrl !== undefined) patch.bannerUrl = changes.bannerUrl;
    if (changes.location !== undefined)
      patch.location = changes.location.slice(0, 120);
    if (changes.websiteUrl !== undefined)
      patch.websiteUrl = changes.websiteUrl.slice(0, 512);
    if (changes.category !== undefined)
      patch.category = changes.category.slice(0, 80);
    if (changes.kind !== undefined) patch.kind = changes.kind;
    if (changes.defaultPostVisibility !== undefined) {
      patch.defaultPostVisibility = changes.defaultPostVisibility;
    }
    if (changes.profileVisibility !== undefined) {
      patch.profileVisibility = changes.profileVisibility;
    }
    if (changes.openToCollaborations !== undefined) {
      patch.openToCollaborations = changes.openToCollaborations;
    }
    if (changes.tipsEnabled !== undefined)
      patch.tipsEnabled = changes.tipsEnabled;
    if (changes.subscriptionsEnabled !== undefined) {
      patch.subscriptionsEnabled = changes.subscriptionsEnabled;
    }
    if (changes.topics !== undefined) {
      // Slugified on the way in, so `topics && topics` overlap actually
      // matches — "Machine Learning" and "machine-learning" are different
      // strings to Postgres.
      patch.topics = Array.from(
        new Set(changes.topics.map(slugifyTopic).filter(Boolean)),
      ).slice(0, 20);
    }
    if (changes.creatorProfile !== undefined) {
      patch.creatorProfile = {
        ...(profile.creatorProfile ?? {}),
        ...changes.creatorProfile,
      };
    }
    if (changes.brandProfile !== undefined) {
      patch.brandProfile = {
        ...(profile.brandProfile ?? {}),
        ...changes.brandProfile,
      };
    }

    const updated = await this.profiles.updateAsync(profile.id, patch);
    if (!updated) throw new NotFoundException('Profile not found.');
    return updated;
  }

  public async isHandleAvailableAsync(
    handle: string,
    userId: string | null,
  ): Promise<{ available: boolean; normalised: string; reason?: string }> {
    const normalised = normaliseHandle(handle);
    if (normalised.length < 3) {
      return { available: false, normalised, reason: 'too-short' };
    }
    if (RESERVED_HANDLES.has(normalised)) {
      return { available: false, normalised, reason: 'reserved' };
    }
    const own = userId ? await this.profiles.getByUserIdAsync(userId) : null;
    const taken = await this.profiles.handleExistsAsync(normalised, own?.id);
    return {
      available: !taken,
      normalised,
      reason: taken ? 'taken' : undefined,
    };
  }

  /* -------------------------------------------------------------- audiences */

  public async listAudienceAsync(
    userId: string,
    audience: Visibility,
  ): Promise<SocialProfile[]> {
    const profile = await this.ensureAsync(userId);
    const members = await this.engagement.listAudienceAsync(
      profile.id,
      audience,
    );
    return this.profiles.getManyByIdsAsync(
      members.map((m) => m.memberProfileId),
    );
  }

  public async setAudienceMembershipAsync(input: {
    userId: string;
    memberProfileId: string;
    audience: Visibility;
    included: boolean;
  }): Promise<void> {
    const profile = await this.ensureAsync(input.userId);
    if (profile.id === input.memberProfileId) {
      throw new BadRequestException('You are already in your own audience.');
    }
    if (
      input.audience !== Visibility.CloseFriends &&
      input.audience !== Visibility.BrandPartners
    ) {
      throw new BadRequestException(
        'Only close friends and brand partners are membership audiences.',
      );
    }

    if (!input.included) {
      await this.engagement.removeFromAudienceAsync(
        profile.id,
        input.memberProfileId,
        input.audience,
      );
      return;
    }

    const member = await this.profiles.getByIdAsync(input.memberProfileId);
    if (!member) throw new NotFoundException('Profile not found.');

    await this.engagement.addToAudienceAsync(
      new AudienceMember({
        ownerProfileId: profile.id,
        memberProfileId: member.id,
        audience: input.audience,
      }),
    );
  }

  /* -------------------------------------------------------------- internals */

  private async mintHandleAsync(seed: string): Promise<string> {
    const base = normaliseHandle(seed) || 'member';
    const candidate = base.length >= 3 ? base : `${base}user`;

    if (
      !RESERVED_HANDLES.has(candidate) &&
      !(await this.profiles.handleExistsAsync(candidate))
    ) {
      return candidate;
    }
    // Numeric suffixes rather than random noise: `anna2` reads like a handle,
    // `anna-x7f2` reads like a database.
    for (let suffix = 2; suffix < 1000; suffix += 1) {
      const next = `${candidate}${suffix}`.slice(0, 64);
      if (!(await this.profiles.handleExistsAsync(next))) return next;
    }
    return `${candidate}${Date.now().toString(36)}`.slice(0, 64);
  }
}
