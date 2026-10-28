const metrics = [
  ["weight", "Peso", "kg"],
  ["hip", "Cadera", "cm"],
  ["waist", "Cintura", "cm"],
  ["leg", "Pierna", "cm"],
  ["chest", "Pecho", "cm"],
  ["arm", "Brazo", "cm"],
];

const clientId = window.location.pathname.match(/^\/clientes\/([0-9a-f-]+)\/ficha$/i)?.[1];
const returnFilter = new URLSearchParams(window.location.search).get("filtro");
if (returnFilter) {
  const returnUrl = `/clientes?filtro=${encodeURIComponent(returnFilter)}`;
  document.querySelectorAll(".profile-breadcrumb a, .back-link").forEach((link) => {
    link.href = returnUrl;
  });
}
const loading = document.querySelector("#profile-loading");
const errorBox = document.querySelector("#profile-error");
const view = document.querySelector("#profile-view");
const objectiveForm = document.querySelector("#objective-form");
const objectiveInput = document.querySelector("#objective-input");
const objectiveFeedback = document.querySelector("#objective-feedback");
const clientDetailsForm = document.querySelector("#client-details-form");
const clientDetailsFeedback = document.querySelector("#client-details-feedback");
const measurementDialog = document.querySelector("#measurement-dialog");
const measurementForm = document.querySelector("#measurement-form");
const measurementDate = document.querySelector("#measurement-date");
const measurementError = document.querySelector("#measurement-error");
const measurementWarning = document.querySelector("#measurement-warning");
const saveMeasurementButton = document.querySelector("#save-measurement");
const profileToast = document.querySelector("#toast");
const chartTabs = document.querySelector("#chart-tabs");
const progressChart = document.querySelector("#progress-chart");
const measurementSummary = document.querySelector("#measurement-summary");
const measurementHistory = document.querySelector("#measurement-history");
let progress;
let selectedMetric = "weight";
let toastTimer;

function showError(message) { loading.hidden = true; view.hidden = true; errorBox.textContent = message; errorBox.hidden = false; }
function valueText(value, unit) { return value === null || value === undefined ? "—" : `${Number(value).toLocaleString("es-ES", { maximumFractionDigits: 2 })} ${unit}`; }
function initials(client) { return `${client.firstName?.trim().charAt(0) ?? ""}${client.lastName?.trim().charAt(0) ?? ""}`.toUpperCase(); }
function dateText(value) { return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(value)); }
function shortDateText(value) { return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(value)); }
function dateTimeLocalValue(value) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
function metricMeasurements(measurements, key) { return measurements.filter((measurement) => measurement[key] !== null && measurement[key] !== undefined); }
function animateValue(element) {
  element.classList.remove("value-updated");
  requestAnimationFrame(() => element.classList.add("value-updated"));
}

function showProfileToast(message) {
  window.clearTimeout(toastTimer);
  profileToast.textContent = message;
  profileToast.classList.add("visible");
  toastTimer = window.setTimeout(() => {
    profileToast.classList.remove("visible");
    profileToast.replaceChildren();
  }, 4500);
}

function renderHeader(client) {
  document.title = `Ficha de ${client.firstName} ${client.lastName} | Trainers Point`;
  document.querySelector("#profile-avatar").textContent = initials(client);
  document.querySelector("#profile-name").textContent = `${client.firstName} ${client.lastName}`;
  document.querySelector("#profile-status").textContent = { LEAD: "Nuevo interesado", ACTIVO: "Activo", INACTIVO: "Inactivo", BAJA: "Baja" }[client.status] || "Cliente";
  document.querySelector("#profile-email").textContent = client.email || "Sin email";
  document.querySelector("#profile-phone").textContent = client.phone || "Sin teléfono";
  document.querySelector("#profile-gym").textContent = client.gym?.name || "Sin centro";
  document.querySelector("#profile-location").textContent = [client.gym?.city, client.gym?.province].filter(Boolean).join(", ") || "Sin ubicación";
  objectiveInput.value = client.objective || "";
  document.querySelector("#profile-objective-preview").textContent = client.objective || "Sin objetivo definido";
}

function renderClientDetails(client) {
  const form = clientDetailsForm;
  form.elements.namedItem("dni").value = client.dni || "";
  form.elements.namedItem("address").value = client.address || "";
  form.elements.namedItem("preferredName").value = client.preferredName || "";
  form.elements.namedItem("birthDate").value = client.birthDate ? new Date(client.birthDate).toISOString().slice(0, 10) : "";
  form.elements.namedItem("sex").value = client.sex || "";
  form.elements.namedItem("source").value = client.source || "";
  form.elements.namedItem("sourceDetail").value = client.sourceDetail || "";
  form.elements.namedItem("contactPreference").value = client.contactPreference || "";
  form.elements.namedItem("contactSlot").value = client.contactSlot || "";
  form.elements.namedItem("sessionsPerWeek").value = client.sessionsPerWeek ? String(client.sessionsPerWeek) : "";
  form.elements.namedItem("firstSessionPreference").value = client.firstSessionPreference
    ? dateTimeLocalValue(client.firstSessionPreference)
    : "";
  form.elements.namedItem("injuryNotes").value = client.injuryNotes || "";

  const injuries = Array.isArray(client.injuries) ? client.injuries : [];
  form.querySelectorAll('input[name="injuries"]').forEach((input) => {
    input.checked = injuries.includes(input.value);
  });
  const availability = client.availability && typeof client.availability === "object" ? client.availability : {};
  const days = Array.isArray(availability.days) ? availability.days : [];
  const slots = Array.isArray(availability.slots) ? availability.slots : [];
  form.querySelectorAll('input[name="availabilityDay"]').forEach((input) => {
    input.checked = days.includes(input.value);
  });
  form.querySelectorAll('input[name="availabilitySlot"]').forEach((input) => {
    input.checked = slots.includes(input.value);
  });

  for (const field of ["consentData", "consentMarketing", "consentPhotos"]) {
    const value = client[field];
    form.elements.namedItem(field).checked = Boolean(value);
    form.querySelector(`[data-consent-date="${field}"]`).textContent = value ? `Registrado el ${dateText(value)}` : "Sin registro";
  }
}

function renderSummary(measurements, previousMeasurements = []) {
  measurementSummary.replaceChildren();
  document.querySelector("#measurement-count").textContent = measurements.length ? `${measurements.length} ${measurements.length === 1 ? "registro" : "registros"}` : "Sin registros";
  const latest = measurements.at(-1);
  document.querySelector("#last-measurement").textContent = latest ? `Última · ${dateText(latest.measuredAt)}` : "Sin medidas";
  if (!latest) { const empty = document.createElement("p"); empty.className = "profile-empty"; empty.textContent = "Aún no hay medidas. Añade la primera para empezar a comparar."; measurementSummary.append(empty); return; }
  for (const [key, label, unit] of metrics) {
    const card = document.createElement("div"); card.className = "measurement-card-profile";
    const values = metricMeasurements(measurements, key);
    const oldValues = metricMeasurements(previousMeasurements, key);
    const previousValue = oldValues.at(-1)?.[key];
    const currentValue = values.at(-1)?.[key];
    const firstValue = values[0]?.[key];
    const delta = currentValue === undefined || firstValue === undefined ? null : Number(currentValue) - Number(firstValue);
    card.innerHTML = `<span>${label}</span><strong data-metric-value="${key}">${valueText(currentValue, unit)}</strong><small>${delta === null ? "Sin datos" : `${delta > 0 ? "+" : ""}${delta.toLocaleString("es-ES", { maximumFractionDigits: 2 })} ${unit} desde el inicio`}</small>`;
    if (previousValue !== undefined && currentValue !== undefined && Number(previousValue) !== Number(currentValue)) {
      animateValue(card.querySelector("strong"));
    }
    measurementSummary.append(card);
  }
}

function renderHistory(measurements) {
  measurementHistory.replaceChildren();
  if (!measurements.length) { const empty = document.createElement("p"); empty.className = "profile-empty"; empty.textContent = "Aún no hay medidas. Añade la primera para empezar a comparar."; measurementHistory.append(empty); return; }
  for (const measurement of [...measurements].reverse()) {
    const row = document.createElement("article"); row.className = "measurement-row-profile";
    const values = metrics.filter(([key]) => measurement[key] !== null && measurement[key] !== undefined).map(([key, label, unit]) => `${label}: ${valueText(measurement[key], unit)}`).join(" · ");
    const copy = document.createElement("div"); copy.innerHTML = `<strong>${dateText(measurement.measuredAt)}</strong><small>${values || "Sin datos"}</small>`;
    row.append(copy);
    if (measurement.notes) { const notes = document.createElement("p"); notes.textContent = measurement.notes; row.append(notes); }
    measurementHistory.append(row);
  }
}

function renderChart(measurements, previousMeasurements = []) {
  chartTabs.replaceChildren();
  for (const [key, label] of metrics) {
    const button = document.createElement("button"); button.type = "button"; button.textContent = label; button.setAttribute("role", "tab"); button.setAttribute("aria-selected", String(key === selectedMetric));
    button.addEventListener("click", () => { selectedMetric = key; renderChart(measurements); }); chartTabs.append(button);
  }
  const metric = metrics.find(([key]) => key === selectedMetric);
  const points = metricMeasurements(measurements, selectedMetric);
  progressChart.replaceChildren();
  if (!points.length) {
    const empty = document.createElement("p");
    empty.textContent = "Aún no hay medidas para mostrar.";
    progressChart.append(empty);
    return;
  }

  const first = points[0];
  const latest = points.at(-1);
  const difference = Number(latest[selectedMetric]) - Number(first[selectedMetric]);
  const elapsedDays = Math.max(0, Math.round(
    (Date.parse(`${latest.measuredAt.slice(0, 10)}T00:00:00Z`) - Date.parse(`${first.measuredAt.slice(0, 10)}T00:00:00Z`)) / 86400000,
  ));
  const header = document.createElement("div");
  header.className = "chart-current";
  const currentLabel = document.createElement("span");
  currentLabel.className = "chart-current-label";
  currentLabel.textContent = `Último valor · ${metric[1]}`;
  const currentValue = document.createElement("strong");
  currentValue.className = "chart-current-value";
  currentValue.textContent = valueText(latest[selectedMetric], metric[2]);
  const previousValue = metricMeasurements(previousMeasurements, selectedMetric).at(-1)?.[selectedMetric];
  if (previousValue !== undefined && Number(previousValue) !== Number(latest[selectedMetric])) {
    animateValue(currentValue);
  }
  const comparison = document.createElement("div");
  comparison.className = "chart-comparison";
  const comparisonTitle = document.createElement("span");
  comparisonTitle.className = "chart-comparison-title";
  comparisonTitle.textContent = "Primera vs. última";
  const comparisonValues = document.createElement("div");
  comparisonValues.className = "chart-comparison-values";
  const firstValue = document.createElement("span");
  firstValue.innerHTML = `<small>Primera · ${shortDateText(first.measuredAt)}</small><strong>${valueText(first[selectedMetric], metric[2])}</strong>`;
  const lastValue = document.createElement("span");
  lastValue.innerHTML = `<small>Última · ${shortDateText(latest.measuredAt)}</small><strong>${valueText(latest[selectedMetric], metric[2])}</strong>`;
  const differenceValue = document.createElement("span");
  differenceValue.innerHTML = `<small>Diferencia</small><strong>${difference > 0 ? "+" : ""}${difference.toLocaleString("es-ES", { maximumFractionDigits: 2 })} ${metric[2]}</strong>`;
  const elapsedValue = document.createElement("span");
  elapsedValue.innerHTML = `<small>Tiempo</small><strong>${elapsedDays} ${elapsedDays === 1 ? "día" : "días"}</strong>`;
  comparisonValues.append(firstValue, lastValue, differenceValue, elapsedValue);
  comparison.append(comparisonTitle, comparisonValues);
  header.append(currentLabel, currentValue);
  progressChart.append(header, comparison);

  if (points.length === 1) {
    const note = document.createElement("p");
    note.className = "chart-single-note";
    note.textContent = "Con la próxima medición verás la evolución.";
    progressChart.append(note);
    return;
  }

  const values = points.map((point) => Number(point[selectedMetric]));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  const width = 720;
  const height = 160;
  const pad = { top: 16, right: 26, bottom: 28, left: 16 };
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const coordinates = points.map((point, index) => ({
    x: pad.left + (index / (points.length - 1)) * plotWidth,
    y: range === 0
      ? pad.top + plotHeight / 2
      : pad.top + ((max - Number(point[selectedMetric])) / range) * plotHeight,
  }));
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `Evolución de ${metric[1]}: ${points.length} mediciones`);
  const line = document.createElementNS(svg.namespaceURI, "polyline");
  line.setAttribute("class", "chart-line");
  line.setAttribute("points", coordinates.map(({ x, y }) => `${x},${y}`).join(" "));
  svg.append(line);
  coordinates.forEach(({ x, y }, index) => {
    const point = document.createElementNS(svg.namespaceURI, "circle");
    point.setAttribute("class", index === coordinates.length - 1 ? "chart-point chart-point-latest" : "chart-point");
    point.setAttribute("cx", String(x));
    point.setAttribute("cy", String(y));
    point.setAttribute("r", index === coordinates.length - 1 ? "5" : "3");
    svg.append(point);
  });
  const firstDate = document.createElementNS(svg.namespaceURI, "text");
  firstDate.setAttribute("class", "chart-label");
  firstDate.setAttribute("x", String(pad.left));
  firstDate.setAttribute("y", String(height - 6));
  firstDate.textContent = shortDateText(first.measuredAt);
  const lastDate = document.createElementNS(svg.namespaceURI, "text");
  lastDate.setAttribute("class", "chart-label");
  lastDate.setAttribute("x", String(width - pad.right));
  lastDate.setAttribute("y", String(height - 6));
  lastDate.setAttribute("text-anchor", "end");
  lastDate.textContent = shortDateText(latest.measuredAt);
  svg.append(firstDate, lastDate);
  progressChart.append(svg);
}

function renderProgress(data, previousMeasurements = []) { progress = data; renderHeader(data.client); renderClientDetails(data.client); renderSummary(data.measurements, previousMeasurements); renderHistory(data.measurements); renderChart(data.measurements, previousMeasurements); }

async function loadProfile() {
  if (!clientId) { showError("No encontramos esta ficha. Vuelve a clientes y elige una persona."); return; }
  try {
    const response = await fetch(`/api/clients/${encodeURIComponent(clientId)}/progress`, { headers: { Accept: "application/json" } });
    const data = await response.json(); if (!response.ok) throw new Error("No se pudo cargar esta ficha.");
    renderProgress(data); loading.hidden = true; view.hidden = false;
  } catch (error) { showError("No se pudo cargar esta ficha. Inténtalo de nuevo."); }
}

clientDetailsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clientDetailsFeedback.textContent = "Guardando…";
  const form = clientDetailsForm;
  const selectedInjuries = [...form.querySelectorAll('input[name="injuries"]:checked')].map((input) => input.value);
  const days = [...form.querySelectorAll('input[name="availabilityDay"]:checked')].map((input) => input.value);
  const slots = [...form.querySelectorAll('input[name="availabilitySlot"]:checked')].map((input) => input.value);
  const body = {
    dni: form.elements.namedItem("dni").value.trim() || null,
    address: form.elements.namedItem("address").value.trim() || null,
    preferredName: form.elements.namedItem("preferredName").value.trim() || null,
    birthDate: form.elements.namedItem("birthDate").value || null,
    sex: form.elements.namedItem("sex").value || null,
    source: form.elements.namedItem("source").value || null,
    sourceDetail: form.elements.namedItem("sourceDetail").value.trim() || null,
    contactPreference: form.elements.namedItem("contactPreference").value || null,
    contactSlot: form.elements.namedItem("contactSlot").value || null,
    sessionsPerWeek: form.elements.namedItem("sessionsPerWeek").value ? Number(form.elements.namedItem("sessionsPerWeek").value) : null,
    firstSessionPreference: form.elements.namedItem("firstSessionPreference").value
      ? new Date(form.elements.namedItem("firstSessionPreference").value).toISOString()
      : null,
    injuries: selectedInjuries.length ? selectedInjuries : null,
    injuryNotes: form.elements.namedItem("injuryNotes").value.trim() || null,
    availability: days.length || slots.length ? { days, slots } : null,
  };
  for (const field of ["consentData", "consentMarketing", "consentPhotos"]) {
    body[field] = form.elements.namedItem(field).checked
      ? progress.client[field] || new Date().toISOString()
      : null;
  }

  try {
    const response = await fetch(`/api/clients/${encodeURIComponent(clientId)}/details`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "No se pudieron guardar los datos.");
    progress.client = { ...progress.client, ...data.client };
    renderClientDetails(progress.client);
    clientDetailsFeedback.textContent = "Datos guardados.";
  } catch (error) {
    clientDetailsFeedback.textContent = error instanceof Error && error.message
      ? error.message
      : "No se pudieron guardar los datos. Inténtalo de nuevo.";
  }
});

objectiveForm.addEventListener("submit", async (event) => {
  event.preventDefault(); objectiveFeedback.textContent = "Guardando…";
  try { const response = await fetch(`/api/clients/${encodeURIComponent(clientId)}/objective`, { method: "PATCH", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ objective: objectiveInput.value.trim() }) }); const data = await response.json(); if (!response.ok) throw new Error("No se pudo guardar el objetivo."); progress.client.objective = data.client.objective; document.querySelector("#profile-objective-preview").textContent = data.client.objective || "Sin objetivo definido"; objectiveFeedback.textContent = "Objetivo guardado."; } catch (error) { objectiveFeedback.textContent = "No se pudo guardar el objetivo. Inténtalo de nuevo."; }
});

function latestMetricValue(key) {
  return metricMeasurements(progress?.measurements ?? [], key).at(-1);
}

function resetMeasurementWarning() {
  measurementWarning.hidden = true;
  measurementWarning.textContent = "";
  saveMeasurementButton.textContent = "Guardar medidas";
}

function updateMeasurementDeltas() {
  for (const [key, label, unit] of metrics) {
    const input = measurementForm.elements.namedItem(key);
    const feedback = measurementForm.querySelector(`[data-delta-for="${key}"]`);
    const previous = latestMetricValue(key);
    if (!previous || input.value === "") {
      feedback.textContent = "";
      continue;
    }
    const difference = Number(input.value) - Number(previous[key]);
    const direction = difference < 0 ? "−" : difference > 0 ? "+" : "";
    feedback.textContent = `${direction}${Math.abs(difference).toLocaleString("es-ES", { maximumFractionDigits: 2 })} ${unit} respecto al ${shortDateText(previous.measuredAt)}`;
    feedback.classList.toggle("is-unchanged", difference === 0);
  }
}

function largeMeasurementChanges() {
  return metrics.flatMap(([key, label, unit]) => {
    const input = measurementForm.elements.namedItem(key);
    const previous = latestMetricValue(key);
    if (!previous || input.value === "") return [];
    const threshold = key === "weight" ? 10 : 15;
    const change = Math.abs(Number(input.value) - Number(previous[key]));
    return change >= threshold ? [`${label.toLocaleLowerCase("es")} (${threshold} ${unit} o más)`] : [];
  });
}

function updateMeasurementWarning() {
  const changes = largeMeasurementChanges();
  measurementWarning.hidden = changes.length === 0;
  measurementWarning.textContent = changes.length
    ? `El cambio en ${changes.join(" y ")} es grande. Comprueba que el dato sea correcto antes de guardar.`
    : "";
  saveMeasurementButton.textContent = changes.length ? "Guardar de todos modos" : "Guardar medidas";
}

function prepareMeasurementForm() {
  measurementForm.reset();
  measurementDate.value = new Date().toISOString().slice(0, 10);
  measurementError.hidden = true;
  resetMeasurementWarning();
  for (const [key] of metrics) {
    const latest = latestMetricValue(key);
    measurementForm.elements.namedItem(key).value = latest ? String(latest[key]) : "";
  }
  updateMeasurementDeltas();
  measurementDialog.showModal();
}

document.querySelector("#open-measurement").addEventListener("click", prepareMeasurementForm);
document.querySelector("#close-measurement").addEventListener("click", () => measurementDialog.close());
document.querySelector("#cancel-measurement").addEventListener("click", () => measurementDialog.close());
measurementForm.addEventListener("click", (event) => {
  const stepButton = event.target.closest("[data-step][data-metric]");
  if (!stepButton) return;
  const input = measurementForm.elements.namedItem(stepButton.dataset.metric);
  const previous = latestMetricValue(stepButton.dataset.metric);
  const current = input.value === "" ? Number(previous?.[stepButton.dataset.metric] ?? 0) : Number(input.value);
  input.value = String(Math.max(Number(input.min), Math.round((current + Number(stepButton.dataset.step) * 0.1) * 10) / 10));
  input.dispatchEvent(new Event("input", { bubbles: true }));
});
measurementForm.addEventListener("input", (event) => {
  if (event.target.matches("input[type='number']")) {
    updateMeasurementDeltas();
    updateMeasurementWarning();
  }
});
measurementForm.addEventListener("submit", async (event) => {
  event.preventDefault(); measurementError.hidden = true; if (!measurementForm.reportValidity()) return;
  const body = Object.fromEntries(new FormData(measurementForm).entries());
  for (const key of metrics.map(([name]) => name)) {
    if (body[key] === "") delete body[key];
    else if (body[key] !== undefined) body[key] = Number(body[key]);
  }
  const previousMeasurements = progress.measurements;
  try {
    const response = await fetch(`/api/clients/${encodeURIComponent(clientId)}/measurements`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) throw new Error("No se pudieron guardar las medidas.");
    const updatedMeasurements = [
      ...previousMeasurements.filter((item) => item.measuredAt.slice(0, 10) !== data.measurement.measuredAt.slice(0, 10)),
      data.measurement,
    ].sort((a, b) => a.measuredAt.localeCompare(b.measuredAt));
    const milestone = getReachedMilestone(previousMeasurements, updatedMeasurements);
    measurementDialog.close();
    renderProgress({ client: progress.client, measurements: updatedMeasurements }, previousMeasurements);
    showProfileToast(milestone || "Medidas guardadas.");
  } catch (error) {
    measurementError.textContent = "No se pudieron guardar las medidas. Inténtalo de nuevo.";
    measurementError.hidden = false;
  }
});

function getReachedMilestone(previousMeasurements, updatedMeasurements) {
  for (const [key, label, unit] of metrics) {
    const previousPoints = metricMeasurements(previousMeasurements, key);
    const updatedPoints = metricMeasurements(updatedMeasurements, key);
    if (previousPoints.length < 2 || updatedPoints.length < 2) continue;
    const previousDifference = Number(previousPoints.at(-1)[key]) - Number(previousPoints[0][key]);
    const updatedDifference = Number(updatedPoints.at(-1)[key]) - Number(updatedPoints[0][key]);
    const oldMilestone = Math.floor(Math.max(0, -previousDifference) / 5);
    const newMilestone = Math.floor(Math.max(0, -updatedDifference) / 5);
    if (newMilestone > oldMilestone) {
      return `${label}: ${newMilestone * 5} ${unit} menos desde el inicio`;
    }
  }
  return "";
}

loadProfile();
