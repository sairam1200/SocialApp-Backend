import _const from '../../core/utils/const';
import logger from '../../core/utils/winston.util';
import { Injectable, Inject } from '@nestjs/common';
import { EntityManager, In } from 'typeorm';
import { StreamEntityType } from '../../domain/enums';
import { ContentStream, LinkedAccount, UserContent, UserLogin } from '../../domain/entities';
import { IUserLoginRepository } from '../../domain/repositories/iuserLogin.repository';
import { IUserContentRepository } from '../../domain/repositories/iuserContent.repository';
import { ILinkedAccountRepository } from '../../domain/repositories/ilinkedAccount.repository';
import { IContentStreamRepository } from '../../domain/repositories/icontentStream.repository';
import { IPlatformDisconnectService } from '../../domain/services/iplatform-disconnect.service';

@Injectable()
export class PlatformDisconnectService implements IPlatformDisconnectService {
  constructor(
    @Inject(_const.IUSERCONTENT_REPOSITORY)
    private readonly userContentRepository: IUserContentRepository,
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepository: ILinkedAccountRepository,
    @Inject(_const.ICONTENTSTREAM_REPOSITORY)
    private readonly contentStreamRepository: IContentStreamRepository,
    @Inject(_const.IUSERLOGIN_REPOSITORY)
    private readonly userLoginRepository: IUserLoginRepository,
  ) { }

  public async disconnectPlatformAsync(userId: string, platform: string, entityManager?: EntityManager): Promise<void> {
    logger.info(`[PlatformDisconnect] Starting disconnect for user ${userId}, platform ${platform}`);

    const linkedAccount = entityManager
      ? await entityManager.getRepository(LinkedAccount).findOne({ where: { userId, platform } })
      : await this.linkedAccountRepository.getByPlatformAndUserIdAsync(platform, userId);

    if (!linkedAccount) {
      logger.warn(`[PlatformDisconnect] No linked account found for user ${userId}, platform ${platform}`);
      return;
    }

    const userLogin = entityManager
      ? await entityManager.getRepository(UserLogin).findOne({ where: { userId, provider: platform } })
      : await this.userLoginRepository.getByUserIdAndProviderAsync(userId, platform);

    const userContents = await this.fetchAllUserContentAsync(userId, platform);

    await Promise.all([
      this.backupUserContentToContentStreamAsync(userId, platform, userContents, entityManager),
      this.backupProfileToContentStreamAsync(linkedAccount, entityManager),
    ]);

    if (entityManager) {
      if (userContents.length > 0) {
        const externalIds = userContents.map(uc => uc.externalId);
        await entityManager.getRepository(UserContent).delete({ userId, platform, externalId: In(externalIds) });
      }
      if (userLogin) {
        await entityManager.getRepository(UserLogin).delete(userLogin.id);
      }
      await entityManager.getRepository(LinkedAccount).delete(linkedAccount.id);
    } else {
      const deletePromises: Promise<void | LinkedAccount>[] = [
        this.userContentRepository.deleteByUserIdAndPlatformAsync(userId, platform),
      ];
      if (userLogin) {
        deletePromises.push(this.userLoginRepository.deleteAsync(userLogin));
      }
      deletePromises.push(this.linkedAccountRepository.deleteAsync(linkedAccount));
      await Promise.all(deletePromises);
    }

    logger.info(`[PlatformDisconnect] Successfully disconnected platform ${platform} for user ${userId} - backed up ${userContents.length} content items and profile`);
  }

  private async fetchAllUserContentAsync(userId: string, platform: string): Promise<UserContent[]> {
    const allContents: UserContent[] = [];
    let cursor = '';

    while (true) {
      const [contents, nextCursor] = await this.userContentRepository.getByUserIdAsync(
        userId,
        platform,
        cursor,
      );

      allContents.push(...contents);

      if (!nextCursor || contents.length === 0) {
        break;
      }

      cursor = nextCursor;
    }

    return allContents;
  }

  private async backupUserContentToContentStreamAsync(
    userId: string,
    platform: string,
    userContents: UserContent[],
    entityManager?: EntityManager,
  ): Promise<void> {
    if (userContents.length === 0) {
      return;
    }

    const externalIds = userContents.map(uc => uc.externalId);
    const now = new Date();

    if (entityManager) {
      await entityManager.getRepository(ContentStream).delete({ platform, externalId: In(externalIds) });
    } else {
      await this.contentStreamRepository.deleteByPlatformAndExternalIdsAsync(platform, externalIds);
    }

    const contentStreams = userContents.map(userContent =>
      new ContentStream({
        type: StreamEntityType.Content,
        subType: userContent.type,
        title: userContent.title,
        platform: userContent.platform,
        externalId: userContent.externalId,
        metaData: {
          ...userContent.metaData,
          backedUpFrom: 'UserContent',
          originalUserId: userId,
          backedUpAt: now.toISOString(),
        },
        lastRefreshed: now,
      })
    );

    if (entityManager) {
      await entityManager.getRepository(ContentStream).save(contentStreams);
    } else {
      await this.contentStreamRepository.createAsync(contentStreams);
    }
    logger.info(`[PlatformDisconnect] Backed up ${contentStreams.length} UserContent records to ContentStream for platform ${platform}`);
  }

  private async backupProfileToContentStreamAsync(linkedAccount: LinkedAccount, entityManager?: EntityManager): Promise<void> {
    const now = new Date();
    const contentStream = new ContentStream({
      type: StreamEntityType.Profile,
      subType: 'profile',
      title: linkedAccount.userName || `Profile ${linkedAccount.externalId}`,
      platform: linkedAccount.platform,
      externalId: linkedAccount.externalId,
      metaData: {
        userName: linkedAccount.userName,
        profileImage: linkedAccount.profileImage,
        email: linkedAccount.email,
        followersCount: linkedAccount.followersCount,
        followingCount: linkedAccount.followingCount,
        verified: linkedAccount.verified,
        externalUrl: linkedAccount.externalUrl,
        ...linkedAccount.metaData,
        backedUpFrom: 'LinkedAccount',
        originalUserId: linkedAccount.userId,
        backedUpAt: now.toISOString(),
      },
      lastRefreshed: now,
    });

    if (entityManager) {
      await entityManager.getRepository(ContentStream).delete({ platform: linkedAccount.platform, externalId: linkedAccount.externalId });
      await entityManager.getRepository(ContentStream).save([contentStream]);
    } else {
      await this.contentStreamRepository.deleteByPlatformAndExternalIdAsync(
        linkedAccount.platform,
        linkedAccount.externalId,
      );
      await this.contentStreamRepository.createAsync([contentStream]);
    }
  }
}