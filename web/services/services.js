(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const esc = str => String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

  let services = [];
  let activeFilter = 'all';
  let searchQuery = '';
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
      location.href = '/login.html';
      throw new Error('Inicia sesión para continuar.');
    }
    if (!res.ok) {
      throw new Error(result.error || result.details?.map(d => d.message).join(' · ') || 'Error al procesar la solicitud.');
    }
    return result;
  }

  function showToast(message, isError = false) {
    const toast = $('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.toggle('error', isError);
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.hidden = true;
    }, 3500);
  }

  async function loadServices() {
    try {
      const me = await api('me');
      const canView = me.role === 'ADMIN' || (Array.isArray(me.pagePermissions) ? me.pagePermissions.includes('servicios') : me.role === 'RECEPTION');
      if (!canView) {
        location.replace('/index.html');
        return;
      }
      const canEdit = me.role === 'ADMIN' || (Array.isArray(me.pagePermissions) && me.pagePermissions.includes('servicios'));
      if (!canEdit) {
        const createBtn = $('open-service-create');
        if (createBtn) createBtn.hidden = true;
      }
      const data = await api('services?all=true');
      services = Array.isArray(data.services) ? data.services : [];
      updateStats();
      renderServices();
    } catch (err) {
      const grid = $('services-grid');
      if (grid) {
        grid.innerHTML = `
          <div class="services-empty">
            <div class="empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v4m0 4h.01"/></svg></div>
            <h3>No se pudieron cargar los servicios</h3>
            <p>${esc(err.message)}</p>
          </div>
        `;
      }
    }
  }

  function updateStats() {
    const total = services.length;
    $('heading-count').textContent = `(${total})`;

    const filtered = getFilteredServices();
    const resultsCountEl = $('results-count');
    if (resultsCountEl) {
      resultsCountEl.textContent = `${filtered.length} ${filtered.length === 1 ? 'servicio' : 'servicios'}`;
    }
    const tableSummaryEl = $('table-summary');
    if (tableSummaryEl) {
      tableSummaryEl.textContent = `Mostrando ${filtered.length} de ${total} servicios en el catálogo`;
    }
  }

  function getFilteredServices() {
    return services.filter(service => {
      // Filtro por chips
      if (activeFilter === 'CABIN' && service.category !== 'CABIN') return false;
      if (activeFilter === 'active' && !service.isActive) return false;
      if (activeFilter === 'inactive' && service.isActive) return false;
      if (activeFilter === 'INDIVIDUAL' && service.modality !== 'INDIVIDUAL') return false;
      if (activeFilter === 'DUAL' && service.modality !== 'DUAL') return false;

      // Filtro por buscador
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const haystack = [
          service.name,
          service.description,
          service.modality,
          service.category === "CABIN" ? "cabina" : "entrenamiento",
        ].filter(Boolean).join(' ').toLowerCase();

        if (!haystack.includes(query)) return false;
      }

      return true;
    });
  }

  function renderServices() {
    const grid = $('services-grid');
    if (!grid) return;

    const filtered = getFilteredServices();
    updateStats();

    if (!filtered.length) {
      grid.innerHTML = `
        <div class="services-empty">
          <div class="empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg></div>
          <h3>No se encontraron servicios</h3>
          <p>${services.length ? 'Ningún servicio coincide con la búsqueda o el filtro seleccionado.' : 'Aún no hay servicios dados de alta. Los tipos de sesión (Individual, Dual…) se definen aquí.'}</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = filtered.map(service => {
      const isDual = service.modality === 'DUAL';
      const color = /^#[0-9a-f]{6}$/i.test(service.color) ? service.color : '#317b9b';

      return `
        <article class="service-card ${service.isActive ? '' : 'is-inactive'}" data-id="${esc(service.id)}">
          <div class="service-card-top">
            <div class="service-badges">
              <span class="badge-pill ${service.isActive ? 'badge-active' : 'badge-inactive'}">
                ${service.isActive ? 'Activo' : 'Inactivo'}
              </span>
              <span class="badge-pill badge-modality">
                ${isDual ? 'Dual (pareja / 2 personas)' : 'Individual (1 persona)'}
              </span>
            </div>
          </div>

          <h3 class="service-name"><span class="service-color-dot" style="background:${color}" aria-hidden="true"></span>${esc(service.name)}</h3><p class="service-category">${service.category === "CABIN" ? "Cabina" : "Entrenamiento"}</p>
          <p class="service-description">${esc(service.description || 'Sin descripción detallada.')}</p>

          <div class="service-specs">
            <div class="spec-item">
              <span class="spec-label">Duración</span>
              <span class="spec-value">⏱ ${service.durationMin} min (por defecto)</span>
            </div>
            <div class="spec-item">
              <span class="spec-label">Color en cuadrante</span>
              <span class="spec-value"><span style="display:inline-block;width:16px;height:16px;border-radius:50%;background:${color};vertical-align:middle;margin-right:4px;border:1px solid rgba(0,0,0,0.1);"></span>${service.color}</span>
            </div>
          </div>

          <div class="service-card-footer">
            <button class="button-toggle-status" type="button" data-toggle-id="${esc(service.id)}" data-active="${service.isActive}">
              ${service.isActive ? 'Desactivar' : 'Activar'}
            </button>
            <button class="button-edit-service" type="button" data-edit-id="${esc(service.id)}">
              Editar sesión ✎
            </button>
          </div>
        </article>
      `;
    }).join('');
  }

  // Manejo del formulario y modal
  const dialog = $('service-dialog');
  const form = $('service-form');
  const formError = $('form-error');

  function clearValidationErrors() {
    formError.hidden = true;
    formError.textContent = '';
    const formFields = form?.querySelectorAll('input, select, textarea') || [];
    formFields.forEach(el => el.classList.remove('is-invalid'));
  }

  function setFieldError(fieldId, message) {
    clearValidationErrors();
    const field = $(fieldId);
    if (field) {
      field.classList.add('is-invalid');
      if (typeof field.focus === 'function') field.focus();
      if (typeof field.scrollIntoView === 'function') field.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    formError.textContent = message;
    formError.hidden = false;
  }

  function openCreateDialog() {
    form.reset();
    clearValidationErrors();
    $('service-id').value = '';
    $('dialog-title').textContent = 'Nuevo tipo de sesión';
    $('dialog-subtitle').textContent = 'Aquí únicamente se configuran los tipos de entrenamiento para la agenda (Individual, Dual, Cabina…).';
    $('field-name').value = '';
    $('field-category').value = 'TRAINING';
    $('field-color').value = ['#317b9b','#b85c38','#477458','#885b9c','#a67a18','#c2413a'][services.length % 6];
    $('field-modality').value = 'INDIVIDUAL';
    $('field-durationMin').value = '60';
    $('field-isActive').value = 'true';
    $('field-description').value = '';
    dialog.showModal();
  }

  function openEditDialog(serviceId) {
    const service = services.find(s => s.id === serviceId);
    if (!service) return;

    form.reset();
    clearValidationErrors();
    $('service-id').value = service.id;
    $('dialog-title').textContent = 'Editar tipo de sesión';
    $('dialog-subtitle').textContent = `Modifica las características de «${service.name}».`;
    $('field-name').value = service.name || '';
    $('field-category').value = service.category || 'TRAINING';
    $('field-color').value = service.color || '#317b9b';
    $('field-modality').value = service.modality || 'INDIVIDUAL';
    $('field-durationMin').value = service.durationMin || 60;
    $('field-isActive').value = String(service.isActive !== false);
    $('field-description').value = service.description || '';
    dialog.showModal();
  }

  async function handleToggleStatus(serviceId, currentActive) {
    const nextActive = !currentActive;
    try {
      await api(`services/${encodeURIComponent(serviceId)}/status`, 'PATCH', { isActive: nextActive });
      showToast(nextActive ? 'Servicio activado correctamente.' : 'Servicio desactivado.');
      await loadServices();
    } catch (err) {
      showToast(err.message, true);
    }
  }

  // Event Listeners
  document.addEventListener('DOMContentLoaded', () => {
    loadServices();

    $('open-service-create')?.addEventListener('click', openCreateDialog);
    $('close-dialog')?.addEventListener('click', () => dialog.close());
    $('cancel-dialog')?.addEventListener('click', () => dialog.close());

    // Selección rápida de color desde la paleta
    document.querySelectorAll('.color-preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const c = btn.dataset.color;
        if (c && $('field-color')) {
          $('field-color').value = c;
          $('field-color').dispatchEvent(new Event('input', { bubbles: true }));
        }
      });
    });

    // Limpiar estado de error al escribir en cualquier campo
    form?.querySelectorAll('input, select, textarea').forEach(field => {
      field.addEventListener('input', () => {
        field.classList.remove('is-invalid');
        if (formError && !formError.hidden) {
          formError.hidden = true;
        }
      });
      field.addEventListener('change', () => {
        field.classList.remove('is-invalid');
        if (formError && !formError.hidden) {
          formError.hidden = true;
        }
      });
    });

    // Envío del formulario con validaciones completas
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearValidationErrors();

      // 1. Nombre del servicio
      const name = $('field-name').value.trim();
      if (!name) {
        return setFieldError('field-name', 'El nombre del servicio es obligatorio.');
      }
      if (name.length > 120) {
        return setFieldError('field-name', 'El nombre no puede tener más de 120 caracteres.');
      }

      // 2. Modalidad
      const modality = $('field-modality').value;
      if (modality !== 'INDIVIDUAL' && modality !== 'DUAL') {
        return setFieldError('field-modality', 'Selecciona una modalidad válida (Individual o Dual).');
      }

      // 3. Color
      const color = $('field-color').value;
      if (!/^#[0-9a-f]{6}$/i.test(color)) {
        return setFieldError('field-color', 'Selecciona un color válido.');
      }

      // 4. Duración por sesión
      const durRaw = $('field-durationMin').value.trim();
      if (!durRaw) {
        return setFieldError('field-durationMin', 'La duración de cada sesión es obligatoria.');
      }
      const durationMin = Number(durRaw);
      if (!Number.isInteger(durationMin) || durationMin < 5 || durationMin > 720) {
        return setFieldError('field-durationMin', 'La duración debe ser un entero entre 5 y 720 minutos.');
      }

      // 5. Descripción (opcional)
      const description = $('field-description').value.trim();
      if (description.length > 2000) {
        return setFieldError('field-description', 'La descripción no puede tener más de 2000 caracteres.');
      }

      // 6. Estado del servicio
      const isActive = $('field-isActive').value === 'true';

      const submitBtn = $('submit-dialog');
      submitBtn.disabled = true;

      const id = $('service-id').value;
      const payload = {
        name,
        description: description || null,
        modality,
        type: 'SESION_INDIVIDUAL',
        trainingCount: 1,
        price: 0,
        durationMin,
        category: $('field-category').value,
        color,
        isActive,
      };

      try {
        if (id) {
          await api(`services/${encodeURIComponent(id)}`, 'PUT', payload);
          showToast('Servicio modificado y guardado correctamente.');
        } else {
          await api('services', 'POST', payload);
          showToast('Servicio creado y guardado en la base de datos.');
        }
        dialog.close();
        await loadServices();
      } catch (err) {
        formError.textContent = err.message;
        formError.hidden = false;
      } finally {
        submitBtn.disabled = false;
      }
    });

    // Delegación de eventos en las tarjetas
    $('services-grid')?.addEventListener('click', (e) => {
      const toggleBtn = e.target.closest('[data-toggle-id]');
      if (toggleBtn) {
        const id = toggleBtn.dataset.toggleId;
        const currentActive = toggleBtn.dataset.active === 'true';
        handleToggleStatus(id, currentActive);
        return;
      }

      const editBtn = e.target.closest('[data-edit-id]');
      if (editBtn) {
        const id = editBtn.dataset.editId;
        openEditDialog(id);
      }
    });

    // Búsqueda en vivo y limpiar búsqueda
    $('service-search')?.addEventListener('input', (e) => {
      searchQuery = e.target.value.trim();
      const clearBtn = $('clear-search');
      if (clearBtn) clearBtn.hidden = !searchQuery;
      renderServices();
    });

    $('clear-search')?.addEventListener('click', () => {
      const searchInput = $('service-search');
      if (searchInput) {
        searchInput.value = '';
        searchQuery = '';
        $('clear-search').hidden = true;
        renderServices();
      }
    });

    // Refrescar catálogo
    $('refresh-list')?.addEventListener('click', async () => {
      await loadServices();
      showToast('Catálogo de servicios actualizado.');
    });

    // Filtros por chips
    document.querySelectorAll('.filter-chip, .service-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('.filter-chip, .service-chip').forEach(c => {
          c.classList.remove('active');
          c.setAttribute('aria-pressed', 'false');
        });
        chip.classList.add('active');
        chip.setAttribute('aria-pressed', 'true');
        activeFilter = chip.dataset.filter;
        renderServices();
      });
    });

    // Filtros rápidos desde las tarjetas de resumen (stats-grid)
    document.querySelectorAll('.stat-card').forEach(card => {
      card.addEventListener('click', () => {
        const filter = card.dataset.filter;
        if (!filter) return;
        document.querySelectorAll('.stat-card').forEach(c => {
          c.classList.remove('stat-card-primary');
          c.setAttribute('aria-pressed', 'false');
        });
        card.classList.add('stat-card-primary');
        card.setAttribute('aria-pressed', 'true');

        document.querySelectorAll('.filter-chip, .service-chip').forEach(c => {
          const match = c.dataset.filter === filter;
          c.classList.toggle('active', match);
          c.setAttribute('aria-pressed', String(match));
        });
        activeFilter = filter;
        renderServices();
      });
    });
  });
})();
