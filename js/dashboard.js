/* Renders the IRPF submissions list on index.html, scoped to the current preview role. */

function assignedVotesAllIn(record) {
  const votes = record.votes || [];
  const assigned = record.assignedMembers || [];
  return assigned.length > 0 && assigned.every((id) => votes.some((v) => v.voterId === id));
}

function assignedVotesUnanimousApproval(record) {
  const votes = record.votes || [];
  const assigned = record.assignedMembers || [];
  return (
    assigned.length > 0 &&
    assigned.every((id) => {
      const vote = votes.find((v) => v.voterId === id);
      return vote && vote.decision === 'Approve';
    })
  );
}

function underReviewReadyToCollate(record) {
  return assignedVotesAllIn(record) && !assignedVotesUnanimousApproval(record);
}

function underReviewReadyToRouteToLeadership(record) {
  return assignedVotesAllIn(record) && assignedVotesUnanimousApproval(record);
}

function leadershipReadyToCollate(record) {
  const approvals = record.leadershipApprovals || [];
  return IRB_LEADERSHIP_IDS.every((id) => approvals.some((a) => a.approverId === id));
}

function needsActionFromCurrentRole(record, role) {
  if (role === 'sd-director') return record.status === 'pending_director_approval';
  if (role === 'irb-admin-edu' || role === 'irb-admin-tie') {
    if (record.status === 'pending_review') return record.routedTo === role;
    if (record.status === 'under_review') {
      return record.routedTo === role && (underReviewReadyToCollate(record) || underReviewReadyToRouteToLeadership(record));
    }
    if (record.status === 'pending_leadership_approval') return record.routedTo === role && leadershipReadyToCollate(record);
    return false;
  }
  if (isIrbMember(role)) {
    return (
      record.status === 'under_review' &&
      (record.assignedMembers || []).includes(role) &&
      !(record.votes || []).some((v) => v.voterId === role)
    );
  }
  if (isIrbLeadership(role)) {
    return (
      record.status === 'pending_leadership_approval' &&
      !(record.leadershipApprovals || []).some((a) => a.approverId === role)
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

  const submissions = getSubmissionsByType('IRPF').sort(
    (a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0)
  );

  const tbody = document.getElementById('submissions-body');
  tbody.innerHTML = '';

  if (submissions.length === 0) {
    const emptyRow = document.createElement('tr');
    emptyRow.innerHTML = '<td colspan="6" class="empty-state">No IRPF submissions yet.</td>';
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
    tr.appendChild(statusCell);
    tr.appendChild(updatedCell);
    tr.appendChild(actionCell);
    tbody.appendChild(tr);
  });
}

document.addEventListener('DOMContentLoaded', renderDashboard);
