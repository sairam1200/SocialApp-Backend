const { DataSource } = require('typeorm');

const ds = new DataSource({
  type: 'postgres',
  url: 'postgresql://neondb_owner:npg_0gIvfAWhGk8C@ep-autumn-paper-ahdjud0j-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require',
  ssl: { rejectUnauthorized: false },
});

ds.initialize()
  .then(async () => {
    const users = await ds.query(
      'SELECT id, email, "firstName", "lastName", "userName", "emailConfirmed" FROM identity.users LIMIT 5'
    );
    console.log('USERS:', JSON.stringify(users, null, 2));

    const contents = await ds.query(
      'SELECT id, "userId", platform, "externalId", title FROM "userContents" LIMIT 5'
    );
    console.log('USER_CONTENTS:', JSON.stringify(contents, null, 2));

    const playlists = await ds.query(
      'SELECT id, name, "referenceId", "playlistType", "systemType" FROM playlists LIMIT 5'
    );
    console.log('PLAYLISTS:', JSON.stringify(playlists, null, 2));

    await ds.destroy();
  })
  .catch((e) => {
    console.error('ERROR:', e.message);
    process.exit(1);
  });
