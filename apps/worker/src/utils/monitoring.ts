import pool from '../db'

const INSTANCE_NAME = process.env.INSTANCE_NAME ?? 'default'

// In-memory Set for O(1) lookup on every message — no DB/Redis round-trip per event
let monitored: Set<string> = new Set()

export async function loadMonitoredGroups(): Promise<void> {
  const { rows } = await pool.query(
    `SELECT g.group_jid
     FROM whatsapp_groups g
     JOIN whatsapp_instances i ON i.id = g.instance_id
     WHERE i.name = $1
       AND g.is_monitored = true
       AND g.is_available = true`,
    [INSTANCE_NAME],
  )
  monitored = new Set(rows.map((r) => r.group_jid))
  console.log(`[monitor] ${monitored.size} grupo(s) monitorado(s)`)
}

export function isMonitored(groupJid: string): boolean {
  return monitored.has(groupJid)
}
