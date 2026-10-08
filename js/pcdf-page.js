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
  if (!id) {
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
  // An id was given but doesn't match a saved record -- distinct from "no
  // id" above, which means a brand-new draft. Returning null here lets the
  // caller show "not found" instead of silently starting a blank draft
  // (links from emails make this more likely: opened on a different
  // device/browser than the one that created the record, or after it's
  // been deleted).
  return getSubmission(id) || null;
}

function showBanner(message, type) {
  const banner = document.getElementById('status-banner');
  banner.textContent = message;
  banner.className = `status-banner status-banner--${type}`;
  banner.hidden = false;
}

// The PI, S/D Director, and POC never see the review process itself --
// only their own actions (submit, acknowledge) plus one milestone
// triggered by someone else: the S/D Director's approval (which is also
// the final outcome for a PCDF -- there's no Secretariat or IRB Member
// review stage). That other-triggered milestone shows up in the log (see
// renderActivityLog below), but with its note text hidden unless they
// were the one who triggered it -- they get the "what happened," not the
// internal detail behind it.
const PCDF_LIMITED_VISIBILITY_ROLES = ['pi', 'sd-director', 'poc'];
const PCDF_LIMITED_VISIBILITY_ACTIONS = ['submit', 'director_approve', 'resubmit', 'acknowledged'];

// The Director's return comment -- and the PI's own response to it on
// resubmission -- live in the top-of-page Comments panel (see
// renderCommentsPanel below) instead of the Activity Log, same split as
// IRPF/IPAF's Reviewer Feedback panel.
const PCDF_COMMENT_ACTIONS = ['returned_for_amendments', 'resubmit'];

function renderActivityLog(record, role) {
  const container = document.getElementById('activity-log');
  const list = document.getElementById('activity-log-list');
  list.innerHTML = '';

  const limitedVisibility = PCDF_LIMITED_VISIBILITY_ROLES.includes(role);
  const entries = limitedVisibility
    ? (record.history || []).filter((h) => PCDF_LIMITED_VISIBILITY_ACTIONS.includes(h.action))
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
  // PCDF has no IRB Member/Secretariat/Leadership actions of its own, but
  // this stays consistent with the IRPF/IPAF activity logs regardless.
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
    // actions -- an entry someone else triggered (the Director's approval)
    // shows just the milestone and when it happened, not the detail
    // behind it.
    const showNote = !limitedVisibility || entry.actor === role;
    if (entry.note && showNote) {
      const note = document.createElement('div');
      note.className = 'activity-note';
      // blindedNote, when a history entry carries one, is a purpose-written
      // stand-in for a note that can't be cleanly scrubbed word-by-word --
      // e.g. "routed back to IRB Member 1, IRB Member 2" would otherwise
      // scrub to the awkward, repetitive "an IRB Member, an IRB Member".
      note.textContent = blindIdentity ? entry.blindedNote || scrubStaffIdentities(entry.note) : entry.note;
      li.appendChild(note);
    }

    list.appendChild(li);
  });
}

/* Top-of-page panel showing the Director's return comment and the PI's own
 * response to it, above the form -- same split as IRPF/IPAF's Reviewer
 * Feedback panel (see renderCommentsPanel there). The PI sees a blinded
 * "Reviewer Feedback" version (no identity, just each comment labeled
 * Feedback/Response); the System Admin, who can see everything, gets the
 * identified "Comments" version. The S/D Director has nothing to see here
 * -- they're the one who left the comment, and once returned they have no
 * further action on this record -- so the panel stays hidden for them. */
function renderCommentsPanel(controller) {
  const container = document.getElementById('comments-panel');
  const heading = document.getElementById('comments-panel-heading');
  const list = document.getElementById('comments-panel-list');

  const role = controller.currentRole;
  const isStaffReviewer = role === 'system-admin';
  if (!isStaffReviewer && role !== 'pi') {
    container.hidden = true;
    return;
  }

  if (role === 'pi') {
    heading.textContent = 'Reviewer Feedback';
    const entries = (controller.record.history || [])
      .filter((h) => PCDF_COMMENT_ACTIONS.includes(h.action) && h.comment && h.comment.trim())
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    const hasComments = renderBlindedReviewComments(list, entries);
    container.hidden = !hasComments;
    return;
  }

  heading.textContent = 'Comments';
  const entries = (controller.record.history || [])
    .filter((h) => PCDF_COMMENT_ACTIONS.includes(h.action))
    .map((h) => ({ identity: getRoleLabel(h.actor), decision: h.decision, comment: h.comment, timestamp: h.timestamp }));
  const hasComments = renderIdentifiedReviewComments(list, entries);
  container.hidden = !hasComments;
}

function initPcdfPage() {
  renderHeader('pcdf');

  const role = getCurrentRole();
  const record = loadOrCreateRecord();
  if (!record) {
    document.querySelector('main.page').innerHTML =
      '<div class="status-banner status-banner--error">This PCDF could not be found.</div>';
    return;
  }
  const controller = new PcdfFormController(record, role);

  const statusBadge = document.getElementById('pcdf-status-badge');
  statusBadge.textContent = getStatusLabel(record.status, 'PCDF');
  statusBadge.className = `status-badge ${getStatusBadgeClass(record.status)}`;
  renderPipelineStepper(document.getElementById('pipeline-stepper'), record, role);
  controller.mount(document.getElementById('pcdf-form-container'));
  renderActivityLog(record, role);
  renderCommentsPanel(controller);

  const saveBtn = document.getElementById('btn-save');
  const submitBtn = document.getElementById('btn-submit');
  const closeBtn = document.getElementById('btn-close');
  const acknowledgePanel = document.getElementById('acknowledge-panel');
  const acknowledgeBtn = document.getElementById('btn-acknowledge');
  const sendReminderBtn = document.getElementById('btn-send-reminder');
  const directorReviewPanel = document.getElementById('director-review-panel');
  const directorComment = document.getElementById('director-comment');
  const directorReviewError = document.getElementById('director-review-error');
  const approveBtn = document.getElementById('btn-approve');
  const returnAmendmentsBtn = document.getElementById('btn-return-amendments');
  const piCommentPanel = document.getElementById('pi-comment-panel');
  const piCommentInput = document.getElementById('pi-comment');
  const piCommentError = document.getElementById('pi-comment-error');

  saveBtn.hidden = true;
  submitBtn.hidden = true;
  sendReminderBtn.hidden = true;
  acknowledgePanel.hidden = true;
  directorReviewPanel.hidden = true;
  piCommentPanel.hidden = true;

  if (controller.isEditableByPi()) {
    saveBtn.hidden = false;
    submitBtn.hidden = false;
    if (record.status === 'for_revision') {
      showBanner('This PCDF was returned for amendments. See the Reviewer Feedback above, then resubmit.', 'error');
      piCommentPanel.hidden = false;
    }
  } else if (controller.isPendingThisDirectorApproval()) {
    directorReviewPanel.hidden = false;
    showBanner('This PCDF is awaiting your approval as S/D Director.', 'info');
  } else if (controller.isPendingAcknowledgement()) {
    acknowledgePanel.hidden = false;
    showBanner('This PCDF is approved. Please acknowledge below.', 'success');
  } else if (record.status === 'pending_director_approval') {
    showBanner('Awaiting S/D Director approval.', 'info');
  } else if (record.status === 'for_revision') {
    showBanner('Returned for amendments. Awaiting the PI to address the comment and resubmit.', 'info');
  } else if (record.status === 'approved') {
    showBanner(
      record.acknowledged ? 'This PCDF is approved and has been acknowledged by the PI.' : 'This PCDF is approved.',
      'success'
    );
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

  saveBtn.addEventListener('click', () => {
    controller.save();
    goToDashboardWithMessage('Saved as draft. A reference number is assigned once this PCDF is submitted.', 'success');
  });

  submitBtn.addEventListener('click', () => {
    // Validation errors show in the status banner at the top of the page,
    // but a long form (like the PCDF) can easily have the user scrolled
    // well past it when they click Submit -- jump back to the top so the
    // banner (or, on success, the redirect) is actually seen either way.
    window.scrollTo(0, 0);
    const wasForRevision = record.status === 'for_revision';
    piCommentError.textContent = '';
    if (wasForRevision && !piCommentInput.value.trim()) {
      piCommentError.textContent = 'A comment is required before resubmitting.';
      return;
    }
    const result = controller.submit(wasForRevision ? piCommentInput.value : undefined);
    if (!result.ok) {
      const missing = describeMissingFields(result.errors, controller.fields);
      showBanner(`Please complete the following required field(s) before submitting: ${missing.join(', ')}.`, 'error');
      return;
    }
    goToDashboardWithMessage(
      wasForRevision
        ? 'Resubmitted. The S/D Director has been notified.'
        : `Submitted. Reference number: ${record.data.refNumber}. Routed to the S/D Director for approval.`,
      'success'
    );
  });

  approveBtn.addEventListener('click', () => {
    controller.directorApprove();
    goToDashboardWithMessage('Approved.', 'success');
  });

  returnAmendmentsBtn.addEventListener('click', () => {
    const result = controller.returnForAmendments(directorComment.value);
    if (!result.ok) {
      directorReviewError.textContent = result.error;
      return;
    }
    goToDashboardWithMessage('Sent back for revision. The PI has been notified.', 'success');
  });

  acknowledgeBtn.addEventListener('click', () => {
    controller.acknowledge();
    goToDashboardWithMessage('Thank you for acknowledging.', 'success');
  });

  closeBtn.addEventListener('click', () => {
    window.location.href = 'index.html';
  });

  // acknowledgePanel is deliberately not mirrored to the top bar, unlike
  // every other page's contextual panels -- its Acknowledge button stays
  // put next to the reminder text it belongs to, so the sticky top bar
  // shows just Close on the acknowledgement page.
  mirrorActionRow(document.querySelector('.form-actions'), document.getElementById('top-actions'));
  // piCommentPanel has no .triage-actions row of its own -- the PI's
  // actual resubmit button is the shared Submit button above, already
  // mirrored.
  mirrorActionRow(directorReviewPanel, document.getElementById('top-actions'));
}

document.addEventListener('DOMContentLoaded', initPcdfPage);
