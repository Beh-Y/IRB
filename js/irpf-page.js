/* Wires the IRPF document generation script into irpf.html: loads/creates the
 * record, mounts the form, and exposes the role-appropriate actions. Every
 * action that changes the record's status or state redirects to the
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
    childIpafId: null,
  };
}

/* Creates the child IPAF record for this IRPF, carrying over the fields the
 * IPAF spec marks "Carried from IRPF" (reference number, project title/
 * dates, and the category of research needed to route and suffix it). */
function createChildIpaf(irpfRecord, actorRole) {
  const ipafRecord = {
    id: generateId(),
    formType: 'IPAF',
    status: 'draft',
    parentIrpfId: irpfRecord.id,
    data: {
      irpfReferenceNumber: irpfRecord.data.refNumber,
      projectTitle: irpfRecord.data.projectTitle,
      projectStartDate: irpfRecord.data.projectStartDate,
      projectEndDate: irpfRecord.data.projectEndDate,
      categoryOfResearch: irpfRecord.data.categoryOfResearch,
    },
    history: [],
    votes: [],
    assignedMembers: [],
    leadershipApprovals: [],
    createdAt: new Date().toISOString(),
    updatedAt: null,
    routedTo: null,
    acknowledged: false,
    acknowledgedAt: null,
  };
  saveSubmission(ipafRecord, {
    action: 'created',
    actor: actorRole,
    status: ipafRecord.status,
    note: `Created from IRPF ${irpfRecord.data.refNumber}.`,
  });
  return ipafRecord;
}

function renderMemberCheckboxes(containerId, selected) {
  const container = document.getElementById(containerId);
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

function getCheckedMemberIds(containerId) {
  return Array.from(document.querySelectorAll(`#${containerId} input:checked`)).map((el) => el.value);
}

function showBanner(message, type) {
  const banner = document.getElementById('status-banner');
  banner.textContent = message;
  banner.className = `status-banner status-banner--${type}`;
  banner.hidden = false;
}

// The PI never sees the review process itself (routing, votes, returns,
// resubmissions) -- only the milestones that are theirs to know about: their
// initial submission, the S/D Director's approval, and the final outcome.
const IRPF_PI_VISIBLE_ACTIONS = ['submit', 'director_approve', 'approved_for_exemption', 'to_create_ipaf'];

function renderActivityLog(record, role) {
  const container = document.getElementById('activity-log');
  const list = document.getElementById('activity-log-list');
  list.innerHTML = '';

  const entries =
    role === 'pi' ? (record.history || []).filter((h) => IRPF_PI_VISIBLE_ACTIONS.includes(h.action)) : record.history || [];

  if (entries.length === 0) {
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
  [...entries].reverse().forEach((entry) => {
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

/* Top-of-page panel showing every comment left so far -- from IRB Member
 * votes, IRB Leadership votes, and the Secretariat's own past "Return for
 * Amendments" notes (from triage, under-review-action, or collate) -- in
 * one place, newest first. Staff reviewers (Secretariat, IRB Members, IRB
 * Leadership) see it fully identified: who left each one and their
 * decision. The PI sees the same combined comments here too, but
 * blinded -- just the text, no identity, decision, or tally -- since
 * review is meant to stay anonymous to the PI. This is now the PI's one
 * feedback panel; the mid-page IRB Member Panel / IRB Leadership Approval
 * panels stay hidden for the PI to avoid showing the same thing twice. */
function renderCommentsPanel(controller) {
  const container = document.getElementById('comments-panel');
  const heading = document.getElementById('comments-panel-heading');
  const list = document.getElementById('comments-panel-list');

  const role = controller.currentRole;
  const isStaffReviewer = isSecretariat(role) || isIrbMember(role) || isIrbLeadership(role);
  if (!isStaffReviewer && role !== 'pi') {
    container.hidden = true;
    return;
  }

  const memberEntries = controller.getVotes().map((v) => ({ identity: v.voterName, decision: v.decision, comment: v.comment, timestamp: v.timestamp }));
  const leadershipEntries = controller
    .getLeadershipApprovals()
    .map((a) => ({ identity: a.approverName, decision: a.decision, comment: a.comment, timestamp: a.timestamp }));
  const secretariatEntries = (controller.record.history || [])
    .filter((h) => h.action === 'returned_for_amendments')
    .map((h) => ({ identity: getRoleLabel(h.actor), decision: 'Returned for Amendments', comment: h.note, timestamp: h.timestamp }));

  if (role === 'pi') {
    heading.textContent = 'Reviewer Feedback';
    const hasComments = renderBlindedReviewComments(
      list,
      [...memberEntries, ...leadershipEntries, ...secretariatEntries].map((e) => e.comment)
    );
    container.hidden = !hasComments;
    return;
  }

  heading.textContent = 'Comments';
  const hasComments = renderIdentifiedReviewComments(list, [...memberEntries, ...leadershipEntries, ...secretariatEntries]);
  container.hidden = !hasComments;
}

function renderVotingSummary(controller) {
  const container = document.getElementById('voting-summary');
  const heading = document.getElementById('voting-summary-heading');
  const list = document.getElementById('votes-list');
  const tallyEl = document.getElementById('voting-tally');
  list.innerHTML = '';
  tallyEl.innerHTML = '';

  if (controller.currentRole === 'pi') {
    // The PI's blinded feedback now lives in the top-of-page Comments
    // panel (renderCommentsPanel) instead, so this mid-page panel just
    // stays out of the way rather than showing the same thing twice.
    container.hidden = true;
    return;
  }

  const assigned = controller.getAssignedMembers();
  if (assigned.length === 0) {
    container.hidden = true;
    return;
  }
  container.hidden = false;
  heading.textContent = 'IRB Member Panel';

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
  const heading = document.getElementById('leadership-summary-heading');
  const list = document.getElementById('leadership-approvals-list');
  const tallyEl = document.getElementById('leadership-tally');
  list.innerHTML = '';
  tallyEl.innerHTML = '';

  if (controller.currentRole === 'pi') {
    // Leadership's feedback (and everything else relevant) is already
    // folded into the top-of-page Comments panel (renderCommentsPanel),
    // so this separate panel just stays out of the PI's way entirely
    // rather than showing a redundant/empty duplicate.
    container.hidden = true;
    return;
  }

  const record = controller.record;
  const everReached = record.status === 'pending_leadership_approval' || controller.getLeadershipApprovals().length > 0;
  if (!everReached) {
    container.hidden = true;
    return;
  }

  container.hidden = false;
  heading.textContent = 'IRB Leadership Approval';

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

function describeFinalOutcome(record) {
  if (record.status === 'to_create_ipaf') {
    return 'This IRPF requires a full IPAF submission next, following full IRB Member review.';
  }
  if (record.reviewOutcome === 'exemption') {
    return 'This IRPF was approved for exemption. No IPAF submission is required.';
  }
  return 'This IRPF is approved.';
}

function renderCollateHint(controller) {
  const hint = document.getElementById('collate-hint');
  const tally = controller.leadershipTally();
  hint.textContent =
    `${tally.total} of ${tally.leadershipTotal} IRB leader(s) have reviewed this IRPF so far: ` +
    `${tally.approveCount} Approve, ${tally.returnCount} Return. ` +
    'Choose the final outcome below, or wait for the rest if you prefer.';
}

function renderUnderReviewActionHint(controller) {
  const hint = document.getElementById('under-review-action-hint');
  const tally = controller.voteTally();
  hint.textContent =
    `${tally.total} of ${tally.assignedTotal} assigned member(s) have reviewed this IRPF so far: ` +
    `${tally.approveCount} Approve, ${tally.returnCount} Return. ` +
    'You can route it on to the Co-Chairman and Chairman, or return it for amendments now — or wait for the rest.';
}

function initIrpfPage() {
  renderHeader('irpf');

  const role = getCurrentRole();
  const record = loadOrCreateRecord();
  const controller = new IrpfFormController(record, role);

  document.getElementById('irpf-status-badge').textContent = getStatusLabel(record.status);
  controller.mount(document.getElementById('irpf-form-container'));
  renderActivityLog(record, role);
  renderCommentsPanel(controller);
  renderVotingSummary(controller);
  renderLeadershipSummary(controller);
  renderMemberCheckboxes('triage-member-checkboxes', record.assignedMembers);
  renderMemberCheckboxes('under-review-member-checkboxes', record.assignedMembers);
  renderMemberCheckboxes('collate-member-checkboxes', record.assignedMembers);

  const saveBtn = document.getElementById('btn-save');
  const submitBtn = document.getElementById('btn-submit');
  const approveBtn = document.getElementById('btn-approve');
  const closeBtn = document.getElementById('btn-close');
  const triagePanel = document.getElementById('triage-panel');
  const triageComment = document.getElementById('triage-comment');
  const triageError = document.getElementById('triage-error');
  const routeToMembersBtn = document.getElementById('btn-route-to-members');
  const triageRouteToLeadershipBtn = document.getElementById('btn-triage-route-to-leadership');
  const triageReturnAmendmentsBtn = document.getElementById('btn-triage-return-amendments');
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
  const underReviewActionPanel = document.getElementById('under-review-action-panel');
  const underReviewActionCommentInput = document.getElementById('under-review-action-comment');
  const underReviewActionError = document.getElementById('under-review-action-error');
  const underReviewRouteToMembersBtn = document.getElementById('btn-under-review-route-to-members');
  const routeToLeadershipBtn = document.getElementById('btn-route-to-leadership');
  const returnAmendmentsEarlyBtn = document.getElementById('btn-return-amendments-early');
  const collateRouteToMembersBtn = document.getElementById('btn-collate-route-to-members');
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
  underReviewActionPanel.hidden = true;
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
  } else if (controller.isPendingSecretariatUnderReviewAction()) {
    underReviewActionPanel.hidden = false;
    renderUnderReviewActionHint(controller);
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
    showBanner('Review the IRPF below, then cast your vote.', 'info');
  } else if (controller.isLeadershipWaitingOnOther()) {
    const otherName = getRoleLabel(IRB_LEADERSHIP_IDS.find((id) => id !== role));
    showBanner(`You've voted. Waiting on ${otherName}.`, 'info');
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
  } else if (record.status === 'approved' || record.status === 'to_create_ipaf') {
    showBanner(describeFinalOutcome(record), 'success');
  } else if (record.status === 'draft') {
    showBanner('You are viewing this draft in read-only mode for your current role.', 'muted');
  }

  const ipafLinkPanel = document.getElementById('ipaf-link-panel');
  const createIpafChildBtn = document.getElementById('btn-create-ipaf-child');
  const openIpafChildLink = document.getElementById('link-open-ipaf-child');

  if (record.status === 'to_create_ipaf') {
    ipafLinkPanel.hidden = false;
    if (record.childIpafId) {
      createIpafChildBtn.hidden = true;
      openIpafChildLink.hidden = false;
      openIpafChildLink.href = `ipaf.html?id=${record.childIpafId}`;
    } else {
      createIpafChildBtn.hidden = false;
      openIpafChildLink.hidden = true;
    }
  } else {
    ipafLinkPanel.hidden = true;
  }

  createIpafChildBtn.addEventListener('click', () => {
    const ipafRecord = createChildIpaf(record, role);
    record.childIpafId = ipafRecord.id;
    saveSubmission(record, {
      action: 'ipaf_created',
      actor: role,
      status: record.status,
      note: `Created child IPAF ${ipafRecord.id}.`,
    });
    goToDashboardWithMessage(
      `IPAF form ${ipafRecord.data.refNumber || ''} created. Open it from the dashboard to continue.`,
      'success'
    );
  });

  saveBtn.addEventListener('click', () => {
    controller.save();
    goToDashboardWithMessage('Saved as draft. A reference number is assigned once this IRPF is submitted.', 'success');
  });

  submitBtn.addEventListener('click', () => {
    const wasForRevision = record.status === 'for_revision';
    const result = controller.submit(wasForRevision ? piCommentInput.value : undefined);
    if (!result.ok) {
      const missing = describeMissingFields(result.errors, controller.fields);
      showBanner(`Please complete the following required field(s) before submitting: ${missing.join(', ')}.`, 'error');
      return;
    }
    goToDashboardWithMessage(
      wasForRevision
        ? `Resubmitted. Routed to ${getRoleLabel(record.routedTo)} for review.`
        : `Submitted. Reference number: ${record.data.refNumber}. Routed to the S/D Director for approval.`,
      'success'
    );
  });

  approveBtn.addEventListener('click', () => {
    controller.directorApprove();
    goToDashboardWithMessage(`Approved and routed to ${getRoleLabel(record.routedTo)}.`, 'success');
  });

  routeToMembersBtn.addEventListener('click', () => {
    const comment = triageComment.value;
    const result = controller.routeToMembersForReview(comment, getCheckedMemberIds('triage-member-checkboxes'));
    if (!result.ok) {
      triageError.textContent = result.error;
      return;
    }
    const names = record.assignedMembers.map((id) => getRoleLabel(id)).join(', ');
    goToDashboardWithMessage(`Routed to ${names} for review.`, 'success');
  });

  triageRouteToLeadershipBtn.addEventListener('click', () => {
    controller.routeToLeadershipApproval(triageComment.value);
    goToDashboardWithMessage('Routed to the IRB Co-Chairman and Chairman for approval.', 'success');
  });

  triageReturnAmendmentsBtn.addEventListener('click', () => {
    const result = controller.returnForAmendments(triageComment.value);
    if (!result.ok) {
      triageError.textContent = result.error;
      return;
    }
    goToDashboardWithMessage('Sent back for revision. The PI has been notified.', 'success');
  });

  castVoteBtn.addEventListener('click', () => {
    const decisionEl = voteFormPanel.querySelector('input[name="voteDecision"]:checked');
    const result = controller.castVote(decisionEl ? decisionEl.value : null, voteCommentInput.value);
    if (!result.ok) {
      voteError.textContent = result.error;
      return;
    }
    goToDashboardWithMessage('Vote recorded. Thank you.', 'success');
  });

  underReviewRouteToMembersBtn.addEventListener('click', () => {
    const result = controller.routeToMembersFromUnderReview(
      underReviewActionCommentInput.value,
      getCheckedMemberIds('under-review-member-checkboxes')
    );
    if (!result.ok) {
      underReviewActionError.textContent = result.error;
      return;
    }
    const names = record.assignedMembers.map((id) => getRoleLabel(id)).join(', ');
    goToDashboardWithMessage(`Routed to ${names} for review.`, 'success');
  });

  routeToLeadershipBtn.addEventListener('click', () => {
    controller.routeToLeadershipApproval(underReviewActionCommentInput.value);
    goToDashboardWithMessage('Routed to the IRB Co-Chairman and Chairman for approval.', 'success');
  });

  returnAmendmentsEarlyBtn.addEventListener('click', () => {
    const result = controller.returnForAmendments(underReviewActionCommentInput.value);
    if (!result.ok) {
      underReviewActionError.textContent = result.error;
      return;
    }
    goToDashboardWithMessage('Sent back for revision. The PI has been notified.', 'success');
  });

  leadershipVoteBtn.addEventListener('click', () => {
    const decisionEl = leadershipApprovalPanel.querySelector('input[name="leadershipDecision"]:checked');
    const result = controller.castLeadershipVote(decisionEl ? decisionEl.value : null, leadershipCommentInput.value);
    if (!result.ok) {
      leadershipError.textContent = result.error;
      return;
    }
    goToDashboardWithMessage('Vote recorded. Thank you.', 'success');
  });

  function handleCollateDecision(action) {
    const comment = collateComment.value;
    const result = action(comment);
    if (!result.ok) {
      collateError.textContent = result.error;
      return;
    }
    if (record.status === 'approved' || record.status === 'to_create_ipaf') {
      goToDashboardWithMessage(describeFinalOutcome(record), 'success');
    } else if (record.status === 'for_revision') {
      goToDashboardWithMessage('Sent back for revision. The PI has been notified.', 'success');
    } else if (record.status === 'under_review') {
      const names = record.assignedMembers.map((id) => getRoleLabel(id)).join(', ');
      goToDashboardWithMessage(`Routed to ${names} for review.`, 'success');
    } else {
      goToDashboardWithMessage('Decision recorded.', 'success');
    }
  }

  collateRouteToMembersBtn.addEventListener('click', () =>
    handleCollateDecision((c) => controller.routeToMembersFromCollate(c, getCheckedMemberIds('collate-member-checkboxes')))
  );
  approveExemptionBtn.addEventListener('click', () => handleCollateDecision((c) => controller.approveForExemption(c)));
  returnAmendmentsBtn.addEventListener('click', () => handleCollateDecision((c) => controller.returnForAmendments(c)));
  createIpafBtn.addEventListener('click', () => handleCollateDecision((c) => controller.decideToCreateIpaf(c)));

  closeBtn.addEventListener('click', () => {
    window.location.href = 'index.html';
  });

  mirrorActionRow(document.querySelector('.form-actions'), document.getElementById('top-actions'));
  [
    triagePanel,
    voteFormPanel,
    underReviewActionPanel,
    leadershipApprovalPanel,
    collatePanel,
    ipafLinkPanel,
  ].forEach((panel) => {
    mirrorActionRow(panel, document.getElementById('bottom-panel-actions'));
  });
}

document.addEventListener('DOMContentLoaded', initIrpfPage);
