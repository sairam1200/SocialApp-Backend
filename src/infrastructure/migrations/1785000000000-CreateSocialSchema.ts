import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Community — the social layer.
 *
 * One migration for the whole schema because the tables are mutually
 * referential and splitting them into a dozen files would only make the
 * ordering constraints implicit. Every statement is idempotent
 * (`IF NOT EXISTS` / `DO $$` guards on enum types) so a partially-applied
 * run can be re-run rather than hand-repaired — a real risk here, where
 * `POSTGRES_MIGRATIONS_RUN` may be flipped on against a live database.
 *
 * Foreign keys point at `social.profiles`, not `identity.users`, everywhere
 * except `profiles.userId` itself. That single indirection is what lets a
 * brand behave like a person throughout the feed without the auth tables
 * knowing anything about brands.
 */
export class CreateSocialSchema1785000000000 implements MigrationInterface {
  name = 'CreateSocialSchema1785000000000';

  private static readonly ENUMS: Array<[string, string[]]> = [
    [
      'posts_kind_enum',
      [
        'update',
        'photo',
        'video',
        'story',
        'poll',
        'article',
        'comment',
        'repost',
        'live',
        'clip',
      ],
    ],
    [
      'posts_status_enum',
      ['draft', 'scheduled', 'published', 'archived', 'removed'],
    ],
    [
      'visibility_enum',
      ['public', 'followers', 'close_friends', 'brand_partners', 'private'],
    ],
    ['profile_kind_enum', ['person', 'creator', 'brand']],
    [
      'reaction_type_enum',
      ['like', 'celebrate', 'insightful', 'support', 'funny'],
    ],
    [
      'attachment_kind_enum',
      ['moment', 'place', 'product', 'profile', 'link', 'stream', 'course'],
    ],
    ['media_kind_enum', ['image', 'video', 'audio', 'document']],
    [
      'disclosure_kind_enum',
      ['none', 'paid_partnership', 'gifted', 'affiliate', 'own_brand'],
    ],
    [
      'campaign_status_enum',
      ['draft', 'open', 'closed', 'completed', 'cancelled'],
    ],
    [
      'campaign_application_status_enum',
      [
        'applied',
        'shortlisted',
        'accepted',
        'declined',
        'withdrawn',
        'delivered',
      ],
    ],
    [
      'ledger_entry_kind_enum',
      [
        'tip',
        'subscription',
        'affiliate_commission',
        'campaign_payment',
        'product_sale',
        'payout',
        'adjustment',
        'referral_reward',
      ],
    ],
    ['ledger_entry_status_enum', ['pending', 'cleared', 'reversed', 'failed']],
    [
      'payout_status_enum',
      ['requested', 'processing', 'paid', 'failed', 'cancelled'],
    ],
    ['stream_status_enum', ['idle', 'ready', 'live', 'ended', 'errored']],
    ['stream_ingest_protocol_enum', ['rtmp', 'srt', 'whip']],
    ['stream_target_status_enum', ['disabled', 'enabled', 'errored']],
    [
      'moderation_action_enum',
      ['none', 'warned', 'muted', 'timeout', 'banned', 'deleted'],
    ],
    [
      'report_reason_enum',
      [
        'spam',
        'harassment',
        'nudity',
        'violence',
        'misinformation',
        'impersonation',
        'undisclosed_ad',
        'other',
      ],
    ],
    ['report_status_enum', ['open', 'reviewing', 'actioned', 'dismissed']],
    [
      'engagement_kind_enum',
      [
        'impression',
        'dwell',
        'click',
        'like',
        'comment',
        'repost',
        'share',
        'bookmark',
        'profile_visit',
        'follow',
        'video_watch',
        'purchase',
        'not_interested',
        'mute',
        'block',
        'report',
      ],
    ],
    ['conversation_kind_enum', ['direct', 'group']],
    ['course_level_enum', ['beginner', 'intermediate', 'advanced']],
    ['lesson_kind_enum', ['article', 'video', 'quiz']],
    [
      'enrollment_status_enum',
      ['enrolled', 'in_progress', 'completed', 'abandoned'],
    ],
    ['invite_status_enum', ['sent', 'accepted', 'rewarded', 'expired']],
    [
      'subscription_status_enum',
      ['active', 'past_due', 'cancelled', 'expired'],
    ],
  ];

  /** Columns every table inherits from `BaseEntity`. Written once, used 30 times. */
  private static readonly BASE_COLUMNS = `
    "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
    "createdBy" character varying,
    "createdOn" TIMESTAMP NOT NULL DEFAULT now(),
    "lastModifiedBy" character varying,
    "lastModifiedOn" TIMESTAMP DEFAULT now(),
    "lastRefreshed" TIMESTAMP NOT NULL DEFAULT now()`;

  public async up(queryRunner: QueryRunner): Promise<void> {
    const base = CreateSocialSchema1785000000000.BASE_COLUMNS;

    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS "social"`);
    await queryRunner.query(
      `CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public`,
    );
    await queryRunner.query(
      `CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA public`,
    );

    for (const [name, values] of CreateSocialSchema1785000000000.ENUMS) {
      const literals = values.map((v) => `'${v}'`).join(',');
      await queryRunner.query(`
        DO $$ BEGIN
          CREATE TYPE "social"."${name}" AS ENUM(${literals});
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
      `);
    }

    /* ------------------------------------------------------------- profiles */

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "social"."profiles" (
        ${base},
        "userId" uuid NOT NULL,
        "handle" character varying(64) NOT NULL,
        "displayName" character varying(120) NOT NULL,
        "kind" "social"."profile_kind_enum" NOT NULL DEFAULT 'person',
        "headline" character varying(160),
        "bio" text,
        "avatarUrl" character varying(512),
        "bannerUrl" character varying(512),
        "location" character varying(120),
        "websiteUrl" character varying(512),
        "category" character varying(80),
        "topics" text[] NOT NULL DEFAULT '{}',
        "defaultPostVisibility" "social"."visibility_enum" NOT NULL DEFAULT 'public',
        "profileVisibility" "social"."visibility_enum" NOT NULL DEFAULT 'public',
        "isVerified" boolean NOT NULL DEFAULT false,
        "openToCollaborations" boolean NOT NULL DEFAULT false,
        "tipsEnabled" boolean NOT NULL DEFAULT false,
        "subscriptionsEnabled" boolean NOT NULL DEFAULT false,
        "followersCount" integer NOT NULL DEFAULT 0,
        "followingCount" integer NOT NULL DEFAULT 0,
        "postsCount" integer NOT NULL DEFAULT 0,
        "authorQuality" double precision NOT NULL DEFAULT 0.5,
        "creatorProfile" jsonb,
        "brandProfile" jsonb,
        CONSTRAINT "PK_social_profiles" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_social_profiles_user" UNIQUE ("userId"),
        CONSTRAINT "UQ_social_profiles_handle" UNIQUE ("handle"),
        CONSTRAINT "FK_social_profiles_user" FOREIGN KEY ("userId")
          REFERENCES "identity"."users"("id") ON DELETE CASCADE
      )`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_social_profiles_kind" ON "social"."profiles" ("kind")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_social_profiles_category" ON "social"."profiles" ("category")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_social_profiles_open_to_collabs" ON "social"."profiles" ("openToCollaborations") WHERE "openToCollaborations" = true`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_social_profiles_topics" ON "social"."profiles" USING GIN ("topics")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_social_profiles_handle_trgm" ON "social"."profiles" USING GIN ("handle" gin_trgm_ops)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_social_profiles_name_trgm" ON "social"."profiles" USING GIN ("displayName" gin_trgm_ops)`,
    );

    /* ---------------------------------------------------------------- posts */

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "social"."posts" (
        ${base},
        "authorProfileId" uuid NOT NULL,
        "kind" "social"."posts_kind_enum" NOT NULL DEFAULT 'update',
        "status" "social"."posts_status_enum" NOT NULL DEFAULT 'draft',
        "visibility" "social"."visibility_enum" NOT NULL DEFAULT 'public',
        "body" text,
        "parentId" uuid,
        "rootId" uuid,
        "repostOfId" uuid,
        "attachmentKind" "social"."attachment_kind_enum",
        "attachmentTargetId" uuid,
        "place" jsonb,
        "linkPreview" jsonb,
        "streamId" uuid,
        "tags" text[] NOT NULL DEFAULT '{}',
        "topics" text[] NOT NULL DEFAULT '{}',
        "mentionedProfileIds" uuid[] NOT NULL DEFAULT '{}',
        "isSponsored" boolean NOT NULL DEFAULT false,
        "disclosure" "social"."disclosure_kind_enum" NOT NULL DEFAULT 'none',
        "sponsorProfileId" uuid,
        "campaignId" uuid,
        "scheduledFor" TIMESTAMP WITH TIME ZONE,
        "publishedOn" TIMESTAMP WITH TIME ZONE,
        "expiresOn" TIMESTAMP WITH TIME ZONE,
        "likesCount" integer NOT NULL DEFAULT 0,
        "commentsCount" integer NOT NULL DEFAULT 0,
        "repostsCount" integer NOT NULL DEFAULT 0,
        "sharesCount" integer NOT NULL DEFAULT 0,
        "impressionsCount" integer NOT NULL DEFAULT 0,
        "clicksCount" integer NOT NULL DEFAULT 0,
        "hotScore" double precision NOT NULL DEFAULT 0,
        "searchText" text,
        "language" character varying(8),
        "externalTargets" jsonb,
        CONSTRAINT "PK_social_posts" PRIMARY KEY ("id"),
        CONSTRAINT "FK_social_posts_author" FOREIGN KEY ("authorProfileId")
          REFERENCES "social"."profiles"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_social_posts_parent" FOREIGN KEY ("parentId")
          REFERENCES "social"."posts"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_social_posts_repost_of" FOREIGN KEY ("repostOfId")
          REFERENCES "social"."posts"("id") ON DELETE CASCADE
      )`);

    for (const [name, expr] of [
      ['idx_posts_author', '("authorProfileId")'],
      ['idx_posts_kind', '("kind")'],
      ['idx_posts_status', '("status")'],
      ['idx_posts_visibility', '("visibility")'],
      ['idx_posts_parent', '("parentId")'],
      ['idx_posts_root', '("rootId")'],
      ['idx_posts_repost_of', '("repostOfId")'],
      ['idx_posts_attachment_target', '("attachmentTargetId")'],
      ['idx_posts_stream', '("streamId")'],
      ['idx_posts_sponsor', '("sponsorProfileId")'],
      ['idx_posts_scheduled_for', '("scheduledFor")'],
      ['idx_posts_expires_on', '("expiresOn")'],
      ['idx_posts_hot_score', '("hotScore" DESC)'],
      ['idx_posts_feed', '("status", "publishedOn" DESC)'],
      [
        'idx_posts_author_feed',
        '("authorProfileId", "status", "publishedOn" DESC)',
      ],
      ['idx_posts_tags', 'USING GIN ("tags")'],
      ['idx_posts_topics', 'USING GIN ("topics")'],
      ['idx_posts_mentions', 'USING GIN ("mentionedProfileIds")'],
    ] as Array<[string, string]>) {
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "${name}" ON "social"."posts" ${expr}`,
      );
    }
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_posts_search_trgm" ON "social"."posts" USING GIN ("searchText" gin_trgm_ops)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_posts_sponsored" ON "social"."posts" ("isSponsored") WHERE "isSponsored" = true`,
    );

    /* ----------------------------------------------------------- post media */

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "social"."post_media" (
        ${base},
        "postId" uuid NOT NULL,
        "kind" "social"."media_kind_enum" NOT NULL DEFAULT 'image',
        "url" character varying(1024) NOT NULL,
        "thumbnailUrl" character varying(1024),
        "position" integer NOT NULL DEFAULT 0,
        "width" integer,
        "height" integer,
        "duration" double precision,
        "sizeBytes" bigint,
        "mimeType" character varying(128),
        "altText" character varying(1000),
        "placeholderColor" character varying(16),
        CONSTRAINT "PK_social_post_media" PRIMARY KEY ("id"),
        CONSTRAINT "FK_social_post_media_post" FOREIGN KEY ("postId")
          REFERENCES "social"."posts"("id") ON DELETE CASCADE
      )`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_post_media_post" ON "social"."post_media" ("postId")`,
    );

    /* ---------------------------------------------------------------- polls */

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "social"."poll_options" (
        ${base},
        "postId" uuid NOT NULL,
        "label" character varying(200) NOT NULL,
        "position" integer NOT NULL DEFAULT 0,
        "votesCount" integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_social_poll_options" PRIMARY KEY ("id"),
        CONSTRAINT "FK_social_poll_options_post" FOREIGN KEY ("postId")
          REFERENCES "social"."posts"("id") ON DELETE CASCADE
      )`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_poll_options_post" ON "social"."poll_options" ("postId")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "social"."poll_votes" (
        ${base},
        "postId" uuid NOT NULL,
        "optionId" uuid NOT NULL,
        "voterProfileId" uuid NOT NULL,
        CONSTRAINT "PK_social_poll_votes" PRIMARY KEY ("id"),
        CONSTRAINT "uq_poll_votes_voter" UNIQUE ("postId", "voterProfileId"),
        CONSTRAINT "FK_social_poll_votes_post" FOREIGN KEY ("postId")
          REFERENCES "social"."posts"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_social_poll_votes_option" FOREIGN KEY ("optionId")
          REFERENCES "social"."poll_options"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_social_poll_votes_voter" FOREIGN KEY ("voterProfileId")
          REFERENCES "social"."profiles"("id") ON DELETE CASCADE
      )`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_poll_votes_post" ON "social"."poll_votes" ("postId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_poll_votes_option" ON "social"."poll_votes" ("optionId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_poll_votes_voter" ON "social"."poll_votes" ("voterProfileId")`,
    );

    /* ----------------------------------------------------------- engagement */

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "social"."reactions" (
        ${base},
        "postId" uuid NOT NULL,
        "profileId" uuid NOT NULL,
        "type" "social"."reaction_type_enum" NOT NULL DEFAULT 'like',
        CONSTRAINT "PK_social_reactions" PRIMARY KEY ("id"),
        CONSTRAINT "uq_reactions_post_profile" UNIQUE ("postId", "profileId"),
        CONSTRAINT "FK_social_reactions_post" FOREIGN KEY ("postId")
          REFERENCES "social"."posts"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_social_reactions_profile" FOREIGN KEY ("profileId")
          REFERENCES "social"."profiles"("id") ON DELETE CASCADE
      )`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_reactions_post" ON "social"."reactions" ("postId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_reactions_profile" ON "social"."reactions" ("profileId")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "social"."shares" (
        ${base},
        "postId" uuid NOT NULL,
        "sharerProfileId" uuid,
        "channel" character varying(40) NOT NULL,
        "referralCode" character varying(32) NOT NULL,
        "visitsCount" integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_social_shares" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_social_shares_referral_code" UNIQUE ("referralCode"),
        CONSTRAINT "FK_social_shares_post" FOREIGN KEY ("postId")
          REFERENCES "social"."posts"("id") ON DELETE CASCADE
      )`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_shares_post" ON "social"."shares" ("postId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_shares_sharer" ON "social"."shares" ("sharerProfileId")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "social"."engagement_events" (
        ${base},
        "actorProfileId" uuid NOT NULL,
        "subjectId" uuid NOT NULL,
        "subjectKind" character varying(24) NOT NULL,
        "kind" "social"."engagement_kind_enum" NOT NULL,
        "value" double precision NOT NULL DEFAULT 1,
        "surface" character varying(40),
        "position" integer,
        CONSTRAINT "PK_social_engagement_events" PRIMARY KEY ("id")
      )`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_engagement_actor_time" ON "social"."engagement_events" ("actorProfileId", "createdOn" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_engagement_subject_time" ON "social"."engagement_events" ("subjectId", "createdOn" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_engagement_kind" ON "social"."engagement_events" ("kind")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "social"."topic_affinities" (
        ${base},
        "profileId" uuid NOT NULL,
        "topic" character varying(80) NOT NULL,
        "weight" double precision NOT NULL DEFAULT 0,
        "isPinned" boolean NOT NULL DEFAULT false,
        "isMuted" boolean NOT NULL DEFAULT false,
        "decayedOn" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_social_topic_affinities" PRIMARY KEY ("id"),
        CONSTRAINT "uq_topic_affinities_profile_topic" UNIQUE ("profileId", "topic"),
        CONSTRAINT "FK_social_topic_affinities_profile" FOREIGN KEY ("profileId")
          REFERENCES "social"."profiles"("id") ON DELETE CASCADE
      )`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_topic_affinities_profile" ON "social"."topic_affinities" ("profileId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_topic_affinities_topic" ON "social"."topic_affinities" ("topic")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "social"."mutes" (
        ${base},
        "profileId" uuid NOT NULL,
        "targetProfileId" uuid NOT NULL,
        "isBlock" boolean NOT NULL DEFAULT false,
        CONSTRAINT "PK_social_mutes" PRIMARY KEY ("id"),
        CONSTRAINT "uq_mutes_profile_target" UNIQUE ("profileId", "targetProfileId"),
        CONSTRAINT "FK_social_mutes_profile" FOREIGN KEY ("profileId")
          REFERENCES "social"."profiles"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_social_mutes_target" FOREIGN KEY ("targetProfileId")
          REFERENCES "social"."profiles"("id") ON DELETE CASCADE
      )`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_mutes_profile" ON "social"."mutes" ("profileId")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "social"."audience_members" (
        ${base},
        "ownerProfileId" uuid NOT NULL,
        "memberProfileId" uuid NOT NULL,
        "audience" "social"."visibility_enum" NOT NULL,
        CONSTRAINT "PK_social_audience_members" PRIMARY KEY ("id"),
        CONSTRAINT "uq_audience_members" UNIQUE ("ownerProfileId", "memberProfileId", "audience"),
        CONSTRAINT "FK_social_audience_members_owner" FOREIGN KEY ("ownerProfileId")
          REFERENCES "social"."profiles"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_social_audience_members_member" FOREIGN KEY ("memberProfileId")
          REFERENCES "social"."profiles"("id") ON DELETE CASCADE
      )`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_audience_members_owner" ON "social"."audience_members" ("ownerProfileId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_audience_members_member" ON "social"."audience_members" ("memberProfileId")`,
    );

    /* -------------------------------------------------------------- commerce */

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "social"."products" (
        ${base},
        "profileId" uuid NOT NULL,
        "title" character varying(200) NOT NULL,
        "description" text,
        "priceMinor" bigint,
        "currency" character varying(3) NOT NULL DEFAULT 'EUR',
        "imageUrl" character varying(1024),
        "externalUrl" character varying(1024),
        "sku" character varying(80),
        "category" character varying(80),
        "topics" text[] NOT NULL DEFAULT '{}',
        "isActive" boolean NOT NULL DEFAULT true,
        "clicksCount" integer NOT NULL DEFAULT 0,
        "salesCount" integer NOT NULL DEFAULT 0,
        "affiliateRateBps" integer NOT NULL DEFAULT 0,
        "searchText" text,
        CONSTRAINT "PK_social_products" PRIMARY KEY ("id"),
        CONSTRAINT "FK_social_products_profile" FOREIGN KEY ("profileId")
          REFERENCES "social"."profiles"("id") ON DELETE CASCADE
      )`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_products_profile" ON "social"."products" ("profileId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_products_category" ON "social"."products" ("category")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_products_active" ON "social"."products" ("isActive") WHERE "isActive" = true`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_products_topics" ON "social"."products" USING GIN ("topics")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_products_search_trgm" ON "social"."products" USING GIN ("searchText" gin_trgm_ops)`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "social"."post_products" (
        ${base},
        "postId" uuid NOT NULL,
        "productId" uuid NOT NULL,
        "x" double precision,
        "y" double precision,
        "mediaIndex" integer,
        CONSTRAINT "PK_social_post_products" PRIMARY KEY ("id"),
        CONSTRAINT "uq_post_products" UNIQUE ("postId", "productId"),
        CONSTRAINT "FK_social_post_products_post" FOREIGN KEY ("postId")
          REFERENCES "social"."posts"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_social_post_products_product" FOREIGN KEY ("productId")
          REFERENCES "social"."products"("id") ON DELETE CASCADE
      )`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_post_products_post" ON "social"."post_products" ("postId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_post_products_product" ON "social"."post_products" ("productId")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "social"."affiliate_links" (
        ${base},
        "code" character varying(24) NOT NULL,
        "creatorProfileId" uuid NOT NULL,
        "productId" uuid,
        "postId" uuid,
        "targetUrl" character varying(1024) NOT NULL,
        "clicksCount" integer NOT NULL DEFAULT 0,
        "conversionsCount" integer NOT NULL DEFAULT 0,
        "earnedMinor" bigint NOT NULL DEFAULT 0,
        "isActive" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_social_affiliate_links" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_social_affiliate_links_code" UNIQUE ("code"),
        CONSTRAINT "FK_social_affiliate_links_creator" FOREIGN KEY ("creatorProfileId")
          REFERENCES "social"."profiles"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_social_affiliate_links_product" FOREIGN KEY ("productId")
          REFERENCES "social"."products"("id") ON DELETE SET NULL
      )`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_affiliate_links_creator" ON "social"."affiliate_links" ("creatorProfileId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_affiliate_links_product" ON "social"."affiliate_links" ("productId")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "social"."affiliate_clicks" (
        ${base},
        "linkId" uuid NOT NULL,
        "visitorProfileId" uuid,
        "ipPrefix" character varying(64),
        "referrer" character varying(256),
        "converted" boolean NOT NULL DEFAULT false,
        "conversionValueMinor" bigint,
        CONSTRAINT "PK_social_affiliate_clicks" PRIMARY KEY ("id"),
        CONSTRAINT "FK_social_affiliate_clicks_link" FOREIGN KEY ("linkId")
          REFERENCES "social"."affiliate_links"("id") ON DELETE CASCADE
      )`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_affiliate_clicks_link" ON "social"."affiliate_clicks" ("linkId")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "social"."campaigns" (
        ${base},
        "brandProfileId" uuid NOT NULL,
        "title" character varying(200) NOT NULL,
        "brief" text NOT NULL,
        "status" "social"."campaign_status_enum" NOT NULL DEFAULT 'draft',
        "topics" text[] NOT NULL DEFAULT '{}',
        "deliverables" text[] NOT NULL DEFAULT '{}',
        "budgetMinor" bigint,
        "currency" character varying(3) NOT NULL DEFAULT 'EUR',
        "minFollowers" integer,
        "targetCountries" text[] NOT NULL DEFAULT '{}',
        "applicationsCloseOn" TIMESTAMP WITH TIME ZONE,
        "deliverBy" TIMESTAMP WITH TIME ZONE,
        "applicationsCount" integer NOT NULL DEFAULT 0,
        "searchText" text,
        CONSTRAINT "PK_social_campaigns" PRIMARY KEY ("id"),
        CONSTRAINT "FK_social_campaigns_brand" FOREIGN KEY ("brandProfileId")
          REFERENCES "social"."profiles"("id") ON DELETE CASCADE
      )`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_campaigns_brand" ON "social"."campaigns" ("brandProfileId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_campaigns_status" ON "social"."campaigns" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_campaigns_topics" ON "social"."campaigns" USING GIN ("topics")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "social"."campaign_applications" (
        ${base},
        "campaignId" uuid NOT NULL,
        "creatorProfileId" uuid NOT NULL,
        "status" "social"."campaign_application_status_enum" NOT NULL DEFAULT 'applied',
        "pitch" text,
        "quotedMinor" bigint,
        "matchScore" double precision NOT NULL DEFAULT 0,
        "deliveredPostId" uuid,
        CONSTRAINT "PK_social_campaign_applications" PRIMARY KEY ("id"),
        CONSTRAINT "uq_campaign_applications" UNIQUE ("campaignId", "creatorProfileId"),
        CONSTRAINT "FK_social_campaign_applications_campaign" FOREIGN KEY ("campaignId")
          REFERENCES "social"."campaigns"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_social_campaign_applications_creator" FOREIGN KEY ("creatorProfileId")
          REFERENCES "social"."profiles"("id") ON DELETE CASCADE
      )`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_campaign_applications_campaign" ON "social"."campaign_applications" ("campaignId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_campaign_applications_creator" ON "social"."campaign_applications" ("creatorProfileId")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "social"."subscription_tiers" (
        ${base},
        "creatorProfileId" uuid NOT NULL,
        "name" character varying(80) NOT NULL,
        "description" text,
        "priceMinor" bigint NOT NULL,
        "currency" character varying(3) NOT NULL DEFAULT 'EUR',
        "benefits" text[] NOT NULL DEFAULT '{}',
        "grantsAudience" "social"."visibility_enum" NOT NULL DEFAULT 'close_friends',
        "isActive" boolean NOT NULL DEFAULT true,
        "subscribersCount" integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_social_subscription_tiers" PRIMARY KEY ("id"),
        CONSTRAINT "FK_social_subscription_tiers_creator" FOREIGN KEY ("creatorProfileId")
          REFERENCES "social"."profiles"("id") ON DELETE CASCADE
      )`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_subscription_tiers_creator" ON "social"."subscription_tiers" ("creatorProfileId")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "social"."subscriptions" (
        ${base},
        "tierId" uuid NOT NULL,
        "creatorProfileId" uuid NOT NULL,
        "subscriberProfileId" uuid NOT NULL,
        "status" "social"."subscription_status_enum" NOT NULL DEFAULT 'active',
        "currentPeriodEnd" TIMESTAMP WITH TIME ZONE,
        "externalSubscriptionId" character varying(128),
        CONSTRAINT "PK_social_subscriptions" PRIMARY KEY ("id"),
        CONSTRAINT "uq_subscriptions" UNIQUE ("tierId", "subscriberProfileId"),
        CONSTRAINT "FK_social_subscriptions_tier" FOREIGN KEY ("tierId")
          REFERENCES "social"."subscription_tiers"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_social_subscriptions_creator" FOREIGN KEY ("creatorProfileId")
          REFERENCES "social"."profiles"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_social_subscriptions_subscriber" FOREIGN KEY ("subscriberProfileId")
          REFERENCES "social"."profiles"("id") ON DELETE CASCADE
      )`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_subscriptions_tier" ON "social"."subscriptions" ("tierId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_subscriptions_creator" ON "social"."subscriptions" ("creatorProfileId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_subscriptions_subscriber" ON "social"."subscriptions" ("subscriberProfileId")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "social"."ledger_entries" (
        ${base},
        "profileId" uuid NOT NULL,
        "kind" "social"."ledger_entry_kind_enum" NOT NULL,
        "status" "social"."ledger_entry_status_enum" NOT NULL DEFAULT 'pending',
        "amountMinor" bigint NOT NULL,
        "currency" character varying(3) NOT NULL DEFAULT 'EUR',
        "feeMinor" bigint NOT NULL DEFAULT 0,
        "counterpartyProfileId" uuid,
        "relatedPostId" uuid,
        "relatedEntityId" uuid,
        "idempotencyKey" character varying(128),
        "description" character varying(400),
        CONSTRAINT "PK_social_ledger_entries" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_social_ledger_idempotency" UNIQUE ("idempotencyKey"),
        CONSTRAINT "FK_social_ledger_entries_profile" FOREIGN KEY ("profileId")
          REFERENCES "social"."profiles"("id") ON DELETE CASCADE
      )`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_ledger_profile_time" ON "social"."ledger_entries" ("profileId", "createdOn" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_ledger_kind" ON "social"."ledger_entries" ("kind")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_ledger_status" ON "social"."ledger_entries" ("status")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "social"."payouts" (
        ${base},
        "profileId" uuid NOT NULL,
        "amountMinor" bigint NOT NULL,
        "currency" character varying(3) NOT NULL DEFAULT 'EUR',
        "status" "social"."payout_status_enum" NOT NULL DEFAULT 'requested',
        "provider" character varying(40) NOT NULL DEFAULT 'stripe',
        "externalTransferId" character varying(128),
        "failureReason" character varying(400),
        "paidOn" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_social_payouts" PRIMARY KEY ("id"),
        CONSTRAINT "FK_social_payouts_profile" FOREIGN KEY ("profileId")
          REFERENCES "social"."profiles"("id") ON DELETE CASCADE
      )`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_payouts_profile" ON "social"."payouts" ("profileId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_payouts_status" ON "social"."payouts" ("status")`,
    );

    /* --------------------------------------------------------------- streams */

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "social"."live_streams" (
        ${base},
        "profileId" uuid NOT NULL,
        "channelKey" character varying(64) NOT NULL,
        "ingestKeyEncrypted" text NOT NULL,
        "status" "social"."stream_status_enum" NOT NULL DEFAULT 'idle',
        "title" character varying(200),
        "description" text,
        "category" character varying(80),
        "topics" text[] NOT NULL DEFAULT '{}',
        "thumbnailUrl" character varying(1024),
        "visibility" "social"."visibility_enum" NOT NULL DEFAULT 'public',
        "allowedIngest" "social"."stream_ingest_protocol_enum"[] NOT NULL DEFAULT '{rtmp,srt,whip}',
        "transcodeLadder" jsonb,
        "lowLatencyEnabled" boolean NOT NULL DEFAULT true,
        "recordVod" boolean NOT NULL DEFAULT true,
        "chatEnabled" boolean NOT NULL DEFAULT true,
        "chatFollowersOnly" boolean NOT NULL DEFAULT false,
        "chatSlowModeSeconds" integer NOT NULL DEFAULT 0,
        "chatBlockedTerms" text[] NOT NULL DEFAULT '{}',
        "viewersCount" integer NOT NULL DEFAULT 0,
        "peakViewersCount" integer NOT NULL DEFAULT 0,
        "startedOn" TIMESTAMP WITH TIME ZONE,
        "endedOn" TIMESTAMP WITH TIME ZONE,
        "livePostId" uuid,
        CONSTRAINT "PK_social_live_streams" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_social_live_streams_profile" UNIQUE ("profileId"),
        CONSTRAINT "UQ_social_live_streams_channel" UNIQUE ("channelKey"),
        CONSTRAINT "FK_social_live_streams_profile" FOREIGN KEY ("profileId")
          REFERENCES "social"."profiles"("id") ON DELETE CASCADE
      )`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_live_streams_status" ON "social"."live_streams" ("status")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "social"."stream_sessions" (
        ${base},
        "streamId" uuid NOT NULL,
        "ingestProtocol" "social"."stream_ingest_protocol_enum" NOT NULL,
        "startedOn" TIMESTAMP WITH TIME ZONE NOT NULL,
        "endedOn" TIMESTAMP WITH TIME ZONE,
        "peakViewersCount" integer NOT NULL DEFAULT 0,
        "totalWatchSeconds" double precision NOT NULL DEFAULT 0,
        "chatMessagesCount" integer NOT NULL DEFAULT 0,
        "vodUrl" character varying(1024),
        "vodDurationSeconds" double precision,
        "ingestStats" jsonb,
        CONSTRAINT "PK_social_stream_sessions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_social_stream_sessions_stream" FOREIGN KEY ("streamId")
          REFERENCES "social"."live_streams"("id") ON DELETE CASCADE
      )`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_stream_sessions_stream" ON "social"."stream_sessions" ("streamId")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "social"."stream_targets" (
        ${base},
        "streamId" uuid NOT NULL,
        "platform" character varying(40) NOT NULL,
        "ingestUrl" character varying(512) NOT NULL,
        "streamKeyEncrypted" text NOT NULL,
        "status" "social"."stream_target_status_enum" NOT NULL DEFAULT 'enabled',
        "lastError" character varying(400),
        "lastPushedOn" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_social_stream_targets" PRIMARY KEY ("id"),
        CONSTRAINT "uq_stream_targets" UNIQUE ("streamId", "platform"),
        CONSTRAINT "FK_social_stream_targets_stream" FOREIGN KEY ("streamId")
          REFERENCES "social"."live_streams"("id") ON DELETE CASCADE
      )`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_stream_targets_stream" ON "social"."stream_targets" ("streamId")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "social"."stream_clips" (
        ${base},
        "streamId" uuid NOT NULL,
        "sessionId" uuid,
        "creatorProfileId" uuid NOT NULL,
        "title" character varying(200) NOT NULL,
        "startSeconds" double precision NOT NULL,
        "endSeconds" double precision NOT NULL,
        "url" character varying(1024),
        "thumbnailUrl" character varying(1024),
        "postId" uuid,
        "viewsCount" integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_social_stream_clips" PRIMARY KEY ("id"),
        CONSTRAINT "FK_social_stream_clips_stream" FOREIGN KEY ("streamId")
          REFERENCES "social"."live_streams"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_social_stream_clips_session" FOREIGN KEY ("sessionId")
          REFERENCES "social"."stream_sessions"("id") ON DELETE SET NULL
      )`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_stream_clips_stream" ON "social"."stream_clips" ("streamId")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "social"."stream_chat_messages" (
        ${base},
        "streamId" uuid NOT NULL,
        "sessionId" uuid,
        "authorProfileId" uuid NOT NULL,
        "body" character varying(500) NOT NULL,
        "offsetSeconds" double precision,
        "moderation" "social"."moderation_action_enum" NOT NULL DEFAULT 'none',
        "moderatedByProfileId" uuid,
        "tipAmountMinor" bigint,
        CONSTRAINT "PK_social_stream_chat_messages" PRIMARY KEY ("id"),
        CONSTRAINT "FK_social_stream_chat_stream" FOREIGN KEY ("streamId")
          REFERENCES "social"."live_streams"("id") ON DELETE CASCADE
      )`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_stream_chat_stream_time" ON "social"."stream_chat_messages" ("streamId", "createdOn" DESC)`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "social"."stream_moderation" (
        ${base},
        "streamId" uuid NOT NULL,
        "targetProfileId" uuid NOT NULL,
        "action" "social"."moderation_action_enum" NOT NULL,
        "byProfileId" uuid NOT NULL,
        "reason" character varying(400),
        "expiresOn" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_social_stream_moderation" PRIMARY KEY ("id"),
        CONSTRAINT "FK_social_stream_moderation_stream" FOREIGN KEY ("streamId")
          REFERENCES "social"."live_streams"("id") ON DELETE CASCADE
      )`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_stream_moderation_stream" ON "social"."stream_moderation" ("streamId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_stream_moderation_target" ON "social"."stream_moderation" ("targetProfileId")`,
    );

    /* ------------------------------------------------------------- messaging */

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "social"."conversations" (
        ${base},
        "kind" "social"."conversation_kind_enum" NOT NULL DEFAULT 'direct',
        "title" character varying(120),
        "directKey" character varying(100),
        "lastMessageOn" TIMESTAMP WITH TIME ZONE,
        "lastMessagePreview" character varying(200),
        CONSTRAINT "PK_social_conversations" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_social_conversations_direct_key" UNIQUE ("directKey")
      )`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_conversations_last_message" ON "social"."conversations" ("lastMessageOn" DESC)`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "social"."conversation_members" (
        ${base},
        "conversationId" uuid NOT NULL,
        "profileId" uuid NOT NULL,
        "lastReadOn" TIMESTAMP WITH TIME ZONE,
        "unreadCount" integer NOT NULL DEFAULT 0,
        "isMuted" boolean NOT NULL DEFAULT false,
        "leftOn" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_social_conversation_members" PRIMARY KEY ("id"),
        CONSTRAINT "uq_conversation_members" UNIQUE ("conversationId", "profileId"),
        CONSTRAINT "FK_social_conversation_members_conversation" FOREIGN KEY ("conversationId")
          REFERENCES "social"."conversations"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_social_conversation_members_profile" FOREIGN KEY ("profileId")
          REFERENCES "social"."profiles"("id") ON DELETE CASCADE
      )`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_conversation_members_conversation" ON "social"."conversation_members" ("conversationId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_conversation_members_profile" ON "social"."conversation_members" ("profileId")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "social"."messages" (
        ${base},
        "conversationId" uuid NOT NULL,
        "senderProfileId" uuid NOT NULL,
        "body" text,
        "sharedPostId" uuid,
        "media" jsonb,
        "editedOn" TIMESTAMP WITH TIME ZONE,
        "deletedOn" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_social_messages" PRIMARY KEY ("id"),
        CONSTRAINT "FK_social_messages_conversation" FOREIGN KEY ("conversationId")
          REFERENCES "social"."conversations"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_social_messages_sender" FOREIGN KEY ("senderProfileId")
          REFERENCES "social"."profiles"("id") ON DELETE CASCADE
      )`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_messages_conversation_time" ON "social"."messages" ("conversationId", "createdOn" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_messages_sender" ON "social"."messages" ("senderProfileId")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "social"."reports" (
        ${base},
        "reporterProfileId" uuid NOT NULL,
        "subjectId" uuid NOT NULL,
        "subjectKind" character varying(24) NOT NULL,
        "reason" "social"."report_reason_enum" NOT NULL,
        "detail" character varying(1000),
        "status" "social"."report_status_enum" NOT NULL DEFAULT 'open',
        "resolvedByUserId" uuid,
        "resolution" character varying(400),
        CONSTRAINT "PK_social_reports" PRIMARY KEY ("id"),
        CONSTRAINT "FK_social_reports_reporter" FOREIGN KEY ("reporterProfileId")
          REFERENCES "social"."profiles"("id") ON DELETE CASCADE
      )`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_reports_reporter" ON "social"."reports" ("reporterProfileId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_reports_subject" ON "social"."reports" ("subjectId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_reports_status" ON "social"."reports" ("status")`,
    );

    /* -------------------------------------------------------------- learning */

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "social"."courses" (
        ${base},
        "slug" character varying(120) NOT NULL,
        "title" character varying(200) NOT NULL,
        "summary" character varying(400),
        "description" text,
        "authorProfileId" uuid,
        "level" "social"."course_level_enum" NOT NULL DEFAULT 'beginner',
        "topics" text[] NOT NULL DEFAULT '{}',
        "coverUrl" character varying(1024),
        "estimatedMinutes" integer NOT NULL DEFAULT 0,
        "isPublished" boolean NOT NULL DEFAULT true,
        "priceMinor" bigint,
        "currency" character varying(3) NOT NULL DEFAULT 'EUR',
        "certificationTitle" character varying(120),
        "passingScore" integer NOT NULL DEFAULT 70,
        "enrollmentsCount" integer NOT NULL DEFAULT 0,
        "completionsCount" integer NOT NULL DEFAULT 0,
        "searchText" text,
        CONSTRAINT "PK_social_courses" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_social_courses_slug" UNIQUE ("slug"),
        CONSTRAINT "FK_social_courses_author" FOREIGN KEY ("authorProfileId")
          REFERENCES "social"."profiles"("id") ON DELETE SET NULL
      )`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_courses_author" ON "social"."courses" ("authorProfileId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_courses_published" ON "social"."courses" ("isPublished") WHERE "isPublished" = true`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_courses_topics" ON "social"."courses" USING GIN ("topics")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "social"."lessons" (
        ${base},
        "courseId" uuid NOT NULL,
        "title" character varying(200) NOT NULL,
        "kind" "social"."lesson_kind_enum" NOT NULL DEFAULT 'article',
        "position" integer NOT NULL DEFAULT 0,
        "body" text,
        "videoUrl" character varying(1024),
        "estimatedMinutes" integer NOT NULL DEFAULT 5,
        "questions" jsonb,
        CONSTRAINT "PK_social_lessons" PRIMARY KEY ("id"),
        CONSTRAINT "FK_social_lessons_course" FOREIGN KEY ("courseId")
          REFERENCES "social"."courses"("id") ON DELETE CASCADE
      )`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_lessons_course" ON "social"."lessons" ("courseId")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "social"."enrollments" (
        ${base},
        "courseId" uuid NOT NULL,
        "profileId" uuid NOT NULL,
        "status" "social"."enrollment_status_enum" NOT NULL DEFAULT 'enrolled',
        "completedLessonIds" uuid[] NOT NULL DEFAULT '{}',
        "progressPercent" integer NOT NULL DEFAULT 0,
        "quizScore" integer,
        "completedOn" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_social_enrollments" PRIMARY KEY ("id"),
        CONSTRAINT "uq_enrollments" UNIQUE ("courseId", "profileId"),
        CONSTRAINT "FK_social_enrollments_course" FOREIGN KEY ("courseId")
          REFERENCES "social"."courses"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_social_enrollments_profile" FOREIGN KEY ("profileId")
          REFERENCES "social"."profiles"("id") ON DELETE CASCADE
      )`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_enrollments_course" ON "social"."enrollments" ("courseId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_enrollments_profile" ON "social"."enrollments" ("profileId")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "social"."certifications" (
        ${base},
        "profileId" uuid NOT NULL,
        "courseId" uuid NOT NULL,
        "title" character varying(120) NOT NULL,
        "verificationCode" character varying(24) NOT NULL,
        "score" integer,
        "issuedOn" TIMESTAMP WITH TIME ZONE NOT NULL,
        "expiresOn" TIMESTAMP WITH TIME ZONE,
        "visibility" "social"."visibility_enum" NOT NULL DEFAULT 'public',
        CONSTRAINT "PK_social_certifications" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_social_certifications_code" UNIQUE ("verificationCode"),
        CONSTRAINT "FK_social_certifications_profile" FOREIGN KEY ("profileId")
          REFERENCES "social"."profiles"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_social_certifications_course" FOREIGN KEY ("courseId")
          REFERENCES "social"."courses"("id") ON DELETE CASCADE
      )`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_certifications_profile" ON "social"."certifications" ("profileId")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "social"."invites" (
        ${base},
        "code" character varying(16) NOT NULL,
        "inviterProfileId" uuid NOT NULL,
        "invitedEmail" character varying(320),
        "acceptedByProfileId" uuid,
        "status" "social"."invite_status_enum" NOT NULL DEFAULT 'sent',
        "rewardMinor" bigint NOT NULL DEFAULT 0,
        "acceptedOn" TIMESTAMP WITH TIME ZONE,
        "expiresOn" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_social_invites" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_social_invites_code" UNIQUE ("code"),
        CONSTRAINT "FK_social_invites_inviter" FOREIGN KEY ("inviterProfileId")
          REFERENCES "social"."profiles"("id") ON DELETE CASCADE
      )`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_invites_inviter" ON "social"."invites" ("inviterProfileId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_invites_status" ON "social"."invites" ("status")`,
    );

    /* Deferred FKs — these point at tables created later in this same migration. */
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "social"."posts"
          ADD CONSTRAINT "FK_social_posts_sponsor" FOREIGN KEY ("sponsorProfileId")
          REFERENCES "social"."profiles"("id") ON DELETE SET NULL;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;`);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "social"."posts"
          ADD CONSTRAINT "FK_social_posts_campaign" FOREIGN KEY ("campaignId")
          REFERENCES "social"."campaigns"("id") ON DELETE SET NULL;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;`);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "social"."posts"
          ADD CONSTRAINT "FK_social_posts_stream" FOREIGN KEY ("streamId")
          REFERENCES "social"."live_streams"("id") ON DELETE SET NULL;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Dropping the schema takes the tables, indexes, constraints and enum types
    // with it. Enumerating 30 DROP TABLEs in dependency order would be longer
    // and no safer — this schema holds nothing but Community data.
    await queryRunner.query(`DROP SCHEMA IF EXISTS "social" CASCADE`);
  }
}
