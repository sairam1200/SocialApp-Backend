export class LinkedAccountRemovedEvent {
  constructor(
    public readonly data: {
      userId: string;
      platform: string;
      linkedAccountId: string;
    },
  ) {}
}
