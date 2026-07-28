const { DataSource } = require('typeorm');

const ds = new DataSource({
  type: 'postgres',
  url: 'postgresql://neondb_owner:npg_0gIvfAWhGk8C@ep-autumn-paper-ahdjud0j-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require',
  ssl: { rejectUnauthorized: false },
});

ds.initialize()
  .then(async () => {
    const cols = await ds.query(
      "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'playlistContent' ORDER BY ordinal_position"
    );
    console.log('playlistContent COLUMNS:', JSON.stringify(cols, null, 2));
    
    const playlistCols = await ds.query(
      "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'playlists' ORDER BY ordinal_position"
    );
    console.log('playlists COLUMNS:', JSON.stringify(playlistCols, null, 2));

    const membersCols = await ds.query(
      "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'playlistMembers' ORDER BY ordinal_position"
    );
    console.log('playlistMembers COLUMNS:', JSON.stringify(membersCols, null, 2));

    await ds.destroy();
  })
  .catch((e) => {
    console.error('ERROR:', e.message);
    process.exit(1);
  });
