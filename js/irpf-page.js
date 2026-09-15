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
    votes: [],
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

function renderVotingSummary(controller) {
  const record = controller.record;
  const container = document.getElementById('voting-summary');
  const list = document.getElementById('votes-list');
  const tallyEl = document.getElementById('voting-tally');
  list.innerHTML = '';
  tallyEl.innerHTML = '';

  const votes = controller.getVotes();
  if (votes.length === 0) {
    container.hidden = true;
    return;
  }
  container.hidden = false;

  const tally = controller.voteTally();
  const chips = [
    { text: `${tally.total} vote${tally.total === 1 ? '' : 's'} cast`, cls: '' },
    { text: `${tally.approveCount} Approve`, cls: 'tally-chip--approve' },
    { text: `${tally.returnCount} Return`, cls: 'tally-chip--return' },
  ];
  chips.forEach((c) => {
    const chip = document.createElement('span');
    chip.className = `tally-chip ${c.cls}`;
    chip.textContent = c.text;
    tallyEl.appendChild(chip);
  });

  votes.forEach((v) => {
    const li = document.createElement('li');
    const meta = document.createElement('div');
    meta.className = 'activity-meta';
    meta.textContent = `${new Date(v.timestamp).toLocaleString()} — ${v.voterName} — ${v.decision}`;
    li.appendChild(meta);
    if (v.comment) {
      const note = document.createElement('div');
      note.className = 'activity-note';
      note.textContent = v.comment;
      li.appendChild(note);
    }
    list.appendChild(li);
  });
}

function describeApprovedOutcome(record) {
  if (record.reviewOutcome === 'exemption') {
    return 'This IRPF was approved for exemption. No IPAF submission is required.';
  }
  if (record.reviewOutcome === 'full_review' && record.ipafRequired) {
    return 'This IRPF is approved following full IRB Member review. An IPAF submission is required next.';
  }
  return 'This IRPF is approved.';
}

function renderCollateHint(controller) {
  const hint = document.getElementById('collate-hint');
  const tally = controller.voteTally();
  if (tally.total === 0) {
    hint.textContent = 'No votes have been cast yet. Waiting on the IRB Member panel.';
  } else if (controller.canSendForRevisionFromUnderReview()) {
    hint.textContent = `${tally.returnCount} of ${tally.total} member(s) returned this submission. You may send it back for revision.`;
  } else if (controller.canFinalizeApproval()) {
    hint.textContent = `All ${tally.total} member(s) approved. You may finalize approval.`;
  } else {
    hint.textContent = `${tally.approveCount} of ${tally.total} member(s) have voted so far.`;
  }

  document.getElementById('btn-finalize-approve').disabled = !controller.canFinalizeApproval();
  document.getElementById('btn-send-for-revision').disabled = !controller.canSendForRevisionFromUnderReview();
}

function initIrpfPage() {
  renderHeader('irpf');

  const role = getCurrentRole();
  const record = loadOrCreateRecord();
  const controller = new IrpfFormController(record, role);

  document.getElementById('irpf-status-badge').textContent = getStatusLabel(record.status);
  controller.mount(document.getElementById('irpf-form-container'));
  renderActivityLog(record);
  renderVotingSummary(controller);

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
  const voteFormPanel = document.getElementById('vote-form-panel');
  const voterNameInput = document.getElementById('voter-name');
  const voteCommentInput = document.getElementById('vote-comment');
  const voteError = document.getElementById('vote-error');
  const castVoteBtn = document.getElementById('btn-cast-vote');
  const collatePanel = document.getElementById('collate-panel');
  const collateComment = document.getElementById('collate-comment');
  const collateError = document.getElementById('collate-error');
  const finalizeApproveBtn = document.getElementById('btn-finalize-approve');
  const sendForRevisionBtn = document.getElementById('btn-send-for-revision');

  saveBtn.hidden = true;
  submitBtn.hidden = true;
  approveBtn.hidden = true;
  triagePanel.hidden = true;
  voteFormPanel.hidden = true;
  collatePanel.hidden = true;

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
  } else if (controller.isPendingSecretariatCollation()) {
    collatePanel.hidden = false;
    renderCollateHint(controller);
  } else if (controller.isUnderReviewVotingOpenToMember()) {
    voteFormPanel.hidden = false;
    showBanner('Review the IRPF below, then cast your vote as an IRB Member.', 'info');
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

  castVoteBtn.addEventListener('click', () => {
    const decisionEl = voteFormPanel.querySelector('input[name="voteDecision"]:checked');
    const result = controller.castVote(voterNameInput.value, decisionEl ? decisionEl.value : null, voteCommentInput.value);
    if (!result.ok) {
      voteError.textContent = result.error;
      return;
    }
    voteError.textContent = '';
    voterNameInput.value = '';
    voteCommentInput.value = '';
    voteFormPanel.querySelectorAll('input[name="voteDecision"]').forEach((r) => (r.checked = false));
    renderVotingSummary(controller);
    renderActivityLog(record);
    showBanner('Vote recorded. Thank you.', 'success');
  });

  function handleCollateDecision(action) {
    const comment = collateComment.value;
    const result = action(comment);
    if (!result.ok) {
      collateError.textContent = result.error;
      return;
    }
    collateError.textContent = '';
    document.getElementById('irpf-status-badge').textContent = getStatusLabel(record.status);
    renderActivityLog(record);
    collatePanel.hidden = true;

    if (record.status === 'approved') {
      showBanner(describeApprovedOutcome(record), 'success');
    } else if (record.status === 'for_revision') {
      showBanner('Sent back for revision. The PI has been notified.', 'success');
    }
  }

  finalizeApproveBtn.addEventListener('click', () => handleCollateDecision((c) => controller.finalizeApprovalFromUnderReview(c)));
  sendForRevisionBtn.addEventListener('click', () => handleCollateDecision((c) => controller.sendForRevisionFromUnderReview(c)));

  closeBtn.addEventListener('click', () => {
    window.location.href = 'index.html';
  });
}

document.addEventListener('DOMContentLoaded', initIrpfPage);
