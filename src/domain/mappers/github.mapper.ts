import { LinkedAccount } from "../entities/linkedAccount.entity";
import { GithubProfileModel } from "../contracts/github.model";

export function mapToGithubProfileModel(data: LinkedAccount, includeSensitiveFields: boolean = false): GithubProfileModel {
  return {
    id: data.id,
    userId: data.userId,
    login: data.userName,
    name: data.metaData?.name || null,
    avatarUrl: data.profileImage,
    profileUrl: data.externalUrl,
    bio: data.metaData?.bio || null,
    company: data.metaData?.company || null,
    blog: data.metaData?.blog || null,
    location: data.metaData?.location || null,
    email: includeSensitiveFields ? data.email : null,
    hireable: data.metaData?.hireable || null,
    twitterUsername: data.metaData?.twitterUsername || null,
    publicRepos: data.metaData?.publicRepos || 0,
    publicGists: data.metaData?.publicGists || 0,
    followersCount: data.followersCount,
    followingCount: data.followingCount,
    createdAt: data.metaData?.createdAt,
    allowImport: data.allowImport,
  } as GithubProfileModel;
}
