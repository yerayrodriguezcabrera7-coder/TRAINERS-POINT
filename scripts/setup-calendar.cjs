require("dotenv/config");
const { Pool } = require("pg");
const { Store } = require("../dist/calendar/store");
(async () => {
  if (!process.env.DATABASE_URL) throw Error("Falta DATABASE_URL.");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const store = new Store(pool);
    await store.migrate();
    const schedule = Array.from({ length: 7 }, (_, i) => ({
      open: "09:00",
      close: i === 5 ? "14:00" : "21:00",
      closed: i === 6,
    }));
    await store.seed(process.env.CALENDAR_GYM || "cobosu-bizkaia", {
      timezone: "Europe/Madrid",
      schedule,
      employees: [
        { id: "e1", name: "Entrenador de prueba", color: "#8498bc", schedule },
      ],
      services: [
        { id: "s1", name: "Personal 60 minutos", duration: 60, capacity: 1 },
        { id: "s2", name: "Valoración 45 minutos", duration: 45, capacity: 1 },
        { id: "s3", name: "Clase grupal", duration: 60, capacity: 4 },
      ],
      rooms: [{ id: "r1", name: "Sala principal" }],
      clients: [
        {
          id: "c1",
          name: "Cliente de prueba",
          email: "cliente@example.com",
          phone: "",
          notes: "",
        },
      ],
    });
    console.log(
      "Esquema calendar preparado. Los datos existentes se conservan.",
    );
  } finally {
    await pool.end();
  }
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
