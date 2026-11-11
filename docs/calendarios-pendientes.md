# Calendario compartido, centro de trabajo y pendientes

Recepción y trabajadores utilizan `calendar.bookings`, sin duplicar reservas. La agenda pertenece al espacio de trabajo activo; cada cita puede indicar un centro de trabajo distinto dentro de los centros disponibles. El campo `centerId` es el lugar de la cita y no cambia la cuenta del trabajador ni el espacio que conserva la reserva.

## Recepción

- El calendario muestra todos los trabajadores del espacio y una columna «Sin asignar».
- Se filtra por trabajador, servicio, fecha, sala y centro de trabajo.
- Una reserva puede guardarse sin trabajador: `employeeId=null`, estado `PENDING`. No puede confirmarse ni cerrarse sin asignación.
- La reserva mantiene el color del servicio y muestra el trabajador y el centro. Su ficha incluye la dirección del centro cuando está configurada.
- El aviso visible enlaza a «Pendientes de asignación» y se actualiza con el sondeo existente cada dos segundos.
- La pantalla de pendientes utiliza el centro activo del menú global: no ofrece otro filtro, columna o selector de centro. Permite asignar trabajador, consultar sus huecos y modificar fecha/hora y sala. Las citas antiguas conservan su centro de trabajo al editarlas; no se trasladan automáticamente. El servidor vuelve a comprobar duración, servicio, horario, ausencia y ocupación antes de guardar.

## Bonos pendientes de agendar y urgentes

«Pendientes de asignación» reúne las citas sin trabajador y los clientes habilitados para reservar con sesiones libres de bonos vigentes. Incluye las fichas recién creadas como nuevos interesados cuando ya tienen un bono; excluye las inactivas y dadas de baja. Los bonos pagados y los que permiten reservar con pago pendiente se muestran diferenciados; no se crea una venta ni un cobro al consultarlos o agendar una sesión.

El cálculo descuenta las sesiones realizadas, perdidas, ya reservadas en cualquier sede y los créditos de recuperación pendientes. Las cancelaciones ordinarias liberan la sesión. Los bonos caducados, fallidos o de servicios inactivos no se ofrecen para agendar.

Arriba aparecen hasta cuatro clientes, sin repetirlos aunque tengan varios bonos. Se ordenan por la fecha más próxima entre la caducidad de sus bonos y sus citas pendientes; a igualdad de día, por las sesiones que necesitan más huecos antes de caducar. El listado inferior contiene todos los resultados. El buscador filtra por cliente o servicio y actualiza ambos bloques.

«Agendar una sesión» utiliza el bono seleccionado: recepción elige trabajador, fecha, hora y sala, consulta los huecos y confirma. La reserva se guarda en el calendario existente con su `packageId`, sin comprar otro bono. Las sesiones propuestas deben terminar dentro de su vigencia. Después se actualizan la agenda y el número de pendientes. La comprobación transaccional existente impide consumir una misma sesión desde dos ventanas a la vez.

La consulta `GET /api/pending-packages` está restringida a administración y recepción; emplea una consulta agregada y las reglas de acceso multicentro de clientes. Los clientes Trainers Point siguen siendo compartidos entre sedes Trainers Point y los de Cobosu permanecen locales.

## Clientes y ficha

El listado no incluye filtro de centros ni bloque inferior de centros. El alta no pide un centro: el servidor asigna el contexto activo, incluso si una petición antigua envía un `gymId` diferente. La ficha conserva la información del centro de origen y deja de ofrecer «Cambiar centro». La gestión de sedes permanece en el apartado Centros.

## Reprogramación

Se pulsa «Pendiente de reprogramar» en la ficha de la reserva. Esta acción libera el hueco anterior (`CANCELLED`) y añade `needsReschedule=true`, diferenciándola de una cancelación definitiva.

La cola «Por reprogramar» conserva cliente, servicio, trabajador y centro anteriores. Al confirmar la nueva organización, se modifica la misma reserva con control de versión, se limpia la marca y se añade la versión anterior al historial. Debe elegirse una fecha futura. Cancelar definitivamente limpia la marca sin eliminar la reserva.

Las recuperaciones pendientes de reprogramación conservan el crédito vinculado, evitando que se utilice en otra cita mientras se organiza la nueva fecha. Reprogramarlas mantiene el importe de cobro en cero.

## Trabajadores

El servidor devuelve exclusivamente sus reservas, su ficha de empleado y sus ausencias. En la interfaz se presenta «Mi calendario»; no se puede cambiar el filtro para consultar otros trabajadores. Las comprobaciones también se aplican si se llama directamente a la API.

Puede marcar una sesión como realizada únicamente si le pertenece, está confirmada y ha terminado. También puede comunicar una incidencia o solicitud de cancelación; esta queda visible en la ficha para recepción. La incidencia no cancela automáticamente la reserva.

## Persistencia y compatibilidad

Las reservas existentes siguen funcionando. Los nuevos campos y el historial se guardan en el JSONB existente, sin tablas paralelas ni migración destructiva. Cada cita sin centro explícito se muestra en su centro de origen. La asignación mantiene la comprobación de versión y el bloqueo transaccional del gimnasio, de modo que dos operadores no pueden sobrescribirse silenciosamente.

Pruebas: asignación concurrente, reserva sin trabajador, conflictos entre centros, historial, reprogramación con crédito, actualización de pendientes en la interfaz, privacidad por trabajador y acciones autorizadas.
