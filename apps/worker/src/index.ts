import 'dotenv/config'
import cron from 'node-cron'
import pool from './db'
import redis from './redis'
import { startWhatsApp, requestLogout, resyncGroupParticipants } from './whatsapp'
import { runDailyMetrics } from './jobs/metrics'
import { runAlerts } from './jobs/alerts'
import { loadMonitoredGroups } from './utils/monitoring'

const INSTANCE_NAME = process.env.INSTANCE_NAME ?? 'default'
const RESYNC_DELAY_MS = Number(process.env.RESYNC_DELAY_MS ?? 1500)

const resyncQueue: string[] = []
const queuedResyncs = new Set<string>()
let resyncRunning = false

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function enqueueResync(groupJid: string) {
  if (!groupJid || queuedResyncs.has(groupJid)) return

  queuedResyncs.add(groupJid)
  resyncQueue.push(groupJid)
  console.log(`[resync] queued ${groupJid}; pending=${resyncQueue.length}`)
  drainResyncQueue().catch((e) => console.error('[resync] queue error', e))
}

async function drainResyncQueue() {
  if (resyncRunning) return

  resyncRunning = true
  try {
    while (resyncQueue.length > 0) {
      const groupJid = resyncQueue.shift()!
      try {
        await resyncGroupParticipants(groupJid)
      } finally {
        queuedResyncs.delete(groupJid)
      }

      if (resyncQueue.length > 0 && RESYNC_DELAY_MS > 0) {
        await sleep(RESYNC_DELAY_MS)
      }
    }
  } finally {
    resyncRunning = false
  }
}

async function runJobs() {
  const today = new Date().toISOString().slice(0, 10)
  console.log('[jobs] running metrics + alerts manually')
  await runDailyMetrics(today, INSTANCE_NAME)
  await runAlerts(INSTANCE_NAME)
  console.log('[jobs] done')
}

async function main() {
  console.log('[worker] starting…')

  await redis.connect()
  await pool.query('SELECT 1')

  console.log('[worker] DB and Redis connected')

  // Load monitored groups into memory before starting WhatsApp
  await loadMonitoredGroups()

  // Subscriber connection for pub/sub (ioredis requires separate connection)
  const sub = redis.duplicate()
  await sub.connect()
  sub.on('message', (channel, message) => {
    if ((channel === 'wa:jobs' || channel === `wa:jobs:${INSTANCE_NAME}`) && message === 'run') {
      runJobs().catch((e) => console.error('[jobs] error', e))
    }
    if (channel === `wa:monitoring:changed:${INSTANCE_NAME}`) {
      loadMonitoredGroups().catch((e) => console.error('[monitor] reload error', e))
    }
    if (channel === `wa:logout:${INSTANCE_NAME}`) {
      requestLogout()
    }
    if (channel === `wa:resync:${INSTANCE_NAME}`) {
      // message = groupJid to resync
      enqueueResync(message)
    }
  })
  await sub.subscribe('wa:jobs')
  await sub.subscribe(`wa:jobs:${INSTANCE_NAME}`)
  await sub.subscribe(`wa:monitoring:changed:${INSTANCE_NAME}`)
  await sub.subscribe(`wa:logout:${INSTANCE_NAME}`)
  await sub.subscribe(`wa:resync:${INSTANCE_NAME}`)

  cron.schedule('0 1 * * *', () => {
    runDailyMetrics(undefined, INSTANCE_NAME).catch((e) => console.error('[cron] metrics error', e))
  })
  cron.schedule('15 1 * * *', () => {
    runAlerts(INSTANCE_NAME).catch((e) => console.error('[cron] alerts error', e))
  })

  await startWhatsApp()
}

process.on('SIGTERM', async () => {
  console.log('[worker] shutting down…')
  await pool.end()
  await redis.quit()
  process.exit(0)
})

main().catch((err) => {
  console.error('[worker] fatal error', err)
  process.exit(1)
})
