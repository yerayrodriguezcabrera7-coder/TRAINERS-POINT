# Demostración local de COBOSU

Desde la raíz de TRAINERS-POINT, con las dependencias instaladas:

```sh
npm run demo
```

Abrir http://127.0.0.1:3001/productos.html y mantener la terminal abierta. Se utiliza un PostgreSQL temporal separado de la base habitual y de la página del puerto 3000. El script no modifica `.env`. La demo ofrece acceso local inicial de administración y no realiza cobros reales.

## Recorrido

1. Productos: «DEMO · Botella de agua» muestra 4 unidades. Se partió de 5, se vendieron 2 y se devolvió 1. La toalla dispone de 10 unidades para probar más operaciones.
2. Historial de ventas: la compra corresponde a Persona de paso. El total original es 5 €, se han devuelto 2,50 € y el importe neto es 2,50 €.
3. Calendario: hay una reserva confirmada para mañana a las 12:00 y una sesión original cancelada a las 10:00.
4. Pendientes de asignación: hay una cita sin trabajador a las 14:00 y otra pendiente de reprogramación a las 16:00. Asignarlas o reprogramarlas actualiza la misma reserva del calendario.
5. Recuperaciones: la sesión de las 10:00 está pendiente de recuperar. Al reservar para Cliente Demostración el mismo servicio, puede utilizarse sin un segundo cobro.
6. Registrar venta permite probar una compra normal, confirmar el descuento de stock y después anularla o devolver unidades desde el historial.

Todos los nombres y operaciones son ficticios. Reiniciar la demo genera una base nueva; no utilizarla para datos reales. `Ctrl+C` cierra el servidor y PostgreSQL de demostración. La aplicación habitual conserva sus propios datos.

Si el puerto 3001 está ocupado, cerrar la demo anterior o elegir otro:

```sh
DEMO_PORT=3002 npm run demo
```
