import { QueueOptions, WorkerOptions, JobsOptions } from 'bullmq';
import redis from '../utils/redis.util';

export class BullMQConfig {
  static getConnectionConfig() {
    return {
      connection: redis.getBullMQConnection(),
    };
  }

  static getDefaultJobOptions(): JobsOptions {
    return {
      removeOnComplete: {
        age: 3600, // 1 hour in seconds
        count: 100,
      },
      removeOnFail: {
        age: 86400, // 24 hours in seconds
        count: 500,
      },
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000, // 2 seconds in milliseconds
      },
    } as JobsOptions;
  }

  static getQueueOptions(queueName: string): Partial<QueueOptions> {
    return {
      connection: redis.getBullMQConnection(),
      prefix: 'gaddr-backend',
      defaultJobOptions: this.getDefaultJobOptions(),
      streams: {
        events: {
          maxLen: 1000,
        },
      },
    } as Partial<QueueOptions>;
  }

  static getWorkerOptions(
    queueName: string,
    concurrency: number = 2,
    options?: Partial<WorkerOptions>
  ): Partial<WorkerOptions> {
    const cpuCount = require('os').cpus().length;
    const optimalConcurrency = Math.min(concurrency, Math.max(cpuCount, 1));

    return {
      connection: redis.getBullMQConnection(),
      prefix: 'gaddr-backend',
      concurrency: optimalConcurrency,
      lockDuration: 30000, // 30 seconds in milliseconds
      lockRenewTime: 15000, // 15 seconds in milliseconds
      stalledInterval: 30000, // 30 seconds in milliseconds
      maxStalledCount: 1,
      removeOnComplete: {
        age: 3600, // 1 hour in seconds
        count: 100,
      },
      removeOnFail: {
        age: 86400, // 24 hours in seconds
        count: 500,
      },
      metrics: {
        maxDataPoints: 100,
      },
      skipLockRenewal: false,
      ...options,
    };
  }

  static getBulkJobOptions() {
    return {
      removeOnComplete: true,
      removeOnFail: {
        age: 3600, // 1 hour in seconds
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

