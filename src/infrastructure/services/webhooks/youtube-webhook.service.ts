import { Injectable } from "@nestjs/common";
import axios from "axios";
import logger from "../../../core/utils/winston.util";
import _const from "../../../core/utils/const";

@Injectable()
export class YoutubeWebhookService {
  private readonly PUBSUBHUBBUB_URL = 'https://pubsubhubbub.appspot.com/subscribe';

  public async subscribeAsync(channelId: string, callbackUrl: string): Promise<void> {
    const verifyToken = process.env.YOUTUBE_WEBHOOK_VERIFY_TOKEN || 'default_verify_token';
    const topic = `https://www.youtube.com/xml/feeds/videos.xml?channel_id=${channelId}`;

    try {
      const response = await axios.post(
        this.PUBSUBHUBBUB_URL,
        new URLSearchParams({
          'hub.mode': 'subscribe',
          'hub.topic': topic,
          'hub.callback': callbackUrl,
          'hub.verify': 'sync',
          'hub.verify_token': verifyToken,
          'hub.secret': process.env.YOUTUBE_WEBHOOK_SECRET || '',
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      logger.info(`[YoutubeWebhook] Subscription request sent for channel ${channelId}`);
    } catch (error: any) {
  logger.error(
    `[YoutubeWebhook] Subscribe failed.
     Channel: ${channelId}
     Status: ${error.response?.status}
     Data: ${JSON.stringify(error.response?.data)}
     Headers: ${JSON.stringify(error.response?.headers)}`
  );

  throw error;
}
  }

  public async unsubscribeAsync(channelId: string, callbackUrl: string): Promise<void> {
    const verifyToken = process.env.YOUTUBE_WEBHOOK_VERIFY_TOKEN || 'default_verify_token';
    const topic = `https://www.youtube.com/xml/feeds/videos.xml?channel_id=${channelId}`;

    try {
      const response = await axios.post(
        this.PUBSUBHUBBUB_URL,
        new URLSearchParams({
          'hub.mode': 'unsubscribe',
          'hub.topic': topic,
          'hub.callback': callbackUrl,
          'hub.verify': 'sync',
          'hub.verify_token': verifyToken,
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      logger.info(`[YoutubeWebhook] Unsubscription request sent for channel ${channelId}`);
    } catch (error) {
      logger.error(`[YoutubeWebhook] Error unsubscribing from channel ${channelId}:`, error);
      throw error;
    }
  }
}

