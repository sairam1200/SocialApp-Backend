import { LinkedAccount } from "../entities/linkedAccount.entity";

export class LinkedInImportEvent {
  constructor(
    public readonly data: {
      account: LinkedAccount;
      accessToken: string;
    }
  ) { }
}

