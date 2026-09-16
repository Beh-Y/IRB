/* Wires the IPAF document generation script into ipaf.html: loads the
 * record (always created via the parent IRPF's "Create IPAF Form" button),
 * mounts the form, and exposes the role-appropriate actions. */

function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function renderTriageMemberCheckboxes(selected) {
  const container = document.getElementById('triage-member-checkboxes');
  container.innerHTML = '';
  IRB_MEMBER_IDS.forEach((id) => {
    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = id;
    checkbox.checked = (selected || []).includes(id);
    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(getRoleLabel(id)));
    container.appendChild(label);
  });
}

function getCheckedMemberIds() {
  return Array.from(document.querySelectorAll('#triage-member-checkboxes input:checked')).map((el) => el.value);
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
  const container = document.getElementById('voting-summary');
  const list = document.getElementById('votes-list');
  const tallyEl = document.getElementById('voting-tally');
  list.innerHTML = '';
  tallyEl.innerHTML = '';

  const assigned = controller.getAssignedMembers();
  if (assigned.length === 0) {
    container.hidden = true;
    return;
  }
  container.hidden = false;

  const tally = controller.voteTally();
  const chips = [
    { text: `${tally.total} of ${tally.assignedTotal} assigned member(s) voted`, cls: '' },
    { text: `${tally.approveCount} Approve`, cls: 'tally-chip--approve' },
    { text: `${tally.returnCount} Return`, cls: 'tally-chip--return' },
  ];
  chips.forEach((c) => {
    const chip = document.createElement('span');
    chip.className = `tally-chip ${c.cls}`;
    chip.textContent = c.text;
    tallyEl.appendChild(chip);
  });

  const votes = controller.getVotes();
  assigned.forEach((memberId) => {
    const vote = votes.find((v) => v.voterId === memberId);
    const li = document.createElement('li');
    const meta = document.createElement('div');
    meta.className = 'activity-meta';
    if (vote) {
      meta.textContent = `${new Date(vote.timestamp).toLocaleString()} — ${vote.voterName} — ${vote.decision}`;
    } else {
      meta.textContent = `${getRoleLabel(memberId)} — Pending`;
    }
    li.appendChild(meta);
    if (vote && vote.comment) {
      const note = document.createElement('div');
      note.className = 'activity-note';
      note.textContent = vote.comment;
      li.appendChild(note);
    }
    list.appendChild(li);
  });
}

function renderCollateHint(controller) {
  const hint = document.getElementById('collate-hint');
  const tally = controller.voteTally();
  hint.textContent =
    `${tally.total} of ${tally.assignedTotal} assigned member(s) have reviewed this IPAF so far: ` +
    `${tally.approveCount} Approve, ${tally.returnCount} Return. ` +
    'You can approve it or return it for amendments now, or wait for the rest.';
}

function initIpafPage() {
  renderHeader('ipaf');

  const role = getCurrentRole();
  const id = getQueryParam('id');
  const record = id ? getSubmission(id) : null;

  if (!record) {
    document.querySelector('main.page').innerHTML =
      '<div class="status-banner status-banner--error">This IPAF could not be found. It can only be created from its parent IRPF.</div>';
    return;
  }

  const controller = new IpafFormController(record, role);

  document.getElementById('ipaf-status-badge').textContent = getStatusLabel(record.status, 'IPAF');
  document.getElementById('link-back-to-irpf').href = `irpf.html?id=${record.parentIrpfId}`;
  controller.mount(document.getElementById('ipaf-form-container'));
  renderActivityLog(record);
  renderVotingSummary(controller);
  renderTriageMemberCheckboxes(record.assignedMembers);

  const saveBtn = document.getElementById('btn-save');
  const submitBtn = document.getElementById('btn-submit');
  const approveBtn = document.getElementById('btn-approve');
  const closeBtn = document.getElementById('btn-close');
  const triagePanel = document.getElementById('triage-panel');
  const triageComment = document.getElementById('triage-comment');
  const triageError = document.getElementById('triage-error');
  const routeToMembersBtn = document.getElementById('btn-route-to-members');
  const voteFormPanel = document.getElementById('vote-form-panel');
  const voterIdentityEl = document.getElementById('voter-identity');
  const voteCommentInput = document.getElementById('vote-comment');
  const voteError = document.getElementById('vote-error');
  const castVoteBtn = document.getElementById('btn-cast-vote');
  const collatePanel = document.getElementById('collate-panel');
  const collateComment = document.getElementById('collate-comment');
  const collateError = document.getElementById('collate-error');
  const approveIpafBtn = document.getElementById('btn-approve-ipaf');
  const returnAmendmentsBtn = document.getElementById('btn-return-amendments');
  const piCommentPanel = document.getElementById('pi-comment-panel');
  const piCommentInput = document.getElementById('pi-comment');
  const acknowledgePanel = document.getElementById('acknowledge-panel');
  const acknowledgeBtn = document.getElementById('btn-acknowledge');

  saveBtn.hidden = true;
  submitBtn.hidden = true;
  approveBtn.hidden = true;
  triagePanel.hidden = true;
  voteFormPanel.hidden = true;
  collatePanel.hidden = true;
  piCommentPanel.hidden = true;
  acknowledgePanel.hidden = true;

  function refreshSecretariatPanel() {
    collatePanel.hidden = !controller.isPendingSecretariatUnderReviewAction();
    if (!collatePanel.hidden) renderCollateHint(controller);
  }

  if (controller.isEditableByPi()) {
    saveBtn.hidden = false;
    submitBtn.hidden = false;
    if (record.status === 'for_revision') {
      showBanner('This IPAF was returned for amendments. See the comment in Activity below, then resubmit.', 'error');
      piCommentPanel.hidden = false;
    }
  } else if (controller.isPendingThisDirectorApproval()) {
    approveBtn.hidden = false;
    showBanner(
      'This IPAF is awaiting your approval as S/D Director before it can be routed to the IRB Secretariat.',
      'info'
    );
  } else if (controller.isPendingSecretariatTriage()) {
    triagePanel.hidden = false;
  } else if (controller.isPendingSecretariatUnderReviewAction()) {
    collatePanel.hidden = false;
    renderCollateHint(controller);
  } else if (controller.isAwaitingMemberReview()) {
    const pending = controller
      .getAssignedMembers()
      .filter((mid) => !controller.hasVoted(mid))
      .map((mid) => getRoleLabel(mid))
      .join(', ');
    showBanner(`Waiting on review from: ${pending}.`, 'info');
  } else if (controller.isUnderReviewVotingOpenToMember()) {
    voteFormPanel.hidden = false;
    voterIdentityEl.textContent = getRoleLabel(role);
    showBanner('Review the IPAF below, then cast your vote.', 'info');
  } else if (controller.isUnassignedMemberViewingUnderReview()) {
    showBanner('This IPAF is under review but was not routed to you.', 'muted');
  } else if (controller.isPendingAcknowledgement()) {
    acknowledgePanel.hidden = false;
    showBanner('This IPAF is approved. Please acknowledge your responsibilities as PI below.', 'success');
  } else if (record.status === 'pending_director_approval') {
    showBanner('Awaiting S/D Director approval before this IPAF can proceed.', 'info');
  } else if (record.status === 'pending_review') {
    showBanner(`Routed to ${getRoleLabel(record.routedTo)} for review.`, 'info');
  } else if (record.status === 'for_revision') {
    showBanner('Returned for amendments. Awaiting the PI to address the comments and resubmit.', 'info');
  } else if (record.status === 'under_review') {
    showBanner('Routed to the IRB Member panel for review. Awaiting their feedback.', 'info');
  } else if (record.status === 'approved') {
    showBanner(
      record.acknowledged ? 'This IPAF is approved and has been acknowledged by the PI.' : 'This IPAF is approved.',
      'success'
    );
  } else if (record.status === 'draft') {
    showBanner('You are viewing this draft in read-only mode for your current role.', 'muted');
  }

  saveBtn.addEventListener('click', () => {
    controller.save();
    document.getElementById('ipaf-status-badge').textContent = getStatusLabel(record.status, 'IPAF');
    showBanner(`Saved as draft. Reference number: ${record.data.refNumber}`, 'success');
    renderActivityLog(record);
    history.replaceState(null, '', `ipaf.html?id=${record.id}`);
  });

  submitBtn.addEventListener('click', () => {
    const wasForRevision = record.status === 'for_revision';
    const result = controller.submit(wasForRevision ? piCommentInput.value : undefined);
    if (!result.ok) {
      showBanner('Please resolve the highlighted fields before submitting.', 'error');
      return;
    }
    document.getElementById('ipaf-status-badge').textContent = getStatusLabel(record.status, 'IPAF');
    showBanner(
      wasForRevision
        ? `Resubmitted. Routed to ${getRoleLabel(record.routedTo)} for review.`
        : `Submitted. Reference number: ${record.data.refNumber}. Routed to the S/D Director for approval.`,
      'success'
    );
    renderActivityLog(record);
    saveBtn.hidden = true;
    submitBtn.hidden = true;
    piCommentPanel.hidden = true;
    history.replaceState(null, '', `ipaf.html?id=${record.id}`);
  });

  approveBtn.addEventListener('click', () => {
    controller.directorApprove();
    document.getElementById('ipaf-status-badge').textContent = getStatusLabel(record.status, 'IPAF');
    showBanner(`Approved and routed to ${getRoleLabel(record.routedTo)}.`, 'success');
    renderActivityLog(record);
    approveBtn.hidden = true;
  });

  routeToMembersBtn.addEventListener('click', () => {
    const comment = triageComment.value;
    const result = controller.routeToMembersForReview(comment, getCheckedMemberIds());
    if (!result.ok) {
      triageError.textContent = result.error;
      return;
    }
    triageError.textContent = '';
    document.getElementById('ipaf-status-badge').textContent = getStatusLabel(record.status, 'IPAF');
    renderActivityLog(record);
    triagePanel.hidden = true;
    const names = record.assignedMembers.map((mid) => getRoleLabel(mid)).join(', ');
    showBanner(`Routed to ${names} for review.`, 'success');
  });

  castVoteBtn.addEventListener('click', () => {
    const decisionEl = voteFormPanel.querySelector('input[name="voteDecision"]:checked');
    const result = controller.castVote(decisionEl ? decisionEl.value : null, voteCommentInput.value);
    if (!result.ok) {
      voteError.textContent = result.error;
      return;
    }
    voteError.textContent = '';
    voteCommentInput.value = '';
    voteFormPanel.querySelectorAll('input[name="voteDecision"]').forEach((r) => (r.checked = false));
    renderVotingSummary(controller);
    renderActivityLog(record);
    voteFormPanel.hidden = true;
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
    collateComment.value = '';
    document.getElementById('ipaf-status-badge').textContent = getStatusLabel(record.status, 'IPAF');
    renderActivityLog(record);
    refreshSecretariatPanel();

    if (record.status === 'approved') {
      showBanner('This IPAF is approved.', 'success');
    } else if (record.status === 'for_revision') {
      showBanner('Sent back for revision. The PI has been notified.', 'success');
    }
  }

  approveIpafBtn.addEventListener('click', () => handleCollateDecision((c) => controller.approveIpaf(c)));
  returnAmendmentsBtn.addEventListener('click', () => handleCollateDecision((c) => controller.returnForAmendments(c)));

  acknowledgeBtn.addEventListener('click', () => {
    controller.acknowledge();
    renderActivityLog(record);
    acknowledgePanel.hidden = true;
    showBanner('Thank you for acknowledging your responsibilities as PI.', 'success');
  });

  closeBtn.addEventListener('click', () => {
    window.location.href = `irpf.html?id=${record.parentIrpfId}`;
  });
}

document.addEventListener('DOMContentLoaded', initIpafPage);
