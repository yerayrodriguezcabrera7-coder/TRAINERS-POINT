// Arranque unificado de Trainers Point: un solo servidor y un solo puerto.
//  - Clientes y gimnasios (Prisma + PostgreSQL en AWS RDS): src/index.ts, sin cambios de lógica.
//  - Calendario: se monta en /calendario/ con su propio PostgreSQL local aislado, igual que
//    scripts/dev-calendar.cjs. NUNCA usa DATABASE_URL (que apunta a AWS).
require("dotenv/config");
const { join, resolve } = require("node:path");
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const { randomBytes } = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { Pool } = require("pg");
(async () => {
  const { default: Embedded } = await import("embedded-postgres");
  const root = resolve(".calendar-dev");
  mkdirSync(root, { recursive: true });
  const secretFile = join(root, "credentials.json");
  if (!existsSync(secretFile))
    writeFileSync(
      secretFile,
      JSON.stringify({
        password: randomBytes(24).toString("hex"),
        token: randomBytes(24).toString("hex"),
      }),
      { mode: 0o600 },
    );
  const { password, token } = JSON.parse(readFileSync(secretFile, "utf8"));
  const dbPort = Number(process.env.CALENDAR_DEV_DB_PORT || 55439);
  const pg = new Embedded({
    databaseDir: join(root, "db"),
    user: "postgres",
    password,
    port: dbPort,
    persistent: true,
    postgresFlags: ["-h", "127.0.0.1"],
    onLog: () => {},
    onError: () => {},
  });
  if (!existsSync(join(root, "db", "PG_VERSION"))) await pg.initialise();
  await pg.start();
  let pool;
  try {
    const connectionString = `postgresql://postgres:${password}@127.0.0.1:${dbPort}/postgres`;
    execFileSync(process.execPath, ["scripts/setup-calendar.cjs"], {
      env: { ...process.env, DATABASE_URL: connectionString },
      stdio: "inherit",
    });
    pool = new Pool({ connectionString });
    const { Store } = require("../dist/calendar/store");
    const { server } = require("../dist/calendar/http");
    const { setCalendarHandler } = require("../dist/calendar-mount");
    const calendar = server(
      new Store(pool),
      process.env.CALENDAR_GYM || "cobosu-bizkaia",
      token,
      { exposeAdminToken: true },
    );
    // El servidor del calendario no escucha por su cuenta: su manejador se monta en el servidor de la aplicación.
    setCalendarHandler(calendar.listeners("request")[0]);
    require("../dist/index"); // inicia el servidor de Trainers Point (clientes + AWS)
    console.log(
      `Calendario: http://localhost:${process.env.PORT || 3000}/calendario/ (PostgreSQL local en .calendar-dev, sin AWS)`,
    );
  } catch (e) {
    await pool?.end();
    await pg.stop();
    throw e;
  }
  let stopping = false;
  pool.on("error", (error) => {
    if (!stopping) console.error("Error de PostgreSQL del calendario:", error.message);
  });
  async function stop() {
    if (stopping) return;
    stopping = true;
    await pool.end();
    await pg.stop();
  }
  for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => void stop());
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
