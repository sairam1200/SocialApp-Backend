import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddJobToStreamEntityType1785000000002 implements MigrationInterface {
  name = 'AddJobToStreamEntityType1785000000002';

  private async enumExists(
    queryRunner: QueryRunner,
    enumName: string,
    value: string,
  ): Promise<boolean> {
    const result = await queryRunner.query(
      `SELECT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = $1
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = $2)
      )`,
      [value, enumName],
    );
    return result[0]?.exists ?? false;
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    const enumTypeName = 'contentStreams_type_enum';

    if (await this.enumExists(queryRunner, enumTypeName, 'Job')) {
      return;
    }

    await queryRunner.query(
      `ALTER TYPE "public"."${enumTypeName}" ADD VALUE 'Job'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {}
}
