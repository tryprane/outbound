import IORedis from 'ioredis'

const globalForRedis = globalThis as unknown as {
  redis: IORedis | undefined
}

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379'

export const redis =
  globalForRedis.redis ??
  new IORedis(redisUrl, {
    maxRetriesPerRequest: null, // Required for BullMQ
    enableReadyCheck: false,
  })

if (process.env.NODE_ENV !== 'production') globalForRedis.redis = redis

export function getBullConnection() {
  return redis
}

export default redis
