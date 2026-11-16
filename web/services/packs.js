(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const esc = str => String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

  let services = [];
  let packs = [];
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

  async function loadData() {
    try {
      const me = await api('me');
      if (me.role === 'TRAINER' || me.role === 'CLIENT') {
        location.replace('/index.html');
        return;
      }
      if (me.role !== 'ADMIN') {
        const createBtn = $('open-pack-create');
        if (createBtn) createBtn.hidden = true;
      }

      const [servicesRes, packsRes] = await Promise.all([
        api('services?all=true&includeInactive=true'),
        api('services/packs'),
      ]);

      services = Array.isArray(servicesRes.services) ? servicesRes.services : [];
      packs = Array.isArray(packsRes.packages) ? packsRes.packages : [];
      updateStats();
      renderServiceOptions();
      renderPacks();
    } catch (err) {
      const grid = $('packs-grid');
      if (grid) {
        grid.innerHTML = `
          <div class="services-empty">
            <div class="empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v4m0 4h.01"/></svg></div>
            <h3>No se pudieron cargar los packs</h3>
            <p>${esc(err.message)}</p>
          </div>
        `;
      }
    }
  }

  function updateStats() {
    $('heading-count').textContent = `(${packs.length})`;

    const filtered = getFilteredPacks();
    const resultsCountEl = $('results-count');
    if (resultsCountEl) {
      resultsCountEl.textContent = `${filtered.length} ${filtered.length === 1 ? 'pack' : 'packs'}`;
    }
    const tableSummaryEl = $('table-summary');
    if (tableSummaryEl) {
      tableSummaryEl.textContent = `Mostrando ${filtered.length} de ${packs.length} packs en el catálogo`;
    }
  }

  function getFilteredPacks() {
    return packs.filter(pack => {
      // Filtro por chips
      if (activeFilter === 'active' && !pack.isActive) return false;
      if (activeFilter === 'inactive' && pack.isActive) return false;
      if (activeFilter === 'INDIVIDUAL' && pack.modality !== 'INDIVIDUAL') return false;
      if (activeFilter === 'DUAL' && pack.modality !== 'DUAL') return false;

      // Filtro por buscador
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const haystack = [
          pack.name,
          pack.description,
          pack.service?.name,
          pack.modality,
          pack.category,
        ].filter(Boolean).join(' ').toLowerCase();

        if (!haystack.includes(query)) return false;
      }

      return true;
    });
  }

  function renderServiceOptions() {
    const select = $('field-service');
    if (!select) return;
    const activeServices = services.filter(s => s.isActive && s.type === 'SESION_INDIVIDUAL');
    select.innerHTML = activeServices.map(s =>
      `<option value="${esc(s.id)}" style="background:#${s.color.replace('#','')};color:${s.color === '#ffffff' ? '#000' : '#fff'}">${esc(s.name)}${s.modality === 'DUAL' ? ' · Dual' : ''}</option>`
    ).join('');
  }

  function renderPacks() {
    const grid = $('packs-grid');
    if (!grid) return;

    const filtered = getFilteredPacks();
    updateStats();

    if (!filtered.length) {
      grid.innerHTML = `
        <div class="services-empty">
          <div class="empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v4m0 4h.01"/></svg></div>
          <h3>No se encontraron packs</h3>
          <p>${packs.length ? 'Ningún pack coincide con la búsqueda o el filtro seleccionado.' : 'Aún no hay packs dados de alta. Crea tu primer pack para ofrecer bonos de sesiones a tus clientes.'}</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = filtered.map(pack => {
      const priceNum = Number(pack.price) || 0;
      const count = Number(pack.trainingCount) || 1;
      const pricePerSession = count > 1 ? (priceNum / count) : null;
      const isDual = pack.modality === 'DUAL';
      const serviceColor = /^#[0-9a-f]{6}$/i.test(pack.color) ? pack.color : '#317b9b';

      return `
        <article class="service-card ${pack.isActive ? '' : 'is-inactive'}" data-id="${esc(pack.id)}">
          <div class="service-card-top">
            <div class="service-badges">
              <span class="badge-pill ${pack.isActive ? 'badge-active' : 'badge-inactive'}">
                ${pack.isActive ? 'Activo' : 'Inactivo'}
              </span>
              <span class="badge-pill badge-modality">
                ${isDual ? 'Dual (2 personas)' : 'Individual'}
              </span>
              <span class="badge-pill badge-type">
                Pack de sesiones
              </span>
            </div>
          </div>

          <h3 class="service-name">
            <span class="service-color-dot" style="background:${serviceColor}" aria-hidden="true"></span>
            ${esc(pack.name)}
          </h3>
          <p class="service-category">${pack.category === "CABIN" ? "Cabina" : "Entrenamiento"}</p>
          ${pack.service ? `<p class="service-description" style="font-size:13px;color:var(--muted);">Servicio vinculado: <strong>${esc(pack.service.name)}</strong> ${pack.modality === 'DUAL' ? ' · Dual' : ' · Individual'}</p>` : ''}
          <p class="service-description">${esc(pack.description || 'Sin descripción detallada.')}</p>

          <div class="service-price-box">
            <div>
              <span class="spec-label">Precio total</span>
              <div class="price-main">${eur.format(priceNum)}</div>
            </div>
            <div class="price-subtitle">
              ${pricePerSession ? `${eur.format(pricePerSession)} / sesión` : `${pack.durationMin} min / sesión`}
            </div>
          </div>

          <div class="service-specs">
            <div class="spec-item">
              <span class="spec-label">Servicio</span>
              <span class="spec-value">${pack.service ? esc(pack.service.name) : 'Sin servicio vinculado'}</span>
            </div>
            <div class="spec-item">
              <span class="spec-label">Duración</span>
              <span class="spec-value">⏱ ${pack.durationMin} min / sesión</span>
            </div>
            <div class="spec-item">
              <span class="spec-label">Sesiones</span>
              <span class="spec-value">🏋️ ${count} ${count === 1 ? 'sesión' : 'sesiones'}</span>
            </div>
            <div class="spec-item">
              <span class="spec-label">Validez</span>
              <span class="spec-value spec-duration-4weeks">📅 ${pack.validityWeeks || 4} semanas</span>
            </div>
            <div class="spec-item">
              <span class="spec-label">Frecuencia rec.</span>
              <span class="spec-value">🔄 ${pack.recommendedWeeklyFrequency ? `${pack.recommendedWeeklyFrequency} días / sem` : 'Flexible'}</span>
            </div>
          </div>

          ${pack.conditions ? `
            <div class="service-conditions-box">
              <span class="conditions-label">Condiciones</span>
              <p class="conditions-text">${esc(pack.conditions)}</p>
            </div>
          ` : ''}

          <div class="service-card-footer">
            <button class="button-toggle-status" type="button" data-toggle-id="${esc(pack.id)}" data-active="${pack.isActive}">
              ${pack.isActive ? 'Desactivar' : 'Activar'}
            </button>
            <button class="button-edit-service" type="button" data-edit-id="${esc(pack.id)}">
              Editar pack ✎
            </button>
          </div>
        </article>
      `;
    }).join('');
  }

  // Manejo del formulario y modal
  const dialog = $('pack-dialog');
  const form = $('pack-form');
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

  function openCreateDialog() {
    form.reset();
    clearValidationErrors();
    $('pack-id').value = '';
    $('dialog-title').textContent = 'Nuevo pack';
    $('dialog-subtitle').textContent = 'Define un bono de sesiones vinculado a un servicio existente.';
    $('field-name').value = '';
    $('field-category').value = 'TRAINING';
    $('field-service').value = services.find(s => s.type === 'SESION_INDIVIDUAL')?.id || '';
    $('field-modality').value = 'INDIVIDUAL';
    $('field-type').value = 'PACK';
    $('field-trainingCount').value = '10';
    $('field-durationMin').value = '60';
    $('field-price').value = '';
    $('field-validityWeeks').value = '4';
    $('field-frequency').value = '';
    $('field-isActive').value = 'true';
    $('field-description').value = '';
    $('field-conditions').value = '';
    updateCalculatedPrice();
    dialog.showModal();
  }

  function openEditDialog(packId) {
    const pack = packs.find(p => p.id === packId);
    if (!pack) return;

    form.reset();
    clearValidationErrors();
    $('pack-id').value = pack.id;
    $('dialog-title').textContent = 'Editar pack';
    $('dialog-subtitle').textContent = `Modifica las características del pack «${pack.name}».`;
    $('field-name').value = pack.name || '';
    $('field-category').value = pack.category || 'TRAINING';
    $('field-service').value = pack.serviceId || '';
    $('field-modality').value = pack.modality || 'INDIVIDUAL';
    $('field-type').value = 'PACK';
    $('field-trainingCount').value = pack.trainingCount ?? 10;
    $('field-price').value = pack.price != null ? Number(pack.price).toFixed(2) : '';
    $('field-durationMin').value = pack.durationMin || 60;
    $('field-validityWeeks').value = String(pack.validityWeeks || 4);
    $('field-frequency').value = pack.recommendedWeeklyFrequency ?? '';
    $('field-isActive').value = String(pack.isActive !== false);
    $('field-description').value = pack.description || '';
    $('field-conditions').value = pack.conditions || '';
    updateCalculatedPrice();
    dialog.showModal();
  }

  async function handleToggleStatus(packId, currentActive) {
    const nextActive = !currentActive;
    try {
      await api(`services/${encodeURIComponent(packId)}/status`, 'PATCH', { isActive: nextActive });
      showToast(nextActive ? 'Pack activado correctamente.' : 'Pack desactivado.');
      await loadData();
    } catch (err) {
      showToast(err.message, true);
    }
  }

  function updateCalculatedPrice() {
    const calcPanel = $('calculated-rate-panel');
    const priceDisplay = $('calc-session-price');
    const formulaDisplay = $('calc-formula');
    if (!calcPanel || !priceDisplay || !formulaDisplay) return;

    const priceRaw = $('field-price')?.value?.trim();
    const countRaw = $('field-trainingCount')?.value?.trim();

    if (!priceRaw || !countRaw) {
      calcPanel.classList.remove('has-warning');
      priceDisplay.textContent = '—';
      formulaDisplay.textContent = 'Introduce precio total y número de sesiones para calcular el desglose.';
      return;
    }

    const price = Number(priceRaw);
    const count = Number(countRaw);

    if (isNaN(price) || price < 0) {
      calcPanel.classList.add('has-warning');
      priceDisplay.textContent = 'Error';
      formulaDisplay.textContent = 'El precio total no puede ser negativo.';
      return;
    }

    if (isNaN(count) || !Number.isInteger(count) || count < 1) {
      calcPanel.classList.add('has-warning');
      priceDisplay.textContent = 'Error';
      formulaDisplay.textContent = 'El número de sesiones debe ser un entero mayor o igual a 1.';
      return;
    }

    calcPanel.classList.remove('has-warning');
    const pricePerSession = price / count;
    priceDisplay.textContent = eur.format(pricePerSession);

    const modality = $('field-modality')?.value;
    const isDual = modality === 'DUAL';
    const dualPart = isDual ? ` (${eur.format(pricePerSession / 2)} por persona / sesión)` : '';
    formulaDisplay.textContent = `${eur.format(price)} total ÷ ${count} sesiones = ${eur.format(pricePerSession)} por sesión${dualPart}`;
  }

  // Event Listeners
  document.addEventListener('DOMContentLoaded', () => {
    loadData();

    $('open-pack-create')?.addEventListener('click', openCreateDialog);
    $('close-dialog')?.addEventListener('click', () => dialog.close());
    $('cancel-dialog')?.addEventListener('click', () => dialog.close());

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

      // 1. Nombre del pack
      const name = $('field-name').value.trim();
      if (!name) {
        return setFieldError('field-name', 'El nombre del pack es obligatorio.');
      }
      if (name.length > 120) {
        return setFieldError('field-name', 'El nombre no puede tener más de 120 caracteres.');
      }

      // 2. Servicio vinculado
      const serviceId = $('field-service').value;
      if (!serviceId) {
        return setFieldError('field-service', 'Selecciona un servicio al que se vincule este pack.');
      }

      // 3. Modalidad
      const modality = $('field-modality').value;
      if (modality !== 'INDIVIDUAL' && modality !== 'DUAL') {
        return setFieldError('field-modality', 'Selecciona una modalidad válida (Individual o Dual).');
      }

      // 4. Número de sesiones
      const countRaw = $('field-trainingCount').value.trim();
      if (!countRaw) {
        return setFieldError('field-trainingCount', 'Indica el número de sesiones del pack.');
      }
      const trainingCount = Number(countRaw);
      if (!Number.isInteger(trainingCount) || trainingCount < 2 || trainingCount > 500) {
        return setFieldError('field-trainingCount', 'El número de sesiones debe ser un entero entre 2 y 500.');
      }

      // 5. Precio total
      const priceRaw = $('field-price').value.trim();
      if (!priceRaw) {
        return setFieldError('field-price', 'El precio total del pack es obligatorio.');
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

      // 11. Estado del pack
      const isActive = $('field-isActive').value === 'true';

      const submitBtn = $('submit-dialog');
      submitBtn.disabled = true;

      const id = $('pack-id').value;
      const payload = {
        name,
        description: description || null,
        modality,
        type: 'PACK',
        serviceId,
        trainingCount,
        price,
        durationMin,
        validityWeeks,
        category: $('field-category').value,
        recommendedWeeklyFrequency,
        conditions: conditions || null,
        isActive,
      };

      try {
        if (id) {
          await api(`services/${encodeURIComponent(id)}`, 'PUT', payload);
          showToast('Pack modificado y guardado correctamente.');
        } else {
          await api('services', 'POST', payload);
          showToast('Pack creado y guardado en la base de datos.');
        }
        dialog.close();
        await loadData();
      } catch (err) {
        formError.textContent = err.message;
        formError.hidden = false;
      } finally {
        submitBtn.disabled = false;
      }
    });

    // Delegación de eventos en las tarjetas
    $('packs-grid')?.addEventListener('click', (e) => {
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
    $('pack-search')?.addEventListener('input', (e) => {
      searchQuery = e.target.value.trim();
      const clearBtn = $('clear-search');
      if (clearBtn) clearBtn.hidden = !searchQuery;
      renderPacks();
    });

    $('clear-search')?.addEventListener('click', () => {
      const searchInput = $('pack-search');
      if (searchInput) {
        searchInput.value = '';
        searchQuery = '';
        $('clear-search').hidden = true;
        renderPacks();
      }
    });

    // Refrescar catálogo
    $('refresh-list')?.addEventListener('click', async () => {
      await loadData();
      showToast('Catálogo de packs actualizado.');
    });

    // Filtros por chips
    document.querySelectorAll('.filter-chip, .pack-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('.filter-chip, .pack-chip').forEach(c => {
          c.classList.remove('active');
          c.setAttribute('aria-pressed', 'false');
        });
        chip.classList.add('active');
        chip.setAttribute('aria-pressed', 'true');
        activeFilter = chip.dataset.filter;
        renderPacks();
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

        document.querySelectorAll('.filter-chip, .pack-chip').forEach(c => {
          const match = c.dataset.filter === filter;
          c.classList.toggle('active', match);
          c.setAttribute('aria-pressed', String(match));
        });
        activeFilter = filter;
        renderPacks();
      });
    });
  });
})();