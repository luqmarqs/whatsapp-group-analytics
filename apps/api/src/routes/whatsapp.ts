import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import pool from '../db'
import redis from '../redis'
import { authenticate } from '../middleware/authenticate'
import { instanceScope, canAccessGroup } from '../middleware/instanceScope'

export default async function whatsappRoutes(fastify: FastifyInstance) {
  // ─── Instance status + QR (instância do usuário) ──────────────────────────
  fastify.get('/instance', { preHandler: authenticate }, async (request, reply) => {
    const user = request.user as { id: string; role: string }
    const requestedId = (request.query as { instance_id?: string }).instance_id
    const { rows } = await pool.query(
      `SELECT status, jid, connected_at, name FROM whatsapp_instances
       WHERE (($1 = 'admin' AND ($3::uuid IS NULL OR id = $3::uuid)) OR user_id = $2::uuid)
       ORDER BY created_at LIMIT 1`,
      [user.role, user.id, requestedId ?? null],
    )
    if (!rows[0]) return reply.status(404).send({ error: 'no_instance' })
    const instance = rows[0]
    const qr = instance.status !== 'connected'
      ? await redis.get(`wa:qr:${instance.name}`) ?? await redis.get('wa:qr')
      : null
    return { ...instance, qr }
  })

  // ─── Desconectar WhatsApp (user-initiated logout → limpa sessão → novo QR) ─
  fastify.post('/disconnect', { preHandler: authenticate }, async (request, reply) => {
    const user = request.user as { id: string; role: string }
    const requestedId = (request.query as { instance_id?: string }).instance_id
    const { rows } = await pool.query(
      `SELECT name FROM whatsapp_instances
       WHERE (($1 = 'admin' AND ($3::uuid IS NULL OR id = $3::uuid)) OR user_id = $2::uuid)
       ORDER BY created_at LIMIT 1`,
      [user.role, user.id, requestedId ?? null],
    )
    if (!rows[0]) return reply.status(404).send({ error: 'Nenhuma instância encontrada' })
    await redis.publish(`wa:logout:${rows[0].name}`, 'logout')
    return { ok: true }
  })

  // ─── Overview KPIs ────────────────────────────────────────────────────────
  fastify.get('/overview', { preHandler: authenticate }, async (request, reply) => {
    const now = new Date()
    const scope = await instanceScope(request as any, 1)
    const [overview, msgs24h, links24h, joins7d, leaves7d, uniqueMembers] = await Promise.all([
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
        WHERE TRUE ${scope.clause} AND g.is_monitored = true AND g.is_available = true
      `, scope.values),
      pool.query(`
        SELECT COUNT(*)::int AS count FROM whatsapp_messages m
        JOIN whatsapp_groups g ON g.id = m.group_id
        WHERE m.timestamp >= NOW() - INTERVAL '1 day' ${scope.clause} AND g.is_monitored = true AND g.is_available = true
      `, scope.values),
      pool.query(`
        SELECT COUNT(*)::int AS count FROM whatsapp_links l
        JOIN whatsapp_groups g ON g.id = l.group_id
        WHERE l.last_seen_at >= NOW() - INTERVAL '1 day' ${scope.clause} AND g.is_monitored = true AND g.is_available = true
      `, scope.values),
      pool.query(`
        SELECT COUNT(*)::int AS count FROM whatsapp_group_events e
        JOIN whatsapp_groups g ON g.id = e.group_id
        WHERE e.event_type = 'join' AND e.timestamp >= NOW() - INTERVAL '7 days' ${scope.clause} AND g.is_monitored = true AND g.is_available = true
      `, scope.values),
      pool.query(`
        SELECT COUNT(*)::int AS count FROM whatsapp_group_events e
        JOIN whatsapp_groups g ON g.id = e.group_id
        WHERE e.event_type = 'leave' AND e.timestamp >= NOW() - INTERVAL '7 days' ${scope.clause} AND g.is_monitored = true AND g.is_available = true
      `, scope.values),
      pool.query(`
        SELECT COUNT(DISTINCT m.member_hash)::int AS count
        FROM whatsapp_group_members m
        JOIN whatsapp_groups g ON g.id = m.group_id
        WHERE m.is_active = true ${scope.clause} AND g.is_monitored = true AND g.is_available = true
      `, scope.values),
    ])

    return {
      ...overview.rows[0],
      messages_24h: msgs24h.rows[0].count,
      links_24h: links24h.rows[0].count,
      joins_7d: joins7d.rows[0].count,
      leaves_7d: leaves7d.rows[0].count,
      unique_members: uniqueMembers.rows[0].count,
      generated_at: now.toISOString(),
    }
  })

  // ─── Groups list ──────────────────────────────────────────────────────────
  fastify.get('/groups', { preHandler: authenticate }, async (request, reply) => {
    const { q } = request.query as { q?: string }
    const scope = await instanceScope(request as any, 2)

    // monitored=all → todos; monitored=false → só não monitorados; default → só monitorados
    const monitoredFilter = (request.query as { monitored?: string }).monitored
    const monitoredClause = monitoredFilter === 'all'   ? ''
                          : monitoredFilter === 'false' ? 'AND g.is_monitored = false'
                          :                               'AND g.is_monitored = true'

    const { rows } = await pool.query(`
      SELECT
        g.id,
        g.group_jid,
        g.name,
        g.member_count,
        g.is_monitored,
        g.is_available,
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
        AND g.is_available = true
        ${monitoredClause}
        ${scope.clause}
      GROUP BY g.id
      ORDER BY g.name ASC NULLS LAST
      LIMIT 1000
    `, [q ?? null, ...scope.values])

    return rows
  })

  fastify.get('/monitored-members', { preHandler: authenticate }, async (request, reply) => {
    const scope = await instanceScope(request as any, 1)

    const { rows } = await pool.query(`
      SELECT
        g.id AS group_id,
        g.name AS group_name,
        g.group_jid,
        m.id,
        m.role,
        m.is_active,
        m.joined_at,
        m.left_at,
        c.phone,
        c.name,
        c.raw_jid,
        c.jid_server,
        c.updated_at AS contact_updated_at
      FROM whatsapp_group_members m
      JOIN whatsapp_groups g ON g.id = m.group_id
      LEFT JOIN whatsapp_contacts c
        ON c.instance_id = g.instance_id
       AND c.member_hash = m.member_hash
      WHERE g.is_monitored = true
        AND g.is_available = true
        ${scope.clause}
      ORDER BY g.name ASC NULLS LAST, g.group_jid ASC, m.is_active DESC, c.name ASC NULLS LAST, c.phone ASC NULLS LAST
    `, scope.values)

    return rows
  })

  fastify.get('/polls', { preHandler: authenticate }, async (request, reply) => {
    const query = request.query as { days?: string; group_id?: string }
    const days = Math.min(Math.max(parseInt(query.days ?? '30'), 1), 365)
    const scope = await instanceScope(request as any, 2)
    const values: unknown[] = [days, ...scope.values]
    let groupClause = ''

    if (query.group_id) {
      values.push(query.group_id)
      groupClause = `AND p.group_id = $${values.length}::uuid`
    }

    const { rows } = await pool.query(`
      SELECT
        p.id,
        p.group_id,
        g.name AS group_name,
        g.group_jid,
        p.message_id,
        p.title,
        p.selectable_options_count,
        p.poll_type,
        p.poll_content_type,
        p.created_at_whatsapp,
        p.updated_at,
        COALESCE(voters.total_voters, 0)::int AS total_voters,
        COALESCE(votes.total_votes, 0)::int AS total_votes,
        COALESCE(
          json_agg(
            json_build_object(
              'id', o.id,
              'option_index', o.option_index,
              'option_text', o.option_text,
              'vote_count', o.vote_count
            )
            ORDER BY o.option_index
          ) FILTER (WHERE o.id IS NOT NULL),
          '[]'::json
        ) AS options
      FROM whatsapp_polls p
      JOIN whatsapp_groups g ON g.id = p.group_id
      LEFT JOIN whatsapp_poll_options o ON o.poll_id = p.id
      LEFT JOIN (
        SELECT poll_id, COUNT(*)::int AS total_voters
        FROM whatsapp_poll_updates
        WHERE cardinality(selected_option_hashes) > 0
        GROUP BY poll_id
      ) voters ON voters.poll_id = p.id
      LEFT JOIN (
        SELECT poll_id, COUNT(*)::int AS total_votes
        FROM whatsapp_poll_votes
        GROUP BY poll_id
      ) votes ON votes.poll_id = p.id
      WHERE p.created_at_whatsapp >= NOW() - ($1::int * INTERVAL '1 day')
        AND g.is_monitored = true
        AND g.is_available = true
        ${scope.clause}
        ${groupClause}
      GROUP BY p.id, g.name, g.group_jid, voters.total_voters, votes.total_votes
      ORDER BY p.created_at_whatsapp DESC
      LIMIT 200
    `, values)

    return rows
  })

  fastify.get('/polls/:id/votes', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const scope = await instanceScope(request as any, 2)

    const { rows } = await pool.query(`
      SELECT
        p.id AS poll_id,
        p.title,
        g.name AS group_name,
        g.group_jid,
        o.option_text,
        v.voted_at,
        c.name,
        c.phone,
        c.raw_jid,
        c.jid_server
      FROM whatsapp_poll_votes v
      JOIN whatsapp_polls p ON p.id = v.poll_id
      JOIN whatsapp_groups g ON g.id = p.group_id
      JOIN whatsapp_poll_options o ON o.id = v.option_id
      LEFT JOIN whatsapp_contacts c
        ON c.instance_id = p.instance_id
       AND c.member_hash = v.voter_hash
      WHERE p.id = $1::uuid
        ${scope.clause}
      ORDER BY o.option_index ASC, c.name ASC NULLS LAST, c.phone ASC NULLS LAST
    `, [id, ...scope.values])

    return rows
  })

  // ─── Atualizar is_monitored de um grupo ───────────────────────────────────
  fastify.patch('/groups/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const user = request.user as { id: string; role: string }
    if (!await canAccessGroup(id, user.id, user.role)) {
      return reply.status(404).send({ error: 'Group not found' })
    }
    const { is_monitored } = request.body as { is_monitored: boolean }
    if (typeof is_monitored !== 'boolean') {
      return reply.status(400).send({ error: 'is_monitored must be boolean' })
    }
    await pool.query(
      'UPDATE whatsapp_groups SET is_monitored = $1, updated_at = NOW() WHERE id = $2',
      [is_monitored, id],
    )
    const { rows } = await pool.query(
      'SELECT i.name, g.group_jid FROM whatsapp_instances i JOIN whatsapp_groups g ON g.instance_id = i.id WHERE g.id = $1',
      [id],
    )
    if (rows[0]) {
      await redis.publish(`wa:monitoring:changed:${rows[0].name}`, 'reload')
      // When enabling monitoring, trigger a participant resync so members appear
      // even in announcement groups where nobody sends messages
      if (is_monitored) {
        await redis.publish(`wa:resync:${rows[0].name}`, rows[0].group_jid)
      }
    }
    return { ok: true }
  })

  // ─── Bulk monitor/unmonitor ───────────────────────────────────────────────
  fastify.post('/groups/bulk-monitor', { preHandler: authenticate }, async (request, reply) => {
    const user = request.user as { id: string; role: string }
    const { group_ids, is_monitored } = request.body as { group_ids: string[]; is_monitored: boolean }
    if (!Array.isArray(group_ids) || typeof is_monitored !== 'boolean') {
      return reply.status(400).send({ error: 'group_ids (array) and is_monitored (boolean) required' })
    }
    if (group_ids.length === 0) return { ok: true, updated: 0 }

    // Restrict non-admins to their own instance groups
    const { rows: accessible } = await pool.query(
      user.role === 'admin'
        ? `SELECT g.id, i.name AS instance_name FROM whatsapp_groups g
           JOIN whatsapp_instances i ON i.id = g.instance_id
           WHERE g.id = ANY($1::uuid[])`
        : `SELECT g.id, i.name AS instance_name FROM whatsapp_groups g
           JOIN whatsapp_instances i ON i.id = g.instance_id
           WHERE g.id = ANY($1::uuid[]) AND i.user_id = $2::uuid`,
      user.role === 'admin' ? [group_ids] : [group_ids, user.id],
    )

    const ids = accessible.map((r: any) => r.id)
    if (ids.length === 0) return { ok: true, updated: 0 }

    await pool.query(
      'UPDATE whatsapp_groups SET is_monitored = $1, updated_at = NOW() WHERE id = ANY($2::uuid[])',
      [is_monitored, ids],
    )

    // Notify workers to reload monitoring set
    const instanceNames = [...new Set<string>(accessible.map((r: any) => r.instance_name))]
    await Promise.all(instanceNames.map((n) => redis.publish(`wa:monitoring:changed:${n}`, 'reload')))

    // When enabling monitoring, trigger participant resync for each group
    // so members appear even in announcement groups without messages
    if (is_monitored) {
      const { rows: jids } = await pool.query(
        `SELECT g.group_jid, i.name AS instance_name
         FROM whatsapp_groups g JOIN whatsapp_instances i ON i.id = g.instance_id
         WHERE g.id = ANY($1::uuid[])`,
        [ids],
      )
      await Promise.all(jids.map((r: any) => redis.publish(`wa:resync:${r.instance_name}`, r.group_jid)))
    }

    return { ok: true, updated: ids.length }
  })

  // ─── Group detail ─────────────────────────────────────────────────────────
  fastify.get('/groups/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const user = request.user as { id: string; role: string }
    if (!await canAccessGroup(id, user.id, user.role)) {
      return reply.status(404).send({ error: 'Group not found' })
    }

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
  fastify.get('/groups/:id/members', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const user = request.user as { id: string; role: string }
    if (!await canAccessGroup(id, user.id, user.role)) {
      return reply.status(404).send({ error: 'Group not found' })
    }
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
        c.raw_jid,
        c.jid_server,
        c.updated_at AS contact_updated_at
      FROM whatsapp_group_members m
      JOIN whatsapp_groups g ON g.id = m.group_id
      LEFT JOIN whatsapp_contacts c
        ON c.instance_id = g.instance_id
       AND c.member_hash = m.member_hash
      WHERE m.group_id = $1
        AND ($2::boolean IS NULL OR m.is_active = $2::boolean)
      ORDER BY m.is_active DESC, c.name ASC NULLS LAST
    `, [id, active != null ? active === 'true' : null])

    return rows
  })

  // ─── Member evolution ─────────────────────────────────────────────────────
  fastify.get('/groups/:id/member-evolution', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const user = request.user as { id: string; role: string }
    if (!await canAccessGroup(id, user.id, user.role)) {
      return reply.status(404).send({ error: 'Group not found' })
    }
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
    const scope = await instanceScope(request as any, 2)

    const { rows } = await pool.query(`
      SELECT
        d.date,
        SUM(d.message_count)::int        AS message_count,
        SUM(d.join_count)::int           AS join_count,
        SUM(d.leave_count)::int          AS leave_count,
        SUM(d.net_member_growth)::int    AS net_member_growth,
        SUM(d.unique_senders_count)::int AS unique_senders_count
      FROM whatsapp_daily_group_metrics d
      JOIN whatsapp_groups g ON g.id = d.group_id
      WHERE d.date >= CURRENT_DATE - ($1 || ' days')::interval
        ${scope.clause} AND g.is_monitored = true AND g.is_available = true
      GROUP BY d.date
      ORDER BY d.date ASC
    `, [days, ...scope.values])

    return rows
  })

  // ─── Peak hours (atividade por hora do dia) ───────────────────────────────
  fastify.get('/peak-hours', { preHandler: authenticate }, async (request, _reply) => {
    const days = Math.min(parseInt((request.query as { days?: string }).days ?? '7'), 30)
    const scope = await instanceScope(request as any, 2)

    const { rows } = await pool.query(`
      SELECT
        EXTRACT(HOUR FROM m.timestamp AT TIME ZONE 'UTC')::int AS hour,
        COUNT(*)::int AS message_count
      FROM whatsapp_messages m
      JOIN whatsapp_groups g ON g.id = m.group_id
      WHERE m.timestamp >= NOW() - ($1 || ' days')::interval
        ${scope.clause} AND g.is_monitored = true AND g.is_available = true
      GROUP BY hour
      ORDER BY hour
    `, [days, ...scope.values])

    // Fill in missing hours with 0
    const byHour: Record<number, number> = {}
    for (const r of rows) byHour[r.hour] = r.message_count
    const full = Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      message_count: byHour[h] ?? 0,
    }))
    return full
  })

  // ─── Top groups (para relatório) ──────────────────────────────────────────
  fastify.get('/top-groups', { preHandler: authenticate }, async (request, _reply) => {
    const days = Math.min(parseInt((request.query as { days?: string }).days ?? '30'), 180)
    const scope = await instanceScope(request as any, 2)

    const { rows } = await pool.query(`
      SELECT
        g.id,
        g.name,
        g.group_jid,
        g.member_count,
        COALESCE(SUM(d.message_count), 0)::int        AS messages_period,
        COALESCE(SUM(d.join_count), 0)::int           AS joins_period,
        COALESCE(SUM(d.leave_count), 0)::int          AS leaves_period,
        COALESCE(SUM(d.net_member_growth), 0)::int    AS net_growth_period,
        COALESCE(SUM(d.unique_senders_count), 0)::int AS active_members_period,
        COALESCE(SUM(CASE WHEN d.date >= CURRENT_DATE - 7  THEN d.message_count ELSE 0 END), 0)::int AS messages_7d,
        COALESCE(SUM(CASE WHEN d.date >= CURRENT_DATE - 14 AND d.date < CURRENT_DATE - 7 THEN d.message_count ELSE 0 END), 0)::int AS messages_prev7d,
        CASE WHEN g.member_count > 0
          THEN ROUND((COALESCE(SUM(d.unique_senders_count), 0)::numeric / g.member_count) * 100, 1)
          ELSE 0
        END AS engagement_rate
      FROM whatsapp_groups g
      LEFT JOIN whatsapp_daily_group_metrics d
        ON d.group_id = g.id AND d.date >= CURRENT_DATE - ($1 || ' days')::interval
      WHERE TRUE ${scope.clause} AND g.is_monitored = true AND g.is_available = true
      GROUP BY g.id
      ORDER BY messages_period DESC
      LIMIT 50
    `, [days, ...scope.values])

    return rows
  })

  // ─── Links ────────────────────────────────────────────────────────────────
  fastify.get('/links', { preHandler: authenticate }, async (request, reply) => {
    const { domain, group_id } = request.query as { domain?: string; group_id?: string }
    const scope = await instanceScope(request as any, 3)

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
        ${scope.clause} AND g.is_monitored = true AND g.is_available = true
      ORDER BY l.last_seen_at DESC
      LIMIT 200
    `, [domain ?? null, group_id ?? null, ...scope.values])

    return rows
  })

  // ─── Alerts ───────────────────────────────────────────────────────────────
  fastify.get('/alerts', { preHandler: authenticate }, async (request, reply) => {
    const { unread } = request.query as { unread?: string }
    const scope = await instanceScope(request as any, 2)

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
        ${scope.clause} AND g.is_monitored = true AND g.is_available = true
      ORDER BY a.created_at DESC
      LIMIT 200
    `, [unread === 'true' ? true : null, ...scope.values])

    return rows
  })

  fastify.patch('/alerts/:id/read', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const user = request.user as { id: string; role: string }
    const { rows } = await pool.query(
      `UPDATE whatsapp_alerts a SET is_read = true
       FROM whatsapp_groups g
       JOIN whatsapp_instances i ON i.id = g.instance_id
       WHERE a.id = $1 AND a.group_id = g.id
         AND ($2 = 'admin' OR i.user_id = $3::uuid)
       RETURNING a.id`,
      [id, user.role, user.id],
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
        const user = request.user as { id: string; role: string }
        const { rows: accessibleGroups } = user.role === 'admin'
          ? await client.query(
              `SELECT id FROM whatsapp_groups WHERE id = ANY($1::uuid[])`,
              [group_ids],
            )
          : await client.query(
              `SELECT g.id
               FROM whatsapp_groups g
               JOIN whatsapp_instances i ON i.id = g.instance_id
               WHERE g.id = ANY($1::uuid[]) AND i.user_id = $2::uuid`,
              [group_ids, user.id],
            )
        const accessibleIds = new Set(accessibleGroups.map((g: any) => g.id))
        if (!group_ids.every((gid) => accessibleIds.has(gid))) {
          await client.query('ROLLBACK')
          return reply.status(403).send({ error: 'One or more groups are not accessible' })
        }

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

  fastify.get('/tasks', { preHandler: authenticate }, async (request, reply) => {
    const user = request.user as { id: string; role: string }
    const requestedInstanceId = (request.query as { instance_id?: string }).instance_id

    // For non-admins: only tasks that involve at least one of their groups
    const { rows: tasks } = user.role === 'admin' && requestedInstanceId
      ? await pool.query(`
          SELECT DISTINCT t.*, u.name AS created_by_name
          FROM whatsapp_group_tasks t
          JOIN users u ON u.id = t.created_by
          JOIN whatsapp_group_task_status s ON s.task_id = t.id
          JOIN whatsapp_groups g ON g.id = s.group_id
          WHERE g.instance_id = $1::uuid
          ORDER BY t.created_at DESC LIMIT 200`,
          [requestedInstanceId])
      : user.role === 'admin'
        ? await pool.query(`
          SELECT t.*, u.name AS created_by_name
          FROM whatsapp_group_tasks t
          JOIN users u ON u.id = t.created_by
          ORDER BY t.created_at DESC LIMIT 200`)
        : await pool.query(`
          SELECT DISTINCT t.*, u.name AS created_by_name
          FROM whatsapp_group_tasks t
          JOIN users u ON u.id = t.created_by
          JOIN whatsapp_group_task_status s ON s.task_id = t.id
          JOIN whatsapp_groups g ON g.id = s.group_id
          JOIN whatsapp_instances i ON i.id = g.instance_id
          WHERE i.user_id = $1
          ORDER BY t.created_at DESC LIMIT 200`,
          [user.id])

    const taskIds = tasks.map((t: any) => t.id)
    if (taskIds.length === 0) return []

    // For statuses, also filter to user's accessible groups
    const { rows: statuses } = user.role === 'admin' && requestedInstanceId
      ? await pool.query(`
          SELECT s.*, g.name AS group_name
          FROM whatsapp_group_task_status s
          JOIN whatsapp_groups g ON g.id = s.group_id
          WHERE s.task_id = ANY($1::uuid[]) AND g.instance_id = $2::uuid`,
          [taskIds, requestedInstanceId])
      : user.role === 'admin'
        ? await pool.query(`
          SELECT s.*, g.name AS group_name
          FROM whatsapp_group_task_status s
          JOIN whatsapp_groups g ON g.id = s.group_id
          WHERE s.task_id = ANY($1::uuid[])`,
          [taskIds])
        : await pool.query(`
          SELECT s.*, g.name AS group_name
          FROM whatsapp_group_task_status s
          JOIN whatsapp_groups g ON g.id = s.group_id
          JOIN whatsapp_instances i ON i.id = g.instance_id
          WHERE s.task_id = ANY($1::uuid[]) AND i.user_id = $2`,
          [taskIds, user.id])

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
    const user = request.user as { id: string; role: string }
    const parsed = taskPatchSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid input', details: parsed.error.issues })
    }

    const { status, notes, group_id, title, description, due_date, priority } = parsed.data

    if (group_id) {
      const access = user.role === 'admin'
        ? await pool.query(
            `SELECT s.id
             FROM whatsapp_group_task_status s
             WHERE s.task_id = $1 AND s.group_id = $2`,
            [id, group_id],
          )
        : await pool.query(
            `SELECT s.id
             FROM whatsapp_group_task_status s
             JOIN whatsapp_groups g ON g.id = s.group_id
             JOIN whatsapp_instances i ON i.id = g.instance_id
             WHERE s.task_id = $1 AND s.group_id = $2 AND i.user_id = $3::uuid`,
            [id, group_id, user.id],
          )
      if (!access.rows[0]) return reply.status(404).send({ error: 'Task status not found' })

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

    const taskAccess = user.role === 'admin'
      ? await pool.query('SELECT id FROM whatsapp_group_tasks WHERE id = $1', [id])
      : await pool.query(
          `SELECT DISTINCT t.id
           FROM whatsapp_group_tasks t
           JOIN whatsapp_group_task_status s ON s.task_id = t.id
           JOIN whatsapp_groups g ON g.id = s.group_id
           JOIN whatsapp_instances i ON i.id = g.instance_id
           WHERE t.id = $1 AND t.created_by = $2::uuid AND i.user_id = $2::uuid`,
          [id, user.id],
        )
    if (!taskAccess.rows[0]) return reply.status(404).send({ error: 'Task not found' })

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
