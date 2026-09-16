/* Shared status labels/badges for IRPF records across the dashboard and form pages. */

const STATUS_LABELS = {
  draft: 'Draft',
  pending_director_approval: 'Draft – Pending Director Approval',
  pending_review: 'Pending Review',
  for_revision: 'For Revision',
  under_review: 'Under Review',
  pending_leadership_approval: 'Pending Chairman Approval',
  approved: 'Approved',
};

function getStatusLabel(status) {
  return STATUS_LABELS[status] || status;
}
