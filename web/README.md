# Interfaz de Trainers Point

Todas las pantallas están agrupadas por apartado en esta carpeta. Consulta el [mapa del proyecto](../docs/estructura-y-optimizacion.md) para localizar cada funcionalidad.

- `shared`: menú, estilos comunes, ayuda y actualización automática.
- `calendar`, `clients`, `services`, `staff`, `centers`, `inventory`, `cash`, `planning`, `dashboard` y `auth`: pantallas de cada apartado.

El servidor mantiene las direcciones habituales de las páginas mediante `src/http/asset-catalog.ts`. Las imágenes y fuentes están en `public/assets`.

Para arrancar, usa `npm run dev` desde la raíz del proyecto y abre `http://localhost:3000/`.
