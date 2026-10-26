CREATE SCHEMA IF NOT EXISTS calendar;

CREATE TABLE IF NOT EXISTS calendar.gyms(
  id text PRIMARY KEY,
  name text,
  config jsonb NOT NULL,
  revision bigint NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS calendar.bookings(
  id text NOT NULL,
  gym_id text NOT NULL REFERENCES calendar.gyms(id),
  data jsonb NOT NULL,
  PRIMARY KEY(gym_id,id),
  CHECK(data->>'status' IN ('PENDING','CONFIRMED','CANCELLED','COMPLETED','NO_SHOW'))
);

CREATE INDEX IF NOT EXISTS bookings_date ON calendar.bookings(gym_id, (data->>'date'));

CREATE TABLE IF NOT EXISTS calendar.attendance(
  id text PRIMARY KEY,
  gym_id text NOT NULL REFERENCES calendar.gyms(id),
  employee_id text NOT NULL,
  clock_in timestamptz NOT NULL DEFAULT now(),
  clock_out timestamptz,
  CHECK(clock_out IS NULL OR clock_out >= clock_in)
);

CREATE UNIQUE INDEX IF NOT EXISTS attendance_one_open_shift ON calendar.attendance(gym_id,employee_id) WHERE clock_out IS NULL;
CREATE INDEX IF NOT EXISTS attendance_by_gym_and_time ON calendar.attendance(gym_id,clock_in DESC);

CREATE TABLE IF NOT EXISTS calendar.users(
  id text PRIMARY KEY,
  gym_id text NOT NULL REFERENCES calendar.gyms(id),
  employee_id text NOT NULL,
  username text NOT NULL,
  role text NOT NULL CHECK(role IN ('ADMIN','RECEPTION','TRAINER')),
  password_hash text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  UNIQUE(gym_id,username),
  UNIQUE(gym_id,employee_id)
);

CREATE TABLE IF NOT EXISTS calendar.sessions(
  token_hash text PRIMARY KEY,
  user_id text NOT NULL REFERENCES calendar.users(id),
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS sessions_user ON calendar.sessions(user_id);
