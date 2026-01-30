import { Injectable, Inject } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue, Job } from 'bullmq';
import _const from '../../core/utils/const';
import { IQueueService } from '../../domain/services/iqueue.service';
import { LinkedAccount } from '../../domain/entities/linkedAccount.entity';
import logger from '../../core/utils/winston.util';

@Injectable()
export class QueueService implements IQueueService {
  constructor(
    @InjectQueue(_const.BULL_QUEUES.YOUTUBE_IMPORT)
    private readonly youtubeImportQueue: Queue,
    @InjectQueue(_const.BULL_QUEUES.SPOTIFY_IMPORT)
    private readonly spotifyImportQueue: Queue,
    @InjectQueue(_const.BULL_QUEUES.PINTEREST_IMPORT)
    private readonly pinterestImportQueue: Queue,
    @InjectQueue(_const.BULL_QUEUES.REDDIT_IMPORT)
    private readonly redditImportQueue: Queue,
    @InjectQueue(_const.BULL_QUEUES.TWITTER_IMPORT)
    private readonly twitterImportQueue: Queue,
    @InjectQueue(_const.BULL_QUEUES.TIKTOK_IMPORT)
    private readonly tiktokImportQueue: Queue,
    @InjectQueue(_const.BULL_QUEUES.INSTAGRAM_IMPORT)
    private readonly instagramImportQueue: Queue,
    @InjectQueue(_const.BULL_QUEUES.FACEBOOK_IMPORT)
    private readonly facebookImportQueue: Queue,
    @InjectQueue(_const.BULL_QUEUES.LINKEDIN_IMPORT)
    private readonly linkedinImportQueue: Queue,
    @InjectQueue(_const.BULL_QUEUES.SNAPCHAT_IMPORT)
    private readonly snapchatImportQueue: Queue,
    @InjectQueue(_const.BULL_QUEUES.THREADS_IMPORT)
    private readonly threadsImportQueue: Queue,
    @InjectQueue(_const.BULL_QUEUES.BEHANCE_IMPORT)
    private readonly behanceImportQueue: Queue,
  ) { }

  public async enqueueYoutubeImport(account: LinkedAccount, accessToken: string): Promise<string> {
    const job = await this.youtubeImportQueue.add('youtube-import-job', {
      account,
      accessToken,
    }, {
      jobId: `youtube-import-${account.userId}`,
    });

    logger.info(`[QueueService] YouTube import job enqueued: ${job.id} for user ${account.userId}`);
    return job.id!;
  }

  public async enqueueSpotifyImport(account: LinkedAccount, accessToken: string): Promise<string> {
    const job = await this.spotifyImportQueue.add('spotify-import-job', {
      account,
      accessToken,
    }, {
      jobId: `spotify-import-${account.userId}`,
    });

    logger.info(`[QueueService] Spotify import job enqueued: ${job.id} for user ${account.userId}`);
    return job.id!;
  }

  public async cancelYoutubeImport(userId: string): Promise<void> {
    const jobId = `youtube-import-${userId}`;
    const job = await this.youtubeImportQueue.getJob(jobId);

    if (job) {
      if (await job.isActive()) {
        await job.remove();
        logger.info(`[QueueService] Cancelled active YouTube import job ${jobId} for user ${userId}`);
      } else if (await job.isWaiting()) {
        await job.remove();
        logger.info(`[QueueService] Removed waiting YouTube import job ${jobId} for user ${userId}`);
      } else {
        logger.warn(`[QueueService] YouTube import job ${jobId} is not in a cancellable state`);
      }
    } else {
      logger.warn(`[QueueService] YouTube import job ${jobId} not found for user ${userId}`);
    }
  }

  public async cancelSpotifyImport(userId: string): Promise<void> {
    const jobId = `spotify-import-${userId}`;
    const job = await this.spotifyImportQueue.getJob(jobId);

    if (job) {
      if (await job.isActive()) {
        await job.remove();
        logger.info(`[QueueService] Cancelled active Spotify import job ${jobId} for user ${userId}`);
      } else if (await job.isWaiting()) {
        await job.remove();
        logger.info(`[QueueService] Removed waiting Spotify import job ${jobId} for user ${userId}`);
      } else {
        logger.warn(`[QueueService] Spotify import job ${jobId} is not in a cancellable state`);
      }
    } else {
      logger.warn(`[QueueService] Spotify import job ${jobId} not found for user ${userId}`);
    }
  }

  public async enqueuePinterestImport(account: LinkedAccount, accessToken: string): Promise<string> {
    const job = await this.pinterestImportQueue.add('pinterest-import-job', {
      account,
      accessToken,
    }, {
      jobId: `pinterest-import-${account.userId}`,
    });

    logger.info(`[QueueService] Pinterest import job enqueued: ${job.id} for user ${account.userId}`);
    return job.id!;
  }

  public async enqueueRedditImport(account: LinkedAccount, accessToken: string): Promise<string> {
    const job = await this.redditImportQueue.add('reddit-import-job', {
      account,
      accessToken,
    }, {
      jobId: `reddit-import-${account.userId}`,
    });

    logger.info(`[QueueService] Reddit import job enqueued: ${job.id} for user ${account.userId}`);
    return job.id!;
  }

  public async enqueueTwitterImport(account: LinkedAccount, accessToken: string): Promise<string> {
    const job = await this.twitterImportQueue.add('twitter-import-job', {
      account,
      accessToken,
    }, {
      jobId: `twitter-import-${account.userId}`,
    });

    logger.info(`[QueueService] Twitter import job enqueued: ${job.id} for user ${account.userId}`);
    return job.id!;
  }

  public async cancelPinterestImport(userId: string): Promise<void> {
    const jobId = `pinterest-import-${userId}`;
    const job = await this.pinterestImportQueue.getJob(jobId);

    if (job) {
      if (await job.isActive()) {
        await job.remove();
        logger.info(`[QueueService] Cancelled active Pinterest import job ${jobId} for user ${userId}`);
      } else if (await job.isWaiting()) {
        await job.remove();
        logger.info(`[QueueService] Removed waiting Pinterest import job ${jobId} for user ${userId}`);
      } else {
        logger.warn(`[QueueService] Pinterest import job ${jobId} is not in a cancellable state`);
      }
    } else {
      logger.warn(`[QueueService] Pinterest import job ${jobId} not found for user ${userId}`);
    }
  }

  public async cancelRedditImport(userId: string): Promise<void> {
    const jobId = `reddit-import-${userId}`;
    const job = await this.redditImportQueue.getJob(jobId);

    if (job) {
      if (await job.isActive()) {
        await job.remove();
        logger.info(`[QueueService] Cancelled active Reddit import job ${jobId} for user ${userId}`);
      } else if (await job.isWaiting()) {
        await job.remove();
        logger.info(`[QueueService] Removed waiting Reddit import job ${jobId} for user ${userId}`);
      } else {
        logger.warn(`[QueueService] Reddit import job ${jobId} is not in a cancellable state`);
      }
    } else {
      logger.warn(`[QueueService] Reddit import job ${jobId} not found for user ${userId}`);
    }
  }

  public async cancelTwitterImport(userId: string): Promise<void> {
    const jobId = `twitter-import-${userId}`;
    const job = await this.twitterImportQueue.getJob(jobId);

    if (job) {
      if (await job.isActive()) {
        await job.remove();
        logger.info(`[QueueService] Cancelled active Twitter import job ${jobId} for user ${userId}`);
      } else if (await job.isWaiting()) {
        await job.remove();
        logger.info(`[QueueService] Removed waiting Twitter import job ${jobId} for user ${userId}`);
      } else {
        logger.warn(`[QueueService] Twitter import job ${jobId} is not in a cancellable state`);
      }
    } else {
      logger.warn(`[QueueService] Twitter import job ${jobId} not found for user ${userId}`);
    }
  }

  public async enqueueTiktokImport(account: LinkedAccount, accessToken: string): Promise<string> {
    const job = await this.tiktokImportQueue.add('tiktok-import-job', {
      account,
      accessToken,
    }, {
      jobId: `tiktok-import-${account.userId}`,
    });

    logger.info(`[QueueService] TikTok import job enqueued: ${job.id} for user ${account.userId}`);
    return job.id!;
  }

  public async enqueueInstagramImport(account: LinkedAccount, accessToken: string): Promise<string> {
    const job = await this.instagramImportQueue.add('instagram-import-job', {
      account,
      accessToken,
    }, {
      jobId: `instagram-import-${account.userId}`,
    });

    logger.info(`[QueueService] Instagram import job enqueued: ${job.id} for user ${account.userId}`);
    return job.id!;
  }

  public async enqueueFacebookImport(account: LinkedAccount, accessToken: string): Promise<string> {
    const job = await this.facebookImportQueue.add('facebook-import-job', {
      account,
      accessToken,
    }, {
      jobId: `facebook-import-${account.userId}`,
    });

    logger.info(`[QueueService] Facebook import job enqueued: ${job.id} for user ${account.userId}`);
    return job.id!;
  }

  public async enqueueLinkedInImport(account: LinkedAccount, accessToken: string): Promise<string> {
    const job = await this.linkedinImportQueue.add('linkedin-import-job', {
      account,
      accessToken,
    }, {
      jobId: `linkedin-import-${account.userId}`,
    });

    logger.info(`[QueueService] LinkedIn import job enqueued: ${job.id} for user ${account.userId}`);
    return job.id!;
  }

  public async cancelTiktokImport(userId: string): Promise<void> {
    const jobId = `tiktok-import-${userId}`;
    const job = await this.tiktokImportQueue.getJob(jobId);

    if (job) {
      if (await job.isActive()) {
        await job.remove();
        logger.info(`[QueueService] Cancelled active TikTok import job ${jobId} for user ${userId}`);
      } else if (await job.isWaiting()) {
        await job.remove();
        logger.info(`[QueueService] Removed waiting TikTok import job ${jobId} for user ${userId}`);
      } else {
        logger.warn(`[QueueService] TikTok import job ${jobId} is not in a cancellable state`);
      }
    } else {
      logger.warn(`[QueueService] TikTok import job ${jobId} not found for user ${userId}`);
    }
  }

  public async cancelInstagramImport(userId: string): Promise<void> {
    const jobId = `instagram-import-${userId}`;
    const job = await this.instagramImportQueue.getJob(jobId);

    if (job) {
      if (await job.isActive()) {
        await job.remove();
        logger.info(`[QueueService] Cancelled active Instagram import job ${jobId} for user ${userId}`);
      } else if (await job.isWaiting()) {
        await job.remove();
        logger.info(`[QueueService] Removed waiting Instagram import job ${jobId} for user ${userId}`);
      } else {
        logger.warn(`[QueueService] Instagram import job ${jobId} is not in a cancellable state`);
      }
    } else {
      logger.warn(`[QueueService] Instagram import job ${jobId} not found for user ${userId}`);
    }
  }

  public async cancelFacebookImport(userId: string): Promise<void> {
    const jobId = `facebook-import-${userId}`;
    const job = await this.facebookImportQueue.getJob(jobId);

    if (job) {
      if (await job.isActive()) {
        await job.remove();
        logger.info(`[QueueService] Cancelled active Facebook import job ${jobId} for user ${userId}`);
      } else if (await job.isWaiting()) {
        await job.remove();
        logger.info(`[QueueService] Removed waiting Facebook import job ${jobId} for user ${userId}`);
      } else {
        logger.warn(`[QueueService] Facebook import job ${jobId} is not in a cancellable state`);
      }
    } else {
      logger.warn(`[QueueService] Facebook import job ${jobId} not found for user ${userId}`);
    }
  }

  public async cancelLinkedInImport(userId: string): Promise<void> {
    const jobId = `linkedin-import-${userId}`;
    const job = await this.linkedinImportQueue.getJob(jobId);

    if (job) {
      if (await job.isActive()) {
        await job.remove();
        logger.info(`[QueueService] Cancelled active LinkedIn import job ${jobId} for user ${userId}`);
      } else if (await job.isWaiting()) {
        await job.remove();
        logger.info(`[QueueService] Removed waiting LinkedIn import job ${jobId} for user ${userId}`);
      } else {
        logger.warn(`[QueueService] LinkedIn import job ${jobId} is not in a cancellable state`);
      }
    } else {
      logger.warn(`[QueueService] LinkedIn import job ${jobId} not found for user ${userId}`);
    }
  }

  public async enqueueSnapchatImport(account: LinkedAccount, accessToken: string): Promise<string> {
    const job = await this.snapchatImportQueue.add('snapchat-import-job', {
      account,
      accessToken,
    }, {
      jobId: `snapchat-import-${account.userId}`,
    });

    logger.info(`[QueueService] Snapchat import job enqueued: ${job.id} for user ${account.userId}`);
    return job.id!;
  }

  public async enqueueThreadsImport(account: LinkedAccount, accessToken: string): Promise<string> {
    const job = await this.threadsImportQueue.add('threads-import-job', {
      account,
      accessToken,
    }, {
      jobId: `threads-import-${account.userId}`,
    });

    logger.info(`[QueueService] Threads import job enqueued: ${job.id} for user ${account.userId}`);
    return job.id!;
  }

  public async enqueueBehanceImport(account: LinkedAccount, accessToken: string): Promise<string> {
    const job = await this.behanceImportQueue.add('behance-import-job', {
      account,
      accessToken,
    }, {
      jobId: `behance-import-${account.userId}`,
    });

    logger.info(`[QueueService] Behance import job enqueued: ${job.id} for user ${account.userId}`);
    return job.id!;
  }

  public async cancelSnapchatImport(userId: string): Promise<void> {
    const jobId = `snapchat-import-${userId}`;
    const job = await this.snapchatImportQueue.getJob(jobId);

    if (job) {
      if (await job.isActive()) {
        await job.remove();
        logger.info(`[QueueService] Cancelled active Snapchat import job ${jobId} for user ${userId}`);
      } else if (await job.isWaiting()) {
        await job.remove();
        logger.info(`[QueueService] Removed waiting Snapchat import job ${jobId} for user ${userId}`);
      } else {
        logger.warn(`[QueueService] Snapchat import job ${jobId} is not in a cancellable state`);
      }
    } else {
      logger.warn(`[QueueService] Snapchat import job ${jobId} not found for user ${userId}`);
    }
  }

  public async cancelThreadsImport(userId: string): Promise<void> {
    const jobId = `threads-import-${userId}`;
    const job = await this.threadsImportQueue.getJob(jobId);

    if (job) {
      if (await job.isActive()) {
        await job.remove();
        logger.info(`[QueueService] Cancelled active Threads import job ${jobId} for user ${userId}`);
      } else if (await job.isWaiting()) {
        await job.remove();
        logger.info(`[QueueService] Removed waiting Threads import job ${jobId} for user ${userId}`);
      } else {
        logger.warn(`[QueueService] Threads import job ${jobId} is not in a cancellable state`);
      }
    } else {
      logger.warn(`[QueueService] Threads import job ${jobId} not found for user ${userId}`);
    }
  }

  public async cancelBehanceImport(userId: string): Promise<void> {
    const jobId = `behance-import-${userId}`;
    const job = await this.behanceImportQueue.getJob(jobId);

    if (job) {
      if (await job.isActive()) {
        await job.remove();
        logger.info(`[QueueService] Cancelled active Behance import job ${jobId} for user ${userId}`);
      } else if (await job.isWaiting()) {
        await job.remove();
        logger.info(`[QueueService] Removed waiting Behance import job ${jobId} for user ${userId}`);
      } else {
        logger.warn(`[QueueService] Behance import job ${jobId} is not in a cancellable state`);
      }
    } else {
      logger.warn(`[QueueService] Behance import job ${jobId} not found for user ${userId}`);
    }
  }
}
