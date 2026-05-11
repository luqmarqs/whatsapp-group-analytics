import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import pool from '../db'
import redis from '../redis'
import { authenticate } from '../middleware/authenticate'

export default async function whatsappRoutes(fastify: FastifyInstance) {
  // ─── Instance status + QR ─────────────────────────────────────────────────
  fastify.get('/instance', { preHandler: authenticate }, async (_req, _reply) => {
    const { rows } = await pool.query(
      `SELECT status, jid, connected_at FROM whatsapp_instances ORDER BY created_at LIMIT 1`,
    )
    const instance = rows[0] ?? { status: 'disconnected', jid: null, connected_at: null }
    const qr = instance.status !== 'connected' ? await redis.get('wa:qr') : null
    return { ...instance, qr }
  })

  // ─── Overview KPIs ────────────────────────────────────────────────────────
  fastify.get('/overview', { preHandler: authenticate }, async (_req, reply) => {
    const now = new Date()
    const [overview, msgs24h, links24h, joins7d, leaves7d] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(DISTINCT g.id)::int                                           AS total_groups,
          COUNT(DISTINCT CASE WHEN m24.group_id IS NOT NULL THEN g.id END)::int AS active_today,
          COUNT(DISTINCT CASE WHEN m3.group_id IS NULL THEN g.id END)::int    AS silent_3d,
          COUNT(DISTINCT CASE WHEN m7.group_id IS NULL THEN g.id END)::int    AS silent_7d
        FROM whatsapp_groups g
        LEFT JOIN (
          SELECT DISTINCT group_id FROM whatsapp_messages
          WHERE timestamp >= NOW() - INTERVAL '1 day'
        ) m24 ON m24.group_id = g.id
        LEFT JOIN (
          SELECT DISTINCT group_id FROM whatsapp_messages
          WHERE timestamp >= NOW() - INTERVAL '3 days'
        ) m3 ON m3.group_id = g.id
        LEFT JOIN (
          SELECT DISTINCT group_id FROM whatsapp_messages
          WHERE timestamp >= NOW() - INTERVAL '7 days'
        ) m7 ON m7.group_id = g.id
      `),
      pool.query(`
        SELECT COUNT(*)::int AS count FROM whatsapp_messages
        WHERE timestamp >= NOW() - INTERVAL '1 day'
      `),
      pool.query(`
        SELECT COUNT(*)::int AS count FROM whatsapp_links
        WHERE last_seen_at >= NOW() - INTERVAL '1 day'
      `),
      pool.query(`
        SELECT COUNT(*)::int AS count FROM whatsapp_group_events
        WHERE event_type = 'join' AND timestamp >= NOW() - INTERVAL '7 days'
      `),
      pool.query(`
        SELECT COUNT(*)::int AS count FROM whatsapp_group_events
        WHERE event_type = 'leave' AND timestamp >= NOW() - INTERVAL '7 days'
      `),
    ])

    return {
      ...overview.rows[0],
      messages_24h: msgs24h.rows[0].count,
      links_24h: links24h.rows[0].count,
      joins_7d: joins7d.rows[0].count,
      leaves_7d: leaves7d.rows[0].count,
      generated_at: now.toISOString(),
    }
  })

  // ─── Groups list ──────────────────────────────────────────────────────────
  fastify.get('/groups', { preHandler: authenticate }, async (request, reply) => {
    const { q } = request.query as { q?: string }

    const { rows } = await pool.query(`
      SELECT
        g.id,
        g.group_jid,
        g.name,
        g.member_count,
        g.created_at,
        g.updated_at,
        MAX(m.timestamp)                                                         AS last_message_at,
        COUNT(CASE WHEN m.timestamp >= NOW() - INTERVAL '1 day' THEN 1 END)::int AS messages_24h,
        CASE WHEN MAX(m.timestamp) < NOW() - INTERVAL '7 days'
             OR MAX(m.timestamp) IS NULL THEN true ELSE false END                AS silent_7d,
        CASE WHEN MAX(m.timestamp) < NOW() - INTERVAL '3 days'
             OR MAX(m.timestamp) IS NULL THEN true ELSE false END                AS silent_3d
      FROM whatsapp_groups g
      LEFT JOIN whatsapp_messages m ON m.group_id = g.id
      WHERE ($1::text IS NULL OR g.name ILIKE '%' || $1 || '%')
      GROUP BY g.id
      ORDER BY last_message_at DESC NULLS LAST
      LIMIT 500
    `, [q ?? null])

    return rows
  })

  // ─── Group detail ─────────────────────────────────────────────────────────
  fastify.get('/groups/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string }

    const [groupRes, metricsRes, linksRes, alertsRes] = await Promise.all([
      pool.query('SELECT * FROM whatsapp_groups WHERE id = $1', [id]),
      pool.query(`
        SELECT * FROM whatsapp_daily_group_metrics
        WHERE group_id = $1
        ORDER BY date DESC
        LIMIT 30
      `, [id]),
      pool.query(`
        SELECT domain, url_hash, count, first_seen_at, last_seen_at
        FROM whatsapp_links
        WHERE group_id = $1
        ORDER BY count DESC
        LIMIT 20
      `, [id]),
      pool.query(`
        SELECT * FROM whatsapp_alerts
        WHERE group_id = $1
        ORDER BY created_at DESC
        LIMIT 20
      `, [id]),
    ])

    if (!groupRes.rows[0]) return reply.status(404).send({ error: 'Group not found' })

    return {
      group: groupRes.rows[0],
      metrics: metricsRes.rows,
      top_links: linksRes.rows,
      alerts: alertsRes.rows,
    }
  })

  // ─── Group members ────────────────────────────────────────────────────────
  fastify.get('/groups/:id/members', { preHandler: authenticate }, async (request, _reply) => {
    const { id } = request.params as { id: string }
    const { active } = request.query as { active?: string }

    const { rows } = await pool.query(`
      SELECT
        m.id,
        m.role,
        m.is_active,
        m.joined_at,
        m.left_at,
        c.phone,
        c.name,
        c.updated_at AS contact_updated_at
      FROM whatsapp_group_members m
      LEFT JOIN whatsapp_contacts c ON c.member_hash = m.member_hash
      WHERE m.group_id = $1
        AND ($2::boolean IS NULL OR m.is_active = $2::boolean)
      ORDER BY m.is_active DESC, c.name ASC NULLS LAST
      LIMIT 1000
    `, [id, active != null ? active === 'true' : null])

    return rows
  })

  // ─── Member evolution ─────────────────────────────────────────────────────
  fastify.get('/groups/:id/member-evolution', { preHandler: authenticate }, async (request, _reply) => {
    const { id } = request.params as { id: string }
    const days = Math.min(parseInt((request.query as { days?: string }).days ?? '90'), 365)

    // Reconstruct member_count for days without a snapshot using a window sum of
    // net_member_growth from the most recent date backwards, anchored on the
    // current member_count from whatsapp_groups.
    const { rows } = await pool.query(`
      WITH recent AS (
        SELECT date, join_count, leave_count, net_member_growth, member_count_eod
        FROM whatsapp_daily_group_metrics
        WHERE group_id = $1
        ORDER BY date DESC
        LIMIT $2
      )
      SELECT
        date,
        join_count,
        leave_count,
        COALESCE(
          member_count_eod,
          (SELECT member_count FROM whatsapp_groups WHERE id = $1)
            - COALESCE(
                SUM(net_member_growth) OVER (
                  ORDER BY date DESC
                  ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
                ),
                0
              )
        ) AS member_count
      FROM recent
      ORDER BY date ASC
    `, [id, days])

    return rows
  })

  // ─── Global activity (agregado de todos os grupos) ────────────────────────
  fastify.get('/activity', { preHandler: authenticate }, async (request, _reply) => {
    const days = Math.min(parseInt((request.query as { days?: string }).days ?? '30'), 180)

    const { rows } = await pool.query(`
      SELECT
        date,
        SUM(message_count)::int        AS message_count,
        SUM(join_count)::int           AS join_count,
        SUM(leave_count)::int          AS leave_count,
        SUM(net_member_growth)::int    AS net_member_growth,
        SUM(unique_senders_count)::int AS unique_senders_count
      FROM whatsapp_daily_group_metrics
      WHERE date >= CURRENT_DATE - ($1 || ' days')::interval
      GROUP BY date
      ORDER BY date ASC
    `, [days])

    return rows
  })

  // ─── Top groups (para relatório) ──────────────────────────────────────────
  fastify.get('/top-groups', { preHandler: authenticate }, async (request, _reply) => {
    const days = Math.min(parseInt((request.query as { days?: string }).days ?? '30'), 180)

    const { rows } = await pool.query(`
      SELECT
        g.id,
        g.name,
        g.group_jid,
        g.member_count,
        COALESCE(SUM(d.message_count), 0)::int     AS messages_period,
        COALESCE(SUM(d.join_count), 0)::int        AS joins_period,
        COALESCE(SUM(d.leave_count), 0)::int       AS leaves_period,
        COALESCE(SUM(d.net_member_growth), 0)::int AS net_growth_period,
        COALESCE(SUM(d.unique_senders_count), 0)::int AS active_members_period
      FROM whatsapp_groups g
      LEFT JOIN whatsapp_daily_group_metrics d
        ON d.group_id = g.id AND d.date >= CURRENT_DATE - ($1 || ' days')::interval
      GROUP BY g.id
      ORDER BY messages_period DESC
      LIMIT 50
    `, [days])

    return rows
  })

  // ─── Links ────────────────────────────────────────────────────────────────
  fastify.get('/links', { preHandler: authenticate }, async (request, reply) => {
    const { domain, group_id } = request.query as { domain?: string; group_id?: string }

    const { rows } = await pool.query(`
      SELECT
        l.id,
        l.url_hash,
        l.domain,
        l.count,
        l.first_seen_at,
        l.last_seen_at,
        g.id   AS group_id,
        g.name AS group_name
      FROM whatsapp_links l
      JOIN whatsapp_groups g ON g.id = l.group_id
      WHERE ($1::text IS NULL OR l.domain ILIKE '%' || $1 || '%')
        AND ($2::uuid IS NULL OR l.group_id = $2::uuid)
      ORDER BY l.last_seen_at DESC
      LIMIT 200
    `, [domain ?? null, group_id ?? null])

    return rows
  })

  // ─── Alerts ───────────────────────────────────────────────────────────────
  fastify.get('/alerts', { preHandler: authenticate }, async (request, reply) => {
    const { unread } = request.query as { unread?: string }

    const { rows } = await pool.query(`
      SELECT
        a.id,
        a.alert_type,
        a.severity,
        a.message,
        a.metadata,
        a.is_read,
        a.created_at,
        g.id   AS group_id,
        g.name AS group_name
      FROM whatsapp_alerts a
      JOIN whatsapp_groups g ON g.id = a.group_id
      WHERE ($1::boolean IS NULL OR a.is_read = NOT $1::boolean)
      ORDER BY a.created_at DESC
      LIMIT 200
    `, [unread === 'true' ? true : null])

    return rows
  })

  fastify.patch('/alerts/:id/read', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { rows } = await pool.query(
      'UPDATE whatsapp_alerts SET is_read = true WHERE id = $1 RETURNING id',
      [id],
    )
    if (!rows[0]) return reply.status(404).send({ error: 'Alert not found' })
    return { ok: true }
  })

  // ─── Tasks ────────────────────────────────────────────────────────────────
  const taskCreateSchema = z.object({
    title: z.string().min(1).max(500),
    description: z.string().optional(),
    due_date: z.string().optional(),
    priority: z.enum(['low', 'medium', 'high']).default('medium'),
    group_ids: z.array(z.string().uuid()).optional(),
  })

  fastify.post('/tasks', { preHandler: authenticate }, async (request, reply) => {
    const payload = request.user as { id: string }
    const parsed = taskCreateSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid input', details: parsed.error.issues })
    }

    const { title, description, due_date, priority, group_ids } = parsed.data

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const { rows } = await client.query(
        `INSERT INTO whatsapp_group_tasks (title, description, due_date, priority, created_by)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [title, description ?? null, due_date ?? null, priority, payload.id],
      )
      const task = rows[0]

      if (group_ids && group_ids.length > 0) {
        for (const gid of group_ids) {
          await client.query(
            `INSERT INTO whatsapp_group_task_status (task_id, group_id, status)
             VALUES ($1, $2, 'pending') ON CONFLICT DO NOTHING`,
            [task.id, gid],
          )
        }
      }
      await client.query('COMMIT')
      return reply.status(201).send(task)
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  })

  fastify.get('/tasks', { preHandler: authenticate }, async (_req, reply) => {
    const { rows: tasks } = await pool.query(`
      SELECT t.*, u.name AS created_by_name
      FROM whatsapp_group_tasks t
      JOIN users u ON u.id = t.created_by
      ORDER BY t.created_at DESC
      LIMIT 200
    `)

    const taskIds = tasks.map((t) => t.id)
    if (taskIds.length === 0) return []

    const { rows: statuses } = await pool.query(`
      SELECT s.*, g.name AS group_name
      FROM whatsapp_group_task_status s
      JOIN whatsapp_groups g ON g.id = s.group_id
      WHERE s.task_id = ANY($1::uuid[])
    `, [taskIds])

    const statusMap: Record<string, typeof statuses> = {}
    for (const s of statuses) {
      if (!statusMap[s.task_id]) statusMap[s.task_id] = []
      statusMap[s.task_id].push(s)
    }

    return tasks.map((t) => ({ ...t, group_statuses: statusMap[t.id] ?? [] }))
  })

  const taskPatchSchema = z.object({
    title: z.string().min(1).max(500).optional(),
    description: z.string().optional(),
    due_date: z.string().optional(),
    priority: z.enum(['low', 'medium', 'high']).optional(),
    status: z.enum(['pending', 'in_progress', 'done', 'skipped']).optional(),
    notes: z.string().optional(),
    group_id: z.string().uuid().optional(),
  })

  fastify.patch('/tasks/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const parsed = taskPatchSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid input', details: parsed.error.issues })
    }

    const { status, notes, group_id, title, description, due_date, priority } = parsed.data

    if (group_id) {
      const completed_at = status === 'done' ? new Date().toISOString() : null
      const { rows } = await pool.query(
        `UPDATE whatsapp_group_task_status
         SET status = COALESCE($1, status),
             notes  = COALESCE($2, notes),
             completed_at = $3,
             updated_at = NOW()
         WHERE task_id = $4 AND group_id = $5
         RETURNING *`,
        [status ?? null, notes ?? null, completed_at, id, group_id],
      )
      if (!rows[0]) return reply.status(404).send({ error: 'Task status not found' })
      return rows[0]
    }

    const fields: string[] = []
    const values: unknown[] = []
    let idx = 1
    if (title       !== undefined) { fields.push(`title = $${idx++}`);       values.push(title) }
    if (description !== undefined) { fields.push(`description = $${idx++}`); values.push(description) }
    if (due_date    !== undefined) { fields.push(`due_date = $${idx++}`);    values.push(due_date) }
    if (priority    !== undefined) { fields.push(`priority = $${idx++}`);    values.push(priority) }
    if (fields.length === 0) return reply.status(400).send({ error: 'No fields to update' })

    fields.push(`updated_at = NOW()`)
    values.push(id)
    const { rows } = await pool.query(
      `UPDATE whatsapp_group_tasks SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values,
    )
    if (!rows[0]) return reply.status(404).send({ error: 'Task not found' })
    return rows[0]
  })
}
