-- ─── whatsapp_contacts ───────────────────────────────────────────────────────
-- One row per unique participant (keyed by member_hash = sha256 of bare JID).
-- phone is the raw E.164 number without +, e.g. 5511999999999.
-- name is the WhatsApp pushName, updated whenever a message is received.
CREATE TABLE IF NOT EXISTS whatsapp_contacts (
  member_hash VARCHAR(64)  PRIMARY KEY,
  phone       VARCHAR(30),
  name        VARCHAR(255),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
