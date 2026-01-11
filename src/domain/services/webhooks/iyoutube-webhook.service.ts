export interface IYoutubeWebhookService {
  subscribeAsync(channelId: string, callbackUrl: string): Promise<void>;
  unsubscribeAsync(channelId: string, callbackUrl: string): Promise<void>;
}