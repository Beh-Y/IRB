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

/* The exact rows behind each table, kept in sync with what's rendered so
 * Export to Excel always exports what's on screen (one sheet per table). */
let reportRowsIrpfIpaf = [];
let reportRowsPcdf = [];

function buildIrpfIpafRow(record) {
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

function buildPcdfRow(record) {
  return {
    'Reference No.': record.data.refNumber || '—',
    'Principal Investigator': getPiName(record),
    'Project Title': record.data.projectTitle || '(untitled)',
    Status: getStatusLabel(record.status, 'PCDF'),
    'Last Updated': record.updatedAt ? new Date(record.updatedAt).toLocaleString() : '—',
  };
}

function renderRowsIntoTable(tbodyId, rows, emptyMessage) {
  const tbody = document.getElementById(tbodyId);
  tbody.innerHTML = '';

  if (rows.length === 0) {
    const emptyRow = document.createElement('tr');
    const colspan = tbody.closest('table').querySelectorAll('thead th').length;
    emptyRow.innerHTML = `<td colspan="${colspan}" class="empty-state">${emptyMessage}</td>`;
    tbody.appendChild(emptyRow);
    return;
  }

  rows.forEach((row) => {
    const tr = document.createElement('tr');
    if (row.__isChild) tr.classList.add('child-row');
    Object.entries(row).forEach(([key, value]) => {
      if (key.startsWith('__')) return;
      const td = document.createElement('td');
      td.textContent = value;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
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

  // IRPF+IPAF combined, keeping the parent-child grouping (newest IRPF
  // first, each IPAF directly under its parent) that the dashboard/
  // submissions pages already use, minus any not-yet-submitted drafts.
  const irpfIpafRecords = groupSubmissionsByParent().filter((r) => r.status !== 'draft');
  reportRowsIrpfIpaf = irpfIpafRecords.map((record) => {
    const row = buildIrpfIpafRow(record);
    row.__isChild = record.formType === 'IPAF';
    return row;
  });
  renderRowsIntoTable('report-irpf-ipaf-body', reportRowsIrpfIpaf, 'No IRPF or IPAF projects have been submitted yet.');

  // PCDF is standalone (no parent-child relationship), so it gets its own
  // table, sorted newest first.
  const pcdfRecords = sortByRefNumber(getSubmissionsByType('PCDF'), 'PCDF').filter((r) => r.status !== 'draft');
  reportRowsPcdf = pcdfRecords.map(buildPcdfRow);
  renderRowsIntoTable('report-pcdf-body', reportRowsPcdf, 'No PCDF projects have been submitted yet.');
}

/* Exports exactly what's in the two tables as a real .xlsx file, one sheet
 * per table, via SheetJS (vendored locally -- this app has no build step
 * or other runtime dependencies, and generating a genuine Excel file
 * client-side needs the library available on the page). */
function exportReportToExcel() {
  if (typeof XLSX === 'undefined') {
    alert('Could not export to Excel: the export library failed to load. Check your internet connection and try again.');
    return;
  }
  const stripInternalFields = (rows) => rows.map(({ __isChild, ...row }) => row);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(stripInternalFields(reportRowsIrpfIpaf)), 'IRPF & IPAF');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(reportRowsPcdf), 'PCDF');
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
