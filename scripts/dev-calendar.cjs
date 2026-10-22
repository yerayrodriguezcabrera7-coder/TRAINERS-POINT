// PostgreSQL de desarrollo aislado; nunca utiliza DATABASE_URL del equipo.
const { join, resolve } = require("node:path");
const {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} = require("node:fs");
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
  const dbPort = Number(process.env.CALENDAR_DEV_DB_PORT || 55439),
    port = Number(process.env.PORT || 3000);
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
  let pool, app;
  try {
    const connectionString = `postgresql://postgres:${password}@127.0.0.1:${dbPort}/postgres`;
    execFileSync(process.execPath, ["scripts/setup-calendar.cjs"], {
      env: { ...process.env, DATABASE_URL: connectionString },
      stdio: "inherit",
    });
    pool = new Pool({ connectionString });
    const { Store } = require("../dist/calendar/store");
    const { server } = require("../dist/calendar/http");
    app = server(
      new Store(pool),
      process.env.CALENDAR_GYM || "cobosu-bizkaia",
      token,
      { exposeAdminToken: true },
    );
    await new Promise((resolve, reject) => {
      app.once("error", reject);
      app.listen(port, "127.0.0.1", resolve);
    });
    console.log(
      `Calendario local listo: http://127.0.0.1:${port}\nNo necesitas introducir ninguna clave.\nCtrl+C para cerrar. Los datos se conservan en .calendar-dev.`,
    );
  } catch (e) {
    await pool?.end();
    await pg.stop();
    throw e;
  }
  let stopping = false;
  async function stop() {
    if (stopping) return;
    stopping = true;
    await new Promise((r) => app.close(r));
    await pool.end();
    await pg.stop();
  }
  for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => void stop());
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
