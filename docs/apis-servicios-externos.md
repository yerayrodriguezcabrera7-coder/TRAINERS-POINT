# 8. APIs y servicios externos necesarios para COBOSU

## 8.1. Objetivo

La página web de COBOSU tendrá su propia base de datos y un sistema interno para gestionar clientes, servicios, reservas, empleados, fichajes, productos y ventas.

Para añadir funciones como cobrar desde la web o enviar recordatorios automáticos, será necesario conectar la aplicación con determinados proveedores externos. Estas conexiones se realizan mediante APIs, que permiten que nuestra página intercambie información con otros sistemas de forma automática.

## 8.2. Funciones que no necesitan APIs externas de pago

Las siguientes funciones pueden realizarse dentro de la propia aplicación:

- Gestión de clientes y sus fichas.
- Configuración de servicios, precios, duración y disponibilidad.
- Calendarios de administración, entrenadores y clientes.
- Reservas y prevención de solapamientos.
- Gestión de entrenamientos pendientes de recuperación.
- Horarios, turnos, vacaciones y ausencias del personal.
- Registro de fichajes.
- Gestión de productos y stock.
- Registro de ventas, anulaciones y devoluciones.
- Usuarios y permisos según su puesto.

Estas funciones necesitarán alojamiento y base de datos cuando la aplicación se publique, pero no requieren contratar una API externa para cada apartado.

## 8.3. Cobros desde la página web

Si se quiere que el cliente pague directamente desde la web, será necesario integrar una pasarela de pago, como Stripe o el TPV virtual del banco.

Esta conexión permitirá:

- Cobrar reservas, bonos y productos.
- Recibir la confirmación del pago.
- Identificar pagos rechazados o pendientes.
- Solicitar devoluciones cuando corresponda.
- Actualizar el estado de la operación en COBOSU.

La venta o reserva solo deberá aparecer como pagada cuando el proveedor confirme el cobro.

Coste: dependerá del proveedor, las comisiones y las condiciones contratadas por la empresa.

Si el cobro se realiza en efectivo o mediante un datáfono independiente, podrá registrarse manualmente sin conectar una API de pagos.

## 8.4. Cuotas y mensualidades

Si se quieren cobrar cuotas periódicas automáticamente, habrá que configurar un servicio compatible con suscripciones o domiciliaciones bancarias.

Permitirá gestionar mensualidades, renovaciones, pagos fallidos y la cancelación de futuras cuotas. Esta función puede formar parte del mismo proveedor utilizado para los pagos online.

## 8.5. Correos electrónicos automáticos

Será conveniente utilizar un servicio de correo para enviar:

- Confirmaciones de reserva.
- Avisos de cambios o cancelaciones.
- Recordatorios de citas.
- Enlaces para recuperar contraseñas.
- Confirmaciones de compra.

Coste: existen proveedores con planes gratuitos limitados y planes de pago según el volumen de envíos.

## 8.6. WhatsApp y SMS

Opcionalmente, se podrá incorporar el envío automático de mensajes para recordar citas o comunicar cambios.

Coste: normalmente dependerá del número de mensajes y del proveedor. Esta función puede añadirse más adelante, cuando se conozca el volumen de comunicaciones del gimnasio.

## 8.7. Otras integraciones opcionales

Según las necesidades de la empresa, también se podrá estudiar la conexión con:

- Facturación y contabilidad: para trasladar las ventas al programa utilizado por la empresa o la gestoría. Su alcance deberá acordarse antes de implementarlo.
- Google Calendar u Outlook: para consultar sesiones desde calendarios externos.
- Control de acceso: para conectar tornos, lectores u otros dispositivos compatibles.

Antes de contratar estas conexiones, será necesario comprobar qué sistemas utiliza actualmente COBOSU y si permiten integrarse.

## 8.8. Alojamiento y conservación de los datos

Además de las posibles APIs, la aplicación necesitará:

- Un dominio.
- Un servidor o alojamiento.
- Una base de datos.
- Copias de seguridad.
- Mantenimiento y actualizaciones.

Estos servicios son los que permitirán utilizar la página desde distintos dispositivos y conservar la información al cerrar la aplicación.

## 8.9. Propuesta de incorporación

Se propone añadir los servicios por fases:

1. Primera fase: terminar y validar la gestión interna de COBOSU.
2. Segunda fase: preparar el alojamiento, las copias de seguridad y los correos automáticos.
3. Tercera fase: incorporar los pagos online y, si se necesitan, las cuotas periódicas.
4. Cuarta fase: valorar WhatsApp, contabilidad y otras integraciones.

No es necesario contratar todos los servicios desde el principio. Antes de cada contratación se informará a la empresa de su utilidad, coste y condiciones para que pueda decidir.

## Referencias de proveedores

- [Stripe Checkout: pagos y suscripciones](https://stripe.com/payments/checkout).
- [Redsys: documentación de integración del TPV virtual](https://pagosonline.redsys.es/desarrolladores-inicio/integrate-con-nosotros/area-de-descargas-y-documentacion/).
- [Resend: planes de correo electrónico](https://resend.com/pricing?product=transactional).
- [Twilio: condiciones de WhatsApp](https://www.twilio.com/en-us/whatsapp/pricing).

Las tarifas y condiciones deberán comprobarse al contratar. Este informe describe las integraciones previstas; no significa que los proveedores externos estén ya conectados.
