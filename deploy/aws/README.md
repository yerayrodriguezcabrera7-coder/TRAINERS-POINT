# AWS: integración preparada, servicios sin activar

El proyecto sigue funcionando en local. Estos archivos no crean recursos, no contratan servicios ni envían mensajes o cobros. El acceso local de la web y las cuentas existentes se conservan. No se han añadido credenciales AWS al repositorio.

## Qué se ha preparado

| Servicio | Uso en Trainers Point | Estado |
| --- | --- | --- |
| Cognito | Autenticar clientes, entrenadores y recepción desde las dos apps. El servidor conserva los permisos del centro. | Adaptador y verificación implementados; desactivado por defecto. |
| RDS PostgreSQL | Alojar la misma base que comparten web y app, con transacciones y certificado verificado. | Conexión y configuración Docker preparadas; sin instancia creada ni datos migrados. |
| API Gateway | Entrada HTTPS opcional hacia el servidor Node existente. | Plantilla CloudFormation revisable; no desplegada. |
| Amplify | Puede ayudar con herramientas de app o alojamiento estático, si más adelante se elige. | Opcional; no hace falta sustituir Expo ni instalarlo para conectar esta app a la API. |
| Lambda | Ejecutar funciones concretas si aparecen necesidades que lo justifiquen. | No incorporado. El servidor actual ya ejecuta las reglas de reservas, cobros y recordatorios. Migrarlo exigiría revisar conexiones y procesos periódicos. |

Preparado en código **no significa conectado ni validado con una cuenta real de AWS**. Faltan la cuenta de la empresa, recursos aprobados, dominio, red, certificados y pruebas de integración en un entorno de ensayo.

## Acceso opcional con Cognito

1. Cuando la empresa apruebe usar AWS, disponer de un **User Pool** y un **App Client público sin secreto** que permita `ALLOW_USER_PASSWORD_AUTH`. Usar la misma región/pool/client en servidor y apps. No introducir claves IAM, contraseñas ni client secrets en variables `EXPO_PUBLIC_*`.
2. Mantener `COGNITO_ENABLED=false` hasta terminar la preparación. Aplicar las migraciones habituales con copia de seguridad previa. La nueva tabla `calendar.external_identities` no cambia contraseñas ni roles locales.
3. Crear o identificar el usuario correcto en Cognito por un procedimiento administrativo. Esta entrega no crea usuarios en AWS ni envía invitaciones. Comprobar su identificador **sub** directamente en la cuenta de AWS.
4. Vincularlo a su cuenta existente del centro usando variables de entorno privadas:

   ```text
   COGNITO_USER_POOL_ID=pool_real
   COGNITO_CLIENT_ID=cliente_publico_real
   COGNITO_LINK_GYM_ID=id_real_del_centro
   COGNITO_LINK_USERNAME=usuario_existente
   COGNITO_LINK_SUBJECT=sub_real_verificado
   ```

   Ejecutar `npm run aws:link-user` desde la raíz, después de `npm run build`. Este comando solo escribe la vinculación en la BD configurada. Repetir la misma vinculación no la duplica; no permite reasignarla silenciosamente a otra cuenta. Para quitar acceso, deshabilitar la cuenta del centro o eliminar la vinculación mediante un procedimiento administrativo autorizado: las sesiones externas se rechazan desde la siguiente petición.

5. Tras probar la configuración, activar en el servidor `COGNITO_ENABLED=true`, `COGNITO_USER_POOL_ID` y `COGNITO_CLIENT_ID`. Reiniciar el servidor. En la app correspondiente configurar `EXPO_PUBLIC_AUTH_PROVIDER=cognito`, `EXPO_PUBLIC_COGNITO_USER_POOL_ID` y `EXPO_PUBLIC_COGNITO_CLIENT_ID`. Reiniciar Metro/reconstruir la app: Expo incorpora estas variables públicas al paquete.
6. Probar cada perfil. Volver a `EXPO_PUBLIC_AUTH_PROVIDER=local` devuelve la app al acceso anterior; desactivar también Cognito en el servidor si se abandona esta vía. No hay fallback automático a otra contraseña tras un fallo externo.

Flujo: **app → Cognito → access token firmado → `/api/cognito/login` → sesión de Trainers Point → agenda según rol**. La contraseña externa se envía a Cognito por HTTPS; el servidor recibe el access token. Verifica firma, emisor, app cliente, caducidad y `token_use=access`. No acepta un ID token para este intercambio.

La identidad se vincula por **centro + emisor + sub**; no por correo, nombre o grupos enviados por el usuario. Un grupo `ADMIN` en Cognito no concede administración. Cada petición sigue comprobando que la cuenta y el empleado/cliente estén habilitados. La sesión dura como máximo lo que reste de validez del access token, con límite adicional de 12 horas. No se almacenan contraseñas ni refresh tokens en la app; al caducar hay que volver a entrar. Cambiar una contraseña en Cognito no cambia la contraseña local. Revocar un JWT solo en AWS puede tardar hasta su caducidad en afectar a esta verificación local; para cortar acceso inmediatamente, deshabilitar la cuenta o quitar la vinculación en Trainers Point.

Se contempla el cambio obligatorio de contraseña provisional (`NEW_PASSWORD_REQUIRED`). Si Cognito exige completar atributos, MFA u otro desafío, la app lo indica y no abre una sesión. Esos flujos necesitan su interfaz antes de activar Cognito para cuentas que los requieran; no se debe rebajar la configuración de seguridad para evitarlo. No se ha activado recuperación por SMS ni envío automático. El login web actual permanece local.

## Base compartida en RDS

- Mantener una única instancia **PostgreSQL** para Prisma y el calendario. No crear una segunda base para la app.
- Usar una red que permita acceder a RDS desde el servidor, con un usuario de BD limitado y copias de seguridad. No abrir PostgreSQL a todo Internet.
- Descargar el paquete CA oficial de RDS desde la documentación de AWS y verificar su procedencia. Configurar `DATABASE_SSL_CA_FILE` con una ruta absoluta al archivo. Para hosts RDS, el servidor rechaza iniciar si falta este CA.
- `src/cloud/database.ts` aplica `sslmode=require&sslaccept=strict&sslcert=...` a Prisma y `rejectUnauthorized: true` con el mismo CA a `pg`. Se ha eliminado el cambio automático que desactivaba la comprobación de certificados en desarrollo.
- Para Prisma CLI, incluir también esos parámetros de TLS en `DATABASE_URL`, como muestra `.env.example`. Las rutas de certificados de Prisma deben apuntar al archivo montado dentro del contenedor.
- `compose.rds.yaml` es una alternativa completa a `deploy/compose.yaml`, no un complemento. Usa RDS existente y no levanta otro PostgreSQL. Preparar `deploy/aws/.env` desde su plantilla y el certificado antes de considerar su ejecución. Migrar una copia y verificarla antes de cambiar la base de producción. No ejecutar estos pasos sobre los datos locales sin copia.

## API Gateway y direcciones

`api-gateway.json` es una plantilla opcional para revisar con quien administre AWS. Crear su stack tendría coste según uso: **no se ha ejecutado ni debe automatizarse sin autorización**. Requiere un backend público HTTPS ya alojado. No aloja el servidor Node, no crea RDS, no despliega Lambda y no sustituye la autenticación de la aplicación.

La ruta `ANY /api/{proxy+}` reenvía las peticiones a `BackendOrigin/api/{proxy}`; conserva el bearer de la sesión y `x-calendar-gym`. No se configura un autorizador JWT en Gateway porque las operaciones usan las sesiones opacas de Trainers Point; el backend sigue validando todas las operaciones. El login de Cognito se verifica en el backend. Hay límites de peticiones de ejemplo que deben dimensionarse para el centro.

En iPhone/Android, `EXPO_PUBLIC_API_URL` será el origen HTTPS del backend o del Gateway. Para la versión web móvil y el panel, mantener un proxy `/api` en el mismo dominio: no se ha abierto CORS a cualquier origen. El proxy local de Metro sirve para desarrollo, no para publicar la aplicación. Gateway no sustituye las tareas pendientes de alojar el servidor, publicar la app, configurar dominio y supervisar disponibilidad.

## Comprobaciones sin usar AWS

```bash
npm run build
npm run aws:check
node --test tests/aws.test.cjs
node --test mobile/shared/mobile.test.cjs
```

Las pruebas usan JWT firmados con claves de prueba, claves públicas en memoria y una base temporal. Comprueban tokens falsos/caducados, aislamiento por centro, permisos, cuentas deshabilitadas, desvinculación, cambio de contraseña y TLS. No prueban un despliegue real ni realizan peticiones a AWS.

## Referencias oficiales

- [Verificación de tokens de Cognito](https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-using-tokens-verifying-a-jwt.html)
- [InitiateAuth](https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_InitiateAuth.html) y [RespondToAuthChallenge](https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_RespondToAuthChallenge.html)
- [Proxy HTTP en API Gateway](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-develop-integrations-http.html)
- [TLS en RDS PostgreSQL](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/PostgreSQL.Concepts.General.SSL.html)
- [Conexiones PostgreSQL y TLS de Prisma](https://docs.prisma.io/docs/orm/v6/overview/databases/postgresql)
