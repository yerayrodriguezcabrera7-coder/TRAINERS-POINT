# Aplicaciones móviles de Trainers Point y Cobosu

El compañero añadió dos bases React Native + Expo:

- **`trainerspoint/`**: entrada a la cuenta real del cliente o trabajador y una demostración separada con datos ficticios. El acceso real consulta las reservas del mismo backend que la web.
- **`cobosu/`**: acceso al servidor y agenda del cliente. Las funciones futuras se identifican como pendientes.
- **`shared/`**: cliente HTTP ajustado a las rutas del backend, tipos, configuración y pruebas sin conexión a datos reales.

## Ver el diseño de Trainers Point

Desde la raíz del repositorio:

```sh
cd mobile/trainerspoint
npm ci
npm run web -- --localhost --port 8081
```

Abrir http://localhost:8081. «Explorar una demostración» no necesita servidor ni credenciales. «Entrar a mi cuenta» requiere el backend y un usuario habilitado del centro.

Consulta [el recorrido de prueba, organización del código y trabajo pendiente](trainerspoint/README.md).

## Desarrollo nativo

`npm start` arranca Expo desde la carpeta de cada aplicación. Ambas utilizan SDK 58 y necesitan Node 22.13 o posterior. La versión de Expo Go debe ser compatible con el SDK, o se puede crear una compilación de desarrollo. [Documentación de compatibilidad](https://docs.expo.dev/troubleshooting/expo-go-version-mismatch/).

Cambiar una IP en el cliente no basta para conectar la aplicación al backend: también deben configurarse el acceso de red, HTTPS y la autenticación. No se ha abierto el servidor del gimnasio a la red ni habilitado servicios de pago.

Los accesos reales usan `EXPO_PUBLIC_API_URL` y, opcionalmente, `EXPO_PUBLIC_GYM_ID` (ver `.env.example` en cada app). Sin ID de centro se usa el configurado en el servidor. Nunca guardar claves privadas ni contraseñas en variables `EXPO_PUBLIC_*`. En iPhone virtual la URL predeterminada es `http://127.0.0.1:3000`; en el emulador Android es `http://10.0.2.2:3000`.

Cada aplicación es independiente: ejecutar `npm ci` en las dos carpetas si se quiere editar ambas en VS Code. Para comprobar cada una: `npm run typecheck`, `npm run test:shared` y `npx expo export --platform all`.

En desarrollo web, Metro reenvía `/api` al servidor configurado para evitar errores de origen cruzado. El proxy solo acepta el host local y su propio origen; no abre la API a otros sitios. Por ejemplo, iniciar el backend en el puerto 3000 y Cobosu con `npm run web -- --localhost --port 8082`. Una exportación web publicada necesita su propio proxy `/api` en el mismo dominio; Metro no se incluye en producción.

Detalles del arreglo y comprobaciones: [correcciones de mobile](CORRECCIONES.md).

Funcionamiento del acceso y alta de cuentas: [acceso de usuarios](ACCESO_USUARIOS.md).
