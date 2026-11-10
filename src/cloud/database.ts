import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { PoolConfig } from "pg";

export function databaseConfig(connectionString?: string, caFile = process.env.DATABASE_SSL_CA_FILE): { prismaUrl?: string; pg: PoolConfig } {
  if (!connectionString) return { pg: {} };
  const url = new URL(connectionString);
  const rds = /\.rds\.amazonaws\.com(?:\.cn)?$/.test(url.hostname);
  if (rds && !caFile) throw Error("Configura DATABASE_SSL_CA_FILE con el certificado CA de RDS antes de conectar la base de datos.");
  if (!caFile) return { prismaUrl: connectionString, pg: { connectionString } };
  const path = resolve(caFile), ca = readFileSync(path, "utf8");
  if (!ca.includes("-----BEGIN CERTIFICATE-----")) throw Error("DATABASE_SSL_CA_FILE no contiene un certificado CA válido.");
  const prisma = new URL(url);
  prisma.searchParams.set("sslmode", "require");
  prisma.searchParams.set("sslaccept", "strict");
  prisma.searchParams.set("sslcert", path);
  // node-postgres otherwise lets URL SSL parameters overwrite the explicit CA.
  for (const key of ["sslmode", "sslaccept", "sslcert", "sslrootcert", "sslkey", "sslpassword", "sslidentity", "ssl", "uselibpqcompat"])
    url.searchParams.delete(key);
  return {
    prismaUrl: prisma.toString(),
    pg: { connectionString: url.toString(), ssl: { ca, rejectUnauthorized: true } },
  };
}
