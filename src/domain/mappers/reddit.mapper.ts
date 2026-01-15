import { LinkedAccount } from "../entities/linkedAccount.entity";
import { UserContent } from "../entities/userContent.entity";
import { RedditContentModel, RedditProfileModel } from "../contracts/reddit.model";
import _const from "../../core/utils/const";

/**
 * Maps a LinkedAccount entity to a RedditProfileModel.
 * @param data LinkedAccount entity representing Reddit account info.
 * @param includeSensitiveFields Whether to include sensitive data (like email).
 */
export function mapToRedditProfileModel(data: LinkedAccount, includeSensitiveFields: boolean = false): RedditProfileModel {
  return {
    id: data.id,
    userId: data.userId,
    redditId: data.externalId,
    userName: data.userName,
    profileImage: data.profileImage,
    allowImport: data.allowImport,
    karma: {
      link: data.metaData.linkKarma,
      comment: data.metaData.commentKarma,
      total: (data.metaData.linkKarma ?? 0) + (data.metaData.commentKarma ?? 0),
    },
    isVerified: data.metaData.verified,
    isGold: data.metaData.isGold,
    isMod: data.metaData.isMod,
    hasVerifiedEmail: includeSensitiveFields ? data.metaData.hasVerifiedEmail : null,
    over18: data.metaData.over18,
    redditUrl: data.metaData.redditUrl,
    description: data.metaData.description,
    displayName: data.metaData.displayName,
    createdAt: data.metaData.createdAt,
  } as RedditProfileModel;
}

export function mapToRedditContentModel(data: UserContent): RedditContentModel {
  return {
    id: data.id,
    title: data.title,
    type: data.type,
    platform: data.platform,
    externalId: data.externalId,
    subreddit: data.metaData?.subreddit,
    author: data.metaData?.author,
    score: data.metaData?.score,
    upvoteRatio: data.metaData?.upvoteRatio,
    numComments: data.metaData?.numComments,
    url: data.metaData?.url,
    permalink: data.metaData?.permalink,
    createdUtc: data.metaData?.createdUtc,
    selftext: data.metaData?.selftext,
    thumbnail: data.metaData?.thumbnail,
  } as RedditContentModel;
}
