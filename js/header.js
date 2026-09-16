/* Renders the shared top bar (nav + "Preview as" role switcher) into #app-header. */

function renderHeader(activePage) {
  const container = document.getElementById('app-header');
  if (!container) return;

  const currentRole = getCurrentRole();
  const roleOptions = ROLES.map(
    (r) => `<option value="${r.id}" ${r.id === currentRole ? 'selected' : ''}>${r.label}</option>`
  ).join('');

  container.innerHTML = `
    <div class="header-bar">
      <div class="header-brand">
        <span class="header-title">SP IRB Process Management</span>
      </div>
      <nav class="header-nav">
        <a href="index.html" class="${activePage === 'dashboard' ? 'active' : ''}">Dashboard</a>
      </nav>
      <div class="header-role-switcher">
        <label for="role-select">Preview as</label>
        <select id="role-select">${roleOptions}</select>
      </div>
    </div>
  `;

  document.getElementById('role-select').addEventListener('change', (e) => {
    setCurrentRole(e.target.value);
    window.location.reload();
  });
}
