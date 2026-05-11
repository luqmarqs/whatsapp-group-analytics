import { WASocket } from '@whiskeysockets/baileys'
import pool from '../db'
import { hashJid, phoneFromJid } from '../utils/hash'
import { isMonitored } from '../utils/monitoring'

async function upsertContact(memberHash: string, phone: string, name?: string | null) {
  await pool.query(
    `INSERT INTO whatsapp_contacts (member_hash, phone, name)
     VALUES ($1, $2, $3)
     ON CONFLICT (member_hash) DO UPDATE SET
       phone      = EXCLUDED.phone,
       name       = COALESCE(EXCLUDED.name, whatsapp_contacts.name),
       updated_at = NOW()`,
    [memberHash, phone, name ?? null],
  )
}

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
  // Always upsert group metadata (needed for selection UI)
  const { rows } = await pool.query(
    `INSERT INTO whatsapp_groups (instance_id, group_jid, name, description, member_count)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (group_jid) DO UPDATE SET
       name         = EXCLUDED.name,
       description  = EXCLUDED.description,
       member_count = EXCLUDED.member_count,
       updated_at   = NOW()
     RETURNING id, is_monitored`,
    [instanceId, jid, meta.subject ?? null, meta.desc ?? null, meta.participants?.length ?? 0],
  )

  const { id: groupId, is_monitored } = rows[0]

  // Only store individual members for monitored groups — no wasted storage
  if (is_monitored && meta.participants && meta.participants.length > 0) {
    for (const p of meta.participants) {
      const memberHash = hashJid(p.id)
      const phone = phoneFromJid(p.id)
      await upsertContact(memberHash, phone, (p as { notify?: string }).notify ?? null)
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
