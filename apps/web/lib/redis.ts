import IORedis from 'ioredis'
import type { ConnectionOptions } from 'bullmq'

const globalForRedis = globalThis as unknown as {
  redis: IORedis | undefined
}

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379'

export function getRedis(): IORedis {
  if (!globalForRedis.redis) {
    globalForRedis.redis = new IORedis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    })
  }
  return globalForRedis.redis
}

export function getBullConnection(): ConnectionOptions {
  // BullMQ and the app can resolve different ioredis type copies during
  // production builds; use the shared runtime instance and narrow at the edge.
  return getRedis() as unknown as ConnectionOptions
}

export const redis = new Proxy({} as IORedis, {
  get(_target, prop, receiver) {
    return Reflect.get(getRedis(), prop, receiver)
  },
})

export default redis
