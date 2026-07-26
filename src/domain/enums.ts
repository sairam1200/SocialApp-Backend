export enum UserType {
  Admin = 'Admin',
  Guest = 'Guest',
  User = 'User',
}

export enum RoleType {
  System = 'System',
  Regular = 'Regular',
}

export enum NotificationType {
  Import = 'Import',
}

export enum NotificationStatus {
  InProgress = 'In-Progress',
  Completed = 'Completed',
  Cancelled = 'Cancelled',
  Failed = 'Failed',
}

export enum Theme {
  System = 'System',
  Light = 'Light',
  Dark = 'Dark',
}

export enum NotificationChannel {
  InApp = 'inApp',
  Email = 'email',
  Push = 'push',
}

export enum PlaylistMemberRole {
  Owner = 'Owner',
  Editor = 'Editor',
  Viewer = 'Viewer',
}

export enum StreamEntityType {
  Profile = 'Profile',
  Content = 'Content',
  Community = 'Community',
}

export enum YouTubeUserContentFilters {
  Channals = 'channel',
  Videos = 'uploaded_video',
  Shorts = 'short',
  Playlists = 'playlist',
  Subscriptions = 'subscription',
  Activities = 'activity',
  PlaylistVideos = 'playlist_video',
}

export enum YouTubeOnlineFilters {
  Channals = 'youtube#channel',
  Videos = 'youtube#video',
  Playlists = 'youtube#playlist',
}

export enum FacebookUserContentFilters {
  Feed = 'feed',
  Posts = 'posts',
  Likes = 'likes',
  Groups = 'groups',
  Events = 'events',
  Videos = 'videos',
}

export enum FacebookOnlineFilters {
  Posts = 'posts',
  Pages = 'pages',
  Groups = 'groups',
  Events = 'events',
  People = 'people',
}

export enum ProfileImagePrivacy {
  Everyone = 'Everyone',
  Interactions = 'Interactions',
}

export enum ProfilePrivacy {
  Public = 'Public',
  Private = 'Private',
}

export enum FollowStatus {
  Requested = 'requested',
  Accepted = 'accepted',
  Blocked = 'blocked',
}

export enum OnboardingStep {
  NotStarted = 'NotStarted',
  ProfileData = 'ProfileData',
  Topics = 'Topics',
  Platforms = 'Platforms',
  Confirmation = 'Confirmation',
  Completed = 'Completed',
}

export enum PostType {
  Video = 'video',
  Short = 'short',
  Reel = 'reel',
  Story = 'story',
  Post = 'post',
  Article = 'article',
  Pin = 'pin',
  Project = 'project',
  Message = 'message',
  Track = 'track',
}

/**
 * Community social layer. Defined in `social.enums.ts` and re-exported here so
 * every consumer keeps a single import path for enums.
 */
export * from './social.enums';
