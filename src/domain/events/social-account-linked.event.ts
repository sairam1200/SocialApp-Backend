export class SocialAccountLinkedEvent {
  constructor(
    public readonly data: {
      userId: string;
    },
  ) {}
}
