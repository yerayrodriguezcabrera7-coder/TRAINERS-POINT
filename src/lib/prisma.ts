import { PrismaClient } from "@prisma/client";
import "dotenv/config";
import { databaseConfig } from "../cloud/database";

declare global {
  var prisma: PrismaClient | undefined;
}

export const prisma = globalThis.prisma ?? new PrismaClient({ datasourceUrl: databaseConfig(process.env.DATABASE_URL).prismaUrl });

if (process.env.NODE_ENV !== "production") {
  globalThis.prisma = prisma;
}
