# Puesta en marcha de Trainers Point

## Estado del trabajo

Se ha unificado el cobro de productos y bonos en Sale/Payment. Los bonos pendientes permiten pagos parciales por efectivo, tarjeta o Bizum; al completar el saldo se habilita el bono y desaparece su deuda de la agenda. Cada recibo se incorpora a la caja abierta sin contar una deuda dos veces. Los bonos ya pagados anteriormente no generan un segundo cobro. En la ficha, «Registrar pago del bono» abre su venta asociada; el bono y esa venta no aparecen como dos compras distintas.

Una compra de bono que ya se cobra al crearla registra el recibo en el mismo momento. Una compra pendiente registra la venta pero no suma dinero a Caja. Las deudas antiguas sin Sale se enlazan de forma controlada al abrir su gestión de cobro, sin simular un ingreso nuevo. Las anulaciones de productos no pueden cancelar por error un bono y sus derechos de sesiones.

La publicación y los pagos bancarios no están activados automáticamente. Falta que la empresa indique un servidor/dominio y el proveedor de pagos contratado con sus credenciales. No se ha contratado alojamiento, ni se han realizado cargos ni transferido datos de clientes a servicios externos.

## Publicación en un servidor

La carpeta `deploy` contiene una instalación con PostgreSQL 17, aplicación Node 24, migraciones previas al arranque, proxy HTTPS y copias diarias. El contenedor final ejecuta la aplicación con un usuario sin privilegios. La base de datos solo se expone en la red interna. El puerto 3000 del host se publica únicamente en localhost; el acceso público pasa por HTTPS.

1. Preparar un servidor con Docker Compose y un dominio que apunte a él. Abrir los puertos 80 y 443 y conservar el volumen de certificados. Si ya existe un proxy de la empresa, adaptar o desactivar el servicio `proxy` antes de iniciar para no ocupar sus puertos.
2. Copiar `deploy/.env.example` a `deploy/.env`. Generar dos secretos distintos, por ejemplo con `openssl rand -hex 32`, y sustituir contraseña y clave de administración. Usar el dominio real en PUBLIC_ORIGIN. Los valores de ejemplo no son credenciales para operar.
3. Desde la raíz ejecutar `docker compose --env-file deploy/.env -f deploy/compose.yaml up -d --build`. La tarea de migración usa la misma base que la aplicación y se completa antes de arrancarla.
4. Crear la primera cuenta de administración con el comando descrito abajo y reiniciar la aplicación para seleccionar el centro recién creado.
5. Comprobar el acceso por HTTPS, configurar servicios/trabajadores/turnos y realizar la jornada de prueba antes de dar acceso al equipo.

Producción exige PUBLIC_ORIGIN con HTTPS, DATABASE_URL y una clave de administración propia de al menos 32 caracteres. La cuenta provisional admin/admin se rechaza y la clave de arranque nunca se entrega en runtime.js. Un origen o Host ajeno al dominio configurado no se acepta para las operaciones protegidas. `/api/health` comprueba la conexión a PostgreSQL.

No se ha podido construir el contenedor localmente porque Docker no está instalado en este entorno. El arranque del servidor en modo producción se prueba con PostgreSQL temporal. El flujo de GitHub añade también la validación de Compose y la construcción de la imagen para comprobar este artefacto en un entorno con Docker.

## Primera cuenta de administración

No hay una contraseña de producción compartida. Un operador del servidor debe proporcionar las variables ADMIN_USERNAME, ADMIN_NAME, ADMIN_PASSWORD y ADMIN_GYM_NAME, o ADMIN_GYM_ID si el centro ya existe. ADMIN_PASSWORD debe tener al menos 12 caracteres. Evitar guardar la contraseña en el historial del terminal: leerla sin mostrarla o usar el gestor de secretos del servidor.

Con esas variables exportadas en la sesión del operador:

```
docker compose --env-file deploy/.env -f deploy/compose.yaml exec \
  -e ADMIN_USERNAME -e ADMIN_NAME -e ADMIN_PASSWORD -e ADMIN_GYM_NAME -e ADMIN_GYM_ID \
  app node scripts/create-admin.cjs
docker compose --env-file deploy/.env -f deploy/compose.yaml restart app
```

El comando solo crea la primera cuenta de un centro sin cuentas previas. No imprime la contraseña ni reemplaza administradores existentes. Exige cambiar la contraseña en el primer acceso. Crea una configuración inicial sin clientes ficticios y con el catálogo pendiente de configurar.

## Copias de seguridad y recuperación

El servicio `backup` guarda una copia inicial y después una cada 24 horas en `deploy/backups`, con permisos restringidos. Publica el archivo solo si pg_dump termina correctamente; no elimina copias antiguas automáticamente. El operador debe vigilar los fallos y el espacio y conservar copias cifradas en un destino distinto al servidor. Ese destino externo no está configurado porque no se ha facilitado una cuenta o almacenamiento de la empresa.

También se puede hacer una copia manual contra DATABASE_URL con `npm run db:backup`. Requiere las herramientas cliente de PostgreSQL, de la misma versión o superior a la base. PG_DUMP_BIN, PG_RESTORE_BIN y BACKUP_DIR permiten configurar sus rutas. En Mac se detecta libpq de Homebrew cuando está instalado.

Para recuperar una copia en una base de destino ya creada, configurar DATABASE_URL con esa base y ejecutar:

```
npm run db:restore -- /ruta/copia.dump --confirm-restore
```

La restauración reemplaza el contenido de la base elegida y se ejecuta en una sola transacción. Probar primero en una base separada y parar la aplicación antes de restaurar la base de uso real. La comprobación automatizada guarda y restaura una base temporal y verifica que recupera clientes y bonos.

## Jornada de aceptación con el tutor

1. Entrar como recepción y abrir Caja con un importe contado.
2. Añadir un bono pendiente desde la ficha. Verificar que no aparece dinero cobrado.
3. Reservar una sesión con bono pendiente y comprobar el aviso en el calendario.
4. Cobrar una parte en efectivo y el resto con tarjeta/Bizum. Comprobar saldo cero, bono pagado y actualización de la agenda.
5. Reservar con bono pagado, comprobar la sesión descontada, cancelar y verificar que vuelve a estar disponible. Probar una recuperación sin duplicar derechos.
6. Vender un producto y devolverlo: distinguir la vuelta al stock de la devolución efectiva de dinero.
7. Registrar una retirada, contar y cerrar Caja con una diferencia explicada. Verificar que los cierres anteriores no cambian.
8. Entrar como trabajador y comprobar agenda propia, centro de la cita y restricciones de cobros/Caja. Revisar móvil y ordenador.

Los recorridos de cobro, permisos, reservas y Caja se comprueban automáticamente con datos ficticios. La revisión presencial con el tutor sigue siendo una aceptación de negocio que debe hacer la empresa, no sustituirse por una afirmación de que ya la ha realizado.

## Cobros bancarios online

Los botones actuales registran dinero que ya se ha recibido. Activar cargos online requiere elegir el proveedor que utilizará la empresa, la cuenta mercantil, credenciales de pruebas y producción y la dirección pública de la web. No se han inventado estas credenciales ni activado un proveedor arbitrario.

La integración deberá confirmar el pago mediante un aviso firmado del proveedor, verificar importe, moneda y venta, y tratar los avisos repetidos como el mismo pago. Un regreso del navegador a una página de éxito nunca basta para marcarlo pagado. Primero debe validarse en el entorno de pruebas del proveedor y comprobar cómo se separan las liquidaciones bancarias del efectivo físico.

## Referencias de infraestructura

- HTTPS y requisitos de DNS/puertos: https://caddyserver.com/docs/automatic-https
- Variables y archivo de entorno de Compose: https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/
