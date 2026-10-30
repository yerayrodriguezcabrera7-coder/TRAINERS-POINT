window.CALENDAR_SERVER = true;
(() => {
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url.startsWith('/api/')) {
      const headers = new Headers(init.headers || (typeof input !== 'string' ? input.headers : undefined));
      init = { ...init, headers };
    }
    return originalFetch(input, init);
  };
})();
