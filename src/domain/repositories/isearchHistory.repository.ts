import { SearchHistory } from "../entities";

export interface ISearchHistoryRepository {
  createAsync(searchHistory: SearchHistory): Promise<SearchHistory>;
  getByUserIdAsync(userId: string): Promise<SearchHistory[]>;
  getByIdAsync(id: string): Promise<SearchHistory | null>;

  findSimilarQueriesAsync(query: string): Promise<SearchHistory[]>;
  updateAsync(id: string, updatedFields: Partial<SearchHistory>): Promise<void>;
}