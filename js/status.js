/* Shared status labels/badges across the dashboard and form pages. IRPF and
 * IPAF reuse the same underlying status strings (draft/pending_review/
 * under_review/for_revision/approved) since they mean the same workflow
 * stage in both -- but a couple of labels read differently per form (e.g.
 * IRPF's 'approved' means "Approved for Exemption", IPAF's just "Approved"),
 * so pass formType to pick up that form's override where one exists. */

const STATUS_LABELS = {
  draft: 'Draft',
  pending_director_approval: 'Draft – Pending Director Approval',
  pending_review: 'Pending Review',
  for_revision: 'For Revision',
  under_review: 'Under Review',
  pending_leadership_approval: 'Pending Chairman Approval',
  approved: 'Approved for Exemption',
  to_create_ipaf: 'To Create IPAF',
};

const STATUS_LABEL_OVERRIDES_BY_FORM_TYPE = {
  IPAF: { approved: 'Approved' },
  PCDF: { approved: 'Approved' },
};

function getStatusLabel(status, formType) {
  const override = STATUS_LABEL_OVERRIDES_BY_FORM_TYPE[formType];
  if (override && override[status]) return override[status];
  return STATUS_LABELS[status] || status;
}

/* Color-codes a status badge by pipeline stage, independent of form type
 * or label text -- draft (gray) -> pending on one specific person (amber)
 * -> active member review (blue) -> active leadership review (purple) ->
 * bounced back (red) or done (green), plus IRPF's one-off "needs a follow-
 * up form" outcome (teal). Returns the modifier class alone (e.g.
 * 'status-badge--warning'); combine with the base 'status-badge' class. */
const STATUS_BADGE_CLASSES = {
  draft: 'status-badge',
  pending_director_approval: 'status-badge--warning',
  pending_review: 'status-badge--warning',
  under_review: 'status-badge--info',
  pending_leadership_approval: 'status-badge--leadership',
  for_revision: 'status-badge--error',
  approved: 'status-badge--success',
  to_create_ipaf: 'status-badge--teal',
};

function getStatusBadgeClass(status) {
  return STATUS_BADGE_CLASSES[status] || 'status-badge';
}

// Same roles the pipeline stepper and Activity Log already keep to a
// limited view (see PIPELINE_LIMITED_VISIBILITY_ROLES in
// pipeline-stepper.js, and the *_LIMITED_VISIBILITY_ROLES constants in
// irpf-page.js/ipaf-page.js/pcdf-page.js) -- a self-contained duplicate
// since this file loads before pipeline-stepper.js, same reasoning as
// IPAF_REF_SUFFIX_BY_CATEGORY in storage.js.
const STATUS_LIMITED_VISIBILITY_ROLES = ['pi', 'sd-director', 'poc'];

/* Resolves the status a given viewer should actually see, which can differ
 * from the record's real status in two cases:
 *
 * 1. PI/S-D Director/POC never see the review broken into Members vs
 *    Leadership -- the pipeline stepper already collapses both into one
 *    "Review" stage for them. "Pending Chairman Approval" names a specific
 *    reviewer they're meant to stay blind to (same principle as
 *    blindedRoleLabel in roles.js), so it resolves to the same generic
 *    "Under Review" instead.
 *
 * 2. An assigned IRB Member/Leadership reviewer who hasn't voted yet can
 *    still cast their vote even after the record has already flipped to
 *    'for_revision' -- from a DIFFERENT member's own "Return" (which
 *    bypasses the Secretariat and goes straight to the PI), or the
 *    Secretariat's own early return -- see isUnderReviewVotingOpenToMember/
 *    isPendingLeadershipApproval in irpf-form.js/ipaf-form.js, which keep
 *    their vote panel open in exactly this case. Showing them the record's
 *    real "For Revision" status reads as if their review is no longer
 *    wanted; this resolves the status they should see instead, so it still
 *    reflects their own open task rather than what happened on a different
 *    reviewer's vote. Only 'for_revision' is overridden here (not every
 *    status a late vote still counts under) -- once the record reaches a
 *    true outcome (approved, routed to leadership, etc.) that status is
 *    accurate and worth showing as-is. */
function getStatusForViewer(record, role) {
  if (STATUS_LIMITED_VISIBILITY_ROLES.includes(role) && record.status === 'pending_leadership_approval') {
    return 'under_review';
  }

  if (record.status !== 'for_revision') return record.status;

  const votes = record.votes || [];
  if (
    isIrbMember(role) &&
    (record.assignedMembers || []).includes(role) &&
    votes.length > 0 &&
    !votes.some((v) => v.voterId === role)
  ) {
    return 'under_review';
  }

  const leadershipApprovals = record.leadershipApprovals || [];
  if (isIrbLeadership(role) && leadershipApprovals.length > 0 && !leadershipApprovals.some((a) => a.approverId === role)) {
    return 'pending_leadership_approval';
  }

  return record.status;
}
