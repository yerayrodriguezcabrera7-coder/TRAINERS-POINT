# Calendario · Trainers Point

**Backend disponible:** para guardar en PostgreSQL y sincronizar paneles, ejecutar `npm run dev:calendar` desde TRAINERS-POINT. Consulta [la guía del backend](../docs/calendario-backend.md). Lo que sigue describe el modo de demostración con Live Server.

Frontend funcional en español, independiente y sin instalación de dependencias.

## Abrir y usar

Abre esta carpeta `Calendario` en VS Code y abre `index.html` con **Live Server**, si ya tienes esa extensión. También puedes hacer doble clic en `index.html` para abrirlo directamente en el navegador.

Para servirlo con Python, abre una terminal en esta carpeta y ejecuta:

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

Visita http://127.0.0.1:8765. Mantén la misma dirección, puerto y navegador para acceder a las mismas reservas guardadas. El almacenamiento de archivos abiertos directamente (`file://`) depende del navegador; se recomienda usar el servidor local.

## Incluye

- Día, Semana y Mes; flechas, Hoy y selector de fecha.
- Columnas por entrenador en Día y Semana. La semana completa permite desplazamiento horizontal.
- Filtros combinados por entrenador, servicio y sala, y botón para limpiarlos.
- Tarjetas con cliente, servicio, inicio, fin y estado: confirmada verde, pendiente naranja, finalizada gris y cancelada roja. El estado también se escribe como texto.
- Clic en una franja libre para crear una reserva; en Mes, clic en el espacio vacío o en `+`.
- Modal para crear y editar reservas, añadir clientes y consultar su ficha e historial local.
- Cancelación con confirmación, conservando la tarjeta roja y liberando el horario. Puede reactivarse desde el selector de estado si hay disponibilidad.
- Horarios de apertura editables por día de la semana, compartidos por todos los entrenadores. Las franjas cerradas están sombreadas y deshabilitadas.
- Validación de inicio/fin, horario, solapamientos de entrenador y sala. No se permite modificar el horario si deja reservas activas futuras fuera de apertura.
- Adaptación a móvil, controles de teclado, cuadros de diálogo con foco y cierre con Escape.
- Persistencia local con avisos si falla el almacenamiento o cambian los datos desde otra pestaña.

## Datos y límites de esta entrega

Se inicia con **datos ficticios** de tres entrenadores, tres servicios, tres salas y doce clientes. No se han copiado los datos de la captura de referencia.

Las reservas y los clientes se guardan en `localStorage`, bajo `trainers-point-calendar-v1`, **solo en este navegador y origen**. No hay servidor de reservas, autenticación ni sincronización con otros trabajadores. El botón Guardar no escribe en GitHub ni en una base de datos.

La ficha de cliente muestra nombre, correo, teléfono, notas e historial local; no conecta con el módulo de clientes del equipo.

Esta versión está instalada en `Practicas/Calendario` como un prototipo independiente. No se ha cambiado ninguna rama y no se ha hecho commit ni push. La carpeta llamada Calendario y la rama Git Calendario son conceptos distintos.

## Integración pendiente con TRAINERS-POINT

Cuando haya acceso al repositorio, revisar su framework y sus modelos antes de integrar. `calendar-core.js` contiene las reglas de fechas, disponibilidad y solapamiento; `app.js` contiene los datos de ejemplo, la presentación y el almacenamiento. Sustituir `seedData`, `loadData` y `saveData` por el acceso a los clientes, empleados, servicios, salas, horarios y reservas reales. La validación definitiva de disponibilidad debe ejecutarse también en el servidor, dentro de una transacción, para impedir dobles reservas concurrentes.

Los horarios son una franja continua al día y de capacidad uno por entrenador y sala. Descansos partidos, festivos, vacaciones y sesiones de grupo no forman parte de esta versión. Los estados se cambian manualmente.

## Archivos

- `index.html`: pantalla y formularios.
- `styles.css`: diseño adaptable.
- `calendar-core.js`: reglas reutilizables.
- `app.js`: comportamiento y persistencia local.
- `calendar-core.test.cjs`: pruebas de reglas; no se carga en el navegador.
- `fichajes.html`, `fichajes.css` y `fichajes.js`: control horario parametrizado; necesita el backend local.

## Pruebas

Con Node.js instalado:

```sh
node --test calendar-core.test.cjs
```

Casos cubiertos: horario y días cerrados, fechas inválidas, horas invertidas, reservas consecutivas, conflictos por entrenador/sala, edición, cancelación/reactivación, cambio de año, año bisiesto, cambio de horario y distribución de citas superpuestas.
