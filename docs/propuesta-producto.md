# Trainers Point: de herramienta local a producto para centros deportivos

## Qué vendería

Una herramienta que reúna reservas, clientes y equipo para que recepción organice el centro desde una sola pantalla. La promesa debe ser concreta: menos tareas duplicadas, mejor visibilidad de los horarios y seguimiento de lo que queda por hacer. Mediría esos beneficios con un piloto antes de prometer ahorros o porcentajes.

## Cambios aplicados

- Identidad visual propia con grafito, fondo cálido y rojo de la marca. Logo original conservado.
- Navegación agrupada en centro, equipo y administración; módulos pendientes dentro de «En preparación».
- Inicio con reservas del día, pendientes, clientes activos y fichajes abiertos. Las cifras proceden del servidor; no se simulan ventas ni ocupación.
- Agenda con acceso a cada reserva y filtro de pendientes. Recepción solo ve su propio fichaje; administración puede ver el equipo.
- Diseño compartido entre calendario, fichas, turnos, fichajes e inicio de sesión; controles adaptados a ventanas pequeñas y navegación por teclado.

## Prioridad antes de implantar en una empresa

| Prioridad | Mejora | Qué debe comprobarse para darla por terminada |
|---|---|---|
| 1 | Unificar la base de datos del negocio | Importar una muestra acordada de clientes y servicios sin duplicados, con historial y relaciones correctos. El módulo actual conserva estos datos en JSONB; sigue pendiente unirlos con otros módulos o ramas de la empresa. |
| 1 | Alojamiento, copias y recuperación | Entorno de pruebas separado del real, HTTPS, copias automáticas y una recuperación demostrada con datos de prueba. Definir cuánto tiempo y cuántos datos puede permitirse perder el centro. |
| 1 | Acceso y trazabilidad | Revisar permisos con cada puesto, recuperación de contraseña, segundo factor para administración y registro de quién cambió una reserva, un permiso o un fichaje. El login y los perfiles actuales son una base; estas ampliaciones no están implementadas. |
| 1 | Configuración por negocio | Nombre, logo, zona horaria, horarios y servicios configurables. Hoy el centro se selecciona en el servidor y varias etiquetas visuales siguen siendo de Cobosu; aún no es un producto con alta autónoma de empresas o selector de centros. |
| 2 | Entrada y salida de datos | Importación de clientes con vista previa y detección de duplicados; exportaciones con permisos y alcance definidos. Que la empresa pueda recuperar su información. |
| 2 | Experiencia de recepción | Validar con el equipo la creación de reservas, cambios de turno, bajas y atención a clientes. Revisar móvil, accesibilidad, errores y lentitud de red con casos reales. |
| 2 | Informes útiles | Reservas, cancelaciones, ausencias y horas registradas con definiciones claras. Ingresos y cobros solo cuando exista una integración de pagos verificable. |
| 3 | Recordatorios e integraciones | Correo/SMS, pagos o sistemas actuales cuando el negocio confirme su utilidad, coste y uso permitido de los datos. La IA es opcional; no hace falta para el calendario, las fichas ni los fichajes. |

Las funciones de seguridad deberían verificarse contra criterios comprobables como [OWASP ASVS](https://devguide.owasp.org/en/06-verification/01-guides/03-asvs/). Para las copias, la propuesta incluye ensayar la recuperación, siguiendo el enfoque de protección y recuperación de la [guía NIST para pequeñas empresas](https://tsapps.nist.gov/publication/get_pdf.cfm?pub_id=957322). Estas referencias orientan el trabajo; no acreditan una certificación del producto.

## Piloto propuesto

1. Elegir un centro y las personas responsables de administración y recepción; acordar qué tareas entran en el piloto.
2. Revisar datos, accesos, copias y soporte antes de cargar información real. Acordar con la empresa las necesidades de privacidad y conservación de datos.
3. Probar durante dos semanas. Medir tiempo por reserva, errores o duplicados, incidencias de fichaje y tareas que todavía se hacen fuera de la aplicación.
4. Resolver los problemas encontrados y acordar criterios de aceptación, formación, mantenimiento y respuesta a incidencias antes de ampliar el uso.

## Cómo presentarlo

«Con esta aplicación podéis gestionar las reservas, las fichas de clientes y los horarios del equipo desde un mismo lugar. La adaptamos a vuestra forma de trabajar y empezamos con una prueba en un centro. Así comprobamos qué trabajo ahorra antes de extenderla al resto del negocio».

Propondría separar la puesta en marcha (configuración, importación y formación) del mantenimiento (alojamiento, copias, soporte y mejoras acordadas). El precio requiere conocer centros, usuarios, integraciones y nivel de soporte; todavía no hay una estimación validada.

Estado: versión local para demostración y desarrollo. No se ha desplegado, certificado ni publicado; los requisitos de implantación de esta lista siguen siendo trabajo pendiente.
