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
    reviewOutcome: null,
    ipafRequired: null,
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

function describeApprovedOutcome(record) {
  if (record.reviewOutcome === 'exemption') {
    return 'This IRPF was approved for exemption. No IPAF submission is required.';
  }
  return 'This IRPF is approved.';
}

function initIrpfPage() {
  renderHeader('irpf');

  const role = getCurrentRole();
  const record = loadOrCreateRecord();
  const controller = new IrpfFormController(record, role);

  document.getElementById('irpf-status-badge').textContent = getStatusLabel(record.status);
  controller.mount(document.getElementById('irpf-form-container'));
  renderActivityLog(record);

  const saveBtn = document.getElementById('btn-save');
  const submitBtn = document.getElementById('btn-submit');
  const approveBtn = document.getElementById('btn-approve');
  const closeBtn = document.getElementById('btn-close');
  const triagePanel = document.getElementById('triage-panel');
  const triageComment = document.getElementById('triage-comment');
  const triageError = document.getElementById('triage-error');
  const approveExemptionBtn = document.getElementById('btn-approve-exemption');
  const returnAmendmentsBtn = document.getElementById('btn-return-amendments');
  const createIpafBtn = document.getElementById('btn-create-ipaf');

  saveBtn.hidden = true;
  submitBtn.hidden = true;
  approveBtn.hidden = true;
  triagePanel.hidden = true;

  if (controller.isEditableByPi()) {
    saveBtn.hidden = false;
    submitBtn.hidden = false;
    if (record.status === 'for_revision') {
      showBanner('This IRPF was returned for amendments. See the comment in Activity below, then resubmit.', 'error');
    }
  } else if (controller.isPendingThisDirectorApproval()) {
    approveBtn.hidden = false;
    showBanner(
      'This IRPF is awaiting your approval as S/D Director before it can be routed to the IRB Secretariat.',
      'info'
    );
  } else if (controller.isPendingSecretariatTriage()) {
    triagePanel.hidden = false;
  } else if (record.status === 'pending_director_approval') {
    showBanner('Awaiting S/D Director approval before this IRPF can proceed.', 'info');
  } else if (record.status === 'pending_review') {
    showBanner(`Routed to ${getRoleLabel(record.routedTo)} for review.`, 'info');
  } else if (record.status === 'for_revision') {
    showBanner('Returned for amendments. Awaiting the PI to address the comments and resubmit.', 'info');
  } else if (record.status === 'under_review') {
    showBanner('Routed to the IRB Member panel for full review. Awaiting unanimous approval.', 'info');
  } else if (record.status === 'approved') {
    showBanner(describeApprovedOutcome(record), 'success');
  } else if (record.status === 'draft') {
    showBanner('You are viewing this draft in read-only mode for your current role.', 'muted');
  }

  saveBtn.addEventListener('click', () => {
    controller.save();
    document.getElementById('irpf-status-badge').textContent = getStatusLabel(record.status);
    showBanner(`Saved as draft. Reference number: ${record.data.refNumber}`, 'success');
    renderActivityLog(record);
    history.replaceState(null, '', `irpf.html?id=${record.id}`);
  });

  submitBtn.addEventListener('click', () => {
    const wasForRevision = record.status === 'for_revision';
    const result = controller.submit();
    if (!result.ok) {
      showBanner('Please resolve the highlighted fields before submitting.', 'error');
      return;
    }
    document.getElementById('irpf-status-badge').textContent = getStatusLabel(record.status);
    showBanner(
      wasForRevision
        ? `Resubmitted. Routed to ${getRoleLabel(record.routedTo)} for review.`
        : `Submitted. Reference number: ${record.data.refNumber}. Routed to the S/D Director for approval.`,
      'success'
    );
    renderActivityLog(record);
    saveBtn.hidden = true;
    submitBtn.hidden = true;
    history.replaceState(null, '', `irpf.html?id=${record.id}`);
  });

  approveBtn.addEventListener('click', () => {
    controller.directorApprove();
    document.getElementById('irpf-status-badge').textContent = getStatusLabel(record.status);
    showBanner(`Approved and routed to ${getRoleLabel(record.routedTo)}.`, 'success');
    renderActivityLog(record);
    approveBtn.hidden = true;
  });

  function handleTriageDecision(action) {
    const comment = triageComment.value;
    const result = action(comment);
    if (!result.ok) {
      triageError.textContent = result.error;
      return;
    }
    triageError.textContent = '';
    document.getElementById('irpf-status-badge').textContent = getStatusLabel(record.status);
    renderActivityLog(record);
    triagePanel.hidden = true;

    if (record.status === 'approved') {
      showBanner(describeApprovedOutcome(record), 'success');
    } else if (record.status === 'for_revision') {
      showBanner('Returned for amendments. The PI has been notified.', 'success');
    } else if (record.status === 'under_review') {
      showBanner('Routed to the IRB Member panel for full review.', 'success');
    }
  }

  approveExemptionBtn.addEventListener('click', () => handleTriageDecision((c) => controller.approveForExemption(c)));
  returnAmendmentsBtn.addEventListener('click', () => handleTriageDecision((c) => controller.returnForAmendments(c)));
  createIpafBtn.addEventListener('click', () => handleTriageDecision((c) => controller.routeToCreateIpaf(c)));

  closeBtn.addEventListener('click', () => {
    window.location.href = 'index.html';
  });
}

document.addEventListener('DOMContentLoaded', initIrpfPage);
