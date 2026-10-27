const statusLabels = {
  LEAD: "Nuevo interesado",
  ACTIVO: "Activo",
  INACTIVO: "Inactivo",
  BAJA: "Baja",
};

const rows = document.querySelector("#client-rows");
const todayView = document.querySelector("#today-view");
const clientToolbar = document.querySelector(".toolbar");
const tableSummary = document.querySelector("#table-summary");
const limitNote = document.querySelector("#limit-note");
const resultsCount = document.querySelector("#results-count");
const searchInput = document.querySelector("#search-input");
const clearSearchButton = document.querySelector("#clear-search");
const gymFilter = document.querySelector("#gym-filter");
const gymFilterWrapper = document.querySelector("#gym-filter-wrapper");
const clientFilterButtons = [...document.querySelectorAll(".filter-chip")];
const validFilters = new Set(["all", "today", "attention", "pending-payment", "no-sessions", "leads", "low-sessions", "inactive"]);
const initialFilter = new URLSearchParams(window.location.search).get("filtro");
const initialGymId =
  new URLSearchParams(window.location.search).get("gymId") ||
  localStorage.getItem("calendar-selected-gym") ||
  "";
const gymCards = document.querySelector("#gym-cards");
const createDialog = document.querySelector("#create-dialog");
const createForm = document.querySelector("#create-form");
const submitButton = document.querySelector("#submit-create");
const formError = document.querySelector("#form-error");
const gymDialog = document.querySelector("#gym-dialog");
const gymForm = document.querySelector("#gym-form");
const gymSubmitButton = document.querySelector("#submit-gym");
const gymFormError = document.querySelector("#gym-form-error");
const historyDialog = document.querySelector("#service-history-dialog");
const packageList = document.querySelector("#service-package-list");
const bookingRows = document.querySelector("#booking-history-rows");
const purchaseForm = document.querySelector("#purchase-form");
const purchaseError = document.querySelector("#purchase-error");
const purchaseSubmit = document.querySelector("#submit-purchase");
const serviceCreateDialog = document.querySelector("#service-create-dialog");
const serviceCreateForm = document.querySelector("#service-create-form");
const serviceCreateError = document.querySelector("#service-create-error");
const serviceCreateSubmit = document.querySelector("#submit-service-create");
const toast = document.querySelector("#toast");
let searchTimer;
let toastTimer;
let refreshController;
let gyms = [];
let services = [];
let historyClientId;
let clientsData = [];
let activeFilter = validFilters.has(initialFilter) ? initialFilter : "today";
const arrivedBookings = new Map();
let timelineTimer;
if (initialFilter !== activeFilter) {
  const url = new URL(window.location.href);
  url.searchParams.set("filtro", activeFilter);
  window.history.replaceState(null, "", url);
}

const paymentMethodLabels = {
  EFECTIVO: "Efectivo",
  TARJETA: "Tarjeta",
  TRANSFERENCIA: "Transferencia",
  OTRO: "Otro",
};

const paymentStatusLabels = {
  PENDIENTE: "Pendiente",
  PAGADO: "Pagado",
  FALLIDO: "Fallido",
  REEMBOLSADO: "Reembolsado",
};

const attendanceLabels = {
  PENDIENTE: "Pendiente",
  ASISTIO: "Asistió",
  NO_ASISTIO: "No asistió",
  CANCELADA: "Cancelada",
};

function escapeText(value) {
  return String(value ?? "");
}

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function createInfoItem(label, value, detail, className = "") {
  const item = document.createElement("div");
  item.className = `client-info-item ${className}`.trim();
  const heading = document.createElement("span");
  heading.className = "client-info-label";
  heading.textContent = label;
  const content = document.createElement("strong");
  content.className = "client-info-value";
  content.textContent = value;
  item.append(heading, content);
  if (detail) {
    const description = document.createElement("small");
    description.className = "client-info-detail";
    description.textContent = detail;
    item.append(description);
  }
  return item;
}

function renderEmpty(message, detail) {
  rows.replaceChildren();
  const state = document.createElement("div");
  state.className = "empty-state";
  const icon = document.createElement("span");
  icon.className = "empty-icon";
  icon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 3v9h9"/></svg>';
  const title = document.createElement("strong");
  title.textContent = message;
  const description = document.createElement("span");
  description.textContent = detail;
  state.append(icon, title, description);
  rows.append(state);
}

function formatTime(value) {
  return new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function getClientProfileHref(clientId) {
  const params = new URLSearchParams({ filtro: activeFilter });
  return `/clientes/${encodeURIComponent(clientId)}/ficha?${params}`;
}

function isToday(value, now = new Date()) {
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) &&
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
}

function renderTodayEmpty() {
  todayView.replaceChildren();
  const message = document.createElement("p");
  message.className = "today-empty";
  message.textContent = searchInput.value || gymFilter.value
    ? "No hay sesiones hoy con estos filtros."
    : "Hoy no hay reservas. Puedes crear una desde el calendario.";
  todayView.append(message);
}

function renderToday(clients, animateBookingId = "") {
  todayView.replaceChildren();
  const now = new Date();
  const appointments = clients
    .filter((client) => client.nextSession && isToday(client.nextSession.startTime, now))
    .sort((a, b) => new Date(a.nextSession.startTime) - new Date(b.nextSession.startTime));
  if (!appointments.length) {
    renderTodayEmpty();
    return;
  }

  const nextBooking = appointments.find((client) =>
    !arrivedBookings.has(client.nextSession.id) &&
    new Date(client.nextSession.startTime).getTime() > now.getTime(),
  )?.nextSession.id;
  const timeline = document.createElement("div");
  timeline.className = "today-timeline";
  timeline.setAttribute("role", "list");

  for (const client of appointments) {
    const booking = client.nextSession;
    const bookingTime = new Date(booking.startTime);
    const arrived = arrivedBookings.get(booking.id);
    const row = document.createElement("article");
    row.className = "today-appointment";
    row.setAttribute("role", "listitem");
    row.dataset.bookingId = booking.id;
    row.dataset.startTime = String(bookingTime.getTime());
    if (arrived && booking.id !== animateBookingId) row.classList.add("is-arrived");
    else if (!arrived && booking.id === nextBooking) row.classList.add("is-next");
    else if (!arrived && bookingTime.getTime() <= now.getTime()) row.classList.add("is-past");

    const time = document.createElement("time");
    time.className = "today-appointment-time";
    time.dateTime = bookingTime.toISOString();
    time.textContent = formatTime(booking.startTime);

    const details = document.createElement("div");
    details.className = "today-appointment-details";
    const name = document.createElement("a");
    name.className = "today-appointment-name";
    name.href = getClientProfileHref(client.id);
    name.textContent = `${client.firstName} ${client.lastName}`.trim();
    const service = document.createElement("span");
    service.className = "today-appointment-service";
    service.textContent = booking.service?.name || "Sesión";
    details.append(name, service);

    if (arrived) {
      const arrival = document.createElement("span");
      arrival.className = "today-arrival-label";
      arrival.innerHTML = '<svg class="today-arrival-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>';
      const arrivalText = document.createElement("span");
      arrivalText.textContent = `Llegó a las ${formatTime(arrived.attendedAt)}`;
      arrival.append(arrivalText);
      details.append(arrival);
      if (booking.id === animateBookingId) {
        requestAnimationFrame(() => row.classList.add("is-arrived"));
      }
    } else {
      const label = document.createElement("span");
      label.className = "today-appointment-status";
      details.append(label);
      const checkin = document.createElement("button");
      checkin.className = "today-checkin";
      checkin.type = "button";
      checkin.textContent = "Ha llegado";
      checkin.setAttribute("aria-label", `Registrar llegada de ${client.firstName} ${client.lastName}`);
      checkin.disabled = bookingTime.getTime() > now.getTime();
      checkin.addEventListener("click", () => registerArrival(client, checkin));
      row.append(time, details, checkin);
      timeline.append(row);
      continue;
    }

    row.append(time, details);
    timeline.append(row);
  }
  todayView.append(timeline);
  updateTimelineMarkers();
}

function updateTimelineMarkers() {
  const appointmentRows = [...todayView.querySelectorAll(".today-appointment")];
  const now = Date.now();
  const nextId = appointmentRows.find((row) =>
    !row.querySelector(".today-arrival-label") && Number(row.dataset.startTime) > now,
  )?.dataset.bookingId;

  for (const row of appointmentRows) {
    if (row.querySelector(".today-arrival-label")) continue;
    const startTime = Number(row.dataset.startTime);
    const isNext = row.dataset.bookingId === nextId;
    const isPast = startTime <= now;
    row.classList.toggle("is-next", isNext);
    row.classList.toggle("is-past", isPast);
    const status = row.querySelector(".today-appointment-status");
    status.textContent = isNext ? "Próxima" : "Pendiente de llegada";
    status.hidden = !isNext && !isPast;
    row.querySelector(".today-checkin").disabled = !isPast;
  }
}

function syncTimelineTimer() {
  window.clearInterval(timelineTimer);
  if (activeFilter === "today") {
    timelineTimer = window.setInterval(updateTimelineMarkers, 15000);
  }
}

function clientMatchesFilter(client, filter = activeFilter) {
  if (filter === "today" || filter === "all") return true;
  if (filter === "attention") {
    const signal = getClientSignal(client, new Date());
    return signal?.type === "urgent" || signal?.type === "warning";
  }
  if (filter === "pending-payment") return client.pendingPayments > 0;
  if (filter === "no-sessions") return client.servicePackageCount === 0 && client.status === "ACTIVO";
  if (filter === "leads") return client.status === "LEAD";
  if (filter === "low-sessions") return Number.isFinite(client.remainingSessions) && client.remainingSessions <= 2;
  if (filter === "inactive") return client.status === "INACTIVO";
  return true;
}

function getVisibleClients() {
  return clientsData.filter((client) => clientMatchesFilter(client));
}

function syncFilterControls() {
  clientFilterButtons.forEach((button) => {
    const selected = button.dataset.filter === activeFilter;
    button.setAttribute("aria-pressed", String(selected));
    button.classList.toggle("is-active", selected);
  });
  document.querySelectorAll(".stat-card[data-filter]").forEach((button) => {
    const selected = button.dataset.filter === activeFilter;
    button.setAttribute("aria-pressed", String(selected));
    button.classList.toggle("is-active", selected);
  });
}

function renderAllClients() {
  rows.replaceChildren();
  const visibleClients = getVisibleClients();
  if (!visibleClients.length) {
    const hasFilters = searchInput.value || gymFilter.value || activeFilter !== "all";
    renderEmpty(
      hasFilters ? "No hay clientes con estos filtros" : "Aún no hay clientes",
      hasFilters
        ? "Prueba con otro nombre o cambia los filtros."
        : "Pulsa «Nuevo cliente» para añadir el primero.",
    );
    return;
  }
  visibleClients.forEach((client, index) => rows.append(renderClient(client, index)));
}

function renderActiveClientView(animateBookingId = "") {
  const isTodayView = activeFilter === "today";
  todayView.hidden = !isTodayView;
  rows.hidden = isTodayView;
  clientToolbar.hidden = false;
  const todayCount = clientsData.filter((client) => client.nextSession && isToday(client.nextSession.startTime)).length;
  const upcomingCount = clientsData.filter((client) => client.nextSession).length;
  const visibleCount = isTodayView ? todayCount : getVisibleClients().length;
  resultsCount.textContent = `${visibleCount} ${visibleCount === 1 ? (isTodayView ? "reserva" : "cliente") : (isTodayView ? "reservas" : "clientes")}`;
  tableSummary.textContent = isTodayView
    ? `${todayCount} ${todayCount === 1 ? "sesión hoy" : "sesiones hoy"}`
    : activeFilter === "all"
      ? `${upcomingCount} ${upcomingCount === 1 ? "cliente con sesión próxima" : "clientes con sesiones próximas"}`
      : `${visibleCount} ${visibleCount === 1 ? "cliente" : "clientes"} con este filtro`;
  limitNote.hidden = isTodayView;
  syncFilterControls();
  if (isTodayView) renderToday(clientsData, animateBookingId);
  else renderAllClients();
}

function setActiveFilter(filter, focusButton = false) {
  if (!validFilters.has(filter)) return;
  activeFilter = filter;
  const url = new URL(window.location.href);
  url.searchParams.set("filtro", filter);
  window.history.replaceState(null, "", url);
  syncTimelineTimer();
  if (focusButton) {
    document.querySelector(`[data-filter="${CSS.escape(filter)}"]`)?.focus();
  }
  renderActiveClientView();
}

async function loadClients() {
  refreshController?.abort();
  refreshController = new AbortController();
  rows.replaceChildren();
  todayView.replaceChildren();
  const isTodayView = activeFilter === "today";
  todayView.hidden = !isTodayView;
  rows.hidden = isTodayView;
  const loadingMessage = document.createElement("p");
  loadingMessage.className = "list-message";
  loadingMessage.textContent = "Cargando clientes…";
  (isTodayView ? todayView : rows).append(loadingMessage);

  const params = new URLSearchParams();
  params.set("all", "true");
  if (searchInput.value.trim()) params.set("q", searchInput.value.trim());
  if (gymFilter.value) params.set("gymId", gymFilter.value);

  try {
    const response = await fetch(`/api/clients?${params}`, {
      headers: { Accept: "application/json" },
      signal: refreshController.signal,
    });
    const data = await response.json();
    if (!response.ok) throw new Error("No se pudieron cargar los clientes. Inténtalo de nuevo.");

    const clients = [...data.clients];
    const compareNames = (a, b) =>
      `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, "es");
    clients.sort((a, b) => {
      const aStart = a.nextSession ? new Date(a.nextSession.startTime).getTime() : Number.POSITIVE_INFINITY;
      const bStart = b.nextSession ? new Date(b.nextSession.startTime).getTime() : Number.POSITIVE_INFINITY;
      return aStart - bStart || compareNames(a, b);
    });
    clientsData = clients;
    document.querySelector("#heading-count").textContent = `(${data.total})`;
    document.querySelector("#count-attention").textContent = clients.filter((client) => clientMatchesFilter(client, "attention")).length;
    document.querySelector("#count-today").textContent = clients.filter((client) => client.nextSession && isToday(client.nextSession.startTime)).length;
    document.querySelector("#count-low-sessions").textContent = clients.filter((client) => clientMatchesFilter(client, "low-sessions")).length;
    document.querySelector("#count-inactive").textContent = clients.filter((client) => client.status === "INACTIVO").length;
    clearSearchButton.hidden = !searchInput.value;
    renderActiveClientView();
  } catch (error) {
    if (error.name === "AbortError") return;
    rows.replaceChildren();
    const message = document.createElement("p");
    message.className = "list-message error";
    message.textContent = "No se pudieron cargar los clientes. Inténtalo de nuevo.";
    if (activeFilter === "today") todayView.replaceChildren(message);
    else rows.append(message);
    resultsCount.textContent = "";
  }
}

function renderGyms() {
  const selectedGymId = gymFilter.value;
  const selectedCreateGymId = document.querySelector("#create-gym-select").value;
  gymFilterWrapper.hidden = gyms.length <= 1;
  gymCards.replaceChildren();
  gymFilter.replaceChildren();
  const allOption = document.createElement("option");
  allOption.value = "";
  allOption.textContent = "Todos los centros";
  gymFilter.append(allOption);

  const createGymSelect = document.querySelector("#create-gym-select");
  createGymSelect.replaceChildren();
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = gyms.length ? "Selecciona un centro" : "Añade un centro primero";
  createGymSelect.append(placeholder);
  createGymSelect.disabled = gyms.length === 0;
  document.querySelector("#open-create").disabled = gyms.length === 0;

  if (gyms.length === 0) {
    const empty = document.createElement("p");
    empty.className = "gym-loading";
    empty.textContent = "No hay centros. Añade uno para poder crear fichas.";
    gymCards.append(empty);
    return;
  }

  gyms.forEach((gym) => {
    const filterOption = document.createElement("option");
    filterOption.value = gym.id;
    filterOption.textContent = gym.name;
    gymFilter.append(filterOption);

    const clientOption = document.createElement("option");
    clientOption.value = gym.id;
    clientOption.textContent = gym.name;
    createGymSelect.append(clientOption);

    const card = document.createElement("button");
    card.type = "button";
    card.className = `gym-card${gymFilter.value === gym.id ? " selected" : ""}`;
    card.setAttribute("aria-label", `Ver clientes de ${gym.name}`);
    const icon = document.createElement("span");
    icon.className = "gym-card-icon";
    icon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/></svg>';
    const details = document.createElement("span");
    details.className = "gym-card-details";
    const name = document.createElement("strong");
    name.textContent = gym.name;
    const location = document.createElement("small");
    location.textContent = [gym.city, gym.province].filter(Boolean).join(", ") || "Sin ubicación";
    details.append(name, location);
    const count = document.createElement("span");
    count.className = "gym-card-count";
    count.textContent = String(gym._count.clients);
    const clientLabel = document.createElement("small");
    clientLabel.className = "gym-card-client-label";
    clientLabel.textContent = gym._count.clients === 1 ? "cliente" : "clientes";
    const countBlock = document.createElement("span");
    countBlock.className = "gym-card-total";
    countBlock.append(count, clientLabel);
    card.append(icon, details, countBlock);
    card.addEventListener("click", () => {
      gymFilter.value = gymFilter.value === gym.id ? "" : gym.id;
      renderGyms();
      loadClients();
    });
    gymCards.append(card);
  });

  gymFilter.value = selectedGymId;
  if (selectedCreateGymId && gyms.some((gym) => gym.id === selectedCreateGymId)) {
    document.querySelector("#create-gym-select").value = selectedCreateGymId;
  } else if (gyms.length === 1) {
    document.querySelector("#create-gym-select").value = gyms[0].id;
  }

  for (const card of gymCards.querySelectorAll(".gym-card")) {
    card.classList.toggle("selected", card.querySelector(".gym-card-details strong").textContent === gyms.find((gym) => gym.id === gymFilter.value)?.name);
  }
}

async function loadGyms() {
  try {
    const response = await fetch("/api/gyms", { headers: { Accept: "application/json" } });
    const data = await response.json();
    if (!response.ok) throw new Error("No se pudieron cargar los centros. Inténtalo de nuevo.");
    gyms = data.gyms;
    const activeGym = gyms.find((gym) => gym.id === initialGymId) ?? gyms[0];
    if (activeGym) {
      gymFilter.value = activeGym.id;
      localStorage.setItem("calendar-selected-gym", activeGym.id);
    }
    renderGyms();
  } catch (error) {
    gymCards.replaceChildren();
    const message = document.createElement("p");
    message.className = "gym-loading error";
    message.textContent = "No se pudieron cargar los centros. Inténtalo de nuevo.";
    gymCards.append(message);
  }
}

function renderServiceOptions(selectedId = "") {
  const serviceSelect = document.querySelector("#purchase-service");
  serviceSelect.replaceChildren();
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = services.length ? "Selecciona un servicio" : "Añade un servicio primero";
  serviceSelect.append(placeholder);
  serviceSelect.disabled = services.length === 0;

  for (const service of services) {
    const option = document.createElement("option");
    option.value = service.id;
    option.textContent = `${service.name} · ${Number(service.price).toFixed(2)} €/sesión`;
    serviceSelect.append(option);
  }
  if (selectedId && services.some((service) => service.id === selectedId)) {
    serviceSelect.value = selectedId;
  }
}

async function loadServices(selectedId = "") {
  const response = await fetch("/api/services", { headers: { Accept: "application/json" } });
  const data = await response.json();
  if (!response.ok) throw new Error("No se pudieron cargar los servicios. Inténtalo de nuevo.");
  services = data.services;
  renderServiceOptions(selectedId);
}

function formatCurrency(value) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(Number(value));
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function renderServiceHistory(data) {
  packageList.replaceChildren();
  bookingRows.replaceChildren();

  if (data.packages.length === 0) {
    const empty = document.createElement("p");
    empty.className = "history-empty";
    empty.textContent = "No hay sesiones asignadas. Añade un servicio para empezar.";
    packageList.append(empty);
  }

  data.packages.forEach((servicePackage) => {
    const card = document.createElement("article");
    card.className = "service-package-card";
    const heading = document.createElement("div");
    heading.className = "package-card-heading";
    const titleBlock = document.createElement("div");
    const title = document.createElement("h4");
    title.textContent = servicePackage.service.name;
    const date = document.createElement("p");
    date.textContent = `Contratado el ${formatDate(servicePackage.purchasedAt)}`;
    titleBlock.append(title, date);
    const payment = document.createElement("span");
    payment.className = `payment-badge payment-${servicePackage.paymentStatus}`;
    payment.textContent = paymentStatusLabels[servicePackage.paymentStatus];
    heading.append(titleBlock, payment);

    const metrics = document.createElement("div");
    metrics.className = "package-metrics";
    for (const [label, value] of [
      ["Sesiones incluidas", servicePackage.sessionsBought],
      ["Hechas", servicePackage.sessionsUsed],
      ["Próximas", servicePackage.sessionsScheduled],
      ["Disponibles", servicePackage.sessionsRemaining],
    ]) {
      const metric = document.createElement("div");
      metric.className = "package-metric";
      const metricValue = document.createElement("strong");
      metricValue.textContent = String(value);
      const metricLabel = document.createElement("span");
      metricLabel.textContent = label;
      metric.append(metricValue, metricLabel);
      metrics.append(metric);
    }

    const paymentLine = document.createElement("p");
    paymentLine.className = "package-payment-line";
    paymentLine.textContent = `${formatCurrency(servicePackage.totalAmount)} · ${paymentMethodLabels[servicePackage.paymentMethod]}`;
    if (servicePackage.notes) {
      const notes = document.createElement("p");
      notes.className = "package-notes";
      notes.textContent = servicePackage.notes;
      card.append(heading, metrics, paymentLine, notes);
    } else {
      card.append(heading, metrics, paymentLine);
    }

    if (servicePackage.sessionsRemaining > 0 && servicePackage.paymentStatus === "PAGADO") {
      const scheduleForm = document.createElement("form");
      scheduleForm.className = "schedule-session-form";
      scheduleForm.dataset.packageId = servicePackage.id;
      const dateInput = document.createElement("input");
      dateInput.type = "datetime-local";
      dateInput.name = "startTime";
      dateInput.required = true;
      dateInput.min = new Date(Date.now() + 60_000).toISOString().slice(0, 16);
      dateInput.setAttribute("aria-label", `Fecha de la próxima sesión de ${servicePackage.service.name}`);
      const scheduleButton = document.createElement("button");
      scheduleButton.className = "button button-outline";
      scheduleButton.type = "submit";
      scheduleButton.textContent = "Programar sesión";
      scheduleForm.append(dateInput, scheduleButton);
      card.append(scheduleForm);
    }

    packageList.append(card);
  });

  if (data.bookings.length === 0) {
    const empty = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 3;
    cell.className = "history-empty";
    cell.textContent = "No hay sesiones registradas. Programa una desde «Servicios contratados».";
    empty.append(cell);
    bookingRows.append(empty);
    return;
  }

  data.bookings.forEach((booking) => {
    const row = document.createElement("tr");
    const date = document.createElement("td");
    date.textContent = formatDateTime(booking.startTime);
    const service = document.createElement("td");
    service.textContent = booking.service.name;
    const attendance = document.createElement("td");
    const select = document.createElement("select");
    select.className = `attendance-select attendance-${booking.attendance}`;
    select.dataset.bookingId = booking.id;
    select.dataset.previousAttendance = booking.attendance;
    select.setAttribute("aria-label", `Asistencia a ${booking.service.name} del ${formatDateTime(booking.startTime)}`);
    for (const [value, label] of Object.entries(attendanceLabels)) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      option.selected = value === booking.attendance;
      select.append(option);
    }
    attendance.append(select);
    row.append(date, service, attendance);
    bookingRows.append(row);
  });
}

async function openClientHistory(client) {
  historyClientId = client.id;
  document.querySelector("#history-dialog-title").textContent = `${client.firstName} ${client.lastName}`;
  document.querySelector("#history-client-subtitle").textContent =
    "Sesiones, pagos y asistencias.";
  purchaseForm.reset();
  purchaseError.hidden = true;
  historyDialog.showModal();
  packageList.replaceChildren();
  const loading = document.createElement("p");
  loading.className = "history-empty";
  loading.textContent = "Cargando historial…";
  packageList.append(loading);
  try {
    await loadServices();
    const response = await fetch(`/api/clients/${encodeURIComponent(client.id)}/service-history`, {
      headers: { Accept: "application/json" },
    });
    const data = await response.json();
    if (!response.ok) throw new Error("No se pudo cargar el historial. Inténtalo de nuevo.");
    renderServiceHistory(data);
  } catch (error) {
    packageList.replaceChildren();
    const message = document.createElement("p");
    message.className = "history-empty error";
    message.textContent = "No se pudo cargar el historial. Inténtalo de nuevo.";
    packageList.append(message);
  }
}

function showToast(message, isError = false, action = null) {
  window.clearTimeout(toastTimer);
  toast.replaceChildren(document.createTextNode(message));
  toast.classList.toggle("error", isError);
  toast.classList.add("visible");
  if (action) {
    const actionButton = document.createElement("button");
    actionButton.className = "toast-action";
    actionButton.type = "button";
    actionButton.textContent = action.label;
    actionButton.addEventListener("click", action.onAction, { once: true });
    toast.append(actionButton);
  }
  toastTimer = window.setTimeout(() => {
    toast.classList.remove("visible");
    toast.replaceChildren();
  }, action ? 8000 : 3200);
}

function closeDialog() {
  createDialog.close();
  formError.hidden = true;
}

document.querySelector("#open-create").addEventListener("click", () => {
  createForm.reset();
  createForm.elements.gymId.value = gymFilter.value || gyms[0]?.id || "";
  formError.hidden = true;
  createDialog.showModal();
  createForm.elements.firstName.focus();
});
document.querySelector("#close-dialog").addEventListener("click", closeDialog);
document.querySelector("#cancel-create").addEventListener("click", closeDialog);
document.querySelector("#refresh-list").addEventListener("click", loadClients);
clientFilterButtons.forEach((button) => {
  button.addEventListener("click", () => setActiveFilter(button.dataset.filter));
});
document.querySelectorAll(".stat-card[data-filter]").forEach((button) => {
  button.addEventListener("click", () => setActiveFilter(button.dataset.filter));
});
document.querySelector("#manage-gyms").addEventListener("click", () => {
  gymForm.reset();
  gymFormError.hidden = true;
  gymDialog.showModal();
  gymForm.elements.name.focus();
});
document.querySelector("#close-gym-dialog").addEventListener("click", () => gymDialog.close());
document.querySelector("#cancel-gym").addEventListener("click", () => gymDialog.close());
document.querySelector("#close-history-dialog").addEventListener("click", () => historyDialog.close());
document.querySelector("#close-service-create").addEventListener("click", () => serviceCreateDialog.close());
document.querySelector("#cancel-service-create").addEventListener("click", () => serviceCreateDialog.close());
document.querySelector("#open-service-create").addEventListener("click", () => {
  serviceCreateForm.reset();
  serviceCreateError.hidden = true;
  serviceCreateDialog.showModal();
  serviceCreateForm.elements.name.focus();
});

searchInput.addEventListener("input", () => {
  clearSearchButton.hidden = !searchInput.value;
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(loadClients, 250);
});
clearSearchButton.addEventListener("click", () => {
  searchInput.value = "";
  clearSearchButton.hidden = true;
  searchInput.focus();
  loadClients();
});
gymFilter.addEventListener("change", () => {
  renderGyms();
  loadClients();
});

rows.addEventListener("change", async (event) => {
  const gymSelect = event.target.closest(".gym-client-select");
  if (gymSelect) {
    gymSelect.disabled = true;
    try {
      const response = await fetch(`/api/clients/${encodeURIComponent(gymSelect.dataset.clientId)}/gym`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ gymId: gymSelect.value }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error("No se pudo cambiar el centro. Inténtalo de nuevo.");
      showToast("Centro actualizado.");
      await Promise.all([loadGyms(), loadClients()]);
    } catch (error) {
      gymSelect.value = gymSelect.dataset.previousGymId;
      showToast("No se pudo cambiar el centro. Inténtalo de nuevo.", true);
    } finally {
      gymSelect.disabled = false;
    }
    return;
  }

  const select = event.target.closest(".status-select");
  if (!select) return;

  const previousStatus = select.dataset.previousStatus;
  select.disabled = true;
  try {
    const response = await fetch(`/api/clients/${encodeURIComponent(select.dataset.clientId)}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ status: select.value }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error("No se pudo cambiar el estado. Inténtalo de nuevo.");
    showToast("Estado del cliente actualizado.");
    await loadClients();
  } catch (error) {
    select.value = previousStatus;
    select.className = `status-select status-${select.value}`;
    showToast("No se pudo cambiar el estado. Inténtalo de nuevo.", true);
  } finally {
    select.disabled = false;
  }
});

bookingRows.addEventListener("change", async (event) => {
  const select = event.target.closest(".attendance-select");
  if (!select) return;

  select.disabled = true;
  try {
    const response = await fetch(`/api/bookings/${encodeURIComponent(select.dataset.bookingId)}/attendance`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ attendance: select.value }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error("No se pudo guardar la asistencia. Inténtalo de nuevo.");
    showToast("Asistencia actualizada.");
    const client = { id: historyClientId, ...historyDialogClientName() };
    await openClientHistory(client);
  } catch (error) {
    select.value = select.dataset.previousAttendance;
    showToast("No se pudo guardar la asistencia. Inténtalo de nuevo.", true);
  } finally {
    select.disabled = false;
  }
});

function historyDialogClientName() {
  const [firstName, ...lastNameParts] = document.querySelector("#history-dialog-title").textContent.split(" ");
  return { firstName, lastName: lastNameParts.join(" ") };
}

packageList.addEventListener("submit", async (event) => {
  const form = event.target.closest(".schedule-session-form");
  if (!form) return;
  event.preventDefault();
  const submit = form.querySelector("button[type='submit']");
  submit.disabled = true;
  try {
    const startTime = new Date(new FormData(form).get("startTime")).toISOString();
    const response = await fetch(`/api/service-packages/${encodeURIComponent(form.dataset.packageId)}/bookings`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ startTime }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error("No se pudo programar la sesión. Inténtalo de nuevo.");
    showToast("Sesión programada.");
    await openClientHistory({ id: historyClientId, ...historyDialogClientName() });
  } catch (error) {
    showToast("No se pudo programar la sesión. Inténtalo de nuevo.", true);
  } finally {
    submit.disabled = false;
  }
});

createForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  formError.hidden = true;

  if (!createForm.reportValidity()) return;

  const formData = new FormData(createForm);
  const client = Object.fromEntries(formData.entries());
  submitButton.disabled = true;
  submitButton.textContent = "Guardando…";

  try {
    const response = await fetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(client),
    });
    const data = await response.json();
    if (!response.ok) throw new Error("No se pudo crear el cliente. Revisa los datos e inténtalo de nuevo.");

    closeDialog();
    showToast("Cliente añadido.");
    searchInput.value = "";
    clearSearchButton.hidden = true;
    gymFilter.value = "";
    await loadGyms();
    await loadClients();
  } catch (error) {
    formError.textContent = "No se pudo crear el cliente. Revisa los datos e inténtalo de nuevo.";
    formError.hidden = false;
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Crear cliente";
  }
});

purchaseForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  purchaseError.hidden = true;
  if (!purchaseForm.reportValidity() || !historyClientId) return;

  purchaseSubmit.disabled = true;
  purchaseSubmit.textContent = "Guardando…";
  try {
    const body = Object.fromEntries(new FormData(purchaseForm).entries());
    body.sessionsBought = Number(body.sessionsBought);
    body.totalAmount = Number(body.totalAmount);
    const response = await fetch(`/api/clients/${encodeURIComponent(historyClientId)}/service-packages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) throw new Error("No se pudieron añadir las sesiones. Inténtalo de nuevo.");

    purchaseForm.reset();
    await loadServices(body.serviceId);
    await openClientHistory({ id: historyClientId, ...historyDialogClientName() });
    showToast("Sesiones añadidas.");
  } catch (error) {
    purchaseError.textContent = "No se pudieron añadir las sesiones. Inténtalo de nuevo.";
    purchaseError.hidden = false;
  } finally {
    purchaseSubmit.disabled = false;
    purchaseSubmit.textContent = "Guardar servicio";
  }
});

serviceCreateForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  serviceCreateError.hidden = true;
  if (!serviceCreateForm.reportValidity()) return;

  serviceCreateSubmit.disabled = true;
  serviceCreateSubmit.textContent = "Guardando…";
  try {
    const body = Object.fromEntries(new FormData(serviceCreateForm).entries());
    body.durationMin = Number(body.durationMin);
    body.price = Number(body.price);
    const response = await fetch("/api/services", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) throw new Error("No se pudo crear el servicio. Inténtalo de nuevo.");

    serviceCreateDialog.close();
    await loadServices(data.service.id);
    showToast("Servicio creado.");
  } catch (error) {
    serviceCreateError.textContent = "No se pudo crear el servicio. Inténtalo de nuevo.";
    serviceCreateError.hidden = false;
  } finally {
    serviceCreateSubmit.disabled = false;
    serviceCreateSubmit.textContent = "Crear servicio";
  }
});

gymForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  gymFormError.hidden = true;
  if (!gymForm.reportValidity()) return;

  const gymData = Object.fromEntries(new FormData(gymForm).entries());
  gymSubmitButton.disabled = true;
  gymSubmitButton.textContent = "Guardando…";
  try {
    const response = await fetch("/api/gyms", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(gymData),
    });
    const data = await response.json();
    if (!response.ok) throw new Error("No se pudo guardar el centro. Inténtalo de nuevo.");

    gymDialog.close();
    await loadGyms();
    gymFilter.value = data.gym.id;
    renderGyms();
    await loadClients();
    createForm.elements.gymId.value = data.gym.id;
    showToast("Centro añadido.");
  } catch (error) {
    gymFormError.textContent = "No se pudo guardar el centro. Inténtalo de nuevo.";
    gymFormError.hidden = false;
  } finally {
    gymSubmitButton.disabled = false;
    gymSubmitButton.textContent = "Guardar centro";
  }
});


function sessionBadge(value) {
  const minutes = Math.round((new Date(value).getTime() - Date.now()) / 60000);
  if (minutes <= 0) return "Ahora";
  if (minutes < 60) return `En ${minutes} min`;
  return `${new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit" }).format(new Date(value))} h`;
}

function getClientSignal(client, now) {
  if (client.pendingPayments > 0) {
    return { type: "urgent", text: "Pago pendiente", icon: "payment" };
  }
  if (client.servicePackageCount === 0 && client.status === "ACTIVO") {
    return { type: "warning", text: "Sin sesiones contratadas", icon: "sessions" };
  }
  if (Number.isFinite(client.remainingSessions) && client.remainingSessions <= 2) {
    return {
      type: "warning",
      text: `Le quedan ${client.remainingSessions} sesiones`,
      icon: "sessions",
    };
  }
  if (!client.nextSession?.startTime) return null;

  const sessionDate = new Date(client.nextSession.startTime);
  if (Number.isNaN(sessionDate.getTime())) return null;
  const time = new Intl.DateTimeFormat("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(sessionDate);
  const isToday =
    sessionDate.getFullYear() === now.getFullYear() &&
    sessionDate.getMonth() === now.getMonth() &&
    sessionDate.getDate() === now.getDate();

  if (isToday) return { type: "ok", text: `Hoy a las ${time}`, icon: "calendar" };
  if (sessionDate > now) {
    const day = new Intl.DateTimeFormat("es-ES", {
      day: "numeric",
      month: "short",
    }).format(sessionDate);
    return { type: "neutral", text: `Próxima: ${day} · ${time}`, icon: "calendar" };
  }
  return null;
}

function getClientAvatarTone(client) {
  const name = `${client.firstName} ${client.lastName}`.trim().toLocaleLowerCase("es");
  let hash = 0;
  for (const character of name) {
    hash = (hash * 31 + character.codePointAt(0)) >>> 0;
  }
  return hash % 6;
}

function renderClient(client) {
  const card = document.createElement("article");
  card.className = "client-card client-card-modern";
  card.tabIndex = 0;
  card.setAttribute("role", "button");
  const signal = getClientSignal(client, new Date());
  if (signal) card.classList.add(`client-card-signal-${signal.type}`);
  const clientName = `${client.firstName} ${client.lastName}`.trim();
  const centerName = client.gym?.name || "Sin centro";
  card.setAttribute(
    "aria-label",
    `Ver ficha de ${clientName}${signal ? `. ${signal.text}` : ""}. Centro: ${centerName}.`,
  );
  const identity = document.createElement("div");
  identity.className = "client-card-identity";
  const avatar = document.createElement("span");
  avatar.className = `client-avatar client-avatar-tone-${getClientAvatarTone(client)}`;
  avatar.setAttribute("aria-hidden", "true");
  avatar.textContent = `${client.firstName?.trim().charAt(0) ?? ""}${client.lastName?.trim().charAt(0) ?? ""}`.toLocaleUpperCase("es");
  const nameBlock = document.createElement("span");
  const name = document.createElement("strong");
  name.className = "client-card-name";
  name.textContent = clientName;
  nameBlock.append(name);
  identity.append(avatar, nameBlock);

  const details = document.createElement("div");
  details.className = "client-card-details";
  if (signal) {
    const signalLine = document.createElement("div");
    signalLine.className = `client-card-signal signal-${signal.type}`;
    const signalIcon = document.createElement("span");
    signalIcon.className = "client-signal-icon";
    signalIcon.setAttribute("aria-hidden", "true");
    const iconPaths = {
      payment: '<path d="M3 6h18v12H3zM3 10h18m-13 4h3"/>',
      sessions: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
      calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18"/>',
    };
    signalIcon.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[signal.icon]}</svg>`;
    const signalText = document.createElement("span");
    signalText.textContent = signal.text;
    signalLine.append(signalIcon, signalText);
    details.append(signalLine);
  }

  const center = document.createElement("span");
  center.className = "client-card-center";
  center.textContent = centerName;
  details.append(center);
  card.append(identity, details);

  const open = () => { window.location.href = getClientProfileHref(client.id); };
  card.addEventListener("click", open);
  card.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(); } });
  return card;
}

const clientDetailDialog = document.querySelector("#client-detail-dialog");
const objectiveForm = document.querySelector("#objective-form");
const objectiveInput = document.querySelector("#objective-input");
const measurementForm = document.querySelector("#measurement-form");
const measurementDate = document.querySelector("#measurement-date");
const measurementSummary = document.querySelector("#measurement-summary");
const measurementHistory = document.querySelector("#measurement-history");
const measurementError = document.querySelector("#measurement-error");
const progressStatus = document.querySelector("#progress-status");
let detailClient;
let progressClientId;
const progressMetrics = [["weight", "Peso", "kg"], ["hip", "Cadera", "cm"], ["waist", "Cintura", "cm"], ["leg", "Pierna", "cm"], ["chest", "Pecho", "cm"], ["arm", "Brazo", "cm"]];
function measurementValue(value, unit) { return value === null || value === undefined ? "—" : `${Number(value).toLocaleString("es-ES", { maximumFractionDigits: 2 })} ${unit}`; }
function renderProgress(progress) {
  const measurements = progress.measurements || [];
  const first = measurements[0];
  const latest = measurements.at(-1);
  objectiveInput.value = progress.client.objective || "";
  progressStatus.textContent = measurements.length ? `${measurements.length} ${measurements.length === 1 ? "registro" : "registros"}` : "Sin registros";
  measurementSummary.replaceChildren();
  if (!latest) {
    const empty = document.createElement("p");
    empty.className = "progress-empty";
    empty.textContent = "Todavía no hay mediciones. Añade la primera para empezar a visualizar su evolución.";
    measurementSummary.append(empty);
  } else {
    for (const [key, label, unit] of progressMetrics) {
      const current = latest[key];
      const previous = first?.[key];
      const delta = current !== null && current !== undefined && previous !== null && previous !== undefined ? current - previous : null;
      const card = document.createElement("div");
      card.className = "measurement-card";
      const deltaText = delta === null ? "Sin comparación" : `${delta > 0 ? "+" : ""}${Number(delta).toLocaleString("es-ES", { maximumFractionDigits: 2 })} ${unit}`;
      card.innerHTML = `<span>${label}</span><strong>${measurementValue(current, unit)}</strong><small class="${delta !== null && delta < 0 ? "positive-change" : ""}">${deltaText}</small>`;
      measurementSummary.append(card);
    }
  }
  measurementHistory.replaceChildren();
  if (measurements.length) {
    const title = document.createElement("h4");
    title.textContent = "Historial de mediciones";
    measurementHistory.append(title);
    for (const measurement of [...measurements].reverse()) {
      const row = document.createElement("article");
      row.className = "measurement-history-row";
      const date = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${measurement.measuredAt}T00:00:00Z`));
      const values = progressMetrics.filter(([key]) => measurement[key] !== null && measurement[key] !== undefined).map(([key, label, unit]) => `${label}: ${measurementValue(measurement[key], unit)}`).join(" · ");
      row.innerHTML = `<div><strong>${date}</strong><small>${values || "Sin valores"}</small></div>${measurement.notes ? `<p>${escapeText(measurement.notes)}</p>` : ""}`;
      measurementHistory.append(row);
    }
  }
}
async function loadClientProgress(client) {
  progressClientId = client.id;
  progressStatus.textContent = "Cargando…";
  try {
    const response = await fetch(`/api/clients/${encodeURIComponent(client.id)}/progress`, { headers: { Accept: "application/json" } });
    const data = await response.json();
    if (!response.ok) throw new Error("No se pudieron cargar las medidas. Inténtalo de nuevo.");
    if (progressClientId === client.id) renderProgress(data);
  } catch (error) {
    progressStatus.textContent = "No disponible";
    measurementSummary.replaceChildren();
    const message = document.createElement("p");
    message.className = "progress-empty error";
    message.textContent = "No se pudieron cargar las medidas. Inténtalo de nuevo.";
    measurementSummary.append(message);
  }
}
function openClientDetail(client) {
  detailClient = client;
  document.querySelector("#client-detail-title").textContent = `${client.firstName} ${client.lastName}`;
  document.querySelector("#client-detail-status").textContent = statusLabels[client.status] ?? "Cliente";
  document.querySelector("#detail-email").textContent = client.email || "Sin email";
  document.querySelector("#detail-phone").textContent = client.phone || "Sin teléfono";
  document.querySelector("#detail-gym").textContent = client.gym?.name || "Sin centro";
  document.querySelector("#detail-session").textContent = client.nextSession ? `${sessionBadge(client.nextSession.startTime)} · ${client.nextSession.service?.name || "Sesión"}` : "Sin próxima sesión";
  document.querySelector("#detail-notes").textContent = client.clientNotes?.[0]?.content || client.notes || "No hay notas.";
  document.querySelector("#detail-routine").textContent = client.trainingPlans?.[0]?.name || (client.servicePackageCount ? `${client.remainingSessions} sesiones disponibles.` : "No tiene sesiones asignadas. Añade un servicio desde «Sesiones y pagos».");
  objectiveInput.value = client.objective || "";
  measurementForm.reset();
  measurementDate.value = new Date().toISOString().slice(0, 10);
  measurementError.hidden = true;
  clientDetailDialog.showModal();
  loadClientProgress(client);
}
document.querySelector("#close-client-detail").addEventListener("click", () => clientDetailDialog.close());
document.querySelector("#open-detail-history").addEventListener("click", () => { clientDetailDialog.close(); if (detailClient) openClientHistory(detailClient); });
objectiveForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!progressClientId) return;
  const button = objectiveForm.querySelector("button");
  button.disabled = true;
  try {
    const response = await fetch(`/api/clients/${encodeURIComponent(progressClientId)}/objective`, { method: "PATCH", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ objective: objectiveInput.value.trim() }) });
    const data = await response.json();
    if (!response.ok) throw new Error("No se pudo guardar el objetivo. Inténtalo de nuevo.");
    if (detailClient) detailClient.objective = data.client.objective;
    showToast("Objetivo guardado.");
  } catch (error) { showToast("No se pudo guardar el objetivo. Inténtalo de nuevo.", true); }
  finally { button.disabled = false; }
});
measurementForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  measurementError.hidden = true;
  if (!progressClientId || !measurementForm.reportValidity()) return;
  const body = Object.fromEntries(new FormData(measurementForm).entries());
  for (const key of ["weight", "hip", "waist", "leg", "chest", "arm"]) if (body[key] === "") delete body[key]; else if (body[key] !== undefined) body[key] = Number(body[key]);
  const button = measurementForm.querySelector("button[type='submit']");
  button.disabled = true;
  try {
    const response = await fetch(`/api/clients/${encodeURIComponent(progressClientId)}/measurements`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok) throw new Error("No se pudo guardar la medida. Inténtalo de nuevo.");
    measurementForm.reset();
    measurementDate.value = new Date().toISOString().slice(0, 10);
    await loadClientProgress(detailClient || { id: progressClientId });
    showToast("Medición guardada.");
  } catch (error) { measurementError.textContent = "No se pudo guardar la medida. Inténtalo de nuevo."; measurementError.hidden = false; }
  finally { button.disabled = false; }
});
async function updateBookingAttendance(bookingId, attendance) {
  const response = await fetch(`/api/bookings/${encodeURIComponent(bookingId)}/attendance`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ attendance }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error("No se pudo actualizar la llegada.");
  return data.booking;
}

async function undoArrival(client) {
  const booking = client.nextSession;
  if (!booking?.id || !arrivedBookings.has(booking.id)) return;
  showToast("Anulando llegada…");
  try {
    await updateBookingAttendance(booking.id, "PENDIENTE");
    arrivedBookings.delete(booking.id);
    booking.attendance = "PENDIENTE";
    booking.attendedAt = null;
    renderActiveClientView();
    showToast("Llegada anulada.");
  } catch (error) {
    showToast("No se pudo anular la llegada. Inténtalo de nuevo.", true);
  }
}

async function registerArrival(client, button) {
  const booking = client.nextSession;
  if (!booking?.id) {
    showToast("No hay una sesión pendiente para registrar la llegada.", true);
    return false;
  }
  button.disabled = true;
  try {
    const updatedBooking = await updateBookingAttendance(booking.id, "ASISTIO");
    const attendedAt = updatedBooking.attendedAt || new Date().toISOString();
    arrivedBookings.set(booking.id, { attendedAt });
    booking.attendance = "ASISTIO";
    booking.attendedAt = attendedAt;
    renderActiveClientView(booking.id);
    showToast("Llegada registrada.", false, {
      label: "Deshacer",
      onAction: () => undoArrival(client),
    });
    return true;
  } catch (error) {
    showToast("No se pudo registrar la llegada. Inténtalo de nuevo.", true);
    return false;
  } finally {
    button.disabled = false;
  }
}

document.querySelector("#detail-checkin").addEventListener("click", async (event) => {
  if (!detailClient?.nextSession?.id) {
    showToast("No hay una sesión pendiente para registrar la llegada.", true);
    return;
  }
  const registered = await registerArrival(detailClient, event.currentTarget);
  if (registered) clientDetailDialog.close();
});

syncTimelineTimer();
syncFilterControls();
loadGyms().then(loadClients);
