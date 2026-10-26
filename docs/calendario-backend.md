# Backend del calendario

El calendario forma parte del servidor unico de Trainers Point y usa PostgreSQL AWS mediante DATABASE_URL.

El esquema propio del calendario se prepara al iniciar la aplicacion. Las reglas de disponibilidad, reservas, fichajes y acceso permanecen en src/calendar/.

Rutas principales:

- POST /api/login
- GET /api/me
- GET /api/state
- GET /api/slots
- POST /api/bookings
- PUT /api/bookings/:id
- GET /api/attendance
- POST /api/attendance/clock

El servidor se inicia desde la raiz con npm start. Ya no existe un servidor independiente, un prefijo de calendario separado ni un PostgreSQL local de desarrollo.
