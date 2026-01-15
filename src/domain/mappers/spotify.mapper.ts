import { ApiProperty } from '@nestjs/swagger';
import { UserContent } from "../entities/userContent.entity";
import { LinkedAccount } from "../entities/linkedAccount.entity";
import { SpotifyAlbumModel, SpotifyPlaylistModel, SpotifyProfileModel, SpotifyShowModel, SpotifyTrackModel } from "../contracts/spotify.model";

export class SpotifyContentModel {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ enum: ['playlist', 'track', 'album', 'show'] })
  type: 'playlist' | 'track' | 'album' | 'show';

  @ApiProperty()
  platform: string;

  @ApiProperty()
  externalId: string;

  [key: string]: any;
}

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

export function mapToSpotifyPlaylistModel(data: UserContent): SpotifyPlaylistModel {
  return {
    id: data.id,
    name: data.title,
    type: 'playlist',
    owner: data.metaData.owner,
    public: data.metaData.public,
    imageUrl: data.metaData.imageUrl,
    createdAt: data.metaData.createdAt,
    updatedAt: data.metaData.updatedAt,
    trackCount: data.metaData.trackCount,
    playListId: data.externalId,
    description: data.metaData.description,

  } as SpotifyPlaylistModel;
}

export function mapToSpotifyTrackModel(data: UserContent): SpotifyTrackModel {
  return {
    id: data.id,
    name: data.title,
    type: 'track',
    releaseDate: data.metaData.releaseDate,
    popularity: data.metaData.popularity,
    durationMs: data.metaData.durationMs,
    previewUrl: data.metaData.previewUrl,
    explicit: data.metaData.explicit,
    album: data.metaData.album.map(album => ({
      id: album.id,
      name: album.name,
      href: album.href,
      imageUrl: album.imageUrl,
    })),
    artists: data.metaData.artists.map(artist => ({
      name: artist.name,
      type: artist.type,
      href: artist.href,
    })),
    url: data.metaData.url,

  } as SpotifyTrackModel;
}

export function mapToSpotifyAlbumModel(data: UserContent): SpotifyAlbumModel {
  return {
    id: data.id,
    albumId: data.externalId,
    type: 'album',
    name: data.title,
    artists: data.metaData.artists.map(artist => ({
      name: artist.name,
      type: artist.type,
      href: artist.href,
    })),
    releaseDate: data.metaData.releaseDate,
    totalTracks: data.metaData.totalTracks,
    imageUrl: data.metaData.imageUrl,
    url: data.metaData.url,
  } as SpotifyAlbumModel;
}

export function mapToSpotifyContentModel(data: UserContent): SpotifyContentModel {
  const type = data.type as 'playlist' | 'track' | 'album' | 'show';

  let mappedContent: SpotifyContentModel;

  switch (type) {
    case 'playlist':
      mappedContent = {
        ...mapToSpotifyPlaylistModel(data),
        platform: data.platform,
        externalId: data.externalId,
      } as SpotifyContentModel;
      break;
    case 'track':
      mappedContent = {
        ...mapToSpotifyTrackModel(data),
        platform: data.platform,
        externalId: data.externalId,
      } as SpotifyContentModel;
      break;
    case 'album':
      mappedContent = {
        ...mapToSpotifyAlbumModel(data),
        platform: data.platform,
        externalId: data.externalId,
      } as SpotifyContentModel;
      break;
    case 'show':
      mappedContent = {
        ...mapToSpotifyShowModel(data),
        platform: data.platform,
        externalId: data.externalId,
      } as SpotifyContentModel;
      break;
    default:
      mappedContent = {
        id: data.id,
        name: data.title,
        type: 'playlist' as const,
        platform: data.platform,
        externalId: data.externalId,
      };
      break;
  }

  return mappedContent;
}

export function mapToSpotifyShowModel(data: UserContent): SpotifyShowModel {
  return {
    id: data.id,
    showId: data.externalId,
    type: 'show',
    name: data.title,
    description: data.metaData.description,
    htmlDescription: data.metaData.htmlDescription,
    languages: data.metaData.languages,
    publisher: data.metaData.publisher,
    imageUrl: data.metaData.imageUrl,
    addedOn: data.metaData.addedOn,
    totalEpisodes: data.metaData.totalEpisodes,
    mediaType: data.metaData.mediaType,
    show: {
      availableMarkets: data.metaData.availableMarkets,
      copyRights: data.metaData.copyRights.map(credit => ({
        text: credit.text,
        type: credit.type,
      })),
    },
  } as SpotifyShowModel;
}