import { Repository } from "typeorm";
import { Injectable } from "@nestjs/common";
import { Globals } from "../../core/globals";
import { InjectRepository } from "@nestjs/typeorm";
import { JwtPayload } from "../../core/passport/jwtPayload";
import { LinkedAccount } from "../../domain/entities/linkedAccount.entity";
import { HttpContext } from "../../core/middlewares/httpContext.middleware";
import { ILinkedAccountRepository } from "../../domain/repositories/ilinkedAccount.repository";
import { LinkedAccountAlreadyExistsException } from "../../core/exceptions/linkedAccount.exception";

@Injectable()
export class LinkedAccountRepository implements ILinkedAccountRepository {

  private readonly _currentUser: JwtPayload;

  constructor(
    @InjectRepository(LinkedAccount)
    private readonly linkedAccountContext: Repository<LinkedAccount>
  ) {
    console.log(HttpContext.user)
    this._currentUser = HttpContext.user;
  }

  public async createAsync(linkedAccount: LinkedAccount): Promise<LinkedAccount> {

    const existingAccount = await this.getByPlatformAndEmailAsync(linkedAccount.platform, linkedAccount.email);
    if (existingAccount) {
      throw new LinkedAccountAlreadyExistsException(linkedAccount.platform, linkedAccount.email);
    }

    linkedAccount.setCurrentUser(this._currentUser[Globals.ClaimTypes.UserId]);
    return await this.linkedAccountContext.save(linkedAccount);
  }

  public async updateAsync(linkedAccount: LinkedAccount): Promise<void> {
    linkedAccount.setCurrentUser(this._currentUser[Globals.ClaimTypes.UserId]);
    await this.linkedAccountContext.update(linkedAccount.id, linkedAccount);
  }

  public async getByUserIdAsync(userId: string): Promise<LinkedAccount[]> {
    return await this.linkedAccountContext.find({ where: { userId } });
  }

  public async getByIdAsync(id: string): Promise<LinkedAccount | null> {
    return await this.linkedAccountContext.findOne({ where: { id } });
  }

  public async getByPlatformAndIdAsync(platform: string, id: string): Promise<LinkedAccount | null> {
    return await this.linkedAccountContext.findOne({ where: { platform, id } });
  }

  public async getByPlatformAndEmailAsync(platform: string, email: string): Promise<LinkedAccount | null> {
    const normalizedEmail = email?.toUpperCase();
    return await this.linkedAccountContext.findOne({ where: { platform, email: normalizedEmail } });
  }

  public async getByEmailAsync(email: string): Promise<LinkedAccount | null> {
    const normalizedEmail = email?.toUpperCase();
    return await this.linkedAccountContext.findOne({ where: { email: normalizedEmail } });
  }

  public async deleteAsync(linkedAccount: LinkedAccount): Promise<LinkedAccount> {
    return await this.linkedAccountContext.remove(linkedAccount);
  }

}