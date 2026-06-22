import { Repository } from "typeorm";
import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { YoutubeVideo } from "../../domain/entities";
import { IYoutubeVideoRepository } from "../../domain/repositories/iyoutubeVideo.repository";

@Injectable()
export class YoutubeVideoRepository implements IYoutubeVideoRepository {
  constructor(
    @InjectRepository(YoutubeVideo)
    private readonly repo: Repository<YoutubeVideo>,
  ) {}

  async createAsync(video: YoutubeVideo): Promise<YoutubeVideo> {
    return this.repo.save(video);
  }

  async updateAsync(video: YoutubeVideo): Promise<void> {
    await this.repo.save(video);
  }

  async getByIdAsync(id: string): Promise<YoutubeVideo | null> {
    return this.repo.findOne({ where: { id } });
  }

  async getByAccountIdAsync(accountId: string): Promise<YoutubeVideo[]> {
    return this.repo.find({ where: { accountId } });
  }

  async getByYoutubeVideoIdAsync(youtubeVideoId: string): Promise<YoutubeVideo | null> {
    return this.repo.findOne({ where: { youtubeVideoId } });
  }

  async getByStatusAsync(status: string): Promise<YoutubeVideo[]> {
    return this.repo.find({ where: { status } });
  }
}
