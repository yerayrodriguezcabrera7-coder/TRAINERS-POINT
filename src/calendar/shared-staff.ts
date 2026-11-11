import type { Pool, PoolClient } from "pg";
type Connection = Pool | PoolClient;
export const networkLock = "calendar:shared-network";
export const sharedStaffMigration = `
CREATE TABLE IF NOT EXISTS calendar.shared_staff(id text PRIMARY KEY, data jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS calendar.shared_leaves(id text PRIMARY KEY, data jsonb NOT NULL);
INSERT INTO calendar.shared_staff(id,data)
 SELECT DISTINCT ON (e->>'id') e->>'id',e FROM calendar.gyms g,
 jsonb_array_elements(COALESCE(g.config->'employees','[]'::jsonb)) e
 ORDER BY e->>'id',g.id ON CONFLICT(id) DO NOTHING;
INSERT INTO calendar.shared_leaves(id,data)
 SELECT DISTINCT ON (e->>'id') e->>'id',e FROM calendar.gyms g,
 jsonb_array_elements(COALESCE(g.config->'leaveRequests','[]'::jsonb)) e
 ORDER BY e->>'id',g.id ON CONFLICT(id) DO NOTHING;`;

export async function sharedStaff(db: Connection) {
  let rows=(await db.query("SELECT data FROM calendar.shared_staff ORDER BY lower(data->>'name'),id")).rows;
  if (!rows.length) {
    await db.query(`INSERT INTO calendar.shared_staff(id,data)
      SELECT DISTINCT ON(e->>'id') e->>'id',e FROM calendar.gyms g,
      jsonb_array_elements(COALESCE(g.config->'employees','[]'::jsonb)) e
      ORDER BY e->>'id',g.id ON CONFLICT(id) DO NOTHING`);
    rows=(await db.query("SELECT data FROM calendar.shared_staff ORDER BY lower(data->>'name'),id")).rows;
  }
  return rows.map(row=>row.data);
}
export async function saveStaff(db: Connection, employee: { id: string }, gym?: string) {
  await db.query(`INSERT INTO calendar.shared_staff(id,data) VALUES($1,$2)
    ON CONFLICT(id) DO UPDATE SET data=EXCLUDED.data`,[employee.id,{...employee,color:"#7b858d"}]);
  await db.query("UPDATE calendar.gyms SET revision=revision+1 WHERE id<>COALESCE($1,'')",[gym||null]);
}
export async function saveSharedLeave(db: Connection, leave: { id: string }, gym: string) {
  await db.query(`INSERT INTO calendar.shared_leaves(id,data) VALUES($1,$2)
    ON CONFLICT(id) DO UPDATE SET data=EXCLUDED.data`,[leave.id,leave]);
  await db.query("UPDATE calendar.gyms SET revision=revision+1 WHERE id<>$1",[gym]);
}
