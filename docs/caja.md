# Caja diaria de Trainers Point

Acceso desde **Caja** en el menú (`/caja.html`). Administración y recepción pueden abrir, registrar entradas/salidas, contar, cerrar y consultar el historial. Entrenadores y clientes no pueden acceder a estos datos ni a su API.

## Apertura y cobros

Se cuenta el efectivo inicial y se confirma la apertura. La fecha, la hora y el nombre de quien abre se guardan en el servidor. Solo puede haber una caja abierta por centro. Una caja puede continuar abierta pasada medianoche; el historial conserva la fecha de apertura. Si se cierra y se vuelve a abrir el mismo día, quedan dos sesiones independientes con sus horas y recuentos.

La caja reutiliza las ventas y recibos de Productos y ventas. Cada nueva venta se vincula a la caja que esté abierta. Sus cobros y devoluciones de dinero se incorporan automáticamente al registrarlos, conservando la referencia al recibo original. No se introduce otra venta ni se duplica el pago.

El resumen distingue ventas registradas, productos devueltos, importe neto, efectivo, tarjeta y Bizum. Los cobros de una venta de una caja anterior (o de una venta creada sin caja abierta) aparecen como cobros de deudas anteriores. Son un desglose de los totales por método, nunca una segunda entrada. Una venta de la caja actual que se paga en otro momento de esa misma sesión se incluye en los cobros del turno.

Las ventas pendientes no suman efectivo ni tarjeta. Devolver un producto reduce el importe neto de las ventas pero no saca dinero del cajón hasta que se registra un reembolso en efectivo. Los reembolsos por tarjeta y Bizum se muestran separados y no afectan al efectivo físico. Los bonos de servicios también utilizan Sale/Payment: sus cobros se incorporan por método y las deudas anteriores son un desglose del total, sin duplicarlo.

**Efectivo esperado = inicial + cobros en efectivo + entradas manuales − reembolsos en efectivo − retiradas y otras salidas.**

Ejemplo: 100 € iniciales, 75 € cobrados en efectivo y 120 € con tarjeta dan 175 € esperados en el cajón. La tarjeta conserva su total de 120 € por separado.

La pantalla se actualiza cada dos segundos. En la parte inferior se muestra el efectivo esperado junto con el cálculo desglosado.

## Movimientos manuales y cierre

El formulario permite añadir cambio, otras entradas, retiradas y otras salidas. Requiere importe positivo y motivo; fecha y responsable se guardan automáticamente. Las ventas y sus devoluciones se registran en Productos, no mediante movimientos manuales. Estos movimientos solo corresponden a efectivo físico.

Para cerrar se introduce lo contado. Se muestra si cuadra, falta o sobra dinero y se permite explicar el motivo. Se guardan importe esperado, contado, diferencia, observación, hora y responsable. No se ajustan ventas ni pagos para hacer que cuadre.

El cierre guarda un resumen fijo con ventas, recibos, reembolsos, devoluciones de productos y movimientos. Una devolución posterior se registra en la siguiente caja abierta y no cambia el cierre anterior. Una caja cerrada no admite movimientos nuevos ni edición del recuento.

La apertura, los pagos del inventario, los movimientos y el cierre comparten el bloqueo transaccional por centro. Las claves únicas evitan duplicados por reintentos. Si aparece una operación nueva desde que se inició el recuento, el servidor rechaza el cierre y solicita actualizar el importe esperado y comprobar el efectivo.

## Historial y operaciones fuera de caja

El historial tiene filtros por fechas de apertura y páginas de 30 cajas. Muestra apertura, total cobrado, efectivo esperado, contado, diferencia y estado. «Ver detalle» muestra el resumen guardado de cada sesión, con ventas, productos, cobros y movimientos.

Registrar una venta sigue siendo posible sin caja abierta. Esas operaciones no se asignan después a una apertura ni se añaden a un cierre anterior. La pantalla avisa de los cobros/reembolsos registrados hoy fuera de caja. Al abrir, el importe inicial debe incluir el efectivo que ya haya físicamente en el cajón, evitando contarlo otra vez.

Los pagos introducidos con fecha anterior a la apertura tampoco se atribuyen al turno actual. Se compara con precisión de minutos para respetar el selector de fecha de cobro existente. Las verificaciones de ventas antiguas no generan entradas de caja: confirman dinero recibido históricamente, sin simular un cobro nuevo.

## Integración y comprobaciones

La migración `20261103000300_cash_register` añade CashSession, CashMovement y las relaciones opcionales de Sale/Payment. No atribuye operaciones históricas a una caja ni modifica su importe. `npm run dev` aplica las migraciones al arrancar; para otro despliegue se debe generar el cliente Prisma, aplicar migraciones y compilar.

Pruebas con PostgreSQL temporal: fórmula del ejemplo, deudas por método sin duplicación, pendientes, Bizum, aperturas simultáneas, movimientos repetidos, cierre con revisión antigua, diferencias, permisos, aislamiento por centro, reembolsos posteriores sin modificar cierres y operaciones fuera de caja. La prueba de la web recorre ventas, cobros, retirada y cierre con una cuenta real de recepción.
