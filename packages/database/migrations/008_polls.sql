CREATE TABLE IF NOT EXISTS whatsapp_polls (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id              UUID NOT NULL REFERENCES whatsapp_instances(id) ON DELETE CASCADE,
  group_id                 UUID NOT NULL REFERENCES whatsapp_groups(id) ON DELETE CASCADE,
  message_id               VARCHAR(255) NOT NULL,
  creator_hash             VARCHAR(64),
  title                    TEXT NOT NULL,
  selectable_options_count INTEGER,
  poll_type                VARCHAR(100),
  poll_content_type        VARCHAR(100),
  created_at_whatsapp      TIMESTAMPTZ NOT NULL,
  raw_payload              JSONB,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(instance_id, group_id, message_id)
);

CREATE INDEX IF NOT EXISTS idx_wp_instance_id ON whatsapp_polls(instance_id);
CREATE INDEX IF NOT EXISTS idx_wp_group_id ON whatsapp_polls(group_id);
CREATE INDEX IF NOT EXISTS idx_wp_created_at_whatsapp ON whatsapp_polls(created_at_whatsapp);

CREATE TABLE IF NOT EXISTS whatsapp_poll_options (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id      UUID NOT NULL REFERENCES whatsapp_polls(id) ON DELETE CASCADE,
  option_index INTEGER NOT NULL,
  option_text  TEXT NOT NULL,
  option_hash  TEXT NOT NULL,
  vote_count   INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(poll_id, option_index),
  UNIQUE(poll_id, option_hash)
);

CREATE INDEX IF NOT EXISTS idx_wpo_poll_id ON whatsapp_poll_options(poll_id);

CREATE TABLE IF NOT EXISTS whatsapp_poll_updates (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id                UUID NOT NULL REFERENCES whatsapp_polls(id) ON DELETE CASCADE,
  update_message_id      VARCHAR(255),
  voter_hash             VARCHAR(64) NOT NULL,
  selected_option_hashes TEXT[] NOT NULL DEFAULT '{}',
  voted_at               TIMESTAMPTZ NOT NULL,
  raw_payload            JSONB,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(poll_id, voter_hash)
);

CREATE INDEX IF NOT EXISTS idx_wpu_poll_id ON whatsapp_poll_updates(poll_id);
CREATE INDEX IF NOT EXISTS idx_wpu_voter_hash ON whatsapp_poll_updates(voter_hash);

CREATE TABLE IF NOT EXISTS whatsapp_poll_votes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id     UUID NOT NULL REFERENCES whatsapp_polls(id) ON DELETE CASCADE,
  option_id   UUID NOT NULL REFERENCES whatsapp_poll_options(id) ON DELETE CASCADE,
  voter_hash  VARCHAR(64) NOT NULL,
  voted_at    TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(poll_id, option_id, voter_hash)
);

CREATE INDEX IF NOT EXISTS idx_wpv_poll_id ON whatsapp_poll_votes(poll_id);
CREATE INDEX IF NOT EXISTS idx_wpv_option_id ON whatsapp_poll_votes(option_id);
