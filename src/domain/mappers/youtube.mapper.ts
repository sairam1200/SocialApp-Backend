import { LinkedAccount } from "../entities/linkedAccount.entity";
import { YoutubeProfileModel } from "../contracts/youtube.model";

export function mapToYoutubeProfileModel(data: LinkedAccount, includeSensitiveFields: boolean = false): YoutubeProfileModel {
  return {
    id: data.id,
    userId: data.userId,
    userName: data.userName,
    name: data.metaData.name,
    youtubeId: data.externalId,
    allowImport: data.allowImport,
    profileImage: data.profileImage,
    followersCount: data.followersCount,
    followingCount: data.followingCount,
    email: includeSensitiveFields ? data.email : null,
    hd: data.metaData.hd,
    locale: data.metaData.locale,
    channel: data.metaData.channel,
  } as YoutubeProfileModel;
}