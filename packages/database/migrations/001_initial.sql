-- ─── Extensions ──────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── users ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email        VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  name         VARCHAR(255) NOT NULL,
  role         VARCHAR(50)  NOT NULL DEFAULT 'viewer',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── whatsapp_instances ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS whatsapp_instances (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         VARCHAR(255) NOT NULL UNIQUE,
  jid          VARCHAR(255),
  status       VARCHAR(50)  NOT NULL DEFAULT 'disconnected',
  connected_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── whatsapp_groups ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS whatsapp_groups (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id  UUID        NOT NULL REFERENCES whatsapp_instances(id),
  group_jid    VARCHAR(255) NOT NULL UNIQUE,
  name         VARCHAR(500),
  description  TEXT,
  member_count INTEGER     NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wg_instance_id ON whatsapp_groups(instance_id);
CREATE INDEX IF NOT EXISTS idx_wg_group_jid   ON whatsapp_groups(group_jid);

-- ─── whatsapp_group_members ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS whatsapp_group_members (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    UUID        NOT NULL REFERENCES whatsapp_groups(id) ON DELETE CASCADE,
  member_hash VARCHAR(64) NOT NULL,
  role        VARCHAR(50) NOT NULL DEFAULT 'member',
  joined_at   TIMESTAMPTZ,
  left_at     TIMESTAMPTZ,
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(group_id, member_hash)
);

CREATE INDEX IF NOT EXISTS idx_wgm_group_id ON whatsapp_group_members(group_id);

-- ─── whatsapp_messages ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id       VARCHAR(255) NOT NULL UNIQUE,
  group_id         UUID        NOT NULL REFERENCES whatsapp_groups(id) ON DELETE CASCADE,
  sender_hash      VARCHAR(64) NOT NULL,
  timestamp        TIMESTAMPTZ NOT NULL,
  message_type     VARCHAR(100) NOT NULL DEFAULT 'unknown',
  has_link         BOOLEAN     NOT NULL DEFAULT false,
  has_media        BOOLEAN     NOT NULL DEFAULT false,
  approximate_size INTEGER,
  message_body     TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wm_group_id   ON whatsapp_messages(group_id);
CREATE INDEX IF NOT EXISTS idx_wm_timestamp  ON whatsapp_messages(timestamp);
CREATE INDEX IF NOT EXISTS idx_wm_message_id ON whatsapp_messages(message_id);

-- ─── whatsapp_group_events ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS whatsapp_group_events (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    UUID        NOT NULL REFERENCES whatsapp_groups(id) ON DELETE CASCADE,
  event_type  VARCHAR(100) NOT NULL,
  member_hash VARCHAR(64),
  actor_hash  VARCHAR(64),
  timestamp   TIMESTAMPTZ NOT NULL,
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wge_group_id   ON whatsapp_group_events(group_id);
CREATE INDEX IF NOT EXISTS idx_wge_event_type ON whatsapp_group_events(event_type);
CREATE INDEX IF NOT EXISTS idx_wge_timestamp  ON whatsapp_group_events(timestamp);

-- ─── whatsapp_links ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS whatsapp_links (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id     UUID        NOT NULL REFERENCES whatsapp_groups(id) ON DELETE CASCADE,
  url_hash     VARCHAR(64) NOT NULL,
  domain       VARCHAR(500) NOT NULL,
  first_seen_at TIMESTAMPTZ NOT NULL,
  last_seen_at  TIMESTAMPTZ NOT NULL,
  count        INTEGER     NOT NULL DEFAULT 1,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(group_id, url_hash)
);

CREATE INDEX IF NOT EXISTS idx_wl_group_id ON whatsapp_links(group_id);
CREATE INDEX IF NOT EXISTS idx_wl_domain   ON whatsapp_links(domain);

-- ─── whatsapp_daily_group_metrics ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS whatsapp_daily_group_metrics (
  id                   UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id             UUID    NOT NULL REFERENCES whatsapp_groups(id) ON DELETE CASCADE,
  date                 DATE    NOT NULL,
  message_count        INTEGER NOT NULL DEFAULT 0,
  link_count           INTEGER NOT NULL DEFAULT 0,
  media_count          INTEGER NOT NULL DEFAULT 0,
  join_count           INTEGER NOT NULL DEFAULT 0,
  leave_count          INTEGER NOT NULL DEFAULT 0,
  unique_senders_count INTEGER NOT NULL DEFAULT 0,
  net_member_growth    INTEGER NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(group_id, date)
);

CREATE INDEX IF NOT EXISTS idx_wdm_group_id ON whatsapp_daily_group_metrics(group_id);
CREATE INDEX IF NOT EXISTS idx_wdm_date     ON whatsapp_daily_group_metrics(date);

-- ─── whatsapp_alerts ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS whatsapp_alerts (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id   UUID        NOT NULL REFERENCES whatsapp_groups(id) ON DELETE CASCADE,
  alert_type VARCHAR(100) NOT NULL,
  severity   VARCHAR(50)  NOT NULL DEFAULT 'info',
  message    TEXT        NOT NULL,
  metadata   JSONB,
  is_read    BOOLEAN     NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wa_group_id   ON whatsapp_alerts(group_id);
CREATE INDEX IF NOT EXISTS idx_wa_created_at ON whatsapp_alerts(created_at);
CREATE INDEX IF NOT EXISTS idx_wa_is_read    ON whatsapp_alerts(is_read);

-- ─── whatsapp_group_tasks ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS whatsapp_group_tasks (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title       VARCHAR(500) NOT NULL,
  description TEXT,
  due_date    DATE,
  priority    VARCHAR(50)  NOT NULL DEFAULT 'medium',
  created_by  UUID        NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── whatsapp_group_task_status ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS whatsapp_group_task_status (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id      UUID        NOT NULL REFERENCES whatsapp_group_tasks(id) ON DELETE CASCADE,
  group_id     UUID        NOT NULL REFERENCES whatsapp_groups(id) ON DELETE CASCADE,
  status       VARCHAR(50)  NOT NULL DEFAULT 'pending',
  notes        TEXT,
  completed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(task_id, group_id)
);

CREATE INDEX IF NOT EXISTS idx_wts_task_id  ON whatsapp_group_task_status(task_id);
CREATE INDEX IF NOT EXISTS idx_wts_group_id ON whatsapp_group_task_status(group_id);
