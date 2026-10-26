const metrics = [
  ["weight", "Peso", "kg"],
  ["hip", "Cadera", "cm"],
  ["waist", "Cintura", "cm"],
  ["leg", "Pierna", "cm"],
  ["chest", "Pecho", "cm"],
  ["arm", "Brazo", "cm"],
];

const clientId = window.location.pathname.match(/^\/clientes\/([0-9a-f-]+)\/ficha$/i)?.[1];
const loading = document.querySelector("#profile-loading");
const errorBox = document.querySelector("#profile-error");
const view = document.querySelector("#profile-view");
const objectiveForm = document.querySelector("#objective-form");
const objectiveInput = document.querySelector("#objective-input");
const objectiveFeedback = document.querySelector("#objective-feedback");
const measurementDialog = document.querySelector("#measurement-dialog");
const measurementForm = document.querySelector("#measurement-form");
const measurementDate = document.querySelector("#measurement-date");
const measurementError = document.querySelector("#measurement-error");
const chartTabs = document.querySelector("#chart-tabs");
const progressChart = document.querySelector("#progress-chart");
const measurementSummary = document.querySelector("#measurement-summary");
const measurementHistory = document.querySelector("#measurement-history");
let progress;
let selectedMetric = "weight";

function showError(message) { loading.hidden = true; view.hidden = true; errorBox.textContent = message; errorBox.hidden = false; }
function valueText(value, unit) { return value === null || value === undefined ? "—" : `${Number(value).toLocaleString("es-ES", { maximumFractionDigits: 2 })} ${unit}`; }
function initials(client) { return `${client.firstName?.trim().charAt(0) ?? ""}${client.lastName?.trim().charAt(0) ?? ""}`.toUpperCase(); }
function dateText(value) { return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`)); }

function renderHeader(client) {
  document.title = `Ficha de ${client.firstName} ${client.lastName} | Trainers Point`;
  document.querySelector("#profile-avatar").textContent = initials(client);
  document.querySelector("#profile-name").textContent = `${client.firstName} ${client.lastName}`;
  document.querySelector("#profile-status").textContent = { LEAD: "Lead", ACTIVO: "Activo", INACTIVO: "Inactivo", BAJA: "Baja" }[client.status] || "Cliente";
  document.querySelector("#profile-email").textContent = client.email || "Sin email";
  document.querySelector("#profile-phone").textContent = client.phone || "Sin teléfono";
  document.querySelector("#profile-gym").textContent = client.gym?.name || "Sin gimnasio";
  document.querySelector("#profile-location").textContent = [client.gym?.city, client.gym?.province].filter(Boolean).join(", ") || "Sin ubicación";
  objectiveInput.value = client.objective || "";
  document.querySelector("#profile-objective-preview").textContent = client.objective || "Sin objetivo definido";
}

function renderSummary(measurements) {
  measurementSummary.replaceChildren();
  const latest = measurements.at(-1);
  const first = measurements[0];
  document.querySelector("#measurement-count").textContent = measurements.length ? `${measurements.length} ${measurements.length === 1 ? "registro" : "registros"}` : "Sin registros";
  document.querySelector("#last-measurement").textContent = latest ? `Última · ${dateText(latest.measuredAt)}` : "Sin mediciones";
  if (!latest) { const empty = document.createElement("p"); empty.className = "profile-empty"; empty.textContent = "Añade la primera medición para empezar a visualizar su evolución."; measurementSummary.append(empty); return; }
  for (const [key, label, unit] of metrics) {
    const card = document.createElement("div"); card.className = "measurement-card-profile";
    const delta = latest[key] !== null && latest[key] !== undefined && first[key] !== null && first[key] !== undefined ? Number(latest[key]) - Number(first[key]) : null;
    card.innerHTML = `<span>${label}</span><strong>${valueText(latest[key], unit)}</strong><small>${delta === null ? "Sin comparación" : `${delta > 0 ? "+" : ""}${delta.toLocaleString("es-ES", { maximumFractionDigits: 2 })} ${unit} desde el inicio`}</small>`;
    measurementSummary.append(card);
  }
}

function renderHistory(measurements) {
  measurementHistory.replaceChildren();
  if (!measurements.length) { const empty = document.createElement("p"); empty.className = "profile-empty"; empty.textContent = "Todavía no hay mediciones."; measurementHistory.append(empty); return; }
  for (const measurement of [...measurements].reverse()) {
    const row = document.createElement("article"); row.className = "measurement-row-profile";
    const values = metrics.filter(([key]) => measurement[key] !== null && measurement[key] !== undefined).map(([key, label, unit]) => `${label}: ${valueText(measurement[key], unit)}`).join(" · ");
    const copy = document.createElement("div"); copy.innerHTML = `<strong>${dateText(measurement.measuredAt)}</strong><small>${values || "Sin valores"}</small>`;
    row.append(copy);
    if (measurement.notes) { const notes = document.createElement("p"); notes.textContent = measurement.notes; row.append(notes); }
    measurementHistory.append(row);
  }
}

function renderChart(measurements) {
  chartTabs.replaceChildren();
  for (const [key, label] of metrics) {
    const button = document.createElement("button"); button.type = "button"; button.textContent = label; button.setAttribute("role", "tab"); button.setAttribute("aria-selected", String(key === selectedMetric));
    button.addEventListener("click", () => { selectedMetric = key; renderChart(measurements); }); chartTabs.append(button);
  }
  const metric = metrics.find(([key]) => key === selectedMetric);
  const points = measurements.filter((measurement) => measurement[selectedMetric] !== null && measurement[selectedMetric] !== undefined);
  if (points.length < 2) { progressChart.innerHTML = "<p>Añade al menos dos mediciones con este dato para ver una gráfica de evolución.</p>"; return; }
  const values = points.map((point) => Number(point[selectedMetric])); const min = Math.min(...values); const max = Math.max(...values); const range = max - min || 1;
  const width = 720; const height = 230; const pad = { top: 22, right: 24, bottom: 34, left: 42 }; const plotWidth = width - pad.left - pad.right; const plotHeight = height - pad.top - pad.bottom;
  const coordinates = points.map((point, index) => ({ x: pad.left + (points.length === 1 ? plotWidth / 2 : (index / (points.length - 1)) * plotWidth), y: pad.top + ((max - Number(point[selectedMetric])) / range) * plotHeight }));
  const line = coordinates.map((point) => `${point.x},${point.y}`).join(" ");
  const grid = [0, .5, 1].map((fraction) => { const y = pad.top + fraction * plotHeight; const label = (max - fraction * range).toLocaleString("es-ES", { maximumFractionDigits: 2 }); return `<line class="chart-grid-line" x1="${pad.left}" y1="${y}" x2="${width - pad.right}" y2="${y}"/><text class="chart-label" x="4" y="${y + 3}">${label}</text>`; }).join("");
  const dots = coordinates.map((point, index) => `<circle class="chart-point" cx="${point.x}" cy="${point.y}" r="4"/><text class="chart-label" text-anchor="middle" x="${point.x}" y="${height - 10}">${dateText(points[index].measuredAt).replace(" de ", " ")}</text>`).join("");
  progressChart.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Evolución de ${metric[1]}">${grid}<polyline class="chart-line" points="${line}"/>${dots}</svg>`;
}

function renderProgress(data) { progress = data; renderHeader(data.client); renderSummary(data.measurements); renderHistory(data.measurements); renderChart(data.measurements); }

async function loadProfile() {
  if (!clientId) { showError("No se ha indicado un cliente válido."); return; }
  try {
    const response = await fetch(`/api/clients/${encodeURIComponent(clientId)}/progress`, { headers: { Accept: "application/json" } });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || "No se pudo cargar la ficha.");
    renderProgress(data); loading.hidden = true; view.hidden = false;
  } catch (error) { showError(error.message || "No se pudo cargar la ficha."); }
}

objectiveForm.addEventListener("submit", async (event) => {
  event.preventDefault(); objectiveFeedback.textContent = "Guardando…";
  try { const response = await fetch(`/api/clients/${encodeURIComponent(clientId)}/objective`, { method: "PATCH", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ objective: objectiveInput.value.trim() }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "No se pudo guardar el objetivo."); progress.client.objective = data.client.objective; document.querySelector("#profile-objective-preview").textContent = data.client.objective || "Sin objetivo definido"; objectiveFeedback.textContent = "Objetivo guardado."; } catch (error) { objectiveFeedback.textContent = error.message; }
});

document.querySelector("#open-measurement").addEventListener("click", () => { measurementForm.reset(); measurementDate.value = new Date().toISOString().slice(0, 10); measurementError.hidden = true; measurementDialog.showModal(); });
document.querySelector("#close-measurement").addEventListener("click", () => measurementDialog.close());
document.querySelector("#cancel-measurement").addEventListener("click", () => measurementDialog.close());
measurementForm.addEventListener("submit", async (event) => {
  event.preventDefault(); measurementError.hidden = true; if (!measurementForm.reportValidity()) return;
  const body = Object.fromEntries(new FormData(measurementForm).entries()); for (const key of metrics.map(([name]) => name)) if (body[key] === "") delete body[key]; else if (body[key] !== undefined) body[key] = Number(body[key]);
  try { const response = await fetch(`/api/clients/${encodeURIComponent(clientId)}/measurements`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "No se pudo guardar la medición."); measurementDialog.close(); renderProgress({ client: progress.client, measurements: [...progress.measurements.filter((item) => item.measuredAt !== data.measurement.measuredAt), data.measurement].sort((a, b) => a.measuredAt.localeCompare(b.measuredAt)) }); } catch (error) { measurementError.textContent = error.message; measurementError.hidden = false; }
});

loadProfile();
