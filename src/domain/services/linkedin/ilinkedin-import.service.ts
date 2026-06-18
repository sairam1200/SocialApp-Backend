export interface ILinkedInImportService {
  importOrganizationPostsAsync(
    userId: string,
    accessToken: string,
    organizationId: string,
  ): Promise<number>;

  refreshProfileAsync(
    userId: string,
    accessToken: string,
  ): Promise<void>;
}