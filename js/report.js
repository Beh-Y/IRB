/* Wires report.html: an overall view of every submitted project (IRPF,
 * IPAF, PCDF combined) for the Secretariat and IRB Leadership (Co-Chairman
 * and Chairman) roles -- summary stats plus a full listing. Also open to
 * the System Admin, who can see everything. Restricted to those roles;
 * anyone else gets an access-denied message instead. */

function canViewReport(role) {
  return isSecretariat(role) || isIrbLeadership(role) || role === 'system-admin';
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

function stripInternalFields(rows) {
  return rows.map(({ __isChild, ...row }) => row);
}

/* Exports exactly what's in one table as a real .xlsx file via SheetJS
 * (vendored locally -- this app has no build step or other runtime
 * dependencies, and generating a genuine Excel file client-side needs the
 * library available on the page). */
function exportRowsToExcel(rows, sheetName, filenamePrefix) {
  if (typeof XLSX === 'undefined') {
    alert('Could not export to Excel: the export library failed to load. Check your internet connection and try again.');
    return;
  }
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(stripInternalFields(rows)), sheetName);
  const today = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(workbook, `${filenamePrefix}-${today}.xlsx`);
}

/* Exports exactly what's in one table as a PDF via jsPDF + its autoTable
 * plugin (also vendored locally, same reasoning as the Excel export). An
 * IPAF's Reference No. gets a ">" prefix in place of the CSS indentation
 * used on screen, since a flat PDF table has no other way to show the
 * parent-child grouping -- plain ASCII rather than the "↳" arrow used on
 * screen, since jsPDF's default font (Helvetica, WinAnsi-encoded) can't
 * render that character and was garbling the whole cell. */
function exportRowsToPdf(rows, title, filenamePrefix) {
  if (typeof window.jspdf === 'undefined') {
    alert('Could not export to PDF: the export library failed to load. Check your internet connection and try again.');
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape' });

  doc.setFontSize(14);
  doc.text(title, 14, 15);
  doc.setFontSize(9);
  doc.setTextColor(107, 114, 128);
  doc.text(`Generated ${new Date().toLocaleString()}`, 14, 21);
  doc.setTextColor(0, 0, 0);

  const columns = rows.length > 0 ? Object.keys(rows[0]).filter((key) => !key.startsWith('__')) : [];
  const body = rows.map((row) =>
    columns.map((col) => (row.__isChild && col === 'Reference No.' ? `> ${row[col]}` : row[col]))
  );

  doc.autoTable({
    head: [columns],
    body,
    startY: 26,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [29, 78, 216], textColor: 255 },
    margin: { left: 14, right: 14 },
  });

  const today = new Date().toISOString().slice(0, 10);
  doc.save(`${filenamePrefix}-${today}.pdf`);
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

  document.getElementById('btn-export-irpf-ipaf-excel').addEventListener('click', () =>
    exportRowsToExcel(reportRowsIrpfIpaf, 'IRPF & IPAF', 'IRB-Report-IRPF-IPAF')
  );
  document.getElementById('btn-export-irpf-ipaf-pdf').addEventListener('click', () =>
    exportRowsToPdf(reportRowsIrpfIpaf, 'IRPF & IPAF Submissions', 'IRB-Report-IRPF-IPAF')
  );
  document.getElementById('btn-export-pcdf-excel').addEventListener('click', () =>
    exportRowsToExcel(reportRowsPcdf, 'PCDF', 'IRB-Report-PCDF')
  );
  document.getElementById('btn-export-pcdf-pdf').addEventListener('click', () =>
    exportRowsToPdf(reportRowsPcdf, 'PCDF Submissions', 'IRB-Report-PCDF')
  );
}

document.addEventListener('DOMContentLoaded', initReportPage);
