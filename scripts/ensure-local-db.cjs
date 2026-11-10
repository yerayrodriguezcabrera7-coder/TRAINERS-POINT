const { spawnSync } = require("node:child_process");
const { randomBytes } = require("node:crypto");
const { promises: fs } = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const localDir = path.join(root, ".calendar-dev");
const databaseDir = path.join(localDir, "db");
const credentialsFile = path.join(localDir, "credentials.json");
const envFile = path.join(root, ".env");
const platformPackage = `${process.platform === "win32" ? "windows" : process.platform}-${process.arch}`;
const binaryDir = path.join(root, "node_modules", "@embedded-postgres", platformPackage, "native", "bin");
const pgCtl = path.join(binaryDir, process.platform === "win32" ? "pg_ctl.exe" : "pg_ctl");
const initDb = path.join(binaryDir, process.platform === "win32" ? "initdb.exe" : "initdb");

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: "ignore", windowsHide: true });
  if (result.error) throw result.error;
  return result;
}

function setEnvValue(contents, name, value) {
  const line = `${name}=${JSON.stringify(value)}`;
  const matcher = new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=.*$`, "m");
  return matcher.test(contents)
    ? contents.replace(matcher, line)
    : `${contents.trimEnd()}${contents.trim() ? "\n" : ""}${line}\n`;
}

async function main() {
  console.log("Preparando PostgreSQL local…");
  await fs.mkdir(localDir, { recursive: true });
  const portLine = (await fs.readFile(envFile, "utf8").catch(() => ""))
    .match(/^\s*CALENDAR_DEV_DB_PORT\s*=\s*"?(\d+)"?\s*$/m);
  const port = Number(portLine?.[1] || 55439);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("CALENDAR_DEV_DB_PORT debe ser un puerto válido.");
  }

  let credentials;
  try {
    credentials = JSON.parse(await fs.readFile(credentialsFile, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw new Error("No se pudieron leer las credenciales locales.");
    if (await fs.stat(path.join(databaseDir, "PG_VERSION")).then(() => true).catch(() => false)) {
      throw new Error("Falta .calendar-dev/credentials.json para la base local ya existente.");
    }
    credentials = { password: randomBytes(32).toString("hex"), token: randomBytes(32).toString("hex") };
    await fs.writeFile(credentialsFile, `${JSON.stringify(credentials, null, 2)}\n`, { flag: "wx" });
  }
  if (typeof credentials.password !== "string" || !credentials.password) {
    throw new Error("Las credenciales locales no contienen una contraseña válida.");
  }

  const initialized = await fs.stat(path.join(databaseDir, "PG_VERSION")).then(() => true).catch(() => false);
  if (!initialized) {
    const existingFiles = await fs.readdir(databaseDir).catch(() => []);
    if (existingFiles.length) {
      throw new Error("La carpeta local de PostgreSQL no está inicializada y contiene archivos; no se modificó.");
    }
    const passwordFile = path.join(localDir, ".postgres-password.tmp");
    try {
      await fs.writeFile(passwordFile, `${credentials.password}\n`, { flag: "wx" });
      const result = run(initDb, [
        `--pgdata=${databaseDir}`,
        "--auth=password",
        "--username=postgres",
        `--pwfile=${passwordFile}`,
      ]);
      if (result.status !== 0) throw new Error("No se pudo inicializar PostgreSQL local.");
    } finally {
      await fs.rm(passwordFile, { force: true });
    }
  }

  let envContents = await fs.readFile(envFile, "utf8").catch(error => {
    if (error.code === "ENOENT") return "";
    throw error;
  });
  const connectionUrl = `postgresql://postgres:${encodeURIComponent(credentials.password)}@127.0.0.1:${port}/postgres?schema=public&sslmode=disable`;
  envContents = setEnvValue(envContents, "DATABASE_URL", connectionUrl);
  envContents = setEnvValue(envContents, "CALENDAR_DATABASE_URL", connectionUrl);
  envContents = setEnvValue(envContents, "TRAINERS_POINT_DEV_ADMIN", "true");
  await fs.writeFile(envFile, envContents);

  const logFile = path.join(localDir, "postgres.log");
  console.log("Iniciando PostgreSQL local…");
  console.log("Comprobando estado del servidor…");
  const status = run(pgCtl, ["-D", databaseDir, "status"]);
  console.log(`Estado de PostgreSQL: ${status.status === 0 ? "iniciado" : "detenido"}.`);
  if (status.status !== 0) {
    console.log("Arrancando servicio local…");
    const start = run(pgCtl, [
      "-D", databaseDir,
      "-l", logFile,
      "-o", `-p ${port} -h 127.0.0.1`,
      "start",
    ]);
    if (start.status !== 0) throw new Error("No se pudo iniciar PostgreSQL local; revisa .calendar-dev/postgres.log.");
    console.log("Servicio local iniciado.");
  }

  console.log("Verificando conexión local…");
  const { Pool } = require("pg");
  const pool = new Pool({ connectionString: connectionUrl });
  try {
    await pool.query("SELECT 1");
  } catch {
    throw new Error("PostgreSQL local está iniciado, pero no acepta conexiones con la configuración local.");
  } finally {
    await pool.end();
  }
  console.log(`Base de datos local lista en 127.0.0.1:${port}.`);
}

main().catch(error => {
  console.error(`No se pudo preparar la base local: ${error.message}`);
  process.exitCode = 1;
});
