export class FollowUpdatedEvent {
  constructor(
    public readonly targetUserId: string,
    public readonly viewerUserId: string,
    public readonly isFollowing: boolean,
    public readonly targetFollowersCount: number,
    public readonly viewerFollowingCount: number,
  ) {}
}
