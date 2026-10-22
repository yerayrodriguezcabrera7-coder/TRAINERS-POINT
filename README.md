# TRAINERS-POINT

## Calendario con backend

```sh
npm install
npm run dev:calendar
```

Abre http://127.0.0.1:3000 y utiliza la clave local mostrada en la terminal.
Incluye PostgreSQL local independiente, reservas transaccionales, cálculo de disponibilidad, aforo grupal y actualización del panel cada dos segundos.

[Guía de arranque, APIs, concurrencia y límites de integración](docs/calendario-backend.md).

```sh
npm test
```

La carpeta `calendario` también funciona como demostración independiente con Live Server, usando datos locales del navegador.
