# Acceso de usuarios a la aplicación móvil

## Propuesta aplicada

Cada persona accede con una cuenta individual facilitada por el centro. La aplicación valida el usuario y la contraseña contra el sistema de gestión existente, por lo que no hay una segunda base de datos de usuarios ni de reservas.

La pantalla inicial ofrece «Entrar a mi cuenta» para consultar información real y «Explorar una demostración» para conocer el diseño sin tener una cuenta. La demostración está identificada como tal, tiene un botón para salir y no consulta la API.

## Cómo prepara el centro una cuenta

1. Administración abre el apartado **Usuarios** del panel de gestión.
2. Crea o revisa la cuenta y selecciona el rol **Cliente** o **Entrenador**.
3. Vincula la cuenta con la ficha del cliente o con el trabajador correspondiente. Una ficha de cliente por sí sola no equivale a una cuenta de acceso.
4. Asigna un usuario y una contraseña provisional, habilita la cuenta y mantiene activado el cambio obligatorio de contraseña.
5. Entrega esas credenciales a la persona tras comprobar su identidad.

No se han creado usuarios nuevos ni cambiado contraseñas de personas durante esta implementación.

## Cómo entra la persona

1. Abre la app y pulsa **Entrar a mi cuenta**.
2. Selecciona **Cliente**, **Entrenador / Trabajador** o **Recepción** según su cuenta.
3. Introduce el usuario y la contraseña facilitados por el centro.
4. Si la contraseña es provisional, elige una nueva y la repite antes de continuar. El servidor exige un mínimo de 12 caracteres y que sea distinta de la anterior.
5. La app consulta la identidad validada y muestra la agenda correspondiente. Los clientes solo reciben sus propias reservas; el servidor limita la agenda de cada trabajador.
6. **Salir** cierra la sesión y vuelve al acceso.

## Si no tiene acceso o ha olvidado la contraseña

El formulario incluye ayuda para el primer acceso, para solicitar una cuenta y para recuperar el acceso. La persona contacta con recepción, que comprueba su identidad; administración restablece la contraseña y entrega una provisional. La app solicita cambiarla en la siguiente entrada.

Este proceso es manual. No hay un envío automático por SMS, teléfono, WhatsApp o correo, ni se ha contratado ningún proveedor externo.

## Cambios ejecutados

- Conexión de la pantalla principal con el acceso real, antes conservado como código sin entrada desde la app.
- Pantalla de bienvenida con accesos diferenciados para cuenta y demostración.
- Botones para volver al inicio y salir de la demostración.
- Ayuda de acceso y recuperación dentro del formulario.
- Mostrar/ocultar contraseña, soporte de autocompletado del dispositivo y bloqueo del formulario durante el envío.
- Conservación del cambio obligatorio de contraseña, mensajes de error, límite de espera y controles de rol del servidor.
- Reinicio del formulario cuando caduca la sesión, para permitir volver a identificarse.
- Reorganización de `LegacyApp.tsx` como `AccountApp.tsx`, ahora utilizada por la entrada principal.

## Sesión y alcance

La contraseña no se guarda en archivos ni en el almacenamiento del navegador. El token de sesión solo se mantiene en memoria y el servidor lo valida. Al cerrar o recargar la app se debe iniciar sesión de nuevo; el servidor establece un límite de sesión de 12 horas y permite invalidarla al salir.

Recepción puede consultar las agendas, los clientes y los pendientes desde la app. La creación o edición de reservas y la configuración continúan en el panel web. La aplicación móvil no concede permisos por elegir un botón: el servidor comprueba el perfil de la cuenta y decide qué información puede devolver. Detalles: [roles móviles](ROLES_MOVILES.md).

En la cuenta real se consulta la agenda existente. Los bonos, renovaciones, pagos y avisos de la demostración siguen siendo ilustrativos y no forman parte del acceso real implementado aquí.

No se han efectuado cobros ni enviado mensajes. Esta entrada no necesita APIs de pago: reutiliza la API interna del proyecto. La instalación del simulador de iOS en Xcode se revisa por separado.

## Comprobaciones realizadas

- TypeScript y las 11 pruebas existentes de la API compartida pasan.
- Los paquetes de la aplicación se generan para web, iOS y Android.
- Prueba de navegador con API ficticia: bienvenida, demostración sin llamadas al backend, ayuda, errores de acceso, mostrar/ocultar contraseña, cambio provisional, agenda de cliente, caducidad de sesión y vuelta al inicio.
- Revisión del formulario en anchuras de 320, 390, 768 y 1440 píxeles, sin desbordamiento horizontal.
- Inicio de sesión real con la cuenta local de trabajador de prueba ya existente: respuesta HTTP 200, agenda visible y cierre de sesión confirmado. No se ha cambiado su contraseña ni ninguna reserva.

La prueba real del trabajador no sustituye la validación de todas las cuentas de cliente del centro ni la prueba en un dispositivo iOS físico.
