CREATE TABLE calendar.reminders (
  gym_id text NOT NULL REFERENCES calendar.gyms(id),
  booking_id text NOT NULL,
  starts_at timestamptz NOT NULL,
  channel text NOT NULL CHECK (channel IN ('WHATSAPP','SMS')),
  status text NOT NULL CHECK (status IN ('PROCESSING','ACCEPTED','FAILED','UNKNOWN','SKIPPED','RETRY')),
  attempts integer NOT NULL DEFAULT 1,
  next_attempt_at timestamptz,
  provider_id text,
  reason text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (gym_id, booking_id, starts_at),
  FOREIGN KEY (gym_id, booking_id) REFERENCES calendar.bookings(gym_id,id)
);
CREATE INDEX reminders_pending ON calendar.reminders(status,next_attempt_at);
