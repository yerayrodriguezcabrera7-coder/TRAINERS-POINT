document.getElementById('login-form').addEventListener('submit', async event => {
  event.preventDefault();
  const button = document.getElementById('login-submit'), error = document.getElementById('login-error');
  button.disabled = true; error.hidden = true;
  try {
    const response = await fetch('/api/login', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({username:document.getElementById('username').value,password:document.getElementById('password').value}) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    sessionStorage.removeItem('calendar-admin-token');
    sessionStorage.setItem('calendar-user-token', result.token);
    location.href = result.mustChangePassword
      ? 'change-password.html'
      : result.role === 'TRAINER' ? 'index.html' : 'inicio.html';
  } catch (e) { error.textContent=e.message || 'No se pudo conectar.'; error.hidden=false; }
  finally { button.disabled=false; }
});