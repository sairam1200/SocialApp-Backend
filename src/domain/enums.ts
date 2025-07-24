export enum UserType {
    Admin = 'Admin',
    User = 'User',
    Guest = 'Guest',
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