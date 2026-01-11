import { LinkedAccount } from "../entities/linkedAccount.entity";

export class RedditImportEvent {
  constructor(
    public readonly data: {
      account: LinkedAccount;
      accessToken: string;
    }
  ) { }
}

