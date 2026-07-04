export class ContentImportedEvent {
  constructor(
    public readonly data: {
      userId: string;
      platform: string;
      payload: any;
    }
  ) { }
}
