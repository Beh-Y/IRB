/* Simulated instant per-action email notifications. This app has no
 * backend (it's static HTML/JS with localStorage as its only persistence),
 * so it can't actually deliver email -- sending real mail needs a server
 * component (to call a transactional email API without exposing its key in
 * the browser) plus real per-user addresses, neither of which exist here
 * yet. This is a stand-in: every action that would normally notify someone
 * queues a realistic {to, subject, body} entry into a local "Outbox"
 * (irb_email_outbox in localStorage, viewable on outbox.html), fired from
 * the exact same instant the real send would happen. It's meant as a
 * working spec for wiring up real delivery later -- swap queueEmail's body
 * for an API call once there's a backend and real addresses to send to. */

const EMAIL_OUTBOX_STORAGE_KEY = 'irb_email_outbox';

function getEmailOutbox() {
  return readJSON(EMAIL_OUTBOX_STORAGE_KEY, []);
}

function queueEmail(toRoleId, subject, body, meta) {
  if (!toRoleId) return;
  const outbox = getEmailOutbox();
  outbox.push({
    id: `email_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    toRoleId,
    to: getRoleEmail(toRoleId),
    toLabel: getRoleLabel(toRoleId),
    subject,
    body,
    timestamp: new Date().toISOString(),
    ...meta,
  });
  writeJSON(EMAIL_OUTBOX_STORAGE_KEY, outbox);
}

function clearEmailOutbox() {
  writeJSON(EMAIL_OUTBOX_STORAGE_KEY, []);
}

/* Decides who gets notified for a given history entry, and queues it.
 * Called once from saveSubmission() right after every state change, so
 * every action that changes a record's status fires its email from the
 * same single place -- one list to extend rather than a call bolted onto
 * each of the ~15 controller methods that call saveSubmission(). */
function notifyByEmail(record, historyEntry) {
  if (!historyEntry) return;

  const formLabel = record.formType;
  const ref = record.data.refNumber || record.data.projectTitle || `this ${formLabel}`;
  const send = (toRoleId, subject, body) => queueEmail(toRoleId, subject, body, { recordId: record.id, formType: record.formType, action: historyEntry.action });

  switch (historyEntry.action) {
    case 'submit':
      send('sd-director', `${formLabel} ${ref}: awaiting your approval`, `A ${formLabel} (${ref}) has been submitted and needs your approval as S/D Director.`);
      break;

    case 'director_approve':
      if (record.formType === 'PCDF') {
        send('pi', `PCDF ${ref}: approved`, `Your PCDF (${ref}) has been approved by the S/D Director.`);
      } else {
        send(record.routedTo, `${formLabel} ${ref}: awaiting Secretariat triage`, `A ${formLabel} (${ref}) has been approved by the S/D Director and routed to your team for triage.`);
      }
      break;

    case 'routed_to_members':
      (record.assignedMembers || []).forEach((memberId) =>
        send(memberId, `${formLabel} ${ref}: awaiting your review`, `A ${formLabel} (${ref}) has been routed to you for review.`)
      );
      break;

    case 'routed_to_leadership':
      // Whoever's approval was just cleared is exactly who this routed to
      // (see routeToLeadershipApproval in irpf-form.js/ipaf-form.js) --
      // the other leader, if any, keeps their standing decision and isn't
      // notified again.
      IRB_LEADERSHIP_IDS.filter((leaderId) => !(record.leadershipApprovals || []).some((a) => a.approverId === leaderId)).forEach(
        (leaderId) => send(leaderId, `${formLabel} ${ref}: awaiting your approval`, `A ${formLabel} (${ref}) has been routed to you for approval.`)
      );
      break;

    case 'member_vote':
    case 'leadership_vote':
      if (historyEntry.decision === 'Return') {
        send('pi', `${formLabel} ${ref}: returned for amendments`, `Your ${formLabel} (${ref}) has been returned for amendments. Please see the comments and resubmit.`);
      } else if (isSecretariat(record.routedTo)) {
        send(record.routedTo, `${formLabel} ${ref}: a review has come in`, `A review has been recorded for ${formLabel} (${ref}). It's ready for your action.`);
      }
      break;

    case 'returned_for_amendments':
      send('pi', `${formLabel} ${ref}: returned for amendments`, `Your ${formLabel} (${ref}) has been returned for amendments. Please see the comments and resubmit.`);
      break;

    case 'resubmit':
      if (isIrbMember(record.routedTo) || isIrbLeadership(record.routedTo)) {
        send(record.routedTo, `${formLabel} ${ref}: PI has responded`, `The PI has resubmitted ${formLabel} (${ref}) in response to your comments.`);
      } else if (isSecretariat(record.routedTo)) {
        send(record.routedTo, `${formLabel} ${ref}: PI has resubmitted`, `The PI has resubmitted ${formLabel} (${ref}). It's ready for your action.`);
      }
      break;

    case 'approved_for_exemption':
    case 'approved':
      send('pi', `${formLabel} ${ref}: approved`, `Your ${formLabel} (${ref}) has been approved. Please review and acknowledge your responsibilities as PI.`);
      break;

    case 'to_create_ipaf':
      send('pi', `IRPF ${ref}: full IPAF submission required`, `Your IRPF (${ref}) requires a full IPAF submission, following review by the IRB Member panel. Please create and submit the IPAF.`);
      break;

    default:
      break;
  }
}

/* Who currently holds the ball on a record, independent of any particular
 * action -- used to let the Secretariat manually nudge whoever that is
 * (see sendManualReminder below), rather than waiting for the next state
 * change to fire notifyByEmail(). Mirrors the same status/routedTo/votes/
 * leadershipApprovals fields the controllers' own isPending... / isAwaiting...
 * predicates read, simplified to "who's actionable right now" without
 * needing a role to test against. */
function getCurrentHolders(record) {
  const status = record.status;
  const votes = record.votes || [];
  const leadershipApprovals = record.leadershipApprovals || [];
  const assignedMembers = record.assignedMembers || [];

  switch (status) {
    case 'pending_director_approval':
      return ['sd-director'];

    case 'pending_review':
      return record.routedTo ? [record.routedTo] : [];

    case 'for_revision':
      return ['pi'];

    case 'under_review': {
      const pendingMembers = assignedMembers.filter((memberId) => !votes.some((v) => v.voterId === memberId));
      if (pendingMembers.length > 0) return pendingMembers;
      return record.routedTo ? [record.routedTo] : [];
    }

    case 'pending_leadership_approval': {
      const pendingLeaders = IRB_LEADERSHIP_IDS.filter(
        (leaderId) => !leadershipApprovals.some((a) => a.approverId === leaderId)
      );
      if (pendingLeaders.length > 0) return pendingLeaders;
      return record.routedTo ? [record.routedTo] : [];
    }

    case 'approved':
      return record.acknowledged ? [] : ['pi'];

    case 'to_create_ipaf':
      // Once the child IPAF exists, the parent IRPF itself is done -- there's
      // no acknowledgement step of its own (that happens on the IPAF), so
      // there's no one left to remind about this record specifically.
      return record.childIpafId ? [] : ['pi'];

    default:
      return [];
  }
}

/* Manually queues a "Reminder:" email to whoever currently holds the
 * record, on demand -- the Secretariat's counterpart to the automatic,
 * action-triggered emails above. Excludes the requester themselves (no
 * point reminding yourself; if you're the holder, the page already shows
 * you the panel to act on it directly) and doesn't touch record.history --
 * it's a nudge, not a workflow action. Returns the role ids it sent to. */
function sendManualReminder(record, requestingRoleId) {
  const holders = getCurrentHolders(record).filter((roleId) => roleId !== requestingRoleId);
  if (holders.length === 0) return holders;

  const formLabel = record.formType;
  const ref = record.data.refNumber || record.data.projectTitle || `this ${formLabel}`;

  holders.forEach((roleId) =>
    queueEmail(
      roleId,
      `Reminder: ${formLabel} ${ref} needs your action`,
      `This is a reminder from the IRB Secretariat that ${formLabel} (${ref}) is awaiting your action.`,
      { recordId: record.id, formType: record.formType, action: 'manual_reminder', sentBy: requestingRoleId }
    )
  );

  // Also fires one real EmailJS test notification (see js/email-notify.js),
  // same as the automatic Submit/Route/Return triggers -- guarded since
  // this can be called from a page (e.g. submissions.html's "Remind" link)
  // that doesn't load email-notify.js. Unlike currentFormLink in the
  // *-page.js files (which is already sitting on the record's own page),
  // this builds the link from scratch -- the current page here could just
  // as easily be the submissions list -- by swapping out the current
  // filename for the record's own form page.
  if (typeof sendEmailNotification === 'function') {
    const dir = window.location.pathname.replace(/[^/]*$/, '');
    sendEmailNotification({
      subject: `Reminder: ${formLabel} ${ref} needs your action`,
      message: `Manual reminder from the IRB Secretariat -- ${formLabel} (${ref}) is awaiting your action.`,
      formType: formLabel,
      refNumber: record.data.refNumber,
      formLink: `${window.location.origin}${dir}${formLabel.toLowerCase()}.html?id=${record.id}`,
    });
  }

  return holders;
}
