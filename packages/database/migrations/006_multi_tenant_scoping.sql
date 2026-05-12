-- Scope WhatsApp data by instance so the app can run as a multi-tenant SaaS.
-- A WhatsApp group JID may appear in more than one customer's instance, and
-- monitoring/contact details must stay isolated per instance.

ALTER TABLE whatsapp_groups
  ADD COLUMN IF NOT EXISTS is_available BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint c
  JOIN unnest(c.conkey) AS ck(attnum) ON true
  JOIN pg_attribute a
    ON a.attrelid = c.conrelid
   AND a.attnum = ck.attnum
  WHERE c.conrelid = 'whatsapp_groups'::regclass
    AND c.contype = 'f'
    AND a.attname = 'instance_id'
  LIMIT 1;

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE whatsapp_groups DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

ALTER TABLE whatsapp_groups
  ADD CONSTRAINT whatsapp_groups_instance_id_fkey
  FOREIGN KEY (instance_id) REFERENCES whatsapp_instances(id) ON DELETE CASCADE;

DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'whatsapp_groups'::regclass
    AND contype = 'u'
    AND pg_get_constraintdef(oid) = 'UNIQUE (group_jid)';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE whatsapp_groups DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_wg_instance_group_jid
  ON whatsapp_groups(instance_id, group_jid);

CREATE INDEX IF NOT EXISTS idx_wg_instance_available
  ON whatsapp_groups(instance_id, is_available);

ALTER TABLE whatsapp_contacts
  ADD COLUMN IF NOT EXISTS instance_id UUID REFERENCES whatsapp_instances(id) ON DELETE CASCADE;

UPDATE whatsapp_contacts c
SET instance_id = src.instance_id
FROM (
  SELECT DISTINCT ON (m.member_hash)
    m.member_hash,
    g.instance_id
  FROM whatsapp_group_members m
  JOIN whatsapp_groups g ON g.id = m.group_id
  ORDER BY m.member_hash, g.updated_at DESC
) src
WHERE c.member_hash = src.member_hash
  AND c.instance_id IS NULL;

DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'whatsapp_contacts'::regclass
    AND contype = 'p';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE whatsapp_contacts DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_wc_instance_member_hash
  ON whatsapp_contacts(instance_id, member_hash);

CREATE INDEX IF NOT EXISTS idx_wc_member_hash
  ON whatsapp_contacts(member_hash);

DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'whatsapp_messages'::regclass
    AND contype = 'u'
    AND pg_get_constraintdef(oid) = 'UNIQUE (message_id)';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE whatsapp_messages DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_wm_group_message_id
  ON whatsapp_messages(group_id, message_id);
