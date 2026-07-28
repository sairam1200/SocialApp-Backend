const { DataSource } = require('typeorm');

const ds = new DataSource({
  type: 'postgres',
  url: 'postgresql://neondb_owner:npg_0gIvfAWhGk8C@ep-autumn-paper-ahdjud0j-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require',
  ssl: { rejectUnauthorized: false },
});

ds.initialize()
  .then(async () => {
    console.log('Adding missing columns to playlistContent...');
    
    // Add missing columns one by one, ignore if already exists
    const columns = [
      `ALTER TABLE "playlistContent" ADD COLUMN IF NOT EXISTS "type" varchar(255) NOT NULL DEFAULT 'video'`,
      `ALTER TABLE "playlistContent" ADD COLUMN IF NOT EXISTS "platform" varchar(30) NOT NULL DEFAULT 'unknown'`,
      `ALTER TABLE "playlistContent" ADD COLUMN IF NOT EXISTS "contentId" varchar(255) NOT NULL DEFAULT ''`,
      `ALTER TABLE "playlistContent" ADD COLUMN IF NOT EXISTS "contentUrl" varchar NOT NULL DEFAULT ''`,
      `ALTER TABLE "playlistContent" ADD COLUMN IF NOT EXISTS "title" varchar NOT NULL DEFAULT ''`,
      `ALTER TABLE "playlistContent" ADD COLUMN IF NOT EXISTS "description" text`,
      `ALTER TABLE "playlistContent" ADD COLUMN IF NOT EXISTS "thumbnailUrl" varchar NOT NULL DEFAULT ''`,
      `ALTER TABLE "playlistContent" ADD COLUMN IF NOT EXISTS "metadata" json`,
    ];

    for (const sql of columns) {
      try {
        await ds.query(sql);
        console.log(`OK: ${sql.substring(0, 80)}...`);
      } catch (e) {
        console.log(`WARN: ${e.message.substring(0, 100)}`);
      }
    }

    console.log('\nVerifying schema...');
    const cols = await ds.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'playlistContent' ORDER BY ordinal_position"
    );
    console.log('Final columns:', cols.map(c => c.column_name).join(', '));

    await ds.destroy();
    console.log('Done!');
  })
  .catch((e) => {
    console.error('ERROR:', e.message);
    process.exit(1);
  });
