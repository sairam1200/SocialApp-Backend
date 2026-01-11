import { LinkedAccount } from "../entities/linkedAccount.entity";

export class TwitterImportEvent {
  constructor(
    public readonly data: {
      account: LinkedAccount;
      accessToken: string;
    }
  ) { }
}

