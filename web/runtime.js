// Live Server/file:// keeps the independent demo. The backend serves its own runtime.js.
window.CALENDAR_SERVER = false;
(() => {
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url.startsWith('/api/')) {
      const headers = new Headers(init.headers || (typeof input !== 'string' ? input.headers : undefined));
      const selected = localStorage.getItem('calendar-selected-gym');
      if (selected) headers.set('X-Calendar-Gym', selected);
      init = { ...init, headers };
    }
    return originalFetch(input, init);
  };
})();
