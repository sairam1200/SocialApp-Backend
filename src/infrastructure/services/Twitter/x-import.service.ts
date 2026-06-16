import { Injectable, Inject } from "@nestjs/common";
import axios from "axios";

import _const from "../../../core/utils/const";
import { ILinkedAccountRepository } from "../../../domain/repositories/ilinkedAccount.repository";
import { IUserContentRepository } from "../../../domain/repositories/iuserContent.repository";
import { UserContent } from "../../../domain/entities/userContent.entity";

@Injectable()
export class TwitterImportService {
  constructor(
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepository: ILinkedAccountRepository,

    @Inject(_const.IUSERCONTENT_REPOSITORY)
    private readonly userContentRepository: IUserContentRepository,
  ) {}

  async importTweetsAsync(
    userId: string,
    accessToken: string,
    twitterUserId: string,
  ): Promise<number> {
    let importedCount = 0;

    await this.userContentRepository.deleteByUserIdAndPlatformAsync(
      userId,
      _const.PLATFORMS.TWITTER,
    );

    const tweetsResponse = await axios.get(
      `https://api.twitter.com/2/users/${twitterUserId}/tweets`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        params: {
          max_results: 10,
          "tweet.fields":
            "created_at,public_metrics,attachments,entities,text",
          expansions:
            "attachments.media_keys",
          "media.fields":
            "url,preview_image_url,type",
        },
      },
    );

    const tweets = tweetsResponse.data?.data ?? [];

    const mediaMap = new Map();

    (
      tweetsResponse.data?.includes?.media ?? []
    ).forEach((media: any) => {
      mediaMap.set(media.media_key, media);
    });

    for (const tweet of tweets) {
      const mediaKey =
        tweet.attachments?.media_keys?.[0];

      const media =
        mediaKey
          ? mediaMap.get(mediaKey)
          : null;

      const metrics =
        tweet.public_metrics ?? {};

      await this.userContentRepository.createAsync(
        new UserContent({
          userId,

          platform:
            _const.PLATFORMS.TWITTER,

          type:
            media?.type ??
            "TWEET",

          externalId:
            tweet.id,

          title:
            tweet.text?.substring(
              0,
              150,
            ) ?? "Tweet",

          metaData: {
            text: tweet.text,

            mediaType:
              media?.type,

            mediaUrl:
              media?.url ??
              media?.preview_image_url,

            thumbnailUrl:
              media?.preview_image_url ??
              media?.url,

            timestamp:
              tweet.created_at,

            importedAt:
              new Date().toISOString(),

            likeCount:
              metrics.like_count ?? 0,

            replyCount:
              metrics.reply_count ?? 0,

            repostCount:
              metrics.retweet_count ?? 0,

            quoteCount:
              metrics.quote_count ?? 0,

            impressionCount:
              metrics.impression_count ?? 0,

            permalink: `https://twitter.com/i/web/status/${tweet.id}`,
          },
        }),
      );

      importedCount++;
    }

    return importedCount;
  }

  async refreshProfileAsync(
    userId: string,
    accessToken: string,
    twitterUserId: string,
  ): Promise<void> {
    const response = await axios.get(
      "https://api.twitter.com/2/users/me",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        params: {
          "user.fields":
            "profile_image_url,public_metrics,username,name",
        },
      },
    );

    const profile =
      response.data?.data;

    const linkedAccount =
      await this.linkedAccountRepository.getByPlatformAndUserIdAsync(
        _const.PLATFORMS.TWITTER,
        userId,
      );

    if (!linkedAccount) {
      throw new Error(
        "Twitter linked account not found",
      );
    }

    linkedAccount.externalId =
      profile.id;

    linkedAccount.userName =
      profile.username;

    linkedAccount.metaData = {
      ...(linkedAccount.metaData ?? {}),

      displayName:
        profile.name,

      profileImage:
        profile.profile_image_url,

      followersCount:
        profile.public_metrics
          ?.followers_count ?? 0,

      followingCount:
        profile.public_metrics
          ?.following_count ?? 0,

      tweetCount:
        profile.public_metrics
          ?.tweet_count ?? 0,

      listedCount:
        profile.public_metrics
          ?.listed_count ?? 0,
    };

    await this.linkedAccountRepository.updateAsync(
      linkedAccount,
    );
  }
}