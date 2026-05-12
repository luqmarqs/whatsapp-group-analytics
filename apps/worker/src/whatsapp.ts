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
import { mkdir, readdir, rm } from 'fs/promises'
import pool from './db'
import redis from './redis'
import { syncGroups, upsertGroup } from './handlers/groups'
import { handleMessage } from './handlers/messages'
import { handleParticipantUpdate } from './handlers/members'
import { handlePollCreation, handlePollUpdates } from './handlers/polls'
import { loadMonitoredGroups } from './utils/monitoring'

const SESSION_DIR   = process.env.SESSION_DIR   ?? path.join(process.cwd(), 'sessions')
const INSTANCE_NAME = process.env.INSTANCE_NAME ?? 'default'

let userInitiatedLogout = false
let logoutFallbackTimer: NodeJS.Timeout | null = null

export function requestLogout() {
  userInitiatedLogout = true
  scheduleLogoutFallback()
  if (sock) {
    sock.logout().catch((err) => {
      console.error('[wa] logout request failed', err)
      clearSessionAndRestart('logout request fallback').catch((e) =>
        console.error('[wa] restart after logout failure failed', e),
      )
    })
  } else {
    clearSessionAndRestart('logout request without socket').catch((e) =>
      console.error('[wa] restart after logout request failed', e),
    )
  }
}

function scheduleLogoutFallback() {
  if (logoutFallbackTimer) clearTimeout(logoutFallbackTimer)
  logoutFallbackTimer = setTimeout(() => {
    if (!userInitiatedLogout) return
    userInitiatedLogout = false
    clearSessionAndRestart('logout request timeout fallback').catch((err) =>
      console.error('[wa] restart after logout timeout failed', err),
    )
  }, 5_000)
}

async function clearSessionAndRestart(reason: string) {
  if (logoutFallbackTimer) {
    clearTimeout(logoutFallbackTimer)
    logoutFallbackTimer = null
  }
  console.log(`[wa] ${reason} - clearing session and restarting for new QR`)
  sock = null
  await redis.del(`wa:qr:${INSTANCE_NAME}`)
  await clearSessionFiles()
  setTimeout(() => startWhatsApp(), 1_000)
}

async function clearSessionFiles() {
  await mkdir(SESSION_DIR, { recursive: true })

  const entries = await readdir(SESSION_DIR, { withFileTypes: true }).catch((err: NodeJS.ErrnoException) => {
    if (err.code === 'ENOENT') return []
    throw err
  })

  await Promise.all(
    entries.map((entry) =>
      rm(path.join(SESSION_DIR, entry.name), { recursive: true, force: true }),
    ),
  )
}

/**
 * Fetches the current participant list for a group directly from WhatsApp
 * and upserts all contacts. Works even for announcement groups where no
 * messages are sent - covers members who have never spoken.
 */
export async function resyncGroupParticipants(groupJid: string): Promise<void> {
  if (!sock || !instanceId) {
    console.log(`[resync] skipped - not connected (${groupJid})`)
    return
  }
  try {
    const meta = await sock.groupMetadata(groupJid)
    await upsertGroup(groupJid, meta, instanceId)
    console.log(`[resync] ${meta.participants?.length ?? 0} participante(s) sincronizados para ${groupJid}`)
  } catch (err) {
    console.error('[resync] erro:', err)
  }
}

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
        await redis.set(`wa:qr:${INSTANCE_NAME}`, png, 'EX', 300)
        console.log('[wa] QR code ready - scan via the web dashboard')
      } catch (err) {
        console.error('[wa] QR generation error', err)
      }
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode
      const loggedOut = statusCode === DisconnectReason.loggedOut

      console.log(`[wa] connection closed - statusCode=${statusCode} loggedOut=${loggedOut}`)
      await updateInstanceStatus(instanceId!, 'disconnected')

      if (!loggedOut && !userInitiatedLogout) {
        console.log('[wa] reconnecting in 5s...')
        setTimeout(() => startWhatsApp(), 5_000)
      } else {
        const reason = userInitiatedLogout ? 'user logout' : 'logged out externally'
        userInitiatedLogout = false
        await clearSessionAndRestart(reason)
      }
    }

    if (connection === 'open') {
      const jid = sock?.user?.id ?? undefined
      console.log(`[wa] connected as ${jid}`)
      await updateInstanceStatus(instanceId!, 'connected', jid)
      await syncGroups(sock!, instanceId!)
      await loadMonitoredGroups()
    }
  })

  // Incoming messages
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return

    for (const msg of messages) {
      const jid = msg.key.remoteJid
      if (!jid || !isJidGroup(jid)) continue

      await handlePollCreation(msg, jid, instanceId!).catch((err) =>
        console.error('[wa] poll creation handler error', err),
      )
      await handlePollUpdates(msg.key, msg.pollUpdates, instanceId!).catch((err) =>
        console.error('[wa] poll update handler error', err),
      )
      if (msg.key.fromMe) continue

      await handleMessage(msg, jid, instanceId!).catch((err) =>
        console.error('[wa] message handler error', err),
      )
    }
  })

  sock.ev.on('messages.update', async (updates) => {
    for (const update of updates) {
      if (!update.key.remoteJid || !isJidGroup(update.key.remoteJid)) continue
      await handlePollUpdates(update.key, update.update.pollUpdates, instanceId!).catch((err) =>
        console.error('[wa] poll update handler error', err),
      )
    }
  })

  // Group metadata changes
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
        'SELECT id FROM whatsapp_groups WHERE instance_id = $1 AND group_jid = $2',
        [instanceId!, update.id],
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

  // Participant changes
  sock.ev.on('group-participants.update', async ({ id, participants, action, author }) => {
    await handleParticipantUpdate(instanceId!, id, participants, action, author).catch((err) =>
      console.error('[wa] participant handler error', err),
    )
  })
}
