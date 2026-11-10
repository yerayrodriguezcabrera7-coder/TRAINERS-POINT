window.CALENDAR_SERVER = true;
(() => {
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init = {}) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const target = new URL(url, location.href);
    if (target.origin === location.origin && target.pathname.startsWith('/api/')) {
      const headers = new Headers(init.headers || (typeof input === 'object' ? input.headers : undefined));
      const gym = localStorage.getItem('calendar-selected-gym');
      if (gym) headers.set('X-Calendar-Gym', gym);
      const token = sessionStorage.getItem('calendar-user-token') || sessionStorage.getItem('calendar-admin-token') || window.CALENDAR_DEV_TOKEN || '';
      if (token && !headers.has('Authorization')) headers.set('Authorization', 'Bearer ' + token);
      init = { ...init, headers };
    }
    return originalFetch(input, init);
  };
})();
