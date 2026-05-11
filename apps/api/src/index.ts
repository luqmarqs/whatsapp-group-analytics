import 'dotenv/config'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import jwt from '@fastify/jwt'
import pool from './db'
import redis from './redis'
import healthRoutes from './routes/health'
import authRoutes from './routes/auth'
import adminRoutes from './routes/admin'
import whatsappRoutes from './routes/whatsapp'

const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? 'info',
    transport:
      process.env.NODE_ENV !== 'production'
        ? { target: 'pino-pretty' }
        : undefined,
  },
})

function getAllowedOrigins(): string | string[] | boolean {
  const domain = process.env.DOMAIN
  if (!domain) return true
  return [
    `https://${domain}`,
    `http://${domain}`,
    'http://localhost:5173', // Vite dev server
    'http://localhost:3000',
  ]
}

async function main() {
  await fastify.register(cors, {
    origin: getAllowedOrigins(),
    credentials: true,
  })

  await fastify.register(rateLimit, {
    global: false, // only apply where explicitly set
    max: 10,
    timeWindow: '1 minute',
  })

  await fastify.register(jwt, {
    secret: process.env.JWT_SECRET as string,
  })

  fastify.register(healthRoutes)
  fastify.register(authRoutes, { prefix: '/auth' })
  fastify.register(adminRoutes, { prefix: '/admin' })
  fastify.register(whatsappRoutes, { prefix: '/whatsapp' })

  const port = parseInt(process.env.PORT ?? '3001')
  await fastify.listen({ port, host: '0.0.0.0' })
}

process.on('SIGTERM', async () => {
  await fastify.close()
  await pool.end()
  await redis.quit()
  process.exit(0)
})

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
