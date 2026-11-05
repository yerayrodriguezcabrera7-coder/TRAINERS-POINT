CREATE TABLE IF NOT EXISTS calendar.attendance_omissions (
 id uuid PRIMARY KEY, gym_id text NOT NULL REFERENCES calendar.gyms(id), employee_id text NOT NULL,
 day date NOT NULL, kind text NOT NULL CHECK(kind IN ('IN','OUT')),
 note text NOT NULL, actor jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS attendance_omissions_gym_day ON calendar.attendance_omissions(gym_id,day);
