import { Repository } from "typeorm";
import { Injectable } from "@nestjs/common";
import { Globals } from "../../core/globals";
import { InjectRepository } from "@nestjs/typeorm";
import { LinkedAccount } from "../../domain/entities/linkedAccount.entity";
import { HttpContext } from "../../core/middlewares/httpContext.middleware";
import { ILinkedAccountRepository } from "../../domain/repositories/ilinkedAccount.repository";
import { LinkedAccountAlreadyExistsException } from "../../core/exceptions/linkedAccount.exception";
import { QueryOptions } from "domain/types/queryOptions.type";

@Injectable()
export class LinkedAccountRepository implements ILinkedAccountRepository {

  constructor(
    @InjectRepository(LinkedAccount)
    private readonly linkedAccountContext: Repository<LinkedAccount>
  ) { }

  public async createAsync(linkedAccount: LinkedAccount): Promise<LinkedAccount> {

    const existingAccount = await this.getByPlatformAndEmailAsync(linkedAccount.platform, linkedAccount.email);
    if (existingAccount) {
      throw new LinkedAccountAlreadyExistsException(linkedAccount.platform, linkedAccount.email);
    }

    if (HttpContext.user) {
      const userId = HttpContext.user[Globals.ClaimTypes.UserId];
      linkedAccount.setCurrentUser(userId);
    }

    return await this.linkedAccountContext.save(linkedAccount);
  }

  public async updateAsync(linkedAccount: LinkedAccount): Promise<void> {
    if (HttpContext.user) {
      const userId = HttpContext.user[Globals.ClaimTypes.UserId];
      linkedAccount.setCurrentUser(userId);
    }
    await this.linkedAccountContext.update(linkedAccount.id, linkedAccount);
  }

  public async getByUserIdAsync(userId: string): Promise<LinkedAccount[]> {
    return await this.linkedAccountContext.find({ where: { userId } });
  }

  public async getByIdAsync(id: string): Promise<LinkedAccount | null> {
    return await this.linkedAccountContext.findOne({ where: { id } });
  }

  public async getByPlatformAndUserIdAsync(platform: string, userId: string): Promise<LinkedAccount | null> {
    return await this.linkedAccountContext.findOne({ where: { platform, userId } });
  }

  public async getByPlatformAndEmailAsync(platform: string, email: string): Promise<LinkedAccount | null> {
    const normalizedEmail = email?.toUpperCase();
    return await this.linkedAccountContext.findOne({ where: { platform, email: normalizedEmail } });
  }

  public async getByPlatformAndUserNameAsync(platform: string, username: string): Promise<LinkedAccount | null> {
    return await this.linkedAccountContext.findOne({ where: { platform, userName: username } });
  }

  public async getByPlatformAndExternalIdAsync(platform: string, externalId: string): Promise<LinkedAccount | null> {
    return await this.linkedAccountContext.findOne({ where: { platform, externalId } });
  }

  public async getByEmailAsync(email: string): Promise<LinkedAccount | null> {
    const normalizedEmail = email?.toUpperCase();
    return await this.linkedAccountContext.findOne({ where: { email: normalizedEmail } });
  }

  public async deleteAsync(linkedAccount: LinkedAccount): Promise<LinkedAccount> {
    return await this.linkedAccountContext.remove(linkedAccount);
  }

  public async getEntriesAsync(params: QueryOptions): Promise<[LinkedAccount[], number]> {

    let { page, pageSize, orderBy, order, searchQuery, filter } = params;
    const queryBuilder = this.linkedAccountContext.createQueryBuilder("account");

    if (!orderBy) {
      orderBy = "userName";
    }

    const whereConditions: string[] = [];
    const parameters: any = {};

    if (searchQuery) {
      whereConditions.push("(account.userName ILIKE :searchQuery");
      parameters.searchQuery = `%${searchQuery}%`;
    }

    if (filter?.platform) {
      whereConditions.push("account.platform = :platform");
      parameters.platform = filter.platform;
    }

    if (filter?.userId) {
      whereConditions.push("account.userId = :userId");
      parameters.userId = filter.userId;
    }

    if (whereConditions.length > 0) {
      queryBuilder.where(whereConditions.join(" AND "), parameters);
    }

    if (searchQuery) {
      queryBuilder.orderBy(
        `CASE WHEN account.userName ILIKE :exactSearch THEN 0 
               WHEN account.userName ILIKE :searchQuery THEN 1 
               ELSE 2 END`,
        "ASC"
      )
        .addOrderBy(`account.${orderBy}`, order)
        .setParameter("exactSearch", searchQuery.toLowerCase());
    } else {
      queryBuilder.orderBy(`account.${orderBy}`, order);
    }

    queryBuilder.skip((page - 1) * pageSize)
      .take(pageSize);

    return await queryBuilder.getManyAndCount();
  }
}