export default {
  // Repository Interfaces
  IUSER_REPOSITORY: "IUserRepository",
  IROLE_REPOSITORY: "IRoleRepository",
  IUSERROLE_REPOSITORY: "IUserRoleRepository",
  IROLECLAIM_REPOSITORY: "IRoleClaimRepository",
  IUSERLOGIN_REPOSITORY: "IUserLoginRepository",
  IUSERCONTENT_REPOSITORY: "IUserContentRepository",
  INOTIFICATION_REPOSITORY: "INotificationRepository",
  ILINKEDACCOUNT_REPOSITORY: "ILinkedAccountRepository",
  IDATAPROTECTIONKEY_REPOSITORY: "IDataProtectionKeyRepository",

  // Service Interfaces
  ITOKEN_SERVICE: "ITokenService",
  INOTIFICATION_SERVICE: "INotificationService",

  BULL_QUEUES: {
    FACEBOOK_IMPORT: "facebook-import",
    INSTAGRAM_IMPORT: "instagram-import",
    TWITTER_IMPORT: "twitter-import",
  },

  PLATFORMS: {
    INSTAGRAM: "instagram",
    FACEBOOK: "facebook",
    TWITTER: "twitter",
    YOUTUBE: "youtube",
    SPOTIFY: "spotify",
  }
}