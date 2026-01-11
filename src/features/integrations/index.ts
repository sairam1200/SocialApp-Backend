import { FacebookConnectController } from "./facebook/connect/facebook-connect.endpoint";
import { FacebookConnectCallbackQueryHandler, FacebookConnectQueryHandler } from "./facebook/connect/facebook-connect.handler";
import { FacebookProfileController } from "./facebook/get-profile/get-profile.endpoint";
import { FacebookProfileQueryHandler } from "./facebook/get-profile/get-profile.handler";
import { FacebookImportController } from "./facebook/import/facebook-import.endpoint";
import { FacebookImportCommandHandler } from "./facebook/import/facebook-import.handler";
import { FacebookSyncController } from "./facebook/sync/facebook-sync.endpoint";
import { EnableFacebookSyncCommandHandler } from "./facebook/sync/enable-facebook-sync.handler";
import { DisableFacebookSyncCommandHandler } from "./facebook/sync/disable-facebook-sync.handler";
import { InstagramConnectController } from "./instagram/connect/instagram-connect.endpoint";
import { InstagramConnectCallbackQueryHandler, InstagramConnectQueryHandler } from "./instagram/connect/instagram-connect.handler";
import { InstagramProfileController } from "./instagram/get-profile/get-profile.endpoint";
import { InstagramProfileQueryHandler } from "./instagram/get-profile/get-profile.handler";
import { InstagramImportController } from "./instagram/import/instagram-import.endpoint";
import { InstagramImportCommandHandler } from "./instagram/import/instagram-import.handler";
import { InstagramSyncController } from "./instagram/sync/instagram-sync.endpoint";
import { EnableInstagramSyncCommandHandler } from "./instagram/sync/enable-instagram-sync.handler";
import { DisableInstagramSyncCommandHandler } from "./instagram/sync/disable-instagram-sync.handler";
import { CancelInstagramImportCommandHandler } from "./instagram/import/cancel-instagram-import.handler";
import { PinterestConnectController } from "./pinterest/connect/pinterest-connect.endpoint";
import { PinterestConnectCallbackQueryHandler, PinterestConnectQueryHandler } from "./pinterest/connect/pinterest-connect.handler";
import { PinterestProfileController } from "./pinterest/get-profile/get-profile.endpoint";
import { PinterestProfileQueryHandler } from "./pinterest/get-profile/get-profile.handler";
import { PinterestImportController } from "./pinterest/import/pinterest-import.endpoint";
import { PinterestImportCommandHandler } from "./pinterest/import/pinterest-import.handler";
import { CancelPinterestImportCommandHandler } from "./pinterest/import/cancel-pinterest-import.handler";
import { PinterestSyncController } from "./pinterest/sync/pinterest-sync.endpoint";
import { EnablePinterestSyncCommandHandler } from "./pinterest/sync/enable-pinterest-sync.handler";
import { DisablePinterestSyncCommandHandler } from "./pinterest/sync/disable-pinterest-sync.handler";
import { RedditConnectController } from "./reddit/connect/reddit-connect.endpoint";
import { RedditConnectCallbackQueryHandler, RedditConnectQueryHandler } from "./reddit/connect/reddit-connect.handler";
import { RedditProfileController } from "./reddit/get-profile/get-profile.endpoint";
import { RedditProfileQueryHandler } from "./reddit/get-profile/get-profile.handler";
import { RedditImportController } from "./reddit/import/reddit-import.endpoint";
import { RedditImportCommandHandler } from "./reddit/import/reddit-import.handler";
import { CancelRedditImportCommandHandler } from "./reddit/import/cancel-reddit-import.handler";
import { RedditSyncController } from "./reddit/sync/reddit-sync.endpoint";
import { EnableRedditSyncCommandHandler } from "./reddit/sync/enable-reddit-sync.handler";
import { DisableRedditSyncCommandHandler } from "./reddit/sync/disable-reddit-sync.handler";
import { SpotifyConnectController } from "./spotify/connect/spotify-connect.endpoint";
import { SpotifyConnectCallbackQueryHandler, SpotifyConnectQueryHandler } from "./spotify/connect/spotify-connect.handler";
import { SpotifyProfileController } from "./spotify/get-profile/get-profile.endpoint";
import { SpotifyProfileQueryHandler } from "./spotify/get-profile/get-profile.handler";
import { SpotifyImportController } from "./spotify/import/spotify-import.endpoint";
import { SpotifyImportCommandHandler } from "./spotify/import/spotify-import.handler";
import { CancelSpotifyImportCommandHandler } from "./spotify/import/cancel-spotify-import.handler";
import { SpotifySyncController } from "./spotify/sync/spotify-sync.endpoint";
import { EnableSpotifySyncCommandHandler } from "./spotify/sync/enable-spotify-sync.handler";
import { DisableSpotifySyncCommandHandler } from "./spotify/sync/disable-spotify-sync.handler";
import { TwitterConnectController } from "./twitter/connect/twitter-connect.endpoint";
import { TwiiterConnectQueryHandler, TwitterConnectCallbackQueryHandler } from "./twitter/connect/twitter-connect.handler";
import { TwitterProfileController } from "./twitter/get-profile/get-profile.endpoint";
import { TwitterProfileQueryHandler } from "./twitter/get-profile/get-profile.handler";
import { TwitterImportController } from "./twitter/import/twitter-import.endpoint";
import { TwitterImportCommandHandler } from "./twitter/import/twitter-import.handler";
import { CancelTwitterImportCommandHandler } from "./twitter/import/cancel-twitter-import.handler";
import { TwitterSyncController } from "./twitter/sync/twitter-sync.endpoint";
import { EnableTwitterSyncCommandHandler } from "./twitter/sync/enable-twitter-sync.handler";
import { DisableTwitterSyncCommandHandler } from "./twitter/sync/disable-twitter-sync.handler";
import { YoutubeConnectController } from "./youtube/connect/youtube-connect.endpoint";
import { YoutubeConnectCallbackQueryHandler, YoutubeConnectQueryHandler } from "./youtube/connect/youtube-connect.handler";
import { YoutubeProfileController } from "./youtube/get-profile/get-profile.endpoint";
import { YoutubeProfileQueryHandler } from "./youtube/get-profile/get-profile.handler";
import { YoutubeImportController } from "./youtube/import/youtube-import.endpoint";
import { YoutubeImportCommandHandler } from "./youtube/import/youtube-import.handler";
import { CancelYoutubeImportCommandHandler } from "./youtube/import/cancel-youtube-import.handler";
import { YoutubeSyncController } from "./youtube/sync/youtube-sync.endpoint";
import { EnableYoutubeSyncCommandHandler } from "./youtube/sync/enable-youtube-sync.handler";
import { DisableYoutubeSyncCommandHandler } from "./youtube/sync/disable-youtube-sync.handler";
import { YoutubeWebhookController } from "./youtube/webhook/youtube-webhook.endpoint";
import { TiktokConnectController } from "./tiktok/connect/tiktok-connect.endpoint";
import { TiktokConnectCallbackQueryHandler, TiktokConnectQueryHandler } from "./tiktok/connect/tiktok-connect.handler";
import { TikTokProfileController } from "./tiktok/get-profile/get-profile.endpoint";
import { TiktokProfileQueryHandler } from "./tiktok/get-profile/get-profile.handler";
import { TikTokImportController } from "./tiktok/import/tiktok-import.endpoint";
import { TiktokImportCommandHandler } from "./tiktok/import/tiktok-import.handler";
import { CancelTiktokImportCommandHandler } from "./tiktok/import/cancel-tiktok-import.handler";
import { TikTokSyncController } from "./tiktok/sync/tiktok-sync.endpoint";
import { EnableTiktokSyncCommandHandler } from "./tiktok/sync/enable-tiktok-sync.handler";
import { DisableTiktokSyncCommandHandler } from "./tiktok/sync/disable-tiktok-sync.handler";
import { LinkedInConnectController } from "./linkedin/connect/linkedin-connect.endpoint";
import { LinkedInConnectCallbackQueryHandler } from "./linkedin/connect/linkedin-connect.handler";
import { LinkedInProfileController } from "./linkedin/get-profile/get-profile.endpoint";
import { LinkedInProfileQueryHandler } from "./linkedin/get-profile/get-profile.handler";
import { LinkedInImportController } from "./linkedin/import/linkedin-import.endpoint";
import { LinkedInImportCommandHandler } from "./linkedin/import/linkedin-import.handler";
import { CancelLinkedInImportCommandHandler } from "./linkedin/import/cancel-linkedin-import.handler";
import { LinkedInSyncController } from "./linkedin/sync/linkedin-sync.endpoint";
import { EnableLinkedInSyncCommandHandler } from "./linkedin/sync/enable-linkedin-sync.handler";
import { DisableLinkedInSyncCommandHandler } from "./linkedin/sync/disable-linkedin-sync.handler";
import { FacebookSearchController } from "./facebook/search/facebook-search.endpoint";
import { FacebookSearchQueryHandler } from "./facebook/search/facebook-search.handler";
import { PinterestSearchController } from "./pinterest/search/pinterest-search.endpoint";
import { PinterestSearchQueryHandler } from "./pinterest/search/pinterest-search.handler";

export { FacebookConnectController } from "./facebook/connect/facebook-connect.endpoint"
export { FacebookConnectCallbackQueryHandler, FacebookConnectQueryHandler } from "./facebook/connect/facebook-connect.handler";

export { FacebookImportController } from "./facebook/import/facebook-import.endpoint";
export { FacebookImportCommandHandler } from "./facebook/import/facebook-import.handler";

export { FacebookProfileController } from "./facebook/get-profile/get-profile.endpoint";
export { FacebookProfileQueryHandler } from "./facebook/get-profile/get-profile.handler";

export { FacebookSearchController } from "./facebook/search/facebook-search.endpoint";
export { FacebookSearchQueryHandler } from "./facebook/search/facebook-search.handler"

export { InstagramConnectController } from "./instagram/connect/instagram-connect.endpoint"
export { InstagramConnectCallbackQueryHandler, InstagramConnectQueryHandler } from "./instagram/connect/instagram-connect.handler";

export { InstagramProfileController } from "./instagram/get-profile/get-profile.endpoint";
export { InstagramProfileQueryHandler } from "./instagram/get-profile/get-profile.handler";

export { InstagramImportController } from "./instagram/import/instagram-import.endpoint";
export { InstagramImportCommandHandler } from "./instagram/import/instagram-import.handler";
export { CancelInstagramImportCommandHandler } from "./instagram/import/cancel-instagram-import.handler";
export { InstagramSyncController } from "./instagram/sync/instagram-sync.endpoint";
export { EnableInstagramSyncCommandHandler } from "./instagram/sync/enable-instagram-sync.handler";
export { DisableInstagramSyncCommandHandler } from "./instagram/sync/disable-instagram-sync.handler";

export { PinterestConnectController } from "./pinterest/connect/pinterest-connect.endpoint";
export { PinterestConnectCallbackQueryHandler, PinterestConnectQueryHandler } from "./pinterest/connect/pinterest-connect.handler";

export { PinterestProfileController } from "./pinterest/get-profile/get-profile.endpoint";
export { PinterestProfileQueryHandler } from "./pinterest/get-profile/get-profile.handler";

export { PinterestImportController } from "./pinterest/import/pinterest-import.endpoint";
export { PinterestImportCommandHandler } from "./pinterest/import/pinterest-import.handler";
export { CancelPinterestImportCommandHandler } from "./pinterest/import/cancel-pinterest-import.handler";
export { PinterestSyncController } from "./pinterest/sync/pinterest-sync.endpoint";
export { EnablePinterestSyncCommandHandler } from "./pinterest/sync/enable-pinterest-sync.handler";
export { DisablePinterestSyncCommandHandler } from "./pinterest/sync/disable-pinterest-sync.handler";

export { PinterestSearchController } from "./pinterest/search/pinterest-search.endpoint";
export { PinterestSearchQueryHandler } from "./pinterest/search/pinterest-search.handler";

export { RedditConnectController } from "./reddit/connect/reddit-connect.endpoint";
export { RedditConnectCallbackQueryHandler, RedditConnectQueryHandler } from "./reddit/connect/reddit-connect.handler";

export { RedditProfileController } from "./reddit/get-profile/get-profile.endpoint"
export { RedditProfileQueryHandler } from "./reddit/get-profile/get-profile.handler"

export { RedditImportController } from "./reddit/import/reddit-import.endpoint";
export { RedditImportCommandHandler } from "./reddit/import/reddit-import.handler";
export { CancelRedditImportCommandHandler } from "./reddit/import/cancel-reddit-import.handler";
export { RedditSyncController } from "./reddit/sync/reddit-sync.endpoint";
export { EnableRedditSyncCommandHandler } from "./reddit/sync/enable-reddit-sync.handler";
export { DisableRedditSyncCommandHandler } from "./reddit/sync/disable-reddit-sync.handler";

export { SpotifyConnectController } from "./spotify/connect/spotify-connect.endpoint";
export { SpotifyConnectCallbackQueryHandler, SpotifyConnectQueryHandler } from "./spotify/connect/spotify-connect.handler";

export { SpotifyProfileController } from "./spotify/get-profile/get-profile.endpoint";
export { SpotifyProfileQueryHandler } from "./spotify/get-profile/get-profile.handler";

export { SpotifyImportController } from "./spotify/import/spotify-import.endpoint";
export { SpotifyImportCommandHandler } from "./spotify/import/spotify-import.handler";
export { CancelSpotifyImportCommandHandler } from "./spotify/import/cancel-spotify-import.handler";
export { SpotifySyncController } from "./spotify/sync/spotify-sync.endpoint";
export { EnableSpotifySyncCommandHandler } from "./spotify/sync/enable-spotify-sync.handler";
export { DisableSpotifySyncCommandHandler } from "./spotify/sync/disable-spotify-sync.handler";

export { TwitterConnectController } from "./twitter/connect/twitter-connect.endpoint";
export { TwitterConnectCallbackQueryHandler, TwiiterConnectQueryHandler } from "./twitter/connect/twitter-connect.handler";

export { TwitterProfileController } from "./twitter/get-profile/get-profile.endpoint";
export { TwitterProfileQueryHandler } from "./twitter/get-profile/get-profile.handler";

export { TwitterImportController } from "./twitter/import/twitter-import.endpoint";
export { TwitterImportCommandHandler } from "./twitter/import/twitter-import.handler";
export { CancelTwitterImportCommandHandler } from "./twitter/import/cancel-twitter-import.handler";
export { TwitterSyncController } from "./twitter/sync/twitter-sync.endpoint";
export { EnableTwitterSyncCommandHandler } from "./twitter/sync/enable-twitter-sync.handler";
export { DisableTwitterSyncCommandHandler } from "./twitter/sync/disable-twitter-sync.handler";

export { YoutubeConnectController } from "./youtube/connect/youtube-connect.endpoint";
export { YoutubeConnectCallbackQueryHandler, YoutubeConnectQueryHandler } from "./youtube/connect/youtube-connect.handler";

export { YoutubeProfileController } from "./youtube/get-profile/get-profile.endpoint";
export { YoutubeProfileQueryHandler } from "./youtube/get-profile/get-profile.handler";

export { YoutubeImportController } from "./youtube/import/youtube-import.endpoint";
export { YoutubeImportCommandHandler } from "./youtube/import/youtube-import.handler";
export { CancelYoutubeImportCommandHandler } from "./youtube/import/cancel-youtube-import.handler";
export { YoutubeSyncController } from "./youtube/sync/youtube-sync.endpoint";
export { EnableYoutubeSyncCommandHandler } from "./youtube/sync/enable-youtube-sync.handler";
export { DisableYoutubeSyncCommandHandler } from "./youtube/sync/disable-youtube-sync.handler";
export { YoutubeWebhookController } from "./youtube/webhook/youtube-webhook.endpoint";

export { TiktokConnectController as TikTokConnectController } from "./tiktok/connect/tiktok-connect.endpoint";
export { TiktokConnectCallbackQueryHandler, TiktokConnectQueryHandler } from "./tiktok/connect/tiktok-connect.handler";

export { TikTokProfileController } from "./tiktok/get-profile/get-profile.endpoint";
export { TiktokProfileQueryHandler } from "./tiktok/get-profile/get-profile.handler";

export { TikTokImportController } from "./tiktok/import/tiktok-import.endpoint";
export { TiktokImportCommandHandler } from "./tiktok/import/tiktok-import.handler";
export { CancelTiktokImportCommandHandler } from "./tiktok/import/cancel-tiktok-import.handler";
export { TikTokSyncController } from "./tiktok/sync/tiktok-sync.endpoint";
export { EnableTiktokSyncCommandHandler } from "./tiktok/sync/enable-tiktok-sync.handler";
export { DisableTiktokSyncCommandHandler } from "./tiktok/sync/disable-tiktok-sync.handler";

export { LinkedInConnectController } from "./linkedin/connect/linkedin-connect.endpoint";
export { LinkedInConnectCallbackQueryHandler } from "./linkedin/connect/linkedin-connect.handler";

export { LinkedInProfileController } from "./linkedin/get-profile/get-profile.endpoint";
export { LinkedInProfileQueryHandler } from "./linkedin/get-profile/get-profile.handler";

export { LinkedInImportController } from "./linkedin/import/linkedin-import.endpoint";
export { LinkedInImportCommandHandler } from "./linkedin/import/linkedin-import.handler";
export { CancelLinkedInImportCommandHandler } from "./linkedin/import/cancel-linkedin-import.handler";
export { LinkedInSyncController } from "./linkedin/sync/linkedin-sync.endpoint";
export { EnableLinkedInSyncCommandHandler } from "./linkedin/sync/enable-linkedin-sync.handler";
export { DisableLinkedInSyncCommandHandler } from "./linkedin/sync/disable-linkedin-sync.handler";

const controllers = [
  FacebookConnectController,
  FacebookImportController,
  FacebookProfileController,
  FacebookSearchController,
  InstagramConnectController,
  InstagramProfileController,
  InstagramImportController,
  PinterestConnectController,
  PinterestProfileController,
  PinterestImportController,
  PinterestSearchController,
  PinterestSyncController,
  RedditConnectController,
  RedditProfileController,
  RedditImportController,
  RedditSyncController,
  SpotifyConnectController,
  SpotifyProfileController,
  SpotifyImportController,
  SpotifySyncController,
  TwitterConnectController,
  TwitterProfileController,
  TwitterImportController,
  TwitterSyncController,
  YoutubeConnectController,
  YoutubeProfileController,
  YoutubeImportController,
  YoutubeSyncController,
  YoutubeWebhookController,
  TiktokConnectController,
  TikTokProfileController,
  TikTokImportController,
  TikTokSyncController,
  LinkedInConnectController,
  LinkedInProfileController,
  LinkedInImportController,
  LinkedInSyncController,
];

const handlers = [
  FacebookConnectCallbackQueryHandler, FacebookConnectQueryHandler,
  FacebookImportCommandHandler,
  FacebookProfileQueryHandler,
  FacebookSearchQueryHandler,
  InstagramConnectCallbackQueryHandler, InstagramConnectQueryHandler,
  InstagramProfileQueryHandler,
  InstagramImportCommandHandler,
  CancelInstagramImportCommandHandler,
  PinterestConnectCallbackQueryHandler, PinterestConnectQueryHandler,
  PinterestProfileQueryHandler,
  PinterestImportCommandHandler,
  CancelPinterestImportCommandHandler,
  PinterestSearchQueryHandler,
  EnablePinterestSyncCommandHandler,
  DisablePinterestSyncCommandHandler,
  RedditConnectCallbackQueryHandler, RedditConnectQueryHandler,
  RedditProfileQueryHandler,
  RedditImportCommandHandler,
  CancelRedditImportCommandHandler,
  EnableRedditSyncCommandHandler,
  DisableRedditSyncCommandHandler,
  SpotifyConnectCallbackQueryHandler, SpotifyConnectQueryHandler,
  SpotifyProfileQueryHandler,
  SpotifyImportCommandHandler,
  CancelSpotifyImportCommandHandler,
  EnableSpotifySyncCommandHandler,
  DisableSpotifySyncCommandHandler,
  TwitterConnectCallbackQueryHandler, TwiiterConnectQueryHandler,
  TwitterProfileQueryHandler,
  TwitterImportCommandHandler,
  CancelTwitterImportCommandHandler,
  EnableTwitterSyncCommandHandler,
  DisableTwitterSyncCommandHandler,
  YoutubeConnectCallbackQueryHandler, YoutubeConnectQueryHandler,
  YoutubeProfileQueryHandler,
  YoutubeImportCommandHandler,
  CancelYoutubeImportCommandHandler,
  EnableYoutubeSyncCommandHandler,
  DisableYoutubeSyncCommandHandler,
  TiktokConnectCallbackQueryHandler,
  TiktokConnectQueryHandler,
  TiktokProfileQueryHandler,
  TiktokImportCommandHandler,
  CancelTiktokImportCommandHandler,
  EnableTiktokSyncCommandHandler,
  DisableTiktokSyncCommandHandler,
  LinkedInConnectCallbackQueryHandler,
  LinkedInProfileQueryHandler,
  LinkedInImportCommandHandler,
  CancelLinkedInImportCommandHandler,
  EnableLinkedInSyncCommandHandler,
  DisableLinkedInSyncCommandHandler,
];

const integrations = {
  addControllers: () => controllers,
  addHandlers: () => handlers,
};

export default integrations;