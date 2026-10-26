const statusLabels = {
  LEAD: "Lead",
  ACTIVO: "Activo",
  INACTIVO: "Inactivo",
  BAJA: "Baja",
};

const avatarColors = [
  ["#eaf3ec", "#477458"],
  ["#eef0fa", "#6c70a1"],
  ["#fff2e7", "#ad7950"],
  ["#e9f2f5", "#527b86"],
  ["#f5edf3", "#956b88"],
  ["#f2f1e7", "#87804f"],
];

const rows = document.querySelector("#client-rows");
const searchInput = document.querySelector("#search-input");
const statusFilter = document.querySelector("#status-filter");
const gymFilter = document.querySelector("#gym-filter");
const initialGymId = new URLSearchParams(window.location.search).get("gymId") || "";
const sortSelect = document.querySelector("#sort-clients");
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

function formatDateTime(value) {
  if (!value) return "Sin sesión programada";
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function initials(client) {
  return `${client.firstName?.trim().charAt(0) ?? ""}${client.lastName?.trim().charAt(0) ?? ""}`.toUpperCase();
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

function renderClient(client, index) {
  const card = document.createElement("article");
  card.className = "client-card client-card-modern";
  const identity = document.createElement("div");
  identity.className = "client-card-identity";
  const person = document.createElement("div");
  person.className = "client-cell";

  const avatar = document.createElement("span");
  avatar.className = "client-avatar";
  avatar.textContent = initials(client);
  const colors = avatarColors[index % avatarColors.length];
  avatar.style.backgroundColor = colors[0];
  avatar.style.color = colors[1];

  const nameBlock = document.createElement("span");
  const name = document.createElement("strong");
  name.textContent = `${escapeText(client.firstName)} ${escapeText(client.lastName)}`;
  const email = document.createElement("small");
  email.textContent = escapeText(client.email);
  nameBlock.append(name, email);
  person.append(avatar, nameBlock);
  const status = document.createElement("span");
  status.className = `client-status status-${client.status}`;
  status.textContent = statusLabels[client.status] ?? "Sin estado";
  identity.append(person, status);

  const info = document.createElement("div");
  info.className = "client-card-info";
  const nextSession = client.nextSession;
  info.append(
    createInfoItem(
      "PRÓXIMA SESIÓN",
      nextSession ? formatDateTime(nextSession.startTime) : "Sin sesión programada",
      nextSession?.service?.name ?? "Se mostrará al programar una sesión",
      nextSession ? "client-info-next" : "",
    ),
    createInfoItem(
      "SESIONES RESTANTES",
      client.servicePackageCount > 0 ? String(client.remainingSessions) : "—",
      client.servicePackageCount > 0 ? "En bonos contratados" : "Sin bonos contratados",
    ),
    createInfoItem(
      "PAGOS POR REVISAR",
      String(client.pendingPayments),
      client.pendingPayments === 1 ? "1 pago pendiente o fallido" : "Pagos pendientes o fallidos",
      client.pendingPayments > 0 ? "client-info-payment" : "",
    ),
    createInfoItem(
      "GIMNASIO",
      client.gym?.name ?? "Sin gimnasio",
      [client.gym?.city, client.gym?.province].filter(Boolean).join(", "),
    ),
  );

  const actions = document.createElement("div");
  actions.className = "client-card-actions";
  if (gyms.length > 0) {
    const gymSelect = document.createElement("select");
    gymSelect.className = "gym-client-select";
    gymSelect.setAttribute("aria-label", `Gimnasio de ${client.firstName} ${client.lastName}`);
    gymSelect.dataset.clientId = client.id;
    gymSelect.dataset.previousGymId = client.gymId ?? "";

    for (const gym of gyms) {
      const option = document.createElement("option");
      option.value = gym.id;
      option.textContent = gym.name;
      option.selected = gym.id === client.gymId;
      gymSelect.append(option);
    }
    actions.append(gymSelect);
  } else {
    const missingGym = document.createElement("span");
    missingGym.className = "gym-missing";
    missingGym.textContent = "Sin sedes";
    actions.append(missingGym);
  }
  const select = document.createElement("select");
  select.className = `status-select status-${client.status}`;
  select.setAttribute("aria-label", `Estado de ${client.firstName} ${client.lastName}`);
  select.dataset.clientId = client.id;
  select.dataset.previousStatus = client.status;
  for (const [status, label] of Object.entries(statusLabels)) {
    const option = document.createElement("option");
    option.value = status;
    option.textContent = label;
    option.selected = status === client.status;
    select.append(option);
  }
  actions.append(select);

  const action = document.createElement("button");
  action.className = "row-action history-action";
  action.type = "button";
  action.title = "Ver historial de servicios";
  action.setAttribute("aria-label", `Ver historial de servicios de ${client.firstName} ${client.lastName}`);
  action.textContent = "Historial";
  action.addEventListener("click", () => openClientHistory(client));
  actions.append(action);

  card.append(identity, info, actions);
  return card;
}

function renderEmpty(message, detail) {
  rows.replaceChildren();
  const state = document.createElement("div");
  state.className = "empty-state";
  const icon = document.createElement("span");
  icon.className = "empty-icon";
  icon.textContent = "◎";
  const title = document.createElement("strong");
  title.textContent = message;
  const description = document.createElement("span");
  description.textContent = detail;
  state.append(icon, title, description);
  rows.append(state);
}

async function loadClients() {
  refreshController?.abort();
  refreshController = new AbortController();
  rows.replaceChildren();
  const loadingMessage = document.createElement("p");
  loadingMessage.className = "list-message";
  loadingMessage.textContent = "Cargando clientes…";
  rows.append(loadingMessage);

  const params = new URLSearchParams();
  params.set("all", "true");
  if (searchInput.value.trim()) params.set("q", searchInput.value.trim());
  if (statusFilter.value) params.set("status", statusFilter.value);
  if (gymFilter.value) params.set("gymId", gymFilter.value);

  try {
    const response = await fetch(`/api/clients?${params}`, {
      headers: { Accept: "application/json" },
      signal: refreshController.signal,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "No se pudo cargar la lista.");

    document.querySelector("#heading-count").textContent = `(${data.total})`;
    document.querySelector("#count-total").textContent = data.total;
    document.querySelector("#count-active").textContent = data.counts.ACTIVO ?? 0;
    document.querySelector("#count-leads").textContent = data.counts.LEAD ?? 0;
    document.querySelector("#count-inactive").textContent = data.counts.INACTIVO ?? 0;
    const clients = [...data.clients];
    const compareNames = (a, b) =>
      `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, "es");
    if (sortSelect.value === "pending-payments") {
      clients.sort((a, b) => b.pendingPayments - a.pendingPayments || compareNames(a, b));
    } else if (sortSelect.value === "name") {
      clients.sort(compareNames);
    } else {
      clients.sort((a, b) => {
        const aStart = a.nextSession ? new Date(a.nextSession.startTime).getTime() : Number.POSITIVE_INFINITY;
        const bStart = b.nextSession ? new Date(b.nextSession.startTime).getTime() : Number.POSITIVE_INFINITY;
        return aStart - bStart || compareNames(a, b);
      });
    }
    const upcomingCount = clients.filter((client) => client.nextSession).length;
    document.querySelector("#results-count").textContent =
      `${data.clients.length} ${data.clients.length === 1 ? "cliente" : "clientes"}`;
    document.querySelector("#table-summary").textContent =
      data.clients.length === 0
        ? "Sin resultados"
        : `${upcomingCount} ${upcomingCount === 1 ? "cliente con sesión próxima" : "clientes con sesiones próximas"}`;

    rows.replaceChildren();
    if (clients.length === 0) {
      renderEmpty(
        searchInput.value || statusFilter.value || gymFilter.value ? "No hay resultados" : "Aún no hay clientes",
        searchInput.value || statusFilter.value || gymFilter.value
          ? "Prueba con otros términos o cambia el filtro."
          : "Añade tu primer cliente para empezar a organizar su seguimiento.",
      );
      return;
    }
    clients.forEach((client, index) => rows.append(renderClient(client, index)));
  } catch (error) {
    if (error.name === "AbortError") return;
    rows.replaceChildren();
    const message = document.createElement("p");
    message.className = "list-message error";
    message.textContent = error.message || "No se pudieron cargar los clientes.";
    rows.append(message);
    document.querySelector("#results-count").textContent = "";
  }
}

function renderGyms() {
  const selectedGymId = gymFilter.value;
  const selectedCreateGymId = document.querySelector("#create-gym-select").value;
  gymCards.replaceChildren();
  gymFilter.replaceChildren();
  const allOption = document.createElement("option");
  allOption.value = "";
  allOption.textContent = "Todos los gimnasios";
  gymFilter.append(allOption);

  const createGymSelect = document.querySelector("#create-gym-select");
  createGymSelect.replaceChildren();
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = gyms.length ? "Selecciona un gimnasio" : "Añade un gimnasio primero";
  createGymSelect.append(placeholder);
  createGymSelect.disabled = gyms.length === 0;
  document.querySelector("#open-create").disabled = gyms.length === 0;

  if (gyms.length === 0) {
    const empty = document.createElement("p");
    empty.className = "gym-loading";
    empty.textContent = "Aún no hay gimnasios. Añade la primera sede para poder registrar clientes.";
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
    card.setAttribute("aria-label", `Filtrar clientes de ${gym.name}`);
    const icon = document.createElement("span");
    icon.className = "gym-card-icon";
    icon.textContent = "⌂";
    const details = document.createElement("span");
    details.className = "gym-card-details";
    const name = document.createElement("strong");
    name.textContent = gym.name;
    const location = document.createElement("small");
    location.textContent = [gym.city, gym.province].filter(Boolean).join(", ") || "Ubicación no especificada";
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
    if (!response.ok) throw new Error(data.error || "No se pudieron cargar los gimnasios.");
    gyms = data.gyms;
    if (initialGymId && gyms.some((gym) => gym.id === initialGymId)) gymFilter.value = initialGymId;
    renderGyms();
  } catch (error) {
    gymCards.replaceChildren();
    const message = document.createElement("p");
    message.className = "gym-loading error";
    message.textContent = error.message || "No se pudieron cargar los gimnasios.";
    gymCards.append(message);
  }
}

function renderServiceOptions(selectedId = "") {
  const serviceSelect = document.querySelector("#purchase-service");
  serviceSelect.replaceChildren();
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = services.length ? "Selecciona un servicio" : "Crea primero un servicio";
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
  if (!response.ok) throw new Error(data.error || "No se pudieron cargar los servicios.");
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
    empty.textContent = "Todavía no hay servicios contratados para este cliente.";
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
      ["Realizadas", servicePackage.sessionsUsed],
      ["Programadas", servicePackage.sessionsScheduled],
      ["Restantes", servicePackage.sessionsRemaining],
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
    cell.textContent = "No hay sesiones registradas.";
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
    select.setAttribute("aria-label", `Asistencia de ${booking.service.name} del ${formatDateTime(booking.startTime)}`);
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
    "Bonos, pagos, asistencia y sesiones disponibles.";
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
    if (!response.ok) throw new Error(data.error || "No se pudo cargar el historial.");
    renderServiceHistory(data);
  } catch (error) {
    packageList.replaceChildren();
    const message = document.createElement("p");
    message.className = "history-empty error";
    message.textContent = error.message || "No se pudo cargar el historial.";
    packageList.append(message);
  }
}

function showToast(message, isError = false) {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.toggle("error", isError);
  toast.classList.add("visible");
  toastTimer = window.setTimeout(() => toast.classList.remove("visible"), 3200);
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
document.querySelector("#open-gyms").addEventListener("click", (event) => {
  if (event.currentTarget.getAttribute("href") !== "#gyms") return;
  event.preventDefault();
  document.querySelector("#gyms").scrollIntoView({ behavior: "smooth" });
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
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(loadClients, 250);
});
statusFilter.addEventListener("change", loadClients);
gymFilter.addEventListener("change", () => {
  renderGyms();
  loadGyms().then(loadClients);
});
sortSelect.addEventListener("change", loadClients);

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
      if (!response.ok) throw new Error(data.error || "No se pudo asignar el gimnasio.");
      showToast("Gimnasio del cliente actualizado.");
      await Promise.all([loadGyms(), loadClients()]);
    } catch (error) {
      gymSelect.value = gymSelect.dataset.previousGymId;
      showToast(error.message, true);
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
    if (!response.ok) throw new Error(data.error || "No se pudo actualizar el estado.");
    showToast("Estado del cliente actualizado.");
    await loadClients();
  } catch (error) {
    select.value = previousStatus;
    select.className = `status-select status-${select.value}`;
    showToast(error.message, true);
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
    if (!response.ok) throw new Error(data.error || "No se pudo guardar la asistencia.");
    showToast("Asistencia actualizada.");
    const client = { id: historyClientId, ...historyDialogClientName() };
    await openClientHistory(client);
  } catch (error) {
    select.value = select.dataset.previousAttendance;
    showToast(error.message || "No se pudo guardar la asistencia.", true);
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
    if (!response.ok) throw new Error(data.error || "No se pudo programar la sesión.");
    showToast("Sesión programada.");
    await openClientHistory({ id: historyClientId, ...historyDialogClientName() });
  } catch (error) {
    showToast(error.message || "No se pudo programar la sesión.", true);
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
    if (!response.ok) throw new Error(data.error || "No se pudo crear el cliente.");

    closeDialog();
    showToast("Cliente creado correctamente.");
    searchInput.value = "";
    statusFilter.value = "";
    gymFilter.value = "";
    await loadGyms();
    await loadClients();
  } catch (error) {
    formError.textContent = error.message || "No se pudo crear el cliente.";
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
    if (!response.ok) throw new Error(data.error || "No se pudo añadir el servicio.");

    purchaseForm.reset();
    await loadServices(body.serviceId);
    await openClientHistory({ id: historyClientId, ...historyDialogClientName() });
    showToast("Servicio añadido al historial.");
  } catch (error) {
    purchaseError.textContent = error.message || "No se pudo añadir el servicio.";
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
    if (!response.ok) throw new Error(data.error || "No se pudo crear el servicio.");

    serviceCreateDialog.close();
    await loadServices(data.service.id);
    showToast("Servicio creado.");
  } catch (error) {
    serviceCreateError.textContent = error.message || "No se pudo crear el servicio.";
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
    if (!response.ok) throw new Error(data.error || "No se pudo guardar el gimnasio.");

    gymDialog.close();
    await loadGyms();
    gymFilter.value = data.gym.id;
    renderGyms();
    await loadClients();
    createForm.elements.gymId.value = data.gym.id;
    showToast("Gimnasio añadido correctamente.");
  } catch (error) {
    gymFormError.textContent = error.message || "No se pudo guardar el gimnasio.";
    gymFormError.hidden = false;
  } finally {
    gymSubmitButton.disabled = false;
    gymSubmitButton.textContent = "Guardar gimnasio";
  }
});

document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    searchInput.focus();
  }
});

function sessionBadge(value) {
  const minutes = Math.round((new Date(value).getTime() - Date.now()) / 60000);
  if (minutes <= 0) return "En el centro";
  if (minutes < 60) return `En ${minutes} min`;
  return `${new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit" }).format(new Date(value))} h`;
}

function renderClient(client) {
  const card = document.createElement("article");
  card.className = "client-card";
  card.tabIndex = 0;
  card.setAttribute("role", "button");
  card.setAttribute("aria-label", `Abrir ficha de ${client.firstName} ${client.lastName}`);
  const identity = document.createElement("div");
  identity.className = "client-card-identity";
  const avatar = document.createElement("span");
  avatar.className = "client-avatar";
  avatar.innerHTML = `<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="10" r="5"/><path d="M6 28c.8-6.1 4.1-9.2 10-9.2S25.2 21.9 26 28"/></svg>`;
  const nameBlock = document.createElement("span");
  const name = document.createElement("strong");
  name.textContent = `${client.firstName} ${client.lastName}`;
  const contact = document.createElement("small");
  contact.className = "client-contact";
  contact.textContent = client.email || client.phone || "Sin datos de contacto";
  const status = document.createElement("span");
  status.className = `client-status status-${client.status}`;
  status.textContent = statusLabels[client.status] ?? "Sin estado";
  nameBlock.append(name, contact);
  identity.append(avatar, nameBlock);
  identity.append(status);
  const info = document.createElement("div");
  info.className = "client-card-info";
  info.append(createInfoItem("PRÓXIMA SESIÓN", client.nextSession ? sessionBadge(client.nextSession.startTime) : "Sin sesión programada", client.nextSession?.service?.name || "Puedes programarla desde su ficha", client.nextSession ? "client-info-next" : ""));
  info.append(createInfoItem("BONOS", client.servicePackageCount > 0 ? `${client.remainingSessions} sesiones` : "Sin bono", client.servicePackageCount > 0 ? "Disponibles" : "Añadir desde historial"));
  info.append(createInfoItem("PAGOS", client.pendingPayments > 0 ? "Pendiente de revisar" : "Al día", client.pendingPayments > 0 ? "Abrir ficha" : "Sin incidencias", client.pendingPayments > 0 ? "client-info-payment" : "client-info-paid"));
  info.append(createInfoItem("SEDE", client.gym?.name ?? "Sin gimnasio", [client.gym?.city, client.gym?.province].filter(Boolean).join(", ")));
  const arrow = document.createElement("span");
  arrow.className = "card-arrow";
  arrow.textContent = "↗";
  const footer = document.createElement("div");
  footer.className = "client-card-footer";
  const footerHint = document.createElement("span");
  footerHint.textContent = client.nextSession ? `Próxima atención · ${formatDateTime(client.nextSession.startTime)}` : "Ficha lista para completar";
  const openButton = document.createElement("button");
  openButton.type = "button";
  openButton.className = "client-open-button";
  openButton.textContent = "Abrir ficha";
  footer.append(footerHint, openButton);
  card.append(identity, info, footer, arrow);
  const open = () => openClientDetail(client);
  card.addEventListener("click", open);
  openButton.addEventListener("click", (event) => { event.stopPropagation(); open(); });
  card.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(); } });
  return card;
}

const clientDetailDialog = document.querySelector("#client-detail-dialog");
let detailClient;
function openClientDetail(client) {
  detailClient = client;
  document.querySelector("#client-detail-title").textContent = `${client.firstName} ${client.lastName}`;
  document.querySelector("#client-detail-status").textContent = statusLabels[client.status] ?? "Cliente";
  document.querySelector("#detail-email").textContent = client.email || "Sin email";
  document.querySelector("#detail-phone").textContent = client.phone || "Sin teléfono";
  document.querySelector("#detail-gym").textContent = client.gym?.name || "Sin gimnasio";
  document.querySelector("#detail-session").textContent = client.nextSession ? `${sessionBadge(client.nextSession.startTime)} · ${client.nextSession.service?.name || "Sesión"}` : "Sin sesión hoy";
  document.querySelector("#detail-notes").textContent = client.clientNotes?.[0]?.content || client.notes || "Sin notas añadidas.";
  document.querySelector("#detail-routine").textContent = client.trainingPlans?.[0]?.name || (client.servicePackageCount ? `${client.remainingSessions} sesiones disponibles en sus bonos.` : "No hay rutina activa registrada.");
  document.querySelector("#detail-checkin").textContent = "✓ Registrar check-in";
  clientDetailDialog.showModal();
}
document.querySelector("#close-client-detail").addEventListener("click", () => clientDetailDialog.close());
document.querySelector("#open-detail-history").addEventListener("click", () => { clientDetailDialog.close(); if (detailClient) openClientHistory(detailClient); });
document.querySelector("#detail-checkin").addEventListener("click", async () => {
  if (!detailClient?.nextSession?.id) { showToast("Este usuario no tiene una sesión pendiente hoy.", true); return; }
  const button = document.querySelector("#detail-checkin");
  button.disabled = true;
  try {
    const response = await fetch(`/api/bookings/${encodeURIComponent(detailClient.nextSession.id)}/attendance`, {
      method: "PATCH", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ attendance: "ASISTIO" }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "No se pudo registrar el check-in.");
    showToast("Check-in registrado correctamente.");
    clientDetailDialog.close();
    await loadClients();
  } catch (error) { showToast(error.message || "No se pudo registrar el check-in.", true); }
  finally { button.disabled = false; }
});

loadGyms().then(loadClients);
