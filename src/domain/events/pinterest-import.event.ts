import { LinkedAccount } from "../entities/linkedAccount.entity";

export class PinterestImportEvent {
  constructor(
    public readonly data: {
      account: LinkedAccount;
      accessToken: string;
    }
  ) { }
}

