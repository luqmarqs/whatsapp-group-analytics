CREATE TABLE IF NOT EXISTS whatsapp_contact_aliases (
  instance_id  UUID NOT NULL REFERENCES whatsapp_instances(id) ON DELETE CASCADE,
  alias_hash   VARCHAR(64) NOT NULL,
  contact_hash VARCHAR(64) NOT NULL,
  raw_jid      VARCHAR(255),
  jid_server   VARCHAR(100),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (instance_id, alias_hash)
);

CREATE INDEX IF NOT EXISTS idx_wca_instance_contact_hash
  ON whatsapp_contact_aliases(instance_id, contact_hash);
