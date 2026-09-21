/* Renders the shared top bar (nav + "Preview as" role switcher) into #app-header. */

function renderHeader(activePage) {
  const container = document.getElementById('app-header');
  if (!container) return;

  const currentRole = getCurrentRole();
  const roleOptions = ROLES.map(
    (r) => `<option value="${r.id}" ${r.id === currentRole ? 'selected' : ''}>${r.label}</option>`
  ).join('');

  // Only a PI can start a new IRPF/PCDF (mirrors the dashboard's own
  // New IRPF/New PCDF buttons), so the nav only offers them for that role.
  const newFormLinks =
    currentRole === 'pi'
      ? `
        <a href="irpf.html" class="${activePage === 'irpf' ? 'active' : ''}">New IRPF</a>
        <a href="pcdf.html" class="${activePage === 'pcdf' ? 'active' : ''}">New PCDF</a>
      `
      : '';

  container.innerHTML = `
    <div class="header-bar">
      <div class="header-brand">
        <a href="index.html" class="header-home-link" title="Dashboard" aria-label="Go to dashboard">
          <svg class="header-home-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3 10.5 12 3l9 7.5" />
            <path d="M5 9.5V21h14V9.5" />
            <path d="M9.5 21v-6.5h5V21" />
          </svg>
        </a>
        <span class="header-title">SP IRB Process Management</span>
      </div>
      <nav class="header-nav">
        <a href="index.html" class="${activePage === 'dashboard' ? 'active' : ''}">Dashboard</a>
        ${newFormLinks}
      </nav>
      <div class="header-role-switcher">
        <label for="role-select">Preview as</label>
        <select id="role-select">${roleOptions}</select>
      </div>
    </div>
    <div id="top-actions" class="top-actions"></div>
  `;

  document.getElementById('role-select').addEventListener('change', (e) => {
    setCurrentRole(e.target.value);
    window.location.reload();
  });
}
