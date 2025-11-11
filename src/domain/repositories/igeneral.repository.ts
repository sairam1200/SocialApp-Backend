import { ContentStream } from "domain/entities";

export interface IGeneralRepository {
    checkExistingItemsAsync(ids: string[],platform: string): Promise<string[]>;
    createAsync(content: ContentStream[]): Promise<any>;
    updateContentRefreshTimestampAsync(externalIds: string[], platform: string): Promise<void>;
}