import Redis from 'ioredis'

// REDIS_URL may contain unencoded special chars in the password (e.g. / + =)
// which break URL parsers. Extract components via regex instead.
function parseRedisUrl(url: string) {
  const m = url.match(/^redis:\/\/:(.+)@([^@:]+):(\d+)/)
  if (!m) throw new Error(`Cannot parse REDIS_URL: ${url}`)
  return { password: m[1], host: m[2], port: Number(m[3]) }
}

const { host, port, password } = parseRedisUrl(process.env.REDIS_URL as string)

const redis = new Redis({ host, port, password, maxRetriesPerRequest: 3, lazyConnect: true })

redis.on('error', (err) => {
  console.error('[redis] error', err.message)
})

export default redis
