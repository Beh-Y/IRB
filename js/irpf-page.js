/* Wires the IRPF document generation script into irpf.html: loads/creates the
 * record, mounts the form, and exposes the role-appropriate actions. Every
 * action that changes the record's status or state redirects to the
 * dashboard on success (with a flash banner there); only a failed action
 * (validation, a missing comment) keeps the user on this page so they can
 * fix it. */

function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

/* Flash message for a "routed to Leadership" action -- names whichever
 * leader(s) were actually selected, since routing to just the Chairman (or
 * just the Co-Chairman) is a real, independent choice now, not shorthand
 * for "both". */
function describeLeadershipRouting(leaderIds) {
  return `Routed to ${leaderIds.map((id) => getRoleLabel(id)).join(' and ')} for approval.`;
}

function loadOrCreateRecord() {
  const id = getQueryParam('id');
  if (!id) {
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
  // An id was given but doesn't match a saved record -- distinct from "no
  // id" above, which means a brand-new draft. Returning null here lets the
  // caller show "not found" instead of silently starting a blank draft
  // (links from emails make this more likely: opened on a different
  // device/browser than the one that created the record, or after it's
  // been deleted).
  return getSubmission(id) || null;
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

function getCheckedMemberIds(containerId) {
  return Array.from(document.querySelectorAll(`#${containerId} input:checked`)).map((el) => el.value);
}

/* Unified "Route to" checkbox list -- IRB Members and the Co-Chairman/
 * Chairman together, single Route button, replacing what used to be two
 * separate actions ("Route to IRB Members" / "Route to Co-Chairman &
 * Chairman"). The two groups stay mutually exclusive -- checking one
 * disables the other, since a record can only be in one review stage at a
 * time -- rather than letting an invalid mixed selection reach the click
 * handler at all. Leadership has no per-record "assigned" set the way
 * Members do (routing there always means both), so only member ids are
 * ever pre-checked. */
function renderRouteCheckboxes(containerId, selectedMemberIds) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  [...IRB_MEMBER_IDS, ...IRB_LEADERSHIP_IDS].forEach((id) => {
    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = id;
    checkbox.checked = (selectedMemberIds || []).includes(id);
    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(getRoleLabel(id)));
    container.appendChild(label);
  });

  const checkboxes = Array.from(container.querySelectorAll('input[type="checkbox"]'));
  const enforceExclusivity = () => {
    const memberChecked = checkboxes.some((cb) => IRB_MEMBER_IDS.includes(cb.value) && cb.checked);
    const leadershipChecked = checkboxes.some((cb) => IRB_LEADERSHIP_IDS.includes(cb.value) && cb.checked);
    checkboxes.forEach((cb) => {
      cb.disabled = IRB_MEMBER_IDS.includes(cb.value) ? leadershipChecked && !cb.checked : memberChecked && !cb.checked;
    });
  };
  checkboxes.forEach((cb) => cb.addEventListener('change', enforceExclusivity));
  enforceExclusivity();
}

function showBanner(message, type) {
  const banner = document.getElementById('status-banner');
  banner.textContent = message;
  banner.className = `status-banner status-banner--${type}`;
  banner.hidden = false;
}

// The PI, S/D Director, and POC never see the review process itself
// (routing, votes, returns) -- only the handful of milestones below, and
// even those show up with their note text hidden unless they were the one
// who triggered it -- they get the "what happened," not the internal
// detail behind it. Everyone else (Secretariat, IRB Members, IRB
// Leadership, System Admin) sees the full log.
const IRPF_LIMITED_VISIBILITY_ROLES = ['pi', 'sd-director', 'poc'];
const IRPF_LIMITED_VISIBILITY_ACTIONS = [
  'submit',
  'resubmit',
  'director_approve',
  'approved_for_exemption',
  'to_create_ipaf',
  'acknowledged',
];

function renderActivityLog(record, role) {
  const container = document.getElementById('activity-log');
  const list = document.getElementById('activity-log-list');
  list.innerHTML = '';

  const limitedVisibility = IRPF_LIMITED_VISIBILITY_ROLES.includes(role);
  const entries = limitedVisibility
    ? (record.history || []).filter((h) => IRPF_LIMITED_VISIBILITY_ACTIONS.includes(h.action))
    : record.history || [];

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
  // Same roles as above stay blind to exactly which IRB Member, Secretariat
  // team, or Leadership member acted -- same as the Reviewer Feedback panel
  // -- so their identity is generalized wherever it'd otherwise show here.
  const blindIdentity = limitedVisibility;

  entries.forEach((entry) => {
    const li = document.createElement('li');

    const meta = document.createElement('div');
    meta.className = 'activity-meta';
    const when = entry.timestamp ? new Date(entry.timestamp).toLocaleString() : '';
    const actorLabel = blindIdentity ? blindedRoleLabel(entry.actor) : getRoleLabel(entry.actor);
    meta.textContent = `${when} — ${actorLabel} — ${entry.action.replace(/_/g, ' ')}`;
    li.appendChild(meta);

    // A limited-visibility viewer sees the note text only for their own
    // actions -- an entry someone else triggered (Director approval, the
    // final decision) shows just the milestone and when it happened, not
    // the detail behind it.
    const showNote = !limitedVisibility || entry.actor === role;
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
 * the permanent history log (see STAFF_COMMENT_ACTIONS above) so it survives re-triage
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
    { text: `${tally.total} of ${tally.assignedTotal} assigned member(s) reviewed`, cls: '' },
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

function describeFinalOutcome(record) {
  if (record.status === 'to_create_ipaf') {
    return 'This IRPF requires a full IPAF submission next, following full IRB Member review.';
  }
  if (record.reviewOutcome === 'exemption') {
    return record.acknowledged
      ? 'This IRPF was approved for exemption and has been acknowledged by the PI. No IPAF submission is required.'
      : 'This IRPF was approved for exemption. No IPAF submission is required.';
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
  if (!record) {
    document.querySelector('main.page').innerHTML =
      '<div class="status-banner status-banner--error">This IRPF could not be found.</div>';
    return;
  }
  const controller = new IrpfFormController(record, role);

  const statusBadge = document.getElementById('irpf-status-badge');
  statusBadge.textContent = getStatusLabel(record.status);
  statusBadge.className = `status-badge ${getStatusBadgeClass(record.status)}`;
  renderPipelineStepper(document.getElementById('pipeline-stepper'), record, role);
  controller.mount(document.getElementById('irpf-form-container'));
  renderActivityLog(record, role);
  renderCommentsPanel(controller);
  renderVotingSummary(controller);
  renderLeadershipSummary(controller);
  renderRouteCheckboxes('triage-route-checkboxes', record.assignedMembers);
  renderRouteCheckboxes('under-review-route-checkboxes', record.assignedMembers);
  renderRouteCheckboxes('collate-route-checkboxes', record.assignedMembers);

  const saveBtn = document.getElementById('btn-save');
  const submitBtn = document.getElementById('btn-submit');
  const submitToReviewersBtn = document.getElementById('btn-submit-to-reviewers');
  const approveBtn = document.getElementById('btn-approve');
  const sendReminderBtn = document.getElementById('btn-send-reminder');
  const closeBtn = document.getElementById('btn-close');
  const triagePanel = document.getElementById('triage-panel');
  const triageComment = document.getElementById('triage-comment');
  const triageError = document.getElementById('triage-error');
  const triageRouteBtn = document.getElementById('btn-triage-route');
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
  const approveExemptionBtn = document.getElementById('btn-approve-exemption');
  const returnAmendmentsBtn = document.getElementById('btn-return-amendments');
  const createIpafBtn = document.getElementById('btn-create-ipaf');
  const piCommentPanel = document.getElementById('pi-comment-panel');
  const piCommentInput = document.getElementById('pi-comment');
  const piCommentError = document.getElementById('pi-comment-error');
  const acknowledgePanel = document.getElementById('acknowledge-panel');
  const acknowledgeBtn = document.getElementById('btn-acknowledge');
  const underReviewActionPanel = document.getElementById('under-review-action-panel');
  const underReviewActionCommentInput = document.getElementById('under-review-action-comment');
  const underReviewActionError = document.getElementById('under-review-action-error');
  const underReviewRouteBtn = document.getElementById('btn-under-review-route');
  const returnAmendmentsEarlyBtn = document.getElementById('btn-return-amendments-early');
  const collateRouteBtn = document.getElementById('btn-collate-route');
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
  sendReminderBtn.hidden = true;
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
      showBanner('This IRPF was returned for amendments. See the comment in Activity below, then resubmit.', 'error');
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
    showBanner('Review the IRPF below, then submit your review.', 'info');
  } else if (controller.isUnassignedMemberViewingUnderReview()) {
    showBanner('This IRPF is under review but was not routed to you.', 'muted');
  } else if (controller.isPendingLeadershipApproval()) {
    leadershipApprovalPanel.hidden = false;
    leadershipIdentityEl.textContent = getRoleLabel(role);
    showBanner('Review the IRPF below, then submit your review.', 'info');
  } else if (controller.isLeadershipWaitingOnOther()) {
    const otherName = getRoleLabel(IRB_LEADERSHIP_IDS.find((id) => id !== role));
    showBanner(`You've submitted your review. Waiting on ${otherName}.`, 'info');
  } else if (controller.isAwaitingLeadershipApproval()) {
    const pending = IRB_LEADERSHIP_IDS.filter((id) => !controller.hasLeadershipVoted(id))
      .map((id) => getRoleLabel(id))
      .join(', ');
    showBanner(`Waiting on review from: ${pending}.`, 'info');
  } else if (controller.isPendingAcknowledgement()) {
    acknowledgePanel.hidden = false;
    showBanner('This IRPF is approved for exemption. Please acknowledge your responsibilities as PI below.', 'success');
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

  // Lets the Secretariat manually nudge whoever currently holds the ball
  // (see getCurrentHolders in email.js) independent of whichever action
  // panel is showing above -- hidden whenever that's the viewer themselves
  // (they'd act directly, not remind themselves) or there's no one to nudge.
  if (isSecretariat(role) && getCurrentHolders(record).filter((id) => id !== role).length > 0) {
    sendReminderBtn.hidden = false;
  }

  sendReminderBtn.addEventListener('click', () => {
    const sentTo = sendManualReminder(record, role);
    showBanner(`Reminder sent to: ${sentTo.map((id) => getRoleLabel(id)).join(', ')}.`, 'success');
  });

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

  function doSubmit(target) {
    // Validation errors show in the status banner at the top of the page,
    // but a long form (like the IRPF) can easily have the user scrolled
    // well past it when they click Submit -- jump back to the top so the
    // banner (or, on success, the redirect) is actually seen either way.
    window.scrollTo(0, 0);
    const wasForRevision = record.status === 'for_revision';
    piCommentError.textContent = '';
    // Whichever reviewer picks this back up -- the Secretariat, or the
    // specific reviewer who returned it -- needs to know what changed;
    // required on both paths rather than left as an afterthought.
    if (wasForRevision && !piCommentInput.value.trim()) {
      piCommentError.textContent = 'A comment is required before resubmitting.';
      return;
    }
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

  triageRouteBtn.addEventListener('click', () => {
    const checked = getCheckedMemberIds('triage-route-checkboxes');
    const memberIds = checked.filter((id) => IRB_MEMBER_IDS.includes(id));
    const leaderIds = checked.filter((id) => IRB_LEADERSHIP_IDS.includes(id));

    if (memberIds.length === 0 && leaderIds.length === 0) {
      triageError.textContent = 'Select at least one IRB Member, or the Co-Chairman/Chairman, to route this IRPF to.';
      return;
    }

    if (leaderIds.length > 0) {
      controller.routeToLeadershipApproval(triageComment.value, leaderIds);
      goToDashboardWithMessage(describeLeadershipRouting(leaderIds), 'success');
      return;
    }

    const result = controller.routeToMembersForReview(triageComment.value, memberIds);
    if (!result.ok) {
      triageError.textContent = result.error;
      return;
    }
    const names = record.assignedMembers.map((id) => getRoleLabel(id)).join(', ');
    goToDashboardWithMessage(`Routed to ${names} for review.`, 'success');
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
    const decision = decisionEl ? decisionEl.value : null;
    const result = controller.castVote(decision, voteCommentInput.value);
    if (!result.ok) {
      voteError.textContent = result.error;
      return;
    }
    if (decision === 'Return') {
      goToDashboardWithMessage('Action recorded. Thank you.', 'success');
    } else if (record.status === 'pending_leadership_approval' && isIrbLeadership(record.routedTo)) {
      // This vote completed the member panel with every assigned member
      // approving, auto-routing straight to Leadership (see castVote's
      // auto-route in irpf-form.js).
      goToDashboardWithMessage(
        `All members approved. ${describeLeadershipRouting(IRB_LEADERSHIP_IDS)}`,
        'success'
      );
    } else {
      goToDashboardWithMessage('Action recorded. Thank you.', 'success');
    }
  });

  voteRouteToSecretariatBtn.addEventListener('click', () => {
    const result = controller.castVote('Route to Secretariat', voteCommentInput.value);
    if (!result.ok) {
      voteError.textContent = result.error;
      return;
    }
    goToDashboardWithMessage('Routed to the Secretariat. Thank you.', 'success');
  });

  underReviewRouteBtn.addEventListener('click', () => {
    const checked = getCheckedMemberIds('under-review-route-checkboxes');
    const memberIds = checked.filter((id) => IRB_MEMBER_IDS.includes(id));
    const leaderIds = checked.filter((id) => IRB_LEADERSHIP_IDS.includes(id));

    if (memberIds.length === 0 && leaderIds.length === 0) {
      underReviewActionError.textContent = 'Select at least one IRB Member, or the Co-Chairman/Chairman, to route this IRPF to.';
      return;
    }

    if (leaderIds.length > 0) {
      controller.routeToLeadershipApproval(underReviewActionCommentInput.value, leaderIds);
      goToDashboardWithMessage(describeLeadershipRouting(leaderIds), 'success');
      return;
    }

    const result = controller.routeToMembersFromUnderReview(underReviewActionCommentInput.value, memberIds);
    if (!result.ok) {
      underReviewActionError.textContent = result.error;
      return;
    }
    const names = record.assignedMembers.map((id) => getRoleLabel(id)).join(', ');
    goToDashboardWithMessage(`Routed to ${names} for review.`, 'success');
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
    const decision = decisionEl ? decisionEl.value : null;
    const result = controller.castLeadershipVote(decision, leadershipCommentInput.value);
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

  collateRouteBtn.addEventListener('click', () => {
    const checked = getCheckedMemberIds('collate-route-checkboxes');
    const memberIds = checked.filter((id) => IRB_MEMBER_IDS.includes(id));
    const leaderIds = checked.filter((id) => IRB_LEADERSHIP_IDS.includes(id));

    if (memberIds.length === 0 && leaderIds.length === 0) {
      collateError.textContent = 'Select at least one IRB Member, or the Co-Chairman/Chairman, to route this IRPF to.';
      return;
    }

    if (leaderIds.length > 0) {
      controller.routeToLeadershipApproval(collateComment.value, leaderIds);
      goToDashboardWithMessage(describeLeadershipRouting(leaderIds), 'success');
      return;
    }

    handleCollateDecision((c) => controller.routeToMembersFromCollate(c, memberIds));
  });
  approveExemptionBtn.addEventListener('click', () => handleCollateDecision((c) => controller.approveForExemption(c)));
  returnAmendmentsBtn.addEventListener('click', () => handleCollateDecision((c) => controller.returnForAmendments(c)));
  createIpafBtn.addEventListener('click', () => handleCollateDecision((c) => controller.decideToCreateIpaf(c)));

  acknowledgeBtn.addEventListener('click', () => {
    controller.acknowledge();
    goToDashboardWithMessage('Thank you for acknowledging your responsibilities as PI.', 'success');
  });

  closeBtn.addEventListener('click', () => {
    window.location.href = 'index.html';
  });

  mirrorActionRow(document.querySelector('.form-actions'), document.getElementById('top-actions'));
  // acknowledgePanel is deliberately excluded here: unlike the other
  // contextual panels, its Acknowledge/View Guidelines buttons stay put
  // next to the reminder text they belong to, right above the Comments
  // panel, instead of relocating to the sticky top bar -- which then shows
  // just Close on the acknowledgement page.
  [
    triagePanel,
    voteFormPanel,
    underReviewActionPanel,
    leadershipApprovalPanel,
    collatePanel,
    ipafLinkPanel,
  ].forEach((panel) => {
    mirrorActionRow(panel, document.getElementById('top-actions'));
  });
}

document.addEventListener('DOMContentLoaded', initIrpfPage);
