ALTER TABLE whatsapp_contacts
  ADD COLUMN IF NOT EXISTS raw_jid VARCHAR(255),
  ADD COLUMN IF NOT EXISTS jid_server VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_wc_instance_phone
  ON whatsapp_contacts(instance_id, phone);
