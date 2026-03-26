// BullMQ connection config — pass this directly to Queue/Worker constructors.
// Using a plain URL string avoids ioredis version conflicts between
// the worker's ioredis and BullMQ's bundled ioredis.
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'

export function getRedisConnection() {
  const url = new URL(REDIS_URL)
  return {
    host: url.hostname,
    port: parseInt(url.port || '6379'),
    password: url.password || undefined,
    maxRetriesPerRequest: null as null,  // Required for BullMQ
  }
}

export default getRedisConnection
