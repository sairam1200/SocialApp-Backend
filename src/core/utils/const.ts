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
  ITOPIC_REPOSITORY: "ITopicRepository",
  IUSERPREFERENCE_REPOSITORY: "IUserPreferenceRepository",

  // Service Interfaces
  IEMAIL_SERVICE: 'IEmailService',
  ISEARCH_SERVICE: 'ISearchService',
  ITOKEN_SERVICE: 'ITokenService',
  IYOUTUBEWEBHOOK_SERVICE: 'IYoutubeWebhookService',
  INOTIFICATION_SERVICE: 'INotificationService',
  IQUEUE_SERVICE: 'IQueueService',
  IPLATFORM_DISCONNECT_SERVICE: 'IPlatformDisconnectService',
  IYOUTUBE_IMPORT_SERVICE: 'IYoutubeImportService',
  IFACEBOOK_IMPORT_SERVICE:'IFacebookImportService',
  IINSTAGRAM_IMPORT_SERVICE: 'IInstagramImportService',
  ITWITTER_IMPORT_SERVICE:'ITwitterImportService',
  IPINTEREST_IMPORT_SERVICE:'IPinterestImportService',
  ILINKEDIN_IMPORT_SERVICE: 'ILinkedInImportService',
  IYOUTUBE_PUBLISHING_SERVICE: 'IYoutubePublishingService',
  IYOUTUBE_ANALYTICS_SERVICE: 'IYoutubeAnalyticsService',
  IR2_STORAGE_SERVICE: 'IR2StorageService',

  // Repository Interfaces
  IYOUTUBEACCOUNT_REPOSITORY: 'IYoutubeAccountRepository',
  IYOUTUBEVIDEO_REPOSITORY: 'IYoutubeVideoRepository',
  IYOUTUBEANALYTIC_REPOSITORY: 'IYoutubeAnalyticRepository',
  IUPLOADJOB_REPOSITORY: 'IUploadJobRepository',

  // Analytics
  IANALYTICS_REPOSITORY: 'IAnalyticsRepository',
  IPREMIUMROLLUP_REPOSITORY: 'IPremiumRollupRepository',
  IANALYTICS_SERVICE: 'IAnalyticsService',
  IYOUTUBECHANNELANALYTICS_REPOSITORY: 'IYoutubeChannelAnalyticsRepository',
  IYOUTUBEVIDEOANALYTICS_REPOSITORY: 'IYoutubeVideoAnalyticsRepository',
  IYOUTUBEANALYTICS_SERVICE: 'IYoutubeAnalyticsService',
  IFACEBOOKPAGEANALYTICS_REPOSITORY: 'IFacebookPageAnalyticsRepository',
  IFACEBOOKPOSTANALYTICS_REPOSITORY: 'IFacebookPostAnalyticsRepository',
  IFACEBOOKVIDEOANALYTICS_REPOSITORY: 'IFacebookVideoAnalyticsRepository',
  IFACEBOOKANALYTICS_SERVICE: 'IFacebookAnalyticsService',

  BULL_QUEUES: {
    FACEBOOK_IMPORT: 'facebook-import',
    INSTAGRAM_IMPORT: 'instagram-import',
    YOUTUBE_IMPORT: 'youtube-import',
    SPOTIFY_IMPORT: 'spotify-import',
    YOUTUBE_UPLOAD: 'youtube-upload',
    PINTEREST_IMPORT: 'pinterest-import',
    REDDIT_IMPORT: 'reddit-import',
    TWITTER_IMPORT: 'twitter-import',
    TIKTOK_IMPORT: 'tiktok-import',
    LINKEDIN_IMPORT: 'linkedin-import',
    SNAPCHAT_IMPORT: 'snapchat-import',
    THREADS_IMPORT: 'threads-import',
    BEHANCE_IMPORT: 'behance-import',
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
    SNAPCHAT: 'snapchat',
    THREADS: 'threads',
    BEHANCE: 'behance',
    TWITCH: 'twitch',
    GITHUB: 'github',
    DISCORD: 'discord',
  },

  KNOWN_PLATFORMS_URIS: [
    'facebook.com',
    'twitter.com',
    'instagram.com',
    'tiktok.com',
    'linkedin.com',
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
    RESULT_FRESHNESS_WINDOW_MS: 60 * 60 * 1000,
    QUERY_CACHE_TTL_SEC: 5 * 60,
    QUERY_LOCK_TTL_SEC: 30,
  },

  REDIS: {
    USER: {
      ACCOUNT: '_user_account',
      PREFERENCES: 'preferences',
      ACCOUNT_SESSION_TTL_SEC: 604800,
    }
  },

  COLLECTION: {
    BOOKMARK: {
      NAME: 'bookmark',
      DESCRIPTION: ''
    }
  },

  ANALYTICS_EVENTS: {
    AUTH: {
      LOGIN: 'auth.login',
      LOGOUT: 'auth.logout',
      REGISTER: 'auth.register',
    },
    PLAYLIST: {
      CREATED: 'playlist.created',
      DELETED: 'playlist.deleted',
      CONTENT_ADDED: 'playlist.content_added',
      CONTENT_REMOVED: 'playlist.content_removed',
      BOOKMARKED: 'playlist.bookmarked',
    },
    SEARCH: {
      PERFORMED: 'search.performed',
    },
    PROFILE: {
      UPDATED: 'profile.updated',
    },
  },
}
