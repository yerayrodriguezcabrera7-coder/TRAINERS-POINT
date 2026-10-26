const grid = document.querySelector("#gym-grid");
const search = document.querySelector("#gym-search");
const dialog = document.querySelector("#gym-create-dialog");
const form = document.querySelector("#gym-create-form");
const error = document.querySelector("#gym-create-error");
const photoInput = document.querySelector("#gym-photo");
const photoPreview = document.querySelector("#gym-photo-preview");
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

function render() {
  const term = search.value.trim().toLocaleLowerCase("es");
  const visible = gyms.filter((gym) => `${gym.name} ${gym.city ?? ""} ${gym.province ?? ""}`.toLocaleLowerCase("es").includes(term));
  grid.replaceChildren();
  if (!visible.length) {
    const empty = document.createElement("div"); empty.className = "gym-empty";
    empty.innerHTML = `<strong>${term ? "No hay sedes que coincidan" : "Aún no hay gimnasios"}</strong><span>${term ? "Prueba con otro término de búsqueda." : "Añade tu primera sede para empezar."}</span>`;
    grid.append(empty); return;
  }
  visible.forEach((gym) => {
    const card = document.createElement("article"); card.className = "gym-directory-card";
    const icon = document.createElement("div"); icon.className = "gym-mark"; icon.textContent = "⌂";
    const body = document.createElement("div"); body.className = "gym-card-body";
    let visual = icon;
    if (gym.photoData) { visual = document.createElement("img"); visual.className = "gym-photo"; visual.src = gym.photoData; visual.alt = `Foto de ${gym.name}`; }
    const name = document.createElement("h3"); name.textContent = gym.name;
    const location = document.createElement("p"); location.textContent = [gym.address, gym.city, gym.province].filter(Boolean).join(" · ") || "Ubicación no especificada";
    const footer = document.createElement("div"); footer.className = "gym-card-footer";
    const clients = document.createElement("strong"); clients.textContent = `${gym._count.clients} ${gym._count.clients === 1 ? "cliente" : "clientes"}`;
    const link = document.createElement("a"); link.href = `/clientes?gymId=${encodeURIComponent(gym.id)}`; link.textContent = "Ver clientes ↗";
    const actions = document.createElement("span"); actions.className = "gym-card-actions";
    const remove = document.createElement("button"); remove.type = "button"; remove.className = "gym-delete"; remove.textContent = "Borrar"; remove.setAttribute("aria-label", `Borrar ${gym.name}`);
    remove.addEventListener("click", () => deleteGym(gym, remove));
    actions.append(link, remove); footer.append(clients, actions); body.append(name, location, footer); card.append(visual, body); grid.append(card);
  });
}

async function deleteGym(gym, button) {
  if (!window.confirm(`¿Quieres borrar la sede "${gym.name}"?`)) return;
  button.disabled = true;
  try {
    const response = await fetch(`/api/gyms/${encodeURIComponent(gym.id)}`, { method: "DELETE", headers: { Accept: "application/json" } });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || "No se pudo borrar la sede.");
    gyms = gyms.filter((item) => item.id !== gym.id); render();
    const totalClients = gyms.reduce((sum, item) => sum + item._count.clients, 0);
    document.querySelector("#gym-count").textContent = `(${gyms.length})`;
    document.querySelector("#active-count").textContent = gyms.length;
    document.querySelector("#client-count").textContent = totalClients;
  } catch (err) { window.alert(err.message); button.disabled = false; }
}

async function load() {
  try {
    const response = await fetch("/api/gyms", { headers: { Accept: "application/json" } });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || "No se pudieron cargar las sedes.");
    gyms = data.gyms; const totalClients = gyms.reduce((sum, gym) => sum + gym._count.clients, 0);
    document.querySelector("#gym-count").textContent = `(${gyms.length})`; document.querySelector("#active-count").textContent = gyms.length;
    document.querySelector("#client-count").textContent = totalClients; render();
  } catch (err) { grid.innerHTML = `<p class="list-message error">${err.message}</p>`; }
}

search.addEventListener("input", render);
document.querySelector("#open-gym-create").addEventListener("click", () => { form.reset(); photoPreview.hidden = true; photoPreview.removeAttribute("src"); error.hidden = true; dialog.showModal(); form.elements.name.focus(); });
document.querySelector("#close-gym-create").addEventListener("click", () => dialog.close());
document.querySelector("#cancel-gym-create").addEventListener("click", () => dialog.close());
photoInput.addEventListener("change", () => { const file = photoInput.files[0]; if (!file) { photoPreview.hidden = true; return; } photoPreview.src = URL.createObjectURL(file); photoPreview.hidden = false; });
form.addEventListener("submit", async (event) => {
  event.preventDefault(); error.hidden = true; if (!form.reportValidity()) return;
  const button = document.querySelector("#save-gym"); button.disabled = true; button.textContent = "Guardando…";
  try { const body = Object.fromEntries(new FormData(form).entries()); delete body.photo; const file = photoInput.files[0]; if (file) { if (!file.type.startsWith("image/") || file.size > 8 * 1024 * 1024) throw new Error("Selecciona una imagen de hasta 8 MB."); body.photoData = await imageToDataUrl(file); } const response = await fetch("/api/gyms", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "No se pudo guardar el gimnasio."); dialog.close(); await load(); }
  catch (err) { error.textContent = err.message; error.hidden = false; }
  finally { button.disabled = false; button.textContent = "Guardar gimnasio"; }
});
load();
