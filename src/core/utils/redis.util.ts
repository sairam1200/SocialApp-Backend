import { Redis } from 'ioredis';
import configs from "../../configs";
import logger from "./winston.util";
import { deserializeObject, serializeObject } from './serialization.util';

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

async function storeInRedisAsync(key: string, data: object, duration: number) {
  const value = serializeObject(data)
  await instance.set(key, value, 'EX', duration);
  return true;
}

async function getFromRedisAsync<T = any>(key: string): Promise<T | null> {
  const data = await instance.get(key);
  if (data) {
    return deserializeObject<T>(data);
  }
  return null;
}

async function removeFromRedisAsync(key: string) {
  await instance.del(key);
}

const redis = {
  instance,
  getRedisKey,
  connectToRedis,
  storeInRedisAsync,
  getFromRedisAsync,
  removeFromRedisAsync
};

export default redis;