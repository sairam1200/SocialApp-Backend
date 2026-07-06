export interface IFacebookImportService {
  importPagePostsAsync(
    userId: string,
    accessToken: string,
    pageAccessToken: string,
    pageId: string,
  ): Promise<number>;

  refreshPageProfileAsync(
    userId: string,
    accessToken: string,
    pageId: string,
  ): Promise<void>;
}
