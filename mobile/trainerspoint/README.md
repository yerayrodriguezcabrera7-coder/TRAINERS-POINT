# Trainers Point · aplicación móvil

Aplicación con entrada a cuentas de clientes y trabajadores, construida sobre el proyecto Expo del equipo. Consulta las mismas reservas del backend de la web. Incluye una demostración separada con datos ficticios; todavía requiere validación de producción.

## Abrir la vista previa en el ordenador

Desde la raíz de TRAINERS-POINT:

```sh
cd mobile/trainerspoint
npm ci
npm run web -- --localhost --port 8081
```

Abrir http://localhost:8081. Mantener la terminal abierta. Para explorar la demostración no se necesita servidor ni contraseña. Para entrar a una cuenta real se necesita el backend de la web en el puerto 3000 y un usuario habilitado del centro.

En Mac se utilizan barras `/`, no `\`, en la ruta. Si ya estás dentro de `mobile/trainerspoint`, no repitas el `cd`.

## Recorrido para revisar con el equipo

1. **Bienvenida → Explorar una demostración → Inicio:** siguiente sesión, entrenador, centro y resumen del bono.
2. **Agenda:** semana con días reservados, filtros por entrenador y detalle de cada reserva.
3. **Mi bono:** saldo, movimientos ilustrativos y renovación.
4. **Renovar mi bono:** elegir Tarjeta o Bizum y pulsar «Simular renovación · sin cobro».
5. **Confirmación:** el saldo de ejemplo pasa a 10 sesiones. Recepción NO recibe datos de esta prueba.
6. **Campana / Perfil → Ver mis avisos:** recordatorios de sesión y renovación de ejemplo.
7. Recargar la página: vuelve al estado inicial. Ningún cambio se guarda en la base de datos.

El contenido de la demostración utiliza un cliente ficticio y precios ilustrativos. «Salir de la demo» vuelve a la bienvenida. «Entrar a mi cuenta» abre el acceso real; no mezcla esos datos de ejemplo con las reservas del usuario. No se piden datos bancarios, no se llama a proveedores de pago y no se envían notificaciones.

## Organización

- `App.tsx`: navegación entre bienvenida, cuenta real y demostración.
- `src/preview/ClientPreview.tsx`: pantallas, navegación y recorrido simulado.
- `src/preview/data.ts`: reservas ficticias con fechas relativas al día de apertura.
- `src/AccountApp.tsx`: sesión de la cuenta real, caducidad y cierre.
- `src/screens/WelcomeScreen.tsx`, `LoginScreen.tsx` y `AccessHelp.tsx`: bienvenida, acceso y ayuda.
- `src/screens/HomeScreen.tsx`: agenda de la persona autenticada, con datos del servidor.
- `../shared/`: API, tipos, configuración, selección de reservas y pruebas compartidas. La vista previa no realiza llamadas al servidor.

Funcionamiento para el centro y los usuarios: [informe del acceso](../ACCESO_USUARIOS.md). Capturas: [bienvenida](docs/vista-bienvenida.png) y [formulario de acceso](docs/vista-acceso.png).

## Validación local

```sh
npm run typecheck
npm run test:shared
npm run export:web
```

Comprobar también navegación por las cuatro pestañas, filtro de agenda, detalle de reserva, cierre de ventanas, renovación simulada con ambos métodos, avisos y reinicio al recargar. Revisar anchuras de 320, 390, 768 y 1440 píxeles y navegación con teclado. Las exportaciones se generan en `dist/` (ignorado por Git).

## Probar en un teléfono

Esta base utiliza **Expo SDK 58**, React Native 0.88 y React 19.3. Requiere Node 22.13 o posterior. En Android o simulador iOS se necesita una versión de Expo Go compatible con SDK 58 o una compilación de desarrollo. No se ha contratado ningún servicio ni publicado en tiendas. El arranque del simulador depende además de que Xcode tenga un runtime iOS válido instalado.

Referencias oficiales: [compatibilidad de Expo Go](https://docs.expo.dev/troubleshooting/expo-go-version-mismatch/), [vista web de Expo](https://docs.expo.dev/workflow/web/).

Para una revisión visual desde el navegador del teléfono, se puede arrancar `npm run web -- --lan --port 8081` y abrir `http://IP_LOCAL_DEL_MAC:8081` estando ambos en la misma Wi-Fi de confianza. Solo expone esta demo, no el backend ni los datos reales. Esa opción requiere que la red/firewall permita la conexión; no se ha validado en un teléfono físico.

## Trabajo pendiente para la primera fase real

- Validar el acceso con cuentas reales de cada centro y la ejecución en dispositivos físicos. Actualmente la sesión se mantiene en memoria; al cerrar o recargar se debe iniciar sesión de nuevo. No se guardan contraseñas.
- Integrar bonos en la cuenta real; las reservas ya se consultan en el mismo backend de la web, sin duplicar bases de datos.
- Configurar proveedor de cobro aprobado por la empresa. Confirmar pagos en el servidor mediante eventos firmados e idempotentes antes de activar bonos o marcar deudas como pagadas. La app no debe poder declarar un pago recibido.
- Integrar notificaciones: permisos del dispositivo, tokens, tareas programadas, preferencias y control de duplicados.
- Mantener las dependencias de SDK 58 y los parches de herramientas transitivas alineados; los overrides de glob/minimatch corrigen avisos de seguridad del empaquetador.
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
