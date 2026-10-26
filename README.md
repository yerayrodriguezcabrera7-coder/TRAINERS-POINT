# Trainers Point

Aplicacion unica con un solo servidor, un solo puerto y un solo comando de arranque.

## Requisitos

- Node.js 22 o superior.
- PostgreSQL AWS accesible mediante DATABASE_URL.

## Instalacion

```sh
npm install
copy .env.example .env
npm run prisma:generate
npm start
```

En PowerShell puede usarse npm.cmd. No imprimas ni compartas .env.

## Arranque

npm start compila TypeScript, prepara el esquema del calendario en PostgreSQL AWS y levanta Trainers Point en:

http://localhost:3000/

El calendario ya no usa PostgreSQL local ni la carpeta .calendar-dev/. Ctrl+C detiene el servidor.

## Rutas

- / o /index.html: Calendario.
- /inicio.html: Inicio.
- /fichajes.html: Fichajes.
- /gestion.html?section=services: Servicios.
- /clientes: Clientes AWS.
- /gimnasios: Gimnasios AWS.
- /login.html: Acceso del equipo.

Todas las pantallas usan un unico menu. Clientes y Gimnasios conservan sus hojas de estilo y su logica de AWS.

## Scripts

- npm start: compilacion y arranque unico.
- npm run dev: desarrollo con recarga.
- npm test: pruebas del calendario.
- npm run db:test: prueba de conexion a AWS.
- npm run prisma:generate: genera el cliente Prisma.

El esquema del calendario se crea en AWS durante el arranque para conservar sus reglas de disponibilidad, reservas, fichajes y acceso. La migracion de datos existentes de .calendar-dev/ debe hacerse antes de borrar esa carpeta.

## Verificacion de AWS

Configura DATABASE_URL en .env a partir de .env.example. Ejecuta npm run db:test para comprobar conectividad. No uses credenciales reales en pruebas automatizadas ni subas .env.
