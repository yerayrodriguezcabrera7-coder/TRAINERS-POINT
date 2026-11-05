# Exportación, recordatorios y cobro de asistencia

## Exportar fichajes

En Fichajes → Historial, selecciona Desde, Hasta y trabajador y pulsa **Exportar informe CSV**. El archivo abre en Excel y contiene identificador, trabajador, fechas, horas con desplazamiento horario, duración completa de la jornada, duración dentro del período y estado. Se conservan los filtros y permisos: administración y recepción pueden consultar la plantilla; cada entrenador consulta solo sus propios fichajes. El intervalo máximo es 93 días por descarga.

Las jornadas abiertas se identifican sin inventar una hora de salida ni un total definitivo. Las jornadas que cruzan medianoche conservan las horas reales y distinguen el tiempo dentro del período. No se exportan coordenadas GPS. La descarga vuelve a consultar el servidor; no depende de tener cargado previamente el historial.

## Recordatorios

El servidor incorpora un proceso que revisa las reservas cada minuto, incluso sin navegadores abiertos. La fecha objetivo es el día anterior a la misma hora local del centro, incluyendo cambios de horario. Recupera retrasos de hasta dos horas; después de ese margen no envía un aviso tardío. Una reserva creada con menos antelación puede quedar fuera de ese margen.

Solo utiliza reservas pendientes o confirmadas con trabajador asignado y clientes del catálogo con `contactPreference` WHATSAPP o SMS. Otros canales no provocan un envío alternativo. Hace falta teléfono internacional con prefijo, por ejemplo +34. Usa cliente, fecha, hora, servicio y entrenador. Vuelve a comprobar la reserva antes del envío; una fecha nueva tiene su propio recordatorio.

**Está desactivado.** No se ha contratado proveedor ni enviado mensajes reales. Hay un adaptador preparado para Twilio, pendiente de cuenta, remitentes y plantilla aprobada de la empresa. Las variables están documentadas en `.env.example`. Activarlo requiere tanto `REMINDERS_ENABLED=true` como `REMINDERS_ALLOW_SEND=true`, además de todas las credenciales. No guardar las claves en GitHub. Antes de activarlo, la empresa debe confirmar los destinatarios autorizados, costes y plantilla.

La tabla `calendar.reminders` conserva el resultado por reserva y fecha, evitando repetirlo entre procesos o reinicios. ACCEPTED significa aceptado por el proveedor, no entrega confirmada al teléfono. Un 429 permite hasta cuatro intentos separados por cinco minutos. Un fallo ambiguo o proceso interrumpido queda UNKNOWN y requiere revisar el proveedor antes de reenviar; no se repite automáticamente. No hay panel de reenvío manual en esta entrega.

Referencias: [API de mensajes](https://www.twilio.com/docs/messaging/api/message-resource), [plantillas de WhatsApp](https://www.twilio.com/docs/whatsapp/tutorial/send-whatsapp-notification-messages-templates), [reintento tras 429](https://www.twilio.com/docs/api/errors/20429).

## Cobrar al registrar asistencia

Al guardar una reserva como **Realizada**, una sesión sin bono genera una única venta pendiente vinculada a esa reserva. Se usa el importe guardado en la reserva. No se divide automáticamente el precio de un servicio tipo pack. La misma reserva no crea una segunda deuda al repetir la operación.

Recepción o administración reciben un formulario para registrar dinero recibido, con importe y método: efectivo, tarjeta o Bizum. Se admiten pagos parciales, se actualizan la deuda y Caja y se impide sobrecobrar o duplicar el mismo recibo. También se ofrece desde el registro de asistencia en Clientes. Se puede dejar pendiente y volver a abrir la cita para pulsar **Registrar cobro pendiente**.

Si la cita utiliza un bono pendiente, se cobra la venta existente de ese bono y el formulario indica que el saldo corresponde al bono completo. Un bono pagado o una recuperación no generan otro cobro. El trabajador puede marcar realizada su sesión y recibe un aviso para acudir a recepción si queda pendiente; no recibe permisos de cobro.

Los botones registran dinero ya recibido; no ejecutan cargos en tarjetas ni envían solicitudes a Bizum.

## Instalación

Se añaden dos migraciones: vínculo de reserva con venta e historial de recordatorios. `npm run dev` aplica las migraciones locales. En despliegue debe ejecutarse `npm run prisma:migrate:deploy` y regenerarse Prisma antes de iniciar el servidor. Las pruebas utilizan bases temporales y un proveedor simulado, sin mensajes reales.
