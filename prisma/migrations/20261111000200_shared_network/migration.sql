ALTER TABLE "Gym" ADD COLUMN "brand" "ClientBrand" NOT NULL DEFAULT 'TRAINERS_POINT';
UPDATE "Gym" SET brand='COBOSU' WHERE name ILIKE '%cobosu%';
-- Never silently merge different people or credentials during a network migration.
DO $$ BEGIN
 IF EXISTS (SELECT lower(username) FROM calendar.users WHERE role<>'CLIENT' GROUP BY lower(username) HAVING count(*)>1)
 THEN RAISE EXCEPTION 'Hay usuarios de trabajadores repetidos entre centros. Revisar las cuentas antes de compartir la red.'; END IF;
 IF EXISTS (SELECT employee_id FROM calendar.users WHERE role<>'CLIENT' AND employee_id IS NOT NULL GROUP BY employee_id HAVING count(*)>1)
 THEN RAISE EXCEPTION 'Un trabajador tiene varias cuentas. Revisarlas antes de compartir la red.'; END IF;
 IF EXISTS (SELECT e->>'id' FROM calendar.gyms g,jsonb_array_elements(g.config->'employees') e
   GROUP BY e->>'id' HAVING count(DISTINCT lower(trim(e->>'name')))>1)
 THEN RAISE EXCEPTION 'Hay identificadores de trabajadores asignados a nombres diferentes. Revisarlos antes de compartir la red.'; END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS staff_network_username ON calendar.users(lower(username)) WHERE role<>'CLIENT';
CREATE UNIQUE INDEX IF NOT EXISTS staff_network_employee ON calendar.users(employee_id) WHERE role<>'CLIENT' AND employee_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS calendar.shared_staff(id text PRIMARY KEY,data jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS calendar.shared_leaves(id text PRIMARY KEY,data jsonb NOT NULL);
INSERT INTO calendar.shared_staff(id,data) SELECT DISTINCT ON(e->>'id') e->>'id',e
 FROM calendar.gyms g,jsonb_array_elements(COALESCE(g.config->'employees','[]'::jsonb)) e ORDER BY e->>'id',g.id ON CONFLICT(id) DO NOTHING;
INSERT INTO calendar.shared_leaves(id,data) SELECT DISTINCT ON(e->>'id') e->>'id',e
 FROM calendar.gyms g,jsonb_array_elements(COALESCE(g.config->'leaveRequests','[]'::jsonb)) e ORDER BY e->>'id',g.id ON CONFLICT(id) DO NOTHING;
CREATE INDEX IF NOT EXISTS bookings_network_employee_day ON calendar.bookings((data->>'employeeId'),(data->>'date'));
CREATE INDEX IF NOT EXISTS bookings_network_client_day ON calendar.bookings((data->>'clientId'),(data->>'date'));
