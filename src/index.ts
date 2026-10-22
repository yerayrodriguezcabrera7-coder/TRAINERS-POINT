import "dotenv/config";
import { Pool } from "pg";
import { Store } from "./calendar/store";
import { server } from "./calendar/http";
if (!process.env.DATABASE_URL)
  throw new Error(
    "Configura DATABASE_URL en .env. Consulta docs/calendario-backend.md.",
  );
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
const app = server(
  new Store(pool),
  process.env.CALENDAR_GYM || "cobosu-bizkaia",
  process.env.CALENDAR_ADMIN_TOKEN || "",
);
app.listen(Number(process.env.PORT || 3000), "127.0.0.1", () =>
  console.log(`Calendario: http://127.0.0.1:${process.env.PORT || 3000}`),
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () =>
    app.close(() => {
      void pool.end();
    }),
  );
