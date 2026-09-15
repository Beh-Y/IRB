/* Role definitions and the client-side "Preview as" role switcher state. */

const ROLES = [
  { id: 'pi', label: 'Principal Investigator (PI)', group: 'SP Staff' },
  { id: 'sd-director', label: 'School/Department Director', group: 'SP Staff' },
  { id: 'poc', label: 'Point of Contact (POC)', group: 'SP Staff' },
  { id: 'irb-admin-edu', label: 'IRB Admin – EDU Secretariat', group: 'SP Staff' },
  { id: 'irb-admin-tie', label: 'IRB Admin – TIE Secretariat', group: 'SP Staff' },
  { id: 'irb-member', label: 'IRB Member', group: 'SP Staff' },
  { id: 'system-admin', label: 'INDT / System Admin', group: 'SP Staff' },
];

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

/* EDU category routes to the EDU secretariat; Biomedical/Others route to TIE. */
function secretariatRoleForCategory(category) {
  return category === 'Educational Research' ? 'irb-admin-edu' : 'irb-admin-tie';
}
