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
  { id: 'system-admin', label: 'INDT / System Admin', group: 'SP Staff' },
];

/* The selectable IRB Member personas, in the order the Secretariat assigns them. */
const IRB_MEMBER_IDS = ['irb-member-1', 'irb-member-2', 'irb-member-3'];

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

/* EDU category routes to the EDU secretariat; Biomedical/Others route to TIE. */
function secretariatRoleForCategory(category) {
  return category === 'Educational Research' ? 'irb-admin-edu' : 'irb-admin-tie';
}
