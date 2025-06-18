import { LinkedAccount } from "../entities/linkedAccount.entity";
import { TwitterProfileModel } from "../contracts/twitter.model";

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