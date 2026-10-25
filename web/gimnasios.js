(() => {
  const list = document.querySelector('#gym-list');
  const dialog = document.querySelector('#create-dialog');
  const form = document.querySelector('#create-form');
  const token = () => sessionStorage.getItem('calendar-user-token') || window.CALENDAR_DEV_TOKEN || sessionStorage.getItem('calendar-admin-token') || '';
  async function load() {
    const response = await fetch('/api/gyms');
    const data = await response.json();
    if (!response.ok) throw Error(data.error || 'No se pudieron cargar los gimnasios.');
    document.querySelector('#count').textContent = `${data.gyms.length} sede${data.gyms.length === 1 ? '' : 's'}`;
    list.innerHTML = data.gyms.map(gym => `<article class="gym-card ${gym.id === localStorage.getItem('calendar-selected-gym') ? 'selected' : ''}"><div><strong>${escapeHtml(gym.name)}</strong><small>${gym.id}</small></div><button data-select="${escapeHtml(gym.id)}" class="outline-button">${gym.id === localStorage.getItem('calendar-selected-gym') ? 'Gimnasio activo' : 'Usar este gimnasio'}</button></article>`).join('');
    list.querySelectorAll('[data-select]').forEach(button => button.addEventListener('click', () => { localStorage.setItem('calendar-selected-gym', button.dataset.select); location.reload(); }));
  }
  const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  function message(text, error = false) { const node = document.querySelector('#notice'); node.textContent = text; node.hidden = false; node.classList.toggle('error', error); }
  document.querySelector('#open-create').addEventListener('click', () => { form.reset(); document.querySelector('#form-error').hidden = true; dialog.showModal(); });
  document.querySelector('#close-create').addEventListener('click', () => dialog.close());
  document.querySelector('#cancel-create').addEventListener('click', () => dialog.close());
  form.addEventListener('submit', async event => {
    event.preventDefault();
    try {
      const response = await fetch('/api/gyms', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` }, body: JSON.stringify({ name: form.elements.name.value }) });
      const data = await response.json(); if (!response.ok) throw Error(data.error || 'No se pudo crear el gimnasio.');
      localStorage.setItem('calendar-selected-gym', data.gym.id); dialog.close(); message('Gimnasio creado y seleccionado.'); await load();
    } catch (error) { const node = document.querySelector('#form-error'); node.textContent = error.message; node.hidden = false; }
  });
  load().catch(error => message(error.message, true));
})();
