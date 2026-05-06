import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { Logger } from './logger';

const logger = new Logger('queue');

// Store active queues and workers
const queues = new Map<string, Queue>();
const workers = new Map<string, Worker>();

// Redis connection for queues
let redisConnection: Redis | null = null;

function shouldUseQueueRedis(): boolean {
  const store = String(process.env.QUEUE_STORE || '').toLowerCase();
  if (store === 'memory') {
    return false;
  }
  if (store === 'redis') {
    return true;
  }

  if (process.env.REDIS_DISABLED === 'true') {
    return false;
  }

  return process.env.NODE_ENV === 'production';
}

export function initializeQueueRedis(): Redis {
  if (!shouldUseQueueRedis()) {
    throw new Error('Queue Redis disabled for local/dev execution');
  }

  if (redisConnection && redisConnection.status === 'ready') {
    return redisConnection;
  }

  try {
    const options = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      retryStrategy: (times: number) => Math.min(times * 50, 2000),
      lazyConnect: true,
      maxRetriesPerRequest: null,
    };

    redisConnection = new Redis(options as any);

    redisConnection.on('connect', () => {
      logger.info('Queue Redis client connected');
    });

    redisConnection.on('error', (err: Error) => {
      logger.error('Queue Redis client error', { error: err.message });
    });

    return redisConnection;
  } catch (error) {
    logger.error('Failed to initialize queue Redis client', { error });
    throw error;
  }
}

export function getQueueRedis(): Redis {
  if (!redisConnection) {
    return initializeQueueRedis();
  }
  return redisConnection;
}

/**
 * Create a queue with event handlers
 */
export function createQueue(queueName: string): Queue {
  if (queues.has(queueName)) {
    return queues.get(queueName)!;
  }

  const redis = getQueueRedis();

  try {
    const queue = new Queue(queueName, {
      connection: redis as any,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: {
          age: 3600, // Remove after 1 hour
        },
        removeOnFail: {
          age: 86400, // Keep failures for 24 hours
        },
      },
    } as any);

    queues.set(queueName, queue);
    logger.info(`Queue created: ${queueName}`);

    return queue;
  } catch (error) {
    logger.error(`Failed to create queue: ${queueName}`, { error });
    throw error;
  }
}

/**
 * Create a worker to process queue jobs
 */
export function createWorker(
  queueName: string,
  processor: (job: any) => Promise<any>,
  concurrency: number = 1
): Worker {
  if (workers.has(queueName)) {
    logger.warn(`Worker already exists for queue: ${queueName}`);
    return workers.get(queueName)!;
  }

  const redis = getQueueRedis();

  try {
    const worker = new Worker(queueName, processor, {
      connection: redis as any,
      concurrency,
    } as any);

    // Event handlers
    worker.on('completed', (job) => {
      logger.info(`Job completed`, {
        jobId: job.id,
        queueName,
        duration: job.finishedOn ? job.finishedOn - job.processedOn! : 0,
      });
    });

    worker.on('failed', (job, err) => {
      logger.error(`Job failed`, {
        jobId: job?.id,
        queueName,
        error: err.message,
        attempts: job?.attemptsMade,
      });
    });

    worker.on('error', (err) => {
      logger.error(`Worker error`, { queueName, error: err.message });
    });

    workers.set(queueName, worker);
    logger.info(`Worker created for queue: ${queueName}`);

    return worker;
  } catch (error) {
    logger.error(`Failed to create worker for queue: ${queueName}`, { error });
    throw error;
  }
}

/**
 * Enqueue a job
 */
export async function enqueueJob(
  queueName: string,
  jobName: string,
  data: any,
  options?: {
    delay?: number;
    priority?: number;
    jobId?: string;
  }
): Promise<string> {
  const queue = createQueue(queueName);

  try {
    const job = await queue.add(jobName, data, {
      delay: options?.delay,
      priority: options?.priority,
      jobId: options?.jobId,
    } as any);

    logger.info(`Job enqueued`, {
      jobId: job.id,
      queueName,
      jobName,
    });

    return job.id!;
  } catch (error) {
    logger.error(`Failed to enqueue job`, { queueName, jobName, error });
    throw error;
  }
}

/**
 * Get queue statistics
 */
export async function getQueueStats(queueName: string) {
  const queue = createQueue(queueName);

  try {
    const stats = (await (queue as any).getCountsPerState?.()) || {
      wait: 0,
      active: 0,
      completed: 0,
      failed: 0,
      delayed: 0,
    };

    return {
      queueName,
      waiting: (stats as any).wait || 0,
      active: (stats as any).active || 0,
      completed: (stats as any).completed || 0,
      failed: (stats as any).failed || 0,
      delayed: (stats as any).delayed || 0,
      total: Object.values(stats || {}).reduce(
        (sum: number, val: any) => sum + (Number(val) || 0),
        0
      ),
    };
  } catch (error) {
    logger.error(`Failed to get queue stats for: ${queueName}`, { error });
    throw error;
  }
}

/**
 * Shutdown all queues and workers
 */
export async function closeQueues(): Promise<void> {
  try {
    // Close all workers
    for (const [name, worker] of workers) {
      await worker.close();
      logger.info(`Worker closed: ${name}`);
    }
    workers.clear();

    // Close all queues
    for (const [name, queue] of queues) {
      await queue.close();
      logger.info(`Queue closed: ${name}`);
    }
    queues.clear();

    // Close Redis connection
    if (redisConnection) {
      await redisConnection.quit();
      redisConnection = null;
      logger.info('Queue Redis connection closed');
    }
  } catch (error) {
    logger.error('Error closing queues', { error });
  }
}

/**
 * Get queue instance
 */
export function getQueue(queueName: string): Queue | undefined {
  return queues.get(queueName);
}

/**
 * Get worker instance
 */
export function getWorker(queueName: string): Worker | undefined {
  return workers.get(queueName);
}
