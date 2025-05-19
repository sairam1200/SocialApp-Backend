import { SpotifyProfileModel } from "../contracts/spotify.model";
import { LinkedAccount } from "../entities/linkedAccount.entity";

export function mapToSpotifyProfileModel(data: LinkedAccount, includeSensitiveFields: boolean = false): SpotifyProfileModel {
  return {
    id: data.id,
    userId: data.userId,
    explicitContentEnabled: data.metaData.explicitContentEnabled,
    explicitContentLocked: data.metaData.explicitContentLocked,
    accountType: data.metaData.accountType,
    country: includeSensitiveFields ? data.metaData.country : null,
    email: includeSensitiveFields ? data.email : null,
    followersCount: data.followersCount,
    followingCount: data.followingCount,
    userName: data.userName,
    spotifyId: data.externalId,
    allowImport: data.allowImport,
    name: data.metaData.name,
    product: data.metaData.product,
    profileImage: data.profileImage,
    spotifyUrl: data.metaData.spotifyUrl,
    uri: data.metaData.uri,
  } as SpotifyProfileModel;
}