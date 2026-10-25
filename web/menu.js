(() => {
  const host = document.querySelector('[data-app-menu]');
  if (!host) return;
  const icons = {
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
    ['Inicio','home','inicio.html'],
    ['Calendario','calendar','index.html'], ['Clientes','people','gestion.html?section=clients'], ['Gimnasios','globe','gimnasios.html'], ['Servicios','list','gestion.html?section=services'],
    ['Profesionales','staff','gestion.html?section=employees'], ['Fichajes','clock','fichajes.html'],
    ['Turnos','calendar','gestion.html?section=shifts'], ['Usuarios','people','gestion.html?section=users'], ['Permisos','settings','gestion.html?section=roles'], ['Catálogo','bag'],
    ['Caja','cash'], ['Informes','report'], ['Cuadro de mando','chart'],
    ['Historial de eventos','history'], ['Configuración','settings'],
    ['Reserva web','globe'], ['App móvil','phone'], ['Notificaciones','bell'],
    ['Buzón de consultas','chat']
  ];
  const current = location.pathname.endsWith('gestion.html') ? 'gestion.html'+location.search : location.pathname.endsWith('inicio.html') ? 'inicio.html' : location.pathname.endsWith('fichajes.html') ? 'fichajes.html' : 'index.html';
  host.className = 'app-menu';
  function entry([label, icon, href]) {
      const content = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+icons[icon]+'</svg><span class="app-menu-label">'+label+'</span>';
      return href
        ? '<a class="app-menu-item" href="'+href+'" title="'+label+'"'+(href===current?' aria-current="page"':'')+'>'+content+'</a>'
        : '<button class="app-menu-item" type="button" disabled title="'+label+' · Próximamente" aria-label="'+label+' · Próximamente">'+content+'</button>';
  }
  const groups=[['Tu centro',['Inicio','Calendario','Clientes','Servicios']],['Equipo',['Profesionales','Fichajes','Turnos']],['Administración',['Usuarios','Permisos']]];
  host.innerHTML = '<div class="app-menu-top"><a class="app-menu-brand" href="inicio.html"><span class="tp-wordmark" role="img" aria-label="Trainers Point"><b class="tp-initial">T.</b><span class="tp-name">trainers<span>point</span></span></span></a><button class="app-menu-toggle" type="button" aria-label="Contraer menú" aria-expanded="true" aria-controls="app-navigation">⇆</button></div><div class="app-menu-center"><span class="center-indicator"></span><div><small>ESPACIO DE TRABAJO</small><strong>Trainers Point · Bizkaia</strong></div></div><nav id="app-navigation" aria-label="Menú principal">'+groups.map(([label,names])=>'<section class="menu-group"><h2>'+label+'</h2>'+items.filter(x=>names.includes(x[0])).map(entry).join('')+'</section>').join('')+'<details class="menu-future"><summary title="Módulos en preparación"><span class="app-menu-label">En preparación</span><span aria-hidden="true">＋</span></summary>'+items.filter(x=>!x[2]).map(entry).join('')+'</details></nav>';
  const firstGroup = host.querySelector('.menu-group');
  if (firstGroup) {
    const gymLink = document.createElement('a');
    gymLink.className = 'app-menu-item'; gymLink.href = 'gimnasios.html'; gymLink.title = 'Gimnasios';
    gymLink.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+icons.globe+'</svg><span class="app-menu-label">Gimnasios</span>';
    if (location.pathname.endsWith('gimnasios.html')) gymLink.setAttribute('aria-current','page');
    firstGroup.append(gymLink);
  }
  const center = host.querySelector('.app-menu-center');
  center.querySelector('strong')?.replaceWith(Object.assign(document.createElement('select'), { id: 'gym-switcher', ariaLabel: 'Cambiar de gimnasio' }));
  const gymSwitcher = center.querySelector('#gym-switcher');
  async function loadGyms() {
    try {
      const response = await fetch('/api/gyms'); if (!response.ok) return;
      const data = await response.json();
      const selected = localStorage.getItem('calendar-selected-gym') || data.selected || data.gyms[0]?.id;
      gymSwitcher.innerHTML = data.gyms.map(g => '<option value="'+g.id+'">'+g.name+'</option>').join('');
      gymSwitcher.value = selected;
      if (selected) localStorage.setItem('calendar-selected-gym', selected);
      gymSwitcher.addEventListener('change', () => { localStorage.setItem('calendar-selected-gym', gymSwitcher.value); location.reload(); });
    } catch (_) {}
  }
  loadGyms();
  const main=document.querySelector('main');
  if(main){main.id ||= 'main';const skip=document.createElement('a');skip.href='#'+main.id;skip.className='skip-content';skip.textContent='Ir al contenido';document.body.prepend(skip);}
  const toggle = host.querySelector('.app-menu-toggle');
  function collapse(value) {
    document.body.classList.toggle('menu-collapsed', value);
    toggle.setAttribute('aria-expanded', String(!value));
    toggle.setAttribute('aria-label', value ? 'Ampliar menú' : 'Contraer menú');
  }
  let preferred;
  try{preferred=localStorage.getItem('cobosu-menu-collapsed');}catch(_){}
  collapse(window.matchMedia?.('(max-width: 900px)').matches || preferred==='true');
  toggle.addEventListener('click', () => {const value=!document.body.classList.contains('menu-collapsed');collapse(value);try{localStorage.setItem('cobosu-menu-collapsed',String(value));}catch(_){}});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&window.matchMedia?.('(max-width: 600px)').matches)collapse(true);});
  document.addEventListener('DOMContentLoaded', async () => {
    if (!window.CALENDAR_SERVER) return;
    const token = sessionStorage.getItem('calendar-user-token') || window.CALENDAR_DEV_TOKEN || sessionStorage.getItem('calendar-admin-token') || '';
    try {
      const response = await fetch('/api/me',{headers:{Authorization:'Bearer '+token}});
      if(!response.ok)return;
      const me=await response.json();
      if(me.role!=='ADMIN')host.querySelectorAll('a.app-menu-item').forEach(a=>{
        const href=a.getAttribute('href');
        const allowed=['fichajes.html','gestion.html?section=shifts',...(me.role==='RECEPTION'?['inicio.html','index.html','gestion.html?section=clients','gestion.html?section=services']:[])];
        if(!allowed.includes(href)) a.hidden=true;
      });
      host.querySelectorAll('.menu-group').forEach(group=>{group.hidden=![...group.querySelectorAll('a')].some(a=>!a.hidden);});
      if(me.role==='TRAINER')host.querySelector('.app-menu-brand').href='fichajes.html';
      const footer=document.createElement('div');footer.className='app-menu-account';
      const label=document.createElement('small');label.textContent=me.name;
      const link=document.createElement('a');link.href='login.html';link.textContent=me.id==='bootstrap'?'Acceso del equipo':'Cerrar sesión';
      link.addEventListener('click',async event=>{
        event.preventDefault();
        try{await fetch('/api/logout',{method:'POST',headers:{Authorization:'Bearer '+token}});}finally{
          sessionStorage.removeItem('calendar-user-token');sessionStorage.removeItem('calendar-admin-token');location.href='login.html';
        }
      });footer.append(label,link);host.append(footer);
    } catch (_) { /* The page shows connection errors. */ }
  });
})();
