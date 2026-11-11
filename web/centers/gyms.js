const grid = document.querySelector("#gym-grid");
const search = document.querySelector("#gym-search");
const dialog = document.querySelector("#gym-create-dialog");
const form = document.querySelector("#gym-create-form");
const error = document.querySelector("#gym-create-error");
const photoInput = document.querySelector("#gym-photo");
const photoPreview = document.querySelector("#gym-photo-preview");
const dialogTitle = document.querySelector("#gym-dialog-title");
const dialogEyebrow = document.querySelector("#gym-dialog-eyebrow");
const scheduleFields = document.querySelector("#gym-schedule-fields");
const copyWeekdaysBtn = document.querySelector("#gym-copy-weekdays");

const WEEK_DAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const WEEK_DAYS_SHORT = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function defaultSchedule() {
  return WEEK_DAYS.map((_, i) => ({
    closed: i === 6,
    open: "09:00",
    close: i === 5 ? "14:00" : "21:00",
  }));
}

function normalizeSchedule(raw) {
  const fallback = defaultSchedule();
  if (!Array.isArray(raw) || raw.length !== 7) return fallback;
  return raw.map((day, i) => ({
    closed: Boolean(day?.closed),
    open: typeof day?.open === "string" && /^\d{2}:\d{2}$/.test(day.open) ? day.open : fallback[i].open,
    close: typeof day?.close === "string" && /^\d{2}:\d{2}$/.test(day.close) ? day.close : fallback[i].close,
  }));
}

function renderScheduleInputs(rawSchedule) {
  if (!scheduleFields) return;
  const schedule = normalizeSchedule(rawSchedule);
  scheduleFields.innerHTML = schedule
    .map(
      (hours, i) => `<div class="gym-schedule-row">
        <strong>${WEEK_DAYS[i]}</strong>
        <input type="time" step="1800" data-gym-open="${i}" value="${hours.open}" aria-label="Apertura ${WEEK_DAYS[i]}" ${hours.closed ? "disabled" : ""} required>
        <input type="time" step="1800" data-gym-close="${i}" value="${hours.close}" aria-label="Cierre ${WEEK_DAYS[i]}" ${hours.closed ? "disabled" : ""} required>
        <label class="gym-schedule-closed"><input type="checkbox" data-gym-closed="${i}" ${hours.closed ? "checked" : ""}> Cerrado</label>
      </div>`,
    )
    .join("");
}

function readScheduleInputs() {
  return WEEK_DAYS.map((_, i) => {
    const closed = Boolean(scheduleFields?.querySelector(`[data-gym-closed="${i}"]`)?.checked);
    const open = scheduleFields?.querySelector(`[data-gym-open="${i}"]`)?.value || "09:00";
    const close = scheduleFields?.querySelector(`[data-gym-close="${i}"]`)?.value || "21:00";
    return { closed, open, close };
  });
}

function formatScheduleSummary(rawSchedule) {
  const schedule = normalizeSchedule(rawSchedule);
  const groups = [];
  for (let i = 0; i < schedule.length; i++) {
    const d = schedule[i];
    const label = d.closed ? "Cerrado" : `${d.open}–${d.close}`;
    const last = groups[groups.length - 1];
    if (last && last.label === label) {
      last.end = i;
    } else {
      groups.push({ start: i, end: i, label });
    }
  }
  return groups
    .map((g) => {
      const days = g.start === g.end ? WEEK_DAYS_SHORT[g.start] : `${WEEK_DAYS_SHORT[g.start]}–${WEEK_DAYS_SHORT[g.end]}`;
      return `${days} ${g.label}`;
    })
    .join(" · ");
}

if (scheduleFields) {
  scheduleFields.addEventListener("change", (event) => {
    const target = event.target;
    if (!target.matches("[data-gym-closed]")) return;
    const i = target.dataset.gymClosed;
    const openEl = scheduleFields.querySelector(`[data-gym-open="${i}"]`);
    const closeEl = scheduleFields.querySelector(`[data-gym-close="${i}"]`);
    if (openEl) openEl.disabled = target.checked;
    if (closeEl) closeEl.disabled = target.checked;
  });
}

if (copyWeekdaysBtn && scheduleFields) {
  copyWeekdaysBtn.addEventListener("click", () => {
    const monClosed = Boolean(scheduleFields.querySelector('[data-gym-closed="0"]')?.checked);
    const monOpen = scheduleFields.querySelector('[data-gym-open="0"]')?.value || "09:00";
    const monClose = scheduleFields.querySelector('[data-gym-close="0"]')?.value || "21:00";
    for (let i = 1; i <= 4; i++) {
      const closedEl = scheduleFields.querySelector(`[data-gym-closed="${i}"]`);
      const openEl = scheduleFields.querySelector(`[data-gym-open="${i}"]`);
      const closeEl = scheduleFields.querySelector(`[data-gym-close="${i}"]`);
      if (closedEl) closedEl.checked = monClosed;
      if (openEl) { openEl.value = monOpen; openEl.disabled = monClosed; }
      if (closeEl) { closeEl.value = monClose; closeEl.disabled = monClosed; }
    }
  });
}
const saveBtn = document.querySelector("#save-gym");
const btnGeocode = document.querySelector("#btn-geocode-address");
const btnMyLocation = document.querySelector("#btn-use-my-location");
const geoStatusMsg = document.querySelector("#geo-status-msg");

let gyms = [];

function imageToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No se pudo leer la imagen."));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("El archivo seleccionado no es una imagen válida."));
      image.onload = () => {
        const maxSide = 1200;
        const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.78));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function showGeoStatus(message, isError = false) {
  if (!geoStatusMsg) return;
  geoStatusMsg.textContent = message;
  geoStatusMsg.style.color = isError ? "#f87171" : "#4ade80";
  geoStatusMsg.hidden = false;
}

// 1. Detectar coordenadas automáticamente desde la dirección
async function geocodeAddress() {
  const address = form.elements.address?.value?.trim() || "";
  const city = form.elements.city?.value?.trim() || "";
  const province = form.elements.province?.value?.trim() || "";

  const queryParts = [address, city, province, "España"].filter(Boolean);
  if (queryParts.length < 2) {
    showGeoStatus("Introduce al menos la dirección o la ciudad para buscar.", true);
    return;
  }

  btnGeocode.disabled = true;
  btnGeocode.textContent = "Buscando coordenadas...";
  showGeoStatus("Consultando servicio de mapas...");

  try {
    const query = queryParts.join(", ");
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
    const response = await fetch(url, { headers: { "Accept-Language": "es" } });
    const results = await response.json();

    if (!results || !results.length) {
      showGeoStatus("No se han encontrado coordenadas exactas para esta dirección. Introduce latitud y longitud manualmente.", true);
      return;
    }

    const lat = Number(parseFloat(results[0].lat).toFixed(6));
    const lon = Number(parseFloat(results[0].lon).toFixed(6));

    form.elements.latitude.value = lat;
    form.elements.longitude.value = lon;
    showGeoStatus(`✓ Coordenadas detectadas: Lat: ${lat}, Lon: ${lon}`);
  } catch (err) {
    showGeoStatus("No se pudo conectar con el servicio de geocodificación. Introduce las coordenadas manualmente.", true);
  } finally {
    btnGeocode.disabled = false;
    btnGeocode.textContent = "🔍 Detectar desde la dirección";
  }
}

// 2. Usar mi ubicación actual (GPS del navegador)
function useMyLocation() {
  if (!navigator.geolocation) {
    showGeoStatus("Tu navegador no soporta geolocalización.", true);
    return;
  }

  btnMyLocation.disabled = true;
  btnMyLocation.textContent = "Obteniendo GPS...";
  showGeoStatus("Obteniendo tu posición actual...");

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = Number(pos.coords.latitude.toFixed(6));
      const lon = Number(pos.coords.longitude.toFixed(6));
      form.elements.latitude.value = lat;
      form.elements.longitude.value = lon;
      showGeoStatus(`✓ Ubicación actual establecida: Lat: ${lat}, Lon: ${lon} (precisión: ±${Math.round(pos.coords.accuracy)}m)`);
      btnMyLocation.disabled = false;
      btnMyLocation.textContent = "🎯 Usar mi ubicación actual";
    },
    (err) => {
      showGeoStatus("No se pudo obtener la ubicación GPS (permiso denegado o sin señal).", true);
      btnMyLocation.disabled = false;
      btnMyLocation.textContent = "🎯 Usar mi ubicación actual";
    },
    { enableHighAccuracy: true, timeout: 6000 }
  );
}

function openCreateDialog() {
  form.reset();
  form.elements.id.value = "";
  dialogTitle.textContent = "Añadir gimnasio";
  dialogEyebrow.textContent = "NUEVA SEDE";
  saveBtn.textContent = "Guardar gimnasio";
  photoPreview.hidden = true;
  photoPreview.removeAttribute("src");
  error.hidden = true;
  if (geoStatusMsg) geoStatusMsg.hidden = true;
  if (form.elements.maxBookingsPerHour) form.elements.maxBookingsPerHour.value = "";
  renderScheduleInputs(null);
  dialog.showModal();
  form.elements.name.focus();
}

function openEditDialog(gym) {
  form.reset();
  form.elements.id.value = gym.id;
  form.elements.name.value = gym.name || "";
  form.elements.address.value = gym.address || "";
  form.elements.city.value = gym.city || "";
  form.elements.province.value = gym.province || "";
  form.elements.latitude.value = gym.latitude ?? "";
  form.elements.longitude.value = gym.longitude ?? "";
  form.elements.radiusMeters.value = gym.radiusMeters ?? 200;
  if (form.elements.maxBookingsPerHour) form.elements.maxBookingsPerHour.value = gym.maxBookingsPerHour ?? "";
  renderScheduleInputs(gym.schedule);

  dialogTitle.textContent = "Editar gimnasio";
  dialogEyebrow.textContent = "MODIFICAR SEDE";
  saveBtn.textContent = "Guardar cambios";

  if (gym.photoData) {
    photoPreview.src = gym.photoData;
    photoPreview.hidden = false;
  } else {
    photoPreview.hidden = true;
    photoPreview.removeAttribute("src");
  }

  error.hidden = true;
  if (geoStatusMsg) {
    if (gym.latitude && gym.longitude) {
      showGeoStatus(`✓ Coordenadas guardadas: Lat: ${gym.latitude}, Lon: ${gym.longitude}`);
    } else {
      geoStatusMsg.hidden = true;
    }
  }

  dialog.showModal();
  form.elements.name.focus();
}

function render() {
  const term = search.value.trim().toLocaleLowerCase("es");
  const visible = gyms.filter((gym) =>
    `${gym.name} ${gym.city ?? ""} ${gym.province ?? ""} ${gym.address ?? ""}`.toLocaleLowerCase("es").includes(term)
  );

  grid.replaceChildren();

  if (!visible.length) {
    const empty = document.createElement("div");
    empty.className = "gym-empty";
    empty.innerHTML = `<strong>${term ? "No hay sedes que coincidan" : "Aún no hay gimnasios"}</strong><span>${term ? "Prueba con otro término de búsqueda." : "Añade tu primera sede para empezar."}</span>`;
    grid.append(empty);
    return;
  }

  visible.forEach((gym) => {
    const card = document.createElement("article");
    card.className = "gym-directory-card";

    const icon = document.createElement("div");
    icon.className = "gym-mark";
    icon.textContent = "⌂";

    const body = document.createElement("div");
    body.className = "gym-card-body";

    let visual = icon;
    if (gym.photoData) {
      visual = document.createElement("img");
      visual.className = "gym-photo";
      visual.src = gym.photoData;
      visual.alt = `Foto de ${gym.name}`;
    }

    const name = document.createElement("h3");
    name.textContent = gym.name;

    const locationText = [gym.address, gym.city, gym.province].filter(Boolean).join(" · ") || "Dirección no especificada";
    const location = document.createElement("p");
    location.textContent = locationText;

    // Indicador de GPS activo para control horario
    if (gym.latitude != null && gym.longitude != null) {
      const geoTag = document.createElement("div");
      geoTag.style.cssText = "font-size:11px;color:#4ade80;display:flex;align-items:center;gap:4px;margin-top:4px;";
      geoTag.innerHTML = `<span>📍</span> <span>GPS activo (${gym.latitude.toFixed(4)}, ${gym.longitude.toFixed(4)} · Radio ${gym.radiusMeters || 200}m)</span>`;
      location.append(geoTag);
    } else {
      const noGeoTag = document.createElement("div");
      noGeoTag.style.cssText = "font-size:10px;color:#888;display:flex;align-items:center;gap:4px;margin-top:4px;";
      noGeoTag.innerHTML = `<span>⚠️</span> <span>Sin coordenadas GPS configuradas</span>`;
      location.append(noGeoTag);
    }

    const limitTag = document.createElement("div");
    if (gym.maxBookingsPerHour != null && gym.maxBookingsPerHour > 0) {
      limitTag.style.cssText = "font-size:11px;color:#38bdf8;display:flex;align-items:center;gap:4px;margin-top:4px;";
      limitTag.innerHTML = `<span>⏱️</span> <span>Máx. <strong>${gym.maxBookingsPerHour}</strong> ${gym.maxBookingsPerHour === 1 ? 'reserva' : 'reservas'} / hora</span>`;
    } else {
      limitTag.style.cssText = "font-size:10px;color:#888;display:flex;align-items:center;gap:4px;margin-top:4px;";
      limitTag.innerHTML = `<span>⏱️</span> <span>Sin límite de reservas por hora</span>`;
    }
    location.append(limitTag);

    const scheduleTag = document.createElement("div");
    scheduleTag.className = "gym-schedule-tag";
    const scheduleIcon = document.createElement("span");
    scheduleIcon.textContent = "🕒";
    const scheduleText = document.createElement("span");
    scheduleText.textContent = gym.schedule
      ? formatScheduleSummary(gym.schedule)
      : "Horario por defecto (sin personalizar)";
    scheduleTag.append(scheduleIcon, scheduleText);
    location.append(scheduleTag);

    const footer = document.createElement("div");
    footer.className = "gym-card-footer";

    const clientsCount = gym._count?.clients ?? 0;
    const clients = document.createElement("strong");
    clients.textContent = `${clientsCount} ${clientsCount === 1 ? "cliente" : "clientes"}`;

    const actions = document.createElement("span");
    actions.className = "gym-card-actions";

    const link = document.createElement("a");
    link.href = `/clientes?gymId=${encodeURIComponent(gym.id)}`;
    link.textContent = "Clientes ↗";

    const edit = document.createElement("button");
    edit.type = "button";
    edit.style.cssText = "background:transparent;border:0;color:#ff8a1f;font-size:11px;font-weight:600;cursor:pointer;";
    edit.textContent = "Editar";
    edit.addEventListener("click", () => openEditDialog(gym));

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "gym-delete";
    remove.textContent = "Borrar";
    remove.setAttribute("aria-label", `Borrar ${gym.name}`);
    remove.addEventListener("click", () => deleteGym(gym, remove));

    actions.append(link, edit, remove);
    footer.append(clients, actions);
    body.append(name, location, footer);
    card.append(visual, body);
    grid.append(card);
  });
}

async function deleteGym(gym, button) {
  if (!window.confirm(`¿Quieres borrar la sede "${gym.name}"?`)) return;
  button.disabled = true;
  try {
    const response = await fetch(`/api/gyms/${encodeURIComponent(gym.id)}`, {
      method: "DELETE",
      headers: { Accept: "application/json" },
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "No se pudo borrar la sede.");
    gyms = gyms.filter((item) => item.id !== gym.id);
    render();
    const totalClients = gyms.reduce((sum, item) => sum + (item._count?.clients || 0), 0);
    document.querySelector("#gym-count").textContent = `(${gyms.length})`;
    document.querySelector("#active-count").textContent = gyms.length;
    document.querySelector("#client-count").textContent = totalClients;
  } catch (err) {
    window.alert(err.message);
    button.disabled = false;
  }
}

async function load() {
  try {
    const token = sessionStorage.getItem("calendar-user-token") || sessionStorage.getItem("calendar-admin-token") || window.CALENDAR_DEV_TOKEN || "";
    const meRes = await fetch("/api/me", { headers: { Authorization: "Bearer " + token } }).catch(() => null);
    if (meRes && meRes.ok) {
      const me = await meRes.json();
      if (me.role !== "ADMIN") {
        location.replace("/index.html");
        return;
      }
    }
    const response = await fetch("/api/gyms", { headers: { Accept: "application/json" } });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "No se pudieron cargar las sedes.");
    gyms = data.gyms;
    const totalClients = gyms.reduce((sum, gym) => sum + (gym._count?.clients || 0), 0);
    document.querySelector("#gym-count").textContent = `(${gyms.length})`;
    document.querySelector("#active-count").textContent = gyms.length;
    document.querySelector("#client-count").textContent = totalClients;
    render();
  } catch (err) {
    grid.innerHTML = `<p class="list-message error">${err.message}</p>`;
  }
}

search.addEventListener("input", render);
document.querySelector("#open-gym-create").addEventListener("click", openCreateDialog);
document.querySelector("#close-gym-create").addEventListener("click", () => dialog.close());
document.querySelector("#cancel-gym-create").addEventListener("click", () => dialog.close());

if (btnGeocode) btnGeocode.addEventListener("click", geocodeAddress);
if (btnMyLocation) btnMyLocation.addEventListener("click", useMyLocation);

photoInput.addEventListener("change", () => {
  const file = photoInput.files[0];
  if (!file) {
    photoPreview.hidden = true;
    return;
  }
  photoPreview.src = URL.createObjectURL(file);
  photoPreview.hidden = false;
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  error.hidden = true;
  if (!form.reportValidity()) return;

  const button = document.querySelector("#save-gym");
  button.disabled = true;
  button.textContent = "Guardando…";

  try {
    const gymId = form.elements.id?.value;
    const body = Object.fromEntries(new FormData(form).entries());
    delete body.photo;
    delete body.id;

    // Normalizar números
    if (body.latitude !== "") body.latitude = Number(body.latitude);
    else delete body.latitude;

    if (body.longitude !== "") body.longitude = Number(body.longitude);
    else delete body.longitude;

    if (body.radiusMeters !== "") body.radiusMeters = Number(body.radiusMeters);
    else delete body.radiusMeters;

    if (body.maxBookingsPerHour !== "" && body.maxBookingsPerHour != null) {
      body.maxBookingsPerHour = Number(body.maxBookingsPerHour);
    } else {
      delete body.maxBookingsPerHour;
    }

    const schedule = readScheduleInputs();
    if (schedule.some((day) => !day.closed && day.open >= day.close)) {
      throw new Error("La hora de cierre debe ser posterior a la de apertura en los días abiertos.");
    }
    body.schedule = schedule;

    const file = photoInput.files[0];
    if (file) {
      if (!file.type.startsWith("image/") || file.size > 8 * 1024 * 1024) {
        throw new Error("Selecciona una imagen de hasta 8 MB.");
      }
      body.photoData = await imageToDataUrl(file);
    }

    const method = gymId ? "PATCH" : "POST";
    const endpoint = gymId ? `/api/gyms/${encodeURIComponent(gymId)}` : "/api/gyms";

    const response = await fetch(endpoint, {
      method,
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "No se pudo guardar el gimnasio.");

    dialog.close();
    await load();
  } catch (err) {
    error.textContent = err.message;
    error.hidden = false;
  } finally {
    button.disabled = false;
    button.textContent = saveBtn.textContent;
  }
});

load();
