import { LinkedAccount } from "../entities/linkedAccount.entity";
import { SearchSectionResponseModel, YoutubeActivitiesModel, YoutubeChannelInfoModel, YoutubePlaylistModel, YoutubePlaylistVideoModel, YoutubeProfileModel, YoutubeSubscriptionsModel, YoutubeUploadedVideosModel } from "../contracts/youtube.model";
import { User, UserContent } from "domain/entities";

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

export function  mapToYoutubeSubscriptionsModel(data: UserContent) : YoutubeSubscriptionsModel{
 return {
    id: data.id,
    type: data.type,
    title: data.title,
    externalId: data.externalId,
    description: data.metaData.description,
    publishedAt: data.metaData.publishedAt,
    thumbnails: data.metaData.thumbnails,

 } as YoutubeSubscriptionsModel
}
export function mapToYoutubePlaylistModel(data: UserContent) : YoutubePlaylistModel{
 return {
    id: data.id,
    type: data.type,
    title: data.title,
    externalId: data.externalId,
    playlistId: data.metaData.playlistId,
    description: data.metaData.description,
    itemCount: data.metaData.itemCount,
    publishedAt: data.metaData,
    thumbnails: data.metaData.thumbnails,
 } as YoutubePlaylistModel
} 

export function mapToYoutubePlaylisVideoModel(data: UserContent) : YoutubePlaylistVideoModel{
  return {
    id: data.id,
    platform: data.platform,
    type: data.type,
    title: data.title,
    externalId: data.externalId,
    videoId: data.metaData.videoId,
    publishedAt: data.metaData.publishedAt,
    description: data.metaData.description,
    thumbnails: data.metaData.thumbnails,
    playlistId: data.metaData.playlistId
  } as YoutubePlaylistVideoModel
}

export function mapToYoutubeActivityModel(data: UserContent) : YoutubeActivitiesModel {
  return  {
    id: data.id,
    type: data.type,
    title: data.title,
    externalId: data.externalId,
    publishedAt: data.metaData.publishedAt,
    channelId: data.metaData.channelId,
    description: data.metaData.description,
    thumbnails: data.metaData.thumbnails,
  } as YoutubeActivitiesModel
}
export function mapToYoutubeChannelInfoModel (data: UserContent): YoutubeChannelInfoModel{
  return  {
    id: data.id,
    type: data.type,
    title: data.title,
    externalId: data.externalId,
    description: data.metaData.description,
    publishedAt: data.metaData.publishedAt,
    thumbnails: data.metaData.thumbnails,
    statistics: data.metaData.statistics,
  } as YoutubeChannelInfoModel
}
export function mapToYoutubeUploadedVideosModel(data: UserContent): YoutubeUploadedVideosModel{
  return  {
    id: data.id,
    platform: data.platform,
    type: data.type,
    title: data.title,
    externalId: data.externalId,
    videoId: data.metaData.videoId,
    publishedAt: data.metaData.publishedAt,
    description: data.metaData.description,
    thumbnails: data.metaData.thumbnails,
  } as YoutubeUploadedVideosModel
    
}