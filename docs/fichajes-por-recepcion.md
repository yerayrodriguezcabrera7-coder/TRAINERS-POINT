# Recepción puede fichar por el equipo

En **Fichajes**, recepción ve la plantilla del centro y puede pulsar **Fichar entrada** o **Fichar salida** del trabajador correspondiente. Al hacerlo por otra persona se solicita una confirmación con su nombre.

La fecha y la hora las genera el servidor. La entrada y la salida guardan por separado la cuenta autenticada que las registró, su nombre y perfil y si actuó por otra persona. Los datos de autor enviados por el navegador se ignoran. Esta información se conserva en el historial y se incluye en el CSV.

Administración y recepción pueden consultar y exportar los fichajes del centro. El entrenador sigue limitado a registrar y consultar los suyos. No se permiten dos jornadas abiertas para una misma persona.

Los registros anteriores a esta mejora muestran «Autor no registrado»: no se les atribuye un autor inventado. Si se recoge ubicación en un fichaje delegado, corresponde al dispositivo de recepción, no prueba la ubicación del trabajador.

Migración: `20261104000300_attendance_actor`. No modifica las horas de los registros existentes.
