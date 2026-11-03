(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const esc = str => String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const standardRoles = ['Entrenador', 'Recepción', 'Administración'];

  const roleStyles = {
    Entrenador: { bg: '#e3f2fd', text: '#1565c0' },
    Recepción: { bg: '#e8f5ec', text: '#2e7d32' },
    Administración: { bg: '#fff0df', text: '#ff7f0a' },
  };

  const roleToSecurityRole = {
    Entrenador: 'TRAINER',
    Recepción: 'RECEPTION',
    Administración: 'ADMIN',
  };

  function slugUsername(name) {
    return String(name || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '.')
      .replace(/^\.+|\.+$/g, '')
      .slice(0, 60);
  }

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

  function normalizeJobTitle(job) {
    const text = (job || '').toLowerCase();
    if (text.includes('recep')) return 'Recepción';
    if (text.includes('admin') || text.includes('direc')) return 'Administración';
    return 'Entrenador';
  }

  function updateStats() {
    const employees = manageData?.employees || [];
    const total = employees.length;
    let trainers = 0;
    let reception = 0;
    let admin = 0;

    employees.forEach(emp => {
      const normalized = normalizeJobTitle(emp.jobTitle);
      if (normalized === 'Administración') admin++;
      else if (normalized === 'Recepción') reception++;
      else trainers++;
    });

    $('count-total').textContent = String(total);
    $('count-trainers').textContent = String(trainers);
    $('count-reception').textContent = String(reception);
    $('count-admin').textContent = String(admin);
    $('heading-count').textContent = `(${total})`;
  }

  function renderList() {
    const employees = manageData?.employees || [];
    const listEl = $('professional-rows');
    const summaryEl = $('table-summary');
    const resultsCountEl = $('results-count');

    const q = searchQuery.toLowerCase().trim();
    const filtered = employees.filter(emp => {
      const normalizedRole = normalizeJobTitle(emp.jobTitle);
      const name = (emp.name || '').toLowerCase();
      const job = (emp.jobTitle || '').toLowerCase();
      const email = (emp.email || '').toLowerCase();

      const matchesSearch = !q || name.includes(q) || job.includes(q) || email.includes(q) || normalizedRole.toLowerCase().includes(q);
      if (!matchesSearch) return false;

      if (activeFilter === 'all') return true;
      if (activeFilter === 'Entrenador') return normalizedRole === 'Entrenador';
      if (activeFilter === 'Recepción') return normalizedRole === 'Recepción';
      if (activeFilter === 'Administración') return normalizedRole === 'Administración';
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
      const normalizedRole = normalizeJobTitle(emp.jobTitle);
      const roleColor = roleStyles[normalizedRole] || roleStyles.Entrenador;
      const signalType = active ? 'ok' : 'neutral';
      const empName = emp.name || 'Sin nombre';
      const jobTitle = emp.jobTitle || normalizedRole;
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

      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.style.padding = '2px 8px';
      badge.style.borderRadius = '12px';
      badge.style.fontWeight = '700';
      badge.style.fontSize = '11px';
      badge.style.background = roleColor.bg;
      badge.style.color = roleColor.text;
      badge.textContent = normalizedRole;

      const signalTextEl = document.createElement('span');
      signalTextEl.textContent = statusText;
      if (shiftCount > 0) {
        signalTextEl.textContent += ` (${shiftCount} turno${shiftCount !== 1 ? 's' : ''})`;
      }

      signalLine.append(badge, signalTextEl);

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
    const jobSelect = $('prof-job');

    // Restaurar opciones estándar en el select de puesto laboral
    jobSelect.innerHTML = `
      <option value="Entrenador">Entrenador</option>
      <option value="Recepción">Recepción</option>
      <option value="Administración">Administración</option>
    `;

    if (emp) {
      const normalized = normalizeJobTitle(emp.jobTitle);
      eyebrowEl.textContent = 'EDITAR PROFESIONAL';
      titleEl.textContent = emp.name || 'Profesional';
      if (subtitleEl) subtitleEl.textContent = 'Modifica los datos del trabajador, su puesto laboral o su estado.';
      $('prof-name').value = emp.name || '';
      jobSelect.value = normalized;
      $('prof-email').value = emp.email || '';
      $('prof-color').value = emp.color || '#317b9b';
      $('prof-active').value = String(isActive(emp));
    } else {
      eyebrowEl.textContent = 'NUEVO PROFESIONAL';
      titleEl.textContent = 'Añadir profesional';
      if (subtitleEl) subtitleEl.textContent = 'Selecciona su puesto laboral (Entrenador, Recepción o Administración) y completa sus datos.';
      jobSelect.value = 'Entrenador';
      $('prof-color').value = '#317b9b';
      $('prof-active').value = 'true';
    }

    // Comprobar si el profesional tiene cuenta de usuario vinculada
    const accountBox = $('prof-user-account-box');
    const usernameEl = $('prof-user-username');
    const feedbackEl = $('prof-pwd-feedback');
    if (feedbackEl) { feedbackEl.hidden = true; feedbackEl.textContent = ''; }
    
    if (accountBox) {
      if (emp) {
        const linkedUser = (manageData?.users || []).find(u => u.employeeId === emp.id);
        if (linkedUser) {
          accountBox.hidden = false;
          accountBox.dataset.userId = linkedUser.id;
          accountBox.dataset.userName = emp.name;
          if (usernameEl) usernameEl.textContent = `Usuario: ${linkedUser.username} · Rol: ${linkedUser.role}`;
        } else {
          accountBox.hidden = true;
        }
      } else {
        accountBox.hidden = true;
      }
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
        location.replace('/index.html');
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

    // Restablecer contraseña del entrenador desde la ficha de profesional
    $('prof-btn-reset-pwd')?.addEventListener('click', async () => {
      const accountBox = $('prof-user-account-box');
      const userId = accountBox?.dataset.userId;
      const userName = accountBox?.dataset.userName || 'este profesional';
      const feedbackEl = $('prof-pwd-feedback');
      const btn = $('prof-btn-reset-pwd');

      if (!userId) return;

      if (!confirm(`¿Restablecer la contraseña de ${userName} a "Trainerspoint"?\n\nEl entrenador podrá acceder con "Trainerspoint" y se le pedirá cambiarla en su primer inicio.`)) {
        return;
      }

      btn.disabled = true;
      btn.textContent = 'Restableciendo…';

      try {
        await api(`manage/users/${encodeURIComponent(userId)}/reset-password`, 'POST');
        if (feedbackEl) {
          feedbackEl.textContent = '✓ Contraseña restablecida con éxito a "Trainerspoint". Se le solicitará crear una nueva al iniciar sesión.';
          feedbackEl.hidden = false;
        }
        showToast(`Contraseña de ${userName} restablecida a "Trainerspoint".`);
        await loadData();
      } catch (err) {
        if (feedbackEl) {
          feedbackEl.textContent = err.message;
          feedbackEl.style.color = '#dc2626';
          feedbackEl.hidden = false;
        }
        showToast(err.message, true);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Restablecer contraseña del entrenador';
      }
    });

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
      const jobTitle = $('prof-job').value; // 'Entrenador', 'Recepción' o 'Administración'
      const email = $('prof-email').value.trim();
      const color = $('prof-color').value;
      const active = $('prof-active').value === 'true';
      const securityRole = roleToSecurityRole[jobTitle] || 'TRAINER';

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

      const empRecord = {
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
        const savedEmp = await api(path, method, { record: empRecord, revision: manageData.revision });

        // Si el usuario actual es ADMIN, sincronizar o crear su cuenta de usuario con el rol correspondiente
        if (manageData.role === 'ADMIN') {
          const empId = editingEmployee ? editingEmployee.id : savedEmp.id;
          const linkedUser = (manageData.users || []).find(u => u.employeeId === empId);

          if (linkedUser) {
            const userRecord = {
              username: linkedUser.username,
              role: securityRole,
              enabled: active,
              name,
              employeeId: empId,
            };
            await api('manage/users/' + encodeURIComponent(linkedUser.id), 'PUT', {
              record: userRecord,
              revision: manageData.revision,
            });
          } else {
            const username = slugUsername(name);
            const userRecord = {
              username,
              role: securityRole,
              enabled: active,
              name,
              employeeId: empId,
            };
            await api('manage/users', 'POST', {
              record: userRecord,
              revision: manageData.revision,
            }).catch(() => {
              // Si falla por colisión de usuario opcional, el empleado ya está guardado con su puesto
            });
          }
        }

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
