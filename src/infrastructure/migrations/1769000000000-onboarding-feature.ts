import { MigrationInterface, QueryRunner } from "typeorm";

export class OnboardingFeature1769000000000 implements MigrationInterface {
  name = 'OnboardingFeature1769000000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add onboardingStep enum type
    await queryRunner.query(`CREATE TYPE "identity"."users_onboardingstep_enum" AS ENUM('NotStarted', 'ProfileData', 'Topics', 'Platforms', 'Confirmation', 'Completed')`);
    
    // Add onboardingStep column to users table (profileImage already exists from previous migration)
    await queryRunner.query(`ALTER TABLE "identity"."users" ADD "onboardingStep" "identity"."users_onboardingstep_enum" DEFAULT 'NotStarted'`);
    
    // Create topics table (not in identity schema)
    await queryRunner.query(`
      CREATE TABLE "topics" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdBy" character varying,
        "createdOn" TIMESTAMP NOT NULL DEFAULT now(),
        "lastModifiedBy" character varying,
        "lastModifiedOn" TIMESTAMP DEFAULT now(),
        "lastRefreshed" TIMESTAMP NOT NULL,
        "name" character varying NOT NULL,
        "description" text,
        "icon" character varying,
        "isActive" boolean NOT NULL DEFAULT true,
        CONSTRAINT "UQ_topics_name" UNIQUE ("name"),
        CONSTRAINT "PK_topics" PRIMARY KEY ("id")
      )
    `);
    
    // Create userTopics junction table (camelCase, not in identity schema)
    await queryRunner.query(`
      CREATE TABLE "userTopics" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdBy" character varying,
        "createdOn" TIMESTAMP NOT NULL DEFAULT now(),
        "lastModifiedBy" character varying,
        "lastModifiedOn" TIMESTAMP DEFAULT now(),
        "lastRefreshed" TIMESTAMP NOT NULL,
        "userId" uuid NOT NULL,
        "topicId" uuid NOT NULL,
        CONSTRAINT "UQ_userTopics_user_topic" UNIQUE ("userId", "topicId"),
        CONSTRAINT "PK_userTopics" PRIMARY KEY ("id")
      )
    `);
    
    // Create indexes
    await queryRunner.query(`CREATE INDEX "idx_userTopics_user" ON "userTopics" ("userId")`);
    await queryRunner.query(`CREATE INDEX "idx_userTopics_topic" ON "userTopics" ("topicId")`);
    
    // Add foreign key constraints
    await queryRunner.query(`ALTER TABLE "userTopics" ADD CONSTRAINT "FK_userTopics_user" FOREIGN KEY ("userId") REFERENCES "identity"."users"("id") ON DELETE CASCADE`);
    await queryRunner.query(`ALTER TABLE "userTopics" ADD CONSTRAINT "FK_userTopics_topic" FOREIGN KEY ("topicId") REFERENCES "topics"("id") ON DELETE CASCADE`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop foreign keys
    await queryRunner.query(`ALTER TABLE "userTopics" DROP CONSTRAINT "FK_userTopics_topic"`);
    await queryRunner.query(`ALTER TABLE "userTopics" DROP CONSTRAINT "FK_userTopics_user"`);
    
    // Drop indexes
    await queryRunner.query(`DROP INDEX "idx_userTopics_topic"`);
    await queryRunner.query(`DROP INDEX "idx_userTopics_user"`);
    
    // Drop tables
    await queryRunner.query(`DROP TABLE "userTopics"`);
    await queryRunner.query(`DROP TABLE "topics"`);
    
    // Drop column and enum
    await queryRunner.query(`ALTER TABLE "identity"."users" DROP COLUMN "onboardingStep"`);
    await queryRunner.query(`DROP TYPE "identity"."users_onboardingstep_enum"`);
  }
}
