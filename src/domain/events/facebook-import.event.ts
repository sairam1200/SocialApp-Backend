import { LinkedAccount } from "../entities/linkedAccount.entity";

export class FacebookImportEvent {
  constructor(
    public readonly data: {
      account: LinkedAccount;
      accessToken: string;
    }
  ) { }
}

