export enum UserType {
    Admin = 'Admin',
    Guest = 'Guest',
    User = 'User',
}

export enum RoleType {
    System = 'System',
    Regular = 'Regular'
}

export enum NotificationType {
    Import = 'Import',
}

export enum NotificationStatus {
    InProgress = 'In-Progress',
    Completed = 'Completed',
    Cancelled = 'Cancelled',
    Failed = 'Failed'
}

export enum PlaylistMemberRole {
    Owner = 'Owner',
    Editor = 'Editor',
    Viewer = 'Viewer'
}

export enum StreamEntityType {
    Profile = "Profile",
    Content = "Content",
    Community = "Community",
}

export enum YouTubeUserContentFilters {
    Channals = "channel",
    Videos = "uploaded_video",
    Shorts = "short",
    Playlists = "playlist",
    Subscriptions = "subscription",
    Activities = "activity",
    PlaylistVideos = "playlist_video"
}

export enum YouTubeOnlineFilters {
    Channals = "youtube#channel",
    Videos = "youtube#video",
    Playlists = "youtube#playlist"
}

export enum FacebookUserContentFilters {
    Feed = "feed",
    Posts = "posts",
    Likes = "likes",
    Groups = "groups",
    Events = "events",
    Videos = "videos",
}

export enum FacebookOnlineFilters {
    Posts = "posts",
    Pages = "pages",
    Groups = "groups",
    Events = "events",
    People = "people",
}