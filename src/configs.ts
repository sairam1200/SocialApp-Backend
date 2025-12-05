import * as Joi from "joi";
import * as path from "path";
import * as dotenv from 'dotenv'
import { ApplicationException } from "./core/exceptions/application.exception";

const nodeEnv = process.env.NODE_ENV || 'development';

// Ensure NODE_ENV is always set for validation and downstream usage
process.env.NODE_ENV = nodeEnv;

// Load the appropriate .env file based on the environment
dotenv.config({ path: path.join(process.cwd(), `.env.${nodeEnv}`) })
dotenv.config({ override: true })

const envVarsSchema = Joi.object()
  .keys({
    NODE_ENV: Joi.string()
      .required()
      .description('Node environment (development, production, etc.)'),
    PROJECT_NAME: Joi.string()
      .description('Project name'),
    PORT: Joi.number().default(3000)
      .description('Application port'),
    ENCRYPTION_KEY: Joi.string()
      .default('this is my custom Secret key for encryption')
      .description('Encryption key for data encryption'),
    ENCRYPTION_ALGORITHM: Joi.string()
      .default('aes-256-cbc')
      .description('Algorithm used for encryption'),
    ENCRYPTION_IV: Joi.string()
      .default('this is my custom IV for encryption')
      .description('Initialization vector for encryption'),
    JWT_SECRET: Joi.string()
      .default('this is my custom Secret key for authentication')
      .required()
      .description('Secret key for signing JWT tokens'),
    JWT_AUDIENCE: Joi.string()
      .default('https://localhost:80')
      .required()
      .description('Audience claim for JWT tokens'),
    JWT_ISSUER: Joi.string()
      .default('https://localhost:80')
      .required()
      .description('Issuer claim for JWT tokens'),
    JWT_ACCESS_EXPIRATION_MINUTES: Joi.string()
      .default('1m')
      .description('Access token expiration time (e.g., 1m, 10m)'),
    JWT_REFRESH_EXPIRATION_HOURS: Joi.string()
      .default('1h')
      .description('Refresh token expiration time (e.g., 1h, 24h)'),
    POSTGRES_HOST: Joi.string()
      .default('localhost')
      .description('PostgreSQL database host'),
    POSTGRES_PORT: Joi.number()
      .default(5432)
      .description('PostgreSQL database port'),
    POSTGRES_USERNAME: Joi.string()
      .default('postgres')
      .description('PostgreSQL username'),
    POSTGRES_PASSWORD: Joi.string()
      .default('postgres')
      .description('PostgreSQL password'),
    POSTGRES_DATABASE: Joi.string()
      .default('default_database')
      .description('PostgreSQL database name'),
    POSTGRES_SYNCHRONIZE: Joi.boolean()
      .default(false)
      .description('If true, synchronize schema without migrations'),
    POSTGRES_AUTO_LOAD_ENTITIES: Joi.boolean()
      .default(true)
      .description('Automatically load all entities'),
    POSTGRES_ENTITIES: Joi.string()
      .description('Path to PostgreSQL entities'),
    POSTGRES_MIGRATIONS: Joi.string()
      .description('Path to PostgreSQL migrations'),
    POSTGRES_SSL_REJECTUNAUTHORIZED: Joi.boolean()
      .default(false)
      .description('Path to PostgreSQL ssl rejectUnauthorized'),
    POSTGRES_SSL_CERTIFICATION: Joi.string()
      .description('Path to PostgreSQL ssl certificate'),
    POSTGRES_LOGGING: Joi.boolean()
      .default(false)
      .description('Enable PostgreSQL query logging'),
    POSTGRES_MIGRATIONS_RUN: Joi.boolean()
      .default(true)
      .description('Run migrations on application start'),
    FACEBOOK_CLIENT_ID: Joi.string()
      .description('Facebook OAuth client ID'),
    FACEBOOK_CLIENT_SECRET: Joi.string()
      .description('Facebook OAuth client secret'),
    FACEBOOK_CALLBACK_URL: Joi.string()
      .description('Facebook OAuth callback URL'),
    FACEBOOK_AUTH_CALLBACK_URL: Joi.string()
      .description('Facebook OAuth auth callback URL for login'),
    INSTAGRAM_CLIENT_ID: Joi.string()
      .description('Instagram OAuth client ID'),
    INSTAGRAM_CLIENT_SECRET: Joi.string()
      .description('Instagram OAuth client secret'),
    INSTAGRAM_CALLBACK_URL: Joi.string()
      .description('Instagram OAuth callback URL'),
    PINTEREST_CLIENT_ID: Joi.string()
      .description('Pinterest OAuth client ID'),
    PINTEREST_CLIENT_SECRET: Joi.string()
      .description('Pinterest OAuth client secret'),
    PINTEREST_CALLBACK_URL: Joi.string()
      .description('Pinterest OAuth callback URL'),
    TWITTER_CLIENT_ID: Joi.string()
      .description('Twitter OAuth client ID'),
    TWITTER_CLIENT_SECRET: Joi.string()
      .description('Twitter OAuth client secret'),
    TWITTER_CALLBACK_URL: Joi.string()
      .description('Twitter OAuth callback URL'),
    YOUTUBE_CLIENT_ID: Joi.string()
      .description('YouTube OAuth client ID'),
    YOUTUBE_CLIENT_SECRET: Joi.string()
      .description('YouTube OAuth client secret'),
    YOUTUBE_CALLBACK_URL: Joi.string()
      .description('YouTube OAuth callback URL'),
    YOUTUBE_API_KEY: Joi.string()
      .description('YouTube API key'),
    SPOTIFY_CLIENT_ID: Joi.string()
      .description('Spotify OAuth client ID'),
    SPOTIFY_CLIENT_SECRET: Joi.string()
      .description('Spotify OAuth client secret'),
    SPOTIFY_CALLBACK_URL: Joi.string()
      .description('Spotify OAuth callback URL'),
    REDIS_HOST: Joi.string()
      .description('Redis server host'),
    REDIS_PORT: Joi.number()
      .description('Redis server port'),
    REDIS_PASSWORD: Joi.string()
      .description('Redis server password')
      .optional(),
    REDIS_USERNAME: Joi.string()
      .description('Redis server username'),
    REDDIT_CLIENT_ID: Joi.string()
      .description('Reddit client ID'),
    REDDIT_CLIENT_SECRET: Joi.string()
      .description('Reddit client secret'),
    REDDIT_CALLBACK_URL: Joi.string()
      .description('Reddit callback URL'),
    TIKTOK_CLIENT_ID: Joi.string()
      .description('TikTok OAuth client ID'),
    TIKTOK_CLIENT_SECRET: Joi.string()
      .description('TikTok OAuth client secret'),
    TIKTOK_CALLBACK_URL: Joi.string()
      .description('TikTok OAuth callback URL'),
    LINKEDIN_CLIENT_ID: Joi.string()
      .description('LinkedIn OAuth client ID'),
    LINKEDIN_CLIENT_SECRET: Joi.string()
      .description('LinkedIn OAuth client secret'),
    LINKEDIN_CALLBACK_URL: Joi.string()
      .description('LinkedIn OAuth callback URL'),
    TOKEN_EXPIRATION_TIME: Joi.number()
      .default(900000)
      .description('Token expiration time in milliseconds'),
    USER_PROFILE_CHANGE_COOLDOWN_DAYS: Joi.number()
      .default(60)
      .description('Cooldown period in days before user can change email or username again'),
    GOOGLE_REDIRECT_URI: Joi.string()
      .description('Google OAuth redirect URI'),
    SMTP_HOST: Joi.string()
      .description('SMTP server host'),
    SMTP_PORT: Joi.number()
      .description('SMTP server port'),
    SMTP_USER: Joi.string()
      .description('SMTP username'),
    SMTP_SECURE: Joi.boolean()
      .description('SMTP secure'),
    SMTP_PASSWORD: Joi.string()
      .description('SMTP password'),
    LOG_PATH: Joi.string()
      .default('logs')
      .description('Directory path for log files'),
    SYSTEM_ADMIN_EMAIL: Joi.string()
      .default('team@gaddr.com'),
    SYSTEM_ADMIN_PASSWORD: Joi.string()
      .default('@Admin@123'),
    SYSTEM_ADMIN_FIRST_NAME: Joi.string()
      .default('System'),
    SYSTEM_ADMIN_LAST_NAME: Joi.string()
      .default('Admin'),
    GUEST_USER_EMAIL: Joi.string()
      .default('johndoe@gaddr.com'),
    GUEST_USER_PASSWORD: Joi.string()
      .default('@Abc@123'),
    GUEST_USER_FIRST_NAME: Joi.string()
      .default('John'),
    GUEST_USER_LAST_NAME: Joi.string()
      .default('Doe'),
    GUEST_USERNAME: Joi.string()
      .default('Doe'),
    CLOUDINARY_CLOUD_NAME: Joi.string()
      .description('Cloudinary cloud name for media storage'),
    CLOUDINARY_API_KEY: Joi.string()
      .description('Cloudinary API key for media storage'),
    CLOUDINARY_API_SECRET: Joi.string()
      .description('Cloudinary API secret for media storage'),
    TURNSTILE_SECRET_KEY: Joi.string()
      .description('Cloudflare Turnstile secret key'),
    FRONTEND_URL: Joi.string()
      .default('https://gaddr.com')
      .description('Frontend application URL'),
  })
  .unknown();

const { value: envVars, error } = envVarsSchema
  .prefs({ errors: { label: 'key' } })
  .validate(process.env);

if (error) {
  throw new ApplicationException(`Config validation error: ${error.message}`);
}

export default {
  env: envVars.NODE_ENV,
  projectName: envVars.PROJECT_NAME,
  port: envVars.PORT,
  log: {
    level: envVars.NODE_ENV === 'development' ? 'debug' : 'info',
    path: envVars.LOG_PATH,
  },
  postgres: {
    host: envVars.POSTGRES_HOST,
    port: envVars.POSTGRES_PORT,
    username: envVars.POSTGRES_USERNAME,
    password: envVars.POSTGRES_PASSWORD,
    database: envVars.POSTGRES_DATABASE,
    synchronize: envVars.POSTGRES_SYNCHRONIZE,
    autoLoadEntities: envVars.POSTGRES_AUTO_LOAD_ENTITIES,
    entities: envVars.POSTGRES_ENTITIES,
    migrations: envVars.POSTGRES_MIGRATIONS,
    logging: envVars.POSTGRES_LOGGING,
    migrationsRun: envVars.POSTGRES_MIGRATIONS_RUN,
    ssl: {
      certificate: envVars.POSTGRES_SSL_CERTIFICATION,
      rejectUnauthorized: envVars.POSTGRES_SSL_REJECTUNAUTHORIZED,
    }
  },
  jwt: {
    secret: envVars.JWT_SECRET,
    audience: envVars.JWT_AUDIENCE,
    issuer: envVars.JWT_ISSUER,
    accessTokenExpiration: envVars.JWT_ACCESS_EXPIRATION_MINUTES,
    refreshTokenExpiration: envVars.JWT_REFRESH_EXPIRATION_HOURS,
  },
  encryption: {
    key: envVars.ENCRYPTION_KEY,
    algorithm: envVars.ENCRYPTION_ALGORITHM,
    iv: envVars.ENCRYPTION_IV,
  },
  youtube: {
    clientId: envVars.YOUTUBE_CLIENT_ID,
    clientSecret: envVars.YOUTUBE_CLIENT_SECRET,
    callbackUrl: envVars.YOUTUBE_CALLBACK_URL,
  },
  google: {
    callbackUrl: envVars.GOOGLE_CALLBACK_URL,
  },
  facebook: {
    clientId: envVars.FACEBOOK_CLIENT_ID,
    clientSecret: envVars.FACEBOOK_CLIENT_SECRET,
    redirectUri: envVars.FACEBOOK_CALLBACK_URL,
    authCallbackUrl: envVars.FACEBOOK_AUTH_CALLBACK_URL,
  },
  Instagram: {
    clientId: envVars.INSTAGRAM_CLIENT_ID,
    clientSecret: envVars.INSTAGRAM_CLIENT_SECRET,
    redirectUri: envVars.INSTAGRAM_CALLBACK_URL,
  },
  pinterest: {
    clientId: envVars.PINTEREST_CLIENT_ID,
    clientSecret: envVars.PINTEREST_CLIENT_SECRET,
    redirectUri: envVars.PINTEREST_CALLBACK_URL,
  },
  twitter: {
    clientId: envVars.TWITTER_CLIENT_ID,
    clientSecret: envVars.TWITTER_CLIENT_SECRET,
    redirectUri: envVars.TWITTER_CALLBACK_URL,
  },
  spotify: {
    clientId: envVars.SPOTIFY_CLIENT_ID,
    clientSecret: envVars.SPOTIFY_CLIENT_SECRET,
    redirectUri: envVars.SPOTIFY_CALLBACK_URL,
  },
  reddit: {
    clientId: envVars.REDDIT_CLIENT_ID,
    clientSecret: envVars.REDDIT_CLIENT_SECRET,
    redirectUri: envVars.REDDIT_CALLBACK_URL,
  },
  redis: {
    host: envVars.REDIS_HOST,
    port: envVars.REDIS_PORT,
    username: envVars.REDIS_USERNAME,
    password: envVars.REDIS_PASSWORD
  },
  tiktok: {
    clientId: envVars.TIKTOK_CLIENT_ID,
    clientSecret: envVars.TIKTOK_CLIENT_SECRET,
    redirectUri: envVars.TIKTOK_CALLBACK_URL,
  },
  Token: {
    expirationTime: envVars.TOKEN_EXPIRATION_TIME
  },
  user: {
    profileChangeCooldownDays: envVars.USER_PROFILE_CHANGE_COOLDOWN_DAYS
  },
  smtp: {
    host: envVars.SMTP_HOST,
    port: envVars.SMTP_PORT,
    user: envVars.SMTP_USER,
    secure: envVars.SMTP_SECURE,
    password: envVars.SMTP_PASSWORD
  },
  cloudinary: {
    cloudName: envVars.CLOUDINARY_CLOUD_NAME,
    apiKey: envVars.CLOUDINARY_API_KEY,
    apiSecret: envVars.CLOUDINARY_API_SECRET,
  },
  systemAdmin: {
    email: envVars.SYSTEM_ADMIN_EMAIL,
    password: envVars.SYSTEM_ADMIN_PASSWORD,
    firstName: envVars.SYSTEM_ADMIN_FIRST_NAME,
    lastName: envVars.SYSTEM_ADMIN_LAST_NAME,
  },
  guestUser: {
    email: envVars.GUEST_USER_EMAIL,
    password: envVars.GUEST_USER_PASSWORD,
    firstName: envVars.GUEST_USER_FIRST_NAME,
    lastName: envVars.GUEST_USER_LAST_NAME,
    userName: envVars.GUEST_USERNAME,
  },
  turnstile: {
    secretKey: envVars.TURNSTILE_SECRET_KEY,
  },
  linkedin: {
    clientId: envVars.LINKEDIN_CLIENT_ID,
    clientSecret: envVars.LINKEDIN_CLIENT_SECRET,
    redirectUri: envVars.LINKEDIN_CALLBACK_URL,
  },
  frontend: {
    url: envVars.FRONTEND_URL,
  },
}
