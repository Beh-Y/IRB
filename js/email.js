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
