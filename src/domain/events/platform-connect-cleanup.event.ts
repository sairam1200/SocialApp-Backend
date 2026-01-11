import { LinkedAccount } from "../entities/linkedAccount.entity";

export class PlatformConnectCleanupEvent {
  constructor(
    public readonly data: {
      account: LinkedAccount;
    }
  ) { }
}

