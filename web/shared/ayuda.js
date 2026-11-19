(() => {
  'use strict';
  const path = location.pathname;
  const key = path.includes('login') ? 'login'
    : path.includes('change-password') ? 'password'
    : path.includes('caja') ? 'caja'
    : path.includes('tienda') ? 'tienda'
    : path.includes('productos') ? 'productos'
    : path.includes('ficha') ? 'ficha'
    : path.includes('clientes') ? 'clientes'
    : path.includes('servicios') ? 'servicios'
    : path.includes('profesionales') ? 'profesionales'
    : path.includes('usuarios') ? 'usuarios'
    : path.includes('gimnasios') ? 'gimnasios'
    : path.includes('fichajes') ? 'fichajes'
    : path.includes('ausencias') ? 'ausencias'
    : path.includes('pendientes') ? 'pendientes'
    : path.includes('mis-reservas') ? 'mis-reservas'
    : 'calendario';

  const pages = {
    calendario: ['Organiza las citas del centro', 'Gestiona las reservas y horarios de los entrenadores.', ['Revisa la agenda diaria por trabajador y sala.', 'Crea citas seleccionando cliente y servicio.', 'Mueve o reprograma según la disponibilidad.']],
    caja: ['Control del efectivo físico', 'Gestiona los movimientos y arqueos diarios de caja.', ['Abre la caja contando el efectivo inicial.', 'Registra entradas y salidas debidamente justificadas.', 'Realiza el cierre al finalizar la jornada.']],
    productos: ['Gestión del inventario y ventas', 'Controla los artículos y el stock de la tienda.', ['Registra las compras de clientes o personas de paso.', 'Actualiza el inventario físico disponible.', 'Gestiona cobros y devoluciones de productos.']],
    tienda: ['Venta rápida de productos', 'Catálogo directo para cobros en mostrador.', ['Selecciona productos para la cesta.', 'Indica el cliente si deja el pago pendiente.', 'Confirma el método de pago recibido.']],
    clientes: ['Directorio de clientes del centro', 'Gestiona las fichas y contactos del centro.', ['Busca clientes por nombre, teléfono o correo.', 'Añade nuevos clientes con sus preferencias.', 'Consulta bonos activos y su historial.']],
    ficha: ['Ficha detallada del cliente', 'Seguimiento integral de citas, bonos y evolución.', ['Revisa las compras y bonos contratados.', 'Registra las medidas y peso de cada visita.', 'Consulta el historial de asistencia a sesiones.']],
    servicios: ['Catálogo de servicios y bonos', 'Configuración de sesiones, duración y precios.', ['Define el tipo de servicio y su duración en minutos.', 'Indica el número de sesiones incluidas en el bono.', 'Establece el precio total del servicio.']],
    profesionales: ['Equipo y trabajadores del centro', 'Control de entrenadores y personal de recepción.', ['Añade los datos de cada trabajador del centro.', 'Asigna su puesto laboral y datos de contacto.', 'Configura sus turnos y horarios de trabajo.']],
    usuarios: ['Cuentas de acceso al sistema', 'Gestión de usuarios y credenciales del software.', ['Crea una cuenta para cada persona del equipo.', 'Asigna el rol correspondiente a sus funciones.', 'Restablece accesos o contraseñas provisionales.']],
    gimnasios: ['Centros e instalaciones', 'Configuración de sedes y salas disponibles.', ['Registra los datos de ubicación de cada centro.', 'Define las salas y aforos disponibles.', 'Configura el horario general de apertura.']],
    fichajes: ['Registro de jornada laboral', 'Control horario obligatorio para el personal.', ['Ficha la entrada al comenzar tu turno.', 'Registra pausas o descansos justificadamente.', 'Ficha la salida al terminar tu jornada.']],
    ausencias: ['Solicitudes de ausencia y permisos', 'Gestión de vacaciones y bajas del personal.', ['Solicita ausencias con antelación.', 'Indica el motivo y las fechas exactas.', 'Consulta el estado de aprobación de tu solicitud.']],
    pendientes: ['Organiza las sesiones pendientes', 'Aquí aparecen los bonos activos con sesiones sin agendar.', ['Revisa Urgentes: primero la fecha más próxima.', 'Pulsa Agendar para usar un bono existente.', 'Elige trabajador, fecha y sala y confirma.']],
    'mis-reservas': ['Mis citas como cliente', 'Consulta tus próximas sesiones contratadas.', ['Revisa la fecha, hora y entrenador asignado.', 'Comprueba las sesiones restantes de tu bono.', 'Contacta con recepción ante cualquier cambio.']],
    login: ['Acceso seguro al sistema', 'Introduce tus credenciales para identificarte.', ['Escribe tu usuario y contraseña asignados.', 'Utiliza una conexión segura.', 'Contacta con administración si olvidaste tu acceso.']],
    password: ['Actualización de contraseña', 'Cambia tu clave por seguridad.', ['Introduce tu contraseña actual.', 'Elige una nueva clave segura.', 'Confirma para actualizar el acceso.']]
  };

  const main = document.querySelector('main') || document.body;
  const guide = document.createElement('section'); guide.className = 'usage-guide'; guide.setAttribute('aria-label','Ayuda de esta pantalla');
  const title = document.createElement('strong'), purpose = document.createElement('p'), details = document.createElement('details'), summary = document.createElement('summary'), steps = document.createElement('ol');
  const copy = document.createElement('div'); copy.className = 'usage-guide-copy'; copy.append(title,purpose);
  summary.textContent = 'Cómo usar esta pantalla · paso a paso'; details.append(summary,steps); guide.append(copy,details);
  function showGuide(content) { if (!content) return; title.textContent = content[0]; purpose.textContent = content[1]; steps.replaceChildren(...content[2].map(text => { const item = document.createElement('li'); item.textContent = text; return item; })); }
  showGuide(pages[key]);
  const heading = main.querySelector(':scope.login-card > .hint') || main.querySelector('.page-content > .page-heading,.page-content > .attendance-header,.page-content > header,.profile-content .profile-heading,.page-content > h1') || main.querySelector(':scope > header,:scope > .profile-topbar,:scope > h1');
  if (heading) heading.after(guide); else main.prepend(guide);
  if (window.CALENDAR_SERVER && !['login','password'].includes(key)) fetch('/api/me').then(r => r.ok ? r.json() : null).then(me => {
    if (me?.role === 'TRAINER' && ['calendario','shifts'].includes(key)) showGuide(['Consulta tu jornada y tus citas', 'Esta pantalla muestra la información que tienes asignada como trabajador.', ['Revisa la fecha y el centro en el que tienes cada cita.', 'Pulsa una reserva para consultar los detalles o comunicar una incidencia.', 'Consulta tus horarios en Turnos y registra tu entrada y salida en Fichajes.']]);
  }).catch(() => {});

  const dialogs = {
    'caja:open-dialog':['¿Cuánto efectivo hay ahora en el cajón?', 'Cuenta todos los billetes y monedas antes de empezar. Escribe el total: por ejemplo, 100 si hay 100 €. Si está vacío, escribe 0. La tarjeta y Bizum se registran aparte.'],
    'caja:close-dialog':['Vuelve a contar el efectivo físico', 'Cuenta los billetes y monedas que hay ahora. Escribe esa cantidad aunque sea distinta de la esperada; el sistema te indicará la diferencia.'],
    'caja:movement-dialog':['Dinero que entra o sale del cajón', 'Ejemplo: añadir 20 € de cambio es una entrada; retirar 50 € para llevarlos al banco es una salida. Las ventas ya se añaden automáticamente desde Productos.'],
    'productos:sale-dialog':['Primero, identifica la compra', 'Elige comprador, productos y cantidades. Si el cliente deja el pago pendiente, selecciona su ficha. Una persona de paso paga al confirmar y no necesita dar sus datos.'],
    'productos:product-dialog':['Describe el producto que vas a vender', 'Introduce su nombre, precio por unidad y las unidades que tienes físicamente. Guardar un producto no registra una venta.'],
    'productos:payment-dialog':['Registra un movimiento de dinero real', 'Revisa el importe y elige cómo se ha entregado: efectivo, tarjeta o Bizum. Comprueba los datos antes de confirmar; una devolución de dinero se registra cuando ya se ha entregado al cliente.'],
    'productos:return-dialog':['Selecciona lo que devuelve el cliente', 'Indica unidades y motivo. Reincorpora al stock solo los productos en buen estado. Si corresponde devolver dinero, tendrás un paso aparte para registrarlo.'],
    'ausencias:leave-dialog':['Solicita tu ausencia como trabajador', 'Selecciona el motivo y el primer y último día en los que no podrás trabajar. Administración revisará la solicitud antes de bloquear tu disponibilidad.'],
    'servicios:service-dialog':['Define el servicio que contratará el cliente', 'El precio total corresponde a todas las sesiones incluidas. La duración por sesión se indica en minutos; no es la duración del bono.'],
    'profesionales:professional-dialog':['Añade los datos del trabajador', 'Indica su nombre y puesto. Revisa por separado su cuenta de acceso y después configura sus horarios en Turnos.'],
    'clientes:service-history-dialog':['Consulta las compras y los bonos', 'Revisa primero lo que el cliente ya tiene contratado. Al añadir un bono, comprueba servicio, sesiones y precio total antes de guardar.'],
    'ficha:add-bono-dialog':['Añade un bono al cliente', 'Elige el servicio y comprueba las sesiones y el precio total. Indica si ya se ha recibido el pago. Añadir el bono no reserva automáticamente una cita.'],
    'ficha:measurement-dialog':['Registra las medidas de esta visita', 'Selecciona la fecha y utiliza las unidades que se indican junto a cada medida. Revisa los valores antes de guardar para que el seguimiento sea correcto.'],
    'gimnasios:gym-create-dialog':['Identifica el centro de trabajo', 'Introduce su nombre y una dirección completa. Comprueba la ubicación antes de utilizarla como referencia para los fichajes.'],
    'shifts:editor':['Configura el horario de esta persona', 'Indica a qué horas puede trabajar cada día. Marca los días libres y añade una segunda franja si tiene horario partido.'],
    'roles:editor':['Revisa lo que podrá hacer este puesto', 'Comprueba los permisos antes de guardar. Cada cuenta de usuario debe tener el perfil adecuado para su trabajo.'],
    'usuarios:user-dialog':['Elige a quién pertenece esta cuenta', 'El perfil controla lo que esta persona podrá ver y hacer. Usa una cuenta propia para cada persona.']
  };
  for (const dialog of document.querySelectorAll('dialog')) {
    const content = dialogs[key + ':' + dialog.id]; if (!content) continue;
    const block = document.createElement('aside'); block.className = 'dialog-guidance';
    const strong = document.createElement('strong'), text = document.createElement('p'); strong.textContent=content[0]; text.textContent=content[1]; block.append(strong,text);
    const header=dialog.querySelector('header'); if(header) header.after(block); else dialog.prepend(block);
  }
  const hints = {
    caja: {'opening-amount':['Por ejemplo: 100,00','Suma los billetes y monedas. Introduce el total que has contado.'], 'counted-amount':['Por ejemplo: 175,00','Escribe lo que hay de verdad en el cajón, no copies la cifra esperada.'], 'movement-amount':['Por ejemplo: 20,00','Importe de esta entrada o salida de efectivo.'], 'movement-reason':['Ej. Añadir monedas para dar cambio','Explica brevemente para qué se mueve este dinero.']},
    productos: {'payment-amount':['Ej. 20,00','Puedes registrar una parte del importe pendiente. El resto seguirá pendiente.'], 'buyer-search':['Escribe el nombre del cliente','Busca y después selecciona su ficha en la lista.'], 'return-reason':['Ej. Cambio de talla','Explica por qué se devuelve el producto.'], 'payment-note':['Ej. Pago recibido en recepción','En pagos antiguos y devoluciones, indica cómo se ha comprobado el movimiento.']},
    calendario: {},
    servicios: {'field-price':['Ej. 200,00','Precio total de todas las sesiones del servicio, en euros.'], 'field-trainingCount':['Ej. 8','Número de sesiones incluidas en ese precio total.'], 'field-durationMin':['Ej. 60','Minutos que dura cada sesión.'], 'field-name':['Ej. Entrenamiento personal · 8 sesiones','Usa un nombre que recepción y los clientes puedan reconocer.']},
    usuarios: {'user-name':['Ej. Ana García','Nombre de la persona a la que pertenece la cuenta.']},
    login: {'username':['Tu usuario de acceso','Te lo facilita administración. No tiene por qué ser tu correo.']},
    password: {},
  };
  for(const [id,[placeholder,text]] of Object.entries(hints[key]||{})) {
    const input=document.getElementById(id); if(!input)continue;
    if(input.type!=='number') input.placeholder=placeholder;
    const hint=document.createElement('small');hint.id='usage-'+id;hint.className='field-guidance';hint.textContent=input.type==='number'?text+' '+placeholder+'.':text;
    const label=input.closest('label'); if(label) label.append(hint); else input.after(hint);
    input.setAttribute('aria-describedby', [input.getAttribute('aria-describedby'),hint.id].filter(Boolean).join(' '));
  }
  document.addEventListener('invalid',e=>{
    const input=e.target;if(!input.matches('input,select,textarea'))return;
    const validity=input.validity;
    const text=validity.valueMissing?(input.tagName==='SELECT'?'Selecciona una opción para continuar.':'Completa este campo para continuar.'):validity.badInput?'Escribe un número válido.':validity.rangeUnderflow?`El valor mínimo es ${input.min}.`:validity.rangeOverflow?`El valor máximo es ${input.max}.`:validity.stepMismatch?(input.type==='time'?'Selecciona una hora entre las opciones permitidas.':input.step==='0.01'?'Escribe el importe con un máximo de dos decimales.':'Revisa el valor; utiliza los incrementos indicados en este campo.'):validity.typeMismatch?'Revisa el formato de este dato.':'Revisa este campo antes de continuar.';
    let error=input.parentElement?.querySelector('.usage-field-error');if(!error){error=document.createElement('small');error.className='usage-field-error';error.setAttribute('role','alert');input.after(error);}error.textContent=text; input.setAttribute('aria-invalid','true');
  },true);
  document.addEventListener('input',e=>{const input=e.target;if(input.hasAttribute('aria-invalid')&&input.validity?.valid){input.removeAttribute('aria-invalid');input.parentElement?.querySelector('.usage-field-error')?.remove();}});
  document.addEventListener('reset',e=>{e.target.querySelectorAll('[aria-invalid]').forEach(input=>input.removeAttribute('aria-invalid'));e.target.querySelectorAll('.usage-field-error').forEach(error=>error.remove());},true);
})();
