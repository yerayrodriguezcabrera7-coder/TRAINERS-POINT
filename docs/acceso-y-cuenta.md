# Entrada y cuenta personal

- `/login.html`: acceso principal de entrenadores.
- `/login.html?portal=office`: administración y recepción, enlazado al pie del acceso principal.
- `/login.html?portal=client`: acceso del perfil cliente.

La entrada seleccionada se valida en el servidor antes de emitir la sesión. El perfil sigue siendo el de la cuenta guardada, nunca el elegido en el formulario.

El botón TP de la cabecera abre la cuenta propia: nombre, usuario, perfil, configuración, cambio de contraseña y cierre de sesión. No permite consultar cuentas ajenas ni contraseñas.

El navegador puede ofrecer guardar las credenciales mediante su gestor de contraseñas. La aplicación no las guarda en texto en el almacenamiento del navegador.

El Excel interno lo gestiona la empresa, fuera de la web. No se ha conectado ni modificado ese archivo.

## Recuperación disponible y pendiente

Actualmente, «He olvidado mi contraseña» muestra instrucciones para contactar con administración, que debe verificar la identidad y restablecer el acceso desde Usuarios. La cuenta recibe una contraseña provisional que debe cambiar al entrar.

**No hay recuperación automática por SMS implementada ni activada.** Antes de incorporarla hacen falta teléfonos previamente verificados y un proveedor autorizado. El desarrollo deberá incluir códigos de un solo uso con caducidad, límites de intentos/envíos, respuestas que no revelen cuentas existentes y revocación de sesiones al cambiar la contraseña. No se ha contratado ningún servicio ni enviado mensajes.

Verificación: entrada real por navegador y panel TP para administración, recepción y entrenador; 136 pruebas automáticas superadas.
