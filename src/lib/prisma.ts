import "dotenv/config";
import { PrismaClient } from "@prisma/client";

// The development database currently presents a self-signed certificate.
// Keep production certificate verification strict, while making the local
// `npm run dev` command work with the existing DATABASE_URL.
if (process.env.NODE_ENV !== "production" && process.env.DATABASE_URL) {
  process.env.DATABASE_URL = process.env.DATABASE_URL.replace(
    /([?&])sslmode=require(&|$)/,
    "$1sslmode=no-verify$2",
  );
}

declare global {
  var prisma: PrismaClient | undefined;
}

export const prisma = globalThis.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.prisma = prisma;
}
