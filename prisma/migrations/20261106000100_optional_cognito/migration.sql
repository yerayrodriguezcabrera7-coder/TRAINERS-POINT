-- Identity links are deliberately provisioned by an operator, never by matching an email.
-- The calendar schema already exists in the previous migrations.
ALTER TABLE calendar.sessions ADD COLUMN IF NOT EXISTS external_issuer text;
ALTER TABLE calendar.sessions ADD COLUMN IF NOT EXISTS external_subject text;
CREATE TABLE IF NOT EXISTS calendar.external_identities (
  gym_id text NOT NULL REFERENCES calendar.gyms(id),
  issuer text NOT NULL,
  subject text NOT NULL,
  user_id text NOT NULL REFERENCES calendar.users(id) ON DELETE CASCADE,
  PRIMARY KEY (gym_id, issuer, subject),
  UNIQUE (gym_id, issuer, user_id)
);
