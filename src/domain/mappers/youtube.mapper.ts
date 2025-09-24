import { LinkedAccount } from "../entities/linkedAccount.entity";
import { YoutubeActivitiesModel, YoutubeChannelInfoModel, YoutubePlaylistModel, YoutubePlaylistVideoModel, YoutubeProfileModel, YoutubeSubscriptionsModel, YoutubeVideosModel, YouTubeSearchResponseModel, YoutubeOnlineModel, YoutubeSearchItemModel } from "../contracts/youtube.model";
import { ContentStream, UserContent } from "domain/entities";
import _const from "core/utils/const";
import { StreamEntityType, YouTubeOnlineFilters, YouTubeUserContentFilters } from "domain/enums";

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
    publishedAt: data.metaData.publishedAt,
    thumbnails: data.metaData.thumbnails,
    platfrom: _const.PLATFORMS.YOUTUBE,
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
export function mapToYoutubeUploadedVideosModel(data: UserContent): YoutubeVideosModel{
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
  } as YoutubeVideosModel
    
}
export function mapToYoutubeOnlineModel(data) : YoutubeOnlineModel {
  let id = ""
  if(data.id.kind == YouTubeOnlineFilters.Videos){
    id = data.id.videoId
  }else if(data.id.kind == YouTubeOnlineFilters.Channals){
    id = data.id.channelId
  }else if(data.id.kind == YouTubeOnlineFilters.Playlists){
    id = data.id.playlistId
  }
  return {
    id: id,
    etag: data.etag,
    title: data.snippet.title,
    type: data.id.kind,
    platform: _const.PLATFORMS.YOUTUBE,
    externalId: id,
    channelId: data.snippet.channelId,
    description: data.snippet.description,
    thumbnails: data.snippet.thumbnails,
    channelTitle: data.snippet.channelTitle,
    liveBroadcastContent: data.snippet.liveBroadcastContent,
    publishedAt: data.snippet.publishedAt,
    publishTime: data.snippet.publishTime,
  
  } as YoutubeOnlineModel
}

export function mapYouTubeOnlineResponseToContentStream(content:YoutubeSearchItemModel) : ContentStream {
    const youTubeOnlineContent = new ContentStream();
    const {type, externalId, title, ...rest} = mapToYoutubeOnlineModel(content)
    youTubeOnlineContent.type = StreamEntityType.Profile;
    youTubeOnlineContent.subType = type;
    youTubeOnlineContent.platform = _const.PLATFORMS.YOUTUBE
    youTubeOnlineContent.externalId = externalId;
    youTubeOnlineContent.title = title;
    youTubeOnlineContent.metaData = rest;
    return youTubeOnlineContent


    
}

export function mapContentStreamToYouTubeOnlineModel(content: ContentStream) : YoutubeOnlineModel {
  const {type, externalId, title, ...rest} = content
  return {
    id: content.id,
    type: content.subType,
    platform: content.platform,
    title: content.title,
    externalId: content.externalId,
    ...rest.metaData
  } as YoutubeOnlineModel
}