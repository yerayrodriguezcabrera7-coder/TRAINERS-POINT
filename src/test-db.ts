import { prisma } from "./lib/prisma";

async function main(): Promise<void> {
  const result = await prisma.$queryRaw<Array<{ connected: number }>>`SELECT 1 AS connected`;
  console.log("Conexión a PostgreSQL correcta:", result[0]?.connected === 1);
}

main()
  .catch((error: unknown) => {
    console.error("No se pudo conectar a PostgreSQL:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
