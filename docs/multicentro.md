# Plantilla y clientes compartidos entre centros

## Funcionamiento

- Una instalación representa la red de centros de la empresa. La plantilla y las cuentas de administración, recepción y trabajadores son comunes a toda la red.
- Al cambiar de centro se conserva la sesión y el rol. Un entrenador continúa viendo únicamente sus reservas y fichajes; cambiar de sede no concede permisos de recepción o administración.
- Profesionales y Usuarios muestran avatares neutros. El color de las citas identifica el servicio, no al trabajador.
- La marca del centro se configura en **Centros → editar → Marca**. El nombre comercial puede cambiar sin modificar su marca.
- Los clientes con marca **Trainers Point** comparten una única ficha entre las sedes Trainers Point: disponibilidad habitual, notas, medidas, rutina, bonos, recuperaciones y deudas. El centro donde se dieron de alta se conserva como origen; no se crean copias al cambiar de sede.
- Los clientes Cobosu permanecen en su centro. Un centro Cobosu no obtiene acceso a los clientes de otra sede por compartir la plantilla.

## Calendario, ausencias y fichajes

Las reservas conservan el centro donde se realizan. La disponibilidad comprueba las citas del trabajador en toda la red y no permite agendarlo simultáneamente en dos centros. También impide reservas simultáneas de un mismo cliente de la base de datos.

Las vacaciones y permisos aprobados afectan al trabajador en todos los centros. Antes de aprobarlos o modificar sus horarios se revisan las reservas existentes para evitar dejarlas fuera de disponibilidad.

Un bono o una recuperación no puede consumirse dos veces desde sedes diferentes. Reprogramar una recuperación mantiene el crédito original y no genera un segundo cobro.

Un trabajador solo puede tener un fichaje abierto en toda la red. La pantalla indica dónde comenzó, incluso al cambiar de centro, y permite registrar la salida conservando el registro original y la autoría. El historial cerrado y su exportación siguen vinculados al centro de entrada; no se duplican las horas en los informes.

## Cobros y productos

Recepción puede consultar y cobrar la deuda de un cliente Trainers Point desde otra sede Trainers Point. Cada recibo pertenece a la caja que recibe el pago, aunque la venta original sea de otra sede. Los pagos simultáneos bloquean la misma venta para impedir sobrecobros.

El stock y las cajas son locales. Las devoluciones y anulaciones de productos se gestionan en el centro de la venta para reponer las unidades en el inventario correcto. El historial general de ventas sigue siendo local; al consultar una ficha concreta puede verse su historial compartido.

## Código y actualización de datos

- `src/network/scope.ts`: criterios comunes para acceder a clientes y ventas entre sedes.
- `src/calendar/shared-staff.ts`: registro único de trabajadores y ausencias (`calendar.shared_staff` y `calendar.shared_leaves`). Los antiguos JSON por centro se conservan por compatibilidad y se hidratan con este registro al leerlos.
- `src/calendar/access.ts`: cuentas compartidas y comprobación del rol, tanto con acceso local como con Cognito si se configura posteriormente.
- `src/calendar/store.ts`: disponibilidad, reservas, recuperaciones y fichajes.
- `prisma/migrations/20261111000200_shared_network/migration.sql`: marca de centros, registro compartido e índices de cuentas y disponibilidad.
- `tests/network.test.cjs`: pruebas con tres centros, clientes de ambas marcas, acceso real por HTTP y operaciones concurrentes. Utiliza una base temporal independiente.

Antes de actualizar una instalación con datos, guardar una copia con `npm run db:backup` y aplicar `npx prisma migrate deploy`. La migración se detiene si encuentra cuentas de trabajadores duplicadas o un mismo identificador de trabajador con nombres diferentes; no fusiona identidades ni contraseñas automáticamente. Revisar esas coincidencias antes de continuar.

Las sedes antiguas cuyo nombre contiene «Cobosu» se clasifican inicialmente como Cobosu; el resto, como Trainers Point. Administración debe revisar **Marca** en Centros si la denominación no refleja la marca real. La plantilla debe editarse desde Profesionales para validar el efecto en todas las sedes.

No requiere contratar APIs ni servicios de pago. No activa AWS, pagos bancarios ni envío de mensajes.
