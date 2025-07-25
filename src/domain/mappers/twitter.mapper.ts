import { LinkedAccount } from "../entities/linkedAccount.entity";
import { TwitterProfileModel, UserLikedTweetModel, UserTweetModel } from "../contracts/twitter.model";
import { UserContent } from "domain/entities";

export function mapToTwitterProfileModel(data: LinkedAccount, includeSensitiveFields: boolean = false): TwitterProfileModel {
  return {
    id: data.id,
    userId: data.userId,
    userName: data.userName,
    twitterId: data.externalId,
    allowImport: data.allowImport,
    profileImage: data.profileImage,
    followersCount: data.followersCount,
    followingCount: data.followingCount,
    email: includeSensitiveFields ? data.email : null,
    countryCodes: data.metaData.countryCodes,
    createdAt: data.metaData.createdAt,
    description: data.metaData.description,
    entities: data.metaData.description,
    listedCount: data.metaData.listedCount,
    location: data.metaData.location,
    name: data.metaData.name,
    pinnedTweetId: data.metaData.pinnedTweetId,
    protected: data.metaData.protected,
    tweetCount: data.metaData.tweetCount,
    url: data.metaData.url,
    verified: data.metaData.verified,
  } as TwitterProfileModel;
}

export function mapToUserTweetModel(data: UserContent): UserTweetModel{
  return {
    id: data.id,
    type: 'tweet',
    name: data.title,
    tweetId: data.externalId,
    tweet: data.metaData.text,
    editHistoryTweetIds: data.metaData.edit_history_tweet_ids,
  } as UserTweetModel;
}
export function mapToLikedTweetModel(data: UserContent): UserLikedTweetModel {
  return {
    id: data.id,
    type: 'tweet',
    name: data.title,
    tweetId: data.externalId,
    likedTweet: data.metaData.text,
    editHistoryTweetIds: data.metaData.edit_history_tweet_ids,
  } as UserLikedTweetModel;
}
