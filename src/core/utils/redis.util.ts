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

// Shared BullMQ connection instance - single connection reused across all queues and workers
// This prevents connection exhaustion by reusing one connection instead of creating new ones per queue/worker
const sharedBullMQConnection = createBullMQConnection();

// Keep subscriber connection separate if needed, but reuse for now
const bullMQSubscriberConnection = sharedBullMQConnection;

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

  // Connect shared BullMQ connection
  try {
    if (!sharedBullMQConnection.status || sharedBullMQConnection.status !== 'ready') {
      await sharedBullMQConnection.connect();
      logger.info('Shared BullMQ Redis connection connected');
    }
  } catch (error) {
    logger.error(`Shared BullMQ Redis connection failed: ${JSON.stringify(error)}`);
    throw error;
  }

  // Connect BullMQ subscriber connection (only if needed separately)
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

// BullMQ connection configuration - returns the shared connection instance
// All queues and workers will reuse this single connection
const getBullMQConnection = () => sharedBullMQConnection;

const redis = {
  instance,
  bullMQConnection: sharedBullMQConnection,
  bullMQSubscriberConnection,
  getBullMQConnection,
  getRedisKey,
  connectToRedis,
  storeInRedisAsync,
  getFromRedisAsync,
  removeFromRedisAsync
};

export default redis;