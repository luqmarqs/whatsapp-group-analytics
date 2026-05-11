-- Link instances to users and track Docker container name
ALTER TABLE whatsapp_instances
  ADD COLUMN IF NOT EXISTS user_id        UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS container_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS is_running     BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_wi_user_id ON whatsapp_instances(user_id);
