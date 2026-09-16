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
