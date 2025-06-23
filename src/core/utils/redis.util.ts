import { Redis } from 'ioredis';
import configs from "../../configs";
import logger from "./winston.util";

type Prefix = 'gaddr'
const prefix = 'gaddr'

const instance = new Redis({
  host: configs.redis.host,
  port: configs.redis.port,
  password: configs.redis.password,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

function getRedisKey<T extends string = any | '*'>(key: T, ...concatKeys: string[]): `${Prefix}:${T}${string | ''}` {
  return `${prefix}:${key}${concatKeys && concatKeys.length ? `:${concatKeys.join('_')}` : ''
    }`
}

async function connectToRedis() {
  try {
    await instance.ping();
    logger.info('Redis client already connected');
  } catch (e) {
    try {
      await instance.connect();
      logger.info('Redis client connected');
    } catch (connectError) {
      logger.error(
        `Redis client connection failed, Error: ${JSON.stringify(connectError)}`
      );
      throw connectError;
    }
  }
}

async function storeInRedis(key: string, data: any, duration: number) {
  await instance.set(key, data, 'EX', duration);
  return true;
}

async function getFromRedis(key: string) {
  const data = await instance.get(key);
  if (data) {
    return data;
  }
  return null;
}

const redis = {
  instance,
  getRedisKey,
  connectToRedis,
  storeInRedis,
  getFromRedis
};

export default redis;