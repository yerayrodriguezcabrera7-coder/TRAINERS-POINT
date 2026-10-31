# Productos, stock y ventas

Acceso: `/productos.html`, desde Productos en el menú. Administración puede crear/editar/retirar productos, ajustar stock y registrar anulaciones y devoluciones. Recepción puede consultar el catálogo y el historial y confirmar ventas. Entrenadores y clientes no tienen acceso a estas operaciones.

Se reutilizan Product, Sale, SaleLine y StockMovement de Prisma. La migración 20261031000200 añade ámbito de centro, stock, revisión de inventario, cuenta vendedora, claves de repetición y cantidades devueltas. Los registros previos sin centro asignado permanecen intactos: no se atribuyen automáticamente a un gimnasio ni se recalculan existencias históricas sin conocer su procedencia.

Cada operación de inventario bloquea transaccionalmente el centro en PostgreSQL. La confirmación calcula precios en el servidor, guarda una copia del nombre y precio aplicado y descuenta existencias en la misma transacción. Guardar/abrir el carrito no reserva ni descuenta stock. Una clave única hace seguros los reintentos de confirmación. Los importes se calculan en céntimos.

Persona de paso guarda clientId=null; cliente registrado guarda una referencia a una ficha del gimnasio. No se crean fichas ficticias. La cuenta que confirma se conserva en sellerAccountId. El borrado del producto es una retirada lógica para mantener trazabilidad de las ventas.

Las devoluciones son por línea, con unidades acumuladas que no pueden superar las vendidas; reintentar la misma devolución no repone dos veces. Anular después de una devolución parcial repone solo lo pendiente. Los importes originales se conservan y la pantalla muestra el importe devuelto y neto. Estas operaciones registran la venta o devolución; no realizan cargos ni reembolsos bancarios.

Historial: filtros por fechas del centro (Europe/Madrid), producto y comprador, incluyendo Persona de paso. Historial paginado de 50 ventas, ordenado por fecha y referencia para evitar duplicados cuando las fechas coinciden. Se puede avanzar y retroceder y filtrar también por estado. Los filtros inválidos se rechazan antes de consultar la base de datos. El stock actual se consulta en Productos y las unidades vendidas/devueltas en el detalle de cada venta.

Pruebas en tests/inventory.test.cjs: PostgreSQL temporal aislado, migraciones completas, concurrencia, precios, repetición de peticiones, compradores, aislamiento entre centros, revisiones de stock, permisos, retirada lógica, devoluciones y flujo de carrito en DOM.

Antes de confirmar, la web envía el precio que ha mostrado. Si ha cambiado, el servidor rechaza la venta sin descontar stock. El botón «Actualizar precios y stock» conserva el carrito y permite revisar el total antes de volver a confirmar. Los reintentos de una venta ya registrada conservan el precio original.
