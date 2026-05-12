import { WASocket } from '@whiskeysockets/baileys'
import pool from '../db'
import { hashJid, phoneFromJid, serverFromJid } from '../utils/hash'

async function upsertContact(instanceId: string, memberHash: string, rawJid: string, name?: string | null) {
  const phone = phoneFromJid(rawJid)
  await pool.query(
    `INSERT INTO whatsapp_contacts (instance_id, member_hash, phone, name, raw_jid, jid_server)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (instance_id, member_hash) DO UPDATE SET
       phone      = COALESCE(EXCLUDED.phone, whatsapp_contacts.phone),
       name       = COALESCE(EXCLUDED.name, whatsapp_contacts.name),
       raw_jid    = COALESCE(EXCLUDED.raw_jid, whatsapp_contacts.raw_jid),
       jid_server = COALESCE(EXCLUDED.jid_server, whatsapp_contacts.jid_server),
       updated_at = NOW()`,
    [instanceId, memberHash, phone, name ?? null, rawJid, serverFromJid(rawJid)],
  )
}

async function upsertContactAlias(
  instanceId: string,
  aliasJid: string | null | undefined,
  contactJid: string,
) {
  if (!aliasJid || aliasJid === contactJid) return

  await pool.query(
    `INSERT INTO whatsapp_contact_aliases (instance_id, alias_hash, contact_hash, raw_jid, jid_server)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (instance_id, alias_hash) DO UPDATE SET
       contact_hash = EXCLUDED.contact_hash,
       raw_jid      = COALESCE(EXCLUDED.raw_jid, whatsapp_contact_aliases.raw_jid),
       jid_server   = COALESCE(EXCLUDED.jid_server, whatsapp_contact_aliases.jid_server),
       updated_at   = NOW()`,
    [instanceId, hashJid(aliasJid), hashJid(contactJid), aliasJid, serverFromJid(aliasJid)],
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

  await pool.query(
    `UPDATE whatsapp_groups
     SET is_available = false, updated_at = NOW()
     WHERE instance_id = $1`,
    [instanceId],
  )

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
    `INSERT INTO whatsapp_groups (instance_id, group_jid, name, description, member_count, is_available, last_seen_at)
     VALUES ($1, $2, $3, $4, $5, true, NOW())
     ON CONFLICT (instance_id, group_jid) DO UPDATE SET
       name         = EXCLUDED.name,
       description  = EXCLUDED.description,
       member_count = EXCLUDED.member_count,
       is_available = true,
       last_seen_at = NOW(),
       updated_at   = NOW()
     RETURNING id, is_monitored`,
    [instanceId, jid, meta.subject ?? null, meta.desc ?? null, meta.participants?.length ?? 0],
  )

  const { id: groupId, is_monitored } = rows[0]

  // Only store individual members for monitored groups — no wasted storage
  if (is_monitored && meta.participants && meta.participants.length > 0) {
    const activeMemberHashes: string[] = []
    let contactsWithPhone = 0
    let contactsWithoutPhone = 0

    for (const p of meta.participants) {
      // Em comunidades (grupos de aviso), o WhatsApp oculta o número na propriedade 'id' (LID).
      // Mas se o bot for admin, o Baileys costuma disponibilizar o número real na propriedade 'jid'.
      const actualJid = (p as any).jid || p.id
      const memberHash = hashJid(actualJid)
      activeMemberHashes.push(memberHash)

      const phone = phoneFromJid(actualJid)
      if (phone) contactsWithPhone += 1
      else contactsWithoutPhone += 1
      await upsertContact(instanceId, memberHash, actualJid, (p as { notify?: string }).notify ?? null)
      await upsertContactAlias(instanceId, p.id, actualJid)
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

    await pool.query(
      `UPDATE whatsapp_group_members
       SET is_active = false, left_at = COALESCE(left_at, NOW()), updated_at = NOW()
       WHERE group_id = $1
         AND NOT (member_hash = ANY($2::text[]))`,
      [groupId, activeMemberHashes],
    )

    if (contactsWithoutPhone > 0) {
      console.log(
        `[groups] ${jid}: ${contactsWithPhone}/${meta.participants.length} participant phone(s) resolved; ` +
        `${contactsWithoutPhone} participant(s) came without @s.whatsapp.net`,
      )
    }
  }

  return groupId
}
