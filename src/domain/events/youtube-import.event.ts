import { LinkedAccount } from "../entities/linkedAccount.entity";

export class YoutubeImportEvent {
  constructor(
    public readonly data: {
      account: LinkedAccount;
      accessToken: string;
    }
  ) { }
}

