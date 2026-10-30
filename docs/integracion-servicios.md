# Integración de las ramas y servicios

Rama de trabajo: `integracion/servicios-recuperaciones`. Conserva el trabajo local de Calendario (commit 982bf77) e integra `origin/PaginaUsuarios` (f0883c2), que ya contiene `origin/main`, las fichas de clientes, gimnasios y Prisma. No se ha publicado en GitHub.

Los conflictos de navegación, selección de clientes y turnos se resolvieron preservando las páginas de clientes/usuarios del equipo y los turnos partidos/ausencias locales.

## Datos

Los clientes se consultan en Prisma usando el adaptador existente. Los servicios Prisma se importan al calendario y se combinan con su configuración operativa por centro (JSONB de `calendar.gyms`): horarios, color, entrenadores, aforo y estado. La configuración guardada en el calendario tiene prioridad. No son dos editores sincronizados: las modificaciones operativas se hacen desde Servicios. La ficha histórica conserva el ID del servicio.

Las recuperaciones se guardan en `calendar.recoveries`. La sesión original queda cancelada y no puede reactivarse; el crédito se vincula a una única nueva reserva confirmada. Todas las escrituras usan el bloqueo del gimnasio. Un error revierte la reserva y el crédito conjuntamente. La recuperación marca `chargeAmount=0`; no se ha añadido una pasarela ni se ejecutan cobros reales. Las reservas normales toman el precio del servicio.

La cancelación con dos horas de antelación devuelve el crédito a pendiente. La cancelación tardía o la inasistencia lo resuelve sin recuperación. Administración puede autorizar una excepción al pasar una sesión original a pendiente antes de su inicio.

## Uso

- Servicios: configurar nombre, descripción, duración, precio, color, entrenadores, días/horas y estado.
- Recuperaciones: el administrador o entrenador puede dejar pendiente una sesión confirmada. El entrenador solo puede actuar sobre las suyas.
- Nueva reserva: se ofrece utilizar un crédito compatible del cliente al confirmar.
- Cliente: `mis-reservas.html` permite consultar sus sesiones y reservar con disponibilidad y recuperación opcional. Requiere una cuenta CLIENT asociada a su ficha; no hay registro público de cuentas. El calendario interno sigue reservado al equipo.

Aplicar migraciones en la base de desarrollo elegida con `npm run prisma:migrate:deploy` y arrancar con `npm start`. No se han aplicado migraciones sobre la base compartida durante esta revisión. No requiere servicios externos de pago.
