import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates six tables that had entities and ALTER migrations but were never created
 * by any migration.
 *
 * ## Why this exists
 *
 * These tables exist in production because `synchronize: true` created them at some
 * point, or because DDL was applied by hand. The migration chain never captured
 * them, which means **the database could not be rebuilt from source**:
 *
 *   QueryFailedError: relation "upload_jobs" does not exist
 *     at MakeUploadJobVideoIdNullable1784000000002.up
 *
 * A fresh database fails at that ALTER, so provisioning a new environment — staging,
 * a new region, or a disaster-recovery rebuild — was impossible. Found by actually
 * running the chain against an empty database rather than by reading it.
 *
 * Affected: upload_jobs, youtube_accounts, youtube_videos, youtube_analytics,
 * project, newsletter_subscribers.
 *
 * ## Safety on existing databases
 *
 * Every statement is `IF NOT EXISTS`, so this is a no-op wherever the tables already
 * exist. That matters because TypeORM records executed migrations by name: this
 * migration is timestamped *earlier* than `1784000000002` so it runs first on a fresh
 * database, but production has never recorded it and will therefore execute it on the
 * next deploy. It must be harmless there, and it is.
 *
 * ## Provenance
 *
 * The DDL below was not hand-written. It was produced by letting TypeORM build the
 * schema from the entity definitions (`synchronize: true`) on an empty database and
 * dumping the result, so it matches the entities exactly — including the generated
 * constraint and index names, which are kept so this converges with production
 * rather than creating differently-named duplicates.
 */
export class CreateMissingTables1784000000001 implements MigrationInterface {
  name = 'CreateMissingTables1784000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // uuid_generate_v4() is used by every default below.
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    // --- public.upload_jobs -------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS public.upload_jobs (
        id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
        "createdBy" character varying,
        "createdOn" timestamp without time zone DEFAULT now() NOT NULL,
        "lastModifiedBy" character varying,
        "lastModifiedOn" timestamp without time zone DEFAULT now(),
        "lastRefreshed" timestamp without time zone DEFAULT now() NOT NULL,
        "videoId" character varying,
        status character varying DEFAULT 'pending'::character varying NOT NULL,
        attempts integer DEFAULT 0 NOT NULL,
        progress integer DEFAULT 0 NOT NULL,
        "statusMessage" text,
        "lastError" text,
        "nextRetryAt" timestamp without time zone,
        "r2Key" character varying,
        "fileSize" bigint,
        CONSTRAINT "PK_34cc4b2ed56792958d2b85650a1" PRIMARY KEY (id)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_ace55bd989b78450011dc5f98f" ON public.upload_jobs ("videoId")`,
    );

    // --- public.youtube_accounts --------------------------------------------
    // access_token and refresh_token hold encrypted values — see the
    // gaddr-encryption skill before touching how they are written.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS public.youtube_accounts (
        id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
        "createdBy" character varying,
        "createdOn" timestamp without time zone DEFAULT now() NOT NULL,
        "lastModifiedBy" character varying,
        "lastModifiedOn" timestamp without time zone DEFAULT now(),
        "lastRefreshed" timestamp without time zone DEFAULT now() NOT NULL,
        user_id uuid NOT NULL,
        channel_id character varying NOT NULL,
        channel_title character varying NOT NULL,
        access_token character varying NOT NULL,
        refresh_token character varying NOT NULL,
        token_expiry timestamp without time zone NOT NULL,
        connected boolean DEFAULT true NOT NULL,
        disconnected_at timestamp without time zone,
        CONSTRAINT "PK_b2e3148ef8c7bb4e9ac0a37625b" PRIMARY KEY (id)
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_b73331c86d2281b07f2d1fa771" ON public.youtube_accounts (channel_id)`,
    );

    // --- public.youtube_videos ---------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS public.youtube_videos (
        id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
        "createdBy" character varying,
        "createdOn" timestamp without time zone DEFAULT now() NOT NULL,
        "lastModifiedBy" character varying,
        "lastModifiedOn" timestamp without time zone DEFAULT now(),
        "lastRefreshed" timestamp without time zone DEFAULT now() NOT NULL,
        account_id uuid NOT NULL,
        youtube_video_id character varying,
        title character varying NOT NULL,
        description text,
        visibility character varying,
        "publishAt" timestamp without time zone,
        "publishedAt" timestamp without time zone,
        status character varying DEFAULT 'draft'::character varying NOT NULL,
        thumbnail_url character varying,
        "youtubeUrl" character varying,
        video_url character varying,
        "r2Key" character varying,
        tags text,
        CONSTRAINT "PK_1a41d24a1ea34c746430493b2e6" PRIMARY KEY (id)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_5644dbaa147584f79bf491e427" ON public.youtube_videos (account_id)`,
    );

    // --- public.youtube_analytics ------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS public.youtube_analytics (
        id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
        "createdBy" character varying,
        "createdOn" timestamp without time zone DEFAULT now() NOT NULL,
        "lastModifiedBy" character varying,
        "lastModifiedOn" timestamp without time zone DEFAULT now(),
        "lastRefreshed" timestamp without time zone DEFAULT now() NOT NULL,
        "videoId" character varying NOT NULL,
        views integer DEFAULT 0 NOT NULL,
        likes integer DEFAULT 0 NOT NULL,
        comments integer DEFAULT 0 NOT NULL,
        "watchTime" integer DEFAULT 0 NOT NULL,
        "snapshotDate" timestamp without time zone NOT NULL,
        CONSTRAINT "PK_f6b6ba3f4a886ca50cfa094a544" PRIMARY KEY (id)
      )
    `);
    // Unique on (videoId, snapshotDate): one analytics snapshot per video per day,
    // which is what makes the import idempotent.
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_762c1899919472f3c313aa01ab" ON public.youtube_analytics ("videoId", "snapshotDate")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_a80ba9a1da88ffd01c0951fdd5" ON public.youtube_analytics ("videoId")`,
    );

    // --- public.project ----------------------------------------------------
    // id is a plain @PrimaryColumn (no sequence) — ids come from the caller.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS public.project (
        id integer NOT NULL,
        client_id text NOT NULL,
        title character varying(255) NOT NULL,
        description text,
        budget numeric(10,2),
        currency character varying(10) DEFAULT 'USD'::character varying NOT NULL,
        payment_type character varying(50) DEFAULT 'fixed'::character varying NOT NULL,
        timeline character varying(100),
        skills text[] DEFAULT '{}'::text[] NOT NULL,
        status character varying(20) DEFAULT 'open'::character varying NOT NULL,
        project_type character varying(50) DEFAULT 'open'::character varying,
        is_confidential boolean DEFAULT false NOT NULL,
        invitation_list text[] DEFAULT '{}'::text[] NOT NULL,
        bounty_amount numeric(10,2),
        trial_duration integer,
        hire_on_completion boolean DEFAULT false NOT NULL,
        created_at timestamp without time zone NOT NULL,
        updated_at timestamp without time zone NOT NULL,
        CONSTRAINT "PK_4d68b1358bb5b766d3e78f32f57" PRIMARY KEY (id)
      )
    `);

    // --- notification.newsletter_subscribers -------------------------------
    // The notification schema is created by 1745256809083-create-schema-notification.
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS notification`);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS notification.newsletter_subscribers (
        id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
        "createdBy" character varying,
        "createdOn" timestamp without time zone DEFAULT now() NOT NULL,
        "lastModifiedBy" character varying,
        "lastModifiedOn" timestamp without time zone DEFAULT now(),
        "lastRefreshed" timestamp without time zone DEFAULT now() NOT NULL,
        email character varying(320) NOT NULL,
        CONSTRAINT "PK_38f9333e9961b2fdb589128d19b" PRIMARY KEY (id),
        CONSTRAINT "UQ_0dc48416511f011f7de7b2a8f83" UNIQUE (email)
      )
    `);
  }

  /**
   * Deliberately a no-op.
   *
   * These tables hold production data (the analysed backup showed 25 rows in
   * upload_jobs alone). Dropping them on a rollback would destroy data that this
   * migration did not create — it only registered tables that already existed. A
   * reversal that deletes user data is worse than an irreversible migration.
   *
   * To remove them in a fresh environment, drop the database.
   */
  public async down(): Promise<void> {
    // Intentionally empty — see the comment above.
  }
}
