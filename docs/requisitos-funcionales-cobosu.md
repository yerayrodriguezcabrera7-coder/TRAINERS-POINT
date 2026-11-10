# Requisitos funcionales de COBOSU

Documento de requisitos facilitado por la empresa. Su inclusión en el repositorio no certifica que todos los puntos estén implementados.

1. Gestión de servicios
Primero habría que modificar la parte de los servicios, ya que es lo que contrata y paga el cliente. La idea es que cada servicio tenga su propia configuración y que esta información se utilice automáticamente cuando se realice una reserva.
Al crear o editar un servicio, el administrador debería poder configurar:
- Nombre y descripción del servicio.
- Precio.
- Duración, si corresponde.
- Días y horarios en los que se puede reservar.
- Entrenadores que pueden realizarlo, si corresponde.
- Un color propio para identificar ese servicio en el calendario.
- Estado del servicio, para poder activarlo o desactivarlo.
Cada servicio debe tener sus propias condiciones. Por ejemplo, uno podría estar disponible de lunes a viernes y otro únicamente los fines de semana.
Además, cada servicio debe tener un color diferente para que las reservas se puedan distinguir fácilmente en el calendario. Este color se configurará al crear o editar el servicio y se aplicará automáticamente a todas las reservas relacionadas con él.
Toda esta información debe guardarse en la base de datos. Así, cuando se cree una reserva, no será necesario introducir manualmente los datos del servicio. Si se desactiva un servicio, no se podrá seleccionar para nuevas reservas, pero se conservará el historial de las anteriores.
2. Calendario según el tipo de usuario
El calendario debe tener tres vistas diferentes, dependiendo del tipo de usuario que acceda.
Administrador
Debe poder consultar y gestionar todas las reservas del gimnasio. Tiene que poder ver qué cliente ha reservado, qué servicio ha contratado, qué entrenador tiene asignado y en qué fecha y horario se realizará la sesión.
También debe poder consultar el calendario por días, semanas o meses, filtrar las reservas y gestionar las cancelaciones y los entrenamientos pendientes.
Cliente
Debe poder acceder al calendario, seleccionar el servicio que quiere reservar y consultar únicamente los días y horarios disponibles para ese servicio.
También debe poder consultar el precio y la duración del servicio, si corresponde, y ver sus próximas reservas y los entrenamientos que tenga pendientes de recuperar.
Entrenador
Debe tener su propio calendario para consultar qué clientes tiene asignados, a qué hora debe atenderlos y qué servicio tiene que realizar.
También debe poder consultar las sesiones pendientes, las cancelaciones y las modificaciones de sus reservas.
Cada entrenador debe ver sus propias sesiones, mientras que el administrador podrá consultar todas las reservas.
3. Conexión entre los servicios y el calendario
Aunque la gestión de servicios y el calendario sean módulos independientes, deben estar conectados.
Cuando el cliente seleccione un servicio para reservar, el sistema debe consultar automáticamente su configuración y mostrar únicamente los días y horarios en los que se puede reservar.
También debe comprobar que el horario esté disponible, que la duración del servicio encaje en la franja elegida y que el entrenador asignado, si corresponde, pueda realizar la sesión.
Una vez confirmada la reserva, esta debe aparecer automáticamente en los calendarios correspondientes del administrador, del cliente y del entrenador asignado. Además, debe mostrarse con el color configurado para ese servicio.
Por ejemplo, si un servicio tiene una duración de 60 minutos y solo se puede reservar los lunes y miércoles, el calendario debe mostrar las opciones válidas de esos días y no permitir reservarlo el resto de la semana.
4. Entrenamientos pendientes por cancelación
También quiero añadir una opción para gestionar los entrenamientos que no se han podido realizar porque el cliente ha avisado de que no podrá asistir.
Si el cliente avisa con al menos 2 horas de antelación y el entrenamiento todavía no se ha realizado, el sistema debe ofrecer la posibilidad de dejarlo como entrenamiento pendiente, en lugar de perder esa sesión.
El funcionamiento debería ser el siguiente:
- El entrenador o el administrador podrá marcar el entrenamiento como pendiente cuando se cumplan las condiciones.
- El entrenamiento quedará registrado para que el cliente pueda recuperarlo en otra fecha.
- Se conservará la información del cliente, del servicio y de la sesión original.
- El administrador y el entrenador podrán consultar los entrenamientos pendientes.
- Cuando se acuerde una nueva fecha, se podrá programar la recuperación y esta aparecerá en el calendario correspondiente.
- La recuperación no deberá generar un nuevo cobro por un servicio que el cliente ya había pagado.
- El sistema debe distinguir entre una reserva cancelada, un entrenamiento pendiente, una recuperación programada y un entrenamiento completado.
Si el cliente avisa con menos de 2 horas de antelación, la opción de dejarlo pendiente no debería ofrecerse automáticamente, aunque el administrador podría autorizar una excepción.
Es importante que un entrenamiento pendiente no se contabilice como realizado ni desaparezca del sistema al cancelar la reserva original. Debe mantenerse registrado hasta que se recupere o se resuelva según las normas del gimnasio.
5. Utilizar un entrenamiento pendiente al realizar una reserva
Cuando el cliente vaya a reservar un servicio, el sistema debe comprobar si tiene algún entrenamiento pendiente de recuperación.
Si tiene alguno, debe aparecer un aviso indicando cuántos entrenamientos pendientes tiene y preguntarle si quiere utilizar uno para la nueva reserva.
El funcionamiento debe ser el siguiente:
- Si el cliente no tiene entrenamientos pendientes, podrá realizar la reserva con normalidad.
- Si tiene uno o varios, el sistema le preguntará si quiere utilizar uno para esa reserva.
- Si acepta, el sistema debe comprobar que el entrenamiento pendiente sea compatible con el servicio que quiere reservar.
- Si es compatible y el cliente confirma la reserva, se utilizará ese entrenamiento pendiente y no se le volverá a cobrar por esa sesión.
- Si no quiere utilizarlo, podrá continuar con la reserva normal sin consumir ninguno de sus entrenamientos pendientes.
- Una vez confirmada la reserva de recuperación, el entrenamiento dejará de aparecer como pendiente y quedará registrado como una recuperación programada.
- Si la reserva de recuperación se cancela posteriormente, se aplicarán las normas de cancelación para determinar si el entrenamiento vuelve a quedar pendiente.
Tanto el cliente como el administrador deben poder consultar cuántos entrenamientos pendientes quedan y cuáles se han utilizado.
Es importante que un entrenamiento pendiente no se pueda utilizar dos veces ni se descuente hasta que la recuperación quede confirmada correctamente.
6. Consideraciones importantes
- Cada servicio debe tener su propia configuración de precio, duración, disponibilidad y color.
- Los datos del servicio deben utilizarse automáticamente al realizar una reserva.
- El calendario debe adaptarse al servicio seleccionado.
- Se deben evitar reservas duplicadas o incompatibles.
- Los tres calendarios deben utilizar la misma información de reservas, mostrando a cada usuario únicamente los datos que le correspondan.
- Los entrenamientos pendientes deben poder consultarse y recuperarse sin generar un segundo cobro por el mismo servicio.
- Al realizar una reserva, el sistema debe permitir utilizar un entrenamiento pendiente compatible o continuar con una reserva normal.
- Los cambios deben reflejarse correctamente en todos los calendarios correspondientes.
_________________________________________________________________________
7. Apartado de productos (gestión de stock y ventas)
Quiero añadir un apartado de productos que funcione de forma similar al sistema de Viday, adaptándolo al funcionamiento de COBOSU.
Gestión de productos (administrador):
- Poder crear, editar y eliminar productos.
- Cada producto debe tener nombre, descripción (opcional), precio de venta y cantidad de unidades disponibles en stock.
- Poder consultar el stock actual de cada producto.
- El stock debe actualizarse automáticamente cada vez que se registre una venta.
- No se debe permitir vender más unidades de las que hay disponibles.
- Poder consultar el historial de ventas y ver qué productos se han vendido, cuántas unidades y por qué importe.
Registrar una venta:
Cuando se venda un producto, debe existir la opción de indicar quién lo ha comprado:
En ambos casos, se debe guardar la información de la venta, incluyendo los productos vendidos, las cantidades, el precio aplicado, el importe total, la fecha y la persona que ha realizado la compra, si corresponde.
Historial y consultas:
- Poder consultar las ventas realizadas.
- Filtrar las ventas por fecha, producto y cliente.
- Diferenciar claramente las ventas asociadas a clientes registrados de las ventas a personas de paso.
- Consultar las unidades vendidas y el stock restante de cada producto.
Importante:
- El stock debe descontarse automáticamente al confirmar una venta, no antes.
- Si una venta se anula o se devuelve un producto, gestionar correctamente el stock para evitar descuadres.
- Las ventas a personas de paso no deben crear clientes ficticios en la base de datos.
- Guardar toda la información necesaria en la base de datos para que no se pierda al cerrar la aplicación.
- Revisar primero la estructura y el código actual de COBOSU para integrar este apartado con lo que ya existe, respetando el diseño, los permisos de cada tipo de usuario y el código funcional. No modificar funcionalidades que no estén relacionadas con este apartado.
- Cliente registrado: poder buscar y seleccionar un cliente existente en la base de datos. La venta debe quedar asociada a ese cliente.
- Persona de paso: si la compra la realiza alguien que no es cliente del gimnasio, seleccionar la opción «Persona de paso» y registrar la venta sin tener que crear una cuenta para esa persona.
