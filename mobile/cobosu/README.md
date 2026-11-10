# Cobosu · base de la aplicación móvil

Esta carpeta es un proyecto Expo independiente de `../trainerspoint`. Sus dependencias deben instalarse aquí, aunque la otra aplicación ya tenga `node_modules`.

Desde la raíz de TRAINERS-POINT:

```sh
cd mobile/cobosu
npm ci
npm run typecheck
npm run web -- --localhost --port 8082
```

- `App.tsx`: entrada de la aplicación.
- `src/screens/`: pantallas iniciales de acceso y de inicio.
- `../shared/`: API, tipos y temas compartidos. Desde las pantallas se accede mediante `../../../shared/`.
- `tsconfig.json`: hereda la configuración JSX de Expo. Requiere instalar las dependencias antes de que VS Code pueda resolverla.
- `metro.config.js`: permite que el empaquetador lea la carpeta compartida.

Si VS Code conserva diagnósticos antiguos tras instalar, ejecutar «TypeScript: Restart TS Server» desde la paleta de comandos.

Para comprobar el empaquetado: `npx expo export --platform all`.

Utiliza Expo SDK 58 (Node 22.13 o posterior). El cliente API lee `EXPO_PUBLIC_API_URL` y opcionalmente `EXPO_PUBLIC_GYM_ID`, documentados en `.env.example`. En iPhone virtual se utiliza `http://127.0.0.1:3000`; en el emulador Android, `http://10.0.2.2:3000`. Sin ID de centro se utiliza el centro configurado en el servidor.

El acceso gestiona errores de conexión, sesiones caducadas y cambio obligatorio de contraseña. La agenda utiliza `bookings` del backend, sin inventar sesiones ni estados de cuota. Rutinas, evolución y creación de reservas desde esta pantalla continúan pendientes y se indican como tales. La integración debe probarse con una cuenta de cliente y su centro real antes de utilizarla en producción. La vista previa visual de Trainers Point está en `../trainerspoint`, puerto 8081.

Para verificar la API compartida sin enviar nada al servidor: `npm run test:shared`. Los overrides de `glob` y `minimatch` corrigen avisos de seguridad de herramientas de Expo.

No se han incluido referencias a iconos o imágenes inexistentes. Se podrán añadir los recursos de marca cuando estén preparados.
