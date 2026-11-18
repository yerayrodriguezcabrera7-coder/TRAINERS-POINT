ALTER TABLE calendar.notifications
  ADD COLUMN IF NOT EXISTS dedupe_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedupe_key
  ON calendar.notifications(dedupe_key);
