import { InjectRepository } from '@nestjs/typeorm';
import { Injectable } from '@nestjs/common';
import { In, Repository } from 'typeorm';
import {
  AudienceMember,
  EngagementEvent,
  Mute,
  PollOption,
  PollVote,
  Reaction,
  Report,
  Share,
  TopicAffinity,
} from '../../../domain/entities/social';
import { Visibility } from '../../../domain/enums';
import { IEngagementRepository } from '../../../domain/repositories/isocial.repository';

@Injectable()
export class EngagementRepository implements IEngagementRepository {
  constructor(
    @InjectRepository(Reaction)
    private readonly reactions: Repository<Reaction>,
    @InjectRepository(Share)
    private readonly shares: Repository<Share>,
    @InjectRepository(EngagementEvent)
    private readonly events: Repository<EngagementEvent>,
    @InjectRepository(TopicAffinity)
    private readonly affinities: Repository<TopicAffinity>,
    @InjectRepository(Mute)
    private readonly mutes: Repository<Mute>,
    @InjectRepository(AudienceMember)
    private readonly audiences: Repository<AudienceMember>,
    @InjectRepository(PollVote)
    private readonly pollVotes: Repository<PollVote>,
    @InjectRepository(PollOption)
    private readonly pollOptions: Repository<PollOption>,
    @InjectRepository(Report)
    private readonly reports: Repository<Report>,
  ) {}

  /* ------------------------------------------------------------- reactions */

  public async getReactionAsync(
    postId: string,
    profileId: string,
  ): Promise<Reaction | null> {
    return this.reactions.findOne({ where: { postId, profileId } });
  }

  public async getReactionsForPostsAsync(
    postIds: string[],
    profileId: string,
  ): Promise<Reaction[]> {
    if (postIds.length === 0 || !profileId) return [];
    return this.reactions.find({
      where: { postId: In(postIds), profileId },
    });
  }

  /**
   * Upsert on the unique (postId, profileId) pair.
   *
   * A find-then-save would race two taps of the like button into a unique
   * violation; `ON CONFLICT` makes the second one a no-op update.
   */
  public async upsertReactionAsync(reaction: Reaction): Promise<Reaction> {
    await this.reactions
      .createQueryBuilder()
      .insert()
      .into(Reaction)
      .values(reaction)
      .orUpdate(['type', 'lastModifiedOn'], ['postId', 'profileId'])
      .execute();
    return (await this.getReactionAsync(
      reaction.postId,
      reaction.profileId,
    )) as Reaction;
  }

  public async removeReactionAsync(
    postId: string,
    profileId: string,
  ): Promise<boolean> {
    const result = await this.reactions.delete({ postId, profileId });
    return (result.affected ?? 0) > 0;
  }

  /* ---------------------------------------------------------------- shares */

  public async createShareAsync(share: Share): Promise<Share> {
    return this.shares.save(share);
  }

  public async getShareByCodeAsync(code: string): Promise<Share | null> {
    if (!code) return null;
    return this.shares.findOne({ where: { referralCode: code } });
  }

  public async incrementShareVisitAsync(code: string): Promise<void> {
    await this.shares.query(
      `UPDATE "social"."shares" SET "visitsCount" = "visitsCount" + 1 WHERE "referralCode" = $1`,
      [code],
    );
  }

  /* --------------------------------------------------------------- signals */

  /**
   * Batched insert.
   *
   * Impressions arrive in bursts of twenty from one feed page; twenty
   * round-trips per scroll would dominate the request. `save` on an array is
   * one multi-row INSERT.
   */
  public async recordEventsAsync(events: EngagementEvent[]): Promise<void> {
    if (events.length === 0) return;
    await this.events.save(events, { chunk: 200 });
  }

  public async getRecentEventsAsync(
    actorProfileId: string,
    sinceHours: number,
    limit: number,
  ): Promise<EngagementEvent[]> {
    return this.events
      .createQueryBuilder('e')
      .where('e."actorProfileId" = :actorProfileId', { actorProfileId })
      .andWhere(`e."createdOn" > NOW() - (:sinceHours || ' hours')::interval`, {
        sinceHours,
      })
      .orderBy('e."createdOn"', 'DESC')
      .limit(Math.min(limit, 1000))
      .getMany();
  }

  /* ------------------------------------------------------------ affinities */

  public async getAffinitiesAsync(profileId: string): Promise<TopicAffinity[]> {
    if (!profileId) return [];
    return this.affinities.find({
      where: { profileId },
      order: { weight: 'DESC' },
      take: 300,
    });
  }

  public async upsertAffinitiesAsync(
    affinities: TopicAffinity[],
  ): Promise<void> {
    if (affinities.length === 0) return;
    await this.affinities
      .createQueryBuilder()
      .insert()
      .into(TopicAffinity)
      .values(affinities)
      .orUpdate(
        ['weight', 'decayedOn', 'lastModifiedOn'],
        ['profileId', 'topic'],
      )
      .execute();
  }

  public async setAffinityFlagsAsync(
    profileId: string,
    topic: string,
    flags: { isPinned?: boolean; isMuted?: boolean; weight?: number },
  ): Promise<void> {
    const existing = await this.affinities.findOne({
      where: { profileId, topic: topic.toLowerCase() },
    });
    if (existing) {
      await this.affinities.update(existing.id, flags);
      return;
    }
    await this.affinities.save(
      new TopicAffinity({
        profileId,
        topic: topic.toLowerCase(),
        weight: flags.weight ?? 0,
        isPinned: flags.isPinned ?? false,
        isMuted: flags.isMuted ?? false,
        decayedOn: new Date(),
      }),
    );
  }

  /* ------------------------------------------------------------------ mutes */

  public async getMutedIdsAsync(profileId: string): Promise<string[]> {
    if (!profileId) return [];
    const rows = await this.mutes.find({
      where: { profileId },
      select: { targetProfileId: true },
    });
    return rows.map((r) => r.targetProfileId);
  }

  /**
   * Blocks in either direction.
   *
   * A block hides the blocker from the blocked as well — otherwise blocking
   * someone tells them nothing and shows them everything, which is the wrong
   * way round.
   */
  public async getBlockedPairIdsAsync(profileId: string): Promise<string[]> {
    if (!profileId) return [];
    const rows = await this.mutes
      .createQueryBuilder('m')
      .select(['m."profileId" AS a', 'm."targetProfileId" AS b'])
      .where('m."isBlock" = true')
      .andWhere('(m."profileId" = :id OR m."targetProfileId" = :id)', {
        id: profileId,
      })
      .getRawMany<{ a: string; b: string }>();
    const ids = new Set<string>();
    for (const row of rows) {
      ids.add(row.a === profileId ? row.b : row.a);
    }
    return Array.from(ids);
  }

  public async setMuteAsync(mute: Mute): Promise<Mute> {
    await this.mutes
      .createQueryBuilder()
      .insert()
      .into(Mute)
      .values(mute)
      .orUpdate(['isBlock', 'lastModifiedOn'], ['profileId', 'targetProfileId'])
      .execute();
    return (await this.mutes.findOne({
      where: {
        profileId: mute.profileId,
        targetProfileId: mute.targetProfileId,
      },
    })) as Mute;
  }

  public async removeMuteAsync(
    profileId: string,
    targetProfileId: string,
  ): Promise<boolean> {
    const result = await this.mutes.delete({ profileId, targetProfileId });
    return (result.affected ?? 0) > 0;
  }

  /* -------------------------------------------------------------- audiences */

  public async getAudienceMembershipAsync(
    ownerProfileId: string,
    memberProfileId: string,
  ): Promise<AudienceMember[]> {
    if (!ownerProfileId || !memberProfileId) return [];
    return this.audiences.find({
      where: { ownerProfileId, memberProfileId },
    });
  }

  public async listAudienceAsync(
    ownerProfileId: string,
    audience: Visibility,
  ): Promise<AudienceMember[]> {
    return this.audiences.find({
      where: { ownerProfileId, audience },
      take: 5000,
    });
  }

  /**
   * The reverse lookup: audiences this profile has been added to by others.
   *
   * The forward direction answers "who is in my close friends"; this answers
   * "whose close friends am I in", which is what the feed needs to know
   * whether a narrower post is visible.
   */
  public async listAudiencesForMemberAsync(
    memberProfileId: string,
  ): Promise<AudienceMember[]> {
    if (!memberProfileId) return [];
    return this.audiences.find({
      where: { memberProfileId },
      take: 5000,
    });
  }

  public async addToAudienceAsync(
    member: AudienceMember,
  ): Promise<AudienceMember> {
    await this.audiences
      .createQueryBuilder()
      .insert()
      .into(AudienceMember)
      .values(member)
      .orIgnore()
      .execute();
    return (await this.audiences.findOne({
      where: {
        ownerProfileId: member.ownerProfileId,
        memberProfileId: member.memberProfileId,
        audience: member.audience,
      },
    })) as AudienceMember;
  }

  public async removeFromAudienceAsync(
    ownerProfileId: string,
    memberProfileId: string,
    audience: Visibility,
  ): Promise<boolean> {
    const result = await this.audiences.delete({
      ownerProfileId,
      memberProfileId,
      audience,
    });
    return (result.affected ?? 0) > 0;
  }

  /* ------------------------------------------------------------------ polls */

  public async getPollVoteAsync(
    postId: string,
    voterProfileId: string,
  ): Promise<PollVote | null> {
    return this.pollVotes.findOne({ where: { postId, voterProfileId } });
  }

  public async getPollVotesForPostsAsync(
    postIds: string[],
    voterProfileId: string,
  ): Promise<PollVote[]> {
    if (postIds.length === 0 || !voterProfileId) return [];
    return this.pollVotes.find({
      where: { postId: In(postIds), voterProfileId },
    });
  }

  public async castPollVoteAsync(vote: PollVote): Promise<PollVote> {
    return this.pollVotes.save(vote);
  }

  public async incrementPollOptionAsync(
    optionId: string,
    delta: number,
  ): Promise<void> {
    await this.pollOptions.query(
      `UPDATE "social"."poll_options" SET "votesCount" = GREATEST(0, "votesCount" + $2) WHERE "id" = $1`,
      [optionId, delta],
    );
  }

  /* ---------------------------------------------------------------- reports */

  public async createReportAsync(report: Report): Promise<Report> {
    return this.reports.save(report);
  }

  public async listReportsAsync(
    status: string | null,
    limit: number,
  ): Promise<Report[]> {
    const builder = this.reports
      .createQueryBuilder('r')
      .orderBy('r."createdOn"', 'DESC')
      .limit(Math.min(limit, 200));
    if (status) builder.where('r."status" = :status', { status });
    return builder.getMany();
  }
}
