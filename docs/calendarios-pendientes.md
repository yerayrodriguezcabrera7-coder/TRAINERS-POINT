# Calendario compartido, centro de trabajo y pendientes

Recepción y trabajadores utilizan `calendar.bookings`, sin duplicar reservas. La agenda pertenece al espacio de trabajo activo; cada cita puede indicar un centro de trabajo distinto dentro de los centros disponibles. El campo `centerId` es el lugar de la cita y no cambia la cuenta del trabajador ni el espacio que conserva la reserva.

## Recepción

- El calendario muestra todos los trabajadores del espacio y una columna «Sin asignar».
- Se filtra por trabajador, servicio, fecha, sala y centro de trabajo.
- Una reserva puede guardarse sin trabajador: `employeeId=null`, estado `PENDING`. No puede confirmarse ni cerrarse sin asignación.
- La reserva mantiene el color del servicio y muestra el trabajador y el centro. Su ficha incluye la dirección del centro cuando está configurada.
- El aviso visible enlaza a «Pendientes de asignación» y se actualiza con el sondeo existente cada dos segundos.
- La pantalla de pendientes permite asignar trabajador, consultar sus huecos, modificar fecha/hora, seleccionar centro y confirmar. El servidor vuelve a comprobar duración, servicio, horario, ausencia y ocupación antes de guardar.

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
