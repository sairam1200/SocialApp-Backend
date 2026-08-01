import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialCreate1747343277182 implements MigrationInterface {
  name = 'InitialCreate1747343277182';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(
      `CREATE TABLE "identity"."userRoles" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdBy" character varying, "createdOn" TIMESTAMP NOT NULL DEFAULT now(), "lastModifiedBy" character varying, "lastModifiedOn" TIMESTAMP DEFAULT now(), "lastRefreshed" TIMESTAMP NOT NULL, "userId" character varying NOT NULL, "roleId" character varying NOT NULL, "isDisabled" boolean NOT NULL DEFAULT false, "disabledUntil" TIMESTAMP, CONSTRAINT "PK_f51275374b5fb007ccf0fff9806" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "identity"."userLogins" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdBy" character varying, "createdOn" TIMESTAMP NOT NULL DEFAULT now(), "lastModifiedBy" character varying, "lastModifiedOn" TIMESTAMP DEFAULT now(), "lastRefreshed" TIMESTAMP NOT NULL, "provider" character varying NOT NULL, "userId" character varying NOT NULL, "tokenValue" character varying NOT NULL, "userAgent" character varying NOT NULL, "ipAddress" character varying NOT NULL, "deviceId" character varying NOT NULL, "addedDateUtc" TIMESTAMP NOT NULL, "expiryDateUtc" TIMESTAMP NOT NULL, CONSTRAINT "PK_62e4cf6dea9680fe23bd9cc033d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "identity"."users_type_enum" AS ENUM('Admin', 'User', 'Guest')`,
    );
    await queryRunner.query(
      `CREATE TABLE "identity"."users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdBy" character varying, "createdOn" TIMESTAMP NOT NULL DEFAULT now(), "lastModifiedBy" character varying, "lastModifiedOn" TIMESTAMP DEFAULT now(), "lastRefreshed" TIMESTAMP NOT NULL, "firstName" character varying NOT NULL, "lastName" character varying NOT NULL, "isActive" boolean NOT NULL DEFAULT true, "registeredOn" TIMESTAMP, "userName" character varying, "email" character varying NOT NULL, "gender" character varying, "phoneNumber" character varying, "normalizedEmail" character varying, "emailConfirmed" boolean NOT NULL DEFAULT false, "passwordHash" character varying, "isLockedOut" boolean NOT NULL DEFAULT false, "lockoutEnd" TIMESTAMP, "accessFailedCount" integer NOT NULL DEFAULT '0', "type" "identity"."users_type_enum" NOT NULL DEFAULT 'User', CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "identity"."roles_type_enum" AS ENUM('System', 'Regular')`,
    );
    await queryRunner.query(
      `CREATE TABLE "identity"."roles" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdBy" character varying, "createdOn" TIMESTAMP NOT NULL DEFAULT now(), "lastModifiedBy" character varying, "lastModifiedOn" TIMESTAMP DEFAULT now(), "lastRefreshed" TIMESTAMP NOT NULL, "name" character varying NOT NULL, "description" character varying NOT NULL, "normalizedName" character varying NOT NULL, "type" "identity"."roles_type_enum" NOT NULL DEFAULT 'Regular', "isDisabled" boolean NOT NULL DEFAULT false, "disabledUntil" TIMESTAMP, CONSTRAINT "PK_c1433d71a4838793a49dcad46ab" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "identity"."roleClaims" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "roleId" uuid NOT NULL, "claimType" character varying NOT NULL, "claimValue" character varying NOT NULL, CONSTRAINT "PK_7cb49f105c82df8e51c724b1731" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "linkedAccounts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdBy" character varying, "createdOn" TIMESTAMP NOT NULL DEFAULT now(), "lastModifiedBy" character varying, "lastModifiedOn" TIMESTAMP DEFAULT now(), "lastRefreshed" TIMESTAMP NOT NULL, "userId" character varying NOT NULL, "platform" character varying NOT NULL, "username" character varying NOT NULL, "profileImage" character varying, "externalId" character varying NOT NULL, "email" character varying NOT NULL, "followersCount" integer NOT NULL DEFAULT '0', "followingCount" integer NOT NULL DEFAULT '0', "metaData" json, CONSTRAINT "PK_24f59a871cf08268f15f5d078dc" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "identity"."roleClaims" ADD CONSTRAINT "FK_a277756feaecf5dd449bd6b93a2" FOREIGN KEY ("roleId") REFERENCES "identity"."roles"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "identity"."roleClaims" DROP CONSTRAINT "FK_a277756feaecf5dd449bd6b93a2"`,
    );
    await queryRunner.query(`DROP TABLE "linkedAccounts"`);
    await queryRunner.query(`DROP TABLE "identity"."roleClaims"`);
    await queryRunner.query(`DROP TABLE "identity"."roles"`);
    await queryRunner.query(`DROP TYPE "identity"."roles_type_enum"`);
    await queryRunner.query(`DROP TABLE "identity"."users"`);
    await queryRunner.query(`DROP TYPE "identity"."users_type_enum"`);
    await queryRunner.query(`DROP TABLE "identity"."userLogins"`);
    await queryRunner.query(`DROP TABLE "identity"."userRoles"`);
  }
}
