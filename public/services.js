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
      const data = await api('services?all=true');
      services = Array.isArray(data.services) ? data.services : [];
      updateStats();
      renderServices();
    } catch (err) {
      const grid = $('services-grid');
      if (grid) {
        grid.innerHTML = `
          <div class="services-empty">
            <div class="services-empty-icon">⚠️</div>
            <h3>No se pudieron cargar los servicios</h3>
            <p>${esc(err.message)}</p>
          </div>
        `;
      }
    }
  }

  function updateStats() {
    const total = services.length;
    const active = services.filter(s => s.isActive).length;
    const inactive = total - active;
    const individual = services.filter(s => s.modality === 'INDIVIDUAL').length;
    const packs = services.filter(s => s.type === 'PACK' || s.modality === 'DUAL').length;

    $('count-total').textContent = String(total);
    $('count-active').textContent = String(active);
    $('count-inactive').textContent = String(inactive);
    $('count-individual').textContent = String(individual);
    $('count-packs').textContent = String(packs);
    $('heading-count').textContent = `(${total})`;
  }

  function getFilteredServices() {
    return services.filter(service => {
      // Filtro por chips
      if (activeFilter === 'active' && !service.isActive) return false;
      if (activeFilter === 'inactive' && service.isActive) return false;
      if (activeFilter === 'INDIVIDUAL' && service.modality !== 'INDIVIDUAL') return false;
      if (activeFilter === 'DUAL' && service.modality !== 'DUAL') return false;
      if (activeFilter === 'PACK' && service.type !== 'PACK') return false;
      if (activeFilter === 'SESION_INDIVIDUAL' && service.type !== 'SESION_INDIVIDUAL') return false;

      // Filtro por buscador
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const haystack = [
          service.name,
          service.description,
          service.conditions,
          service.modality,
          service.type,
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

    if (!filtered.length) {
      grid.innerHTML = `
        <div class="services-empty">
          <div class="services-empty-icon">📋</div>
          <h3>No se encontraron servicios</h3>
          <p>${services.length ? 'Ningún servicio coincide con la búsqueda o el filtro seleccionado.' : 'Aún no hay servicios dados de alta en la base de datos.'}</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = filtered.map(service => {
      const priceNum = Number(service.price) || 0;
      const count = Number(service.trainingCount) || 1;
      const pricePerSession = count > 1 ? (priceNum / count) : null;
      const isDual = service.modality === 'DUAL';
      const isPack = service.type === 'PACK';

      return `
        <article class="service-card ${service.isActive ? '' : 'is-inactive'}" data-id="${esc(service.id)}">
          <div class="service-card-top">
            <div class="service-badges">
              <span class="badge-pill ${service.isActive ? 'badge-active' : 'badge-inactive'}">
                ${service.isActive ? 'Activo' : 'Inactivo'}
              </span>
              <span class="badge-pill badge-modality">
                ${isDual ? 'Dual (2 personas)' : 'Individual'}
              </span>
              <span class="badge-pill badge-type">
                ${isPack ? 'Pack de sesiones' : 'Sesión única'}
              </span>
            </div>
          </div>

          <h3 class="service-name">${esc(service.name)}</h3>
          <p class="service-description">${esc(service.description || 'Sin descripción detallada.')}</p>

          <div class="service-price-box">
            <div>
              <span class="spec-label">Precio total</span>
              <div class="price-main">${eur.format(priceNum)}</div>
            </div>
            <div class="price-subtitle">
              ${pricePerSession ? `${eur.format(pricePerSession)} / sesión` : `${service.durationMin} min / sesión`}
            </div>
          </div>

          <div class="service-specs">
            <div class="spec-item">
              <span class="spec-label">Duración</span>
              <span class="spec-value">⏱ ${service.durationMin} minutos</span>
            </div>
            <div class="spec-item">
              <span class="spec-label">Entrenamientos</span>
              <span class="spec-value">🏋️ ${count} ${count === 1 ? 'sesión' : 'sesiones'}</span>
            </div>
            <div class="spec-item">
              <span class="spec-label">Validez</span>
              <span class="spec-value">📅 ${service.validityWeeks ? `${service.validityWeeks} semanas` : 'Sin caducidad'}</span>
            </div>
            <div class="spec-item">
              <span class="spec-label">Frecuencia rec.</span>
              <span class="spec-value">🔄 ${service.recommendedWeeklyFrequency ? `${service.recommendedWeeklyFrequency} días / sem` : 'Flexible'}</span>
            </div>
          </div>

          ${service.conditions ? `
            <div class="service-conditions-box">
              <span class="conditions-label">Condiciones</span>
              <p class="conditions-text">${esc(service.conditions)}</p>
            </div>
          ` : ''}

          <div class="service-card-footer">
            <button class="button-toggle-status" type="button" data-toggle-id="${esc(service.id)}" data-active="${service.isActive}">
              ${service.isActive ? 'Desactivar' : 'Activar'}
            </button>
            <button class="button-edit-service" type="button" data-edit-id="${esc(service.id)}">
              Editar servicio ✎
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

  function openCreateDialog() {
    form.reset();
    $('service-id').value = '';
    $('dialog-title').textContent = 'Nuevo servicio';
    $('dialog-subtitle').textContent = 'Introduce las características y tarifa del servicio.';
    $('field-modality').value = 'INDIVIDUAL';
    $('field-type').value = 'SESION_INDIVIDUAL';
    $('field-trainingCount').value = '1';
    $('field-durationMin').value = '60';
    $('field-price').value = '';
    $('field-validityWeeks').value = '';
    $('field-frequency').value = '';
    $('field-isActive').value = 'true';
    formError.hidden = true;
    dialog.showModal();
  }

  function openEditDialog(serviceId) {
    const service = services.find(s => s.id === serviceId);
    if (!service) return;

    form.reset();
    $('service-id').value = service.id;
    $('dialog-title').textContent = 'Editar servicio';
    $('dialog-subtitle').textContent = `Modifica las características de «${service.name}».`;
    $('field-name').value = service.name || '';
    $('field-modality').value = service.modality || 'INDIVIDUAL';
    $('field-type').value = service.type || 'SESION_INDIVIDUAL';
    $('field-trainingCount').value = service.trainingCount || 1;
    $('field-price').value = Number(service.price || 0).toFixed(2);
    $('field-durationMin').value = service.durationMin || 60;
    $('field-validityWeeks').value = service.validityWeeks ?? '';
    $('field-frequency').value = service.recommendedWeeklyFrequency ?? '';
    $('field-isActive').value = String(service.isActive);
    $('field-description').value = service.description || '';
    $('field-conditions').value = service.conditions || '';
    formError.hidden = true;
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

    // Adaptar sugerencia de sesiones según tipo
    $('field-type')?.addEventListener('change', (e) => {
      const type = e.target.value;
      const countInput = $('field-trainingCount');
      if (type === 'SESION_INDIVIDUAL') {
        countInput.value = '1';
        $('hint-trainingCount').textContent = '1 entrenamiento para sesión individual.';
      } else {
        if (countInput.value === '1') countInput.value = '10';
        $('hint-trainingCount').textContent = 'Número total de sesiones incluidas en el pack.';
      }
    });

    // Envío del formulario
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      formError.hidden = true;
      const submitBtn = $('submit-dialog');
      submitBtn.disabled = true;

      const id = $('service-id').value;
      const payload = {
        name: $('field-name').value.trim(),
        modality: $('field-modality').value,
        type: $('field-type').value,
        trainingCount: Number($('field-trainingCount').value),
        price: Number($('field-price').value),
        durationMin: Number($('field-durationMin').value),
        validityWeeks: $('field-validityWeeks').value ? Number($('field-validityWeeks').value) : null,
        recommendedWeeklyFrequency: $('field-frequency').value ? Number($('field-frequency').value) : null,
        description: $('field-description').value.trim() || null,
        conditions: $('field-conditions').value.trim() || null,
        isActive: $('field-isActive').value === 'true',
      };

      try {
        if (id) {
          await api(`services/${encodeURIComponent(id)}`, 'PUT', payload);
          showToast('Servicio actualizado correctamente.');
        } else {
          await api('services', 'POST', payload);
          showToast('Servicio creado correctamente.');
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

    // Búsqueda en vivo
    $('service-search')?.addEventListener('input', (e) => {
      searchQuery = e.target.value.trim();
      renderServices();
    });

    // Filtros por chips
    document.querySelectorAll('.service-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('.service-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        activeFilter = chip.dataset.filter;
        renderServices();
      });
    });
  });
})();

