import { YoutubeAccount } from "../entities";

export interface IYoutubeAccountRepository {
  createAsync(account: YoutubeAccount): Promise<YoutubeAccount>;
  updateAsync(account: YoutubeAccount): Promise<void>;
  deleteAsync(account: YoutubeAccount): Promise<void>;
  getByIdAsync(id: string): Promise<YoutubeAccount | null>;
  getByChannelIdAsync(channelId: string): Promise<YoutubeAccount | null>;
  getByUserIdAsync(userId: string): Promise<YoutubeAccount | null>;
  getConnectedByUserIdAsync(userId: string): Promise<YoutubeAccount | null>;
  disconnectOtherAccountsAsync(userId: string, channelId: string): Promise<void>;
  deleteByUserIdAsync(userId: string): Promise<void>;
}
