(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else root.TrainersPoint = { ...root.TrainersPoint, poll: factory(root) };
})(typeof globalThis !== 'undefined' ? globalThis : this, function (environment) {
  'use strict';
  const document = environment.document;
  return function poll(task, interval, onError = () => {}) {
    let timer, running = false, stopped = false, suspended = false, delay = interval;
    function clear() { environment.clearTimeout(timer); timer = undefined; }
    function schedule() {
      if (!stopped && !suspended && !document.hidden) timer = environment.setTimeout(run, delay);
    }
    async function run() {
      clear();
      if (stopped || suspended || document.hidden || running) return;
      running = true;
      try { await task(); delay = interval; }
      catch (error) {
        delay = Math.min(delay * 2, Math.max(interval, 30000));
        try { onError(error); } catch (handlerError) { environment.console?.error(handlerError); }
      } finally { running = false; schedule(); }
    }
    function visible() { clear(); if (!document.hidden && !running) void run(); }
    function hide() { suspended = true; clear(); }
    function show() { suspended = false; visible(); }
    document.addEventListener('visibilitychange', visible);
    environment.addEventListener('pagehide', hide);
    environment.addEventListener('pageshow', show);
    schedule();
    return function stop() {
      stopped = true; clear();
      document.removeEventListener('visibilitychange', visible);
      environment.removeEventListener('pagehide', hide);
      environment.removeEventListener('pageshow', show);
    };
  };
});
