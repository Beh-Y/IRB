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
