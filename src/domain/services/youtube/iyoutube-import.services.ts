export interface IYoutubeImportService {
  importUploadsAsync(
    userId: string,
    accessToken: string,
  ): Promise<number>;

  importSubscriptionsAsync(
    userId: string,
    accessToken: string,
  ): Promise<number>;

  refreshChannelProfileAsync(
    userId: string,
    accessToken: string,
  ): Promise<void>;
}