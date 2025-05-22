import { UserContent } from "../entities/userContent.entity";

export interface IUserContentRepository {

  createAsync(content: UserContent): Promise<UserContent>;
  updateAsync(content: UserContent): Promise<void>;

  getByIdAsync(id: string): Promise<UserContent>;
  deleteAsync(content: UserContent): Promise<void>;

  getByUserIdAsync(
    userId: string,
    platform: string,
    cursor: string
  ): Promise<[UserContent[], string]>;

  getEntries(
    page: number,
    pageSize: number,
    orderBy: string,
    order: "ASC" | "DESC",
    searchTerm?: string
  ): Promise<[UserContent[], number]>;
}