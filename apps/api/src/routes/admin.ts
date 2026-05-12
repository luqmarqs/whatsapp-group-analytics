import { FastifyInstance } from 'fastify'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import pool from '../db'
import redis from '../redis'
import { authenticate } from '../middleware/authenticate'
import {
  docker,
  ensureWorkerContainer,
  getWorkerContainerStatus,
  isManagedWorkerContainer,
  removeWorkerContainer,
} from '../services/workerContainers'

function requireAdmin(request: any, reply: any) {
  const user = request.user as { role: string }
  if (user.role !== 'admin') {
    reply.status(403).send({ error: 'Admin only' })
    return false
  }
  return true
}

async function getContainerStatus(containerName: string): Promise<'running' | 'stopped' | 'missing'> {
  return getWorkerContainerStatus(containerName)
}

function assertManagedContainer(containerName: string, reply: any) {
  if (isManagedWorkerContainer(containerName)) return true
  reply.status(400).send({ error: 'Container is not managed by this app' })
  return false
}

export default async function adminRoutes(fastify: FastifyInstance) {
  // ─── Bootstrap: criar primeiro admin ─────────────────────────────────────
  fastify.post('/create-first-user', async (request, reply) => {
    const token = (request.headers['x-admin-token'] as string) || ''
    const expected = process.env.FIRST_ADMIN_TOKEN
    if (!expected || token !== expected) return reply.status(403).send({ error: 'Forbidden' })

    const { rows: existing } = await pool.query('SELECT id FROM users LIMIT 1')
    if (existing.length > 0) return reply.status(409).send({ error: 'Admin user already exists. Use the login endpoint.' })

    const parsed = z.object({
      email: z.string().email(), name: z.string().min(2), password: z.string().min(8),
    }).safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid input', details: parsed.error.issues })

    const { email, name, password } = parsed.data
    const password_hash = await bcrypt.hash(password, 12)
    const { rows } = await pool.query(
      `INSERT INTO users (email, name, password_hash, role) VALUES ($1,$2,$3,'admin') RETURNING id, email, name, role`,
      [email.toLowerCase(), name, password_hash],
    )
    return reply.status(201).send(rows[0])
  })

  // ─── Trigger cron ─────────────────────────────────────────────────────────
  fastify.post('/run-jobs', { preHandler: authenticate }, async (request, reply) => {
    if (!requireAdmin(request, reply)) return
    const requestedInstanceId = (request.query as { instance_id?: string }).instance_id
    if (requestedInstanceId) {
      const { rows } = await pool.query('SELECT name FROM whatsapp_instances WHERE id = $1', [requestedInstanceId])
      if (!rows[0]) return reply.status(404).send({ error: 'Instância não encontrada' })
      await redis.publish(`wa:jobs:${rows[0].name}`, 'run')
    } else {
      await redis.publish('wa:jobs', 'run')
    }
    return { ok: true, message: 'Jobs triggered — resultados disponíveis em instantes.' }
  })

  // ─── Users CRUD ───────────────────────────────────────────────────────────
  fastify.get('/users', { preHandler: authenticate }, async (request, reply) => {
    if (!requireAdmin(request, reply)) return
    const { rows } = await pool.query(
      `SELECT id, email, name, role, created_at, updated_at FROM users ORDER BY created_at`,
    )
    return rows
  })

  fastify.post('/users', { preHandler: authenticate }, async (request, reply) => {
    if (!requireAdmin(request, reply)) return
    const parsed = z.object({
      email: z.string().email(), name: z.string().min(2),
      password: z.string().min(8), role: z.enum(['admin', 'viewer']).default('viewer'),
    }).safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid input', details: parsed.error.issues })

    const { email, name, password, role } = parsed.data
    const password_hash = await bcrypt.hash(password, 12)
    try {
      const { rows } = await pool.query(
        `INSERT INTO users (email, name, password_hash, role) VALUES ($1,$2,$3,$4) RETURNING id, email, name, role, created_at`,
        [email.toLowerCase(), name, password_hash, role],
      )
      return reply.status(201).send(rows[0])
    } catch (e: any) {
      if (e.code === '23505') return reply.status(409).send({ error: 'E-mail já cadastrado' })
      throw e
    }
  })

  fastify.patch('/users/:id', { preHandler: authenticate }, async (request, reply) => {
    if (!requireAdmin(request, reply)) return
    const { id } = request.params as { id: string }
    const parsed = z.object({
      name: z.string().min(2).optional(),
      role: z.enum(['admin', 'viewer']).optional(),
      password: z.string().min(8).optional(),
    }).safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid input' })

    const { name, role, password } = parsed.data
    const fields: string[] = []
    const values: unknown[] = []
    let i = 1
    if (name)     { fields.push(`name = $${i++}`);          values.push(name) }
    if (role)     { fields.push(`role = $${i++}`);          values.push(role) }
    if (password) { fields.push(`password_hash = $${i++}`); values.push(await bcrypt.hash(password, 12)) }
    if (fields.length === 0) return reply.status(400).send({ error: 'Nothing to update' })

    fields.push(`updated_at = NOW()`)
    values.push(id)
    await pool.query(`UPDATE users SET ${fields.join(', ')} WHERE id = $${i}`, values)
    return { ok: true }
  })

  fastify.delete('/users/:id', { preHandler: authenticate }, async (request, reply) => {
    if (!requireAdmin(request, reply)) return
    const { id } = request.params as { id: string }
    const me = request.user as { id: string }
    if (id === me.id) return reply.status(400).send({ error: 'Não é possível remover sua própria conta' })
    await pool.query('DELETE FROM users WHERE id = $1', [id])
    return { ok: true }
  })

  // ─── Instances CRUD + Docker ───────────────────────────────────────────────
  fastify.get('/instances', { preHandler: authenticate }, async (request, reply) => {
    if (!requireAdmin(request, reply)) return
    const { rows } = await pool.query(
      `SELECT i.*, u.name AS user_name, u.email AS user_email
       FROM whatsapp_instances i
       LEFT JOIN users u ON u.id = i.user_id
       ORDER BY i.created_at`,
    )
    const result = await Promise.all(rows.map(async (r) => ({
      ...r,
      container_status: r.container_name ? await getContainerStatus(r.container_name) : 'managed_externally',
    })))
    return result
  })

  fastify.post('/instances', { preHandler: authenticate }, async (request, reply) => {
    if (!requireAdmin(request, reply)) return
    const me = request.user as { id: string }
    const parsed = z.object({
      name: z.string().min(2).max(30).regex(/^[a-z0-9-]+$/, 'Apenas letras minúsculas, números e hífens'),
      user_id: z.string().uuid().optional(),
    }).safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid input', details: parsed.error.issues })

    const { name, user_id } = parsed.data
    const ownerId = user_id ?? me.id
    const containerName = `wga-worker-${name}`
    if (!isManagedWorkerContainer(containerName)) {
      return reply.status(400).send({ error: 'Nome de instância inválido' })
    }

    const { rows: owner } = await pool.query('SELECT id FROM users WHERE id = $1', [ownerId])
    if (!owner[0]) return reply.status(400).send({ error: 'Usuário da instância não encontrado' })

    // Check name uniqueness
    const { rows: existing } = await pool.query('SELECT id FROM whatsapp_instances WHERE name = $1', [name])
    if (existing.length > 0) return reply.status(409).send({ error: 'Nome de instância já existe' })

    // Register in DB
    const { rows } = await pool.query(
      `INSERT INTO whatsapp_instances (name, status, user_id, container_name, is_running)
       VALUES ($1, 'disconnected', $2, $3, false) RETURNING id`,
      [name, ownerId, containerName],
    )
    const instanceId = rows[0].id

    try {
      await ensureWorkerContainer({ id: instanceId, name, container_name: containerName, is_running: false }, true)
    } catch (e: any) {
      await pool.query('DELETE FROM whatsapp_instances WHERE id = $1', [instanceId])
      return reply.status(500).send({ error: `Falha ao iniciar container: ${e.message}` })
    }

    return reply.status(201).send({ id: instanceId, name, container_name: containerName })
  })

  fastify.post('/instances/:id/stop', { preHandler: authenticate }, async (request, reply) => {
    if (!requireAdmin(request, reply)) return
    const { id } = request.params as { id: string }
    const { rows } = await pool.query('SELECT container_name FROM whatsapp_instances WHERE id = $1', [id])
    const containerName = rows[0]?.container_name
    if (!containerName) return reply.status(404).send({ error: 'Instância não encontrada' })
    if (!assertManagedContainer(containerName, reply)) return
    if (!rows[0]?.container_name) return reply.status(404).send({ error: 'Instância não encontrada' })

    try {
      const container = docker.getContainer(containerName)
      await container.stop()
      await pool.query('UPDATE whatsapp_instances SET is_running = false, status = $1 WHERE id = $2', ['disconnected', id])
    } catch (e: any) {
      return reply.status(500).send({ error: e.message })
    }
    return { ok: true }
  })

  fastify.post('/instances/:id/start', { preHandler: authenticate }, async (request, reply) => {
    if (!requireAdmin(request, reply)) return
    const { id } = request.params as { id: string }
    const { rows } = await pool.query('SELECT container_name FROM whatsapp_instances WHERE id = $1', [id])
    const containerName = rows[0]?.container_name
    if (!containerName) return reply.status(404).send({ error: 'Instância não encontrada' })
    if (!assertManagedContainer(containerName, reply)) return
    if (!rows[0]?.container_name) return reply.status(404).send({ error: 'Instância não encontrada' })

    try {
      await ensureWorkerContainer({ id, name: containerName.replace(/^wga-worker-/, ''), container_name: containerName, is_running: true }, true)
      await pool.query('UPDATE whatsapp_instances SET is_running = true WHERE id = $1', [id])
    } catch (e: any) {
      return reply.status(500).send({ error: e.message })
    }
    return { ok: true }
  })

  fastify.delete('/instances/:id', { preHandler: authenticate }, async (request, reply) => {
    if (!requireAdmin(request, reply)) return
    const { id } = request.params as { id: string }
    const { rows } = await pool.query('SELECT container_name FROM whatsapp_instances WHERE id = $1', [id])
    const containerName = rows[0]?.container_name
    if (!containerName) return reply.status(404).send({ error: 'Instância não encontrada' })
    if (!assertManagedContainer(containerName, reply)) return
    if (!rows[0]) return reply.status(404).send({ error: 'Instância não encontrada' })

    if (rows[0].container_name) await removeWorkerContainer(rows[0].container_name).catch(() => {})
    await pool.query('DELETE FROM whatsapp_instances WHERE id = $1', [id])
    return { ok: true }
  })

  // QR code por instância
  fastify.get('/instances/:id/qr', { preHandler: authenticate }, async (request, reply) => {
    if (!requireAdmin(request, reply)) return
    const { id } = request.params as { id: string }
    const { rows } = await pool.query('SELECT name, status FROM whatsapp_instances WHERE id = $1', [id])
    if (!rows[0]) return reply.status(404).send({ error: 'Instância não encontrada' })

    const qr = rows[0].status !== 'connected' ? await redis.get(`wa:qr:${rows[0].name}`) : null
    return { status: rows[0].status, qr }
  })
}
