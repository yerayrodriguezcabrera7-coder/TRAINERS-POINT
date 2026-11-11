# Clientes, servicios y productos — cambios del 11 de noviembre de 2026

## Clientes y marcas

- Cada cliente tiene una marca propia: **Trainers Point** o **Cobosu**, independiente del centro donde entrena. Se selecciona al crear su ficha.
- El listado muestra dos secciones, una por marca, manteniendo la búsqueda y los filtros comunes.
- Se han retirado la tarjeta y el filtro «Hoy», y el filtro «Nuevos interesados». Los estados del cliente se conservan.
- Los bonos manuales de Cobosu están bloqueados en el servidor, también para administración. No se puede evitar la restricción enviando otro origen o marca en la petición. Se ocultan los accesos del listado, la ficha, el alta con propuesta y el calendario.
- Trainers Point mantiene la asignación manual, el registro de pagos y la protección contra bonos duplicados.
- Al crear una ficha Cobosu no se añade ninguna propuesta de bono. Se ha eliminado un segundo manejador antiguo del formulario para evitar enviar el alta dos veces.

**Migración:** los clientes que ya pertenecían a un centro cuyo nombre contiene «Cobosu» se clasifican como Cobosu. Los demás se conservan como Trainers Point. Revisar la clasificación si la base compartida contiene clientes Cobosu registrados en centros con otro nombre; no se deduce una marca por el nombre o correo de una persona. La compra automática desde la app y los cobros bancarios no se activan con este cambio.

## Servicios

- Se eliminan las tarjetas de métricas superiores y se conserva el catálogo con búsqueda y filtros.
- Nueva categoría **Cabina**, compatible con sesión individual y pack. Modalidad, precio, número de sesiones, duración y condiciones siguen usando el catálogo existente.
- La validez comienza en **4 semanas** y se puede editar entre 1 y 5200 semanas completas. La base, el calendario y los formularios de bonos utilizan la validez guardada.
- Cada servicio guarda su color. Las reservas usan ese color en las vistas de día, semana y mes. Se preservan los colores anteriores del calendario al migrar, cuando existían.

## Productos e inventario

- **Productos** (`/productos.html`) contiene el catálogo, existencias y el indicador «Sin stock». No contiene pestañas ni historial de ventas.
- **Ventas y cobros** (`/ventas.html`) conserva el historial, filtros, registro de ventas, pagos parciales, confirmaciones de cobro y devoluciones. El menú y los enlaces desde Caja, fichas y calendario apuntan a esta pantalla. Los enlaces antiguos con un cliente siguen redirigiendo al lugar correcto.
- Cada producto admite imagen PNG, JPEG o WebP. El navegador la optimiza antes de guardarla; aparece en la lista y en el detalle. Sin imagen se muestra un marcador neutro. Se rechazan archivos ejecutables, formatos falsos y tamaños excesivos.
- El código de barras/referencia se conserva como texto, incluidos los ceros iniciales, es único dentro del centro y puede utilizarse en el buscador.
- El seguimiento de stock se puede activar o desactivar por producto. Solo los productos activos con seguimiento y cero unidades cuentan en la alerta. Desactivarlo **no permite vender por encima de las existencias**.
- Se guardan el coste de adquisición **sin IVA**, el porcentaje de IVA y el PVP **con IVA**. El formulario calcula base imponible, IVA incluido y margen por unidad mientras se escribe.

Ejemplo: coste sin IVA de 6 €, PVP de 9,68 € e IVA del 21 % → base de 8 €, IVA de 1,68 € y margen de 2 € por unidad. El margen no descuenta otros gastos del negocio. El cálculo usa céntimos para que base e IVA sumen el importe cobrado.

Los productos anteriores mantienen sus precios y stock. Su IVA permanece en 0 y su coste en 0 hasta que se introduzcan los datos reales; no se inventan impuestos ni costes históricos. Las ventas nuevas conservan una copia de precios e IVA aplicados, aunque después se edite el producto. Las ventas y devoluciones anteriores no se reescriben.

## Archivos principales

| Área | Código |
| --- | --- |
| Marcas y bloqueo de bonos | `src/clients/brand.ts`, `src/finance/packages.ts`, `src/routes/clients.ts` |
| Catálogo de servicios | `src/validation/records.ts`, `src/routes/services.ts`, `web/services/` |
| Calendario y colores | `src/calendar/store.ts`, `web/calendar/app.js` |
| Productos, IVA e imágenes | `src/finance/inventory.ts`, `src/finance/product-pricing.ts`, `src/validation/product-image.ts`, `web/inventory/productos.*` |
| Ventas y cobros existentes | `web/inventory/ventas.*`, `src/routes/finance.ts` |
| Persistencia | `prisma/schema.prisma`, migración `20261111000100_catalogue_brands_inventory` |

Se guardó una copia de la base local antes de aplicar la migración. No se han contratado servicios, activado pagos online ni enviado mensajes. Las comprobaciones de ventas utilizan bases temporales o respuestas simuladas.

## Revisión manual

1. Abrir Clientes: comprobar las dos marcas y buscar un cliente de cada una.
2. Abrir una ficha Cobosu: comprobar que no ofrece añadir ni renovar manualmente un bono. En una ficha Trainers Point debe seguir disponible.
3. Crear un servicio Cabina con pack, ocho semanas y un color; editarlo y comprobar que mantiene esos datos.
4. Comprobar una reserva de ese servicio en las tres vistas del calendario.
5. Crear un producto con imagen y código, introducir coste, IVA y PVP, y revisar el desglose antes de guardar.
6. Buscar por código y abrir su detalle. Cambiar el seguimiento de stock y comprobar la alerta con cero unidades.
7. Entrar en Ventas y cobros y comprobar filtros, compradores, pagos y devoluciones con datos de ensayo.
