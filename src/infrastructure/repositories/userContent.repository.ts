import { Repository } from "typeorm";
import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { UserContent } from "../../domain/entities/userContent.entity";
import { IUserContentRepository } from "../../domain/repositories/iuserContent.repository";

@Injectable()
export class UserContentRepository implements IUserContentRepository {

  constructor(
    @InjectRepository(UserContent)
    private readonly userContentContext: Repository<UserContent>,
  ) { }

  public async createAsync(content: UserContent): Promise<UserContent> {

    return await this.userContentContext.save(content);
  }

  public async updateAsync(content: UserContent): Promise<void> {
    await this.userContentContext.update(content.id, content);
  }

  public async getByIdAsync(id: string): Promise<UserContent | null> {
    return await this.userContentContext.findOne({ where: { id } });
  }

  public async deleteAsync(content: UserContent): Promise<void> {
    await this.userContentContext.remove(content);
  }

  public async getByUserIdAsync(userId: string, platform: string, cursor: string): Promise<[UserContent[], string]> {
    const take = 10;
    const where: any = { userId, platform };
    if (cursor) {
      where.id = { $gt: cursor };
    }
    const [result, count] = await this.userContentContext.findAndCount({
      where,
      order: { id: "ASC" },
      take,
    });
    const nextCursor = result.length > 0 ? result[result.length - 1].id : "";
    return [result, nextCursor];
  }

  async getEntries(
    page: number,
    pageSize: number,
    orderBy: string,
    order: "ASC" | "DESC",
    searchTerm?: string
  ): Promise<[UserContent[], number]> {
    const qb = this.userContentContext.createQueryBuilder("content");
    if (searchTerm) {
      qb.where("content.title LIKE :searchTerm OR content.body LIKE :searchTerm", {
        searchTerm: `%${searchTerm}%`,
      });
    }
    qb.orderBy(`content.${orderBy}`, order)
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [result, total] = await qb.getManyAndCount();
    return [result, total];
  }

}