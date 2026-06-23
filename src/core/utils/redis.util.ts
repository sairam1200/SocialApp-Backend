import { Redis } from 'ioredis';
import configs from "../../configs";
import logger from "./winston.util";
import { deserializeObject, serializeObject } from './serialization.util';

type Prefix = 'gaddr'
const prefix = 'gaddr'

// Simple in-memory LRU cache to reduce Redis round-trips for frequently-read keys.
// Each entry has a TTL; expired entries are lazily evicted on read.
// Max 100 entries prevents unbounded memory growth from burst writes.
const memoryCache = new Map<string, { value: any; expiresAt: number }>();
const MEMORY_CACHE_TTL_MS = Number(process.env.MEMORY_CACHE_TTL_MS) || 15000; // 15s default
const MAX_CACHE_ENTRIES = 100;

function setMemoryCache(key: string, value: any, ttlMs?: number): void {
  if (memoryCache.size >= MAX_CACHE_ENTRIES) {
    const firstKey = memoryCache.keys().next().value;
    if (firstKey !== undefined) {
      memoryCache.delete(firstKey);
    }
  }
  memoryCache.set(key, {
    value,
    expiresAt: Date.now() + (ttlMs ?? MEMORY_CACHE_TTL_MS),
  });
}

function getMemoryCache<T>(key: string): T | undefined {
  const entry = memoryCache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    memoryCache.delete(key);
    return undefined;
  }
  return entry.value as T;
}

function clearMemoryCache(key?: string): void {
  if (key) {
    memoryCache.delete(key);
  } else {
    memoryCache.clear();
  }
}

// SINGLE Redis connection used for everything:
//   - Application caching (getFromRedisAsync, storeInRedisAsync)
//   - BullMQ queues, workers, and events
//
// BullMQ workers internally clone this connection for BLPOP blocking ops,
// but the clones share the same underlying TCP socket when possible.
// maxRetriesPerRequest: null is REQUIRED by BullMQ for workers/queues.
const instance = new Redis({
  host: configs.redis.host,
  port: configs.redis.port,
  username: configs.redis.username,
  password: configs.redis.password,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  enableOfflineQueue: false,
  lazyConnect: true,
  keepAlive: 30000,
  connectTimeout: 10000,
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

let connectionMonitor: ReturnType<typeof setInterval> | null = null;

function getRedisKey<T extends string = any | '*'>(key: T, ...concatKeys: string[]): `${Prefix}:${T}${string | ''}` {
  return `${prefix}:${key}${concatKeys && concatKeys.length ? `:${concatKeys.join('_')}` : ''
    }`
}

async function connectToRedis() {
  try {
    if (instance.status !== 'ready') {
      await instance.connect();
      logger.info('Redis client connected (shared instance)');
    } else {
      logger.info('Redis client already connected');
    }
  } catch (connectError) {
    logger.error(`Redis client connection failed: ${JSON.stringify(connectError)}`);
    throw connectError;
  }

  // Start connection monitor — reads Redis INFO every 30s
  connectionMonitor = setInterval(async () => {
    try {
      const info = await instance.info('clients');
      const match = info.match(/connected_clients:(\d+)/);
      if (match) {
        const connCount = parseInt(match[1], 10);
        logger.debug(`[RedisMonitor] connected_clients: ${connCount}`);
        if (connCount > 25) {
          logger.warn(`[RedisMonitor] WARNING: ${connCount} clients connected (limit: 30)`);
        }
      }
    } catch {
      // INFO command can fail during reconnection; ignore
    }
  }, 30000);
}

async function disconnectFromRedis() {
  if (connectionMonitor) {
    clearInterval(connectionMonitor);
    connectionMonitor = null;
  }
  try {
    if (instance.status === 'ready' || instance.status === 'connecting') {
      await instance.quit();
      logger.info('Redis client disconnected gracefully');
    }
  } catch (error) {
    logger.error(`Redis disconnect error: ${error}`);
    instance.disconnect();
  }
}

async function storeInRedisAsync(key: string, data: object, duration?: number) {
  const value = serializeObject(data);
  if (!duration) {
    await instance.set(key, value);
  } else {
    await instance.set(key, value, 'EX', duration);
  }
  // Update in-memory cache so subsequent reads don't hit Redis
  setMemoryCache(key, data, duration ? duration * 1000 : undefined);
  return true;
}

async function getFromRedisAsync<T = any>(key: string): Promise<T | null> {
  // Check in-memory cache first
  const cached = getMemoryCache<T>(key);
  if (cached !== undefined) return cached;

  const data = await instance.get(key);
  if (data) {
    const parsed = deserializeObject<T>(data);
    // Populate in-memory cache for subsequent reads
    setMemoryCache(key, parsed);
    return parsed;
  }
  return null;
}

async function removeFromRedisAsync(key: string) {
  await instance.del(key);
  clearMemoryCache(key);
}

// BullMQ expects this exact shape: { connection: Redis }
const getBullMQConnection = () => instance;

const redis = {
  instance,
  getBullMQConnection,
  getRedisKey,
  connectToRedis,
  disconnectFromRedis,
  storeInRedisAsync,
  getFromRedisAsync,
  removeFromRedisAsync,
  clearMemoryCache,
};

export default redis;