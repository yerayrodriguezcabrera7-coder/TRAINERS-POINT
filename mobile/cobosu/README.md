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

Esta es la base inicial del compañero, no una integración terminada con la base de datos. La URL y el centro del cliente API siguen siendo valores iniciales; el acceso real, los contratos API y los permisos requieren revisión antes de utilizarla con clientes. La vista previa visual de Trainers Point está en `../trainerspoint`, puerto 8081.

No se han incluido referencias a iconos o imágenes inexistentes. Se podrán añadir los recursos de marca cuando estén preparados.
