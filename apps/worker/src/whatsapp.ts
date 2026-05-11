import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  isJidGroup,
  useMultiFileAuthState,
  WASocket,
} from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import QRCode from 'qrcode'
import pino from 'pino'
import path from 'path'
import pool from './db'
import redis from './redis'
import { syncGroups, upsertGroup } from './handlers/groups'
import { handleMessage } from './handlers/messages'
import { handleParticipantUpdate } from './handlers/members'

const SESSION_DIR = process.env.SESSION_DIR ?? path.join(process.cwd(), 'sessions')
const INSTANCE_NAME = process.env.INSTANCE_NAME ?? 'default'

let sock: WASocket | null = null
let instanceId: string | null = null

async function getOrCreateInstance(): Promise<string> {
  const { rows } = await pool.query(
    `INSERT INTO whatsapp_instances (name, status)
     VALUES ($1, 'disconnected')
     ON CONFLICT (name) DO UPDATE SET updated_at = NOW()
     RETURNING id`,
    [INSTANCE_NAME],
  )
  return rows[0].id
}

async function updateInstanceStatus(id: string, status: string, jid?: string) {
  // Use a boolean param for the CASE to avoid PostgreSQL type-inference conflicts
  // when $1 appears in both SET and CASE clauses with different expected types.
  await pool.query(
    `UPDATE whatsapp_instances
     SET status = $1, jid = COALESCE($2, jid),
         connected_at = CASE WHEN $3 THEN NOW() ELSE connected_at END,
         updated_at = NOW()
     WHERE id = $4`,
    [status, jid ?? null, status === 'connected', id],
  )
}

export async function startWhatsApp() {
  instanceId = await getOrCreateInstance()

  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR)
  const { version } = await fetchLatestBaileysVersion()

  console.log(`[wa] using Baileys v${version.join('.')}`)

  sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    browser: ['WhatsApp Analytics', 'Chrome', '120.0'],
    syncFullHistory: false,
    markOnlineOnConnect: false,
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update

    if (qr) {
      try {
        const png = await QRCode.toDataURL(qr)
        await redis.set('wa:qr', png, 'EX', 120)
        console.log('[wa] QR code ready — scan via the web dashboard')
      } catch (err) {
        console.error('[wa] QR generation error', err)
      }
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode
      const loggedOut = statusCode === DisconnectReason.loggedOut

      console.log(`[wa] connection closed — statusCode=${statusCode} loggedOut=${loggedOut}`)
      await updateInstanceStatus(instanceId!, 'disconnected')

      if (!loggedOut) {
        console.log('[wa] reconnecting in 5s…')
        setTimeout(() => startWhatsApp(), 5_000)
      } else {
        console.log('[wa] logged out — delete sessions dir and restart to re-authenticate')
      }
    }

    if (connection === 'open') {
      const jid = sock?.user?.id ?? undefined
      console.log(`[wa] connected as ${jid}`)
      await updateInstanceStatus(instanceId!, 'connected', jid)
      await syncGroups(sock!, instanceId!)
    }
  })

  // ── Incoming messages ──────────────────────────────────────────────────────
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return

    for (const msg of messages) {
      const jid = msg.key.remoteJid
      if (!jid || !isJidGroup(jid)) continue
      if (msg.key.fromMe) continue

      await handleMessage(msg, jid).catch((err) =>
        console.error('[wa] message handler error', err),
      )
    }
  })

  // ── Group metadata changes ─────────────────────────────────────────────────
  sock.ev.on('groups.upsert', async (groups) => {
    for (const meta of groups) {
      await upsertGroup(meta.id, meta, instanceId!).catch((err) =>
        console.error('[wa] group upsert error', err),
      )
    }
  })

  sock.ev.on('groups.update', async (updates) => {
    for (const update of updates) {
      const { rows } = await pool.query(
        'SELECT id FROM whatsapp_groups WHERE group_jid = $1',
        [update.id],
      )
      if (!rows[0]) continue

      const fields: string[] = []
      const values: unknown[] = []
      let idx = 1

      if (update.subject !== undefined) {
        fields.push(`name = $${idx++}`)
        values.push(update.subject)
      }
      if (update.desc !== undefined) {
        fields.push(`description = $${idx++}`)
        values.push(update.desc)
      }
      if (fields.length === 0) continue

      fields.push(`updated_at = NOW()`)
      values.push(rows[0].id)
      await pool.query(
        `UPDATE whatsapp_groups SET ${fields.join(', ')} WHERE id = $${idx}`,
        values,
      )
    }
  })

  // ── Participant changes ────────────────────────────────────────────────────
  sock.ev.on('group-participants.update', async ({ id, participants, action, author }) => {
    await handleParticipantUpdate(id, participants, action, author).catch((err) =>
      console.error('[wa] participant handler error', err),
    )
  })
}
