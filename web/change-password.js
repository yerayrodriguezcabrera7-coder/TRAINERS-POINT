const form = document.getElementById('password-form');
form.addEventListener('submit', async event => {
  event.preventDefault();
  const button = document.getElementById('password-submit');
  const error = document.getElementById('password-error');
  const token = sessionStorage.getItem('calendar-user-token');
  const gym = localStorage.getItem('calendar-selected-gym') || '';
  button.disabled = true;
  error.hidden = true;
  try {
    if (!token) throw new Error('Inicia sesión para continuar.');
    const response = await fetch('/api/password/change', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token, 'X-Calendar-Gym': gym },
      body: JSON.stringify({
        currentPassword: document.getElementById('current-password').value,
        newPassword: document.getElementById('new-password').value,
        confirmPassword: document.getElementById('confirm-password').value,
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.details?.map(issue => issue.message).join(' · ') || result.error);
    const identityResponse = await fetch('/api/me', { headers: { Authorization: 'Bearer ' + token, 'X-Calendar-Gym': gym } });
    const identity = await identityResponse.json();
    if (!identityResponse.ok) throw new Error(identity.error || 'No se pudo verificar la sesión.');
    location.href = identity.role === 'CLIENT' ? 'mis-reservas.html' : identity.role === 'TRAINER' ? 'index.html' : 'inicio.html';
  } catch (e) {
    error.textContent = e.message || 'No se pudo cambiar la contraseña.';
    error.hidden = false;
  } finally {
    button.disabled = false;
  }
});
