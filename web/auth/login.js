const portalParam = new URLSearchParams(location.search).get('portal');
const loginPortal = portalParam === 'office' ? 'OFFICE' : portalParam === 'client' ? 'CLIENT' : 'TRAINER';
if (loginPortal !== 'TRAINER') {
  document.getElementById('login-title').textContent = loginPortal === 'OFFICE' ? 'Administración y recepción' : 'Acceso de clientes';
  document.getElementById('other-access').href = '/login.html';
  document.getElementById('other-access').textContent = 'Acceso de entrenadores / trabajadores →';
  if (loginPortal === 'OFFICE') document.getElementById('recovery-instructions').textContent = 'Consulta el registro interno de accesos que custodia el centro o solicita a administración un restablecimiento. Ese archivo no está disponible desde esta página.';
}
document.getElementById('login-form').addEventListener('submit', async event => {
  event.preventDefault();
  const button = document.getElementById('login-submit'), error = document.getElementById('login-error');
  button.disabled = true; error.hidden = true;
  try {
    const response = await fetch('/api/login', { method:'POST', headers:{'Content-Type':'application/json','X-Calendar-Gym':localStorage.getItem('calendar-selected-gym')||''}, body:JSON.stringify({portal:loginPortal,username:document.getElementById('username').value,password:document.getElementById('password').value}) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    sessionStorage.removeItem('calendar-admin-token');
    sessionStorage.setItem('calendar-user-token', result.token);
    const returnTo = new URLSearchParams(location.search).get('returnTo');
    const safeReturnTo = returnTo && /^\/clientes\/[0-9a-f-]+\/ficha(?:\?.*)?$/i.test(returnTo)
      ? returnTo
      : '';
    location.href = result.mustChangePassword
      ? 'change-password.html'
      : safeReturnTo || (result.role === 'CLIENT' ? 'mis-reservas.html' : result.role === 'TRAINER' ? 'index.html' : 'inicio.html');
  } catch (e) {
    error.replaceChildren(document.createTextNode(e.message || 'No se pudo conectar.'));
    if (e.message?.includes('otro acceso')) {
      const link=document.createElement('a');
      link.href=loginPortal==='OFFICE'?'/login.html':'/login.html?portal=office';
      link.textContent=loginPortal==='OFFICE'?'Ir al acceso de entrenadores / trabajadores →':'Ir al acceso de administración y recepción →';
      link.style.display='block';link.style.marginTop='12px';error.append(link);
    }
    error.hidden=false;
  }
  finally { button.disabled=false; }
});