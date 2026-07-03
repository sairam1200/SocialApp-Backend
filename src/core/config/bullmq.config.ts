import { QueueOptions, WorkerOptions, JobsOptions } from 'bullmq';
import redis from '../utils/redis.util';

const FIFTEEN_MINUTES = 15 * 60;
const ONE_HOUR = 3600;
const ONE_DAY = 86400;
const THREE_DAYS = 3 * 86400;

export class BullMQConfig {
  /**
   * Shared config applied to every queue via forRoot.
   * Uses the shared Redis instance so queues do NOT create extra connections.
   */
  static getConnectionConfig() {
    return {
      connection: redis.getBullMQConnection(),
      prefix: 'gaddr-backend',
      defaultJobOptions: this.getDefaultJobOptions(),
    };
  }

  static getDefaultJobOptions(): JobsOptions {
    return {
      // Auto-remove completed jobs after 15 min or 50 completed jobs
      // Prevents Redis memory exhaustion on the 30 MB plan
      removeOnComplete: {
        age: FIFTEEN_MINUTES,
        count: 50,
      },
      // Keep failed jobs longer for debugging but cap count
      removeOnFail: {
        age: ONE_DAY,
        count: 200,
      },
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
    };
  }

  static getQueueOptions(queueName: string): Partial<QueueOptions> {
    return {
      connection: redis.getBullMQConnection(),
      skipVersionCheck: true,
      prefix: 'gaddr-backend',
      defaultJobOptions: this.getDefaultJobOptions(),
      streams: {
        events: {
          maxLen: 100, // Reduced from 1000: saves memory on 30 MB plan
        },
      },
    };
  }

  /**
   * Returns worker options.
   * Uses the shared Redis instance so the main client reuses the existing connection.
   * BullMQ creates a duplicate for the blocking client via instance.duplicate()
   * (1 connection per worker).
   *
   * Total for 13 workers: 1 (shared) + 13 (blocking) = 14 connections.
   */
  static getWorkerOptions(
    queueName: string,
    concurrency: number = 1,
    options?: Partial<WorkerOptions>
  ): Partial<WorkerOptions> {
    return {
      connection: redis.getBullMQConnection(),
      prefix: 'gaddr-backend',
      skipVersionCheck: true,
      concurrency: Math.max(1, Math.min(concurrency, 2)),
      lockDuration: 60000,
      lockRenewTime: 30000,
      stalledInterval: 60000,
      maxStalledCount: 3,
      removeOnComplete: {
        age: FIFTEEN_MINUTES,
        count: 50,
      },
      removeOnFail: {
        age: ONE_DAY,
        count: 200,
      },
      metrics: {
        maxDataPoints: 10,
      },
      skipLockRenewal: false,
      ...options,
    };
  }

  /**
   * Aggressive cleanup for ephemeral (non-critical) jobs.
   */
  static getEphemeralJobOptions() {
    return {
      removeOnComplete: {
        age: FIFTEEN_MINUTES,
        count: 50,
      },
      removeOnFail: {
        age: ONE_HOUR,
        count: 50,
      },
    };
  }
}

export const QueueConfigs = {
  highPriority: {
    concurrency: 50,
    limiter: {
      max: 10000,
      duration: 1000, // 1 second in milliseconds (10k jobs per second)
    },
  },
  standard: {
    concurrency: 20,
    limiter: {
      max: 5000,
      duration: 1000, // 1 second in milliseconds (5k jobs per second)
    },
  },
  batch: {
    concurrency: 10,
    limiter: {
      max: 1000,
      duration: 1000, // 1 second in milliseconds (1k jobs per second)
    },
  },
  background: {
    concurrency: 5,
    limiter: {
      max: 500,
      duration: 1000, // 1 second in milliseconds (500 jobs per second)
    },
  },
};

export default BullMQConfig;

