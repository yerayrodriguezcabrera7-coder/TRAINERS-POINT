# TRAINERS-POINT

## Espacio de trabajo Cobosu

Abre [Inicio](http://127.0.0.1:3000/inicio.html) para consultar la agenda de hoy, pendientes y equipo en jornada. El resumen utiliza datos reales y se actualiza cada 20 segundos mientras la pestaña está visible. Las reservas del resumen abren su ficha en el calendario. El diseño comparte la identidad Cobosu y agrupa la navegación por tareas.

[Propuesta de producto y prioridades de implantación](docs/propuesta-producto.md).

## Calendario con backend

```sh
npm install
npm run dev:calendar
```

Abre http://127.0.0.1:3000 para el calendario o http://127.0.0.1:3000/fichajes.html para el control horario. El modo local conecta automáticamente hasta crear la primera cuenta de administración.
Incluye PostgreSQL local independiente, reservas transaccionales, cálculo de disponibilidad, aforo grupal, fichajes parametrizados por empleado y actualización automática del panel.

Desde el menú puedes gestionar **Clientes** (datos, notas, estado e historial), **Servicios** (duración, aforo y precio), **Profesionales**, **Turnos**, **Usuarios** y **Permisos**. Las fichas se guardan en PostgreSQL; los clientes inactivos o bloqueados no pueden recibir nuevas reservas. Usa el estado inactivo para conservar el historial.

Para crear accesos: añade los empleados en Profesionales y abre Usuarios. La primera cuenta debe ser Administración, con una contraseña de al menos 10 caracteres. Esa cuenta se inicia automáticamente; las siguientes entran desde `login.html`. Recepción gestiona clientes y reservas; Entrenador consulta sus turnos y registra sus propios fichajes. Solo Administración gestiona la plantilla y los accesos. No se han creado contraseñas predeterminadas.

En Turnos, cada empleado tiene un horario semanal y excepciones por fecha. Puedes añadir varias franjas para una jornada partida o marcar un día libre. Estos horarios se comprueban al reservar. Las modificaciones que invalidan reservas futuras pendientes o confirmadas se rechazan con un mensaje.

[Guía de arranque, APIs, concurrencia y límites de integración](docs/calendario-backend.md).

```sh
npm test
```

La carpeta `web` contiene las pantallas (inicio, calendario, clientes, servicios, equipo y acceso). También funciona como demostración independiente con Live Server, usando datos locales del navegador.
