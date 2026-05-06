import { FastifyInstance } from 'fastify'
import pool from '../db'
import redis from '../redis'

export default async function healthRoutes(fastify: FastifyInstance) {
  fastify.get('/health', async (_req, reply) => {
    try {
      await pool.query('SELECT 1')
      await redis.ping()
      return reply.send({ status: 'ok', db: 'ok', redis: 'ok' })
    } catch (err) {
      return reply.status(503).send({ status: 'error', message: (err as Error).message })
    }
  })
}
