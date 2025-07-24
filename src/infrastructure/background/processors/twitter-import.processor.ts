import axios from "axios";
import { Job, Queue } from "bullmq";
import { Inject } from "@nestjs/common";
import _const from "../../../core/utils/const";
import logger from "../../../core/utils/winston.util";
import { InjectQueue, Processor, WorkerHost } from "@nestjs/bullmq";
import { UserContent } from "../../../domain/entities/userContent.entity";
import { NotificationStatus, NotificationType } from "../../../domain/enums";
import { LinkedAccount } from "../../../domain/entities/linkedAccount.entity";
import { NotificationModel } from "../../../domain/contracts/notification.model";
import { mapToNotificationModel } from "../../../domain/mappers/notification.mapper";
import { INotificationService } from "../../../domain/services/inotification.service";
import { ImportGateway } from "../../../infrastructure/websocket/gateways/import.gateway";
import { IUserContentRepository } from "../../../domain/repositories/iuserContent.repository";
import { ILinkedAccountRepository } from "../../../domain/repositories/ilinkedAccount.repository";
import e from "express";
import { url } from "inspector/promises";
import { stringUtil } from "core/utils/string.util";

interface CursorMap {
    [key: string]: string | null;
}
export const InjectTwitterImportQueue = (): ParameterDecorator =>
  InjectQueue(_const.BULL_QUEUES.TWITTER_IMPORT);

@Processor(_const.BULL_QUEUES.TWITTER_IMPORT)
export class TwitterImportProcessor extends WorkerHost {
    constructor(
        @Inject(_const.IUSERCONTENT_REPOSITORY)
        private readonly userContentRepository: IUserContentRepository,
        @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
        private readonly linkedAccountRepository: ILinkedAccountRepository,
        @Inject(_const.INOTIFICATION_SERVICE)
        private readonly notificationService: INotificationService,
        private readonly gateway: ImportGateway,
        @InjectQueue(_const.BULL_QUEUES.TWITTER_IMPORT)
        private readonly importQueue: Queue
    ) {
        super();
        logger.info(`[TwitterImport] Processor initialized`);
    }
    async  process(job: Job<{account: LinkedAccount, accessToken: string}>): Promise<void> {
        const { account, accessToken } = job.data;
        const lastCursors: CursorMap = {};
        console.log("this is the account: ", account);
        const fields: Record<string, { endpoint: string; type: string }> = {
            tweets: { endpoint: `${account.externalId}/tweets`, type: 'Tweets' },
            liked_tweets: { endpoint: `${account.externalId}/liked_tweets`, type: 'Liked Tweets' },
        };
        const progressReports: {
            [type: string]: {
                totalItem: number;
                itemProcessed: number;
                status: NotificationStatus;
                progressPercent: number;
            };
        } = {};

        let notification: NotificationModel;
        let encounteredError = false;
    
          
        for(const [key, {endpoint, type}] of Object.entries(fields)) {
            let cursor: string | null = null;
            logger.info(`[twitterImport] Starting import of ${type} for user ${account.userId}`);
            try{
                while(true){
                    logger.debug(`[twitterImport] Fetching ${type} with cursor: ${cursor || "none"}`);
                    
                    const url = `https://api.twitter.com/2/users/${endpoint}`;
                    const headers ={  Authorization: `Bearer ${accessToken}`}
                    const params = {
                        max_results: 100,
                        pagination_token: cursor || undefined,
                    }
                    const  response = await this.fetchDataWithRateLimit(url, headers, params);
                    
                    const items = response.data.data;
                    cursor= response.meta?.next_token || null;
                    logger.debug(`[RedditImport] Retrieved ${items.length} ${type} items, next cursor: ${cursor}`);
                    progressReports[type] = {
                        totalItem: 0,
                        itemProcessed: 0,
                        status: NotificationStatus.InProgress,
                        progressPercent: 0,
                    };
                    if (progressReports[type].totalItem === 0) {
                        progressReports[type].totalItem = response.data.meta.result_count || items.length;
                    }
                    for(const item of items) {
                       let content = new UserContent({
                        userId: account.userId,
                        platform: _const.PLATFORMS.TWITTER,
                        externalId: item.id
                       });
                       content.type = key;
                       content.title = stringUtil.trimWithEllipsis(item.title || item.body || item.link_title || "Twitter Content");
                    }
          
                    console.log(items)
                    // Update cursor for next page
                    break
                }

            }catch (error) {
                encounteredError = true;
                console.log(error)
                logger.error(`[TwitterImport] Error fetching ${type} for user ${account.externalId}: ${error.message}`);
                break
            }
        }
    }

    async fetchDataWithRateLimit(url:string,headers:any,params:any){
        try {
            const response = await axios.get(url, {
                headers,
                params
            });
            console.log("this is the response: ", response)
           
            
           return response;
        } catch (error) {
            if(error.response && error.response.status === 429) {
                const resetTime = parseInt(error.response.headers["x-rate-limit-reset"], 10);
                const waitTime = Math.max(resetTime * 1000 - Date.now(), 5000); // at least 5s

                logger.error(`the error is : ${error}`)
                logger.warn(`[TwitterImport] Rate limit exceeded for ${url}. Waiting for ${waitTime} ms before retrying.`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
                return this.fetchDataWithRateLimit(url, headers, params);
                /*
                await this.importQueue.add(_const.BULL_QUEUES.TWITTER_IMPORT, { account, accessToken }, {
                    delay: waitTime,
                    attempts: 3,
                });
                return;
                */
            }

            if (error.response?.status === 403) {
                // Forbidden → Skip this endpoint
                logger.warn(`[TwitterImport] Skipping ${url}: Forbidden (no permission).`);
                
              }
    
              // Other errors
              logger.error(`[TwitterImport] Error fetching ${url} for user ${url}: ${error.message}`);
          
        }
    }
    
}