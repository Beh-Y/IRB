/* Role definitions and the client-side "Preview as" role switcher state. */

const ROLES = [
  { id: 'pi', label: 'Principal Investigator (PI)', group: 'SP Staff' },
  { id: 'sd-director', label: 'School/Department Director', group: 'SP Staff' },
  { id: 'poc', label: 'Point of Contact (POC)', group: 'SP Staff' },
  { id: 'irb-admin-edu', label: 'IRB Admin – EDU Secretariat', group: 'SP Staff' },
  { id: 'irb-admin-tie', label: 'IRB Admin – TIE Secretariat', group: 'SP Staff' },
  { id: 'irb-member-1', label: 'IRB Member 1', group: 'SP Staff' },
  { id: 'irb-member-2', label: 'IRB Member 2', group: 'SP Staff' },
  { id: 'irb-member-3', label: 'IRB Member 3', group: 'SP Staff' },
  { id: 'irb-co-chairman', label: 'IRB Co-Chairman', group: 'SP Staff' },
  { id: 'irb-chairman', label: 'IRB Chairman', group: 'SP Staff' },
  { id: 'system-admin', label: 'INDT / System Admin', group: 'SP Staff' },
];

/* The selectable IRB Member personas, in the order the Secretariat assigns them. */
const IRB_MEMBER_IDS = ['irb-member-1', 'irb-member-2', 'irb-member-3'];

/* Fixed IRB leadership roles who sign off after unanimous member approval. */
const IRB_LEADERSHIP_IDS = ['irb-co-chairman', 'irb-chairman'];

const ROLES_STORAGE_KEY = 'irb_current_role';

function getCurrentRole() {
  return localStorage.getItem(ROLES_STORAGE_KEY) || ROLES[0].id;
}

function setCurrentRole(roleId) {
  localStorage.setItem(ROLES_STORAGE_KEY, roleId);
}

function getRoleLabel(roleId) {
  const role = ROLES.find((r) => r.id === roleId);
  return role ? role.label : roleId;
}

function isSecretariat(roleId) {
  return roleId === 'irb-admin-edu' || roleId === 'irb-admin-tie';
}

function isIrbMember(roleId) {
  return IRB_MEMBER_IDS.includes(roleId);
}

function isIrbLeadership(roleId) {
  return IRB_LEADERSHIP_IDS.includes(roleId);
}

/* EDU category routes to the EDU secretariat; Biomedical/Others route to TIE. */
function secretariatRoleForCategory(category) {
  return category === 'Educational Research' ? 'irb-admin-edu' : 'irb-admin-tie';
}

/* The generic term to show in place of a specific IRB Member/Secretariat/
 * Leadership identity, for the two roles (PI, S/D Director) meant to stay
 * blind to exactly who reviewed -- not just whether they did. Any other
 * role (Director, the PI themselves, system) is identified normally. */
function blindedRoleLabel(roleId) {
  if (isIrbMember(roleId)) return 'an IRB Member';
  if (isSecretariat(roleId)) return 'the IRB Secretariat';
  if (isIrbLeadership(roleId)) return 'IRB Leadership';
  return getRoleLabel(roleId);
}

/* Scrubs any IRB Member/Secretariat/Leadership role label baked into a
 * free-text note (e.g. "...routed back to IRB Member 3 for review.") down
 * to the same generic term blindedRoleLabel uses elsewhere -- for the
 * Activity Log, which stores its detail as plain prose rather than
 * structured fields, so there's no other way to keep the PI/S-D Director
 * blind to reviewer identity there. Driven off the real role list rather
 * than a fixed string set, so it keeps working if roles are ever renamed. */
function scrubStaffIdentities(text) {
  if (!text) return text;
  return ROLES.filter((r) => isIrbMember(r.id) || isSecretariat(r.id) || isIrbLeadership(r.id)).reduce(
    (scrubbed, r) => scrubbed.split(r.label).join(blindedRoleLabel(r.id)),
    text
  );
}
