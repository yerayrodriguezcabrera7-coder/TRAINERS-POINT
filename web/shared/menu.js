(() => {
  const host = document.querySelector('[data-app-menu]');
  if (!host) return;
  const icons = {
    menu:'<path d="M4 7h16M4 12h11M4 17h16"/>',
    plus:'<path d="M12 5v14M5 12h14"/>',
    home:'<path d="m3 10 9-7 9 7v11h-6v-7H9v7H3Z"/>',
    calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18m-13 4h2m4 0h2"/>',
    people:'<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m1-16a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 4v3"/>',
    list:'<path d="M8 6h13M8 12h13M8 18h13M3 6h1m-1 6h1m-1 6h1"/>',
    staff:'<path d="M5 3h14v18H5zM9 3l3 4 3-4m-3 4-3 8 3 4 3-4z"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6H8"/>',
    bag:'<path d="m4 8-1 13h18L20 8ZM8 9V6a4 4 0 0 1 8 0v3"/>',
    cash:'<path d="m5 3-2 14h18L19 3Zm-2 14v4h18v-4M8 7h8m-9 5h1m3 0h1m3 0h1"/>',
    report:'<path d="M5 3h9l5 5v13H5zM14 3v6h5M8 17l3-5 3 4 2-2"/>',
    chart:'<path d="M12 3v9h9A9 9 0 0 0 12 3ZM8 5a9 9 0 1 0 11 11H8Z"/>',
    history:'<path d="M3 11a9 9 0 1 1 2 7M3 4v7h7m2-5v6l4 2"/>',
    settings:'<path d="M14 6a5 5 0 0 0-6 6l-5 5a3 3 0 0 0 4 4l5-5a5 5 0 0 0 6-6l-3 3-4-4 3-3Z"/>',
    globe:'<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
    phone:'<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M10 18h4"/>',
    bell:'<path d="M5 17h14l-2-4V8a5 5 0 0 0-10 0v5Zm5 3h4"/>',
    chat:'<path d="M21 11a8 8 0 0 1-8 8H8l-5 3 1-6a8 8 0 0 1 9-13 8 8 0 0 1 8 8Z"/>'
  };
  const items = [
    ['Mis reservas','calendar','/mis-reservas.html'], ['Inicio','home','/inicio.html'],
    ['Calendario','calendar','/index.html'], ['Clientes','people','/clientes'], ['Gimnasios','globe','/gimnasios'], ['Servicios','list','/servicios'],
    ['Profesionales','staff','/profesionales'], ['Fichajes','clock','/fichajes.html'], ['Ausencias del equipo','history','/ausencias.html'], ['Recuperaciones','calendar','/recuperaciones.html'],
    ['Turnos','calendar','/gestion.html?section=shifts'], ['Usuarios','people','/usuarios'], ['Permisos','settings','/gestion.html?section=roles'], ['Productos','bag','/productos.html'], ['Ventas y cobros','cash','/ventas.html'], ['Pendientes de asignación','calendar','/pendientes.html'],
    ['Caja','cash','/caja.html'], ['Informes','report'], ['Cuadro de mando','chart'],
    ['Historial de eventos','history'], ['Configuración','settings','/configuracion.html'],
    ['Reserva web','globe'], ['App móvil','phone'], ['Notificaciones','bell'],
    ['Buzón de consultas','chat']
  ];
  function menuKey(href) {
    const url = new URL(href, location.origin + "/");
    const path = url.pathname;
    if (path === '/') return '/index.html';
    if (path === '/clientes' || path.startsWith('/clientes/') || path === '/client-profile.html') return '/clientes';
    if (path === '/usuarios.html') return '/usuarios';
    if (['/gyms.html','/gimnasios.html'].includes(path)) return '/gimnasios';
    if (['/services.html', '/servicios.html'].includes(path)) return '/servicios';
    if (['/professionals.html', '/profesionales.html'].includes(path)) return '/profesionales';
    if (['/fichajes', '/fichaje'].includes(path)) return '/fichajes.html';
    if (path === '/gestion.html') return path + '?section=' + (url.searchParams.get('section') || 'services');
    return path;
  }
  const current = menuKey(location.href);
  host.className = 'app-menu';
  function entry([label, icon, href]) {
      const content = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+icons[icon]+'</svg><span class="app-menu-label">'+label+'</span>';
      return href
        ? '<a class="app-menu-item" href="'+href+'" title="'+label+'"'+(menuKey(href)===current?' aria-current="page"':'')+'>'+content+'</a>'
        : '<button class="app-menu-item" type="button" disabled title="'+label+' · Próximamente" aria-label="'+label+' · Próximamente">'+content+'</button>';
  }
  const groups=[['Día a día',['Mis reservas','Inicio','Calendario','Pendientes de asignación','Recuperaciones']],['Clientes y servicios',['Clientes','Servicios']],['Ventas y caja',['Productos','Ventas y cobros','Caja']],['Equipo',['Profesionales','Turnos','Fichajes','Ausencias del equipo']],['Administración',['Gimnasios','Usuarios','Permisos','Configuración']]];
  host.innerHTML = '<div class="app-menu-top"><a class="app-menu-brand" href="inicio.html"><span class="tp-wordmark" role="img" aria-label="Trainers Point"><b class="tp-initial">T.</b><span class="tp-name">trainers<span>point</span></span></span></a><button class="app-menu-toggle" type="button" aria-label="Contraer menú" aria-expanded="true" aria-controls="app-navigation"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">'+icons.menu+'</svg></button></div><div class="app-menu-center"><span class="center-indicator"></span><div><small>ESPACIO DE TRABAJO</small><strong id="gym-workspace-label">Trainers Point · Bizkaia</strong></div></div><nav id="app-navigation" aria-label="Menú principal">'+groups.map(([label,names])=>'<section class="menu-group"><h2>'+label+'</h2>'+names.map(name=>items.find(x=>x[0]===name)).filter(Boolean).map(entry).join('')+'</section>').join('')+'<details class="menu-future"><summary title="Módulos en preparación"><span class="app-menu-label">En preparación</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">'+icons.plus+'</svg></summary>'+items.filter(x=>!x[2]).map(entry).join('')+'</details></nav>';
  const firstGroup = host.querySelector('.menu-group');
  const brand = host.querySelector('.app-menu-brand');
  if (brand) brand.innerHTML = '<img class="app-menu-logo" src="/assets/trainers-point-logo.png" alt="Trainers Point">';
  const center = host.querySelector('.app-menu-center');
  async function loadGyms(isAdmin) {
    if (!isAdmin) return;
    const label = center.querySelector('#gym-workspace-label');
    if (!label) return;
    label.replaceWith(Object.assign(document.createElement('select'), { id: 'gym-switcher', ariaLabel: 'Cambiar de gimnasio' }));
    const gymSwitcher = center.querySelector('#gym-switcher');
    if (!gymSwitcher) return;
    try {
      const response = await fetch('/api/gyms'); if (!response.ok) return;
      const data = await response.json();
      const saved = localStorage.getItem('calendar-selected-gym');
      const selected = data.gyms.some(g => g.id === saved) ? saved : data.selected || data.gyms[0]?.id;
      gymSwitcher.innerHTML = data.gyms.map(g => '<option value="'+g.id+'">'+g.name+'</option>').join('');
      gymSwitcher.value = selected;
      if (selected) localStorage.setItem('calendar-selected-gym', selected);
      gymSwitcher.addEventListener('change', () => { localStorage.setItem('calendar-selected-gym', gymSwitcher.value); location.reload(); });
    } catch (_) {}
  }
  const main=document.querySelector('main');
  if(main){main.id ||= 'main';const skip=document.createElement('a');skip.href='#'+main.id;skip.className='skip-content';skip.textContent='Ir al contenido';document.body.prepend(skip);}
  const toggle = host.querySelector('.app-menu-toggle');
  function collapse(value) {
    document.body.classList.toggle('menu-collapsed', value);
    toggle.setAttribute('aria-expanded', String(!value));
    toggle.setAttribute('aria-label', value ? 'Ampliar menú' : 'Contraer menú');
  }
  let preferred;
  try{preferred=localStorage.getItem('trainers-point-menu-collapsed');}catch(_){}
  collapse(window.matchMedia?.('(max-width: 900px)').matches || preferred==='true');
  toggle.addEventListener('click', () => {const value=!document.body.classList.contains('menu-collapsed');collapse(value);try{localStorage.setItem('trainers-point-menu-collapsed',String(value));}catch(_){}});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&window.matchMedia?.('(max-width: 600px)').matches)collapse(true);});
  document.addEventListener('DOMContentLoaded', async () => {
    if (!window.CALENDAR_SERVER) return;
    const token = sessionStorage.getItem('calendar-user-token') || sessionStorage.getItem('calendar-admin-token') || window.CALENDAR_DEV_TOKEN || '';
    try {
      const response = await fetch('/api/me',{headers:{Authorization:'Bearer '+token}});
      if(!response.ok)return;
      const me=await response.json();
      if(me.mustChangePassword && location.pathname !== '/change-password.html'){
        location.replace('/change-password.html');
        return;
      }
      if (['ADMIN','RECEPTION','TRAINER'].includes(me.role)) {
        loadGyms(true);
      }
      const normalize = href => (href || '').replace(/^\//, '');
      const allowedByRole = {
        ADMIN: null,
        RECEPTION: ['configuracion.html', 'caja.html', 'servicios', 'profesionales', 'pendientes.html', 'productos.html', 'ventas.html', 'inicio.html', 'index.html', 'clientes', 'gestion.html?section=services', 'fichajes.html', 'ausencias.html', 'recuperaciones.html', 'gestion.html?section=shifts'],
        TRAINER: ['configuracion.html', 'index.html', 'clientes', 'fichajes.html', 'ausencias.html', 'recuperaciones.html', 'gestion.html?section=shifts'],
        CLIENT: ['mis-reservas.html', 'configuracion.html'],
      };
      const allowed = allowedByRole[me.role];
      if (allowed !== null) {
        // Redirigir si la página actual no está permitida para este rol
        const normCurrent = normalize(current);
        const isAllowed = allowed.some(a => {
          const normA = normalize(a);
          return normCurrent === normA || normCurrent.startsWith(normA + '?') || (normA === 'clientes' && (normCurrent.includes('client-profile') || normCurrent.startsWith('clientes/')));
        });
        if (!isAllowed && location.pathname !== '/login.html' && location.pathname !== '/change-password.html') {
          location.replace('/index.html');
          return;
        }

        host.querySelectorAll('a.app-menu-item').forEach(a => {
          const href = normalize(a.getAttribute('href'));
          const ok = allowed.some(al => href === al || href.startsWith(al + '?'));
          if (!ok) {
            a.hidden = true;
            a.style.display = 'none';
          }
        });
        host.querySelector('.menu-future')?.setAttribute('hidden', '');
      }
      host.querySelectorAll('.menu-group').forEach(group => {
        const visibleItems = [...group.querySelectorAll('a.app-menu-item')].filter(a => !a.hidden && a.style.display !== 'none');
        group.hidden = visibleItems.length === 0;
        if (group.hidden) group.style.display = 'none';
      });
      if (me.role === 'TRAINER') {
        const brandLink = host.querySelector('.app-menu-brand');
        if (brandLink) brandLink.href = '/index.html';
      }
      if (me.role === 'CLIENT') {
        const nav = host.querySelector('#app-navigation');
        if (nav) nav.hidden = false;
        const center = host.querySelector('.app-menu-center');
        if (center) center.hidden = true;
      }
      const roleName = {ADMIN:'Administración',RECEPTION:'Recepción',TRAINER:'Entrenador / Trabajador',CLIENT:'Cliente'}[me.role] || me.role;
      const loginUrl = ['ADMIN','RECEPTION'].includes(me.role) ? '/login.html?portal=office' : me.role === 'CLIENT' ? '/login.html?portal=client' : '/login.html';
      let avatar = document.querySelector('.topbar .profile-avatar');
      if (!avatar && document.querySelector('.topbar')) { avatar=document.createElement('div'); avatar.className='profile-avatar'; document.querySelector('.topbar').append(avatar); }
      if (avatar) {
        const button=document.createElement('button');button.type='button';button.className='profile-avatar account-trigger';button.textContent='TP';button.setAttribute('aria-label','Mi cuenta: '+me.name+' · '+roleName);button.setAttribute('aria-haspopup','dialog');avatar.replaceWith(button);
        const dialog=document.createElement('dialog');dialog.className='account-dialog';dialog.setAttribute('aria-label','Mi cuenta');
        const title=document.createElement('h2');title.textContent=me.name;
        const username=document.createElement('p');username.textContent='Usuario: '+(me.username || 'Cuenta del centro');
        const role=document.createElement('p');role.textContent='Perfil: '+roleName;
        const settings=document.createElement('a');settings.href='/configuracion.html';settings.textContent='Mi configuración';
        const password=document.createElement('a');password.href='/change-password.html';password.textContent='Cambiar mi contraseña';
        const logout=document.createElement('button');logout.type='button';logout.textContent='Cerrar sesión';logout.onclick=async()=>{try{await fetch('/api/logout',{method:'POST'});}finally{sessionStorage.removeItem('calendar-user-token');sessionStorage.removeItem('calendar-admin-token');location.href=loginUrl;}};
        const close=document.createElement('button');close.type='button';close.textContent='Volver';close.onclick=()=>dialog.close();
        dialog.append(title,username,role,settings,password,logout,close);document.body.append(dialog);button.onclick=()=>dialog.showModal();
      }
      const footer=document.createElement('div');footer.className='app-menu-account';
      const label=document.createElement('small');label.textContent=me.name;
      const link=document.createElement('a');link.href=loginUrl;link.textContent=me.id==='bootstrap'?'Acceso del equipo':'Cerrar sesión';
      link.addEventListener('click',async event=>{
        event.preventDefault();
        try{await fetch('/api/logout',{method:'POST',headers:{Authorization:'Bearer '+token}});}finally{
          sessionStorage.removeItem('calendar-user-token');sessionStorage.removeItem('calendar-admin-token');location.href=loginUrl;
        }
      });footer.append(label,link);host.append(footer);
    } catch (_) { /* The page shows connection errors. */ }
  });
})();
