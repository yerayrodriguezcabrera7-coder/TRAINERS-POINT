# Aplicaciones móviles de Trainers Point y Cobosu

El compañero añadió dos bases React Native + Expo:

- **`trainerspoint/`**: aplicación de Trainers Point. Incluye una **vista previa navegable con datos ficticios**, todavía sin conexión a cobros ni al backend.
- **`cobosu/`**: esqueleto original del segundo centro; pendiente de revisión e integración.
- **`shared/`**: cliente HTTP, tipos y temas del esqueleto. Los contratos deben contrastarse con el backend antes de usarlos en producción.

## Ver el diseño de Trainers Point

Desde la raíz del repositorio:

```sh
cd mobile/trainerspoint
npm ci
npm run web -- --localhost --port 8081
```

Abrir http://localhost:8081. No hace falta iniciar la base de datos ni introducir credenciales.

Consulta [el recorrido de prueba, organización del código y trabajo pendiente](trainerspoint/README.md).

## Desarrollo nativo

`npm start` arranca Expo desde la carpeta de cada aplicación. La base utiliza SDK 52: la versión de Expo Go debe ser compatible. En iPhone físico será necesaria una actualización del SDK o una compilación de desarrollo; no se debe asumir que el QR funciona con la versión de la tienda. [Documentación de compatibilidad](https://docs.expo.dev/troubleshooting/expo-go-version-mismatch/).

Cambiar una IP en el cliente no basta para conectar la aplicación al backend: también deben configurarse el acceso de red, HTTPS y la autenticación. No se ha abierto el servidor del gimnasio a la red ni habilitado servicios de pago.
