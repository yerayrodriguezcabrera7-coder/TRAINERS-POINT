let currentUserRole = null;
async function fetchUserRole() {
  try {
    const res = await fetch("/api/me");
    if (res.ok) {
      const me = await res.json();
      currentUserRole = me.role;
      if (currentUserRole === 'TRAINER') {
        document.querySelector("#open-add-bono-top")?.setAttribute("hidden", "");
        document.querySelector("#open-add-bono")?.setAttribute("hidden", "");
        document.querySelector("#btn-renew-bono-banner")?.setAttribute("hidden", "");
        const detailsForm = document.querySelector("#client-details-form");
        if (detailsForm) {
          detailsForm.querySelectorAll("button[type=submit], input, select").forEach(el => el.disabled = true);
        }
      }
    }
  } catch (_) {}
}
fetchUserRole();
const metrics = [
  ["weight", "Peso", "kg"],
  ["hip", "Cadera", "cm"],
  ["waist", "Cintura", "cm"],
  ["leg", "Pierna", "cm"],
  ["chest", "Pecho", "cm"],
  ["arm", "Brazo", "cm"],
];
const metricSuffixes = {
  weight: "de peso",
  waist: "de cintura",
  hip: "de cadera",
  leg: "de pierna",
  chest: "de pecho",
  arm: "de brazo",
};

function getGlobalEvolution(measurements) {
  if (!measurements || measurements.length < 2) return null;

  const order = ["weight", "waist", "hip", "leg", "chest", "arm"];
  const metricMap = new Map(metrics.map(([key, label, unit]) => [key, { label, unit, suffix: metricSuffixes[key] || `de ${label.toLowerCase()}` }]));

  const diffItems = [];
  let earliestDate = null;
  let latestDate = null;

  for (const key of order) {
    const info = metricMap.get(key);
    if (!info) continue;
    const values = metricMeasurements(measurements, key);
    if (values.length < 2) continue;

    const first = values[0];
    const latest = values.at(-1);

    if (!earliestDate || new Date(first.measuredAt) < new Date(earliestDate)) {
      earliestDate = first.measuredAt;
    }
    if (!latestDate || new Date(latest.measuredAt) > new Date(latestDate)) {
      latestDate = latest.measuredAt;
    }

    const firstVal = Number(first[key]);
    const latestVal = Number(latest[key]);
    const diff = Math.round((latestVal - firstVal) * 100) / 100;
    const diffFormatted = `${diff > 0 ? "+" : ""}${diff.toLocaleString("es-ES", { maximumFractionDigits: 1 })} ${info.unit}`;

    diffItems.push({
      key,
      label: info.label,
      unit: info.unit,
      suffix: info.suffix,
      firstVal,
      latestVal,
      diff,
      diffFormatted,
      summaryFragment: `${diffFormatted} ${info.suffix}`,
    });
  }

  if (diffItems.length === 0) return null;

  const elapsedDays = (earliestDate && latestDate) ? Math.max(0, Math.round(
    (Date.parse(`${latestDate.slice(0, 10)}T00:00:00Z`) - Date.parse(`${earliestDate.slice(0, 10)}T00:00:00Z`)) / 86400000,
  )) : 0;

  const summaryPhrase = `Desde su inicio: ${diffItems.map(d => d.summaryFragment).join(" | ")}`;

  return {
    diffItems,
    summaryPhrase,
    earliestDate,
    latestDate,
    elapsedDays,
  };
}

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
const purchaseHistory = document.querySelector("#purchase-history");
const bookingHistory = document.querySelector("#client-booking-history");
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
  const cobosu = client.brand === "COBOSU";
  for (const id of ["open-add-bono", "open-add-bono-top", "btn-renew-bono-banner"]) {
    const button = document.getElementById(id); if (button) button.hidden = cobosu || currentUserRole === "TRAINER";
  }
  let note = document.getElementById("manual-package-info");
  if (!note) { note = document.createElement("p"); note.id = "manual-package-info"; document.querySelector("#profile-name").parentElement.append(note); }
  note.hidden = !cobosu;
  note.textContent = "Cliente Cobosu. Sus bonos se adquieren desde la app; no se añaden manualmente desde el panel.";
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

function currencyText(value, currency = "EUR") {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency }).format(Number(value));
}

function historyDate(value) {
  if (!value) return "Sin fecha";
  return new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function renderPurchaseHistory(data) {
  const debtAmounts = data.debt;
  const debtStatus = document.querySelector("#profile-debt-status");
  const debtAmount = document.querySelector("#profile-debt-amount");
  const debtCard = document.querySelector("#profile-debt-card");
  debtCard.classList.toggle("has-debt", debtAmounts.length > 0);
  debtStatus.textContent = debtAmounts.length ? "Tiene deuda" : "Al corriente";
  debtAmount.textContent = debtAmounts.length
    ? debtAmounts.map(({ currency, amount }) => currencyText(amount, currency)).join(" · ")
    : "Sin pagos pendientes";

  // Renewal Alert Banner & Badge
  const renewalBadge = document.querySelector("#profile-renewal-badge");
  const renewalBanner = document.querySelector("#profile-renewal-banner");
  const renewalBannerTitle = document.querySelector("#profile-renewal-banner-title");
  const renewalBannerText = document.querySelector("#profile-renewal-banner-text");

  if (data.renewalAlert && data.renewalAlert.needsRenewal) {
    if (renewalBadge) {
      renewalBadge.hidden = false;
      renewalBadge.textContent = `⚠️ ${data.renewalAlert.message}`;
    }
    if (renewalBanner) {
      renewalBanner.hidden = false;
      if (renewalBannerTitle) {
        if (data.renewalAlert.type === 'LAST_SESSION') {
          renewalBannerTitle.textContent = "Bono en última sesión";
        } else if (data.renewalAlert.type === 'EXPIRING_SOON') {
          renewalBannerTitle.textContent = "Bono próximo a caducar";
        } else if (data.renewalAlert.type === 'EXPIRED') {
          renewalBannerTitle.textContent = "Bono caducado";
        } else if (data.renewalAlert.type === 'DEPLETED') {
          renewalBannerTitle.textContent = "Bono agotado";
        } else {
          renewalBannerTitle.textContent = "Bono a punto de agotarse";
        }
      }
      if (renewalBannerText) {
        renewalBannerText.textContent = `${data.renewalAlert.serviceName}: ${data.renewalAlert.message}. Toca ofrecer la renovación del bono.`;
      }
    }
  } else {
    if (renewalBadge) renewalBadge.hidden = true;
    if (renewalBanner) renewalBanner.hidden = true;
  }

  purchaseHistory.replaceChildren();
  const packages = data.packages || [];
  const sales = data.sales || [];

  if (!packages.length && !sales.length) {
    const empty = document.createElement("p");
    empty.className = "profile-empty";
    empty.textContent = "Este cliente todavía no tiene bonos ni compras registradas.";
    purchaseHistory.append(empty);
    return;
  }

  // Render Rich Bono Cards
  packages.forEach((pkg) => {
    const card = document.createElement("article");
    card.className = "bono-history-card";

    // Header
    const header = document.createElement("div");
    header.className = "bono-history-header";
    const titleWrap = document.createElement("div");
    titleWrap.className = "bono-history-title-wrap";
    const icon = document.createElement("div");
    icon.className = "bono-history-icon";
    icon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11V9a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2"/><path d="M4 13v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/><path d="M12 7v10"/><path d="M8 7v10"/><path d="M16 7v10"/></svg>';
    const title = document.createElement("h4");
    title.className = "bono-history-title";
    title.textContent = pkg.service.name;
    titleWrap.append(icon, title);

    const badges = document.createElement("div");
    badges.className = "bono-history-badges";
    const status = document.createElement("span");
    status.className = `badge-status badge-${String(pkg.paymentStatus).toLowerCase()}`;
    status.textContent = ({PAGADO:'Pagado',PENDIENTE:'Pago pendiente',FALLIDO:'Pago no completado',REEMBOLSADO:'Reembolsado'})[pkg.paymentStatus] || pkg.paymentStatus;
    badges.append(status);

    if (pkg.needsRenewal) {
      card.classList.add("has-renewal-warning");
      const renewalNotice = document.createElement("span");
      renewalNotice.className = "badge-status badge-renewal-warning";
      renewalNotice.textContent = `⚠️ ${pkg.renewalMessage || "Renovación necesaria"}`;
      badges.append(renewalNotice);
    }

    header.append(titleWrap, badges);

    // Progress Bar
    const progressWrap = document.createElement("div");
    progressWrap.className = "bono-history-progress-wrap";
    const labels = document.createElement("div");
    labels.className = "bono-history-progress-labels";
    const availLabel = document.createElement("span");
    availLabel.innerHTML = `<strong class="bono-sessions-highlight">${pkg.sessionsRemaining}</strong> de ${pkg.sessionsBought} sesiones disponibles`;
    const usedLabel = document.createElement("span");
    usedLabel.textContent = `${pkg.sessionsUsed || 0} completadas · ${pkg.sessionsScheduled || 0} próximas`;
    labels.append(availLabel, usedLabel);

    const track = document.createElement("div");
    track.className = "bono-history-progress-track";
    const fill = document.createElement("div");
    const percent = pkg.sessionsBought > 0 ? Math.min(100, Math.round((pkg.sessionsRemaining / pkg.sessionsBought) * 100)) : 0;
    fill.className = `bono-history-progress-fill${pkg.sessionsRemaining === 0 ? " is-depleted" : ""}`;
    fill.style.width = `${percent}%`;
    track.append(fill);
    progressWrap.append(labels, track);

    // Footer
    const footer = document.createElement("div");
    footer.className = "bono-history-footer";
    const metaLeft = document.createElement("div");
    const validityWeeks = pkg.validityWeeks || (pkg.service && pkg.service.validityWeeks) || 4;
    const expiresFormatted = pkg.expiresAt ? ` · Caduca: ${new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(pkg.expiresAt))}` : '';
    metaLeft.textContent = `${historyDate(pkg.purchasedAt)} · ${pkg.paymentMethod} · ${validityWeeks} semanas de validez${expiresFormatted}`;
    const amount = document.createElement("strong");
    amount.className = "bono-history-amount";
    amount.textContent = currencyText(pkg.totalAmount, "EUR");
    footer.append(metaLeft, amount);

    if(pkg.sale){const balance=document.createElement('p');balance.textContent=`Cobrado: ${currencyText(pkg.sale.paidAmount)} · Pendiente: ${currencyText(pkg.sale.outstandingAmount)}`;footer.append(balance);}
    if(currentUserRole!=='TRAINER'&&pkg.paymentStatus!=='PAGADO'){
      const pay=document.createElement('button');pay.type='button';pay.className='profile-secondary-button';pay.textContent='Registrar pago del bono';
      pay.onclick=async()=>{pay.disabled=true;try{const r=await fetch('/api/service-packages/'+encodeURIComponent(pkg.id)+'/billing',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});const result=await r.json();if(!r.ok)throw Error(result.error||'No se pudo abrir el cobro.');window.location.href='/ventas.html?client='+encodeURIComponent(clientId);}catch(error){showProfileToast(error.message);pay.disabled=false;}};
      footer.append(pay);
    }
    card.append(header, progressWrap, footer);
    purchaseHistory.append(card);
  });

  // Sales (if any)
  sales.filter(sale=>!packages.some(pkg=>pkg.saleId===sale.id)).forEach((sale) => {
    const item = document.createElement("article");
    item.className = "client-history-item";
    const details = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = sale.lines.map((line) => `${line.description} × ${Number(line.quantity)}`).join(", ") || "Venta de productos";
    const metadata = document.createElement("small");
    metadata.textContent = `${historyDate(sale.soldAt || sale.createdAt)} · Pendiente: ${currencyText(sale.outstandingAmount || 0)} · ${sale.payments.map((p) => `${p.kind === 'REFUND' ? 'Dinero devuelto' : 'Cobro'} ${currencyText(p.amount)} · ${{EFECTIVO:'Efectivo',TARJETA:'Tarjeta',BIZUM:'Bizum'}[p.method] || p.method} · ${historyDate(p.paidAt)}`).join(' · ') || 'Sin pagos registrados'}`;
    details.append(title, metadata);
    const summary = document.createElement("div");
    summary.className = "client-history-summary";
    const amount = document.createElement("strong");
    amount.textContent = currencyText(sale.totalAmount, sale.currency);
    const status = document.createElement("small");
    status.className = `badge-status badge-${String(sale.status).toLowerCase()}`;
    status.textContent = `${({COMPLETADA:'Venta confirmada',CANCELADA:'Venta anulada',REEMBOLSADA:'Venta devuelta'})[sale.status] || sale.status} · ${({PAGADO:'Pagado',PARCIAL:'Pago parcial',PENDIENTE:'Pago pendiente',SIN_VERIFICAR:'Sin verificar'})[sale.paymentStatus] || sale.paymentStatus}`;
    summary.append(amount, status);
    item.append(details, summary);
    purchaseHistory.append(item);
  });
}

function renderBookingHistory(bookings) {
  bookingHistory.replaceChildren();
  if (!bookings.length) {
    const empty = document.createElement("p");
    empty.className = "profile-empty";
    empty.textContent = "Este cliente todavía no tiene sesiones registradas.";
    bookingHistory.append(empty);
    return;
  }
  for (const booking of bookings) {
    const item = document.createElement("article");
    item.className = "client-history-item";
    const details = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = booking.service.name;
    const metadata = document.createElement("small");
    metadata.textContent = historyDate(booking.startTime);
    details.append(title, metadata);
    const status = document.createElement("small");
    status.className = "client-history-summary";
    status.textContent = `${booking.status} · ${booking.attendance}`;
    item.append(details, status);
    bookingHistory.append(item);
  }
}

async function loadPurchaseHistory() {
  try {
    const response = await fetch(`/api/clients/${encodeURIComponent(clientId)}/service-history`, { headers: { Accept: "application/json" } });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "No se pudo cargar el historial.");
    renderPurchaseHistory(data);
    const me=await (await fetch('/api/me')).json();
    if(['ADMIN','RECEPTION'].includes(me.role)&&!document.querySelector('#profile-debt-card [data-payment-link]')){
      const link=document.createElement('a');link.dataset.paymentLink='true';link.href='/ventas.html?client='+encodeURIComponent(clientId);link.textContent='Consultar ventas y registrar pagos ↗';
      document.querySelector('#profile-debt-card').append(link);
    }
    renderBookingHistory(data.bookings);
  } catch (error) {
    for (const container of [purchaseHistory, bookingHistory]) {
      const message = document.createElement("p");
      message.className = "profile-empty";
      message.textContent = error instanceof Error ? error.message : "No se pudo cargar el historial.";
      container.replaceChildren(message);
    }
  }
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

  // Global Evolution in Header & Banner
  const headerEvolution = document.querySelector("#measurements-header-evolution");
  const bannerEvolution = document.querySelector("#measurements-evolution-banner");
  const phraseEvolution = document.querySelector("#measurements-evolution-phrase");
  const timeEvolution = document.querySelector("#measurements-evolution-time");
  const chipsEvolution = document.querySelector("#measurements-evolution-chips");

  const evolution = getGlobalEvolution(measurements);

  if (evolution && evolution.diffItems.length > 0) {
    if (headerEvolution) {
      headerEvolution.hidden = false;
      headerEvolution.classList.remove("is-baseline");
      const headerText = evolution.diffItems.length <= 3
        ? evolution.summaryPhrase
        : `Desde su inicio: ${evolution.diffItems.slice(0, 3).map(d => d.summaryFragment).join(" | ")} (+${evolution.diffItems.length - 3} más)`;
      headerEvolution.textContent = headerText;
      headerEvolution.title = evolution.summaryPhrase;
    }
    if (bannerEvolution) {
      bannerEvolution.hidden = false;
      if (phraseEvolution) phraseEvolution.textContent = evolution.summaryPhrase;
      if (timeEvolution) {
        timeEvolution.textContent = `${evolution.elapsedDays} ${evolution.elapsedDays === 1 ? "día" : "días"} · Desde ${shortDateText(evolution.earliestDate)}`;
      }
      if (chipsEvolution) {
        chipsEvolution.replaceChildren();
        for (const item of evolution.diffItems) {
          const chip = document.createElement("div");
          const trendClass = item.diff < 0 ? "is-down" : item.diff > 0 ? "is-up" : "is-neutral";
          chip.className = `measurements-evolution-chip ${trendClass}`;
          const arrow = item.diff < 0 ? "↓" : item.diff > 0 ? "↑" : "=";
          chip.innerHTML = `
            <span class="chip-metric">${item.label}</span>
            <strong class="chip-diff">${arrow} ${item.diffFormatted}</strong>
            <small class="chip-range">${item.firstVal.toLocaleString("es-ES", { maximumFractionDigits: 1 })} → ${item.latestVal.toLocaleString("es-ES", { maximumFractionDigits: 1 })} ${item.unit}</small>
          `;
          chipsEvolution.append(chip);
        }
      }
    }
  } else {
    if (measurements.length === 1) {
      if (headerEvolution) {
        headerEvolution.hidden = false;
        headerEvolution.classList.add("is-baseline");
        headerEvolution.textContent = "1.ª medición registrada";
        headerEvolution.title = "Línea base registrada. Con la próxima medición verás la evolución.";
      }
    } else {
      if (headerEvolution) headerEvolution.hidden = true;
    }
    if (bannerEvolution) bannerEvolution.hidden = true;
  }

  if (!latest) {
    const empty = document.createElement("p");
    empty.className = "profile-empty";
    empty.textContent = "Aún no hay medidas. Añade la primera para empezar a comparar.";
    measurementSummary.append(empty);
    return;
  }

  for (const [key, label, unit] of metrics) {
    const card = document.createElement("div");
    card.className = "measurement-card-profile";
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
  if (!currentUserRole) await fetchUserRole();
  if (!clientId) { showError("No encontramos esta ficha. Vuelve a clientes y elige una persona."); return; }
  try {
    const response = await fetch(`/api/clients/${encodeURIComponent(clientId)}/progress`, { headers: { Accept: "application/json" } });
    if (response.status === 401) {
      const returnTo = `${window.location.pathname}${window.location.search}`;
      window.location.assign(`/login.html?returnTo=${encodeURIComponent(returnTo)}`);
      return;
    }
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "No se pudo cargar esta ficha.");
    renderProgress(data); loading.hidden = true; view.hidden = false;
    void loadPurchaseHistory();
    void loadBonoServices();
  } catch (error) {
    showError(error instanceof Error && error.message
      ? error.message
      : "No se pudo cargar esta ficha. Inténtalo de nuevo.");
  }
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

// --- Client Bono Management ---
const addBonoDialog = document.querySelector("#add-bono-dialog");
const addBonoForm = document.querySelector("#add-bono-form");
const openAddBonoBtn = document.querySelector("#open-add-bono");
const openAddBonoTopBtn = document.querySelector("#open-add-bono-top");
const closeAddBonoBtn = document.querySelector("#close-add-bono");
const cancelAddBonoBtn = document.querySelector("#cancel-add-bono");
const bonoServiceSelect = document.querySelector("#bono-service-select");
const bonoSessionsInput = document.querySelector("#bono-sessions-bought");
const bonoAmountInput = document.querySelector("#bono-total-amount");
const bonoPaymentMethod = document.querySelector("#bono-payment-method");
const bonoPaymentStatus = document.querySelector("#bono-payment-status");
const bonoNotesInput = document.querySelector("#bono-notes");
const bonoFormError = document.querySelector("#bono-form-error");
const saveAddBonoBtn = document.querySelector("#save-add-bono");

const bonoCardsGrid = document.querySelector("#bono-cards-grid");
const bonoCalcCallout = document.querySelector("#bono-calc-callout");
const bonoCalcSessions = document.querySelector("#bono-calc-sessions");
const bonoCalcUnitRate = document.querySelector("#bono-calc-unit-rate");
const bonoCalcDuration = document.querySelector("#bono-calc-duration");

const bonoTicketPreview = document.querySelector("#bono-ticket-preview");
const ticketServiceName = document.querySelector("#ticket-service-name");
const ticketClientName = document.querySelector("#ticket-client-name");
const ticketModalityBadge = document.querySelector("#ticket-modality-badge");
const ticketDurationBadge = document.querySelector("#ticket-duration-badge");
const ticketTotalPrice = document.querySelector("#ticket-total-price");
const ticketUnitRate = document.querySelector("#ticket-unit-rate");
const ticketStatusPill = document.querySelector("#ticket-status-pill");

let activeServicesList = [];

async function loadBonoServices() {
  try {
    const response = await fetch("/api/services?activeOnly=true", { headers: { Accept: "application/json" } });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "No se pudieron cargar los servicios.");
    activeServicesList = data.services || [];
    renderBonoServices();
    renderBonoCardsGrid();
  } catch (error) {
    if (bonoCardsGrid) {
      bonoCardsGrid.innerHTML = '<p class="bono-cards-loading error">No se pudo cargar el catálogo de bonos.</p>';
    }
  }
}

function renderBonoServices() {
  if (!bonoServiceSelect) return;
  bonoServiceSelect.replaceChildren();
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = activeServicesList.length ? "Selecciona un servicio…" : "No hay servicios disponibles";
  bonoServiceSelect.append(placeholder);

  for (const s of activeServicesList) {
    const opt = document.createElement("option");
    opt.value = s.id;
    const modalityText = s.modality === "DUAL" ? " [Dúo]" : " [Individual]";
    opt.textContent = `${s.name}${modalityText} — ${s.trainingCount} ses. · ${currencyText(s.price)}`;
    bonoServiceSelect.append(opt);
  }
}

function renderBonoCardsGrid() {
  if (!bonoCardsGrid) return;
  bonoCardsGrid.replaceChildren();

  if (!activeServicesList.length) {
    bonoCardsGrid.innerHTML = '<p class="bono-cards-loading">No hay servicios o bonos activos en el catálogo.</p>';
    return;
  }

  activeServicesList.forEach((service, index) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "bono-select-card";
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
    price.textContent = currencyText(service.price);
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
      selectBonoCard(service.id);
    });

    bonoCardsGrid.append(card);
  });
}

function selectBonoCard(serviceId) {
  if (!bonoCardsGrid) return;
  bonoCardsGrid.querySelectorAll(".bono-select-card").forEach((c) => {
    c.classList.toggle("is-selected", c.dataset.serviceId === serviceId);
  });
  if (bonoServiceSelect) {
    bonoServiceSelect.value = serviceId;
  }
  const service = activeServicesList.find((s) => s.id === serviceId);
  if (service) {
    if (bonoSessionsInput) bonoSessionsInput.value = service.trainingCount || 1;
    if (bonoAmountInput) bonoAmountInput.value = Number(service.price).toFixed(2);
  }
  updateBonoCalculation();
}

function updateBonoCalculation() {
  const selected = activeServicesList.find(service => service.id === bonoServiceSelect?.value);
  for (const id of ["bono-validity-preview", "ticket-validity"]) { const el = document.getElementById(id); if (el) el.textContent = selected ? `${selected.validityWeeks || 4} semanas de validez` : "Según servicio"; }
  const selectedId = bonoServiceSelect?.value;
  const service = activeServicesList.find((s) => s.id === selectedId);
  const sessions = Number(bonoSessionsInput?.value || 0);
  const total = Number(bonoAmountInput?.value || 0);

  if (service) {
    if (bonoCalcCallout) {
      bonoCalcCallout.hidden = false;
      if (bonoCalcSessions) bonoCalcSessions.textContent = `${sessions} ${sessions === 1 ? "sesión" : "sesiones"}`;
      if (bonoCalcDuration) bonoCalcDuration.textContent = `${service.durationMin || 60} min`;
      if (bonoCalcUnitRate) {
        if (sessions > 0 && !isNaN(total) && total >= 0) {
          const rate = total / sessions;
          bonoCalcUnitRate.textContent = `${rate.toFixed(2)} €/sesión`;
        } else {
          bonoCalcUnitRate.textContent = "—";
        }
      }
    }

    if (bonoTicketPreview) {
      bonoTicketPreview.hidden = false;
      if (ticketServiceName) ticketServiceName.textContent = service.name;
      if (ticketClientName && progress?.client) {
        ticketClientName.textContent = `Cliente: ${progress.client.firstName} ${progress.client.lastName}`;
      }
      if (ticketModalityBadge) ticketModalityBadge.textContent = service.modality === "DUAL" ? "Dúo / Pareja" : "Individual";
      if (ticketDurationBadge) ticketDurationBadge.textContent = `${service.durationMin || 60} min / sesión`;
      if (ticketTotalPrice) ticketTotalPrice.textContent = currencyText(total);
      if (ticketUnitRate) {
        const rate = sessions > 0 ? (total / sessions).toFixed(2) : "0.00";
        ticketUnitRate.textContent = `${rate} €/sesión · ${sessions} ${sessions === 1 ? "sesión" : "sesiones"}`;
      }
      if (ticketStatusPill && bonoPaymentStatus) {
        const isPaid = bonoPaymentStatus.value === "PAGADO";
        ticketStatusPill.className = `ticket-status ${isPaid ? "status-pill-pagado" : "status-pill-pendiente"}`;
        ticketStatusPill.textContent = isPaid ? "Cobrado / Pagado" : "Pendiente de cobro";
      }
    }
  } else {
    if (bonoCalcCallout) bonoCalcCallout.hidden = true;
    if (bonoTicketPreview) bonoTicketPreview.hidden = true;
  }
}

function openAddBonoModal() {
  if (progress?.client?.brand === "COBOSU") { showProfileToast("Los bonos Cobosu se adquieren desde la app."); return; }
  if (!addBonoDialog) return;
  addBonoForm.reset();
  if (bonoFormError) bonoFormError.hidden = true;
  if (bonoCalcCallout) bonoCalcCallout.hidden = true;
  if (bonoTicketPreview) bonoTicketPreview.hidden = true;

  // Reset payment chips to default (TARJETA & PAGADO)
  document.querySelectorAll("#bono-payment-chips .payment-chip").forEach((btn) => {
    btn.classList.toggle("is-selected", btn.dataset.value === "TARJETA");
  });
  if (bonoPaymentMethod) bonoPaymentMethod.value = "TARJETA";

  document.querySelectorAll("#bono-status-chips .payment-chip").forEach((btn) => {
    btn.classList.toggle("is-selected", btn.dataset.value === "PAGADO");
  });
  if (bonoPaymentStatus) bonoPaymentStatus.value = "PAGADO";

  if (progress?.client) {
    const fullName = `${progress.client.firstName} ${progress.client.lastName}`.trim();
    const titleEl = document.querySelector("#add-bono-title");
    if (titleEl) titleEl.textContent = `Añadir bono a ${fullName}`;
  }
  if (!activeServicesList.length) {
    void loadBonoServices();
  } else {
    renderBonoCardsGrid();
  }
  addBonoDialog.showModal();
}

// Stepper click handler
addBonoDialog?.addEventListener("click", (event) => {
  const stepBtn = event.target.closest(".bono-step-btn");
  if (!stepBtn) return;
  const step = Number(stepBtn.dataset.step);
  const current = Number(bonoSessionsInput.value || 1);
  bonoSessionsInput.value = String(Math.max(1, Math.min(500, current + step)));
  updateBonoCalculation();
});

// Payment method chips click handler
document.querySelector("#bono-payment-chips")?.addEventListener("click", (event) => {
  const btn = event.target.closest(".payment-chip");
  if (!btn) return;
  document.querySelectorAll("#bono-payment-chips .payment-chip").forEach((b) => b.classList.remove("is-selected"));
  btn.classList.add("is-selected");
  if (bonoPaymentMethod) bonoPaymentMethod.value = btn.dataset.value;
  updateBonoCalculation();
});

// Payment status chips click handler
document.querySelector("#bono-status-chips")?.addEventListener("click", (event) => {
  const btn = event.target.closest(".payment-chip");
  if (!btn) return;
  document.querySelectorAll("#bono-status-chips .payment-chip").forEach((b) => b.classList.remove("is-selected"));
  btn.classList.add("is-selected");
  if (bonoPaymentStatus) bonoPaymentStatus.value = btn.dataset.value;
  updateBonoCalculation();
});

if (openAddBonoBtn) openAddBonoBtn.addEventListener("click", openAddBonoModal);
if (openAddBonoTopBtn) openAddBonoTopBtn.addEventListener("click", openAddBonoModal);
const renewBonoBannerBtn = document.querySelector("#btn-renew-bono-banner");
if (renewBonoBannerBtn) renewBonoBannerBtn.addEventListener("click", openAddBonoModal);
if (closeAddBonoBtn) closeAddBonoBtn.addEventListener("click", () => addBonoDialog.close());
if (cancelAddBonoBtn) cancelAddBonoBtn.addEventListener("click", () => addBonoDialog.close());

if (bonoServiceSelect) {
  bonoServiceSelect.addEventListener("change", () => {
    selectBonoCard(bonoServiceSelect.value);
  });
}

if (bonoSessionsInput) bonoSessionsInput.addEventListener("input", updateBonoCalculation);
if (bonoAmountInput) bonoAmountInput.addEventListener("input", updateBonoCalculation);

if (addBonoForm) {
  addBonoForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (currentUserRole === "TRAINER" || progress?.client?.brand === "COBOSU") return;
    if (bonoFormError) bonoFormError.hidden = true;
    if (!addBonoForm.reportValidity()) return;

    if (!bonoServiceSelect.value) {
      if (bonoFormError) {
        bonoFormError.textContent = "Por favor, selecciona un servicio o pack antes de guardar.";
        bonoFormError.hidden = false;
      }
      return;
    }

    if (saveAddBonoBtn) {
      saveAddBonoBtn.disabled = true;
      saveAddBonoBtn.textContent = "Guardando bono…";
    }

    addBonoForm.dataset.requestKey ||= crypto.randomUUID();
    const payload = {
      requestKey:addBonoForm.dataset.requestKey,
      serviceId: bonoServiceSelect.value,
      sessionsBought: Number(bonoSessionsInput.value),
      totalAmount: Number(bonoAmountInput.value),
      paymentMethod: bonoPaymentMethod.value,
      paymentStatus: bonoPaymentStatus.value,
      notes: bonoNotesInput?.value.trim() || undefined,
    };

    try {
      const response = await fetch(`/api/clients/${encodeURIComponent(clientId)}/service-packages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "No se pudo añadir el bono al cliente.");
      }
      delete addBonoForm.dataset.requestKey;
      addBonoDialog.close();
      showProfileToast("Bono añadido al cliente correctamente.");
      document.querySelector(".client-purchases-section")?.setAttribute("open", "");
      await loadPurchaseHistory();
    } catch (error) {
      if (bonoFormError) {
        bonoFormError.textContent = error instanceof Error ? error.message : "Error al guardar el bono.";
        bonoFormError.hidden = false;
      }
    } finally {
      if (saveAddBonoBtn) {
        saveAddBonoBtn.disabled = false;
        saveAddBonoBtn.textContent = "Guardar bono";
      }
    }
  });
}

loadProfile();

// Refresh debts independently of the client's editable profile fields.
window.TrainersPoint.poll(async()=>{
 if(document.hidden||!clientId)return;
 try{const response=await fetch(`/api/clients/${encodeURIComponent(clientId)}/service-history`);if(response.ok)renderPurchaseHistory(await response.json());}catch{}
},5000);
