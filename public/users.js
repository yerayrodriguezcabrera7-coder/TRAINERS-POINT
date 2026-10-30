(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const esc = str => String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const roleNames = {
    ADMIN: 'Administración',
    RECEPTION: 'Recepción',
    TRAINER: 'Entrenador',
    CLIENT: 'Cliente',
  };

  const roleStyles = {
    ADMIN: { bg: '#fff0df', text: '#ff7f0a' },
    RECEPTION: { bg: '#e8f5ec', text: '#2e7d32' },
    TRAINER: { bg: '#e3f2fd', text: '#1565c0' },
    CLIENT: { bg: '#f3e5f5', text: '#7b1fa2' },
  };

  function getAvatarTone(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = (hash << 5) - hash + str.charCodeAt(i);
    return Math.abs(hash) % 6;
  }

  function getInitials(name) {
    if (!name) return 'TP';
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return parts[0]?.slice(0, 2).toUpperCase() || 'TP';
  }

  let manageData = null;
  let activeFilter = 'all';
  let searchQuery = '';
  let editingUser = null;
  let toastTimer = null;

  const token = () =>
    sessionStorage.getItem('calendar-user-token') ||
    sessionStorage.getItem('calendar-admin-token') ||
    window.CALENDAR_DEV_TOKEN ||
    '';

  async function api(path, method = 'GET', body) {
    const res = await fetch('/api/' + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + token(),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const result = await res.json().catch(() => ({}));
    if (res.status === 401) {
      sessionStorage.removeItem('calendar-user-token');
      sessionStorage.removeItem('calendar-admin-token');
      location.href = '/login.html';
      throw new Error('Inicia sesión para continuar.');
    }
    if (!res.ok) {
      throw new Error(result.details?.map(d => d.message).join(' · ') || result.error || 'Error al procesar la solicitud.');
    }
    return result;
  }

  function showToast(message, isError = false) {
    const el = $('toast');
    if (!el) return;
    el.textContent = message;
    el.classList.toggle('error', isError);
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.hidden = true;
    }, 3500);
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

  function updateStats() {
    const users = manageData?.users || [];
    const total = users.length;
    const active = users.filter(u => u.enabled !== false).length;
    const trainers = users.filter(u => u.role === 'TRAINER').length;
    const clients = users.filter(u => u.role === 'CLIENT').length;

    $('count-total').textContent = String(total);
    $('count-active').textContent = String(active);
    $('count-trainers').textContent = String(trainers);
    if ($('count-clients')) $('count-clients').textContent = String(clients);
    $('heading-count').textContent = `(${total})`;
  }

  function renderList() {
    const users = manageData?.users || [];
    const listEl = $('user-rows');
    const summaryEl = $('table-summary');
    const resultsCountEl = $('results-count');

    // Filtrado
    const q = searchQuery.toLowerCase().trim();
    const filtered = users.filter(u => {
      const personName = resolvePersonName(u).toLowerCase();
      const username = (u.username || '').toLowerCase();
      const roleText = (roleNames[u.role] || u.role).toLowerCase();

      const matchesSearch = !q || personName.includes(q) || username.includes(q) || roleText.includes(q);
      if (!matchesSearch) return false;

      if (activeFilter === 'all') return true;
      if (activeFilter === 'active') return u.enabled !== false;
      if (activeFilter === 'disabled') return u.enabled === false;
      return u.role === activeFilter;
    });

    resultsCountEl.textContent = `${filtered.length} ${filtered.length === 1 ? 'cuenta' : 'cuentas'}`;
    summaryEl.textContent = `Mostrando ${filtered.length} de ${users.length} usuarios`;

    if (!filtered.length) {
      listEl.innerHTML = '<p class="list-message">No se encontraron usuarios con el filtro seleccionado.</p>';
      return;
    }

    listEl.innerHTML = '';
    filtered.forEach(user => {
      const personName = resolvePersonName(user);
      const initials = getInitials(personName);
      const tone = getAvatarTone(personName);
      const roleColor = roleStyles[user.role] || { bg: '#f1f1f1', text: '#444' };
      const roleLabel = roleNames[user.role] || user.role;

      const card = document.createElement('article');
      card.className = 'client-card client-card-modern';
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      card.setAttribute('aria-label', `Editar usuario ${personName} (${user.username})`);

      card.innerHTML = `
        <div class="client-card-identity">
          <span class="client-avatar client-avatar-tone-${tone}" aria-hidden="true">${esc(initials)}</span>
          <span style="min-width: 0;">
            <strong class="client-card-name" style="display: block; font-size: 15px; color: var(--tp-ink); font-weight: 700;">${esc(personName)}</strong>
            <span style="display: block; font-size: 13px; color: var(--tp-muted); margin-top: 2px;">${esc(user.username)}</span>
          </span>
        </div>
        <div class="client-card-details" style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
          <span class="badge" style="padding: 3px 10px; border-radius: 12px; font-weight: 700; font-size: 11px; background: ${roleColor.bg}; color: ${roleColor.text};">
            ${esc(roleLabel)}
          </span>
          <span class="client-status ${user.enabled !== false ? 'status-ACTIVO' : 'status-INACTIVO'}">
            ${user.enabled !== false ? 'Activo' : 'Deshabilitado'}
          </span>
          <button class="button button-outline" type="button" style="min-height: 32px; padding: 0 12px; font-size: 12px; border-radius: 6px;">
            Editar
          </button>
        </div>
      `;

      card.addEventListener('click', () => openEditor(user));
      card.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openEditor(user);
        }
      });

      listEl.appendChild(card);
    });
  }

  function setupRoleToggles() {
    const roleSelect = $('user-role');
    const empField = $('employee-field');
    const cliField = $('client-field');
    const nameInput = $('user-name');
    const cliSelect = $('user-client');

    const updateVisibility = () => {
      const isClient = roleSelect.value === 'CLIENT';
      empField.hidden = isClient;
      cliField.hidden = !isClient;
      if (nameInput) nameInput.disabled = isClient;
      if (cliSelect) cliSelect.disabled = !isClient;
    };

    roleSelect.addEventListener('change', updateVisibility);
    updateVisibility();
  }

  function populateDropdowns() {
    const datalist = $('employee-suggestions');
    const cliSelect = $('user-client');

    const employees = (manageData?.employees || []).filter(e => e.name !== 'Entrenador de prueba');
    if (datalist) {
      datalist.innerHTML = employees.map(e => `<option value="${esc(e.name)}"></option>`).join('');
    }

    const clients = manageData?.clients || [];
    if (cliSelect) {
      cliSelect.innerHTML = clients.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
    }
  }

  function openEditor(user) {
    if (!manageData || manageData.role !== 'ADMIN') {
      showToast('No se han cargado los datos de administración. Inicia sesión de nuevo.', true);
      return;
    }
    if (!user) return;
    editingUser = user;
    const dialog = $('user-dialog');
    const form = $('user-form');
    const errorEl = $('form-error');

    form.reset();
    errorEl.hidden = true;
    errorEl.textContent = '';

    populateDropdowns();

    const titleEl = $('dialog-title');
    const eyebrowEl = $('dialog-eyebrow');
    if (user) {
      eyebrowEl.textContent = 'EDITAR CUENTA';
      titleEl.textContent = resolvePersonName(user) || user.username;
      $('user-role').value = user.role;
      $('user-username').value = user.username;
      $('user-enabled').value = String(user.enabled !== false);
      if (user.role === 'CLIENT') {
        if ($('user-client')) $('user-client').value = user.clientId || '';
        $('user-name').value = '';
        $('user-employee-id').value = '';
      } else {
        const pName = resolvePersonName(user);
        $('user-name').value = pName === 'Entrenador de prueba' ? '' : pName;
        $('user-employee-id').value = user.employeeId || '';
      }
    }

    const event = new Event('change');
    $('user-role').dispatchEvent(event);

    dialog.showModal();
  }

  async function loadData() {
    const listEl = $('user-rows');
    manageData = null;
    listEl.innerHTML = '<p class="list-message">Cargando usuarios…</p>';

    try {
      manageData = await api('manage');
      if (manageData.role !== 'ADMIN') {
        listEl.innerHTML = '<p class="list-message">Solo administración puede gestionar los usuarios.</p>';
        showToast('Solo administración puede gestionar los usuarios.', true);
        return;
      }
      updateStats();
      renderList();
    } catch (err) {
      listEl.innerHTML = `<p class="list-message error">${esc(err.message)}</p>`;
    }
  }

  // Event Listeners
  document.addEventListener('DOMContentLoaded', () => {
    setupRoleToggles();

    // Filtros por chips
    document.querySelectorAll('.filter-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-chip').forEach(b => {
          b.setAttribute('aria-pressed', 'false');
        });
        btn.setAttribute('aria-pressed', 'true');
        activeFilter = btn.dataset.filter;
        renderList();
      });
    });

    // Filtros rápidos por stat cards
    document.querySelectorAll('.stat-card').forEach(card => {
      card.addEventListener('click', () => {
        const filter = card.dataset.filter;
        if (!filter) return;
        activeFilter = filter;
        document.querySelectorAll('.filter-chip').forEach(b => {
          b.setAttribute('aria-pressed', String(b.dataset.filter === filter));
        });
        renderList();
      });
    });

    // Búsqueda
    const searchInput = $('search-input');
    const clearBtn = $('clear-search');
    searchInput.addEventListener('input', () => {
      searchQuery = searchInput.value;
      clearBtn.hidden = !searchQuery;
      renderList();
    });
    clearBtn.addEventListener('click', () => {
      searchInput.value = '';
      searchQuery = '';
      clearBtn.hidden = true;
      renderList();
      searchInput.focus();
    });

    // Refrescar
    $('refresh-list').addEventListener('click', () => {
      loadData().then(() => showToast('Lista actualizada.'));
    });

    // Modal dialog
    $('close-dialog').addEventListener('click', () => $('user-dialog').close());
    $('cancel-dialog').addEventListener('click', () => $('user-dialog').close());

    // Submit form
    $('user-form').addEventListener('submit', async e => {
      e.preventDefault();
      const errorEl = $('form-error');
      const submitBtn = $('submit-user');
      errorEl.hidden = true;
      errorEl.textContent = '';

      const form = e.target;
      if (!editingUser || !manageData || manageData.role !== 'ADMIN') {
        errorEl.textContent = 'No se han cargado los datos de administración. Actualiza la página e inicia sesión de nuevo.';
        errorEl.hidden = false;
        return;
      }
      const role = form.role.value;
      const username = form.username.value.trim();
      const enabled = form.enabled.value === 'true';
      const name = role !== 'CLIENT' ? (form.name ? form.name.value.trim() : '') : '';
      const employeeId = role !== 'CLIENT' ? (form.employeeId ? form.employeeId.value : null) : null;
      const clientId = role === 'CLIENT' ? form.clientId.value : null;

      if (!username) {
        errorEl.textContent = 'Indica el usuario de acceso.';
        errorEl.hidden = false;
        return;
      }

      if (role !== 'CLIENT' && !name) {
        errorEl.textContent = 'Escribe el nombre de la persona.';
        errorEl.hidden = false;
        return;
      }

      const record = {
        role,
        username,
        enabled,
        ...(name ? { name } : {}),
        ...(role === 'CLIENT' ? { clientId } : (employeeId ? { employeeId } : {})),
      };

      submitBtn.disabled = true;
      try {
        const path = 'manage/users/' + encodeURIComponent(editingUser.id);
        const res = await api(path, 'PUT', { record, revision: manageData.revision });
        if (res.token) {
          sessionStorage.removeItem('calendar-admin-token');
          sessionStorage.setItem('calendar-user-token', res.token);
          if (res.mustChangePassword) {
            location.href = '/change-password.html';
            return;
          }
        }
        $('user-dialog').close();
        showToast('Usuario actualizado correctamente.');
        await loadData();
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.hidden = false;
      } finally {
        submitBtn.disabled = false;
      }
    });

    loadData();
  });
})();
