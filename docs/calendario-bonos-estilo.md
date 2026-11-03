# Estructura común y reservas con bonos

Las pantallas autenticadas comparten `body > .app-shell > aside + main.main-content`. El main contiene una cabecera de 69 px y un contenedor de contenido. El desplazamiento lateral usa `var(--rail)`; se eliminaron los márgenes fijos de los contenedores principales. El contenido no se centra con un ancho máximo variable: mantiene el mismo padding a la izquierda. En móvil el menú ampliado se superpone al contenido sin cambiar su alineación.

La paleta compartida de `orden.css` utiliza papel cálido, panel blanco cálido, bordes finos, texto carbón y naranja de Clientes. Gimnasios se adapta a la misma presentación clara. Los colores de estado y de los trabajadores mantienen su significado específico.

## Crear una reserva

1. Elegir cliente con el buscador existente.
2. Consultar automáticamente sus bonos desde `GET /api/clients/:id/service-history`, que ya devuelve sesiones disponibles. Se ofrecen los pagados con sesiones libres y el bono ya vinculado si se está editando una cita. Al elegirlo se actualiza el servicio y la duración.
3. Elegir trabajador, centro, sala y fecha; se consultan los horarios libres con `/api/slots`. El servidor sigue validando turno y solapamientos al guardar, porque la disponibilidad puede haber cambiado.
4. Confirmar. La cita y su reflejo en `Booking` se guardan en la misma transacción PostgreSQL. El bloqueo de la fila del bono evita gastar una última sesión dos veces. La referencia del empleado Prisma solo se guarda si existe ese Employee; la identidad del trabajador del calendario permanece en la reserva compartida.

Sin bono se permite reservar. `paymentDue` en la agenda y `paymentPending` en Booking indican que queda pendiente de cobro. Es un estado de pago distinto de la confirmación de la cita: no cancela ni bloquea automáticamente la reserva. El aviso se muestra en las tarjetas con el color del trabajador, o neutro si no está asignado.

La opción «Crear bono pendiente» reutiliza `POST /api/clients/:id/service-packages` con estado PENDIENTE. Crea una deuda real en la ficha sin registrar un cobro. Su clave de petición evita repetir la creación por reintentos. La creación del bono y la confirmación de la reserva son dos pasos explícitos: si no se guarda la reserva, el bono creado sigue constando en la ficha. No se inventa un método de pago recibido: OTRO en ese registro pendiente indica que no se ha cobrado.

Las cancelaciones liberan sesiones; las sesiones realizadas cuentan como utilizadas. Las recuperaciones conservan el derecho del bono original para no permitir consumirlo a la vez como otra reserva y como recuperación. Cuando cambia el estado de pago del bono, el aviso de la agenda se calcula con el estado vigente del bono. Los pagos de productos conservan sus propios avisos y saldos.

La migración `20261103000400_calendar_packages` añade metadatos del vínculo con la agenda, la marca de cobro pendiente y la clave de creación del bono. La escritura atómica requiere que calendario y CRM compartan PostgreSQL, como en la configuración local del proyecto. No se recrean los módulos de servicios o bonos.
