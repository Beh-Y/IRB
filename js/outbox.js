/* Wires outbox.html: lists every simulated email queued by js/email.js
 * (newest first), and lets the System Admin clear it out. Restricted to
 * the "INDT / System Admin" role, same as admin.html -- anyone else gets
 * an access-denied message and none of the outbox content renders. */

function renderOutbox() {
  const outbox = getEmailOutbox();
  const list = document.getElementById('outbox-list');
  list.innerHTML = '';

  if (outbox.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'empty-state';
    empty.textContent = 'No emails queued yet -- take an action on a form (submit, route, review, ...) to see one appear here.';
    list.appendChild(empty);
    return;
  }

  [...outbox].reverse().forEach((email) => {
    const li = document.createElement('li');

    const meta = document.createElement('div');
    meta.className = 'activity-meta';
    const when = email.timestamp ? new Date(email.timestamp).toLocaleString() : '';
    meta.textContent = `${when} — To: ${email.toLabel} <${email.to}>`;
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
  if (role !== 'system-admin') {
    document.getElementById('outbox-content').hidden = true;
    const banner = document.getElementById('status-banner');
    banner.textContent = 'This page is restricted to the INDT / System Admin role. Switch role above to view it.';
    banner.className = 'status-banner status-banner--error';
    banner.hidden = false;
    return;
  }

  renderOutbox();

  document.getElementById('btn-clear-outbox').addEventListener('click', () => {
    if (!window.confirm('Clear every queued email? This cannot be undone.')) return;
    clearEmailOutbox();
    renderOutbox();
  });
}

document.addEventListener('DOMContentLoaded', initOutboxPage);
