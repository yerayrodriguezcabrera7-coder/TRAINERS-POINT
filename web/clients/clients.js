let currentUserRole = null;
async function fetchUserRole() {
  try {
    const res = await fetch("/api/me");
    if (res.ok) {
      const me = await res.json();
      currentUserRole = me.role;
      if (currentUserRole === 'TRAINER') {
        const createBtn = document.querySelector("#open-create");
        if (createBtn) createBtn.hidden = true;
      }
    }
  } catch (_) {}
}
fetchUserRole();
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
const clientFilterButtons = [...document.querySelectorAll(".filter-chip")];
const validFilters = new Set(["all", "attention", "pending-payment", "no-sessions", "low-sessions", "inactive"]);
const initialFilter = new URLSearchParams(window.location.search).get("filtro");
const explicitlySelectedToday = sessionStorage.getItem("clients-today-filter-explicit") === "true";
const createDialog = document.querySelector("#create-dialog");
const createForm = document.querySelector("#create-form");
const submitButton = document.querySelector("#submit-create");
const formError = document.querySelector("#form-error");
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
const intakeSteps = [...document.querySelectorAll(".intake-step")];
const intakeStepLabel = document.querySelector("#intake-step-label");
const intakeProgressValue = document.querySelector("#intake-progress-value");
const intakeNextButton = document.querySelector("#intake-next");
const intakeBackButton = document.querySelector("#intake-back");
const intakeCreateOnlyButton = document.querySelector("#create-client-only");
const proposalTable = document.querySelector("#proposal-table");
const proposalReason = document.querySelector("#proposal-reason");
const proposalEmpty = document.querySelector("#proposal-empty");
let intakeStep = 0;
let intakeDirty = false;
let proposalSuggestion;
const duplicateChecks = { phone: 0, email: 0 };
let searchTimer;
let toastTimer;
let refreshController;
let services = [];
let historyClientId;
let clientsData = [];
let activeFilter = validFilters.has(initialFilter) && (initialFilter !== "today" || explicitlySelectedToday)
  ? initialFilter
  : "all";
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

const proposalServiceKeywords = [
  { goals: ["ganar fuerza", "preparar una prueba"], keywords: ["fuerza", "rendimiento", "personal"] },
  { goals: ["ganar masa muscular"], keywords: ["musculación", "hipertrofia", "fuerza"] },
  { goals: ["perder grasa"], keywords: ["pérdida", "composición", "personal", "funcional"] },
  { goals: ["salud y movilidad"], keywords: ["movilidad", "salud", "funcional"] },
];
const proposalSessionOptions = [1, 5, 10];

function buildProposal(client, availableServices) {
  const activeServices = availableServices.filter((service) => service && service.id && Number.isFinite(Number(service.price)));
  if (!activeServices.length) return { service: null, options: [], reason: "Aún no hay servicios creados." };

  const objective = String(client.objective || "").trim();
  const normalizedObjective = objective.toLocaleLowerCase("es");
  const match = proposalServiceKeywords.find((entry) =>
    entry.goals.some((goal) => normalizedObjective.includes(goal)),
  );
  const service = match
    ? activeServices.find((item) => match.keywords.some((keyword) => item.name.toLocaleLowerCase("es").includes(keyword)))
    : null;
  const selectedService = service || activeServices[0];
  const frequency = Number(client.sessionsPerWeek) || 1;
  const preferredSessions = proposalSessionOptions.reduce((best, count) =>
    Math.abs(count - frequency * 4.5) < Math.abs(best - frequency * 4.5) ? count : best,
  );
  return {
    service: selectedService,
    options: proposalSessionOptions.map((sessions) => ({
      sessions,
      durationMin: Number(selectedService.durationMin) * sessions,
      totalAmount: Number(selectedService.price) * sessions,
      selected: sessions === preferredSessions,
    })),
    reason: service
      ? `Encaja con ${objective || "el objetivo indicado"}.`
      : `No hay una coincidencia exacta. Proponemos ${selectedService.name}.`,
  };
}

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

function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
  message.textContent = searchInput.value
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
  timelineTimer?.();
  timelineTimer = activeFilter === "today" ? window.TrainersPoint.poll(updateTimelineMarkers, 15000) : undefined;
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
    const hasFilters = searchInput.value || activeFilter !== "all";
    renderEmpty(
      hasFilters ? "No hay clientes con estos filtros" : "Aún no hay clientes",
      hasFilters
        ? "Prueba con otro nombre o cambia los filtros."
        : "Pulsa «Nuevo cliente» para añadir el primero.",
    );
    return;
  }
  for (const [brand, label] of [["TRAINERS_POINT", "Trainers Point"], ["COBOSU", "Cobosu"]]) {
    const group = document.createElement("section"); group.className = "client-brand-group"; group.dataset.brand = brand;
    const clients = visibleClients.filter(client => (client.brand || "TRAINERS_POINT") === brand);
    const heading = document.createElement("h3"); heading.textContent = `${label} · ${clients.length} ${clients.length === 1 ? "cliente" : "clientes"}`; group.append(heading);
    const list = document.createElement("div"); list.className = "client-brand-list";
    clients.forEach((client,index) => list.append(renderClient(client,index)));
    if (!clients.length) { const empty = document.createElement("p"); empty.className = "list-message"; empty.textContent = "No hay clientes de esta marca con los filtros actuales."; list.append(empty); }
    group.append(list); rows.append(group);
  }
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
  if (filter === "today") sessionStorage.setItem("clients-today-filter-explicit", "true");
  else sessionStorage.removeItem("clients-today-filter-explicit");
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
  if (!currentUserRole) await fetchUserRole();
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

function renderPurchaseCardsGrid(selectedId = "") {
  const container = document.querySelector("#purchase-cards-grid");
  if (!container) return;
  container.replaceChildren();

  if (!services.length) {
    container.innerHTML = '<p class="bono-cards-loading">No hay servicios disponibles.</p>';
    return;
  }

  services.forEach((service) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = `bono-select-card${service.id === selectedId ? " is-selected" : ""}`;
    card.dataset.serviceId = service.id;

    const topRow = document.createElement("div");
    topRow.className = "bono-card-top";
    const mod = document.createElement("span");
    mod.className = `bono-card-modality${service.modality === "DUAL" ? " modality-dual" : ""}`;
    mod.textContent = service.modality === "DUAL" ? "Dúo / Pareja" : "Individual";
    const check = document.createElement("span");
    check.className = "bono-card-check";
    check.textContent = "✓ Seleccionado";
    topRow.append(mod, check);

    const name = document.createElement("h4");
    name.className = "bono-card-name";
    name.textContent = service.name;

    const priceRow = document.createElement("div");
    priceRow.className = "bono-card-price-row";
    const price = document.createElement("strong");
    price.className = "bono-card-price";
    price.textContent = formatCurrency(service.price);
    const unitRate = document.createElement("span");
    unitRate.className = "bono-card-unit-rate";
    const rate = service.trainingCount > 0 ? (Number(service.price) / service.trainingCount).toFixed(2) : Number(service.price).toFixed(2);
    unitRate.textContent = `${rate} €/ses.`;
    priceRow.append(price, unitRate);

    const meta = document.createElement("div");
    meta.className = "bono-card-meta";
    meta.innerHTML = `<span>${service.trainingCount} sesiones</span> · <span>${service.durationMin || 60} min</span> · <span class="bono-card-validity-tag">${service.validityWeeks || 4} semanas</span>`;

    card.append(topRow, name, priceRow, meta);

    card.addEventListener("click", () => {
      document.querySelectorAll("#purchase-cards-grid .bono-select-card").forEach((c) => c.classList.remove("is-selected"));
      card.classList.add("is-selected");
      if (purchaseServiceSelect) {
        purchaseServiceSelect.value = service.id;
        purchaseServiceSelect.dispatchEvent(new Event("change"));
      }
    });

    container.append(card);
  });
}

function renderServiceOptions(selectedId = "") {
  renderPurchaseCardsGrid(selectedId);
  const serviceSelect = document.querySelector("#purchase-service");
  if (!serviceSelect) return;
  serviceSelect.replaceChildren();
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = services.length ? "Selecciona un servicio" : "Añade un servicio primero";
  serviceSelect.append(placeholder);

  for (const service of services) {
    const option = document.createElement("option");
    option.value = service.id;
    const modalityText = service.modality === "DUAL" ? " [Dúo]" : " [Individual]";
    option.textContent = `${service.name}${modalityText} — ${service.trainingCount} ses. · ${formatCurrency(service.price)}`;
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

async function addClientServicePackage(clientId, body) {
  purchaseForm.dataset.requestKey ||= crypto.randomUUID();body.requestKey=purchaseForm.dataset.requestKey;
  const response = await fetch(`/api/clients/${encodeURIComponent(clientId)}/service-packages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "No se pudieron añadir las sesiones. Inténtalo de nuevo.");
  return data;
}

async function saveClientMeasurement(clientId, body) {
  const response = await fetch(`/api/clients/${encodeURIComponent(clientId)}/measurements`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "No se pudo guardar la medida. Inténtalo de nuevo.");
  return data;
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
  purchaseForm.hidden = currentUserRole === "TRAINER" || client.brand === "COBOSU";
  historyClientId = client.id;
  document.querySelector("#history-dialog-title").textContent = `${client.firstName} ${client.lastName}`;
  document.querySelector("#history-client-subtitle").textContent =
    "Sesiones, pagos y asistencias.";
  purchaseForm.reset();
  delete purchaseForm.dataset.requestKey;
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
    if (action.href) {
      const actionLink = document.createElement("a");
      actionLink.className = "toast-action";
      actionLink.href = action.href;
      actionLink.textContent = action.label;
      toast.append(actionLink);
    } else {
      const actionButton = document.createElement("button");
      actionButton.className = "toast-action";
      actionButton.type = "button";
      actionButton.textContent = action.label;
      actionButton.addEventListener("click", action.onAction, { once: true });
      toast.append(actionButton);
    }
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

function intakeDraftHasValues() {
  return [...createForm.querySelectorAll("input, select, textarea")].some((control) => {
    if (control.type === "checkbox" || control.type === "radio") return control.checked;
    return Boolean(control.value);
  });
}

function requestCloseCreateDialog() {
  if (intakeDirty && intakeDraftHasValues() &&
      !window.confirm("Hay datos sin guardar. ¿Quieres descartarlos?")) return;
  intakeDirty = false;
  closeDialog();
}

function updateIntakeStep(nextStep, focus = true) {
  intakeStep = Math.max(0, Math.min(3, nextStep));
  intakeSteps.forEach((section, index) => {
    section.hidden = index !== intakeStep;
  });
  document.querySelectorAll("[data-intake-nav]").forEach((button) => {
    const index = Number(button.dataset.intakeNav);
    if (index === intakeStep) button.setAttribute("aria-current", "step");
    else button.removeAttribute("aria-current");
    button.disabled = index > intakeStep;
  });
  intakeStepLabel.textContent = `Paso ${intakeStep + 1} de 4`;
  intakeProgressValue.style.width = `${((intakeStep + 1) / 4) * 100}%`;
  intakeBackButton.hidden = intakeStep === 0;
  document.querySelector("#cancel-create").hidden = intakeStep === 3;
  intakeNextButton.hidden = intakeStep === 3;
  intakeCreateOnlyButton.hidden = intakeStep !== 3;
  submitButton.hidden = intakeStep !== 3 || createForm.elements.namedItem("brand").value === "COBOSU";
  if (focus) {
    requestAnimationFrame(() => {
      const firstField = intakeSteps[intakeStep].querySelector(
        'input:not([type="hidden"]), select, textarea',
      );
      firstField?.focus();
    });
  }
}

function validateIntakeStep(step) {
  formError.hidden = true;
  intakeSteps[step].querySelectorAll("[data-field-error]").forEach((error) => {
    const control = createForm.elements.namedItem(error.dataset.fieldError);
    error.hidden = true;
    error.textContent = "";
    control?.removeAttribute("aria-invalid");
  });
  const requiredByStep = step === 0
    ? ["firstName", "lastName", "phone", "email"]
    : step === 2
      ? ["consentData"]
      : [];
  const messages = {
    firstName: "Falta el nombre.",
    lastName: "Faltan los apellidos.",
    phone: "Falta el teléfono.",
    email: "Revisa el correo electrónico.",
    consentData: "Confirma el uso de datos personales.",
  };
  for (const name of requiredByStep) {
    const control = createForm.elements.namedItem(name);
    const fieldError = createForm.querySelector(`[data-field-error="${CSS.escape(name)}"]`);
    if (!control.value && control.type !== "checkbox") {
      fieldError.textContent = messages[name];
      fieldError.hidden = false;
      control.setAttribute("aria-invalid", "true");
      control.focus();
      return false;
    }
    if (control.type === "checkbox" && !control.checked) {
      fieldError.textContent = messages[name];
      fieldError.hidden = false;
      control.setAttribute("aria-invalid", "true");
      control.focus();
      return false;
    }
    if (!control.checkValidity()) {
      fieldError.textContent = messages[name];
      fieldError.hidden = false;
      control.setAttribute("aria-invalid", "true");
      control.focus();
      return false;
    }
  }
  return true;
}

function intakeObjective() {
  const selected = [...createForm.querySelectorAll('input[name="objectiveChoice"]:checked')]
    .map((input) => input.value)
    .filter((value) => value !== "Otro");
  if (createForm.elements.namedItem("objectiveOther").value.trim() &&
      createForm.querySelector("#objective-other-toggle").checked) {
    selected.push(createForm.elements.namedItem("objectiveOther").value.trim());
  }
  return selected.join(" y ");
}

function intakeDraft() {
  const form = createForm;
  const checked = (name) => [...form.querySelectorAll(`input[name="${name}"]:checked`)].map((input) => input.value);
  const localPreference = form.elements.namedItem("firstSessionPreference").value;
  return {
    firstName: form.elements.namedItem("firstName").value.trim(),
    lastName: form.elements.namedItem("lastName").value.trim(),
    email: form.elements.namedItem("email").value.trim(),
    phone: form.elements.namedItem("phone").value.trim(),
    dni: form.elements.namedItem("dni").value.trim(),
    address: form.elements.namedItem("address").value.trim(),
    brand: form.elements.namedItem("brand").value,
    preferredName: form.elements.namedItem("preferredName").value.trim(),
    birthDate: form.elements.namedItem("birthDate").value,
    objective: intakeObjective(),
    sex: form.querySelector('input[name="sex"]:checked')?.value || null,
    source: form.querySelector('input[name="source"]:checked')?.value || null,
    sourceDetail: form.elements.namedItem("sourceDetail").value.trim(),
    contactPreference: form.elements.namedItem("contactPreference").value || null,
    contactSlot: form.elements.namedItem("contactSlot").value || null,
    notes: form.elements.namedItem("notes").value.trim(),
    injuries: checked("injuries").length ? checked("injuries") : null,
    injuryNotes: form.elements.namedItem("injuryNotes").value.trim(),
    availability: checked("availabilityDay").length || checked("availabilitySlot").length
      ? { days: checked("availabilityDay"), slots: checked("availabilitySlot") }
      : null,
    firstSessionPreference: localPreference ? new Date(localPreference).toISOString() : null,
    consentData: form.elements.namedItem("consentData").checked ? new Date().toISOString() : null,
    consentMarketing: form.elements.namedItem("consentMarketing").checked ? new Date().toISOString() : null,
    consentPhotos: form.elements.namedItem("consentPhotos").checked ? new Date().toISOString() : null,
  };
}

function formatProposalDuration(durationMin) {
  const hours = Math.floor(durationMin / 60);
  const minutes = durationMin % 60;
  return `${hours ? `${hours} h` : ""}${hours && minutes ? " " : ""}${minutes ? `${minutes} min` : ""}` || "0 min";
}

function renderProposal() {
  proposalTable.replaceChildren();
  if (intakeDraft().brand === "COBOSU") {
    proposalReason.textContent = "Los clientes Cobosu adquieren sus bonos desde la app. Aquí solo se crea la ficha.";
    proposalEmpty.hidden = true; intakeCreateOnlyButton.disabled = false; submitButton.disabled = true; return;
  }
  const proposal = buildProposal(intakeDraft(), services);
  proposalSuggestion = proposal;
  proposalReason.textContent = proposal.service ? proposal.reason : "";
  proposalEmpty.hidden = Boolean(proposal.service);
  intakeCreateOnlyButton.disabled = false;
  submitButton.disabled = !proposal.service;
  if (!proposal.service) return;

  for (const option of proposal.options) {
    const row = document.createElement("article");
    row.className = "proposal-row";
    row.dataset.proposalSessions = String(option.sessions);
    const choiceLabel = document.createElement("label");
    choiceLabel.className = "proposal-choice";
    const choice = document.createElement("input");
    choice.type = "radio";
    choice.name = "proposalChoice";
    choice.value = String(option.sessions);
    choice.checked = option.selected;
    const choiceText = document.createElement("span");
    choiceText.textContent = option.selected ? "Principal" : "Opción";
    choiceLabel.append(choice, choiceText);

    const serviceLabel = document.createElement("label");
    serviceLabel.className = "proposal-service";
    const serviceCaption = document.createElement("span");
    serviceCaption.textContent = "Servicio";
    const serviceSelect = document.createElement("select");
    serviceSelect.name = "proposalServiceId";
    serviceSelect.setAttribute("aria-label", `Servicio para la opción de ${option.sessions} sesiones`);
    for (const service of services) {
      const item = document.createElement("option");
      item.value = service.id;
      item.textContent = service.name;
      item.selected = service.id === proposal.service.id;
      serviceSelect.append(item);
    }
    serviceLabel.append(serviceCaption, serviceSelect);

    const sessionsLabel = document.createElement("label");
    sessionsLabel.className = "proposal-sessions";
    const sessionsCaption = document.createElement("span");
    sessionsCaption.textContent = "Sesiones";
    const sessionsInput = document.createElement("input");
    sessionsInput.name = "proposalSessions";
    sessionsInput.type = "number";
    sessionsInput.min = "1";
    sessionsInput.max = "500";
    sessionsInput.step = "1";
    sessionsInput.value = String(option.sessions);
    sessionsInput.setAttribute("aria-label", `Número de sesiones para esta opción`);
    sessionsLabel.append(sessionsCaption, sessionsInput);

    const duration = document.createElement("div");
    duration.className = "proposal-duration";
    const durationCaption = document.createElement("span");
    durationCaption.textContent = "Duración total";
    const durationValue = document.createElement("strong");
    durationValue.textContent = formatProposalDuration(option.durationMin);
    duration.append(durationCaption, durationValue);

    const amountLabel = document.createElement("label");
    amountLabel.className = "proposal-amount";
    const amountCaption = document.createElement("span");
    amountCaption.textContent = "Precio total (€)";
    const amount = document.createElement("input");
    amount.name = "proposalAmount";
    amount.type = "number";
    amount.min = "0";
    amount.max = "9999999999.99";
    amount.step = "0.01";
    amount.value = option.totalAmount.toFixed(2);
    amount.setAttribute("aria-label", `Importe total para la opción de ${option.sessions} sesiones`);
    amountLabel.append(amountCaption, amount);
    row.append(choiceLabel, serviceLabel, sessionsLabel, duration, amountLabel);
    proposalTable.append(row);
  }

  proposalTable.querySelectorAll(".proposal-row").forEach((row) => {
    row.addEventListener("input", (event) => {
      if (event.target.name === "proposalAmount") return;
      updateProposalRow(row, event.target.name === "proposalServiceId" || event.target.name === "proposalSessions");
    });
    row.addEventListener("change", (event) => {
      if (event.target.name === "proposalChoice") {
        proposalTable.querySelectorAll(".proposal-row").forEach((item) => item.classList.toggle("is-selected", item === row));
      }
      if (event.target.name === "proposalServiceId" || event.target.name === "proposalSessions") updateProposalRow(row, true);
    });
    row.classList.toggle("is-selected", row.querySelector('input[name="proposalChoice"]').checked);
  });
}

function updateProposalRow(row, updateAmount) {
  const serviceId = row.querySelector('select[name="proposalServiceId"]').value;
  const service = services.find((item) => item.id === serviceId);
  const sessionsInput = row.querySelector('input[name="proposalSessions"]');
  const amountInput = row.querySelector('input[name="proposalAmount"]');
  const sessions = Math.max(1, Number(sessionsInput.value) || 1);
  sessionsInput.value = String(sessions);
  row.querySelector(".proposal-duration strong").textContent = service
    ? formatProposalDuration(Number(service.durationMin) * sessions)
    : "—";
  if (updateAmount && service) amountInput.value = (Number(service.price) * sessions).toFixed(2);
  row.querySelector('input[name="proposalChoice"]').value = String(sessions);
}

async function enterIntakeStep(step) {
  if (step === 3) {
    const proposalError = document.querySelector("#proposal-error");
    proposalError.hidden = true;
    proposalError.textContent = "";
    try {
      await loadServices();
      renderProposal();
    } catch (error) {
      proposalError.textContent = "No se pudieron cargar los servicios. Inténtalo de nuevo.";
      proposalError.hidden = false;
      proposalReason.textContent = "";
      proposalTable.replaceChildren();
      proposalEmpty.hidden = true;
      intakeCreateOnlyButton.disabled = false;
      submitButton.disabled = true;
    }
  }
  updateIntakeStep(step);
}

async function checkDuplicate(field) {
  const control = createForm.elements.namedItem(field);
  const message = createForm.querySelector(`[data-duplicate-for="${field}"]`);
  const value = control.value.trim();
  const requestId = ++duplicateChecks[field];
  message.replaceChildren();
  if (!value || (field === "email" && !control.checkValidity()) ||
      (field === "phone" && value.replace(/\D/g, "").length < 4)) return;

  try {
    const params = new URLSearchParams({ [field]: value });
    const response = await fetch(`/api/clients/duplicates?${params}`, { headers: { Accept: "application/json" } });
    const data = await response.json();
    if (!response.ok) throw new Error("No se pudo comprobar si ya hay una ficha.");
    if (requestId !== duplicateChecks[field]) return;
    const match = data.matches?.find((item) => item.field === field);
    if (match) {
      message.append(document.createTextNode(`Ya hay una ficha con este ${field === "phone" ? "teléfono" : "correo"}: `));
      const link = document.createElement("a");
      link.href = getClientProfileHref(match.client.id);
      link.textContent = `${match.client.firstName} ${match.client.lastName}`;
      link.setAttribute("aria-label", `Abrir ficha de ${link.textContent}`);
      message.append(link);
    }
  } catch (error) {
    if (requestId !== duplicateChecks[field]) return;
    message.textContent = "No se pudo comprobar si ya hay una ficha.";
  }
}

async function createIntakeClient(mode) {
  const draft = intakeDraft();
  if (draft.brand === "COBOSU") mode = "clientOnly";
  if (!draft.consentData) {
    formError.textContent = "Confirma el uso de datos personales.";
    formError.hidden = false;
    await enterIntakeStep(2);
    createForm.elements.namedItem("consentData").focus();
    return;
  }
  const selectedRow = [...proposalTable.querySelectorAll(".proposal-row")]
    .find((row) => row.querySelector('input[name="proposalChoice"]').checked);
  let proposal = null;
  if (mode === "addProposal") {
    if (!selectedRow) {
      formError.textContent = "Elige una propuesta o crea solo el cliente.";
      formError.hidden = false;
      return;
    }
    const sessions = Number(selectedRow.querySelector('input[name="proposalSessions"]').value);
    const amount = Number(selectedRow.querySelector('input[name="proposalAmount"]').value);
    const serviceId = selectedRow.querySelector('select[name="proposalServiceId"]').value;
    if (!Number.isInteger(sessions) || sessions < 1 || sessions > 500 || !Number.isFinite(amount) || amount < 0 || !serviceId) {
      formError.textContent = "Revisa las sesiones, el servicio y el importe de la propuesta.";
      formError.hidden = false;
      selectedRow.querySelector('input[name="proposalSessions"]').focus();
      return;
    }
    proposal = { serviceId, sessionsBought: sessions, totalAmount: amount };
  }

  formError.hidden = true;
  submitButton.disabled = true;
  intakeCreateOnlyButton.disabled = true;
  submitButton.textContent = "Guardando…";
  intakeCreateOnlyButton.textContent = "Guardando…";
  try {
    const response = await fetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(draft),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "No se pudo crear el cliente.");

    setActiveFilter("all");
    let packageFailed = false;
    if (proposal) {
      try {
        await addClientServicePackage(data.client.id, {
          serviceId: proposal.serviceId,
          sessionsBought: proposal.sessionsBought,
          totalAmount: proposal.totalAmount,
          paymentMethod: "OTRO",
          paymentStatus: "PENDIENTE",
          notes: "Propuesta inicial",
        });
      } catch (error) {
        packageFailed = true;
      }
    }

    intakeDirty = false;
    createDialog.close();
    searchInput.value = "";
    clearSearchButton.hidden = true;
    await loadClients();
    const name = `${data.client.firstName} ${data.client.lastName}`;
    if (packageFailed) {
      showToast(`Ficha de ${name} creada. No se pudo añadir el bono, puedes hacerlo desde su ficha.`, true, {
        label: "Abrir ficha",
        href: `/clientes/${encodeURIComponent(data.client.id)}/ficha?filtro=${encodeURIComponent(activeFilter)}`,
      });
    } else {
      showToast(`Ficha de ${name} creada.`, false, {
        label: "Abrir ficha",
        href: `/clientes/${encodeURIComponent(data.client.id)}/ficha?filtro=${encodeURIComponent(activeFilter)}`,
      });
    }
  } catch (error) {
    formError.textContent = error.message || "No se pudo crear el cliente. Revisa los datos e inténtalo de nuevo.";
    formError.hidden = false;
  } finally {
    submitButton.disabled = false;
    intakeCreateOnlyButton.disabled = false;
    submitButton.textContent = "Crear cliente y añadir esta propuesta";
    intakeCreateOnlyButton.textContent = "Crear solo el cliente";
  }
}

document.querySelector("#open-create").addEventListener("click", () => {
  createForm.reset();
  formError.hidden = true;
  createForm.querySelectorAll("[data-field-error]").forEach((error) => {
    error.hidden = true;
    error.textContent = "";
    createForm.elements.namedItem(error.dataset.fieldError)?.removeAttribute("aria-invalid");
  });
  document.querySelector("#proposal-error").hidden = true;
  document.querySelector("#objective-other-field").hidden = true;
  document.querySelector("#source-detail-field").hidden = true;
  document.querySelectorAll(".duplicate-message").forEach((message) => message.replaceChildren());
  proposalTable.replaceChildren();
  intakeDirty = false;
  updateIntakeStep(0, false);
  createDialog.showModal();
  createForm.elements.firstName.focus();
});
document.querySelector("#close-dialog").addEventListener("click", requestCloseCreateDialog);
document.querySelector("#cancel-create").addEventListener("click", requestCloseCreateDialog);
createDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  requestCloseCreateDialog();
});
createForm.addEventListener("input", () => { intakeDirty = true; });
createForm.addEventListener("change", (event) => {
  intakeDirty = true;
  if (event.target.name === "source") {
    document.querySelector("#source-detail-field").hidden = event.target.value !== "RECOMENDACION";
    if (event.target.value !== "RECOMENDACION") createForm.elements.namedItem("sourceDetail").value = "";
  }
  if (event.target.id === "objective-other-toggle") {
    document.querySelector("#objective-other-field").hidden = !event.target.checked;
  }
});
createForm.querySelector('[name="phone"]').addEventListener("blur", () => checkDuplicate("phone"));
createForm.querySelector('[name="email"]').addEventListener("blur", () => checkDuplicate("email"));
intakeNextButton.addEventListener("click", async () => {
  if (!validateIntakeStep(intakeStep)) return;
  await enterIntakeStep(intakeStep + 1);
});
intakeBackButton.addEventListener("click", () => updateIntakeStep(intakeStep - 1));
document.querySelectorAll("[data-intake-nav]").forEach((button) => {
  button.addEventListener("click", () => {
    const destination = Number(button.dataset.intakeNav);
    if (destination < intakeStep) updateIntakeStep(destination);
  });
});
createForm.addEventListener("keydown", async (event) => {
  if (event.key === "Escape") {
    event.preventDefault();
    requestCloseCreateDialog();
    return;
  }
  if (event.key !== "Enter" || event.target.matches("textarea") || event.target.matches("button")) return;
  if (intakeStep < 3) {
    event.preventDefault();
    if (validateIntakeStep(intakeStep)) await enterIntakeStep(intakeStep + 1);
  }
});
createForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (intakeStep < 3) {
    if (validateIntakeStep(intakeStep)) await enterIntakeStep(intakeStep + 1);
    return;
  }
  await createIntakeClient(event.submitter?.value || "addProposal");
});
document.querySelector("#open-intake-service-create").addEventListener("click", () => {
  serviceCreateForm.reset();
  serviceCreateError.hidden = true;
  serviceCreateDialog.showModal();
  serviceCreateForm.elements.name.focus();
});
document.querySelector("#refresh-list").addEventListener("click", loadClients);
clientFilterButtons.forEach((button) => {
  button.addEventListener("click", () => setActiveFilter(button.dataset.filter));
});
document.querySelectorAll(".stat-card[data-filter]").forEach((button) => {
  button.addEventListener("click", () => setActiveFilter(button.dataset.filter));
});
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
rows.addEventListener("change", async (event) => {
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
    if (select.value === 'ASISTIO') await offerAttendancePayment(select.dataset.bookingId);
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

purchaseForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (currentUserRole === "TRAINER") return;
  purchaseError.hidden = true;
  if (!purchaseForm.reportValidity() || !historyClientId) return;

  purchaseSubmit.disabled = true;
  purchaseSubmit.textContent = "Guardando…";
  try {
    const body = Object.fromEntries(new FormData(purchaseForm).entries());
    body.sessionsBought = Number(body.sessionsBought);
    body.totalAmount = Number(body.totalAmount);
    await addClientServicePackage(historyClientId, body);

    purchaseForm.reset();
  delete purchaseForm.dataset.requestKey;
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
    if (createDialog.open && intakeStep === 3) renderProposal();
    showToast("Servicio creado.");
  } catch (error) {
    serviceCreateError.textContent = "No se pudo crear el servicio. Inténtalo de nuevo.";
    serviceCreateError.hidden = false;
  } finally {
    serviceCreateSubmit.disabled = false;
    serviceCreateSubmit.textContent = "Crear servicio";
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
  card.setAttribute(
    "aria-label",
    `Ver ficha de ${clientName}${signal ? `. ${signal.text}` : ""}.`,
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

  const actions = document.createElement("div");
  actions.className = "client-card-actions";
  if (currentUserRole !== 'TRAINER' && client.brand !== 'COBOSU') {
    const bonoButton = document.createElement("button");
  bonoButton.type = "button";
  bonoButton.className = "client-card-bono-btn";
  bonoButton.innerHTML = '<svg class="button-plus" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg><span>Bono</span>';
  bonoButton.setAttribute("aria-label", `Añadir bono a ${clientName}`);
  bonoButton.addEventListener("click", (event) => {
    event.stopPropagation();
    openClientHistory(client);
  });
  actions.append(bonoButton);
  }
  card.append(identity, details, actions);

  const open = () => { window.location.assign(getClientProfileHref(client.id)); };
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
    await saveClientMeasurement(progressClientId, body);
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

async function offerAttendancePayment(bookingId) {
  try { await window.TrainersPoint.collectBookingPayment(bookingId, () => { showToast('Cobro registrado. Consulta el saldo actualizado en la ficha.'); }); }
  catch (error) { showToast('La asistencia está guardada. No se pudo abrir el cobro: ' + error.message, true); }
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
    await offerAttendancePayment(booking.id);
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
loadClients();


const purchaseServiceSelect = document.querySelector("#purchase-service");
const purchaseCalcCallout = document.querySelector("#purchase-calc-callout");
const purchaseCalcRate = document.querySelector("#purchase-calc-rate");
const purchaseCalcDuration = document.querySelector("#purchase-calc-duration");

function updatePurchaseCallout() {
  const selected = services.find(service => service.id === purchaseServiceSelect?.value);
  for (const id of ["purchase-validity-preview", "purchase-ticket-validity"]) { const el=document.getElementById(id); if(el)el.textContent=selected?`${selected.validityWeeks || 4} semanas de validez`:"Según servicio"; }
  if (!purchaseServiceSelect || !purchaseCalcCallout) return;
  const service = services.find((s) => s.id === purchaseServiceSelect.value);
  const sessions = Number(purchaseForm.elements.namedItem("sessionsBought")?.value || 0);
  const total = Number(purchaseForm.elements.namedItem("totalAmount")?.value || 0);
  const ticketPreview = document.querySelector("#purchase-ticket-preview");
  const ticketService = document.querySelector("#purchase-ticket-service");
  const ticketDuration = document.querySelector("#purchase-ticket-duration");
  const ticketTotal = document.querySelector("#purchase-ticket-total");
  const ticketRate = document.querySelector("#purchase-ticket-rate");

  if (service) {
    purchaseCalcCallout.hidden = false;
    if (purchaseCalcDuration) purchaseCalcDuration.textContent = `${service.durationMin || 60} min`;
    if (purchaseCalcRate) {
      if (sessions > 0 && !isNaN(total) && total >= 0) {
        purchaseCalcRate.textContent = `${(total / sessions).toFixed(2)} €/sesión`;
      } else {
        purchaseCalcRate.textContent = "—";
      }
    }

    if (ticketPreview) {
      ticketPreview.hidden = false;
      if (ticketService) ticketService.textContent = service.name;
      if (ticketDuration) ticketDuration.textContent = `${service.durationMin || 60} min · ${service.modality === "DUAL" ? "Dúo" : "Individual"}`;
      if (ticketTotal) ticketTotal.textContent = formatCurrency(total);
      if (ticketRate) {
        const rate = sessions > 0 ? (total / sessions).toFixed(2) : "0.00";
        ticketRate.textContent = `${rate} €/sesión · ${sessions} ${sessions === 1 ? "sesión" : "sesiones"}`;
      }
    }
  } else {
    purchaseCalcCallout.hidden = true;
    if (ticketPreview) ticketPreview.hidden = true;
  }
}

// Clients dialog stepper click handler
historyDialog?.addEventListener("click", (event) => {
  const stepBtn = event.target.closest(".bono-step-btn");
  if (!stepBtn) return;
  const step = Number(stepBtn.dataset.step);
  const input = purchaseForm.elements.namedItem("sessionsBought");
  if (!input) return;
  const current = Number(input.value || 1);
  input.value = String(Math.max(1, Math.min(500, current + step)));
  updatePurchaseCallout();
});

// Clients dialog payment method chips click handler
document.querySelector("#purchase-payment-chips")?.addEventListener("click", (event) => {
  const btn = event.target.closest(".payment-chip");
  if (!btn) return;
  document.querySelectorAll("#purchase-payment-chips .payment-chip").forEach((b) => b.classList.remove("is-selected"));
  btn.classList.add("is-selected");
  const methodSelect = purchaseForm.elements.namedItem("paymentMethod");
  if (methodSelect) methodSelect.value = btn.dataset.value;
});

// Clients dialog payment status chips click handler
document.querySelector("#purchase-status-chips")?.addEventListener("click", (event) => {
  const btn = event.target.closest(".payment-chip");
  if (!btn) return;
  document.querySelectorAll("#purchase-status-chips .payment-chip").forEach((b) => b.classList.remove("is-selected"));
  btn.classList.add("is-selected");
  const statusSelect = purchaseForm.elements.namedItem("paymentStatus");
  if (statusSelect) statusSelect.value = btn.dataset.value;
});

if (purchaseServiceSelect) {
  purchaseServiceSelect.addEventListener("change", () => {
    const service = services.find((s) => s.id === purchaseServiceSelect.value);
    if (service) {
      const sessionsInput = purchaseForm.elements.namedItem("sessionsBought");
      const totalInput = purchaseForm.elements.namedItem("totalAmount");
      if (sessionsInput) sessionsInput.value = service.trainingCount || 1;
      if (totalInput) totalInput.value = Number(service.price).toFixed(2);
    }
    // Update card selection highlight
    document.querySelectorAll("#purchase-cards-grid .bono-select-card").forEach((c) => {
      c.classList.toggle("is-selected", c.dataset.serviceId === purchaseServiceSelect.value);
    });
    updatePurchaseCallout();
  });
}

const purchaseSessionsInput = purchaseForm?.elements.namedItem("sessionsBought");
const purchaseTotalInput = purchaseForm?.elements.namedItem("totalAmount");
if (purchaseSessionsInput) purchaseSessionsInput.addEventListener("input", updatePurchaseCallout);
if (purchaseTotalInput) purchaseTotalInput.addEventListener("input", updatePurchaseCallout);
