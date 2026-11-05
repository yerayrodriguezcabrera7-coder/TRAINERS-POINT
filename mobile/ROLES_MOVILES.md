# Acceso móvil por perfiles

La misma aplicación Trainers Point admite cuentas de cliente, entrenador/trabajador y recepción. El servidor valida el perfil de la cuenta; seleccionar otra entrada o cambiar parámetros de la solicitud no concede permisos adicionales.

| Perfil | Información disponible en la app |
| --- | --- |
| Cliente | Sus propias reservas, servicio, horario y centro. |
| Entrenador / Trabajador | Su agenda por día, detalles del centro y los clientes vinculados a su trabajo. |
| Recepción | Agendas del centro, filtros por trabajador y centro, clientes y reservas pendientes de asignar o reprogramar. |

## Entrar

1. Abrir la app y pulsar **Entrar a mi cuenta**.
2. Seleccionar **Cliente**, **Entrenador / Trabajador** o **Recepción**.
3. Introducir el usuario y la contraseña de la cuenta habilitada por administración.
4. Cambiar la contraseña provisional si el servidor lo solicita.

Los perfiles de trabajador y recepción utilizan las cuentas existentes del panel web. No se han cambiado contraseñas ni creado cuentas de personal durante esta entrega.

## Pantalla del trabajador

- Navegación entre días con **Día anterior**, **Día siguiente** y **Hoy**.
- Reservas de su propia agenda con cliente, servicio, horario, estado y centro.
- Detalle de la reserva con dirección del centro, cuando está configurada.
- Pestaña **Mis clientes**, con búsqueda por nombre, teléfono o correo.
- Sin selector de otros trabajadores ni acceso a la cola general de pendientes.

## Pantalla de recepción

- Agenda del centro, con nombre del cliente y trabajador en cada reserva.
- Filtros por trabajador y centro; búsqueda por cliente, servicio o trabajador.
- Pestaña **Pendientes** con reservas sin trabajador y sesiones pendientes de reprogramar. Conserva los casos cuya fecha anterior ya pasó para que no se olviden.
- Pestaña **Clientes**, con sus datos básicos de contacto.
- Actualización automática cada 15 segundos mientras la app está activa, además del botón manual.

La cuenta de administración puede entrar por el acceso de oficina y mantiene su identidad real, aunque esta primera pantalla móvil solo muestra estas consultas.

## Límites y protección

La API `GET /api/mobile/calendar` devuelve una selección explícita de datos. El trabajador solo recibe sus propias reservas, sus clientes y sus centros. La respuesta no incluye usuarios, contraseñas, configuración del personal, historiales completos de ediciones ni información financiera.

Se ha limitado también la respuesta financiera de la ruta anterior `/api/state` para que un trabajador no reciba saldos o avisos de bonos de clientes ajenos.

Las consultas móviles reutilizan las reservas existentes. La creación, asignación y modificación de citas continúa en el panel web; la app lo indica. La configuración, las cuentas, los permisos y la operativa económica no se añaden a estas pantallas.

## Validación

- Pruebas de permisos con base temporal: un trabajador no obtiene datos de otro ni falseando parámetros, recepción puede consultar el conjunto, el cliente no entra en el endpoint del equipo y un token inválido se rechaza.
- Pruebas de la respuesta mínima: no aparecen campos de usuarios, caja, historial de edición ni datos privados de otra agenda.
- Pruebas de navegador con datos ficticios para trabajador y recepción: entrada, pestañas, filtros, pendientes, detalles del centro, búsqueda, salida y cuatro anchuras.
- Acceso real de las cuentas locales de trabajador y recepción: identidad y respuesta de agenda comprobadas, seguido de cierre de sesión. No se han modificado reservas.
- Corregida una pérdida del callback de Metro que podía cerrar el servidor de desarrollo al solicitar recursos fuera de la API.

El empaquetado de iOS no sustituye una prueba de ejecución en el iPhone virtual. La instalación del runtime de Xcode se revisa aparte.
