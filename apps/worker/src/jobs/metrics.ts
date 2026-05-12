import pool from '../db'

export async function runDailyMetrics(date?: string, instanceName?: string) {
  const target = date ?? new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
  console.log(`[metrics] computing for ${target}`)

  await pool.query(`
    INSERT INTO whatsapp_daily_group_metrics
      (group_id, date, message_count, link_count, media_count,
       unique_senders_count, join_count, leave_count, net_member_growth,
       member_count_eod)
    SELECT
      g.id,
      $1::date,
      COUNT(m.id)::int,
      COUNT(CASE WHEN m.has_link  THEN 1 END)::int,
      COUNT(CASE WHEN m.has_media THEN 1 END)::int,
      COUNT(DISTINCT m.sender_hash)::int,
      COALESCE(ev.join_count,  0)::int,
      COALESCE(ev.leave_count, 0)::int,
      COALESCE(ev.join_count,  0) - COALESCE(ev.leave_count, 0),
      g.member_count
    FROM whatsapp_groups g
    JOIN whatsapp_instances i ON i.id = g.instance_id
    LEFT JOIN whatsapp_messages m
      ON m.group_id = g.id AND DATE(m.timestamp AT TIME ZONE 'UTC') = $1::date
    LEFT JOIN (
      SELECT
        group_id,
        COUNT(CASE WHEN event_type = 'join'  THEN 1 END)::int AS join_count,
        COUNT(CASE WHEN event_type = 'leave' THEN 1 END)::int AS leave_count
      FROM whatsapp_group_events
      WHERE DATE(timestamp AT TIME ZONE 'UTC') = $1::date
      GROUP BY group_id
    ) ev ON ev.group_id = g.id
    WHERE g.is_monitored = true
      AND g.is_available = true
      AND ($2::text IS NULL OR i.name = $2)
    GROUP BY g.id, ev.join_count, ev.leave_count
    ON CONFLICT (group_id, date) DO UPDATE SET
      message_count        = EXCLUDED.message_count,
      link_count           = EXCLUDED.link_count,
      media_count          = EXCLUDED.media_count,
      unique_senders_count = EXCLUDED.unique_senders_count,
      join_count           = EXCLUDED.join_count,
      leave_count          = EXCLUDED.leave_count,
      net_member_growth    = EXCLUDED.net_member_growth,
      member_count_eod     = EXCLUDED.member_count_eod,
      updated_at           = NOW()
  `, [target, instanceName ?? null])

  console.log(`[metrics] done for ${target}`)
}
