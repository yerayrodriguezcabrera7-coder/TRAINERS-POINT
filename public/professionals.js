(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const esc = str => String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function getAvatarTone(name) {
    const text = String(name || '').trim().toLocaleLowerCase('es');
    let hash = 0;
    for (const char of text) {
      hash = (hash * 31 + char.codePointAt(0)) >>> 0;
    }
    return hash % 6;
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
  let editingEmployee = null;
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

  function isActive(emp) {
    return emp.active !== false && emp.enabled !== false && (!emp.status || emp.status === 'ACTIVE');
  }

  function isTrainer(emp) {
    const title = (emp.jobTitle || '').toLowerCase();
    return title.includes('entrena') || title.includes('coach') || title.includes('trainer') || title.includes('preparador');
  }

  function updateStats() {
    const employees = manageData?.employees || [];
    const total = employees.length;
    const active = employees.filter(isActive).length;
    const trainers = employees.filter(e => isTrainer(e) && isActive(e)).length;
    const inactive = total - active;

    $('count-total').textContent = String(total);
    $('count-active').textContent = String(active);
    $('count-trainers').textContent = String(trainers);
    $('count-inactive').textContent = String(inactive);
    $('heading-count').textContent = `(${total})`;
  }

  function renderList() {
    const employees = manageData?.employees || [];
    const listEl = $('professional-rows');
    const summaryEl = $('table-summary');
    const resultsCountEl = $('results-count');

    const q = searchQuery.toLowerCase().trim();
    const filtered = employees.filter(emp => {
      const name = (emp.name || '').toLowerCase();
      const job = (emp.jobTitle || '').toLowerCase();
      const email = (emp.email || '').toLowerCase();

      const matchesSearch = !q || name.includes(q) || job.includes(q) || email.includes(q);
      if (!matchesSearch) return false;

      if (activeFilter === 'all') return true;
      if (activeFilter === 'active') return isActive(emp);
      if (activeFilter === 'trainers') return isTrainer(emp);
      if (activeFilter === 'shifts') return (emp.shifts || []).length > 0;
      if (activeFilter === 'inactive') return !isActive(emp);
      return true;
    });

    resultsCountEl.textContent = `${filtered.length} ${filtered.length === 1 ? 'profesional' : 'profesionales'}`;
    summaryEl.textContent = `Mostrando ${filtered.length} de ${employees.length} profesionales`;

    if (!filtered.length) {
      listEl.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="9"/><path d="M12 3v9h9"/>
            </svg>
          </span>
          <strong>No se encontraron profesionales</strong>
          <span>Prueba con otro filtro o término de búsqueda.</span>
        </div>
      `;
      return;
    }

    listEl.innerHTML = '';
    filtered.forEach(emp => {
      const active = isActive(emp);
      const signalType = active ? 'ok' : 'neutral';
      const empName = emp.name || 'Sin nombre';
      const jobTitle = emp.jobTitle || 'Profesional del centro';
      const scheduleDays = (emp.schedule || []).filter(h => !h.closed).length;
      const shiftCount = (emp.shifts || []).length;
      const statusText = active
        ? `Activo · ${scheduleDays} día${scheduleDays !== 1 ? 's' : ''}/semana`
        : 'Inactivo';

      const card = document.createElement('article');
      card.className = `client-card client-card-modern client-card-signal-${signalType}`;
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      card.setAttribute(
        'aria-label',
        `Ver ficha de ${empName}. Puesto: ${jobTitle}. Estado: ${statusText}.`
      );

      // Identity (left column)
      const identity = document.createElement('div');
      identity.className = 'client-card-identity';

      const avatar = document.createElement('span');
      avatar.className = `client-avatar client-avatar-tone-${getAvatarTone(empName)}`;
      avatar.setAttribute('aria-hidden', 'true');
      avatar.textContent = getInitials(empName);
      if (emp.color) {
        avatar.style.borderLeft = `3px solid ${esc(emp.color)}`;
      }

      const nameBlock = document.createElement('span');
      nameBlock.style.minWidth = '0';

      const name = document.createElement('strong');
      name.className = 'client-card-name';
      name.textContent = empName;

      const sub = document.createElement('span');
      sub.className = 'client-card-center';
      sub.style.display = 'block';
      sub.style.marginTop = '2px';
      sub.textContent = jobTitle;

      nameBlock.append(name, sub);
      identity.append(avatar, nameBlock);

      // Details (right column)
      const details = document.createElement('div');
      details.className = 'client-card-details';

      const signalLine = document.createElement('div');
      signalLine.className = `client-card-signal signal-${signalType}`;

      const signalIcon = document.createElement('span');
      signalIcon.className = 'client-signal-icon';
      signalIcon.setAttribute('aria-hidden', 'true');
      signalIcon.innerHTML = active
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18"/></svg>'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m15 9-6 6M9 9l6 6"/></svg>';

      const signalTextEl = document.createElement('span');
      signalTextEl.textContent = statusText;
      if (shiftCount > 0) {
        signalTextEl.textContent += ` (${shiftCount} turno${shiftCount !== 1 ? 's' : ''})`;
      }

      signalLine.append(signalIcon, signalTextEl);

      const contactLine = document.createElement('span');
      contactLine.className = 'client-card-center';
      contactLine.textContent = emp.email || 'Sin correo indicado';

      details.append(signalLine, contactLine);

      // Card arrow
      const arrow = document.createElement('span');
      arrow.className = 'card-arrow';
      arrow.setAttribute('aria-hidden', 'true');
      arrow.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>';

      card.append(identity, details, arrow);

      const open = () => openEditor(emp);
      card.addEventListener('click', open);
      card.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      });

      listEl.appendChild(card);
    });
  }

  function openEditor(emp) {
    if (!manageData || (manageData.role !== 'ADMIN' && manageData.role !== 'RECEPTION')) {
      showToast('Solo administración y recepción pueden gestionar los profesionales.', true);
      return;
    }
    editingEmployee = emp || null;
    const dialog = $('professional-dialog');
    const form = $('professional-form');
    const errorEl = $('form-error');

    form.reset();
    errorEl.hidden = true;
    errorEl.textContent = '';

    const titleEl = $('dialog-title');
    const eyebrowEl = $('dialog-eyebrow');
    const subtitleEl = $('dialog-subtitle');

    if (emp) {
      eyebrowEl.textContent = 'EDITAR PROFESIONAL';
      titleEl.textContent = emp.name || 'Profesional';
      if (subtitleEl) subtitleEl.textContent = 'Modifica los datos del trabajador o su estado.';
      $('prof-name').value = emp.name || '';
      $('prof-job').value = emp.jobTitle || '';
      $('prof-email').value = emp.email || '';
      $('prof-color').value = emp.color || '#317b9b';
      $('prof-active').value = String(isActive(emp));
    } else {
      eyebrowEl.textContent = 'NUEVO PROFESIONAL';
      titleEl.textContent = 'Añadir profesional';
      if (subtitleEl) subtitleEl.textContent = 'Completa los datos del trabajador para registrarlo en el centro.';
      $('prof-color').value = '#317b9b';
      $('prof-active').value = 'true';
    }

    dialog.showModal();
  }

  async function loadData() {
    const listEl = $('professional-rows');
    manageData = null;
    listEl.innerHTML = '<p class="list-message">Cargando profesionales…</p>';

    try {
      manageData = await api('manage');
      if (manageData.role !== 'ADMIN' && manageData.role !== 'RECEPTION') {
        listEl.innerHTML = '<p class="list-message">Solo el equipo del centro puede gestionar los profesionales.</p>';
        $('open-create').hidden = true;
        showToast('Solo el equipo del centro puede gestionar los profesionales.', true);
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
    // Filtros por chips
    document.querySelectorAll('.filter-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-chip').forEach(b => {
          b.setAttribute('aria-pressed', 'false');
          b.classList.remove('is-active');
        });
        btn.setAttribute('aria-pressed', 'true');
        btn.classList.add('is-active');
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
          const match = b.dataset.filter === filter;
          b.setAttribute('aria-pressed', String(match));
          b.classList.toggle('is-active', match);
        });
        document.querySelectorAll('.stat-card').forEach(sc => {
          sc.setAttribute('aria-pressed', String(sc.dataset.filter === filter));
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

    // Botón crear
    $('open-create').addEventListener('click', () => openEditor(null));

    // Modal dialog
    $('close-dialog').addEventListener('click', () => $('professional-dialog').close());
    $('cancel-dialog').addEventListener('click', () => $('professional-dialog').close());

    // Submit form
    $('professional-form').addEventListener('submit', async e => {
      e.preventDefault();
      const errorEl = $('form-error');
      const submitBtn = $('submit-professional');
      errorEl.hidden = true;
      errorEl.textContent = '';

      if (!manageData || (manageData.role !== 'ADMIN' && manageData.role !== 'RECEPTION')) {
        errorEl.textContent = 'No tienes permisos para guardar cambios.';
        errorEl.hidden = false;
        return;
      }

      const name = $('prof-name').value.trim();
      const jobTitle = $('prof-job').value.trim();
      const email = $('prof-email').value.trim();
      const color = $('prof-color').value;
      const active = $('prof-active').value === 'true';

      if (!name) {
        errorEl.textContent = 'El nombre y apellidos son obligatorios.';
        errorEl.hidden = false;
        return;
      }

      const days = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
      const defaultSchedule = days.map((_, i) => ({
        open: '09:00',
        close: i === 5 ? '14:00' : '21:00',
        closed: i === 6,
      }));

      const record = {
        name,
        email,
        jobTitle,
        color,
        active,
        schedule: editingEmployee?.schedule || defaultSchedule,
        shifts: editingEmployee?.shifts || [],
      };

      submitBtn.disabled = true;
      try {
        const path = editingEmployee
          ? 'manage/employees/' + encodeURIComponent(editingEmployee.id)
          : 'manage/employees';
        const method = editingEmployee ? 'PUT' : 'POST';
        await api(path, method, { record, revision: manageData.revision });
        $('professional-dialog').close();
        showToast(editingEmployee ? 'Profesional actualizado correctamente.' : 'Profesional registrado con éxito.');
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
