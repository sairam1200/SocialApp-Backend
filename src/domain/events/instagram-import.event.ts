import { LinkedAccount } from "../entities/linkedAccount.entity";

export class InstagramImportEvent {
  constructor(
    public readonly data: {
      account: LinkedAccount;
      accessToken: string;
    }
  ) { }
}

