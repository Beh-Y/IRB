/* Wires the IRPF document generation script into irpf.html: loads/creates the
 * record, mounts the form, and exposes the role-appropriate actions. */

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
    formType: 'IRPF',
    status: 'draft',
    data: {},
    history: [],
    createdAt: null,
    updatedAt: null,
    routedTo: null,
  };
}

function showBanner(message, type) {
  const banner = document.getElementById('status-banner');
  banner.textContent = message;
  banner.className = `status-banner status-banner--${type}`;
  banner.hidden = false;
}

function initIrpfPage() {
  renderHeader('irpf');

  const role = getCurrentRole();
  const record = loadOrCreateRecord();
  const controller = new IrpfFormController(record, role);

  document.getElementById('irpf-status-badge').textContent = getStatusLabel(record.status);
  controller.mount(document.getElementById('irpf-form-container'));

  const saveBtn = document.getElementById('btn-save');
  const submitBtn = document.getElementById('btn-submit');
  const approveBtn = document.getElementById('btn-approve');
  const closeBtn = document.getElementById('btn-close');

  saveBtn.hidden = true;
  submitBtn.hidden = true;
  approveBtn.hidden = true;

  if (controller.isEditableByPi()) {
    saveBtn.hidden = false;
    submitBtn.hidden = false;
  } else if (controller.isPendingThisDirectorApproval()) {
    approveBtn.hidden = false;
    showBanner(
      'This IRPF is awaiting your approval as S/D Director before it can be routed to the IRB Secretariat.',
      'info'
    );
  } else if (record.status === 'pending_director_approval') {
    showBanner('Awaiting S/D Director approval before this IRPF can proceed.', 'info');
  } else if (record.status === 'pending_review') {
    showBanner(`Routed to ${getRoleLabel(record.routedTo)} for review.`, 'info');
  } else if (record.status === 'draft') {
    showBanner('You are viewing this draft in read-only mode for your current role.', 'muted');
  }

  saveBtn.addEventListener('click', () => {
    controller.save();
    document.getElementById('irpf-status-badge').textContent = getStatusLabel(record.status);
    showBanner(`Saved as draft. Reference number: ${record.data.refNumber}`, 'success');
    history.replaceState(null, '', `irpf.html?id=${record.id}`);
  });

  submitBtn.addEventListener('click', () => {
    const result = controller.submit();
    if (!result.ok) {
      showBanner('Please resolve the highlighted fields before submitting.', 'error');
      return;
    }
    document.getElementById('irpf-status-badge').textContent = getStatusLabel(record.status);
    showBanner(
      `Submitted. Reference number: ${record.data.refNumber}. Routed to the S/D Director for approval.`,
      'success'
    );
    saveBtn.hidden = true;
    submitBtn.hidden = true;
    history.replaceState(null, '', `irpf.html?id=${record.id}`);
  });

  approveBtn.addEventListener('click', () => {
    controller.directorApprove();
    document.getElementById('irpf-status-badge').textContent = getStatusLabel(record.status);
    showBanner(`Approved and routed to ${getRoleLabel(record.routedTo)}.`, 'success');
    approveBtn.hidden = true;
  });

  closeBtn.addEventListener('click', () => {
    window.location.href = 'index.html';
  });
}

document.addEventListener('DOMContentLoaded', initIrpfPage);
