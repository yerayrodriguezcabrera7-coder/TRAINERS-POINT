(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = str => String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const PAGES = [
    { key: 'inicio.html', label: 'Inicio' },
    { key: 'index.html', label: 'Calendario' },
    { key: 'pendientes.html', label: 'Pendientes de asignación' },
    { key: 'recuperaciones.html', label: 'Recuperaciones' },
    { key: 'clientes', label: 'Clientes' },
    { key: 'servicios', label: 'Servicios' },
    { key: 'profesionales', label: 'Profesionales' },
    { key: 'fichajes.html', label: 'Fichajes' },
    { key: 'ausencias.html', label: 'Ausencias del equipo' },
    { key: 'gestion.html?section=shifts', label: 'Turnos' },
    { key: 'usuarios', label: 'Usuarios' },
    { key: 'permisos-pagina.html', label: 'Permisos de página' },
    { key: 'tienda.html', label: 'Tienda TPV' },
    { key: 'productos.html', label: 'Productos' },
    { key: 'caja.html', label: 'Caja' },
    { key: 'gimnasios', label: 'Gimnasios / Sedes' },
    { key: 'configuracion.html', label: 'Configuración' },
    { key: 'mis-reservas.html', label: 'Mis reservas (clientes)' },
  ];

  const roleNames = { ADMIN: 'Administración', RECEPTION: 'Recepción', TRAINER: 'Entrenador', CLIENT: 'Cliente' };
  const roleStyles = {
    ADMIN: { bg: '#fff0df', text: '#ff7f0a' },
    RECEPTION: { bg: '#e8f5ec', text: '#2e7d32' },
    TRAINER: { bg: '#e3f2fd', text: '#1565c0' },
    CLIENT: { bg: '#f3e5f5', text: '#7b1fa2' },
  };

  let manageData = null;
  let searchQuery = '';
  let toastTimer = null;

  const token = () => sessionStorage.getItem('calendar-user-token') || sessionStorage.getItem('calendar-admin-token') || window.CALENDAR_DEV_TOKEN || '';

  async function api(path, method = 'GET', body) {
    const res = await fetch('/api/' + path, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() },
      body: body ? JSON.stringify(body) : undefined,
    });
    const result = await res.json().catch(() => ({}));
    if (res.status === 401) { sessionStorage.removeItem('calendar-user-token'); sessionStorage.removeItem('calendar-admin-token'); location.href = '/login.html'; throw new Error('Sesión expirada.'); }
    if (!res.ok) throw new Error(result.error || 'Error al procesar la solicitud.');
    return result;
  }

  function showToast(message, isError = false) {
    const el = $('toast'); if (!el) return;
    el.textContent = message; el.classList.toggle('error', isError); el.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 3500);
  }

  function resolvePersonName(user) {
    if (user.name) return user.name;
    if (user.role === 'CLIENT') {
      const c = (manageData?.clients || []).find(cli => cli.id === user.clientId);
      return c ? c.name : 'Cliente sin vincular';
    }
    const emp = (manageData?.employees || []).find(e => e.id === user.employeeId);
    return emp ? emp.name : 'Empleado sin vincular';
  }

  function renderList() {
    const listEl = $('perms-list');
    const countEl = $('results-count');
    if (!manageData) return;

    const users = (manageData.users || []).filter(u => {
      if (!searchQuery) return true;
      const name = resolvePersonName(u).toLowerCase();
      const uname = (u.username || '').toLowerCase();
      return name.includes(searchQuery) || uname.includes(searchQuery);
    });

    countEl.textContent = `${users.length} ${users.length === 1 ? 'usuario' : 'usuarios'}`;

    if (!users.length) {
      listEl.innerHTML = '<p class="list-message">No se encontraron usuarios.</p>';
      return;
    }

    listEl.innerHTML = '';
    users.forEach(user => {
      const personName = resolvePersonName(user);
      const roleStyle = roleStyles[user.role] || { bg: '#f1f1f1', text: '#444' };
      const roleLabel = roleNames[user.role] || user.role;
      const isAdmin = user.role === 'ADMIN';

      const card = document.createElement('div');
      card.className = 'perms-user-card';
      card.dataset.userId = user.id;

      const currentPerms = Array.isArray(user.pagePermissions) ? user.pagePermissions : null;

      card.innerHTML = `
        <div class="perms-user-header" role="button" tabindex="0" aria-expanded="false">
          <div style="flex:1; min-width:0;">
            <div class="perms-user-name">${esc(personName)}</div>
            <div class="perms-user-meta">${esc(user.username)}</div>
          </div>
          <span class="role-badge" style="background:${roleStyle.bg};color:${roleStyle.text};">${esc(roleLabel)}</span>
          ${isAdmin ? '<span style="font-size:11px;color:var(--tp-muted);margin-left:4px;">Acceso total</span>' : ''}
          <span style="font-size:11px;color:var(--tp-muted);margin-left:8px;" class="perms-summary-label">${isAdmin ? '' : currentPerms === null ? 'Según rol' : currentPerms.length + ' páginas'}</span>
          <svg class="perms-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="18" height="18" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>
        </div>
        <div class="perms-panel" role="region">
          ${isAdmin ? '<div class="admin-warning">Los administradores siempre tienen acceso completo a todas las páginas. No se pueden restringir.</div>' : `
          <p class="perms-info">
            ${currentPerms === null ? 'Este usuario usa los <strong>permisos predeterminados de su rol</strong>. Activa permisos personalizados marcando páginas específicas.' : 'Permisos personalizados activos. Desmarca todas las páginas para volver a los permisos del rol.'}
          </p>
          <div class="perms-grid" data-user-id="${esc(user.id)}">
            ${PAGES.map(page => {
              const checked = currentPerms === null ? false : currentPerms.includes(page.key);
              return `<label class="perms-toggle${checked ? ' is-checked' : ''}">
                <input type="checkbox" data-page-key="${esc(page.key)}" ${checked ? 'checked' : ''}>
                <span>${esc(page.label)}</span>
              </label>`;
            }).join('')}
          </div>
          <div class="perms-actions">
            <button type="button" class="perms-select-all" data-action="all">Marcar todas</button>
            <button type="button" class="perms-select-all" data-action="none">Desmarcar todas</button>
            <button type="button" class="perms-select-all" data-action="role">Restaurar permisos del rol</button>
            <button type="button" class="button button-primary button-small perms-save-btn">Guardar permisos</button>
            <span class="perms-status" hidden></span>
          </div>
          `}
        </div>
      `;

      // Toggle open/close
      const header = card.querySelector('.perms-user-header');
      const panel = card.querySelector('.perms-panel');
      function toggleCard() {
        const isOpen = card.classList.toggle('is-open');
        header.setAttribute('aria-expanded', String(isOpen));
      }
      header.addEventListener('click', toggleCard);
      header.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleCard(); } });

      if (!isAdmin) {
        // Checkbox toggle styling
        const grid = card.querySelector('.perms-grid');
        grid.addEventListener('change', e => {
          const cb = e.target.closest('input[type="checkbox"]');
          if (cb) {
            const label = cb.closest('.perms-toggle');
            if (label) label.classList.toggle('is-checked', cb.checked);
          }
        });

        // Select all / none / role
        card.querySelector('.perms-actions').addEventListener('click', e => {
          const btn = e.target.closest('[data-action]');
          if (!btn) return;
          const action = btn.dataset.action;
          const checkboxes = [...card.querySelectorAll('input[type="checkbox"]')];
          if (action === 'all') {
            checkboxes.forEach(cb => { cb.checked = true; cb.closest('.perms-toggle')?.classList.add('is-checked'); });
          } else if (action === 'none') {
            checkboxes.forEach(cb => { cb.checked = false; cb.closest('.perms-toggle')?.classList.remove('is-checked'); });
          } else if (action === 'role') {
            checkboxes.forEach(cb => { cb.checked = false; cb.closest('.perms-toggle')?.classList.remove('is-checked'); });
            // Will save null to restore role-based
          }
        });

        // Save button
        const saveBtn = card.querySelector('.perms-save-btn');
        const statusEl = card.querySelector('.perms-status');
        saveBtn.addEventListener('click', async () => {
          const checkboxes = [...card.querySelectorAll('input[type="checkbox"]')];
          const checked = checkboxes.filter(cb => cb.checked).map(cb => cb.dataset.pageKey);
          const pagePermissions = checked.length > 0 ? checked : null;

          saveBtn.disabled = true;
          statusEl.hidden = true;
          try {
            await api(`manage/users/${encodeURIComponent(user.id)}/permissions`, 'PUT', { pagePermissions });
            // Update local data
            const u = manageData.users.find(x => x.id === user.id);
            if (u) u.pagePermissions = pagePermissions;
            // Update summary label
            const summaryLabel = card.querySelector('.perms-summary-label');
            if (summaryLabel) summaryLabel.textContent = pagePermissions === null ? 'Según rol' : pagePermissions.length + ' páginas';
            // Update info text
            const infoEl = card.querySelector('.perms-info');
            if (infoEl) infoEl.innerHTML = pagePermissions === null
              ? 'Este usuario usa los <strong>permisos predeterminados de su rol</strong>. Activa permisos personalizados marcando páginas específicas.'
              : 'Permisos personalizados activos. Desmarca todas las páginas para volver a los permisos del rol.';
            statusEl.textContent = '✓ Guardado';
            statusEl.className = 'perms-status';
            statusEl.hidden = false;
            setTimeout(() => { statusEl.hidden = true; }, 2500);
            showToast(`Permisos de ${personName} actualizados.`);
          } catch (err) {
            statusEl.textContent = err.message;
            statusEl.className = 'perms-status error';
            statusEl.hidden = false;
          } finally {
            saveBtn.disabled = false;
          }
        });
      }

      listEl.appendChild(card);
    });
  }

  async function loadData() {
    $('perms-list').innerHTML = '<p class="list-message">Cargando usuarios…</p>';
    try {
      manageData = await api('manage');
      if (manageData.role !== 'ADMIN') { location.replace('/index.html'); return; }
      renderList();
    } catch (err) {
      $('perms-list').innerHTML = `<p class="list-message error">${esc(err.message)}</p>`;
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const searchInput = $('search-input');
    const clearBtn = $('clear-search');
    searchInput.addEventListener('input', () => {
      searchQuery = searchInput.value.toLowerCase().trim();
      clearBtn.hidden = !searchQuery;
      renderList();
    });
    clearBtn.addEventListener('click', () => {
      searchInput.value = ''; searchQuery = ''; clearBtn.hidden = true; renderList(); searchInput.focus();
    });
    loadData();
  });
})();
