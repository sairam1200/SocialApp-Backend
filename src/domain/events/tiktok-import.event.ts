import { LinkedAccount } from "../entities/linkedAccount.entity";

export class TiktokImportEvent {
  constructor(
    public readonly data: {
      account: LinkedAccount;
      accessToken: string;
    }
  ) { }
}

