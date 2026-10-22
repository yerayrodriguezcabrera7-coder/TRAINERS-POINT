# Calendario: API, PostgreSQL y sincronización

## Arrancar en desarrollo

Node.js 22 o superior. Desde la raíz de TRAINERS-POINT:

```sh
npm install
npm run dev:calendar
```

Abrir http://127.0.0.1:3000 e introducir la clave que muestra la terminal. Este comando arranca PostgreSQL **local e independiente**, prepara datos ficticios mínimos y sirve el calendario. Los datos y la clave quedan en `.calendar-dev/` (ignorado por Git). Ctrl+C cierra los procesos; el siguiente arranque conserva datos. Si 55439 está ocupado, usar CALENDAR_DEV_DB_PORT. No hace falta Live Server.

Live Server conserva la demostración anterior con localStorage, sin sincronización del servidor. La copia de `Practicas/Calendario` fuera de TRAINERS-POINT tampoco se modifica. Para este backend abrir el calendario desde el puerto 3000.

## PostgreSQL del equipo

Crear `.env` a partir de `.env.example` y configurar DATABASE_URL y una clave aleatoria CALENDAR_ADMIN_TOKEN (mínimo 24 caracteres). Después:

```sh
npm run db:calendar
npm run build
npm start
```

`db:calendar` crea el esquema `calendar` y un gimnasio con recursos ficticios si no existía. No reemplaza los datos existentes. Solo ejecutar en la base de desarrollo destinada al proyecto. Las tablas existentes del módulo Prisma de clientes no se modifican: falta acordar y conectar sus IDs/modelos con este módulo.

El servidor escucha únicamente en 127.0.0.1. La clave de desarrollo protege todas las rutas del panel; se introduce en el navegador y se conserva en sessionStorage. Antes de publicar, integrar el login del equipo y autorización por usuario/gimnasio (administrador, entrenador y recepcionista), HTTPS y controles de abuso del formulario público. La clave compartida no es un sistema de usuarios de producción.

## Rutas

Cabecera del panel: `Authorization: Bearer <CALENDAR_ADMIN_TOKEN>`. Todas las peticiones con cuerpo usan `Content-Type: application/json`. El gimnasio se selecciona mediante CALENDAR_GYM en el servidor, nunca mediante un campo confiado al cliente.

| Método y ruta | Uso |
|---|---|
| GET /api/state | Configuración, clientes, citas y revisión; requiere clave |
| GET /api/slots?date=2030-10-22&employeeId=e1&serviceId=s1&roomId=r1 | Franjas libres; añadir sessionId para unirse a una clase existente |
| POST /api/bookings | Crear cita con `{booking, client?}`; cliente nuevo y cita se guardan atómicamente |
| PUT /api/bookings/:id | Editar/cancelar/reactivar; `{booking}` debe incluir la versión leída |
| PUT /api/config | `{config, revision}`; horarios generales y semanales por entrenador, recursos, duraciones y aforo |
| GET /api/public/catalog | Recursos y sesiones sin datos personales de los clientes |
| GET /api/public/slots | Misma consulta de disponibilidad, sin requerir clave |
| POST /api/public/bookings | `{booking, client:{name,email,phone?}}`; el servidor crea el cliente y fuerza PENDING |

Ejemplo de `booking`:

```json
{"clientId":"c1","employeeId":"e1","serviceId":"s1","roomId":"r1","date":"2030-10-22","start":"10:00","status":"CONFIRMED","notes":""}
```

El servidor calcula `end` a partir del servicio. Si se envía, tiene que coincidir. Al actualizar enviar todos los campos devueltos, incluida `version`. Respuestas: 400 datos inválidos, 401 clave incorrecta, 404 recurso inexistente, 409 conflicto de disponibilidad/versión/estado, 503 bloqueo agotado (reintentar leyendo antes el estado).

## Disponibilidad y clases

- Horas locales del gimnasio (Europe/Madrid por defecto), citas dentro del mismo día y franjas cada 15 minutos. Servicios de 45 o 60 minutos, entre otros. Rechaza fechas inválidas y horas ambiguas/inexistentes de cambios de hora.
- Intersección entre apertura del centro y horario del entrenador. Semanas de lunes a domingo, una franja continua por día; faltan turnos partidos, festivos y vacaciones.
- Intersección de intervalos semiabiertos: una cita que termina a las 11:00 permite otra a las 11:00.
- Todas las citas excepto CANCELLED ocupan horario. Un mismo cliente tampoco puede tener citas solapadas.
- `services[].capacity=1` para individual. Para grupos configurar capacidad mayor que uno y compartir `sessionId`, entrenador, sala, servicio, fecha e inicio/fin exactos. Cada inscripción es una reserva distinta. No basta elegir un servicio grupal para permitir solapamiento con otra clase. La gestión visual de sesiones grupales queda pendiente; la API ya las admite.
- PENDING → CONFIRMED/CANCELLED; CONFIRMED → CANCELLED/COMPLETED/NO_SHOW; CANCELLED → PENDING/CONFIRMED (revalida hueco). COMPLETED y NO_SHOW son finales. No se permite cerrar una cita antes de su fin.
- Cambiar la configuración valida todas las reservas existentes, incluidas las históricas. Evita borrar referencias o modificar duración/horarios que las invaliden; la configuración histórica versionada queda para una ampliación.

## Concurrencia y actualización

Cada escritura usa una conexión PostgreSQL, BEGIN READ COMMITTED y SELECT ... FOR UPDATE sobre la fila del gimnasio **antes de leer disponibilidad**. Se validan recursos, aforo y versión, se escribe y se incrementa la revisión en la misma transacción. El siguiente escritor espera y consulta el estado ya confirmado. Configuración, nuevos clientes y cancelaciones siguen el mismo protocolo. El bloqueo es por gimnasio, conservador: reduce concurrencia dentro de un centro, pero evita carreras también entre procesos/servidores distintos.

Todas las escrituras deben pasar por Store; no escribir directamente en las tablas desde Prisma u otros servicios sin respetar este protocolo. Documentación: https://www.postgresql.org/docs/17/explicit-locking.html y https://node-postgres.com/features/transactions.

El panel hace polling cada 2 segundos y repinta al cambiar `revision`. Mantiene los formularios abiertos; si otra persona editó esa cita, su versión antigua recibe 409 y debe reabrirse. Sin conexión muestra un aviso, reintenta y nunca guarda una reserva como si hubiera sido confirmada. No hay WebSockets: la latencia normal es hasta 2 segundos más red/servidor.

## Verificar

```sh
npm test
```

Pruebas contra un PostgreSQL temporal real, sin usar DATABASE_URL ni datos del usuario: solicitudes simultáneas desde dos pools independientes, aforo, estados, cancelación/reactivación, franjas, edición concurrente, rollback, aislamiento entre gimnasios y API pública visible desde dos instancias HTTP. Además se conservan las pruebas del calendario local.
