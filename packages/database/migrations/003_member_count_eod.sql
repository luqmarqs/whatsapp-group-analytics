ALTER TABLE whatsapp_daily_group_metrics
  ADD COLUMN IF NOT EXISTS member_count_eod INTEGER;
