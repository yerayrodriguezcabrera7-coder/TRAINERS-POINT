# TRAINERS-POINT

## Configurar la conexión a PostgreSQL (AWS RDS)

1. Instala Node.js y ejecuta `npm install`.
2. Copia `.env.example` a `.env` en la raíz del proyecto.
3. En AWS RDS, confirma que la instancia está disponible y copia su endpoint exacto. Actualiza `DATABASE_URL` con el endpoint, puerto, nombre de base, usuario y contraseña correctos. No compartas ni subas `.env`.
4. Si la contraseña contiene caracteres reservados de URL, codifícala con percent-encoding (por ejemplo, `@` se escribe `%40`).
5. Comprueba la red desde el equipo que ejecutará la aplicación:

   ```powershell
   Test-NetConnection <endpoint-rds> -Port 5432
   ```

   En macOS o Linux puedes usar `nc -vz <endpoint-rds> 5432`.
6. Ejecuta `npm run db:test` (en Windows PowerShell, `npm.cmd run db:test`).

La URL de ejemplo usa PostgreSQL sobre TLS (`sslmode=require`). Cada ordenador debe poder resolver el endpoint y alcanzar el puerto. Para acceso desde fuera de AWS, configura la red de forma segura: evita abrir el puerto a todo Internet; usa VPN, bastion o una regla limitada a la IP del equipo. El código no puede omitir restricciones de DNS, firewall, VPC o Security Group.

`npm run build` compila TypeScript. Antes de trabajar con el esquema, genera el cliente con `npm run prisma:generate`; aplica migraciones solo cuando el esquema y el entorno compartido estén acordados.

## Página de clientes (desarrollo local)

Después de instalar dependencias y aplicar las migraciones acordadas, ejecuta `npm run dev` (en Windows PowerShell, `npm.cmd run dev`) desde la raíz del proyecto y abre `http://localhost:3000/clientes`. La página permite buscar y filtrar clientes, cambiar su estado y gimnasio, y gestionar sedes. El listado prioriza por defecto a quienes tienen la sesión futura más próxima y muestra las sesiones restantes, los pagos por revisar y el gimnasio; también permite ordenar por pagos o nombre. La próxima sesión se obtiene de las reservas asociadas al historial del cliente, por lo que queda preparada antes de que exista una vista de calendario. En **Historial** se pueden registrar servicios/bonos, sesiones incluidas, forma y estado de pago, programar sesiones y marcar asistencia; las sesiones restantes descuentan las programadas y las asistidas, mientras que las ausencias no descuentan. La migración inicial crea la sede `Bizkaia Sant Marti`; puedes añadir futuras sedes desde **Tus gimnasios → Añadir gimnasio**.

El servidor escucha solo en `127.0.0.1`; esta página es una herramienta de desarrollo, no una aplicación lista para publicar: no tiene inicio de sesión ni autorización multiusuario. No expongas el puerto a una red ni uses datos personales reales hasta implementar autenticación y permisos.

## Módulos de datos incluidos

El esquema Prisma incluye una base para:

- Clientes, notas/fichas de seguimiento y planes de entrenamiento.
- Usuarios, empleados, roles y permisos asignables.
- Servicios, reservas, turnos de empleados y fichajes.
- Productos, movimientos de stock, ventas, líneas de venta y pagos.
- Facturas, eventos de estado de facturación y registros de auditoría.

Esto define el modelo de datos, no una aplicación completa: todavía hay que implementar API, autenticación/autorización, validaciones de negocio, interfaz y pruebas. El esquema no impide por sí mismo solapamientos de reservas/turnos, fichajes duplicados, cantidades o importes inválidos, ni garantiza permisos; esas reglas deben aplicarse en el backend y probarse.

Los modelos de factura son una estructura inicial, no una implementación ni certificación VeriFactu. Antes de emitir facturas reales, validar requisitos fiscales, numeración, rectificaciones, encadenamiento/firma, conservación y comunicación con la AEAT con una asesoría o proveedor especializado. No registrar contraseñas, datos de tarjeta ni contenido personal sensible en `AuditLog` o en eventos de factura.

El esquema está preparado para PostgreSQL y RDS. No apliques migraciones automáticamente sobre la base compartida: primero comprueba si contiene tablas/datos existentes, revisa el SQL de migración y acuerda la ventana y el responsable con el equipo.
