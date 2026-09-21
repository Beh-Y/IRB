/* Wires the admin page (admin.html): shows the current reference-number
 * counters (irb_ref_counters), one row per form type / period. Restricted
 * to the "INDT / System Admin" role -- anyone else gets an access-denied
 * message and none of the counter data is rendered. */

function formatRefCounterKey(key) {
  const match = /^(IRPF|IPAF|PCDF)-(\d{2})-(\d{4})$/.exec(key);
  if (!match) return null;
  const [, namespace, mm, yyyy] = match;
  return { namespace, mm, yyyy };
}

function renderRefCounters() {
  const counters = readJSON(STORAGE_KEYS.REF_COUNTERS, {});
  const rows = Object.keys(counters)
    .map((key) => {
      const parsed = formatRefCounterKey(key);
      if (!parsed) return null;
      return { ...parsed, lastAssigned: counters[key] };
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (a.namespace !== b.namespace) return a.namespace.localeCompare(b.namespace);
      if (a.yyyy !== b.yyyy) return Number(b.yyyy) - Number(a.yyyy);
      return Number(b.mm) - Number(a.mm);
    });

  const tbody = document.getElementById('ref-counters-body');
  tbody.innerHTML = '';

  if (rows.length === 0) {
    const emptyRow = document.createElement('tr');
    emptyRow.innerHTML = '<td colspan="4" class="empty-state">No reference numbers have been assigned yet.</td>';
    tbody.appendChild(emptyRow);
    return;
  }

  rows.forEach((row) => {
    const tr = document.createElement('tr');

    const formCell = document.createElement('td');
    formCell.textContent = row.namespace;

    const periodCell = document.createElement('td');
    periodCell.textContent = `${row.mm}-${row.yyyy}`;

    const lastCell = document.createElement('td');
    lastCell.textContent = String(row.lastAssigned).padStart(3, '0');

    const nextCell = document.createElement('td');
    nextCell.textContent = String(row.lastAssigned + 1).padStart(3, '0');

    tr.appendChild(formCell);
    tr.appendChild(periodCell);
    tr.appendChild(lastCell);
    tr.appendChild(nextCell);
    tbody.appendChild(tr);
  });
}

function initAdminPage() {
  renderHeader('admin');

  const role = getCurrentRole();
  if (role !== 'system-admin') {
    document.getElementById('admin-content').hidden = true;
    const banner = document.getElementById('status-banner');
    banner.textContent = 'This page is restricted to the INDT / System Admin role. Switch role above to view it.';
    banner.className = 'status-banner status-banner--error';
    banner.hidden = false;
    return;
  }

  renderRefCounters();
}

document.addEventListener('DOMContentLoaded', initAdminPage);
