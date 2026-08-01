export enum CreatorIdentitySource {
  LINKED_ACCOUNT = 'linkedAccount',
  IMPORTED_METADATA = 'importedMetadata',
  USER_PROFILE = 'userProfile',
  UNKNOWN = 'unknown',
}

export interface ImportedCreatorMetadata {
  channelName?: string;
  creatorName?: string;
  displayName?: string;
  author?: string;
  from?: string;
  channelHandle?: string;
  channelUsername?: string;
  username?: string;
  handle?: string;
  channelProfileImage?: string;
  avatar?: string;
  profileImage?: string;
  channelUrl?: string;
  profileUrl?: string;
  externalUrl?: string;
}

export interface ResolvedCreatorIdentity {
  displayName: string;
  handle: string;
  rawUserName: string | null;
  profileImage: string | null;
  verified: boolean;
  profileUrl: string | null;
  platform: string | null;
  source: CreatorIdentitySource;
  userId?: string | null;
}
