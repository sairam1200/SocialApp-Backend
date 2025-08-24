import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import { Job } from 'bullmq';
import _const from 'core/utils/const';
import { SearchResponseModel } from 'domain/contracts/youtube.model';
import { ContentStream } from 'domain/entities';
import { StreamEntityType, YouTubeUserContentFilters } from 'domain/enums';
import { IContentStreamRepository } from 'domain/repositories';

export const InjectContentStreamImportQueue = (): ParameterDecorator =>
    InjectQueue(_const.BULL_QUEUES.CONTENT_STREAM_IMPORT);
@Processor(_const.BULL_QUEUES.CONTENT_STREAM_IMPORT)
export class ContentStreamImportProcessor extends WorkerHost  {
    constructor(
        @Inject(_const.ICONTENTSTREAM_REPOSITORY)
        private readonly contentStreamRepository: IContentStreamRepository,
    ){
        super();
    }
    async process(job: Job<{ searchResponse: SearchResponseModel}>): Promise<any> {
        const {searchResponse} = job.data;
       
   
   
        
     

        searchResponse.results.subscriptions.forEach(async (subscription)=>{
            const subscriptioncontent = new ContentStream();
            const {type, externalId, title, ...rest} = subscription
            subscriptioncontent.type = StreamEntityType.Profile;
            subscriptioncontent.subType = YouTubeUserContentFilters.Subscriptions;
            subscriptioncontent.platform = _const.PLATFORMS.YOUTUBE
            subscriptioncontent.externalId = externalId;
            subscriptioncontent.title =title;
            subscriptioncontent.metaData = rest;
            await this.contentStreamRepository.createAsync(subscriptioncontent)
        });

        searchResponse.results.playlist.forEach(async (playlist)=>{
            const playlistContent = new ContentStream();
            const {type,platfrom, externalId, title, ...rest} = playlist
            playlistContent.type = StreamEntityType.Content;
            playlistContent.subType = type;
            playlistContent.platform = platfrom || _const.PLATFORMS.YOUTUBE;
            playlistContent.externalId = externalId;
            playlistContent.title = title;
            playlistContent.metaData.playlistId = rest
            await  this.contentStreamRepository.createAsync(playlistContent)
        });
        searchResponse.results.playlistVideo.forEach(async (playlistVideo)=>{

            const playlistVideoContent = new ContentStream();
            const {type, externalId, title, ...rest} = playlistVideo
            playlistVideoContent.type = StreamEntityType.Content;
            playlistVideoContent.subType = type;
            playlistVideoContent.platform = _const.PLATFORMS.YOUTUBE;
            playlistVideoContent.externalId = externalId;
            playlistVideoContent.title = title;
            playlistVideoContent.metaData= rest
            await this.contentStreamRepository.createAsync(playlistVideoContent)
        });
        searchResponse.results.videos.forEach(async (video)=>{
            const videoContent = new ContentStream();
            const {type, platform , externalId, title, ...rest} = video
            videoContent.type = StreamEntityType.Content;
            videoContent.subType = type;
            videoContent.platform = platform || _const.PLATFORMS.YOUTUBE;
            videoContent.externalId = externalId;
            videoContent.title = title;
            videoContent.metaData = rest;
            await this.contentStreamRepository.createAsync(videoContent)

        });
        searchResponse.results.channels.forEach(async (channel)=>{
            const channelContent = new ContentStream();
            const {type, externalId, title, ...rest} = channel
            channelContent.type = StreamEntityType.Profile;
            channelContent.subType = type;
            channelContent.platform = _const.PLATFORMS.YOUTUBE;
            channelContent.externalId = externalId;
            channelContent.title = title;
            channelContent.metaData = rest;

            await this.contentStreamRepository.createAsync(channelContent)

        });
        searchResponse.results.activities.forEach(async (activity)=>{
            const activityContent = new ContentStream();
            const {type, externalId, title, ...rest} = activity
            activityContent.type = StreamEntityType.Content;
            activityContent.subType = YouTubeUserContentFilters.Activities;
            activityContent.platform = _const.PLATFORMS.YOUTUBE;
            activityContent.externalId = externalId;
            activityContent.title = title;
            activityContent.metaData = rest;
            await this.contentStreamRepository.createAsync(activityContent)
        });
        return Promise.resolve(); 
    }
}