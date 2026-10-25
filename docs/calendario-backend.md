> Nota: este documento describe el calendario en modo independiente (`npm run dev:calendar`). En la aplicación integrada el calendario se sirve en `/calendario/` y se arranca con `npm start` (ver README de la raíz).

# Calendario: API, PostgreSQL y sincronización

## Arrancar en desarrollo

Node.js 22 o superior. Desde la raíz de TRAINERS-POINT:

```sh
npm install
npm run dev:calendar
```

Abrir http://127.0.0.1:3000 para el calendario o http://127.0.0.1:3000/fichajes.html para el control horario. Este comando arranca PostgreSQL **local e independiente**, prepara datos ficticios mínimos y conecta automáticamente las pantallas. Los datos y la clave quedan en `.calendar-dev/` (ignorado por Git). Ctrl+C cierra los procesos; el siguiente arranque conserva datos. Si 55439 está ocupado, usar CALENDAR_DEV_DB_PORT. No hace falta Live Server.

Live Server conserva la demostración anterior con localStorage, sin sincronización del servidor. La copia de `Practicas/Calendario` fuera de TRAINERS-POINT tampoco se modifica. Para este backend abrir el calendario desde el puerto 3000.

## PostgreSQL del equipo

Crear `.env` a partir de `.env.example` y configurar DATABASE_URL y una clave aleatoria CALENDAR_ADMIN_TOKEN (mínimo 24 caracteres). Después:

```sh
npm run db:calendar
npm run build
npm start
```

`db:calendar` crea el esquema `calendar` y un gimnasio con recursos ficticios si no existía. No reemplaza los datos existentes. Solo ejecutar en la base de desarrollo destinada al proyecto. Las tablas existentes del módulo Prisma de clientes no se modifican: falta acordar y conectar sus IDs/modelos con este módulo.

El servidor escucha únicamente en 127.0.0.1. Incluye usuarios individuales con contraseñas derivadas mediante scrypt y sal aleatoria, sesiones de 12 horas cuyo token se almacena con SHA-256 en PostgreSQL, y autorización en cada ruta. La clave CALENDAR_ADMIN_TOKEN solo sirve para configurar el centro mientras no exista ningún usuario; el modo local la facilita automáticamente solo durante esa fase. Al crear la primera cuenta ADMIN, se devuelve una sesión individual y la clave inicial deja de autorizar peticiones. No hay contraseñas predeterminadas. Al modificar una cuenta se revocan sus sesiones; también se comprueba que el empleado esté activo en cada petición. Se impide desactivar al último administrador.

El acceso de desarrollo sigue limitado al ordenador. Para publicar faltan HTTPS, política de recuperación de contraseñas, controles de abuso distribuidos y auditoría de accesos/cambios. El límite de login actual es 20 intentos fallidos por IP en 15 minutos y por proceso. No se ha conectado ningún proveedor de identidad empresarial.

## Rutas

Cabecera del panel: `Authorization: Bearer <session-token>` (la clave CALENDAR_ADMIN_TOKEN se admite solo durante la configuración inicial). Todas las peticiones con cuerpo usan `Content-Type: application/json`. El gimnasio se selecciona mediante CALENDAR_GYM en el servidor, nunca mediante un campo confiado al cliente.

| Método y ruta | Uso |
|---|---|
| POST /api/login | `{username,password}` devuelve token individual y rol |
| POST /api/logout | Revoca la sesión actual |
| GET /api/me | Identidad y perfil del usuario autenticado |
| GET /api/manage | Datos de gestión filtrados por perfil; nunca devuelve contraseñas ni hashes |
| POST /api/manage/:collection | `{record,revision}` crea cliente, servicio o empleado (clients/services/employees) |
| PUT /api/manage/:collection/:id | `{record,revision}` modifica una ficha, con control de revisión |
| POST /api/manage/users | `{record:{employeeId,username,password,role,enabled}}`; solo ADMIN |
| PUT /api/manage/users/:id | Misma ficha de acceso; password opcional para conservarla |
| GET /api/state | Configuración, clientes, citas y revisión; requiere clave |
| GET /api/slots?date=2030-10-22&employeeId=e1&serviceId=s1&roomId=r1 | Franjas libres; añadir sessionId para unirse a una clase existente |
| POST /api/bookings | Crear cita con `{booking, client?}`; cliente nuevo y cita se guardan atómicamente |
| PUT /api/bookings/:id | Editar/cancelar/reactivar; `{booking}` debe incluir la versión leída |
| PUT /api/config | `{config, revision}`; horarios generales y semanales por entrenador, recursos, duraciones y aforo |
| GET /api/attendance?from=2026-10-22&to=2026-10-28 | Empleados y jornadas que coinciden con el período; máximo 93 días |
| POST /api/attendance/clock | Entrada o salida con `{employeeId, action:"IN"}` o `{employeeId, action:"OUT"}` |
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
- Intersección entre apertura del centro y horario del entrenador. Semanas de lunes a domingo; `employees[].shifts` permite excepciones `{date,periods:[{open,close}]}` que sustituyen al horario semanal, con varias franjas sin solapamiento o un array vacío para un día libre.
- Intersección de intervalos semiabiertos: una cita que termina a las 11:00 permite otra a las 11:00.
- Todas las citas excepto CANCELLED ocupan horario. Un mismo cliente tampoco puede tener citas solapadas.
- `services[].capacity=1` para individual. Para grupos configurar capacidad mayor que uno y compartir `sessionId`, entrenador, sala, servicio, fecha e inicio/fin exactos. Cada inscripción es una reserva distinta. No basta elegir un servicio grupal para permitir solapamiento con otra clase. La gestión visual de sesiones grupales queda pendiente; la API ya las admite.
- PENDING → CONFIRMED/CANCELLED; CONFIRMED → CANCELLED/COMPLETED/NO_SHOW; CANCELLED → PENDING/CONFIRMED (revalida hueco). COMPLETED y NO_SHOW son finales. No se permite cerrar una cita antes de su fin.
- Se conservan las referencias de todas las reservas históricas. Los cambios de configuración revalidan duración, actividad y disponibilidad de reservas PENDING/CONFIRMED desde la fecha actual. Las citas pasadas conservan su hora final aunque cambie la duración del servicio; no se guarda todavía una instantánea histórica de nombre/precio del servicio. No se puede desactivar un empleado con jornada abierta ni eliminar empleados con usuarios o fichajes.

## Gestión y perfiles

Clientes, servicios y empleados se guardan en el JSONB `calendar.gyms.config`, aprovechando las transacciones existentes. No se han unificado aún con las tablas Prisma de otra rama. Clientes: nombre, correo, teléfono, notas, fecha de nacimiento y estado ACTIVE/INACTIVE/BLOCKED. Servicios: nombre, descripción, duración, aforo, precio y actividad. Empleados: nombre, correo, puesto, color, actividad, horario semanal y excepciones. Los campos nuevos son opcionales para conservar datos antiguos.

- ADMIN: gestión completa, configuración, cuentas y fichajes de todos los empleados.
- RECEPTION: clientes y reservas; lectura de servicios. Solo consulta sus turnos y fichajes y registra su propia entrada/salida.
- TRAINER: solo sus turnos y fichajes; no recibe fichas de clientes, reservas ni cuentas.

El puesto laboral es un texto descriptivo; el perfil de seguridad se asigna explícitamente en Usuarios. Cambiar el texto del puesto no concede permisos. Las categorías iniciales son fijas y pueden ampliarse en código. Una cuenta por empleado. Las bajas conservan los datos para no romper el historial.

## Concurrencia y actualización

Cada escritura usa una conexión PostgreSQL, BEGIN READ COMMITTED y SELECT ... FOR UPDATE sobre la fila del gimnasio **antes de leer disponibilidad**. Se validan recursos, aforo y versión, se escribe y se incrementa la revisión en la misma transacción. El siguiente escritor espera y consulta el estado ya confirmado. Configuración, nuevos clientes y cancelaciones siguen el mismo protocolo. El bloqueo es por gimnasio, conservador: reduce concurrencia dentro de un centro, pero evita carreras también entre procesos/servidores distintos.

Todas las escrituras deben pasar por Store; no escribir directamente en las tablas desde Prisma u otros servicios sin respetar este protocolo. Documentación: https://www.postgresql.org/docs/17/explicit-locking.html y https://node-postgres.com/features/transactions.

Cada empleado puede tener una sola jornada abierta. PostgreSQL lo garantiza mediante un índice único parcial, incluso si dos dispositivos intentan registrar la entrada a la vez. La salida bloquea la jornada abierta antes de cerrarla. La plantilla se obtiene de `config.employees`; la pantalla no presupone una cantidad fija de trabajadores.

El panel hace polling cada 2 segundos y repinta al cambiar `revision`. Mantiene los formularios abiertos; si otra persona editó esa cita, su versión antigua recibe 409 y debe reabrirse. Sin conexión muestra un aviso, reintenta y nunca guarda una reserva como si hubiera sido confirmada. No hay WebSockets: la latencia normal es hasta 2 segundos más red/servidor.

## Verificar

```sh
npm test
```

Pruebas contra un PostgreSQL temporal real, sin usar DATABASE_URL ni datos del usuario: solicitudes simultáneas desde dos pools independientes, aforo, estados, cancelación/reactivación, franjas, edición concurrente, rollback, aislamiento entre gimnasios y API pública visible desde dos instancias HTTP. Además se conservan las pruebas del calendario local.
