import { Repository, Between } from "typeorm";
import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { YoutubeAnalytic } from "../../domain/entities";
import { IYoutubeAnalyticRepository } from "../../domain/repositories/iyoutubeAnalytic.repository";

@Injectable()
export class YoutubeAnalyticRepository implements IYoutubeAnalyticRepository {
  constructor(
    @InjectRepository(YoutubeAnalytic)
    private readonly repo: Repository<YoutubeAnalytic>,
  ) {}

  async createAsync(analytic: YoutubeAnalytic): Promise<YoutubeAnalytic> {
    return this.repo.save(analytic);
  }

  async createManyAsync(analytics: YoutubeAnalytic[]): Promise<YoutubeAnalytic[]> {
    return this.repo.save(analytics);
  }

  async getByVideoIdAsync(videoId: string): Promise<YoutubeAnalytic[]> {
    return this.repo.find({ where: { videoId }, order: { snapshotDate: 'DESC' } });
  }

  async getLatestByVideoIdAsync(videoId: string): Promise<YoutubeAnalytic | null> {
    return this.repo.findOne({ where: { videoId }, order: { snapshotDate: 'DESC' } });
  }

  async getByVideoIdAndDateRangeAsync(videoId: string, startDate: Date, endDate: Date): Promise<YoutubeAnalytic[]> {
    return this.repo.find({
      where: { videoId, snapshotDate: Between(startDate, endDate) },
      order: { snapshotDate: 'ASC' },
    });
  }
}
