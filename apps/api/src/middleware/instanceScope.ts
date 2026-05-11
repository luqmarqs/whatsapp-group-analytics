import { FastifyRequest } from 'fastify'
import pool from '../db'

/**
 * Returns a SQL fragment and bind values to filter queries by instance.
 * Admin: can filter by any instance_id query param, or see all.
 * Non-admin: automatically restricted to their own instances.
 */
export async function instanceScope(
  request: FastifyRequest,
  currentParamIndex: number,
): Promise<{ clause: string; values: unknown[]; nextIndex: number }> {
  const user = request.user as { id: string; role: string }
  const requestedId = (request.query as { instance_id?: string }).instance_id

  if (user.role === 'admin') {
    if (requestedId) {
      return {
        clause: `AND g.instance_id = $${currentParamIndex}::uuid`,
        values: [requestedId],
        nextIndex: currentParamIndex + 1,
      }
    }
    return { clause: '', values: [], nextIndex: currentParamIndex }
  }

  // Non-admin: restrict to instances owned by this user
  const { rows } = await pool.query(
    'SELECT id FROM whatsapp_instances WHERE user_id = $1',
    [user.id],
  )
  const ids = rows.map((r) => r.id)
  if (ids.length === 0) {
    return { clause: 'AND FALSE', values: [], nextIndex: currentParamIndex }
  }
  const placeholders = ids.map((_, i) => `$${currentParamIndex + i}::uuid`).join(', ')
  return {
    clause: `AND g.instance_id IN (${placeholders})`,
    values: ids,
    nextIndex: currentParamIndex + ids.length,
  }
}
