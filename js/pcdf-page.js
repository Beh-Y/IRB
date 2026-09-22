/* Wires the PCDF document generation script into pcdf.html: loads/creates
 * the record, mounts the form, and exposes the role-appropriate actions.
 * Every action that changes the record's status or state redirects to the
 * dashboard on success (with a flash banner there); only a failed action
 * (validation, a missing comment) keeps the user on this page so they can
 * fix it. */

function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function loadOrCreateRecord() {
  const id = getQueryParam('id');
  if (id) {
    const existing = getSubmission(id);
    if (existing) return existing;
  }
  return {
    id: generateId(),
    formType: 'PCDF',
    status: 'draft',
    data: {},
    history: [],
    createdAt: null,
    updatedAt: null,
    acknowledged: false,
    acknowledgedAt: null,
  };
}

function showBanner(message, type) {
  const banner = document.getElementById('status-banner');
  banner.textContent = message;
  banner.className = `status-banner status-banner--${type}`;
  banner.hidden = false;
}

function renderActivityLog(record) {
  const container = document.getElementById('activity-log');
  const list = document.getElementById('activity-log-list');
  list.innerHTML = '';

  if (!record.history || record.history.length === 0) {
    container.hidden = true;
    return;
  }

  // Open by default whenever there's something to show -- every action
  // now redirects straight to the dashboard, so the user never sees this
  // update happen in front of them; requiring an extra click to expand a
  // collapsed log on top of that made updates easy to miss entirely.
  // Still collapsible -- the user can close it themselves.
  container.hidden = false;
  container.open = true;
  [...record.history].reverse().forEach((entry) => {
    const li = document.createElement('li');

    const meta = document.createElement('div');
    meta.className = 'activity-meta';
    const when = entry.timestamp ? new Date(entry.timestamp).toLocaleString() : '';
    meta.textContent = `${when} — ${getRoleLabel(entry.actor)} — ${entry.action.replace(/_/g, ' ')}`;
    li.appendChild(meta);

    if (entry.note) {
      const note = document.createElement('div');
      note.className = 'activity-note';
      note.textContent = entry.note;
      li.appendChild(note);
    }

    list.appendChild(li);
  });
}

function initPcdfPage() {
  renderHeader('pcdf');

  const role = getCurrentRole();
  const record = loadOrCreateRecord();
  const controller = new PcdfFormController(record, role);

  document.getElementById('pcdf-status-badge').textContent = getStatusLabel(record.status, 'PCDF');
  controller.mount(document.getElementById('pcdf-form-container'));
  renderActivityLog(record);

  const saveBtn = document.getElementById('btn-save');
  const submitBtn = document.getElementById('btn-submit');
  const approveBtn = document.getElementById('btn-approve');
  const closeBtn = document.getElementById('btn-close');
  const acknowledgePanel = document.getElementById('acknowledge-panel');
  const acknowledgeBtn = document.getElementById('btn-acknowledge');

  saveBtn.hidden = true;
  submitBtn.hidden = true;
  approveBtn.hidden = true;
  acknowledgePanel.hidden = true;

  if (controller.isEditableByPi()) {
    saveBtn.hidden = false;
    submitBtn.hidden = false;
  } else if (controller.isPendingThisDirectorApproval()) {
    approveBtn.hidden = false;
    showBanner('This PCDF is awaiting your approval as S/D Director.', 'info');
  } else if (controller.isPendingAcknowledgement()) {
    acknowledgePanel.hidden = false;
    showBanner('This PCDF is approved. Please acknowledge your responsibilities as PI below.', 'success');
  } else if (record.status === 'pending_director_approval') {
    showBanner('Awaiting S/D Director approval.', 'info');
  } else if (record.status === 'approved') {
    showBanner(
      record.acknowledged ? 'This PCDF is approved and has been acknowledged by the PI.' : 'This PCDF is approved.',
      'success'
    );
  } else if (record.status === 'draft') {
    showBanner('You are viewing this draft in read-only mode for your current role.', 'muted');
  }

  saveBtn.addEventListener('click', () => {
    controller.save();
    goToDashboardWithMessage('Saved as draft. A reference number is assigned once this PCDF is submitted.', 'success');
  });

  submitBtn.addEventListener('click', () => {
    const result = controller.submit();
    if (!result.ok) {
      const missing = describeMissingFields(result.errors, controller.fields);
      showBanner(`Please complete the following required field(s) before submitting: ${missing.join(', ')}.`, 'error');
      return;
    }
    goToDashboardWithMessage(
      `Submitted. Reference number: ${record.data.refNumber}. Routed to the S/D Director for approval.`,
      'success'
    );
  });

  approveBtn.addEventListener('click', () => {
    controller.directorApprove();
    goToDashboardWithMessage('Approved.', 'success');
  });

  acknowledgeBtn.addEventListener('click', () => {
    controller.acknowledge();
    goToDashboardWithMessage('Thank you for acknowledging your responsibilities as PI.', 'success');
  });

  closeBtn.addEventListener('click', () => {
    window.location.href = 'index.html';
  });

  mirrorActionRow(document.querySelector('.form-actions'), document.getElementById('top-actions'));
  mirrorActionRow(acknowledgePanel, document.getElementById('bottom-panel-actions'));
}

document.addEventListener('DOMContentLoaded', initPcdfPage);
