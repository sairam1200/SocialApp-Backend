import { Repository } from "typeorm";
import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { SearchHistory } from "../../domain/entities";
import { ISearchHistoryRepository } from "../../domain/repositories";
import { HttpContext } from "../../core/middlewares/httpContext.middleware";

@Injectable()
export class SearchHistoryRepository implements ISearchHistoryRepository {

  constructor(
    @InjectRepository(SearchHistory)
    private readonly searchHistoryContext: Repository<SearchHistory>
  ) { }

  public async createAsync(searchHistory: SearchHistory): Promise<SearchHistory> {
    const userId = HttpContext.getCurrentUserId || '';
    searchHistory.userId = userId;
    return await this.searchHistoryContext.save(searchHistory);
  }

  public async findSimilarQueriesAsync(query: string): Promise<SearchHistory[]> {
    return await this.searchHistoryContext.find({
      where: { normalizedQuery: query },
      take: 100,
      order: { createdOn: 'DESC' },
    });
  }

  public async getByIdAsync(id: string): Promise<SearchHistory | null> {
    return await this.searchHistoryContext.findOne({ where: { id } });
  }

  public async getByUserIdAsync(userId: string): Promise<SearchHistory[]> {
    return await this.searchHistoryContext.find({
      where: { userId },
      order: { createdOn: 'DESC' },
    });
  }

  public async updateAsync(id: string, updatedFields: Partial<SearchHistory>): Promise<void> {
    await this.searchHistoryContext.update(id, updatedFields);
  }

  public async deleteAsync(searchHistory: SearchHistory): Promise<void> {
    await this.searchHistoryContext.remove(searchHistory);
  }
}