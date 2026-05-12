import { proto } from '@whiskeysockets/baileys'
import pool from '../db'
import redis from '../redis'
import { hashJid, phoneFromJid, serverFromJid } from '../utils/hash'
import { extractLinks } from '../utils/links'
import { isMonitored } from '../utils/monitoring'

const STORE_BODY = process.env.STORE_MESSAGE_BODY === 'true'

type WAMessage = proto.IWebMessageInfo

function getMessageText(msg: WAMessage): string | null {
  const m = msg.message
  if (!m) return null

  return (
    m.conversation ??
    m.extendedTextMessage?.text ??
    m.imageMessage?.caption ??
    m.videoMessage?.caption ??
    m.documentMessage?.caption ??
    null
  )
}

function getMessageType(msg: WAMessage): string {
  const m = msg.message
  if (!m) return 'unknown'
  const keys = Object.keys(m).filter((k) => k !== 'messageContextInfo')
  return keys[0] ?? 'unknown'
}

function hasMedia(msg: WAMessage): boolean {
  const m = msg.message
  if (!m) return false
  return !!(
    m.imageMessage ||
    m.videoMessage ||
    m.audioMessage ||
    m.documentMessage ||
    m.stickerMessage
  )
}

function approximateSize(msg: WAMessage): number | null {
  const m = msg.message
  if (!m) return null
  const len =
    m.imageMessage?.fileLength ??
    m.videoMessage?.fileLength ??
    m.audioMessage?.fileLength ??
    m.documentMessage?.fileLength ??
    null
  return len != null ? Number(len) : null
}

export async function handleMessage(msg: WAMessage, groupJid: string, instanceId: string) {
  if (!isMonitored(groupJid)) return  // skip unmonitored groups — no DB/storage cost

  const messageId = msg.key.id
  if (!messageId) return

  // Redis deduplication — prevents duplicate saves on reconnect
  const dedupKey = `msg:${instanceId}:${groupJid}:${messageId}`
  const fresh = await redis.set(dedupKey, '1', 'EX', 86_400, 'NX')
  if (!fresh) return

  const { rows } = await pool.query(
    'SELECT id FROM whatsapp_groups WHERE instance_id = $1 AND group_jid = $2',
    [instanceId, groupJid],
  )
  if (!rows[0]) return

  const groupId = rows[0].id
  const senderJid = msg.key.participant ?? msg.participant ?? ''
  const senderHash = hashJid(senderJid)
  const timestamp = new Date((msg.messageTimestamp as number) * 1000)

  // Update contact with phone and latest pushName (non-blocking, only for real user JIDs)
  const senderPhone = phoneFromJid(senderJid)
  if (senderJid) {
    pool.query(
      `INSERT INTO whatsapp_contacts (instance_id, member_hash, phone, name, raw_jid, jid_server)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (instance_id, member_hash) DO UPDATE SET
         phone      = COALESCE(EXCLUDED.phone, whatsapp_contacts.phone),
         name       = COALESCE(EXCLUDED.name, whatsapp_contacts.name),
         raw_jid    = COALESCE(EXCLUDED.raw_jid, whatsapp_contacts.raw_jid),
         jid_server = COALESCE(EXCLUDED.jid_server, whatsapp_contacts.jid_server),
         updated_at = NOW()`,
      [instanceId, senderHash, senderPhone, msg.pushName ?? null, senderJid, serverFromJid(senderJid)],
    ).catch(() => { /* non-critical */ })
  }
  const msgType = getMessageType(msg)
  const media = hasMedia(msg)
  const text = getMessageText(msg)
  const links = text ? extractLinks(text) : []
  const hasLink = links.length > 0
  const approxSize = approximateSize(msg)

  // Attempt to save message — skip on duplicate message_id (race condition)
  try {
    await pool.query(
      `INSERT INTO whatsapp_messages
         (message_id, group_id, sender_hash, timestamp, message_type,
          has_link, has_media, approximate_size, message_body)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (group_id, message_id) DO NOTHING`,
      [
        messageId,
        groupId,
        senderHash,
        timestamp,
        msgType,
        hasLink,
        media,
        approxSize ? Number(approxSize) : null,
        STORE_BODY ? text : null,
      ],
    )
  } catch {
    return
  }

  // Save extracted links
  if (links.length > 0) {
    for (const link of links) {
      await pool.query(
        `INSERT INTO whatsapp_links (group_id, url_hash, domain, first_seen_at, last_seen_at, count)
         VALUES ($1,$2,$3,$4,$4,1)
         ON CONFLICT (group_id, url_hash) DO UPDATE SET
           last_seen_at = EXCLUDED.last_seen_at,
           count        = whatsapp_links.count + 1,
           updated_at   = NOW()`,
        [groupId, link.urlHash, link.domain, timestamp],
      )
    }
  }
}
