# Trainers Point · aplicación móvil

Primera vista previa interactiva del área de clientes, construida sobre el proyecto Expo del equipo. No es todavía una aplicación de producción ni una copia independiente de las reservas.

## Abrir la vista previa en el ordenador

Desde la raíz de TRAINERS-POINT:

```sh
cd mobile/trainerspoint
npm ci
npm run web -- --localhost --port 8081
```

Abrir http://localhost:8081. Mantener la terminal abierta. No necesita servidor, base de datos, contraseña ni cuenta de Expo. El backend de la web puede continuar en el puerto 3000.

En Mac se utilizan barras `/`, no `\`, en la ruta. Si ya estás dentro de `mobile/trainerspoint`, no repitas el `cd`.

## Recorrido para revisar con el equipo

1. **Inicio:** siguiente sesión, entrenador, centro y resumen del bono.
2. **Agenda:** semana con días reservados, filtros por entrenador y detalle de cada reserva.
3. **Mi bono:** saldo, movimientos ilustrativos y renovación.
4. **Renovar mi bono:** elegir Tarjeta o Bizum y pulsar «Simular renovación · sin cobro».
5. **Confirmación:** el saldo de ejemplo pasa a 10 sesiones. Recepción NO recibe datos de esta prueba.
6. **Campana / Perfil → Ver mis avisos:** recordatorios de sesión y renovación de ejemplo.
7. Recargar la página: vuelve al estado inicial. Ningún cambio se guarda en la base de datos.

Todo el contenido utiliza un cliente ficticio y precios ilustrativos. No se piden datos bancarios, no se llama a proveedores de pago y no se envían notificaciones.

## Organización

- `App.tsx`: entrada de la vista previa.
- `src/preview/ClientPreview.tsx`: pantallas, navegación y recorrido simulado.
- `src/preview/data.ts`: reservas ficticias con fechas relativas al día de apertura.
- `src/LegacyApp.tsx` y `src/screens/`: primer esqueleto de acceso que aportó el compañero, conservado para revisar la integración. No se ejecuta en la vista previa; no se considera autenticación validada.
- `../shared/`: API, tipos y temas del esqueleto compartido. Se revisarán sus contratos antes de conectar datos reales; la demo no los invoca.

## Validación local

```sh
npm run typecheck
npm run export:web
```

Comprobar también navegación por las cuatro pestañas, filtro de agenda, detalle de reserva, cierre de ventanas, renovación simulada con ambos métodos, avisos y reinicio al recargar. Revisar anchuras de 320, 390, 768 y 1440 píxeles y navegación con teclado. Las exportaciones se generan en `dist/` (ignorado por Git).

## Probar en un teléfono

Esta base utiliza **Expo SDK 52**. No basta con instalar cualquier versión actual de Expo Go. En Android o simulador iOS se necesita una versión compatible; en iPhone físico no puede instalarse una versión antigua de Expo Go. Antes de distribuir la aplicación habrá que actualizar el SDK o preparar una compilación de desarrollo. No se ha contratado ningún servicio ni publicado en tiendas.

Referencias oficiales: [compatibilidad de Expo Go](https://docs.expo.dev/troubleshooting/expo-go-version-mismatch/), [vista web de Expo](https://docs.expo.dev/workflow/web/).

Para una revisión visual desde el navegador del teléfono, se puede arrancar `npm run web -- --lan --port 8081` y abrir `http://IP_LOCAL_DEL_MAC:8081` estando ambos en la misma Wi-Fi de confianza. Solo expone esta demo, no el backend ni los datos reales. Esa opción requiere que la red/firewall permita la conexión; no se ha validado en un teléfono físico.

## Trabajo pendiente para la primera fase real

- Revisar y conectar inicio de sesión de clientes, sesión segura y permisos del servidor; no confiar en identificadores de cliente enviados por el móvil.
- Consumir las reservas y los bonos del mismo backend de la web; no duplicar bases de datos.
- Configurar proveedor de cobro aprobado por la empresa. Confirmar pagos en el servidor mediante eventos firmados e idempotentes antes de activar bonos o marcar deudas como pagadas. La app no debe poder declarar un pago recibido.
- Integrar notificaciones: permisos del dispositivo, tokens, tareas programadas, preferencias y control de duplicados.
- Revisar dependencias del SDK antiguo antes de distribuir: la auditoría inicial detecta avisos en herramientas transitivas. No se ha aplicado una actualización mayor automática.
- Probar en Android/iOS reales, accesibilidad, recuperación de cuenta y errores de red.

Rutinas, nutrición, medidas y actividades aparecen únicamente como futuras ampliaciones.

## Comprobaciones realizadas en esta entrega

- TypeScript sin errores y exportación web completada.
- Recorrido de navegador con agenda, filtro, detalle, avisos y renovación simulada con Tarjeta y Bizum.
- Cancelar la renovación conserva el saldo; recargar restablece los datos ficticios.
- Cuatro anchuras (320, 390, 768 y 1440 px), sin desbordamiento horizontal de página.
- Ninguna petición a la API del gimnasio ni envío POST durante el recorrido de prueba.
- [Captura de inicio](docs/vista-inicio.png) y [captura de confirmación](docs/vista-renovacion.png).

Estas comprobaciones de navegador no sustituyen pruebas en un dispositivo Android/iOS físico.
