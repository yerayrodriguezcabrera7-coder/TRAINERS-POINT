CREATE TABLE calendar.notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  gym_id text REFERENCES calendar.gyms(id),
  type text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('EMAIL','SMS','WHATSAPP','PUSH')),
  recipient text NOT NULL,
  subject text,
  body text,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','SENT','FAILED','SKIPPED')),
  reason text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE INDEX notifications_pending ON calendar.notifications(status,channel,created_at);