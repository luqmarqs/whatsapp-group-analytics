import { WASocket } from '@whiskeysockets/baileys'
import pool from '../db'
import { hashJid } from '../utils/hash'

export async function syncGroups(sock: WASocket, instanceId: string) {
  console.log('[groups] syncing all participating groups…')

  let groups: Record<string, import('@whiskeysockets/baileys').GroupMetadata>

  try {
    groups = await sock.groupFetchAllParticipating()
  } catch (err) {
    console.error('[groups] failed to fetch groups', err)
    return
  }

  for (const [jid, meta] of Object.entries(groups)) {
    await upsertGroup(jid, meta, instanceId)
  }

  console.log(`[groups] synced ${Object.keys(groups).length} groups`)
}

export async function upsertGroup(
  jid: string,
  meta: import('@whiskeysockets/baileys').GroupMetadata,
  instanceId: string,
) {
  const { rows } = await pool.query(
    `INSERT INTO whatsapp_groups (instance_id, group_jid, name, description, member_count)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (group_jid) DO UPDATE SET
       name         = EXCLUDED.name,
       description  = EXCLUDED.description,
       member_count = EXCLUDED.member_count,
       updated_at   = NOW()
     RETURNING id`,
    [instanceId, jid, meta.subject ?? null, meta.desc ?? null, meta.participants?.length ?? 0],
  )

  const groupId = rows[0].id

  // Upsert participants
  if (meta.participants && meta.participants.length > 0) {
    for (const p of meta.participants) {
      const memberHash = hashJid(p.id)
      await pool.query(
        `INSERT INTO whatsapp_group_members (group_id, member_hash, role, is_active)
         VALUES ($1, $2, $3, true)
         ON CONFLICT (group_id, member_hash) DO UPDATE SET
           role      = EXCLUDED.role,
           is_active = true,
           updated_at = NOW()`,
        [groupId, memberHash, p.admin ?? 'member'],
      )
    }
  }

  return groupId
}
