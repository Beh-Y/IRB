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
    assignedMembers: [],
    leadershipApprovals: [],
    createdAt: null,
    updatedAt: null,
    routedTo: null,
    reviewOutcome: null,
    ipafRequired: null,
  };
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

function renderLeadershipSummary(controller) {
  const container = document.getElementById('leadership-summary');
  const list = document.getElementById('leadership-approvals-list');
  const tallyEl = document.getElementById('leadership-tally');
  list.innerHTML = '';
  tallyEl.innerHTML = '';

  const record = controller.record;
  const everReached = record.status === 'pending_leadership_approval' || controller.getLeadershipApprovals().length > 0;
  if (!everReached) {
    container.hidden = true;
    return;
  }
  container.hidden = false;

  const approvals = controller.getLeadershipApprovals();
  const tally = controller.leadershipTally();
  const chips = [
    { text: `${tally.total} of ${tally.leadershipTotal} reviewed`, cls: '' },
    { text: `${tally.approveCount} Approve`, cls: 'tally-chip--approve' },
    { text: `${tally.returnCount} Return`, cls: 'tally-chip--return' },
  ];
  chips.forEach((c) => {
    const chip = document.createElement('span');
    chip.className = `tally-chip ${c.cls}`;
    chip.textContent = c.text;
    tallyEl.appendChild(chip);
  });

  IRB_LEADERSHIP_IDS.forEach((id) => {
    const approval = approvals.find((a) => a.approverId === id);
    const li = document.createElement('li');
    const meta = document.createElement('div');
    meta.className = 'activity-meta';
    if (approval) {
      meta.textContent = `${new Date(approval.timestamp).toLocaleString()} — ${approval.approverName} — ${approval.decision}`;
    } else {
      meta.textContent = `${getRoleLabel(id)} — Pending`;
    }
    li.appendChild(meta);
    if (approval && approval.comment) {
      const note = document.createElement('div');
      note.className = 'activity-note';
      note.textContent = approval.comment;
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
  if (controller.record.status === 'pending_leadership_approval') {
    const tally = controller.leadershipTally();
    hint.textContent =
      `The Co-Chairman and Chairman have both reviewed this IRPF: ` +
      `${tally.approveCount} Approve, ${tally.returnCount} Return. ` +
      'Choose the final outcome below.';
    return;
  }
  const tally = controller.voteTally();
  hint.textContent =
    `All ${tally.assignedTotal} assigned member(s) have reviewed this IRPF: ` +
    `${tally.approveCount} Approve, ${tally.returnCount} Return. ` +
    'Choose the final outcome below.';
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
  renderLeadershipSummary(controller);
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
  const approveExemptionBtn = document.getElementById('btn-approve-exemption');
  const returnAmendmentsBtn = document.getElementById('btn-return-amendments');
  const createIpafBtn = document.getElementById('btn-create-ipaf');
  const piCommentPanel = document.getElementById('pi-comment-panel');
  const piCommentInput = document.getElementById('pi-comment');
  const routeToLeadershipPanel = document.getElementById('route-to-leadership-panel');
  const routeLeadershipCommentInput = document.getElementById('route-leadership-comment');
  const routeToLeadershipBtn = document.getElementById('btn-route-to-leadership');
  const leadershipApprovalPanel = document.getElementById('leadership-approval-panel');
  const leadershipIdentityEl = document.getElementById('leadership-identity');
  const leadershipCommentInput = document.getElementById('leadership-comment');
  const leadershipError = document.getElementById('leadership-error');
  const leadershipVoteBtn = document.getElementById('btn-leadership-vote');

  saveBtn.hidden = true;
  submitBtn.hidden = true;
  approveBtn.hidden = true;
  triagePanel.hidden = true;
  voteFormPanel.hidden = true;
  collatePanel.hidden = true;
  piCommentPanel.hidden = true;
  routeToLeadershipPanel.hidden = true;
  leadershipApprovalPanel.hidden = true;

  if (controller.isEditableByPi()) {
    saveBtn.hidden = false;
    submitBtn.hidden = false;
    if (record.status === 'for_revision') {
      showBanner('This IRPF was returned for amendments. See the comment in Activity below, then resubmit.', 'error');
      piCommentPanel.hidden = false;
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
  } else if (controller.isPendingSecretariatRouteToLeadership()) {
    routeToLeadershipPanel.hidden = false;
  } else if (controller.isAwaitingMemberReview()) {
    const pending = controller
      .getAssignedMembers()
      .filter((id) => !controller.hasVoted(id))
      .map((id) => getRoleLabel(id))
      .join(', ');
    showBanner(`Waiting on review from: ${pending}.`, 'info');
  } else if (controller.isUnderReviewVotingOpenToMember()) {
    voteFormPanel.hidden = false;
    voterIdentityEl.textContent = getRoleLabel(role);
    showBanner('Review the IRPF below, then cast your vote.', 'info');
  } else if (controller.isUnassignedMemberViewingUnderReview()) {
    showBanner('This IRPF is under review but was not routed to you.', 'muted');
  } else if (controller.isPendingLeadershipApproval()) {
    leadershipApprovalPanel.hidden = false;
    leadershipIdentityEl.textContent = getRoleLabel(role);
    showBanner('Review the IRPF below, then submit your decision.', 'info');
  } else if (controller.isLeadershipWaitingOnOther()) {
    const otherName = getRoleLabel(IRB_LEADERSHIP_IDS.find((id) => id !== role));
    showBanner(`You've submitted your review. Waiting on ${otherName}.`, 'info');
  } else if (controller.isAwaitingLeadershipApproval()) {
    const pending = IRB_LEADERSHIP_IDS.filter((id) => !controller.hasLeadershipVoted(id))
      .map((id) => getRoleLabel(id))
      .join(', ');
    showBanner(`Waiting on review from: ${pending}.`, 'info');
  } else if (record.status === 'pending_director_approval') {
    showBanner('Awaiting S/D Director approval before this IRPF can proceed.', 'info');
  } else if (record.status === 'pending_review') {
    showBanner(`Routed to ${getRoleLabel(record.routedTo)} for review.`, 'info');
  } else if (record.status === 'for_revision') {
    showBanner('Returned for amendments. Awaiting the PI to address the comments and resubmit.', 'info');
  } else if (record.status === 'under_review') {
    showBanner('Routed to the IRB Member panel for review. Awaiting their feedback.', 'info');
  } else if (record.status === 'pending_leadership_approval') {
    showBanner('Routed to the IRB Co-Chairman and Chairman for approval. Awaiting their decision.', 'info');
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
    const result = controller.submit(wasForRevision ? piCommentInput.value : undefined);
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
    piCommentPanel.hidden = true;
    history.replaceState(null, '', `irpf.html?id=${record.id}`);
  });

  approveBtn.addEventListener('click', () => {
    controller.directorApprove();
    document.getElementById('irpf-status-badge').textContent = getStatusLabel(record.status);
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
    document.getElementById('irpf-status-badge').textContent = getStatusLabel(record.status);
    renderActivityLog(record);
    triagePanel.hidden = true;
    const names = record.assignedMembers.map((id) => getRoleLabel(id)).join(', ');
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

  routeToLeadershipBtn.addEventListener('click', () => {
    controller.routeToLeadershipApproval(routeLeadershipCommentInput.value);
    document.getElementById('irpf-status-badge').textContent = getStatusLabel(record.status);
    renderActivityLog(record);
    renderLeadershipSummary(controller);
    routeToLeadershipPanel.hidden = true;
    showBanner('Routed to the IRB Co-Chairman and Chairman for approval.', 'success');
  });

  leadershipVoteBtn.addEventListener('click', () => {
    const decisionEl = leadershipApprovalPanel.querySelector('input[name="leadershipDecision"]:checked');
    const result = controller.castLeadershipVote(decisionEl ? decisionEl.value : null, leadershipCommentInput.value);
    if (!result.ok) {
      leadershipError.textContent = result.error;
      return;
    }
    leadershipError.textContent = '';
    leadershipCommentInput.value = '';
    leadershipApprovalPanel.querySelectorAll('input[name="leadershipDecision"]').forEach((r) => (r.checked = false));
    renderLeadershipSummary(controller);
    renderActivityLog(record);
    leadershipApprovalPanel.hidden = true;
    showBanner('Review recorded. Thank you.', 'success');
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

  approveExemptionBtn.addEventListener('click', () => handleCollateDecision((c) => controller.approveForExemption(c)));
  returnAmendmentsBtn.addEventListener('click', () => handleCollateDecision((c) => controller.returnForAmendments(c)));
  createIpafBtn.addEventListener('click', () => handleCollateDecision((c) => controller.decideToCreateIpaf(c)));

  closeBtn.addEventListener('click', () => {
    window.location.href = 'index.html';
  });
}

document.addEventListener('DOMContentLoaded', initIrpfPage);
