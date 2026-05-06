import 'dotenv/config'
import cron from 'node-cron'
import pool from './db'
import redis from './redis'
import { startWhatsApp } from './whatsapp'
import { runDailyMetrics } from './jobs/metrics'
import { runAlerts } from './jobs/alerts'

async function main() {
  console.log('[worker] starting…')

  await redis.connect()
  await pool.query('SELECT 1') // verify DB connection

  console.log('[worker] DB and Redis connected')

  // Daily metrics at 01:00 UTC
  cron.schedule('0 1 * * *', () => {
    runDailyMetrics().catch((e) => console.error('[cron] metrics error', e))
  })

  // Alerts at 01:15 UTC
  cron.schedule('15 1 * * *', () => {
    runAlerts().catch((e) => console.error('[cron] alerts error', e))
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
