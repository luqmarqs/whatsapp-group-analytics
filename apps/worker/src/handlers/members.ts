import pool from '../db'
import redis from '../redis'
import { hashJid, phoneFromJid, serverFromJid } from '../utils/hash'
import { isMonitored } from '../utils/monitoring'

async function upsertContact(instanceId: string, memberHash: string, rawJid: string) {
  const phone = phoneFromJid(rawJid)
  await pool.query(
    `INSERT INTO whatsapp_contacts (instance_id, member_hash, phone, raw_jid, jid_server)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (instance_id, member_hash) DO UPDATE SET
       phone      = COALESCE(EXCLUDED.phone, whatsapp_contacts.phone),
       raw_jid    = COALESCE(EXCLUDED.raw_jid, whatsapp_contacts.raw_jid),
       jid_server = COALESCE(EXCLUDED.jid_server, whatsapp_contacts.jid_server),
       updated_at = NOW()`,
    [instanceId, memberHash, phone, rawJid, serverFromJid(rawJid)],
  )
}

export async function handleParticipantUpdate(
  instanceId: string,
  groupJid: string,
  participants: string[],
  action: string,
  actor?: string,
) {
  if (!isMonitored(groupJid)) return  // skip unmonitored — no storage cost

  const { rows } = await pool.query(
    'SELECT id FROM whatsapp_groups WHERE instance_id = $1 AND group_jid = $2',
    [instanceId, groupJid],
  )
  if (!rows[0]) return

  const groupId = rows[0].id
  const timestamp = new Date()
  const actorHash = actor ? hashJid(actor) : null

  const eventType = action === 'add' ? 'join' : action === 'remove' ? 'leave' : action

  for (const participantJid of participants) {
    const memberHash = hashJid(participantJid)
    await upsertContact(instanceId, memberHash, participantJid)

    // Deduplicate via Redis (1h TTL per event)
    const dedupKey = `event:${groupId}:${memberHash}:${eventType}:${Math.floor(Date.now() / 3_600_000)}`
    const already = await redis.set(dedupKey, '1', 'EX', 3600, 'NX')
    if (!already) continue

    // Update member record
    if (action === 'add') {
      await pool.query(
        `INSERT INTO whatsapp_group_members (group_id, member_hash, role, joined_at, is_active)
         VALUES ($1, $2, 'member', $3, true)
         ON CONFLICT (group_id, member_hash) DO UPDATE SET
           is_active  = true,
           joined_at  = EXCLUDED.joined_at,
           left_at    = NULL,
           updated_at = NOW()`,
        [groupId, memberHash, timestamp],
      )
    } else if (action === 'remove') {
      await pool.query(
        `UPDATE whatsapp_group_members
         SET is_active = false, left_at = $1, updated_at = NOW()
         WHERE group_id = $2 AND member_hash = $3`,
        [timestamp, groupId, memberHash],
      )
    } else if (action === 'promote') {
      await pool.query(
        `UPDATE whatsapp_group_members SET role = 'admin', updated_at = NOW()
         WHERE group_id = $1 AND member_hash = $2`,
        [groupId, memberHash],
      )
    } else if (action === 'demote') {
      await pool.query(
        `UPDATE whatsapp_group_members SET role = 'member', updated_at = NOW()
         WHERE group_id = $1 AND member_hash = $2`,
        [groupId, memberHash],
      )
    }

    // Record event
    await pool.query(
      `INSERT INTO whatsapp_group_events (group_id, event_type, member_hash, actor_hash, timestamp)
       VALUES ($1, $2, $3, $4, $5)`,
      [groupId, eventType, memberHash, actorHash, timestamp],
    )
  }

  // Update group member count
  await pool.query(
    `UPDATE whatsapp_groups
     SET member_count = (
       SELECT COUNT(*) FROM whatsapp_group_members
       WHERE group_id = $1 AND is_active = true
     ), updated_at = NOW()
     WHERE id = $1`,
    [groupId],
  )
}
