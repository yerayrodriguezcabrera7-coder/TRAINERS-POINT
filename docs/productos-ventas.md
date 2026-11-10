# Productos, stock y ventas

Acceso: `/productos.html`, desde Productos en el menú. Administración puede crear/editar/retirar productos, ajustar stock y registrar anulaciones y devoluciones. Recepción puede consultar el catálogo y el historial y confirmar ventas. Entrenadores y clientes no tienen acceso a estas operaciones.

Se reutilizan Product, Sale, SaleLine y StockMovement de Prisma. La migración 20261031000200 añade ámbito de centro, stock, revisión de inventario, cuenta vendedora, claves de repetición y cantidades devueltas. Los registros previos sin centro asignado permanecen intactos: no se atribuyen automáticamente a un gimnasio ni se recalculan existencias históricas sin conocer su procedencia.

Cada operación de inventario bloquea transaccionalmente el centro en PostgreSQL. La confirmación calcula precios en el servidor, guarda una copia del nombre y precio aplicado y descuenta existencias en la misma transacción. Guardar/abrir el carrito no reserva ni descuenta stock. Una clave única hace seguros los reintentos de confirmación. Los importes se calculan en céntimos.

Persona de paso guarda clientId=null; cliente registrado guarda una referencia a una ficha del gimnasio. No se crean fichas ficticias. La cuenta que confirma se conserva en sellerAccountId. El borrado del producto es una retirada lógica para mantener trazabilidad de las ventas.

Las devoluciones son por línea, con unidades acumuladas que no pueden superar las vendidas; reintentar la misma devolución no repone dos veces. Anular después de una devolución parcial repone solo lo pendiente. Los importes originales se conservan y la pantalla muestra el importe devuelto y neto. Estas operaciones registran la venta o devolución; no realizan cargos ni reembolsos bancarios.

Historial: filtros por fechas del centro (Europe/Madrid), producto y comprador, incluyendo Persona de paso. Historial paginado de 50 ventas, ordenado por fecha y referencia para evitar duplicados cuando las fechas coinciden. Se puede avanzar y retroceder y filtrar también por estado. Los filtros inválidos se rechazan antes de consultar la base de datos. El stock actual se consulta en Productos y las unidades vendidas/devueltas en el detalle de cada venta.

Pruebas en tests/inventory.test.cjs: PostgreSQL temporal aislado, migraciones completas, concurrencia, precios, repetición de peticiones, compradores, aislamiento entre centros, revisiones de stock, permisos, retirada lógica, devoluciones y flujo de carrito en DOM.

Antes de confirmar, la web envía el precio que ha mostrado. Si ha cambiado, el servidor rechaza la venta sin descontar stock. El botón «Actualizar precios y stock» conserva el carrito y permite revisar el total antes de volver a confirmar. Los reintentos de una venta ya registrada conservan el precio original.

## Cobros y pagos pendientes

Se reutiliza Payment y su relación con Sale. La migración `20261103000100_sale_payments` añade Bizum, una clave única por recibo y la cuenta que registra el cobro. No se crea otra tabla de deudas: el saldo deriva del importe neto de la venta, sus devoluciones y sus recibos. La ficha y el calendario usan el mismo cálculo en céntimos.

En Nueva venta se conserva el comprador de paso o la búsqueda de cliente registrado. Solo un cliente registrado puede elegir Pago pendiente. Una venta de paso se cobra completa sin guardar datos personales. Para una venta pagada al confirmar se registra un recibo con el método seleccionado: efectivo, tarjeta o Bizum. Por compatibilidad, los consumidores anteriores de la API que no indiquen opciones de cobro conservan la venta al contado en efectivo; la interfaz actual siempre envía la elección explícita.

Desde Historial de ventas, «Registrar pago» permite cobros parciales y sucesivos, cada uno con importe, método, fecha y cuenta responsable. El servidor bloquea las operaciones del centro durante el cálculo del saldo: dos cobros no pueden exceder la deuda, y reintentar el mismo identificador no genera un segundo recibo. Reutilizarlo con otros datos se rechaza. Una confirmación de venta repetida tampoco vuelve a crear deuda, cobro o descuento de stock.

El estado comercial de la venta (confirmada, anulada o devuelta) se conserva separado del estado de cobro (pendiente, parcial, pagado). Un método de pago nunca representa un estado de deuda. El historial permite filtrar por fecha de venta, comprador y método de algún pago recibido y muestra todos los recibos del resultado. Los movimientos bancarios no se ejecutan desde esta pantalla: tarjeta y Bizum registran dinero recibido por los canales de la empresa.

En la ficha se muestran los importes pendientes y el historial de cobros, con enlace a las ventas filtradas del cliente. La ficha actualiza su resumen cada cinco segundos. En recepción, todas las citas activas de hoy y de fechas posteriores muestran «Pago pendiente» y el saldo agregado de productos. El detalle enlaza a la gestión del cobro. El calendario consulta el saldo cada dos segundos, aunque la revisión de las reservas no haya cambiado. Crear otra reserva añade el aviso automáticamente; al pagar todo desaparece. No se alteran reservas ni disponibilidades. Entrenadores y clientes no reciben este resumen financiero en la API del calendario.

Las ventas anteriores sin evidencia de pago se muestran como «Sin verificar»; no se inventan recibos ni se convierten automáticamente en nuevas deudas. Los registros históricos siguen disponibles. Los bonos también se vinculan con Sale/Payment y pueden cobrarse desde el historial. La ficha excluye del cálculo antiguo los bonos ya vinculados para no duplicar la deuda.

Las devoluciones reducen el importe exigible sin eliminar recibos. Si se ha cobrado más que el nuevo importe neto, se muestra «Importe a devolver»; anular una venta elimina su saldo exigible y repone solo las existencias pendientes. Los cobros recibidos quedan registrados y no se presupone que se haya ejecutado un reembolso bancario. Recepción puede registrar después el dinero efectivamente devuelto, sin alterar los recibos originales.

Para arrancar: `npm run dev` aplica la migración antes de iniciar el servidor. En un despliegue existente hay que ejecutar `npm run prisma:generate`, `npm run prisma:migrate:deploy` y compilar de nuevo.

## Atención en recepción y devoluciones

Recepción puede consultar los productos, unidades y precios de las compras desde la ficha del cliente y su enlace al historial de ventas. «Registrar pago / Marcar pagado» abre el saldo restante completo, que puede modificarse para un cobro parcial. Se registra método, fecha y cuenta responsable; al completar el importe desaparece la deuda y su aviso en las citas.

Para una venta antigua «Sin verificar», «Confirmar que ya está pagado» requiere fecha real, método, observaciones sobre cómo se comprobó y confirmación explícita. Crea un registro histórico de pago, sin emitir otro cargo ni modificar existencias. El servidor impide repetir la verificación. No se admite una fecha futura ni cambiar el importe neto durante la confirmación.

Formato de devolución: referencia de la venta y comprador, productos y unidades, motivo, fecha y responsable. En cada producto se indica si vuelve al stock; los deteriorados pueden quedar excluidos. La deuda se reduce con el importe devuelto. Para compras cobradas se muestra el dinero que corresponde reintegrar y el botón «Registrar dinero devuelto». El formulario solicita importe, método, fecha, motivo y confirmación de que la entrega ya se ha realizado. Por defecto se gestiona devolución de dinero, sin generar saldo a favor ni cuentas de personas de paso.

Los reembolsos se guardan como movimientos REFUND de Payment, separados de los cobros COLLECTION. Se pueden registrar entregas parciales, sin superar el importe reintegrable. Las claves únicas y el bloqueo transaccional impiden aplicar dos veces una devolución de dinero o cobrar dos veces una verificación. El historial muestra cobros recibidos, dinero devuelto y saldo pendiente por separado.

Permisos: administración y recepción consultan, venden, registran pagos, verifican ventas antiguas y tramitan devoluciones de productos/dinero; la anulación total de ventas y la edición del catálogo siguen siendo exclusivas de administración. La migración `20261103000200_returns_verification` añade el historial de devoluciones y la distinción entre cobro/reembolso sin borrar datos previos.
