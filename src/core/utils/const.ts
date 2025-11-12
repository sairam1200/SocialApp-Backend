export default {
  // Repository Interfaces
  IUSER_REPOSITORY: "IUserRepository",
  IROLE_REPOSITORY: "IRoleRepository",
  IGENERAL_REPOSITORY: "IGeneralRepository",
  IUSERROLE_REPOSITORY: "IUserRoleRepository",
  IPLAYLIST_REPOSITORY: "IPlaylistRepository",
  IRATELIMIT_REPOSITORY: "IRateLimitRepository",
  IROLECLAIM_REPOSITORY: "IRoleClaimRepository",
  IUSERLOGIN_REPOSITORY: "IUserLoginRepository",
  ISEARCHHISTORY_REPOSITORY: "ISearchRepository",
  IUSERCONTENT_REPOSITORY: "IUserContentRepository",
  INOTIFICATION_REPOSITORY: "INotificationRepository",
  ILINKEDACCOUNT_REPOSITORY: "ILinkedAccountRepository",
  ICONTENTSTREAM_REPOSITORY: "IContentStreamRepository",
  IMANUALPROFILE_REPOSITORY: "IManualProfileRepository",
  IDATAPROTECTIONKEY_REPOSITORY: "IDataProtectionKeyRepository",

  // Service Interfaces
  IEMAIL_SERVICE: "IEmailService",
  ISEARCH_SERVICE: "ISearchService",
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
    TIKTOK_IMPORT: "tiktok-import",
    LINKEDIN_IMPORT: "linkedin-import",
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
    TIKTOK: "tiktok",
    LINKEDIN: "linkedin",
  },

  KNOWN_PLATFORMS_URIS: [
    'facebook.com',
    'twitter.com',
    'instagram.com',
    'tiktok.com',
    'linkedin.com',
    'snapchat.com',
    'youtube.com',
    'pinterest.com',
    'reddit.com',
    'tumblr.com',
    'threads.net',
    'discord.com',
    'twitch.tv',
    'medium.com',
    'vimeo.com',
    'telegram.me',
    'clubhouse.com',
    'mastodon.social',
    'weibo.com',
    'line.me',
    'flickr.com',
    'bilibili.com',
    'ok.ru',
    'vk.com'
  ],

  TOKEN: {
    PURPOSE: {
      RESET_PASSWORD: 'resetpassword',
      CONFIRM_EMAIL: 'emailconfirmation'
    }
  },

  SEARCH_CACHE: {
    RESULT_FRESHNESS_WINDOW_MS: 60 * 60 * 1000, // 1 hour - how long cached results are considered fresh
    QUERY_CACHE_TTL_SEC: 5 * 60, // 5 minutes - Redis cache TTL for search queries
    QUERY_LOCK_TTL_SEC: 30, // 30 seconds - Lock TTL to prevent duplicate API calls
  },

  REDIS: {
    USER: {
      ACCOUNT: '_user_account'
    }
  },
}