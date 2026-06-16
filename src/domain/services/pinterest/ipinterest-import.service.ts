export interface IPinterestImportService {

  importPinsAsync(
    userId: string,
    accessToken: string,
    pinterestUserId: string,
  ): Promise<number>;

  refreshProfileAsync(
    userId: string,
    accessToken: string,
    pinterestUserId: string,
  ): Promise<void>;
}