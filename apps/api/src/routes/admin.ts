import { FastifyInstance } from 'fastify'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import pool from '../db'

const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2),
  password: z.string().min(8),
})

export default async function adminRoutes(fastify: FastifyInstance) {
  fastify.post('/create-first-user', async (request, reply) => {
    const token = (request.headers['x-admin-token'] as string) || ''
    const expected = process.env.FIRST_ADMIN_TOKEN

    if (!expected || token !== expected) {
      return reply.status(403).send({ error: 'Forbidden' })
    }

    const { rows: existing } = await pool.query('SELECT id FROM users LIMIT 1')
    if (existing.length > 0) {
      return reply.status(409).send({ error: 'Admin user already exists. Use the login endpoint.' })
    }

    const parsed = createUserSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid input', details: parsed.error.issues })
    }

    const { email, name, password } = parsed.data
    const password_hash = await bcrypt.hash(password, 12)

    const { rows } = await pool.query(
      `INSERT INTO users (email, name, password_hash, role)
       VALUES ($1, $2, $3, 'admin')
       RETURNING id, email, name, role`,
      [email.toLowerCase(), name, password_hash],
    )

    return reply.status(201).send(rows[0])
  })
}
