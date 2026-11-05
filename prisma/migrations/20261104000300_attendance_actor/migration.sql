ALTER TABLE calendar.attendance ADD COLUMN IF NOT EXISTS actor_in jsonb;
ALTER TABLE calendar.attendance ADD COLUMN IF NOT EXISTS actor_out jsonb;
