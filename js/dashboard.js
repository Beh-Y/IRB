/* Renders the IRPF submissions list on index.html, scoped to the current preview role. */

function needsActionFromCurrentRole(record, role) {
  if (role === 'sd-director') return record.status === 'pending_director_approval';
  if (role === 'irb-admin-edu') return record.status === 'pending_review' && record.routedTo === 'irb-admin-edu';
  if (role === 'irb-admin-tie') return record.status === 'pending_review' && record.routedTo === 'irb-admin-tie';
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
