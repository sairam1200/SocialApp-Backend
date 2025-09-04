import { Job } from 'bullmq';
import {  YoutubeSearchItemModel } from '../../../domain/contracts/youtube.model';
import { mapYouTubeOnlineResponseToContentStream } from 'domain/mappers/youtube.mapper';
import { Inject } from '@nestjs/common';
import _const from '../../../core/utils/const';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { IContentStreamRepository } from '../../../domain/repositories';


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
    async process(job: Job<{ youTubeSearchOnlineResponse: YoutubeSearchItemModel[]}>): Promise<any> {
        const {youTubeSearchOnlineResponse} = job.data;
        console.info(`Processing job ${job.id} of type ${_const.BULL_QUEUES.CONTENT_STREAM_IMPORT}`);
        try{
        youTubeSearchOnlineResponse.forEach(async (content)=>{
            const YouTubeOnlineResponseMapped = mapYouTubeOnlineResponseToContentStream(content)
            const existingContent = await this.contentStreamRepository.getContentByIdAndTypeAsync(YouTubeOnlineResponseMapped.externalId, YouTubeOnlineResponseMapped.type, YouTubeOnlineResponseMapped.subType, YouTubeOnlineResponseMapped.title, YouTubeOnlineResponseMapped.platform);
            if(existingContent.length < 1 ){
                console.info(`Content with externalId ${YouTubeOnlineResponseMapped.externalId} and type ${YouTubeOnlineResponseMapped.type} does not exist. saving the content`);
                await this.contentStreamRepository.createAsync(YouTubeOnlineResponseMapped)
              }else{
                console.info(`Content with externalId ${YouTubeOnlineResponseMapped.externalId} and type ${YouTubeOnlineResponseMapped.type} already exists. not saving it`);
              }
           
              
        })
    }    catch(error){
        console.error(`Error processing job ${job.id} of type ${_const.BULL_QUEUES.CONTENT_STREAM_IMPORT}:`, error);
        throw error;
    }
    }
       
}