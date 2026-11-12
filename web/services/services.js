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
      if (me.role === 'TRAINER' || me.role === 'CLIENT') {
        location.replace('/index.html');
        return;
      }
      if (me.role !== 'ADMIN') {
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

          <h3 class="service-name"><span class="service-color-dot" style="background:${/^#[0-9a-f]{6}$/i.test(service.color) ? service.color : "#317b9b"}" aria-hidden="true"></span>${esc(service.name)}</h3><p class="service-category">${service.category === "CABIN" ? "Cabina" : "Entrenamiento"}</p>
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
              <span class="spec-value">⏱ ${service.durationMin} min / sesión</span>
            </div>
            <div class="spec-item">
              <span class="spec-label">Sesiones</span>
              <span class="spec-value">🏋️ ${count} ${count === 1 ? 'sesión' : 'sesiones'}</span>
            </div>
            <div class="spec-item">
              <span class="spec-label">Validez / Duración</span>
              <span class="spec-value spec-duration-4weeks">📅 ${service.validityWeeks || 4} semanas</span>
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
      field.focus();
      field.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    formError.textContent = message;
    formError.hidden = false;
  }

  // Cálculo automático del precio por sesión en vivo
  function updateCalculatedPrice() {
    const calcPanel = $('calculated-rate-panel');
    const priceDisplay = $('calc-session-price');
    const unitDisplay = $('calc-session-unit');
    const formulaDisplay = $('calc-formula');
    if (!calcPanel || !priceDisplay || !formulaDisplay) return;

    const priceRaw = $('field-price')?.value?.trim();
    const countRaw = $('field-trainingCount')?.value?.trim();
    const type = $('field-type')?.value;
    const modality = $('field-modality')?.value;

    if (!priceRaw && !countRaw) {
      calcPanel.classList.remove('has-warning');
      priceDisplay.textContent = '—';
      if (unitDisplay) unitDisplay.textContent = '/ sesión';
      formulaDisplay.textContent = 'Introduce precio total y número de sesiones para calcular el desglose.';
      return;
    }

    const price = Number(priceRaw);
    const count = Number(countRaw);

    if (isNaN(price) || price < 0) {
      calcPanel.classList.add('has-warning');
      priceDisplay.textContent = 'Error';
      if (unitDisplay) unitDisplay.textContent = '';
      formulaDisplay.textContent = 'El precio total no puede ser negativo.';
      return;
    }

    if (isNaN(count) || !Number.isInteger(count) || count < 1) {
      calcPanel.classList.add('has-warning');
      priceDisplay.textContent = 'Error';
      if (unitDisplay) unitDisplay.textContent = '';
      formulaDisplay.textContent = 'El número de sesiones debe ser un entero mayor o igual a 1.';
      return;
    }

    calcPanel.classList.remove('has-warning');
    const pricePerSession = price / count;
    priceDisplay.textContent = eur.format(pricePerSession);
    if (unitDisplay) unitDisplay.textContent = '/ sesión';

    const isDual = modality === 'DUAL';
    const isPack = type === 'PACK' || count > 1;

    if (isPack && count > 1) {
      const dualPart = isDual ? ` (${eur.format(pricePerSession / 2)} por persona / sesión)` : '';
      formulaDisplay.textContent = `${eur.format(price)} total ÷ ${count} sesiones = ${eur.format(pricePerSession)} por sesión${dualPart}`;
    } else {
      const dualPart = isDual ? ` (${eur.format(price / 2)} por persona)` : '';
      formulaDisplay.textContent = `${eur.format(price)} por sesión única${dualPart}`;
    }
  }

  function openCreateDialog() {
    form.reset();
    clearValidationErrors();
    $('service-id').value = '';
    $('dialog-title').textContent = 'Nuevo servicio';
    $('dialog-subtitle').textContent = 'Introduce las características y tarifa del servicio.';
    $('field-name').value = '';
    $('field-category').value = 'TRAINING';
    $('field-color').value = ['#317b9b','#b85c38','#63805b','#885b9c','#a67a18'][services.length % 5];
    $('field-modality').value = 'INDIVIDUAL';
    $('field-type').value = 'SESION_INDIVIDUAL';
    $('field-trainingCount').value = '1';
    $('field-durationMin').value = '60';
    $('field-price').value = '';
    $('field-validityWeeks').value = '4';
    $('field-frequency').value = '';
    $('field-isActive').value = 'true';
    $('field-description').value = '';
    $('field-conditions').value = '';
    $('hint-trainingCount').textContent = '1 sesión para entrenamiento individual.';
    updateCalculatedPrice();
    dialog.showModal();
  }

  function openEditDialog(serviceId) {
    const service = services.find(s => s.id === serviceId);
    if (!service) return;

    form.reset();
    clearValidationErrors();
    $('service-id').value = service.id;
    $('dialog-title').textContent = 'Editar servicio';
    $('dialog-subtitle').textContent = `Modifica las características y tarifa de «${service.name}».`;
    $('field-name').value = service.name || '';
    $('field-category').value = service.category || 'TRAINING';
    $('field-color').value = service.color || '#317b9b';
    $('field-modality').value = service.modality || 'INDIVIDUAL';
    $('field-type').value = service.type || 'SESION_INDIVIDUAL';
    $('field-trainingCount').value = service.trainingCount ?? (service.type === 'PACK' ? 10 : 1);
    $('field-price').value = service.price != null ? Number(service.price).toFixed(2) : '';
    $('field-durationMin').value = service.durationMin || 60;
    $('field-validityWeeks').value = String(service.validityWeeks || 4);
    $('field-frequency').value = service.recommendedWeeklyFrequency ?? '';
    $('field-isActive').value = String(service.isActive !== false);
    $('field-description').value = service.description || '';
    $('field-conditions').value = service.conditions || '';

    if ($('field-type').value === 'SESION_INDIVIDUAL') {
      $('hint-trainingCount').textContent = '1 sesión para entrenamiento individual.';
    } else {
      $('hint-trainingCount').textContent = 'Número total de sesiones incluidas en el bono/pack.';
    }

    updateCalculatedPrice();
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
        $('hint-trainingCount').textContent = '1 sesión para entrenamiento individual.';
      } else {
        if (countInput.value === '1' || !countInput.value) countInput.value = '10';
        $('hint-trainingCount').textContent = 'Número total de sesiones incluidas en el bono/pack.';
      }
      updateCalculatedPrice();
    });

    // Auto-cálculo en tiempo real
    $('field-price')?.addEventListener('input', updateCalculatedPrice);
    $('field-price')?.addEventListener('change', updateCalculatedPrice);
    $('field-trainingCount')?.addEventListener('input', updateCalculatedPrice);
    $('field-trainingCount')?.addEventListener('change', updateCalculatedPrice);
    $('field-modality')?.addEventListener('change', updateCalculatedPrice);

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

      // 3. Tipo de servicio
      const type = $('field-type').value;
      if (type !== 'SESION_INDIVIDUAL' && type !== 'PACK') {
        return setFieldError('field-type', 'Selecciona un tipo de servicio válido (Sesión individual o Pack).');
      }

      // 4. Número de sesiones
      const countRaw = $('field-trainingCount').value.trim();
      if (!countRaw) {
        return setFieldError('field-trainingCount', 'Indica el número de sesiones del servicio.');
      }
      const trainingCount = Number(countRaw);
      if (!Number.isInteger(trainingCount) || trainingCount < 1 || trainingCount > 500) {
        return setFieldError('field-trainingCount', 'El número de sesiones debe ser un entero entre 1 y 500.');
      }
      if (type === 'SESION_INDIVIDUAL' && trainingCount !== 1) {
        return setFieldError('field-trainingCount', 'Una sesión individual debe tener exactamente 1 sesión. Selecciona «Pack de sesiones» si incluye varias.');
      }
      if (type === 'PACK' && trainingCount < 2) {
        return setFieldError('field-trainingCount', 'Un pack o bono de sesiones debe incluir al menos 2 sesiones.');
      }

      // 5. Precio total
      const priceRaw = $('field-price').value.trim();
      if (!priceRaw) {
        return setFieldError('field-price', 'El precio total del servicio es obligatorio.');
      }
      const price = Number(priceRaw);
      if (!Number.isFinite(price) || price < 0) {
        return setFieldError('field-price', 'El precio total no puede ser negativo.');
      }
      if (price > 99999999.99) {
        return setFieldError('field-price', 'El precio total no puede superar los 99.999.999,99 €.');
      }

      // 6. Duración por sesión
      const durRaw = $('field-durationMin').value.trim();
      if (!durRaw) {
        return setFieldError('field-durationMin', 'La duración de cada sesión es obligatoria.');
      }
      const durationMin = Number(durRaw);
      if (!Number.isInteger(durationMin) || durationMin < 5 || durationMin > 720) {
        return setFieldError('field-durationMin', 'La duración debe ser un entero entre 5 y 720 minutos.');
      }

      // 7. Validez editable en semanas completas.
      const weeksRaw = $('field-validityWeeks').value.trim();
      const validityWeeks = Number(weeksRaw);
      if (!Number.isSafeInteger(validityWeeks) || validityWeeks < 1 || validityWeeks > 5200) {
        return setFieldError('field-validityWeeks', 'Indica una validez entre 1 y 5200 semanas.');
      }

      // 8. Frecuencia semanal recomendada (opcional)
      const freqRaw = $('field-frequency').value.trim();
      let recommendedWeeklyFrequency = null;
      if (freqRaw) {
        recommendedWeeklyFrequency = Number(freqRaw);
        if (!Number.isInteger(recommendedWeeklyFrequency) || recommendedWeeklyFrequency < 1 || recommendedWeeklyFrequency > 14) {
          return setFieldError('field-frequency', 'La frecuencia semanal recomendada debe ser un entero entre 1 y 14 días.');
        }
      }

      // 9. Descripción (opcional)
      const description = $('field-description').value.trim();
      if (description.length > 2000) {
        return setFieldError('field-description', 'La descripción no puede tener más de 2000 caracteres.');
      }

      // 10. Condiciones (opcional)
      const conditions = $('field-conditions').value.trim();
      if (conditions.length > 5000) {
        return setFieldError('field-conditions', 'Las condiciones no pueden tener más de 5000 caracteres.');
      }

      // 11. Estado del servicio
      const isActive = $('field-isActive').value === 'true';

      const submitBtn = $('submit-dialog');
      submitBtn.disabled = true;

      const id = $('service-id').value;
      const payload = {
        name,
        description: description || null,
        modality,
        type,
        trainingCount,
        price,
        durationMin,
        validityWeeks,
        category: $('field-category').value,
        color: $('field-color').value,
        recommendedWeeklyFrequency,
        conditions: conditions || null,
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
