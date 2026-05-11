ALTER TABLE whatsapp_groups
  ADD COLUMN IF NOT EXISTS is_monitored BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_wg_is_monitored ON whatsapp_groups(is_monitored);
