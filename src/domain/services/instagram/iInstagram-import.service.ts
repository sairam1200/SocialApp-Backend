export interface IInstagramImportService {
  importMediaAsync(
    userId: string,
    accessToken: string,
    instagramBusinessId: string,
  ): Promise<number>;

  refreshProfileAsync(
    userId: string,
    accessToken: string,
    instagramBusinessId: string,
  ): Promise<void>;
}