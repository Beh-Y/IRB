/* Wires report.html: an overall view of every submitted project (IRPF,
 * IPAF, PCDF combined) for the Secretariat and IRB Leadership (Co-Chairman
 * and Chairman) roles -- summary stats plus a full listing. Restricted to
 * those roles; anyone else gets an access-denied message instead. */

function canViewReport(role) {
  return isSecretariat(role) || isIrbLeadership(role);
}

/* IRPF/PCDF capture the PI's name directly; IPAF captures the whole
 * project team as a people-list, where the spec has the PI added first. */
function getPiName(record) {
  if (record.formType === 'IRPF') return record.data.piName || '—';
  if (record.formType === 'PCDF') return record.data.principalInvestigatorName || '—';
  if (record.formType === 'IPAF') {
    const people = record.data.principalInvestigators || [];
    return (people[0] && people[0].name) || '—';
  }
  return '—';
}

function renderStatChips(container, counts) {
  container.innerHTML = '';
  const entries = Object.entries(counts).filter(([, count]) => count > 0);
  if (entries.length === 0) {
    const chip = document.createElement('span');
    chip.className = 'tally-chip';
    chip.textContent = 'None yet';
    container.appendChild(chip);
    return;
  }
  entries.forEach(([label, count]) => {
    const chip = document.createElement('span');
    chip.className = 'tally-chip';
    chip.textContent = `${label}: ${count}`;
    container.appendChild(chip);
  });
}

function renderReport() {
  const submitted = getAllSubmissions().filter((r) => r.status !== 'draft');

  const formTypeCounts = { IRPF: 0, IPAF: 0, PCDF: 0 };
  const statusCounts = {};
  const categoryCounts = {};

  submitted.forEach((record) => {
    formTypeCounts[record.formType] = (formTypeCounts[record.formType] || 0) + 1;

    const statusLabel = getStatusLabel(record.status, record.formType);
    statusCounts[statusLabel] = (statusCounts[statusLabel] || 0) + 1;

    if (record.data.categoryOfResearch) {
      categoryCounts[record.data.categoryOfResearch] = (categoryCounts[record.data.categoryOfResearch] || 0) + 1;
    }
  });

  renderStatChips(document.getElementById('report-form-type-stats'), formTypeCounts);
  renderStatChips(document.getElementById('report-status-stats'), statusCounts);
  renderStatChips(document.getElementById('report-category-stats'), categoryCounts);

  const sorted = sortByAnyPrefixRefNumber(submitted.slice());

  const tbody = document.getElementById('report-submissions-body');
  tbody.innerHTML = '';

  if (sorted.length === 0) {
    const emptyRow = document.createElement('tr');
    emptyRow.innerHTML = '<td colspan="7" class="empty-state">No projects have been submitted yet.</td>';
    tbody.appendChild(emptyRow);
    return;
  }

  sorted.forEach((record) => {
    const tr = document.createElement('tr');

    const formCell = document.createElement('td');
    formCell.textContent = record.formType;

    const refCell = document.createElement('td');
    refCell.textContent = record.data.refNumber || '—';

    const piCell = document.createElement('td');
    piCell.textContent = getPiName(record);

    const titleCell = document.createElement('td');
    titleCell.textContent = record.data.projectTitle || '(untitled)';

    const categoryCell = document.createElement('td');
    categoryCell.textContent = record.data.categoryOfResearch || '—';

    const statusCell = document.createElement('td');
    statusCell.textContent = getStatusLabel(record.status, record.formType);

    const updatedCell = document.createElement('td');
    updatedCell.textContent = record.updatedAt ? new Date(record.updatedAt).toLocaleString() : '—';

    tr.appendChild(formCell);
    tr.appendChild(refCell);
    tr.appendChild(piCell);
    tr.appendChild(titleCell);
    tr.appendChild(categoryCell);
    tr.appendChild(statusCell);
    tr.appendChild(updatedCell);
    tbody.appendChild(tr);
  });
}

function initReportPage() {
  renderHeader('report');

  const role = getCurrentRole();
  if (!canViewReport(role)) {
    document.getElementById('report-content').hidden = true;
    const banner = document.getElementById('status-banner');
    banner.textContent = 'This page is restricted to the Secretariat and IRB Leadership (Co-Chairman and Chairman) roles. Switch role above to view it.';
    banner.className = 'status-banner status-banner--error';
    banner.hidden = false;
    return;
  }

  renderReport();
}

document.addEventListener('DOMContentLoaded', initReportPage);
