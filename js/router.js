// GBHSS Mubarak Jarwar — tiny hash router (#/students, #/attendance, ...).
// Hash routing needs no server configuration, so it works on Live Server and any static host.

export function initRouter({ routes, defaultRoute, onChange }) {
  function resolve() {
    const requested = location.hash.replace(/^#\/?/, '');
    const id = Object.prototype.hasOwnProperty.call(routes, requested) ? requested : defaultRoute;
    // Requested page unknown or not allowed for this role -> fall back to the default page.
    if (id !== requested) {
      history.replaceState(null, '', `${location.pathname}${location.search}#/${id}`);
    }
    onChange(id);
    routes[id].render();
  }
  window.addEventListener('hashchange', resolve);
  resolve();
}
