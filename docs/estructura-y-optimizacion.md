# Estructura del proyecto y optimización

## Dónde editar

Abre la carpeta raíz **TRAINERS-POINT** en VS Code. La interfaz está en `web`, el servidor en `src` y la base de datos en `prisma`. `public/assets` conserva únicamente imágenes y fuentes. `dist` se genera al compilar; no se edita.

| Apartado | Carpeta de la interfaz |
| --- | --- |
| Calendario | `web/calendar` |
| Clientes y ficha del cliente | `web/clients` |
| Servicios | `web/services` |
| Profesionales, usuarios, fichajes, ausencias y turnos | `web/staff` |
| Centros | `web/centers` |
| Productos, ventas y pagos | `web/inventory` |
| Caja | `web/cash` |
| Pendientes, recuperaciones y reservas del cliente | `web/planning` |
| Inicio | `web/dashboard` |
| Acceso y cambio de contraseña | `web/auth` |
| Menú, estilos comunes, ayuda, conexión y actualización automática | `web/shared` |

Cada pantalla conserva sus archivos HTML, CSS y JavaScript. Las direcciones del navegador siguen siendo las mismas: `/index.html`, `/clientes`, `/productos.html`, etc. El catálogo `src/http/asset-catalog.ts` relaciona cada dirección con su archivo; los dos servidores usan el mismo catálogo.

En el servidor:

- `src/index.ts`: arranque, conexiones y coordinación de las peticiones.
- `src/routes`: rutas de clientes, servicios, centros, bonos y operaciones de caja/inventario.
- `src/http`: autorización compartida, lectura de JSON, catálogo, compresión y entrega de archivos.
- `src/validation`: validaciones de fichas, servicios, centros y bonos.
- `src/finance`: stock y ventas, caja, bonos, saldos, conversión a céntimos y transacciones comunes.
- `src/calendar`: reservas, disponibilidad, turnos, fichajes, ausencias y acceso por perfiles.
- `src/lib`: conexión compartida de Prisma.

## Cambios aplicados

### Consultas y cálculos

El saldo pendiente se agrega en PostgreSQL en una consulta. Se mantienen las reglas de pagos parciales, devoluciones, ventas antiguas sin verificar, bonos pendientes y separación de centros. El calendario recibe los totales por cliente, sin cargar todos los detalles de ventas y recibos para calcularlos.

Al vender varios productos, sus precios y existencias se consultan juntos. Las salidas de stock se insertan juntas; las actualizaciones siguen dentro de la misma transacción y conservan el bloqueo por centro que evita ventas o cierres incompatibles. Caja, bonos y productos comparten ahora ese código de transacción.

El estado del calendario prepara índices por reserva y centro en memoria para evitar búsquedas repetidas. Las lecturas independientes se realizan en paralelo. La pantalla prepara índices por cliente, trabajador, servicio y día, y reutiliza los formatos de fecha y moneda.

### Actualización de pantallas

`web/shared/polling.js` espera a que termine cada consulta antes de programar la siguiente. Pausa las consultas cuando la pantalla está oculta, actualiza al volver a verla y reduce la frecuencia de reintentos si se pierde la conexión. Se utiliza en calendario, caja, ficha del cliente, fichajes, pendientes, inicio y los marcadores de llegada de clientes.

Los cambios de recepción y los cobros siguen actualizando las agendas visibles. Los saldos se calculan de nuevo al consultar la base de datos.

### Carga de archivos y organización

Las hojas de estilo, los scripts, el HTML y las fuentes pueden enviarse comprimidos con Brotli o gzip. Los archivos estáticos tienen ETag: si no han cambiado, el navegador recibe una respuesta 304 sin volver a descargar su contenido. El servidor comprueba los cambios de los archivos, por lo que las ediciones locales siguen apareciendo al recargar.

La configuración de ejecución y los datos de la API usan `no-store`. La clave provisional de desarrollo no entra en la caché de archivos ni se entrega en producción.

Se han retirado siete copias duplicadas u obsoletas de pantallas, scripts y estilos. El código que estaba concentrado en `src/index.ts` se ha separado por responsabilidad. Los archivos más compactados de gestión, productos y planificación se han formateado para poder mantenerlos.

La compilación limpia primero `dist` y no genera salida si hay errores de TypeScript. Esto evita que un archivo antiguo siga ocultando una importación incorrecta después de mover el código. VS Code oculta las carpetas generadas en el explorador.

## Mediciones y comprobaciones

Pruebas locales con datos ficticios, sin escribir reservas ni cobros en la base de uso diario:

| Comprobación | Antes | Después |
| --- | --- | --- |
| Datos transferidos para calcular saldos de 180 ventas | 298.791 bytes de historiales | 368 bytes de saldos y una consulta |
| Lectura de productos para una venta de 20 líneas | Una lectura por producto | Una lectura conjunta |
| Descarga de `clients.css` | 99.406 bytes | 17.971 bytes con Brotli; recargas sin cambios: 304 |
| Actualizar semana con 1.000 citas, 10 trabajadores y 300 clientes | Mediana local: 333 ms | Mediana local: 86 ms |
| Creación de formatos de fecha en esa actualización | 3.711 | 0 adicionales, reutilizando los ya creados |

La comparación visual conserva las mismas 1.000 citas, sus etiquetas, 3.696 franjas y 1.694 franjas cerradas. Los tiempos dependen del ordenador y del volumen de datos; son una referencia local, no una medición de producción.

`npm test` comprueba reservas simultáneas, permisos, pagos, deudas, devoluciones, caja, copias, compresión, caché y actualización de pantallas. Las comprobaciones nuevas verifican también la equivalencia de saldos y que una consulta lenta no origine consultas automáticas solapadas.

## Comandos

```sh
npm run dev
npm test
npm run build
```

La aplicación local se abre en `http://localhost:3000/`. Las instrucciones para instalarla en un servidor siguen en [Puesta en marcha](puesta-en-marcha.md).

La optimización supera 102 pruebas locales. Este ordenador no tiene Docker; el flujo de GitHub comprueba también la construcción del contenedor al subir los cambios a main. La publicación en un servidor de la empresa sigue pendiente.
