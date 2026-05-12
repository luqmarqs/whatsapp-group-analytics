import { createHash } from 'crypto'
import { proto } from '@whiskeysockets/baileys'
import pool from '../db'
import { hashJid, phoneFromJid, serverFromJid } from '../utils/hash'
import { isMonitored } from '../utils/monitoring'

type WAMessage = proto.IWebMessageInfo
type PollCreation = proto.Message.IPollCreationMessage
type PollUpdate = proto.IPollUpdate

function pollCreation(msg: WAMessage): PollCreation | null {
  const m = msg.message
  return (
    m?.pollCreationMessage ??
    m?.pollCreationMessageV2 ??
    m?.pollCreationMessageV3 ??
    null
  )
}

function optionHash(optionName: string) {
  return createHash('sha256').update(Buffer.from(optionName)).digest('hex')
}

function selectedOptionHash(value: unknown): string | null {
  if (value == null) return null
  if (Buffer.isBuffer(value)) return value.toString('hex')
  if (value instanceof Uint8Array) return Buffer.from(value).toString('hex')
  if (typeof value === 'string') return Buffer.from(value).toString('utf8')
  if (typeof value === 'object' && Array.isArray((value as { data?: unknown }).data)) {
    return Buffer.from((value as { data: number[] }).data).toString('hex')
  }
  return null
}

function timestampFromSeconds(value: unknown) {
  const seconds = typeof value === 'number'
    ? value
    : value && typeof (value as { toNumber?: () => number }).toNumber === 'function'
      ? (value as { toNumber: () => number }).toNumber()
      : Math.floor(Date.now() / 1000)
  return new Date(seconds * 1000)
}

function timestampFromMillis(value: unknown) {
  const millis = typeof value === 'number'
    ? value
    : value && typeof (value as { toNumber?: () => number }).toNumber === 'function'
      ? (value as { toNumber: () => number }).toNumber()
      : Date.now()
  return new Date(millis)
}

async function upsertContact(instanceId: string, jid: string | null | undefined, name?: string | null) {
  if (!jid) return
  await pool.query(
    `INSERT INTO whatsapp_contacts (instance_id, member_hash, phone, name, raw_jid, jid_server)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (instance_id, member_hash) DO UPDATE SET
       phone      = COALESCE(EXCLUDED.phone, whatsapp_contacts.phone),
       name       = COALESCE(EXCLUDED.name, whatsapp_contacts.name),
       raw_jid    = COALESCE(EXCLUDED.raw_jid, whatsapp_contacts.raw_jid),
       jid_server = COALESCE(EXCLUDED.jid_server, whatsapp_contacts.jid_server),
       updated_at = NOW()`,
    [instanceId, hashJid(jid), phoneFromJid(jid), name ?? null, jid, serverFromJid(jid)],
  )
}

async function groupIdFor(instanceId: string, groupJid: string) {
  const { rows } = await pool.query(
    'SELECT id FROM whatsapp_groups WHERE instance_id = $1 AND group_jid = $2',
    [instanceId, groupJid],
  )
  return rows[0]?.id as string | undefined
}

export async function handlePollCreation(msg: WAMessage, groupJid: string, instanceId: string) {
  if (!isMonitored(groupJid)) return
  const creation = pollCreation(msg)
  const messageId = msg.key.id
  if (!creation || !messageId) return

  const groupId = await groupIdFor(instanceId, groupJid)
  if (!groupId) return

  const creatorJid = msg.key.participant ?? msg.participant ?? null
  if (creatorJid) await upsertContact(instanceId, creatorJid, msg.pushName ?? null).catch(() => {})

  const title = creation.name?.trim() || 'Enquete sem titulo'
  const createdAt = timestampFromSeconds(msg.messageTimestamp)
  const pollType = creation.pollType != null ? String(creation.pollType) : null
  const pollContentType = creation.pollContentType != null ? String(creation.pollContentType) : null
  const options = creation.options ?? []

  const { rows } = await pool.query(
    `INSERT INTO whatsapp_polls
       (instance_id, group_id, message_id, creator_hash, title, selectable_options_count,
        poll_type, poll_content_type, created_at_whatsapp, raw_payload)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (instance_id, group_id, message_id) DO UPDATE SET
       title                    = EXCLUDED.title,
       selectable_options_count = EXCLUDED.selectable_options_count,
       poll_type                = EXCLUDED.poll_type,
       poll_content_type        = EXCLUDED.poll_content_type,
       raw_payload              = EXCLUDED.raw_payload,
       updated_at               = NOW()
     RETURNING id`,
    [
      instanceId,
      groupId,
      messageId,
      creatorJid ? hashJid(creatorJid) : null,
      title,
      creation.selectableOptionsCount ?? null,
      pollType,
      pollContentType,
      createdAt,
      JSON.stringify({
        key: msg.key,
        title,
        selectableOptionsCount: creation.selectableOptionsCount ?? null,
        options: options.map((option, index) => ({
          index,
          optionName: option.optionName ?? '',
          optionHash: option.optionHash ?? null,
        })),
      }),
    ],
  )

  const pollId = rows[0].id as string
  for (const [index, option] of options.entries()) {
    const text = option.optionName ?? ''
    await pool.query(
      `INSERT INTO whatsapp_poll_options (poll_id, option_index, option_text, option_hash)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (poll_id, option_index) DO UPDATE SET
         option_text = EXCLUDED.option_text,
         option_hash = EXCLUDED.option_hash,
         updated_at  = NOW()`,
      [pollId, index, text, optionHash(text)],
    )
  }

  console.log(`[poll] captured poll "${title}" with ${options.length} option(s)`)
}

export async function handlePollUpdates(
  pollKey: proto.IMessageKey,
  updates: PollUpdate[] | null | undefined,
  instanceId: string,
) {
  if (!updates?.length || !pollKey.remoteJid || !pollKey.id) return
  const groupJid = pollKey.remoteJid
  if (!isMonitored(groupJid)) return

  const groupId = await groupIdFor(instanceId, groupJid)
  if (!groupId) return

  const { rows } = await pool.query(
    `SELECT id FROM whatsapp_polls
     WHERE instance_id = $1 AND group_id = $2 AND message_id = $3`,
    [instanceId, groupId, pollKey.id],
  )
  const pollId = rows[0]?.id as string | undefined
  if (!pollId) {
    console.log(`[poll] update skipped - creation not found (${pollKey.id})`)
    return
  }

  for (const update of updates) {
    const updateKey = update.pollUpdateMessageKey
    const voterJid = updateKey?.participant ?? updateKey?.remoteJid
    if (!voterJid) continue

    await upsertContact(instanceId, voterJid).catch(() => {})
    const voterHash = hashJid(voterJid)
    const selectedHashes = (update.vote?.selectedOptions ?? [])
      .map(selectedOptionHash)
      .filter((hash): hash is string => Boolean(hash))
    const votedAt = timestampFromMillis(update.senderTimestampMs)

    await pool.query(
      `INSERT INTO whatsapp_poll_updates
         (poll_id, update_message_id, voter_hash, selected_option_hashes, voted_at, raw_payload)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (poll_id, voter_hash) DO UPDATE SET
         update_message_id      = EXCLUDED.update_message_id,
         selected_option_hashes = EXCLUDED.selected_option_hashes,
         voted_at               = EXCLUDED.voted_at,
         raw_payload            = EXCLUDED.raw_payload,
         updated_at             = NOW()`,
      [
        pollId,
        updateKey?.id ?? null,
        voterHash,
        selectedHashes,
        votedAt,
        JSON.stringify({
          key: updateKey,
          selectedOptionHashes: selectedHashes,
          senderTimestampMs: update.senderTimestampMs?.toString(),
        }),
      ],
    )
  }

  await rebuildPollResults(pollId)
}

async function rebuildPollResults(pollId: string) {
  await pool.query('DELETE FROM whatsapp_poll_votes WHERE poll_id = $1', [pollId])

  await pool.query(
    `INSERT INTO whatsapp_poll_votes (poll_id, option_id, voter_hash, voted_at)
     SELECT u.poll_id, o.id, u.voter_hash, u.voted_at
     FROM whatsapp_poll_updates u
     JOIN whatsapp_poll_options o
       ON o.poll_id = u.poll_id
      AND o.option_hash = ANY(u.selected_option_hashes)
     WHERE u.poll_id = $1
     ON CONFLICT (poll_id, option_id, voter_hash) DO NOTHING`,
    [pollId],
  )

  await pool.query(
    `UPDATE whatsapp_poll_options o
     SET vote_count = counts.vote_count,
         updated_at = NOW()
     FROM (
       SELECT o2.id, COUNT(v.id)::int AS vote_count
       FROM whatsapp_poll_options o2
       LEFT JOIN whatsapp_poll_votes v ON v.option_id = o2.id
       WHERE o2.poll_id = $1
       GROUP BY o2.id
     ) counts
     WHERE o.id = counts.id`,
    [pollId],
  )

  await pool.query('UPDATE whatsapp_polls SET updated_at = NOW() WHERE id = $1', [pollId])
}
