import * as Joi from "joi";
import * as path from "path";
import * as dotenv from 'dotenv'
import { ApplicationException } from "./core/exceptions/application.exception";

const nodeEnv = process.env.NODE_ENV || 'development';

// Load the appropriate .env file based on the environment
dotenv.config({ path: path.join(process.cwd(), `.env.${nodeEnv}`) })
dotenv.config({ override: true })

const envVarsSchema = Joi.object()
    .keys({
        NODE_ENV: Joi.string()
            .required(),
        PROJECT_NAME: Joi.string(),
        PORT: Joi.number().default(3000),
        ENCRYPTION_KEY: Joi.string()
            .default('this is my custom Secret key for encryption')
            .description('Encryption key'),
        ENCRYPTION_ALGORITHM: Joi.string()
            .default('aes-256-cbc')
            .description('Encryption algorithm'),
        ENCRYPTION_IV: Joi.string()
            .default('this is my custom IV for encryption')
            .description('Encryption IV'),
        JWT_SECRET: Joi.string()
            .default('this is my custom Secret key for authentication')
            .required()
            .description('JWT secret key'),
        JWT_AUDIENCE: Joi.string()
            .default('https://localhost:80')
            .required()
            .description('JWT Audience'),
        JWT_ISSUER: Joi.string()
            .default('https://localhost:80')
            .required()
            .description('JWT Issuer'),
        JWT_ACCESS_EXPIRATION_MINUTES: Joi.string()
            .default('1m')
            .description('minutes after which access tokens expire'),
        JWT_REFRESH_EXPIRATION_HOURS: Joi.string()
            .default('1h')
            .description('hours after which refresh tokens expire'),
        POSTGRES_HOST: Joi.string()
            .default('localhost')
            .description('Postgres host'),
        POSTGRES_PORT: Joi.number()
            .default(5432)
            .description('Postgres host'),
        POSTGRES_USERNAME: Joi.string()
            .default('postgres')
            .description('Postgres username'),
        POSTGRES_PASSWORD: Joi.string()
            .default('postgres')
            .description('Postgres password'),
        POSTGRES_DATABASE: Joi.string()
            .default('default_database')
            .description('Postgres database name'),
        POSTGRES_SYNCHRONIZE: Joi.boolean()
            .default(false)
            .description('Synchronize if true it dosent use migrations'),
        POSTGRES_AUTO_LOAD_ENTITIES: Joi.boolean()
            .default(true)
            .description('For loading all entities automatically'),
        POSTGRES_ENTITIES: Joi.string().description('Postgres entities'),
        POSTGRES_MIGRATIONS: Joi.string().description('Postgres migrations'),
        POSTGRES_LOGGING: Joi.boolean()
            .default(false)
            .description('Postgres logging'),
        POSTGRES_MIGRATIONS_RUN: Joi.boolean()
            .default(true)
            .description('Run migrations after running project'),
        FACEBOOK_CLIENT_ID: Joi.string()
            .description('Facebook client id'),
        FACEBOOK_CLIENT_SECRET: Joi.string()
            .description('Facebook client secret'),
        FACEBOOK_CALLBACK_URL: Joi.string()
            .description('Facebook callback url'),
        INSTAGRAM_CLIENT_ID: Joi.string()
            .description('Instagram client id'),
        INSTAGRAM_CLIENT_SECRET: Joi.string()
            .description('Instagram client secret'),
        INSTAGRAM_CALLBACK_URL: Joi.string()
            .description('Instagram callback url'),
        PINTEREST_CLIENT_ID: Joi.string()
            .description('Pinterest client id'),
        PINTEREST_CLIENT_SECRET: Joi.string()
            .description("Pinterest client secret"),
        PINTEREST_CALLBACK_URL: Joi.string()
            .description('Pinterest callback url'),
        TWITTER_CLIENT_ID: Joi.string()
            .description('Twitter client id'),
        TWITTER_CLIENT_SECRET: Joi.string()
            .description('Twitter client secret'),
        TWITTER_CALLBACK_URL: Joi.string()
            .description('Twitter callback url'),
        YOUTUBE_CLIENT_ID: Joi.string()
            .description('Youtube client id'),
        YOUTUBE_CLIENT_SECRET: Joi.string()
            .description('Youtube client secret'),
        YOUTUBE_CALLBACK_URL: Joi.string()
            .description('Youtube callback url'),
        YOUTUBE_API_KEY: Joi.string()
            .description('Youtube api key'),
        SPOTIFY_CLIENT_ID: Joi.string()
            .description('Spotify client id'),
        SPOTIFY_CLIENT_SECRET: Joi.string()
            .description('Spotify client secret'),
        SPOTIFY_CALLBACK_URL: Joi.string()
            .description('Spotify callback url'),
        REDIS_HOST: Joi.string()
            .description("Redis host address"),
        REDIS_PORT: Joi.number()
            .description("Redis port"),
        REDIS_PASSWORD: Joi.string()
            .description("Redis password"),

        LOG_PATH: Joi.string()
            .default('logs')
            .description('Path to the log file'),
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
        migrationsRun: envVars.POSTGRES_MIGRATIONS_RUN
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
        apiKey: envVars.YOUTUBE_API_KEY,
    },
    facebook: {
        clientId: envVars.FACEBOOK_CLIENT_ID,
        clientSecret: envVars.FACEBOOK_CLIENT_SECRET,
        redirectUri: envVars.FACEBOOK_CALLBACK_URL,
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
    Redis: {
        host: envVars.REDIS_HOST,
        port: envVars.REDIS_PORT,
        password: envVars.REDIS_PASSWORD
    }
}; 