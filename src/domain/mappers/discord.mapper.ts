import { LinkedAccount } from "../entities/linkedAccount.entity";
import { DiscordProfileModel } from "../contracts/discord.model";

export function mapToDiscordProfileModel(data: LinkedAccount, includeSensitiveFields: boolean = false): DiscordProfileModel {
  return {
    id: data.id,
    userId: data.userId,
    username: data.userName,
    globalName: data.metaData?.globalName || null,
    avatarUrl: data.profileImage,
    profileUrl: data.externalUrl,
    email: includeSensitiveFields ? data.email : null,
    verified: data.verified,
    bannerColor: data.metaData?.accentColor || null,
    premiumType: data.metaData?.premiumType || 0,
    allowImport: data.allowImport,
  } as DiscordProfileModel;
}
