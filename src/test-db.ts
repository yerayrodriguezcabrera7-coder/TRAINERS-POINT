import { prisma } from "./lib/prisma";

function getPrismaErrorCode(error: unknown): string | undefined {
  if (
    typeof error === "object" &&
    error !== null &&
    "errorCode" in error &&
    typeof error.errorCode === "string"
  ) {
    return error.errorCode;
  }

  return undefined;
}

async function main(): Promise<void> {
  try {
    await prisma.$queryRaw<Array<{ connected: number }>>`SELECT 1 AS connected`;
    console.log("Conexión a PostgreSQL correcta.");
  } catch (error: unknown) {
    const errorCode = getPrismaErrorCode(error);
    const message =
      errorCode === "P1000"
        ? "PostgreSQL rechazó las credenciales. Comprueba el usuario y la contraseña."
        : errorCode === "P1003"
          ? "La base de datos configurada no existe. Comprueba el nombre en DATABASE_URL."
          : errorCode === "P1013"
            ? "DATABASE_URL no tiene un formato válido. Codifica los caracteres especiales de la contraseña."
            : errorCode === "P1010"
              ? "El usuario no tiene permiso para acceder a la base de datos."
              : errorCode === "P1001" || errorCode === "P1002"
                ? "No se alcanza el servidor. Comprueba el endpoint, el puerto 5432, DNS y las reglas de red de AWS."
                : "No se pudo conectar. Comprueba DATABASE_URL, TLS y el acceso de red a RDS.";

    console.error(message);
    console.error("Por seguridad, no se muestran la URL, la contraseña ni el error completo.");
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main();
