/* Renders index.html's two submission tables -- IRPF+IPAF combined into one
 * "Project Submissions" list, and PCDF (standalone, no parent) separately --
 * scoped to the current preview role. */

/* Formats a <input type="date"> value ("YYYY-MM-DD") as "DD-MMM-YYYY" without
 * going through Date/timezone conversion, which can shift the day by one. */
function formatIsoDate(isoDate) {
  if (!isoDate) return '—';
  const [year, month, day] = isoDate.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${day}-${months[Number(month) - 1]}-${year}`;
}

/* Sort key for a "<PREFIX>-MM-YYYY-XXX..." reference number that orders
 * chronologically (year, then month, then sequence) -- a plain string
 * compare gets this wrong whenever a later year has an earlier-looking
 * month digit (e.g. "IRB-09-2025-005" vs "IRB-01-2026-001"). Returns null
 * for a record with no reference number yet (an unsaved draft). */
function refNumberSortKey(refNumber, prefix) {
  const match = new RegExp(`^${prefix}-(\\d{2})-(\\d{4})-(\\d{3})`).exec(refNumber || '');
  if (!match) return null;
  const [, mm, yyyy, xxx] = match;
  return Number(yyyy) * 100000 + Number(mm) * 1000 + Number(xxx);
}

function sortByRefNumber(submissions, prefix) {
  return submissions.sort((a, b) => {
    const keyA = refNumberSortKey(a.data.refNumber, prefix);
    const keyB = refNumberSortKey(b.data.refNumber, prefix);
    // A record with no reference number yet is a brand-new, unsaved draft --
    // treat it as the newest and put it first.
    if (keyA === null && keyB === null) {
      return new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0);
    }
    if (keyA === null) return -1;
    if (keyB === null) return 1;
    return keyB - keyA;
  });
}

/* Same idea as refNumberSortKey, but prefix-agnostic (IRB-... or PCDF-...)
 * so IRPF/IPAF and PCDF rows can be sorted newest-first together in the
 * merged "Pending My Action" table. */
function anyPrefixRefSortKey(refNumber) {
  const match = /^(?:IRB|PCDF)-(\d{2})-(\d{4})-(\d{3})/.exec(refNumber || '');
  if (!match) return null;
  const [, mm, yyyy, xxx] = match;
  return Number(yyyy) * 100000 + Number(mm) * 1000 + Number(xxx);
}

function sortByAnyPrefixRefNumber(submissions) {
  return submissions.sort((a, b) => {
    const keyA = anyPrefixRefSortKey(a.data.refNumber);
    const keyB = anyPrefixRefSortKey(b.data.refNumber);
    if (keyA === null && keyB === null) {
      return new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0);
    }
    if (keyA === null) return -1;
    if (keyB === null) return 1;
    return keyB - keyA;
  });
}

/* Orders IRPFs by reference number (newest first), then places each IPAF
 * immediately after its parent IRPF -- rather than sorting IPAF and IRPF
 * together by reference number, which would only coincidentally keep a
 * child near its parent (they can land in different numbering periods,
 * e.g. an IPAF created the following month). */
function groupSubmissionsByParent() {
  const irpfRecords = sortByRefNumber(getSubmissionsByType('IRPF'), 'IRB');
  const ipafByParentId = new Map();
  getSubmissionsByType('IPAF').forEach((record) => {
    const siblings = ipafByParentId.get(record.parentIrpfId) || [];
    siblings.push(record);
    ipafByParentId.set(record.parentIrpfId, siblings);
  });

  const grouped = [];
  irpfRecords.forEach((irpf) => {
    grouped.push(irpf);
    const children = ipafByParentId.get(irpf.id);
    if (children) {
      grouped.push(...children);
      ipafByParentId.delete(irpf.id);
    }
  });
  // Any IPAF whose parent isn't in the list (shouldn't normally happen) still
  // gets shown, just at the end rather than dropped.
  ipafByParentId.forEach((children) => grouped.push(...children));

  return grouped;
}

function needsActionFromCurrentRolePcdf(record, role) {
  if (role === 'sd-director') return record.status === 'pending_director_approval';
  if (role === 'pi') return record.status === 'approved' && !record.acknowledged;
  return false;
}

function needsActionFromCurrentRole(record, role) {
  if (role === 'sd-director') return record.status === 'pending_director_approval';
  if (role === 'irb-admin-edu' || role === 'irb-admin-tie') {
    if (record.status === 'pending_review') return record.routedTo === role;
    // The Secretariat can act as soon as any single review is in — it doesn't
    // wait for the full member panel or both leaders to weigh in.
    if (record.status === 'under_review') return record.routedTo === role && (record.votes || []).length > 0;
    if (record.status === 'pending_leadership_approval') {
      return record.routedTo === role && (record.leadershipApprovals || []).length > 0;
    }
    return false;
  }
  if (isIrbMember(role)) {
    // Stays actionable even after the Secretariat has moved the record on
    // based on other members' votes — including once it's routed back to
    // the Secretariat (pending_review) after a PI resubmission — a late
    // review still gets recorded.
    return (
      (record.assignedMembers || []).includes(role) &&
      !(record.votes || []).some((v) => v.voterId === role) &&
      (record.status === 'under_review' ||
        (['for_revision', 'pending_leadership_approval', 'approved', 'to_create_ipaf', 'pending_review'].includes(
          record.status
        ) &&
          (record.votes || []).length > 0))
    );
  }
  if (isIrbLeadership(role)) {
    return (
      !(record.leadershipApprovals || []).some((a) => a.approverId === role) &&
      (record.status === 'pending_leadership_approval' ||
        (['approved', 'to_create_ipaf', 'for_revision', 'pending_review'].includes(record.status) &&
          (record.leadershipApprovals || []).length > 0))
    );
  }
  if (role === 'pi') {
    if (record.status === 'for_revision') return true;
    // IPAF adds an Acknowledge step after approval that the IRPF doesn't have.
    if (record.formType === 'IPAF' && record.status === 'approved' && !record.acknowledged) return true;
    return false;
  }
  return false;
}

function renderDashboard() {
  renderHeader('dashboard');

  const flash = consumeFlashMessage();
  if (flash) {
    const banner = document.getElementById('status-banner');
    banner.textContent = flash.message;
    banner.className = `status-banner status-banner--${flash.type}`;
    banner.hidden = false;
  }

  const role = getCurrentRole();

  renderPendingActionTable(role);

  const newIrpfBtn = document.getElementById('btn-new-irpf');
  newIrpfBtn.hidden = role !== 'pi';
  newIrpfBtn.addEventListener('click', () => {
    window.location.href = 'irpf.html';
  });

  // IPAF has no independent listing of its own -- it's still tied to its
  // parent IRPF's data (category, project title/dates) -- but it should
  // still be reachable and actionable straight from this dashboard, so it's
  // merged into the same "Project Submissions" table rather than only
  // reachable via the parent IRPF's page, grouped right under its parent.
  const submissions = groupSubmissionsByParent();

  const tbody = document.getElementById('submissions-body');
  tbody.innerHTML = '';

  if (submissions.length === 0) {
    const emptyRow = document.createElement('tr');
    emptyRow.innerHTML = '<td colspan="9" class="empty-state">No project submissions yet.</td>';
    tbody.appendChild(emptyRow);
  }

  submissions.forEach((record) => {
    const tr = document.createElement('tr');
    if (needsActionFromCurrentRole(record, role)) tr.classList.add('needs-action');
    if (record.formType === 'IPAF') tr.classList.add('child-row');

    const refCell = document.createElement('td');
    refCell.textContent = record.data.refNumber || '(draft, no reference yet)';

    const formCell = document.createElement('td');
    formCell.textContent = record.formType;

    const titleCell = document.createElement('td');
    titleCell.textContent = record.data.projectTitle || '(untitled)';

    const categoryCell = document.createElement('td');
    categoryCell.textContent = record.data.categoryOfResearch || '—';

    const startDateCell = document.createElement('td');
    startDateCell.textContent = formatIsoDate(record.data.projectStartDate);

    const endDateCell = document.createElement('td');
    endDateCell.textContent = formatIsoDate(record.data.projectEndDate);

    const statusCell = document.createElement('td');
    statusCell.textContent = getStatusLabel(record.status, record.formType);

    const updatedCell = document.createElement('td');
    updatedCell.textContent = record.updatedAt ? new Date(record.updatedAt).toLocaleString() : '—';

    const actionCell = document.createElement('td');
    const link = document.createElement('a');
    link.href = `${record.formType === 'IPAF' ? 'ipaf' : 'irpf'}.html?id=${record.id}`;
    link.textContent = 'Open';
    link.className = 'btn btn-link';
    actionCell.appendChild(link);
    if (needsActionFromCurrentRole(record, role)) {
      const badge = document.createElement('span');
      badge.className = 'action-badge';
      badge.textContent = 'Action needed';
      actionCell.appendChild(badge);
    }

    tr.appendChild(actionCell);
    tr.appendChild(refCell);
    tr.appendChild(formCell);
    tr.appendChild(titleCell);
    tr.appendChild(categoryCell);
    tr.appendChild(startDateCell);
    tr.appendChild(endDateCell);
    tr.appendChild(statusCell);
    tr.appendChild(updatedCell);
    tbody.appendChild(tr);
  });

  renderPcdfDashboard(role);
}

/* Merges IRPF, IPAF and PCDF submissions that need action from the
 * currently previewed role into a single "to-do" table at the top of the
 * dashboard, newest first, with a Form column since it spans all three
 * form types. */
function renderPendingActionTable(role) {
  const tbody = document.getElementById('pending-action-body');
  tbody.innerHTML = '';

  const pending = sortByAnyPrefixRefNumber([
    ...getSubmissionsByType('IRPF').filter((r) => needsActionFromCurrentRole(r, role)),
    ...getSubmissionsByType('IPAF').filter((r) => needsActionFromCurrentRole(r, role)),
    ...getSubmissionsByType('PCDF').filter((r) => needsActionFromCurrentRolePcdf(r, role)),
  ]);

  if (pending.length === 0) {
    const emptyRow = document.createElement('tr');
    emptyRow.innerHTML = '<td colspan="9" class="empty-state">Nothing needs your action right now.</td>';
    tbody.appendChild(emptyRow);
    return;
  }

  pending.forEach((record) => {
    const tr = document.createElement('tr');
    tr.classList.add('needs-action');

    const actionCell = document.createElement('td');
    const link = document.createElement('a');
    link.href = `${record.formType.toLowerCase()}.html?id=${record.id}`;
    link.textContent = 'Open';
    link.className = 'btn btn-link';
    actionCell.appendChild(link);

    const formCell = document.createElement('td');
    formCell.textContent = record.formType;

    const refCell = document.createElement('td');
    refCell.textContent = record.data.refNumber || '(draft, no reference yet)';

    const titleCell = document.createElement('td');
    titleCell.textContent = record.data.projectTitle || '(untitled)';

    const categoryCell = document.createElement('td');
    categoryCell.textContent = record.data.categoryOfResearch || '—';

    const startDateCell = document.createElement('td');
    startDateCell.textContent = formatIsoDate(record.data.projectStartDate);

    const endDateCell = document.createElement('td');
    endDateCell.textContent = formatIsoDate(record.data.projectEndDate);

    const statusCell = document.createElement('td');
    statusCell.textContent = getStatusLabel(record.status, record.formType);

    const updatedCell = document.createElement('td');
    updatedCell.textContent = record.updatedAt ? new Date(record.updatedAt).toLocaleString() : '—';

    tr.appendChild(actionCell);
    tr.appendChild(formCell);
    tr.appendChild(refCell);
    tr.appendChild(titleCell);
    tr.appendChild(categoryCell);
    tr.appendChild(startDateCell);
    tr.appendChild(endDateCell);
    tr.appendChild(statusCell);
    tr.appendChild(updatedCell);
    tbody.appendChild(tr);
  });
}

/* PCDF is a standalone form (no parent-child relationship to the IRPF), so
 * it gets its own creation button and listing on the same dashboard page. */
function renderPcdfDashboard(role) {
  const newPcdfBtn = document.getElementById('btn-new-pcdf');
  newPcdfBtn.hidden = role !== 'pi';
  newPcdfBtn.addEventListener('click', () => {
    window.location.href = 'pcdf.html';
  });

  const submissions = sortByRefNumber(getSubmissionsByType('PCDF'), 'PCDF');

  const tbody = document.getElementById('pcdf-submissions-body');
  tbody.innerHTML = '';

  if (submissions.length === 0) {
    const emptyRow = document.createElement('tr');
    emptyRow.innerHTML = '<td colspan="7" class="empty-state">No PCDF submissions yet.</td>';
    tbody.appendChild(emptyRow);
    return;
  }

  submissions.forEach((record) => {
    const tr = document.createElement('tr');
    if (needsActionFromCurrentRolePcdf(record, role)) tr.classList.add('needs-action');

    const refCell = document.createElement('td');
    refCell.textContent = record.data.refNumber || '(draft, no reference yet)';

    const titleCell = document.createElement('td');
    titleCell.textContent = record.data.projectTitle || '(untitled)';

    const startDateCell = document.createElement('td');
    startDateCell.textContent = formatIsoDate(record.data.projectStartDate);

    const endDateCell = document.createElement('td');
    endDateCell.textContent = formatIsoDate(record.data.projectEndDate);

    const statusCell = document.createElement('td');
    statusCell.textContent = getStatusLabel(record.status, 'PCDF');

    const updatedCell = document.createElement('td');
    updatedCell.textContent = record.updatedAt ? new Date(record.updatedAt).toLocaleString() : '—';

    const actionCell = document.createElement('td');
    const link = document.createElement('a');
    link.href = `pcdf.html?id=${record.id}`;
    link.textContent = 'Open';
    link.className = 'btn btn-link';
    actionCell.appendChild(link);
    if (needsActionFromCurrentRolePcdf(record, role)) {
      const badge = document.createElement('span');
      badge.className = 'action-badge';
      badge.textContent = 'Action needed';
      actionCell.appendChild(badge);
    }

    tr.appendChild(actionCell);
    tr.appendChild(refCell);
    tr.appendChild(titleCell);
    tr.appendChild(startDateCell);
    tr.appendChild(endDateCell);
    tr.appendChild(statusCell);
    tr.appendChild(updatedCell);
    tbody.appendChild(tr);
  });
}

document.addEventListener('DOMContentLoaded', renderDashboard);
