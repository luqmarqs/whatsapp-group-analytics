import Redis from 'ioredis'

const redis = new Redis(process.env.REDIS_URL as string, {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
})

redis.on('error', (err) => {
  console.error('[redis] connection error', err.message)
})

export default redis
