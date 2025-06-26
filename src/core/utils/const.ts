export default {
  // Repository Interfaces
  IUSER_REPOSITORY: "IUserRepository",
  IROLE_REPOSITORY: "IRoleRepository",
  IUSERROLE_REPOSITORY: "IUserRoleRepository",
  IPLAYLIST_REPOSITORY: "IPlaylistRepository",
  IRATELIMIT_REPOSITORY: "IRateLimitRepository",
  IROLECLAIM_REPOSITORY: "IRoleClaimRepository",
  IUSERLOGIN_REPOSITORY: "IUserLoginRepository",
  IUSERCONTENT_REPOSITORY: "IUserContentRepository",
  INOTIFICATION_REPOSITORY: "INotificationRepository",
  ILINKEDACCOUNT_REPOSITORY: "ILinkedAccountRepository",
  IDATAPROTECTIONKEY_REPOSITORY: "IDataProtectionKeyRepository",

  // Service Interfaces
  IEMAIL_SERVICE: "IEmailService",
  ITOKEN_SERVICE: "ITokenService",
  INOTIFICATION_SERVICE: "INotificationService",

  BULL_QUEUES: {
    EMAIL: "email",
    FACEBOOK_IMPORT: "facebook-import",
    SPOTIFY_IMPORT: "spotify-import",
    YOUTUBE_IMPORT: "youtube-import",
    INSTAGRAM_IMPORT: "instagram-import",
    PINTEREST_IMPORT: "pinterest-import",
    TWITTER_IMPORT: "twitter-import",
    REDDIT_IMPORT: "reddit-import",
  },

  EMAILTEMPLATES: {
    ACCOUNT: {
      EMAIL_CONFIRMATION: 'account/email-confirmation',
      PASSWORD_RESET: 'account/password-reset',
    },
    NOTIFICATION: {
      WEEKLY_DIGEST: 'notification/weekly-digest',
    },
  },

  PLATFORMS: {
    PINTEREST: "pinterest",
    INSTAGRAM: "instagram",
    FACEBOOK: "facebook",
    TWITTER: "twitter",
    YOUTUBE: "youtube",
    SPOTIFY: "spotify",
    REDDIT: "reddit",
  },

  TOKEN: {
    PURPOSE: {
      RESET_PASSWORD: 'resetpassword',
      CONFIRM_EMAIL: 'emailconfirmation'
    }
  }
}