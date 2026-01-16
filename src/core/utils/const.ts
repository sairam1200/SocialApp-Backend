export default {
  // Repository Interfaces
  IUSER_REPOSITORY: "IUserRepository",
  IROLE_REPOSITORY: "IRoleRepository",
  IGENERAL_REPOSITORY: "IGeneralRepository",
  IUSERROLE_REPOSITORY: "IUserRoleRepository",
  IUSERFOLLOW_REPOSITORY: "IUserFollowRepository",
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
  IEMAIL_SERVICE: 'IEmailService',
  ISEARCH_SERVICE: 'ISearchService',
  ITOKEN_SERVICE: 'ITokenService',
  IYOUTUBEWEBHOOK_SERVICE: 'IYoutubeWebhookService',
  INOTIFICATION_SERVICE: 'INotificationService',
  IQUEUE_SERVICE: 'IQueueService',
  IPLATFORM_DISCONNECT_SERVICE: 'IPlatformDisconnectService',

  BULL_QUEUES: {
    FACEBOOK_IMPORT: 'facebook-import',
    INSTAGRAM_IMPORT: 'instagram-import',
    TWITTER_IMPORT: 'twitter-import',
    TIKTOK_IMPORT: 'tiktok-import',
    LINKEDIN_IMPORT: 'linkedin-import',
    YOUTUBE_IMPORT: 'youtube-import',
    SPOTIFY_IMPORT: 'spotify-import',
    PINTEREST_IMPORT: 'pinterest-import',
    REDDIT_IMPORT: 'reddit-import',
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
    PINTEREST: 'pinterest',
    INSTAGRAM: 'instagram',
    FACEBOOK: 'facebook',
    TWITTER: 'twitter',
    YOUTUBE: 'youtube',
    SPOTIFY: 'spotify',
    REDDIT: 'reddit',
    TIKTOK: 'tiktok',
    LINKEDIN: 'linkedin',
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
    'vk.com',
  ],

  TOKEN: {
    PURPOSE: {
      RESET_PASSWORD: 'resetpassword',
      CONFIRM_EMAIL: 'emailconfirmation',
      CONFIRM_PHONE: 'phoneconfirmation'
    }
  },

  SEARCH_CACHE: {
    RESULT_FRESHNESS_WINDOW_MS: 60 * 60 * 1000, // 1 hour
    QUERY_CACHE_TTL_SEC: 5 * 60, // 5 minutes
    QUERY_LOCK_TTL_SEC: 30, // 30 seconds
  },

  REDIS: {
    USER: {
      ACCOUNT: '_user_account',
      ACCOUNT_SESSION_TTL_SEC: 604800, // 7 days
    }
  },

  COLLECTION: {
    BOOKMARK: {
      NAME: 'bookmark',
      DESCRIPTION: ''
    }
  }
}
