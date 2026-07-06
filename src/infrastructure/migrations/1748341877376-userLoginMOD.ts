import { MigrationInterface, QueryRunner } from 'typeorm';

export class UserLoginMOD1748341877376 implements MigrationInterface {
  name = 'UserLoginMOD1748341877376';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "identity"."userLogins" ALTER COLUMN "addedDateUtc" DROP NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "identity"."userLogins" ALTER COLUMN "addedDateUtc" SET NOT NULL`,
    );
  }
}
