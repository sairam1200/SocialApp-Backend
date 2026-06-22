import { YoutubeVideo } from "../entities";

export interface IYoutubeVideoRepository {
  createAsync(video: YoutubeVideo): Promise<YoutubeVideo>;
  updateAsync(video: YoutubeVideo): Promise<void>;
  getByIdAsync(id: string): Promise<YoutubeVideo | null>;
  getByAccountIdAsync(accountId: string): Promise<YoutubeVideo[]>;
  getByYoutubeVideoIdAsync(youtubeVideoId: string): Promise<YoutubeVideo | null>;
  getByStatusAsync(status: string): Promise<YoutubeVideo[]>;
  deleteByAccountIdAsync(accountId: string): Promise<void>;
}
