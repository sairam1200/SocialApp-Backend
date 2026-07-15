import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateNewsletterSubscriberTable1783500000000
  implements MigrationInterface
{
  name = 'CreateNewsletterSubscriberTable1783500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS notification.newsletter_subscribers (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "createdBy" uuid,
        "createdOn" TIMESTAMP NOT NULL DEFAULT now(),
        "lastModifiedBy" uuid,
        "lastModifiedOn" TIMESTAMP,
        "lastRefreshed" TIMESTAMP NOT NULL DEFAULT now(),
        email character varying(320) NOT NULL
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_newsletter_subscribers_email
      ON notification.newsletter_subscribers (email)
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE notification.newsletter_subscribers
        ADD CONSTRAINT uq_newsletter_subscribers_email UNIQUE (email);
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS notification.newsletter_subscribers CASCADE`,
    );
  }
}
