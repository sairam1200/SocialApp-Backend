import { Job } from "bull";
import axios from "axios";
import { Inject } from "@nestjs/common";
import _const from "../../../core/utils/const";
import { InjectQueue, Processor } from "@nestjs/bull";
import logger from "../../../core/utils/winston.util";
import { stringUtil } from "../../../core/utils/string.util";
import { UserContent } from "../../../domain/entities/userContent.entity";
import { LinkedAccount } from "../../../domain/entities/linkedAccount.entity";
import { IUserContentRepository } from "domain/repositories/iuserContent.repository";
import { ImportGateway } from "../../../infrastructure/websocket/gateways/import.gateway";

interface CursorMap {
  [key: string]: string | null;
}

export const InjectFacebookImportQueue = (): ParameterDecorator =>
  InjectQueue(_const.BULL_QUEUES.FACEBOOK_IMPORT);

@Processor(_const.BULL_QUEUES.FACEBOOK_IMPORT)
export class FacebookImportProcessor {

  constructor(
    @Inject(_const.IUSERCONTENT_REPOSITORY)
    private readonly userContentRepository: IUserContentRepository,
    private readonly gateway: ImportGateway,
  ) { }

  async process(job: Job<{ account: LinkedAccount, accessToken: string }>) {

    const { account, accessToken } = job.data
    const lastCursors: CursorMap = {};

    const fields = {
      posts: '/me/posts',
      likes: '/me/likes',
      events: '/me/events',
      // groups: '/me/groups',
    };

    for (const [key, endpoint] of Object.entries(fields)) {
      let cursor: string | null = null;

      try {
        while (true) {
          const response = await axios.get(`https://graph.facebook.com/v19.0${endpoint}`, {
            params: {
              summary: true,
              access_token: accessToken,
              after: cursor || undefined,
            },
          });

          const data = response.data;
          const items = data.data;
          const paging = data.paging;
          const summary = data.summary;

          console.log(`Fetched ${items.length} items from ${key}`);

          for (const item of items) {

            let content = new UserContent({
              userId: account.userId,
              platform: _const.PLATFORMS.FACEBOOK
            });

            if (key === '/me/posts') {
              content.type = "post";
              content.title = item.name ?? stringUtil.trimWithEllipsis(item.message);
              content.metaData = {
                contentId: item.id,
                from: item.from,
                link: item.link,
                type: item.type,
                story: item.story,
                message: item.message,
                reactions: item.reactions.summary,
                likesCount: item.likes?.summary?.total_count,
                commentCount: item.comments?.length,
                permalinkUrl: item.permalink_url,
                sharesCount: item.shares?.count,
                statusType: item.status_type,
                createdAt: item.created_time,
                updatedAt: item.updated_time,
                isPopular: item.is_popular,
                isHidden: item.is_hidden,
                picture: item.picture,
                via: item.via,
              };
            } else if (key === '/me/likes') {
              content.type = "likes";
              content.title = item.name;
              content.metaData = {
                contentId: item.id,
                category: item.category,
                createdAt: item.created_time,
              }
            } else if (key === '/me/events') {
              content.type = "events";
              content.title = item.name;
              content.metaData = {
                contentId: item.id,
                startDate: item.start_time,
                endDate: item.end_time,
                description: item.description,
                place: item.place,
                owner: item.owner,
                attendingCount: item.attending_count,
                interestedCount: item.interested_count,
                declinedCount: item.declined_count,
                maybeCount: item.maybe_count,
                noreplyCount: item.noreply_count,
                isCanceled: item.is_canceled,
                isPageOwned: item.is_page_owned,
                guestListEnabled: item.guest_list_enabled,
                timezone: item.timezone,
                type: item.type,
                updatedDate: item.updated_time,
              }
            }

            content = await this.userContentRepository.createAsync(content);
            this.gateway.emitNewImportContent(account.userId, _const.PLATFORMS.FACEBOOK, content);
            // add notification

          }

          if (paging?.cursors?.after) {
            cursor = paging.cursors.after;
            lastCursors[key] = cursor;
          } else {
            break; // no more pages
          }
        }
      } catch (err: any) {
        logger.error(`Error occured while importing ${key}:`, err.message);
        if (cursor) {
          lastCursors[key] = cursor;
        }
        continue;
      }
    }
  }

}