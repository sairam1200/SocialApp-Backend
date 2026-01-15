import { Redis, Cluster } from 'ioredis';
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

const createBullMQConnection = (options?: { maxRetriesPerRequest?: number | null }) => {
  return new Redis({
    host: configs.redis.host,
    port: configs.redis.port,
    password: configs.redis.password,
    username: configs.redis.username,
    maxRetriesPerRequest: options?.maxRetriesPerRequest ?? null,
    enableReadyCheck: false,
    enableOfflineQueue: false,
    lazyConnect: true,
    keepAlive: 30000,
    connectTimeout: 10000,
    enableAutoPipelining: true,
    // Performance tuning
    retryStrategy: (times: number) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    reconnectOnError: (err: Error) => {
      const targetError = 'READONLY';
      if (err.message.includes(targetError)) {
        return true;
      }
      return false;
    },
  });
};

// Create connection pool for BullMQ
// Separate connections for different purposes (producer, consumer, subscriber)
const bullMQConnection = createBullMQConnection();
const bullMQSubscriberConnection = createBullMQConnection();

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

  // Connect BullMQ connections
  try {
    if (!bullMQConnection.status || bullMQConnection.status !== 'ready') {
      await bullMQConnection.connect();
      logger.info('BullMQ Redis connection connected');
    }
  } catch (error) {
    logger.error(`BullMQ Redis connection failed: ${JSON.stringify(error)}`);
    throw error;
  }

  try {
    if (!bullMQSubscriberConnection.status || bullMQSubscriberConnection.status !== 'ready') {
      await bullMQSubscriberConnection.connect();
      logger.info('BullMQ Redis subscriber connection connected');
    }
  } catch (error) {
    logger.error(`BullMQ Redis subscriber connection failed: ${JSON.stringify(error)}`);
    throw error;
  }
}

async function storeInRedisAsync(key: string, data: object, duration?: number) {
  const value = serializeObject(data);
  if (!duration) {
    await instance.set(key, value);
  } else {
    await instance.set(key, value, 'EX', duration);
  }
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

// BullMQ connection configuration
const getBullMQConnection = () => ({
  host: configs.redis.host,
  port: configs.redis.port,
  password: configs.redis.password,
  username: configs.redis.username,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  enableOfflineQueue: false,
  lazyConnect: true,
  keepAlive: 30000,
  connectTimeout: 10000,
  enableAutoPipelining: true,
  retryStrategy: (times: number) => Math.min(times * 50, 2000),
  reconnectOnError: (err: Error) => err.message.includes('READONLY'),
});

const redis = {
  instance,
  bullMQConnection,
  bullMQSubscriberConnection,
  getBullMQConnection,
  getRedisKey,
  connectToRedis,
  storeInRedisAsync,
  getFromRedisAsync,
  removeFromRedisAsync
};

export default redis;