export interface ITwitterImportService {
  importTweetsAsync(
    userId: string,
    accessToken: string,
    twitterUserId: string,
  ): Promise<number>;

  refreshProfileAsync(
    userId: string,
    accessToken: string,
    twitterUserId: string,
  ): Promise<void>;
}