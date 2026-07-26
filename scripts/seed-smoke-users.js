/**
 * Seed two users for `community-smoke.js`.
 *
 * Inserts directly rather than registering: registration uploads a default
 * avatar through Cloudinary, which needs a real key and has nothing to do with
 * the social layer. The password is hashed with the same bcrypt cost the
 * application uses, so the *login* path is still exercised for real.
 */
const { Client } = require('pg');
const bcrypt = require('bcrypt');
const fs = require('fs');

const envFile = process.env.SMOKE_ENV_FILE ?? '/tmp/smoke-env.json';
const env = JSON.parse(fs.readFileSync(envFile, 'utf8'));

const USERS = [
  ['11111111-1111-4111-8111-111111111111', 'Anna', 'annasmoke', 'anna.smoke@gmail.com'],
  ['22222222-2222-4222-8222-222222222222', 'Bo', 'bosmoke', 'bo.smoke@gmail.com'],
];

async function main() {
  const client = new Client({
    host: env.POSTGRES_HOST,
    port: Number(env.POSTGRES_PORT ?? 5432),
    user: env.POSTGRES_USERNAME,
    password: env.POSTGRES_PASSWORD,
    database: env.POSTGRES_DATABASE,
  });
  await client.connect();

  const hash = await bcrypt.hash('Sm0ke!Test#2026', 10);
  for (const [id, firstName, userName, email] of USERS) {
    await client.query(
      `INSERT INTO identity.users
         ("id","createdOn","lastRefreshed","firstName","lastName","isActive",
          "userName","email","normalizedEmail","emailConfirmed","passwordHash",
          "isLockedOut","accessFailedCount","type","securityStamp",
          "concurrencyStamp","twoFactorEnabled","profilePrivacy",
          "onboardingStep","twoFactorMethod")
       VALUES ($1, now(), now(), $2, 'Smoke', true, $3, $4, $5, true, $6,
               false, 0, 'User', gen_random_uuid()::text, gen_random_uuid()::text,
               false, 'Public', 'Completed', 'totp')
       ON CONFLICT ("id") DO NOTHING`,
      [id, firstName, userName, email, email.toUpperCase(), hash],
    );
  }

  const { rows } = await client.query('SELECT count(*)::int AS n FROM identity.users');
  console.log(`seeded; identity.users now has ${rows[0].n} row(s)`);
  await client.end();
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
