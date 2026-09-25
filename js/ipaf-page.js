/* Wires the IPAF document generation script into ipaf.html: loads the
 * record (always created via the parent IRPF's "Create IPAF Form" button),
 * mounts the form, and exposes the role-appropriate actions. Every action
 * that changes the record's status or state redirects to the dashboard on
 * success (with a flash banner there); only a failed action (validation, a
 * missing comment) keeps the user on this page so they can fix it. */

function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
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

// The PI never sees the review process itself (routing, votes, returns) --
// only their own actions (submit, resubmit, acknowledge) plus two milestones
// triggered by someone else: the S/D Director's approval and the final
// outcome. Those other-triggered milestones show up in the log (see
// renderActivityLog below), but with their note text hidden -- the PI gets
// the "what happened," not the internal detail behind it.
const IPAF_PI_VISIBLE_ACTIONS = ['submit', 'resubmit', 'director_approve', 'approved', 'acknowledged'];

function renderActivityLog(record, role) {
  const container = document.getElementById('activity-log');
  const list = document.getElementById('activity-log-list');
  list.innerHTML = '';

  const entries =
    role === 'pi' ? (record.history || []).filter((h) => IPAF_PI_VISIBLE_ACTIONS.includes(h.action)) : record.history || [];

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
  // PI and S/D Director stay blind to exactly which IRB Member, Secretariat
  // team, or Leadership member acted -- same as the Reviewer Feedback panel
  // -- so their identity is generalized wherever it'd otherwise show here.
  const blindIdentity = role === 'pi' || role === 'sd-director';

  [...entries].reverse().forEach((entry) => {
    const li = document.createElement('li');

    const meta = document.createElement('div');
    meta.className = 'activity-meta';
    const when = entry.timestamp ? new Date(entry.timestamp).toLocaleString() : '';
    const actorLabel = blindIdentity ? blindedRoleLabel(entry.actor) : getRoleLabel(entry.actor);
    meta.textContent = `${when} — ${actorLabel} — ${entry.action.replace(/_/g, ' ')}`;
    li.appendChild(meta);

    // The PI sees the note text only for their own actions -- an entry
    // someone else triggered (Director approval, the final decision) shows
    // just the milestone and when it happened, not the detail behind it.
    const showNote = role !== 'pi' || entry.actor === 'pi';
    if (entry.note && showNote) {
      const note = document.createElement('div');
      note.className = 'activity-note';
      note.textContent = blindIdentity ? scrubStaffIdentities(entry.note) : entry.note;
      li.appendChild(note);
    }

    list.appendChild(li);
  });
}

// Staff (Secretariat, IRB Members, IRB Leadership, and the System Admin,
// who can see everything) see the full conversation thread, not just the
// current review cycle: reviewer comments and the PI's own responses on
// every resubmission, so a re-triage or re-route that resets the working
// votes/leadershipApprovals arrays never makes earlier comments disappear
// from this panel.
const STAFF_COMMENT_ACTIONS = ['member_vote', 'leadership_vote', 'returned_for_amendments', 'resubmit'];

/* Top-of-page panel showing every comment left so far. Staff reviewers
 * (Secretariat, IRB Members, IRB Leadership, System Admin) see it fully
 * identified -- who left each one, their decision, and when -- built from
 * the permanent
 * history log (see STAFF_COMMENT_ACTIONS above) so it survives re-triage
 * and re-routing, in chronological order like a conversation thread. The
 * PI sees a blinded version instead -- no identity or decision, just each
 * comment labeled Feedback/Response -- built from that same permanent
 * history so every past round (and the PI's own response to each) still
 * shows up here, not just the current cycle: this is the PI's one
 * feedback panel, and it's meant to read as the full back-and-forth. The
 * mid-page IRB Member Panel / IRB Leadership Approval panels stay hidden
 * for the PI to avoid showing the same thing twice. */
function renderCommentsPanel(controller) {
  const container = document.getElementById('comments-panel');
  const heading = document.getElementById('comments-panel-heading');
  const list = document.getElementById('comments-panel-list');

  const role = controller.currentRole;
  const isStaffReviewer = isSecretariat(role) || isIrbMember(role) || isIrbLeadership(role) || role === 'system-admin';
  if (!isStaffReviewer && role !== 'pi') {
    container.hidden = true;
    return;
  }

  if (role === 'pi') {
    heading.textContent = 'Reviewer Feedback';
    // "Route to Secretariat" is a reviewer deferring the decision to the
    // Secretariat, not feedback on the research itself -- leave it out of
    // what the PI sees so it doesn't read as an amendment request.
    const entries = (controller.record.history || [])
      .filter((h) => STAFF_COMMENT_ACTIONS.includes(h.action) && h.comment && h.comment.trim())
      .filter((h) => h.decision !== 'Route to Secretariat')
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    const hasComments = renderBlindedReviewComments(list, entries);
    container.hidden = !hasComments;
    return;
  }

  heading.textContent = 'Comments';
  const entries = (controller.record.history || [])
    .filter((h) => STAFF_COMMENT_ACTIONS.includes(h.action))
    .map((h) => ({ identity: getRoleLabel(h.actor), decision: h.decision, comment: h.comment, timestamp: h.timestamp }));
  const hasComments = renderIdentifiedReviewComments(list, entries);
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
    { text: `${tally.routeToSecretariatCount} Route to Secretariat`, cls: '' },
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
    { text: `${tally.routeToSecretariatCount} Route to Secretariat`, cls: '' },
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

function renderCollateHint(controller) {
  const hint = document.getElementById('collate-hint');
  const tally = controller.leadershipTally();
  hint.textContent =
    `${tally.total} of ${tally.leadershipTotal} IRB leader(s) have reviewed this IPAF so far: ` +
    `${tally.approveCount} Approve, ${tally.returnCount} Return. ` +
    'Choose to approve it or return it for amendments now, or wait for the rest if you prefer.';
}

function renderUnderReviewActionHint(controller) {
  const hint = document.getElementById('under-review-action-hint');
  const tally = controller.voteTally();
  hint.textContent =
    `${tally.total} of ${tally.assignedTotal} assigned member(s) have reviewed this IPAF so far: ` +
    `${tally.approveCount} Approve, ${tally.returnCount} Return. ` +
    'You can route it on to the Co-Chairman and Chairman, or return it for amendments now — or wait for the rest.';
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
  renderActivityLog(record, role);
  renderCommentsPanel(controller);
  renderVotingSummary(controller);
  renderLeadershipSummary(controller);
  renderMemberCheckboxes('triage-member-checkboxes', record.assignedMembers);
  renderMemberCheckboxes('under-review-member-checkboxes', record.assignedMembers);
  renderMemberCheckboxes('collate-member-checkboxes', record.assignedMembers);

  const saveBtn = document.getElementById('btn-save');
  const submitBtn = document.getElementById('btn-submit');
  const submitToReviewersBtn = document.getElementById('btn-submit-to-reviewers');
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
  const voteRouteToSecretariatBtn = document.getElementById('btn-vote-route-to-secretariat');
  const collatePanel = document.getElementById('collate-panel');
  const collateComment = document.getElementById('collate-comment');
  const collateError = document.getElementById('collate-error');
  const collateRouteToMembersBtn = document.getElementById('btn-collate-route-to-members');
  const approveIpafBtn = document.getElementById('btn-approve-ipaf');
  const returnAmendmentsBtn = document.getElementById('btn-return-amendments');
  const piCommentPanel = document.getElementById('pi-comment-panel');
  const piCommentInput = document.getElementById('pi-comment');
  const acknowledgePanel = document.getElementById('acknowledge-panel');
  const acknowledgeBtn = document.getElementById('btn-acknowledge');
  const underReviewActionPanel = document.getElementById('under-review-action-panel');
  const underReviewActionCommentInput = document.getElementById('under-review-action-comment');
  const underReviewActionError = document.getElementById('under-review-action-error');
  const underReviewRouteToMembersBtn = document.getElementById('btn-under-review-route-to-members');
  const routeToLeadershipBtn = document.getElementById('btn-route-to-leadership');
  const returnAmendmentsEarlyBtn = document.getElementById('btn-return-amendments-early');
  const leadershipApprovalPanel = document.getElementById('leadership-approval-panel');
  const leadershipIdentityEl = document.getElementById('leadership-identity');
  const leadershipCommentInput = document.getElementById('leadership-comment');
  const leadershipError = document.getElementById('leadership-error');
  const leadershipVoteBtn = document.getElementById('btn-leadership-vote');
  const leadershipRouteToSecretariatBtn = document.getElementById('btn-leadership-route-to-secretariat');

  saveBtn.hidden = true;
  submitBtn.hidden = true;
  submitToReviewersBtn.hidden = true;
  approveBtn.hidden = true;
  triagePanel.hidden = true;
  voteFormPanel.hidden = true;
  collatePanel.hidden = true;
  piCommentPanel.hidden = true;
  acknowledgePanel.hidden = true;
  underReviewActionPanel.hidden = true;
  leadershipApprovalPanel.hidden = true;

  if (controller.isEditableByPi()) {
    saveBtn.hidden = false;
    submitBtn.hidden = false;
    if (record.status === 'for_revision') {
      showBanner('This IPAF was returned for amendments. See the comment in Activity below, then resubmit.', 'error');
      piCommentPanel.hidden = false;
      // routedTo at this point still holds whoever returned it -- a
      // specific IRB Member/Leadership member (the bypass path) or the
      // Secretariat itself. When it's a specific reviewer, the PI gets both
      // buttons -- send it straight back to that reviewer, or loop the
      // Secretariat in instead. When it was the Secretariat's own return,
      // there's no specific reviewer to choose, so only one button shows.
      const returningReviewer = record.routedTo;
      const isBypassReturn = isIrbMember(returningReviewer) || isIrbLeadership(returningReviewer);
      submitBtn.textContent = 'Submit to Secretariat';
      submitToReviewersBtn.hidden = !isBypassReturn;
    }
  } else if (controller.isPendingThisDirectorApproval()) {
    approveBtn.hidden = false;
    showBanner(
      'This IPAF is awaiting your approval as S/D Director before it can be routed to the IRB Secretariat.',
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
  } else if (controller.isPendingLeadershipApproval()) {
    leadershipApprovalPanel.hidden = false;
    leadershipIdentityEl.textContent = getRoleLabel(role);
    showBanner('Review the IPAF below, then cast your vote.', 'info');
  } else if (controller.isLeadershipWaitingOnOther()) {
    const otherName = getRoleLabel(IRB_LEADERSHIP_IDS.find((id) => id !== role));
    showBanner(`You've voted. Waiting on ${otherName}.`, 'info');
  } else if (controller.isAwaitingLeadershipApproval()) {
    const pending = IRB_LEADERSHIP_IDS.filter((id) => !controller.hasLeadershipVoted(id))
      .map((id) => getRoleLabel(id))
      .join(', ');
    showBanner(`Waiting on review from: ${pending}.`, 'info');
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
  } else if (record.status === 'pending_leadership_approval') {
    showBanner('Routed to the IRB Co-Chairman and Chairman for approval. Awaiting their decision.', 'info');
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
    goToDashboardWithMessage('Saved as draft. A reference number is assigned once this IPAF is submitted.', 'success');
  });

  function doSubmit(target) {
    const wasForRevision = record.status === 'for_revision';
    const result = controller.submit(wasForRevision ? piCommentInput.value : undefined, target);
    if (!result.ok) {
      const missing = describeMissingFields(result.errors, controller.fields);
      showBanner(`Please complete the following required field(s) before submitting: ${missing.join(', ')}.`, 'error');
      return;
    }
    goToDashboardWithMessage(
      wasForRevision
        ? 'Resubmitted. The reviewers have been notified.'
        : `Submitted. Reference number: ${record.data.refNumber}. Routed to the S/D Director for approval.`,
      'success'
    );
  }

  submitBtn.addEventListener('click', () => doSubmit('secretariat'));
  submitToReviewersBtn.addEventListener('click', () => doSubmit('reviewer'));

  approveBtn.addEventListener('click', () => {
    controller.directorApprove();
    goToDashboardWithMessage('Approved. Routed to the IRB Secretariat for triage.', 'success');
  });

  routeToMembersBtn.addEventListener('click', () => {
    const comment = triageComment.value;
    const result = controller.routeToMembersForReview(comment, getCheckedMemberIds('triage-member-checkboxes'));
    if (!result.ok) {
      triageError.textContent = result.error;
      return;
    }
    const names = record.assignedMembers.map((mid) => getRoleLabel(mid)).join(', ');
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
    goToDashboardWithMessage('Action recorded. Thank you.', 'success');
  });

  voteRouteToSecretariatBtn.addEventListener('click', () => {
    const result = controller.castVote('Route to Secretariat', voteCommentInput.value);
    if (!result.ok) {
      voteError.textContent = result.error;
      return;
    }
    goToDashboardWithMessage('Routed to the Secretariat. Thank you.', 'success');
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
    const names = record.assignedMembers.map((mid) => getRoleLabel(mid)).join(', ');
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
    goToDashboardWithMessage('Action recorded. Thank you.', 'success');
  });

  leadershipRouteToSecretariatBtn.addEventListener('click', () => {
    const result = controller.castLeadershipVote('Route to Secretariat', leadershipCommentInput.value);
    if (!result.ok) {
      leadershipError.textContent = result.error;
      return;
    }
    goToDashboardWithMessage('Routed to the Secretariat. Thank you.', 'success');
  });

  function handleCollateDecision(action) {
    const comment = collateComment.value;
    const result = action(comment);
    if (!result.ok) {
      collateError.textContent = result.error;
      return;
    }
    if (record.status === 'approved') {
      goToDashboardWithMessage('This IPAF is approved.', 'success');
    } else if (record.status === 'for_revision') {
      goToDashboardWithMessage('Sent back for revision. The PI has been notified.', 'success');
    } else if (record.status === 'under_review') {
      const names = record.assignedMembers.map((mid) => getRoleLabel(mid)).join(', ');
      goToDashboardWithMessage(`Routed to ${names} for review.`, 'success');
    } else {
      goToDashboardWithMessage('Decision recorded.', 'success');
    }
  }

  collateRouteToMembersBtn.addEventListener('click', () =>
    handleCollateDecision((c) => controller.routeToMembersFromCollate(c, getCheckedMemberIds('collate-member-checkboxes')))
  );
  approveIpafBtn.addEventListener('click', () => handleCollateDecision((c) => controller.approveIpaf(c)));
  returnAmendmentsBtn.addEventListener('click', () => handleCollateDecision((c) => controller.returnForAmendments(c)));

  acknowledgeBtn.addEventListener('click', () => {
    controller.acknowledge();
    goToDashboardWithMessage('Thank you for acknowledging your responsibilities as PI.', 'success');
  });

  closeBtn.addEventListener('click', () => {
    window.location.href = `irpf.html?id=${record.parentIrpfId}`;
  });

  mirrorActionRow(document.querySelector('.form-actions'), document.getElementById('top-actions'));
  [triagePanel, voteFormPanel, underReviewActionPanel, leadershipApprovalPanel, collatePanel, acknowledgePanel].forEach((panel) => {
    mirrorActionRow(panel, document.getElementById('top-actions'));
  });
}

document.addEventListener('DOMContentLoaded', initIpafPage);
