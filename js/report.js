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

/* The exact rows behind the "All Submissions" table, kept in sync with
 * what's rendered so Export to Excel always exports what's on screen. */
let reportRows = [];

function buildReportRow(record) {
  return {
    Form: record.formType,
    'Reference No.': record.data.refNumber || '—',
    'Principal Investigator': getPiName(record),
    'Project Title': record.data.projectTitle || '(untitled)',
    Category: record.data.categoryOfResearch || '—',
    Status: getStatusLabel(record.status, record.formType),
    'Last Updated': record.updatedAt ? new Date(record.updatedAt).toLocaleString() : '—',
  };
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
  reportRows = sorted.map(buildReportRow);

  const tbody = document.getElementById('report-submissions-body');
  tbody.innerHTML = '';

  if (sorted.length === 0) {
    const emptyRow = document.createElement('tr');
    emptyRow.innerHTML = '<td colspan="7" class="empty-state">No projects have been submitted yet.</td>';
    tbody.appendChild(emptyRow);
    return;
  }

  reportRows.forEach((row) => {
    const tr = document.createElement('tr');
    Object.values(row).forEach((value) => {
      const td = document.createElement('td');
      td.textContent = value;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
}

/* Exports exactly what's in the "All Submissions" table as a real .xlsx
 * file via SheetJS (loaded from a CDN -- this app has no build step or
 * bundled dependencies, so generating a genuine Excel file client-side
 * needs the library available on the page). */
function exportReportToExcel() {
  if (typeof XLSX === 'undefined') {
    alert('Could not export to Excel: the export library failed to load. Check your internet connection and try again.');
    return;
  }
  const worksheet = XLSX.utils.json_to_sheet(reportRows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'All Submissions');
  const today = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(workbook, `IRB-Report-${today}.xlsx`);
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
  document.getElementById('btn-export-excel').addEventListener('click', exportReportToExcel);
}

document.addEventListener('DOMContentLoaded', initReportPage);
