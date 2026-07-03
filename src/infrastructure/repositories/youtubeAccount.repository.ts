import { Not, Repository } from "typeorm";
import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { YoutubeAccount } from "../../domain/entities";
import { IYoutubeAccountRepository } from "../../domain/repositories/iyoutubeAccount.repository";

@Injectable()
export class YoutubeAccountRepository implements IYoutubeAccountRepository {
  constructor(
    @InjectRepository(YoutubeAccount)
    private readonly repo: Repository<YoutubeAccount>,
  ) {}

  async createAsync(account: YoutubeAccount): Promise<YoutubeAccount> {
    return this.repo.save(account);
  }

  async updateAsync(account: YoutubeAccount): Promise<void> {
    await this.repo.save(account);
  }

  async deleteAsync(account: YoutubeAccount): Promise<void> {
    await this.repo.remove(account);
  }

  async getByIdAsync(id: string): Promise<YoutubeAccount | null> {
    return this.repo.findOne({ where: { id } });
  }

  async getByChannelIdAsync(channelId: string): Promise<YoutubeAccount | null> {
    return this.repo.findOne({ where: { channelId } });
  }

  async getByUserIdAsync(userId: string): Promise<YoutubeAccount | null> {
    return this.repo.findOne({ where: { userId } });
  }

  async getConnectedByUserIdAsync(userId: string): Promise<YoutubeAccount | null> {
    return this.repo.findOne({ where: { userId, connected: true }, order: { lastModifiedOn: 'DESC', createdOn: 'DESC' } });
  }

  async disconnectOtherAccountsAsync(userId: string, channelId: string): Promise<void> {
    await this.repo.update(
      { userId, connected: true, channelId: Not(channelId) },
      { connected: false, disconnectedAt: new Date() },
    );
  }

  async deleteByUserIdAsync(userId: string): Promise<void> {
    await this.repo.delete({ userId });
  }
}
