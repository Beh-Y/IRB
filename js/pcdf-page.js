/* Wires the PCDF document generation script into pcdf.html: loads/creates
 * the record, mounts the form, and exposes the role-appropriate actions. */

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

  container.hidden = false;
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
    document.getElementById('pcdf-status-badge').textContent = getStatusLabel(record.status, 'PCDF');
    showBanner('Saved as draft. A reference number is assigned once this PCDF is submitted.', 'success');
    renderActivityLog(record);
    history.replaceState(null, '', `pcdf.html?id=${record.id}`);
  });

  submitBtn.addEventListener('click', () => {
    const result = controller.submit();
    if (!result.ok) {
      showBanner('Please resolve the highlighted fields before submitting.', 'error');
      return;
    }
    document.getElementById('pcdf-status-badge').textContent = getStatusLabel(record.status, 'PCDF');
    showBanner(`Submitted. Reference number: ${record.data.refNumber}. Routed to the S/D Director for approval.`, 'success');
    renderActivityLog(record);
    saveBtn.hidden = true;
    submitBtn.hidden = true;
    history.replaceState(null, '', `pcdf.html?id=${record.id}`);
  });

  approveBtn.addEventListener('click', () => {
    controller.directorApprove();
    document.getElementById('pcdf-status-badge').textContent = getStatusLabel(record.status, 'PCDF');
    showBanner('Approved.', 'success');
    renderActivityLog(record);
    approveBtn.hidden = true;
  });

  acknowledgeBtn.addEventListener('click', () => {
    controller.acknowledge();
    renderActivityLog(record);
    acknowledgePanel.hidden = true;
    showBanner('Thank you for acknowledging your responsibilities as PI.', 'success');
  });

  closeBtn.addEventListener('click', () => {
    window.location.href = 'index.html';
  });
}

document.addEventListener('DOMContentLoaded', initPcdfPage);
