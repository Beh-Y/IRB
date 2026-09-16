/* Renders the IRPF submissions list on index.html, scoped to the current preview role. */

/* Formats a <input type="date"> value ("YYYY-MM-DD") as "DD-MMM-YYYY" without
 * going through Date/timezone conversion, which can shift the day by one. */
function formatIsoDate(isoDate) {
  if (!isoDate) return '—';
  const [year, month, day] = isoDate.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${day}-${months[Number(month) - 1]}-${year}`;
}

/* Sort key for "IRB-MM-YYYY-XXX" that orders chronologically (year, then
 * month, then sequence) -- a plain string compare gets this wrong whenever
 * a later year has an earlier-looking month digit (e.g. "IRB-09-2025-005"
 * vs "IRB-01-2026-001"). Returns null for a record with no reference number
 * yet (an unsaved draft). */
function refNumberSortKey(refNumber) {
  const match = /^IRB-(\d{2})-(\d{4})-(\d{3})$/.exec(refNumber || '');
  if (!match) return null;
  const [, mm, yyyy, xxx] = match;
  return Number(yyyy) * 100000 + Number(mm) * 1000 + Number(xxx);
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
  if (role === 'pi') return record.status === 'for_revision';
  return false;
}

function renderDashboard() {
  renderHeader('dashboard');

  const role = getCurrentRole();
  const newIrpfBtn = document.getElementById('btn-new-irpf');
  newIrpfBtn.hidden = role !== 'pi';
  newIrpfBtn.addEventListener('click', () => {
    window.location.href = 'irpf.html';
  });

  const submissions = getSubmissionsByType('IRPF').sort((a, b) => {
    const keyA = refNumberSortKey(a.data.refNumber);
    const keyB = refNumberSortKey(b.data.refNumber);
    // A record with no reference number yet is a brand-new, unsaved draft --
    // treat it as the newest and put it first.
    if (keyA === null && keyB === null) {
      return new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0);
    }
    if (keyA === null) return -1;
    if (keyB === null) return 1;
    return keyB - keyA;
  });

  const tbody = document.getElementById('submissions-body');
  tbody.innerHTML = '';

  if (submissions.length === 0) {
    const emptyRow = document.createElement('tr');
    emptyRow.innerHTML = '<td colspan="8" class="empty-state">No IRPF submissions yet.</td>';
    tbody.appendChild(emptyRow);
    return;
  }

  submissions.forEach((record) => {
    const tr = document.createElement('tr');
    if (needsActionFromCurrentRole(record, role)) tr.classList.add('needs-action');

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
    statusCell.textContent = getStatusLabel(record.status);

    const updatedCell = document.createElement('td');
    updatedCell.textContent = record.updatedAt ? new Date(record.updatedAt).toLocaleString() : '—';

    const actionCell = document.createElement('td');
    const link = document.createElement('a');
    link.href = `irpf.html?id=${record.id}`;
    link.textContent = 'Open';
    link.className = 'btn btn-link';
    actionCell.appendChild(link);
    if (needsActionFromCurrentRole(record, role)) {
      const badge = document.createElement('span');
      badge.className = 'action-badge';
      badge.textContent = 'Action needed';
      actionCell.appendChild(badge);
    }

    tr.appendChild(refCell);
    tr.appendChild(titleCell);
    tr.appendChild(categoryCell);
    tr.appendChild(startDateCell);
    tr.appendChild(endDateCell);
    tr.appendChild(statusCell);
    tr.appendChild(updatedCell);
    tr.appendChild(actionCell);
    tbody.appendChild(tr);
  });
}

document.addEventListener('DOMContentLoaded', renderDashboard);
