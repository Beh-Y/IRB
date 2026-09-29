/* Wires outbox.html: lists every simulated email queued by js/email.js
 * (newest first), lets it be filtered by recipient role, which record
 * it's about, which action triggered it, or a subject/body search, and
 * lets the Secretariat or System Admin clear it out. Restricted to those
 * roles -- anyone else gets an access-denied message and none of the
 * outbox content renders. */

let outboxRoleFilter = 'all';
let outboxRecordFilter = 'all';
let outboxActionFilter = 'all';
let outboxSearchFilter = '';

/* Same humanization as the Activity Log (entry.action.replace(/_/g, ' '))
 * -- reused here rather than a separate label map, so "routed_to_members"
 * reads as "routed to members" in the Action dropdown too. */
function outboxActionLabel(action) {
  return action ? action.replace(/_/g, ' ') : 'Unknown';
}

/* Best-effort label for the "Record" filter/list -- looks up the live
 * submission for its reference number, falling back to formType + a
 * short id fragment if it's since been deleted (or the entry predates
 * recordId being recorded at all). */
function outboxRecordLabel(email) {
  if (!email.recordId) return null;
  const record = getSubmission(email.recordId);
  const ref = record && record.data && record.data.refNumber;
  return ref || `${email.formType || 'Unknown'} (${email.recordId.slice(-6)})`;
}

function populateOutboxFilters(outbox) {
  const roleSelect = document.getElementById('filter-role');
  const recordSelect = document.getElementById('filter-record');
  const actionSelect = document.getElementById('filter-action');

  const roles = new Map();
  const records = new Map();
  const actions = new Map();
  outbox.forEach((email) => {
    if (email.toRoleId) roles.set(email.toRoleId, email.toLabel || getRoleLabel(email.toRoleId));
    if (email.recordId) records.set(email.recordId, outboxRecordLabel(email));
    if (email.action) actions.set(email.action, outboxActionLabel(email.action));
  });

  const rebuild = (select, entries, currentValue, allLabel) => {
    const previous = select.value || currentValue;
    select.innerHTML = '';
    const allOption = document.createElement('option');
    allOption.value = 'all';
    allOption.textContent = allLabel;
    select.appendChild(allOption);
    [...entries.entries()]
      .sort((a, b) => a[1].localeCompare(b[1]))
      .forEach(([value, label]) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        select.appendChild(option);
      });
    // Keep the current selection if it's still a valid choice, otherwise
    // fall back to "all" rather than silently pointing at a removed option.
    select.value = [...select.options].some((o) => o.value === previous) ? previous : 'all';
    return select.value;
  };

  outboxRoleFilter = rebuild(roleSelect, roles, outboxRoleFilter, 'All recipients');
  outboxRecordFilter = rebuild(recordSelect, records, outboxRecordFilter, 'All records');
  outboxActionFilter = rebuild(actionSelect, actions, outboxActionFilter, 'All actions');
}

function renderOutbox() {
  const outbox = getEmailOutbox();
  populateOutboxFilters(outbox);

  const search = outboxSearchFilter.trim().toLowerCase();
  const filtered = outbox.filter(
    (email) =>
      (outboxRoleFilter === 'all' || email.toRoleId === outboxRoleFilter) &&
      (outboxRecordFilter === 'all' || email.recordId === outboxRecordFilter) &&
      (outboxActionFilter === 'all' || email.action === outboxActionFilter) &&
      (!search || `${email.subject} ${email.body}`.toLowerCase().includes(search))
  );

  const list = document.getElementById('outbox-list');
  list.innerHTML = '';

  if (filtered.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'empty-state';
    empty.textContent =
      outbox.length === 0
        ? 'No emails queued yet -- take an action on a form (submit, route, review, ...) to see one appear here.'
        : 'No emails match the selected filters.';
    list.appendChild(empty);
    return;
  }

  [...filtered].reverse().forEach((email) => {
    const li = document.createElement('li');

    const meta = document.createElement('div');
    meta.className = 'activity-meta';
    const when = email.timestamp ? new Date(email.timestamp).toLocaleString() : '';
    const recordLabel = outboxRecordLabel(email);
    meta.textContent = `${when} — To: ${email.toLabel} <${email.to}>${recordLabel ? ` — ${recordLabel}` : ''}`;
    li.appendChild(meta);

    const subject = document.createElement('div');
    subject.className = 'activity-note';
    const subjectStrong = document.createElement('strong');
    subjectStrong.textContent = email.subject;
    subject.appendChild(subjectStrong);
    li.appendChild(subject);

    const body = document.createElement('div');
    body.className = 'activity-note';
    body.textContent = email.body;
    li.appendChild(body);

    list.appendChild(li);
  });
}

function initOutboxPage() {
  renderHeader('outbox');

  const role = getCurrentRole();
  if (!isSecretariat(role) && role !== 'system-admin') {
    document.getElementById('outbox-content').hidden = true;
    const banner = document.getElementById('status-banner');
    banner.textContent = 'This page is restricted to the IRB Admin (Secretariat) or INDT / System Admin roles. Switch role above to view it.';
    banner.className = 'status-banner status-banner--error';
    banner.hidden = false;
    return;
  }

  renderOutbox();

  document.getElementById('filter-role').addEventListener('change', (e) => {
    outboxRoleFilter = e.target.value;
    renderOutbox();
  });

  document.getElementById('filter-record').addEventListener('change', (e) => {
    outboxRecordFilter = e.target.value;
    renderOutbox();
  });

  document.getElementById('filter-action').addEventListener('change', (e) => {
    outboxActionFilter = e.target.value;
    renderOutbox();
  });

  document.getElementById('filter-search').addEventListener('input', (e) => {
    outboxSearchFilter = e.target.value;
    renderOutbox();
  });

  document.getElementById('btn-clear-outbox').addEventListener('click', () => {
    if (!window.confirm('Clear every queued email? This cannot be undone.')) return;
    clearEmailOutbox();
    outboxRoleFilter = 'all';
    outboxRecordFilter = 'all';
    outboxActionFilter = 'all';
    outboxSearchFilter = '';
    document.getElementById('filter-search').value = '';
    renderOutbox();
  });
}

document.addEventListener('DOMContentLoaded', initOutboxPage);
