require('reflect-metadata');
const { DataSource } = require('typeorm');

// Load ALL entities to satisfy relation dependencies
const entities = [
  'identity/user.entity',
  'identity/userBiometric.entity',
  'identity/userLogin.entity',
  'identity/userClaim.entity',
  'identity/userRole.entity',
  'identity/userPreference.entity',
  'identity/role.entity',
  'identity/roleClaim.entity',
  'collection/playlist.entity',
  'collection/playlistContent.entity',
  'collection/playlistMember.entity',
  'userFollow.entity',
  'userTopic.entity',
  'topic.entity',
  'userContent.entity',
  'contentStream.entity',
  'searchHistroy.entity',
  'linkedAccount.entity',
  'manualProfile.entity',
  'uploadJob.entity',
  'analyticsEvent.entity',
  'dataProtectionKey.entity',
  'facebookPageAnalytics.entity',
  'facebookPostAnalytics.entity',
  'facebookVideoAnalytics.entity',
  'premiumRollup.entity',
  'rateLimit.entity',
  'rateLimitLog.entity',
  'youtubeAccount.entity',
  'youtubeAnalytic.entity',
  'youtubeChannelAnalytics.entity',
  'youtubeVideo.entity',
  'youtubeVideoAnalytics.entity',
  'notification/notification.entity',
  'notification/notificationEvent.entity',
  'notification/notificationTemplate.entity',
].map(f => require(`./dist/domain/entities/${f}`));

const User = require('./dist/domain/entities/identity/user.entity').User;
const { UserType } = require('./dist/domain/enums');

async function main() {
  const dataSource = new DataSource({
    type: 'postgres',
    host: '127.0.0.1',
    port: 5433,
    username: 'root',
    password: 'dockerpg',
    database: 'postgres',
    entities: Object.values(entities).filter(e => typeof e === 'function' || (typeof e === 'object' && e.name)),
    synchronize: false,
  });

  await dataSource.initialize();
  console.log("DataSource initialized");

  const repo = dataSource.getRepository(User);

  const keyword = 'test';
  const viewerUserId = '00000000-0000-0000-0000-000000000000';
  const escapedKeyword = keyword.replace(/[\\%_]/g, "\\$&");
  const pattern = `%${escapedKeyword}%`;
  const visibility = `(user.profilePrivacy = 'Public'
    OR user.id = CAST(:viewerUserId AS uuid)
    OR EXISTS (
        SELECT 1
        FROM "identity"."user_follows" f
        WHERE f."followerId" = CAST(:viewerUserId AS uuid)
          AND f."followedId" = user.id
          AND f.status = 'accepted'
    ))`;
  const matches = `(user.firstName ILIKE :pattern ESCAPE '\\' OR user.lastName ILIKE :pattern ESCAPE '\\' OR user.userName ILIKE :pattern ESCAPE '\\')`;

  const countQb = repo
    .createQueryBuilder("user")
    .where("user.isActive = true")
    .andWhere("user.type = :userType", { userType: UserType.User })
    .andWhere(visibility, { viewerUserId })
    .andWhere(matches, { pattern });

  const [countSql, countParams] = countQb.getQueryAndParameters();

  console.log("\n=== RAW countSql (from TypeORM) ===");
  console.log(countSql);
  console.log("\n=== RAW countParams ===");
  console.log(JSON.stringify(countParams, null, 2));

  const wrappedSql = `SELECT COUNT(1) AS "cnt" FROM (${countSql}) AS "_sub"`;

  console.log("\n=== WRAPPED SQL ===");
  console.log(wrappedSql);

  // Test wrapping parse
  try {
    await dataSource.query(`PREPARE test_parse AS ${wrappedSql}`);
    console.log("\n=== PARSE SUCCESS ===");
    await dataSource.query('DEALLOCATE test_parse');
  } catch (err) {
    console.log("\n=== PARSE ERROR ===");
    console.log("Message:", err.message);
  }

  await dataSource.destroy();
}

main().catch(err => {
  console.error("Fatal:", err.message);
  console.error(err.stack?.substring(0, 500));
  process.exit(1);
});
