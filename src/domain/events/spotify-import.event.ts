import { LinkedAccount } from "../entities/linkedAccount.entity";

export class SpotifyImportEvent {
  constructor(
    public readonly data: {
      account: LinkedAccount;
      accessToken: string;
    }
  ) { }
}

