# Trainers Point

Aplicacion unica con un solo servidor, un solo puerto y un solo comando de arranque.

## Requisitos

- Node.js 22 o superior.
- PostgreSQL local integrado para desarrollo.

## Instalacion

```sh
npm install
copy .env.example .env
npm run prisma:generate
npm run dev
```

En PowerShell puede usarse npm.cmd. No imprimas ni compartas .env.

`npm run dev` configura y arranca PostgreSQL local en `.calendar-dev` (puerto `55439`), aplica las migraciones del CRM y del calendario, y activa una cuenta local `admin/admin` cuando aún no hay usuarios. Tanto el CRM como el calendario usan esa base local; no se conecta a AWS. Los datos de AWS no se copian: el CRM local empieza vacío. La base y sus credenciales permanecen en `.calendar-dev/`, que no se versiona.

## Arranque

npm run dev levanta Trainers Point con recarga en:

http://localhost:3000/

Ctrl+C detiene el servidor de la aplicación. PostgreSQL local permanece iniciado para conservar los datos entre ejecuciones.

## Rutas

- / o /index.html: Calendario.
- /inicio.html: Inicio.
- /fichajes.html: Fichajes.
- /gestion.html?section=services: Servicios.
- /clientes: Clientes.
- /gimnasios: Gimnasios.
- /login.html: Acceso del equipo.
- /change-password.html: Cambio obligatorio de la contraseña inicial.

Al crear una cuenta, el usuario de acceso es el nombre de usuario elegido y la contraseña temporal es `Trainerspoint`. El primer inicio obliga a cambiarla. Las contraseñas se almacenan con scrypt (hash con salt aleatorio), no como texto ni cifrado reversible.

Crear una ficha de cliente no genera una cuenta de acceso. Si un cliente necesita acceder al calendario, su cuenta se puede crear manualmente desde la gestión de usuarios.

Todas las pantallas usan un unico menu.

## Scripts

- npm start: compilacion y arranque unico.
- npm run dev: desarrollo con recarga.
- npm test: pruebas del calendario.
- npm run db:test: comprueba la conexión configurada en `DATABASE_URL`.
- npm run prisma:generate: genera el cliente Prisma.

El directorio `.calendar-dev/` contiene la base local persistente y sus credenciales; no lo borres si quieres conservar los datos locales.
