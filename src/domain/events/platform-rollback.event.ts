import { LinkedAccount } from '../entities/linkedAccount.entity';

export class PlatformRollbackEvent {
  constructor(
    public readonly data: {
      account: LinkedAccount;
    },
  ) {}
}
