(async () => {
    const $ = id => document.getElementById(id), esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    async function api(path, method = 'GET', body) { const r = await fetch('/api/' + path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); const d = await r.json(); if (!r.ok)
        throw Error(d.error); return d; }
    async function load() {
        const [data, credits, me] = await Promise.all([api('state'), api('recoveries'), api('me')]);
        const name = (kind, id) => esc(data[kind].find(x => x.id === id)?.name || id);
        const states = { RESCHEDULE_PENDING: 'Pendiente de reprogramación', PENDING: 'Pendiente de recuperar', SCHEDULED: 'Recuperación programada', COMPLETED: 'Recuperada', FORFEITED: 'Resuelta sin recuperación' };
        $('credits').innerHTML = credits.map(c => `<article class="recovery-row"><div><h3>${name('clients', c.clientId)}</h3><p>${name('services', c.serviceId)}</p><span class="recovery-status">${esc(states[c.status] || c.status)}</span></div></article>`).join('') || '<p class="recovery-empty">No hay sesiones pendientes de recuperar.</p>';
        const today = new Intl.DateTimeFormat('en-CA', { timeZone:data.timezone || 'Europe/Madrid',year:'numeric',month:'2-digit',day:'2-digit' }).format(new Date());
        $('sessions').innerHTML = data.bookings.filter(b => b.status === 'CONFIRMED' && b.date >= today).sort((a,b)=>(a.date+a.start).localeCompare(b.date+b.start)).map(b => `<article class="recovery-row"><div><h3>${name('clients', b.clientId)}</h3><p>${esc(b.date.split('-').reverse().join('/'))} · ${esc(b.start)} — ${esc(b.end)}</p><p>${name('services', b.serviceId)}</p></div>${!b.recoveryId && ['ADMIN', 'TRAINER'].includes(me.role) ? `<button type="button" class="outline-button" data-defer="${esc(b.id)}">Dejar pendiente</button>` : ''}</article>`).join('') || '<p class="recovery-empty">No hay próximas sesiones confirmadas.</p>';
        $('sessions').onclick = async (e) => { const id = e.target.dataset.defer; if (!id)
            return; try {
            await api('bookings/' + encodeURIComponent(id) + '/defer', 'POST', {});
            await load();
        }
        catch (err) {
            if (me.role === 'ADMIN' && err.message.includes('dos horas') && confirm('El aviso llega con menos de dos horas. ¿Autorizar una excepción?')) {
                try {
                    await api('bookings/' + encodeURIComponent(id) + '/defer', 'POST', { exception: true });
                    await load();
                }
                catch (x) {
                    $('notice').textContent = x.message;
                }
            }
            else
                $('notice').textContent = err.message;
        } };
    }
    $('refresh-recoveries').onclick = async () => { $('refresh-recoveries').disabled=true; $('notice').textContent=''; try { await load(); } catch(e) { $('notice').textContent=e.message; } finally { $('refresh-recoveries').disabled=false; } };
    try {
        await load();
    }
    catch (e) {
        $('notice').textContent = e.message;
    }
})();
