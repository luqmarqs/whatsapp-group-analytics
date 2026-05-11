import { FastifyInstance } from 'fastify'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import pool from '../db'
import { authenticate } from '../middleware/authenticate'

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export default async function authRoutes(fastify: FastifyInstance) {
  fastify.post('/login', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid input', details: parsed.error.issues })
    }

    const { email, password } = parsed.data
    const { rows } = await pool.query(
      'SELECT id, email, name, role, password_hash FROM users WHERE email = $1',
      [email.toLowerCase()],
    )
    const user = rows[0]

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return reply.status(401).send({ error: 'Invalid credentials' })
    }

    const token = fastify.jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      { expiresIn: '7d' },
    )

    return {
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    }
  })

  fastify.get('/me', { preHandler: authenticate }, async (request, reply) => {
    const payload = request.user as { id: string }
    const { rows } = await pool.query(
      'SELECT id, email, name, role, created_at FROM users WHERE id = $1',
      [payload.id],
    )
    if (!rows[0]) return reply.status(404).send({ error: 'User not found' })
    return rows[0]
  })

  const meUpdateSchema = z.object({
    name: z.string().min(2).optional(),
    current_password: z.string().optional(),
    new_password: z.string().min(8).optional(),
  })

  fastify.patch('/me', { preHandler: authenticate }, async (request, reply) => {
    const payload = request.user as { id: string }
    const parsed = meUpdateSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid input', details: parsed.error.issues })
    }

    const { name, current_password, new_password } = parsed.data

    if (new_password) {
      if (!current_password) {
        return reply.status(400).send({ error: 'current_password required to change password' })
      }
      const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [payload.id])
      if (!rows[0] || !(await bcrypt.compare(current_password, rows[0].password_hash))) {
        return reply.status(401).send({ error: 'Wrong current password' })
      }
      const hash = await bcrypt.hash(new_password, 12)
      await pool.query(
        'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
        [hash, payload.id],
      )
    }

    if (name) {
      await pool.query('UPDATE users SET name = $1, updated_at = NOW() WHERE id = $2', [name, payload.id])
    }

    return { ok: true }
  })
}
