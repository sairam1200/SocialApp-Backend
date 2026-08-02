import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { customAlphabet } from 'nanoid';
import configs from '../../../configs';
import _const from '../../../core/utils/const';
import logger from '../../../core/utils/winston.util';
import { Invite } from '../../../domain/entities/social';
import { InviteStatus, LedgerEntryKind } from '../../../domain/enums';
import {
  ILearningRepository,
  ISocialProfileRepository,
} from '../../../domain/repositories/isocial.repository';
import { BrandedEmailService } from './branded-email.service';
import { MonetizationService } from './monetization.service';

/** Unambiguous, short, shareable by voice. */
const inviteCode = customAlphabet('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 8);

/** How long an unaccepted invite stays valid. */
const INVITE_LIFETIME_DAYS = 30;
/** Rewarded invites per inviter, ever. Beyond this, invites still work. */
const MAX_REWARDED_INVITES = 25;

/**
 * Invites, and the rewards they earn.
 *
 * The reward is granted when the invitee's profile is set up, not when they
 * sign up — otherwise the cheapest way to farm rewards is to create accounts,
 * and every referral programme that pays on signup learns this the same way.
 *
 * Rewards are capped per inviter. Uncapped referral credit is an arbitrage
 * opportunity, and the cap is far above what a real person reaches.
 */
@Injectable()
export class InviteService {
  constructor(
    @Inject(_const.ILEARNING_REPOSITORY)
    private readonly learning: ILearningRepository,
    @Inject(_const.ISOCIALPROFILE_REPOSITORY)
    private readonly profiles: ISocialProfileRepository,
    private readonly email: BrandedEmailService,
    private readonly monetization: MonetizationService,
  ) {}

  public async createAsync(input: {
    userId: string;
    email?: string;
  }): Promise<{ invite: Invite; url: string }> {
    const profile = await this.profiles.getByUserIdAsync(input.userId);
    if (!profile) throw new NotFoundException('Community profile not found.');

    if (input.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email)) {
      throw new BadRequestException(
        'That does not look like an email address.',
      );
    }

    const invite = await this.learning.saveInviteAsync(
      new Invite({
        code: inviteCode(),
        inviterProfileId: profile.id,
        invitedEmail: input.email?.toLowerCase(),
        status: InviteStatus.Sent,
        rewardMinor: String(configs.community?.inviteRewardMinor ?? 0),
        expiresOn: new Date(Date.now() + INVITE_LIFETIME_DAYS * 86_400_000),
      }),
    );

    const url = this.inviteUrl(invite.code);

    if (input.email) {
      // A failed send must not lose the invite — the link works either way,
      // and the inviter can copy it from the UI.
      try {
        await this.email.sendInviteAsync({
          to: input.email,
          inviterName: profile.displayName,
          inviteUrl: url,
          rewardLabel: this.rewardLabel(),
        });
      } catch (error) {
        logger.warn('[invite] email delivery failed; link still valid', error);
      }
    }

    return { invite, url };
  }

  public async listAsync(userId: string): Promise<{
    invites: Invite[];
    acceptedCount: number;
    rewardedCount: number;
    rewardLabel: string | null;
  }> {
    const profile = await this.profiles.getByUserIdAsync(userId);
    if (!profile) throw new NotFoundException('Community profile not found.');

    const invites = await this.learning.listInvitesAsync(profile.id);
    return {
      invites,
      acceptedCount: invites.filter((i) =>
        [InviteStatus.Accepted, InviteStatus.Rewarded].includes(i.status),
      ).length,
      rewardedCount: invites.filter((i) => i.status === InviteStatus.Rewarded)
        .length,
      rewardLabel: this.rewardLabel(),
    };
  }

  /** Look up an invite for the signup screen. Never reveals the invitee's email. */
  public async previewAsync(code: string): Promise<{
    valid: boolean;
    inviterName?: string;
    inviterHandle?: string;
    rewardLabel?: string | null;
  }> {
    const invite = await this.learning.getInviteByCodeAsync(code);
    if (!invite) return { valid: false };
    if (invite.status !== InviteStatus.Sent) return { valid: false };
    if (invite.expiresOn && invite.expiresOn.getTime() < Date.now()) {
      return { valid: false };
    }

    const inviter = await this.profiles.getByIdAsync(invite.inviterProfileId);
    return {
      valid: true,
      inviterName: inviter?.displayName,
      inviterHandle: inviter?.handle,
      rewardLabel: this.rewardLabel(),
    };
  }

  /**
   * Redeem an invite once the invitee has a Community profile.
   *
   * Called from profile creation, not from signup. Both sides are credited,
   * and the credit is idempotent on the invite id — a retried profile creation
   * cannot pay twice.
   */
  public async redeemAsync(input: {
    code: string;
    newProfileId: string;
  }): Promise<boolean> {
    const invite = await this.learning.getInviteByCodeAsync(input.code);
    if (!invite || invite.status !== InviteStatus.Sent) return false;
    if (invite.expiresOn && invite.expiresOn.getTime() < Date.now()) {
      await this.learning.saveInviteAsync(
        Object.assign(invite, { status: InviteStatus.Expired }),
      );
      return false;
    }
    if (invite.inviterProfileId === input.newProfileId) return false;

    const rewardedSoFar = await this.learning.countAcceptedInvitesAsync(
      invite.inviterProfileId,
    );
    const rewardMinor = BigInt(invite.rewardMinor ?? '0');
    const shouldReward =
      rewardMinor > 0n && rewardedSoFar < MAX_REWARDED_INVITES;

    await this.learning.saveInviteAsync(
      Object.assign(invite, {
        status: shouldReward ? InviteStatus.Rewarded : InviteStatus.Accepted,
        acceptedByProfileId: input.newProfileId,
        acceptedOn: new Date(),
      }),
    );

    if (!shouldReward) return true;

    // Referral credit is funded by us, so it carries no platform fee.
    for (const [profileId, label] of [
      [invite.inviterProfileId, 'Referral reward — invite accepted'],
      [input.newProfileId, 'Welcome credit — you joined via an invite'],
    ] as Array<[string, string]>) {
      try {
        await this.monetization.creditAsync({
          profileId,
          kind: LedgerEntryKind.ReferralReward,
          amountMinor: rewardMinor,
          idempotencyKey: `invite:${invite.id}:${profileId}`,
          description: label,
          feeExempt: true,
          counterpartyProfileId:
            profileId === invite.inviterProfileId
              ? input.newProfileId
              : invite.inviterProfileId,
        });
      } catch (error) {
        // A failed credit must not undo the accepted invite — the invite is
        // the fact, the credit is a consequence, and consequences get retried.
        logger.error(
          `[invite] reward credit failed for profile ${profileId}`,
          error,
        );
      }
    }
    return true;
  }

  private inviteUrl(code: string): string {
    const base = (configs.frontend?.url ?? configs.app?.url ?? '').replace(
      /\/+$/,
      '',
    );
    return `${base}/signup?invite=${code}`;
  }

  private rewardLabel(): string | null {
    const minor = Number(configs.community?.inviteRewardMinor ?? 0);
    if (!minor) return null;
    return `€${(minor / 100).toFixed(2)} in Community credit`;
  }
}
