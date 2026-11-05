# Recepción puede fichar por el equipo

En **Fichajes**, recepción ve la plantilla del centro y puede pulsar **Fichar entrada** o **Fichar salida** del trabajador correspondiente. Al hacerlo por otra persona se solicita una confirmación con su nombre.

La fecha y la hora las genera el servidor. La entrada y la salida guardan por separado la cuenta autenticada que las registró, su nombre y perfil y si actuó por otra persona. Los datos de autor enviados por el navegador se ignoran. Esta información se conserva en el historial y se incluye en el CSV.

Administración y recepción pueden consultar y exportar los fichajes del centro. El entrenador sigue limitado a registrar y consultar los suyos. No se permiten dos jornadas abiertas para una misma persona.

Los registros anteriores a esta mejora muestran «Autor no registrado»: no se les atribuye un autor inventado. Si se recoge ubicación en un fichaje delegado, corresponde al dispositivo de recepción, no prueba la ubicación del trabajador.

Migración: `20261104000300_attendance_actor`. No modifica las horas de los registros existentes.

## Olvido de fichaje

Solo recepción puede añadir una anotación con el botón **Olvido de fichaje** junto al trabajador. Debe indicar la fecha, si olvidó la entrada o la salida, explicar cómo comprobó su presencia y marcar la confirmación de corroboración. No se admiten fechas futuras.

Se guardan el comentario, el trabajador, el usuario de recepción y el momento de anotación. Reintentar el mismo envío no crea duplicados. Las anotaciones se consultan en **Historial → Olvidos de fichaje corroborados por recepción**, con los filtros de fechas y trabajador. Administración y recepción ven las del centro; cada trabajador solo las suyas. No pueden editarse ni borrarse desde esta pantalla.

Una anotación no genera un fichaje retroactivo ni modifica horas o totales. Si recepción ficha una entrada real en ese momento, utiliza el botón normal de fichar.

Migración adicional: `20261104000400_attendance_omissions`.
