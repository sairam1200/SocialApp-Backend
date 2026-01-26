import { LinkedAccount } from '../entities/linkedAccount.entity';

export interface IQueueService {
  enqueueYoutubeImport(account: LinkedAccount, accessToken: string): Promise<string>;
  enqueueSpotifyImport(account: LinkedAccount, accessToken: string): Promise<string>;
  enqueuePinterestImport(account: LinkedAccount, accessToken: string): Promise<string>;
  enqueueRedditImport(account: LinkedAccount, accessToken: string): Promise<string>;
  enqueueTwitterImport(account: LinkedAccount, accessToken: string): Promise<string>;
  enqueueTiktokImport(account: LinkedAccount, accessToken: string): Promise<string>;
  enqueueInstagramImport(account: LinkedAccount, accessToken: string): Promise<string>;
  enqueueFacebookImport(account: LinkedAccount, accessToken: string): Promise<string>;
  enqueueLinkedInImport(account: LinkedAccount, accessToken: string): Promise<string>;
  enqueueSnapchatImport(account: LinkedAccount, accessToken: string): Promise<string>;
  cancelYoutubeImport(userId: string): Promise<void>;
  cancelSpotifyImport(userId: string): Promise<void>;
  cancelPinterestImport(userId: string): Promise<void>;
  cancelRedditImport(userId: string): Promise<void>;
  cancelTwitterImport(userId: string): Promise<void>;
  cancelTiktokImport(userId: string): Promise<void>;
  cancelInstagramImport(userId: string): Promise<void>;
  cancelFacebookImport(userId: string): Promise<void>;
  cancelLinkedInImport(userId: string): Promise<void>;
  cancelSnapchatImport(userId: string): Promise<void>;
}

