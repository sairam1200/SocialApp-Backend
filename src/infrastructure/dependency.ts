import _const from '../core/utils/const';

import { GeneralRepository } from './repositories/general.repository';
import { ManualProfileRepository } from './repositories/manualProfile.repository';
import { YoutubeImportService } from '../infrastructure/services/youtube/youtube-imports.service';
import { YoutubePublishingService } from '../infrastructure/services/youtube/youtube-publishing.service';
import { FacebookImportService } from '../infrastructure/services/facebook/facebook-imports.service';
import { InstagramImportService } from '../infrastructure/services/instagram/instagram-import.service';
import { TwitterImportService } from '../infrastructure/services/Twitter/x-import.service';
import { LinkedInImportService } from '../infrastructure/services/linkedin/linkedin-import.service';
import { PinterestImportService } from './services/pinterest/pinterest-import.service';
import { R2StorageService } from '../shared/storage/r2/r2-storage.service';

import {
  AnalyticsRepository,
  ContentStreamRepository,
  DataProtectionKeyRepository,
  LinkedAccountRepository,
  NotificationRepository,
  PlaylistRepository,
  PremiumRollupRepository,
  RateLimitRepository,
  RoleClaimRepository,
  RoleRepository,
  SearchHistoryRepository,
  TopicRepository,
  UserContentRepository,
  UserFollowRepository,
  UserLoginRepository,
  UserPreferenceRepository,
  UserRepository,
  UserRoleRepository,
  YoutubeChannelAnalyticsRepository,
  YoutubeVideoAnalyticsRepository,
  FacebookPageAnalyticsRepository,
  FacebookPostAnalyticsRepository,
  FacebookVideoAnalyticsRepository,
  YoutubeAccountRepository,
  YoutubeVideoRepository,
  UploadJobRepository,
} from './repositories';
import {
  AnalyticsService,
  EmailService,
  NotificationService,
  SearchService,
  SearchCacheService,
  TokenService,
  YoutubeWebhookService,
  QueueService,
  PlatformDisconnectService,
  YoutubeAnalyticsService,
  FacebookAnalyticsService,
} from './services';

/* This is the dependency object that holds all the repositories & services
 * used in the application. It is used to provide the dependencies to the
 * modules in the application. This is a good practice to keep the
 * dependencies in one place and make it easy to manage them.
 */
export const dependency = {
  UserRepository: {
    provide: _const.IUSER_REPOSITORY,
    useClass: UserRepository,
  },
  UserRoleRepository: {
    provide: _const.IUSERROLE_REPOSITORY,
    useClass: UserRoleRepository,
  },
  RoleRepository: {
    provide: _const.IROLE_REPOSITORY,
    useClass: RoleRepository,
  },
  UserLoginRepository: {
    provide: _const.IUSERLOGIN_REPOSITORY,
    useClass: UserLoginRepository,
  },
  RoleClaimRepository: {
    provide: _const.IROLECLAIM_REPOSITORY,
    useClass: RoleClaimRepository,
  },
  LinkedAccountRepository: {
    provide: _const.ILINKEDACCOUNT_REPOSITORY,
    useClass: LinkedAccountRepository,
  },
  DataProtectionKeyRepository: {
    provide: _const.IDATAPROTECTIONKEY_REPOSITORY,
    useClass: DataProtectionKeyRepository,
  },
  NotificationRepository: {
    provide: _const.INOTIFICATION_REPOSITORY,
    useClass: NotificationRepository,
  },
  UserContentRepository: {
    provide: _const.IUSERCONTENT_REPOSITORY,
    useClass: UserContentRepository,
  },
  RateLimitRepository: {
    provide: _const.IRATELIMIT_REPOSITORY,
    useClass: RateLimitRepository,
  },
  PlaylistRepository: {
    provide: _const.IPLAYLIST_REPOSITORY,
    useClass: PlaylistRepository,
  },
  ManualProfileRepository: {
    provide: _const.IMANUALPROFILE_REPOSITORY,
    useClass: ManualProfileRepository,
  },

  ContentStreamRepository: {
    provide: _const.ICONTENTSTREAM_REPOSITORY,
    useClass: ContentStreamRepository,
  },
  SearchHistoryRepository: {
    provide: _const.ISEARCHHISTORY_REPOSITORY,
    useClass: SearchHistoryRepository,
  },
  UserFollowRepository: {
    provide: _const.IUSERFOLLOW_REPOSITORY,
    useClass: UserFollowRepository,
  },
  TopicRepository: {
    provide: _const.ITOPIC_REPOSITORY,
    useClass: TopicRepository,
  },
  UserPreferenceRepository: {
    provide: _const.IUSERPREFERENCE_REPOSITORY,
    useClass: UserPreferenceRepository,
  },

  TokenService: {
    provide: _const.ITOKEN_SERVICE,
    useClass: TokenService,
  },
  EmailService: {
    provide: _const.IEMAIL_SERVICE,
    useClass: EmailService,
  },
  NotificationService: {
    provide: _const.INOTIFICATION_SERVICE,
    useClass: NotificationService,
  },
  SearchService: {
    provide: _const.ISEARCH_SERVICE,
    useClass: SearchService,
  },
  YoubeWebHookService: {
    provide: _const.IYOUTUBEWEBHOOK_SERVICE,
    useClass: YoutubeWebhookService,
  },
  QueueService: {
    provide: _const.IQUEUE_SERVICE,
    useClass: QueueService,
  },
  PlatformDisconnectService: {
    provide: _const.IPLATFORM_DISCONNECT_SERVICE,
    useClass: PlatformDisconnectService,
  },
  GeneralRepository: {
    provide: _const.IGENERAL_REPOSITORY,
    useClass: GeneralRepository,
  },

  YoutubeImportService: {
    provide: _const.IYOUTUBE_IMPORT_SERVICE,
    useClass: YoutubeImportService,
  },
  FacebookImportService: {
    provide: _const.IFACEBOOK_IMPORT_SERVICE,
    useClass: FacebookImportService,
  },
  InstagramImportService: {
    provide: _const.IINSTAGRAM_IMPORT_SERVICE,
    useClass: InstagramImportService,
  },
  TwitterImportService: {
    provide: _const.ITWITTER_IMPORT_SERVICE,
    useClass: TwitterImportService,
  },
  PinterestImportService: {
    provide: _const.IPINTEREST_IMPORT_SERVICE,
    useClass: PinterestImportService,
  },
  LinkedInImportService: {
    provide: _const.ILINKEDIN_IMPORT_SERVICE,
    useClass: LinkedInImportService,
  },
  YoutubeAccountRepository: {
    provide: _const.IYOUTUBEACCOUNT_REPOSITORY,
    useClass: YoutubeAccountRepository,
  },
  YoutubeVideoRepository: {
    provide: _const.IYOUTUBEVIDEO_REPOSITORY,
    useClass: YoutubeVideoRepository,
  },

  UploadJobRepository: {
    provide: _const.IUPLOADJOB_REPOSITORY,
    useClass: UploadJobRepository,
  },
  YoutubePublishingService: {
    provide: _const.IYOUTUBE_PUBLISHING_SERVICE,
    useClass: YoutubePublishingService,
  },
  R2StorageService: {
    provide: _const.IR2_STORAGE_SERVICE,
    useClass: R2StorageService,
  },

  // Analytics
  AnalyticsRepository: {
    provide: _const.IANALYTICS_REPOSITORY,
    useClass: AnalyticsRepository,
  },
  PremiumRollupRepository: {
    provide: _const.IPREMIUMROLLUP_REPOSITORY,
    useClass: PremiumRollupRepository,
  },
  AnalyticsService: {
    provide: _const.IANALYTICS_SERVICE,
    useClass: AnalyticsService,
  },
  YoutubeChannelAnalyticsRepository: {
    provide: _const.IYOUTUBECHANNELANALYTICS_REPOSITORY,
    useClass: YoutubeChannelAnalyticsRepository,
  },
  YoutubeVideoAnalyticsRepository: {
    provide: _const.IYOUTUBEVIDEOANALYTICS_REPOSITORY,
    useClass: YoutubeVideoAnalyticsRepository,
  },
  YoutubeAnalyticsService: {
    provide: _const.IYOUTUBEANALYTICS_SERVICE,
    useClass: YoutubeAnalyticsService,
  },
  FacebookPageAnalyticsRepository: {
    provide: _const.IFACEBOOKPAGEANALYTICS_REPOSITORY,
    useClass: FacebookPageAnalyticsRepository,
  },
  FacebookPostAnalyticsRepository: {
    provide: _const.IFACEBOOKPOSTANALYTICS_REPOSITORY,
    useClass: FacebookPostAnalyticsRepository,
  },
  FacebookVideoAnalyticsRepository: {
    provide: _const.IFACEBOOKVIDEOANALYTICS_REPOSITORY,
    useClass: FacebookVideoAnalyticsRepository,
  },
  FacebookAnalyticsService: {
    provide: _const.IFACEBOOKANALYTICS_SERVICE,
    useClass: FacebookAnalyticsService,
  },
};
