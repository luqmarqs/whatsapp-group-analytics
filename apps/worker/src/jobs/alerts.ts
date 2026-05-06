import pool from '../db'

export async function runAlerts() {
  console.log('[alerts] running checks…')
  const inserts: Array<[string, string, string, string, object]> = []

  const alreadyAlerted = async (groupId: string, alertType: string) => {
    const { rows } = await pool.query(
      `SELECT id FROM whatsapp_alerts
       WHERE group_id = $1 AND alert_type = $2 AND is_read = false
         AND created_at >= NOW() - INTERVAL '1 day'`,
      [groupId, alertType],
    )
    return rows.length > 0
  }

  // Silent 3 days
  const { rows: s3 } = await pool.query(`
    SELECT g.id, g.name FROM whatsapp_groups g
    LEFT JOIN whatsapp_messages m ON m.group_id = g.id
    GROUP BY g.id
    HAVING MAX(m.timestamp) < NOW() - INTERVAL '3 days' OR MAX(m.timestamp) IS NULL
  `)
  for (const r of s3) {
    if (await alreadyAlerted(r.id, 'silent_3d')) continue
    inserts.push([r.id, 'silent_3d', 'warning', `Grupo "${r.name}" sem atividade há 3+ dias`, {}])
  }

  // Silent 7 days
  const { rows: s7 } = await pool.query(`
    SELECT g.id, g.name FROM whatsapp_groups g
    LEFT JOIN whatsapp_messages m ON m.group_id = g.id
    GROUP BY g.id
    HAVING MAX(m.timestamp) < NOW() - INTERVAL '7 days' OR MAX(m.timestamp) IS NULL
  `)
  for (const r of s7) {
    if (await alreadyAlerted(r.id, 'silent_7d')) continue
    inserts.push([r.id, 'silent_7d', 'critical', `Grupo "${r.name}" sem atividade há 7+ dias`, {}])
  }

  // Activity spike
  const { rows: spikes } = await pool.query(`
    SELECT g.id, g.name, today.cnt, avg7.avg_cnt
    FROM whatsapp_groups g
    JOIN (SELECT group_id, COUNT(*)::float AS cnt FROM whatsapp_messages WHERE timestamp >= NOW() - INTERVAL '1 day' GROUP BY group_id) today ON today.group_id = g.id
    JOIN (SELECT group_id, AVG(cnt)::float AS avg_cnt FROM (SELECT group_id, DATE(timestamp), COUNT(*) AS cnt FROM whatsapp_messages WHERE timestamp BETWEEN NOW() - INTERVAL '8 days' AND NOW() - INTERVAL '1 day' GROUP BY group_id, DATE(timestamp)) d GROUP BY group_id) avg7 ON avg7.group_id = g.id
    WHERE avg7.avg_cnt > 0 AND today.cnt > avg7.avg_cnt * 5
  `)
  for (const r of spikes) {
    if (await alreadyAlerted(r.id, 'activity_spike')) continue
    inserts.push([r.id, 'activity_spike', 'info',
      `Pico de atividade em "${r.name}": ${r.cnt} msgs (média 7d: ${Math.round(r.avg_cnt)})`,
      { today_count: r.cnt, avg_7d: r.avg_cnt }])
  }

  // Activity drop
  const { rows: drops } = await pool.query(`
    SELECT g.id, g.name, today.cnt, avg7.avg_cnt
    FROM whatsapp_groups g
    JOIN (SELECT group_id, COUNT(*)::float AS cnt FROM whatsapp_messages WHERE timestamp >= NOW() - INTERVAL '1 day' GROUP BY group_id) today ON today.group_id = g.id
    JOIN (SELECT group_id, AVG(cnt)::float AS avg_cnt FROM (SELECT group_id, DATE(timestamp), COUNT(*) AS cnt FROM whatsapp_messages WHERE timestamp BETWEEN NOW() - INTERVAL '8 days' AND NOW() - INTERVAL '1 day' GROUP BY group_id, DATE(timestamp)) d GROUP BY group_id) avg7 ON avg7.group_id = g.id
    WHERE avg7.avg_cnt >= 10 AND today.cnt < avg7.avg_cnt * 0.2
  `)
  for (const r of drops) {
    if (await alreadyAlerted(r.id, 'activity_drop')) continue
    inserts.push([r.id, 'activity_drop', 'warning',
      `Queda brusca em "${r.name}": ${r.cnt} msgs (média 7d: ${Math.round(r.avg_cnt)})`,
      { today_count: r.cnt, avg_7d: r.avg_cnt }])
  }

  // Viral link — same link shared 10+ times within a 2-day window (avoids triggering on old accumulated counts)
  const { rows: viral } = await pool.query(`
    SELECT l.group_id, g.name, l.domain, l.count
    FROM whatsapp_links l
    JOIN whatsapp_groups g ON g.id = l.group_id
    WHERE l.last_seen_at >= NOW() - INTERVAL '1 day'
      AND l.count >= 10
      AND (l.last_seen_at - l.first_seen_at) <= INTERVAL '2 days'
  `)
  for (const r of viral) {
    if (await alreadyAlerted(r.group_id, 'viral_link')) continue
    inserts.push([r.group_id, 'viral_link', 'info',
      `Link "${r.domain}" compartilhado ${r.count}x em "${r.name}"`,
      { domain: r.domain, count: r.count }])
  }

  for (const [gid, type, sev, msg, meta] of inserts) {
    await pool.query(
      `INSERT INTO whatsapp_alerts (group_id, alert_type, severity, message, metadata) VALUES ($1,$2,$3,$4,$5)`,
      [gid, type, sev, msg, JSON.stringify(meta)],
    )
  }

  console.log(`[alerts] inserted ${inserts.length} alerts`)
}
