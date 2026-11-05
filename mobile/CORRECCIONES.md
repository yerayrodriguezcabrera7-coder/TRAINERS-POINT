# Revisión de mobile · 6 de noviembre de 2026

## Dependencias y compilación

Las dos aplicaciones utilizan Expo 58, React Native 0.88.1 y React 19.3, con dependencias alineadas mediante las comprobaciones de Expo. Se corrigen la configuración antigua de splash, los tipos del entorno Expo y la referencia ScrollView del prototipo. Los parches de glob/minimatch se fijan mediante overrides para las herramientas de desarrollo.

## Acceso y API

- iPhone virtual utiliza 127.0.0.1; Android utiliza 10.0.2.2. Se pueden configurar URL y centro sin editar el código.
- El centro deja de ser un identificador inventado: se envía el ID configurado o se utiliza el predeterminado del backend.
- La sesión se limpia al caducar y al cerrar, incluso si no hay conexión. El token se mantiene solo en memoria.
- Los errores aparecen dentro del formulario, también en web. Las solicitudes tienen un límite de 15 segundos.
- El cambio obligatorio de contraseña se completa antes de abrir la agenda.
- La agenda usa reservas reales (`bookings`), filtra cancelaciones y sesiones pasadas y no inventa una sesión ni una cuota activa cuando faltan datos.
- Se corrigen rutas y cuerpos de disponibilidad, reserva de cliente, ficha y finalización de una sesión por el trabajador. Esta última conserva la versión para evitar sobrescribir cambios concurrentes.
- Se retiran operaciones contra rutas inexistentes, incluida la cancelación de cliente: esa gestión continúa en recepción.
- Los apartados futuros dejan de simular acciones que no existen.
- En web local se usa un proxy del mismo origen; los dominios externos no pueden utilizarlo.

## Verificado

- TypeScript sin errores en Trainers Point y Cobosu.
- Expo Doctor: 20/20 comprobaciones en cada aplicación.
- Exportación de las dos apps para web, iOS y Android completada.
- npm audit: 0 vulnerabilidades detectadas en cada aplicación.
- 11 pruebas compartidas, con API ficticia o servidores locales efímeros; incluyen contratos corregidos, caducidad, cierre sin conexión, timeout, filtrado de reservas y rechazo de orígenes ajenos al proxy.
- Prueba de navegador del acceso Cobosu con datos ficticios: campos vacíos, credenciales incorrectas, cambio provisional, agenda vacía y sesión caducada.
- Prueba de la vista previa Trainers Point: navegación, agenda, avisos y renovación simulada en cuatro anchuras sin desbordamiento horizontal.

## Alcance pendiente

La exportación nativa comprueba el empaquetado, no equivale a ejecutar la app en un dispositivo físico o un simulador. El runtime de iOS instalado en Xcode debe funcionar antes de validar ese paso.

La vista previa sigue utilizando datos ficticios. Pagos, notificaciones automáticas, persistencia segura del acceso y las ampliaciones futuras siguen pendientes de integración. Las rutas compartidas se han contrastado con el backend; aún debe validarse el flujo completo con cuentas y centros reales antes de producción. No se han realizado cobros ni enviado mensajes.

Referencia: [actualización de Expo](https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/) y [Expo SDK 58](https://expo.dev/changelog/sdk-58).
