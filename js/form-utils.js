/*
 * Generic helpers shared by every schema-driven form controller (IRPF, IPAF, ...):
 * flattening a section-based schema, word counting, date formatting, and
 * reading an uploaded file's content as a data URL (there's no server to
 * upload to, so the file's content lives inside the record itself).
 */

function flattenFields(schema) {
  return schema.flatMap((section) => section.fields);
}

function countWords(str) {
  return (str || '').trim().split(/\s+/).filter(Boolean).length;
}

function formatDateDDMMMYYYY(date) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${String(date.getDate()).padStart(2, '0')}-${months[date.getMonth()]}-${date.getFullYear()}`;
}

// A per-file cap keeps any one submission from blowing past localStorage's quota.
const MAX_FILE_SIZE_BYTES = 4 * 1024 * 1024;

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, size: file.size, type: file.type, dataUrl: reader.result });
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/* Field types whose control needs the full row width (long text, file
 * lists, multi-option groups, repeatable people cards) rather than sharing
 * a row with a second field -- used to lay sections out two fields per row
 * while keeping these on their own line. */
const FULL_WIDTH_FIELD_TYPES = ['textarea', 'file', 'checkbox-group', 'people-list'];

function isFullWidthField(field) {
  return FULL_WIDTH_FIELD_TYPES.includes(field.type);
}

/* Turns a validation-errors map ({fieldId: message}) into the list of
 * human-readable field labels that failed, for a single "here's what's
 * missing" summary rather than making the user hunt for inline highlights. */
function describeMissingFields(errors, fields) {
  const labelById = {};
  fields.forEach((f) => {
    labelById[f.id] = f.label;
  });
  return Object.keys(errors).map((id) => labelById[id] || id);
}

// Carries a one-time banner message across a redirect to the dashboard --
// sessionStorage rather than a query param so it doesn't linger in the URL
// or survive a bookmark/reload.
const FLASH_MESSAGE_KEY = 'irb_flash_message';

function setFlashMessage(message, type) {
  try {
    sessionStorage.setItem(FLASH_MESSAGE_KEY, JSON.stringify({ message, type }));
  } catch (e) {
    // sessionStorage unavailable (e.g. private browsing) -- the redirect
    // still happens, just without the banner on the other side.
  }
}

function consumeFlashMessage() {
  try {
    const raw = sessionStorage.getItem(FLASH_MESSAGE_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(FLASH_MESSAGE_KEY);
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

/* Every action that changes a record's status or state redirects to the
 * dashboard on success, carrying a flash message so the user still gets
 * confirmation of what just happened. */
function goToDashboardWithMessage(message, type) {
  setFlashMessage(message, type || 'success');
  window.location.href = 'index.html';
}

/* Renders a fully blinded list of just the review comments left so far --
 * no reviewer identity, no source body (member/leadership/Secretariat), no
 * decision, no timestamp, no tally -- used for the PI's view of a
 * reviewer-panel summary, since review is meant to stay completely
 * anonymous to the PI. (Non-PI roles -- Secretariat, IRB members,
 * leadership -- see the full, identified detail instead; see the
 * non-blinded branch in renderVotingSummary/renderLeadershipSummary.)
 * Returns true if anything was rendered, so the caller can hide the panel
 * entirely when there's nothing to show yet. */
/* Renders the PI's blinded feedback panel -- no reviewer identity, just
 * each comment labeled by its place in the back-and-forth: every reviewer
 * comment is "Feedback N", every one of the PI's own resubmission comments
 * is "Response N", in chronological order so it reads Feedback 1, Response
 * 1, Feedback 2, Response 2, ... like the actual conversation. Takes an
 * array of {action, comment, timestamp} (already sorted oldest first);
 * entries with no comment should already be filtered out by the caller.
 * Returns true if anything was rendered, so the caller can hide the panel
 * when there's nothing yet. */
function renderBlindedReviewComments(list, entries) {
  list.innerHTML = '';
  let feedbackCount = 0;
  let responseCount = 0;
  entries.forEach((entry) => {
    const isResponse = entry.action === 'resubmit';
    const li = document.createElement('li');
    const meta = document.createElement('div');
    meta.className = 'activity-meta';
    meta.textContent = isResponse ? `Response ${++responseCount}` : `Feedback ${++feedbackCount}`;
    li.appendChild(meta);
    const note = document.createElement('div');
    note.className = 'activity-note';
    note.textContent = entry.comment;
    li.appendChild(note);
    list.appendChild(li);
  });
  return entries.length > 0;
}

/* Renders a fully-identified list of review comments -- who left it, their
 * decision (if any), and when -- for staff roles who need the full
 * picture (currently: the Secretariat/Member/Leadership top-of-page
 * Comments panel), unlike the PI's blinded feedback panel. Takes an array
 * of {identity, decision, comment, timestamp}; entries with no comment are
 * skipped, and the rest are shown oldest first -- this is a conversation
 * thread (reviewer comment, PI's response, reviewer comment, ...), so it
 * reads top-to-bottom in the order it happened. Returns true if anything
 * was rendered, so the caller can hide the panel when there's nothing yet. */
function renderIdentifiedReviewComments(list, entries) {
  list.innerHTML = '';
  const withComments = entries
    .filter((e) => e.comment && e.comment.trim())
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  withComments.forEach((entry) => {
    const li = document.createElement('li');
    const meta = document.createElement('div');
    meta.className = 'activity-meta';
    const when = entry.timestamp ? new Date(entry.timestamp).toLocaleString() : '';
    meta.textContent = entry.decision ? `${when} — ${entry.identity} — ${entry.decision}` : `${when} — ${entry.identity}`;
    li.appendChild(meta);
    const note = document.createElement('div');
    note.className = 'activity-note';
    note.textContent = entry.comment;
    li.appendChild(note);
    list.appendChild(li);
  });
  return withComments.length > 0;
}

/* Clones the buttons/links from an action row (e.g. the `.form-actions`
 * bar, or a contextual panel's `.triage-actions` row) directly into
 * `targetContainer` -- the single sticky top-actions bar in the header --
 * and hides the original row in place, so each action is reachable
 * exactly once, from the top, however far down the form the panel it
 * belongs to sits. Clones from every call land as siblings in that same
 * bar (not one wrapper row per call) so e.g. the always-visible Close
 * button and the current contextual panel's own actions (Submit Vote /
 * Route to Secretariat, ...) read as one row instead of stacking into
 * separate lines. `visibilityEl` is the element whose `hidden` state the
 * panel/bar was set from (often the row itself, sometimes its enclosing
 * panel) -- read once, at call time, since nothing re-hides these mid-page
 * anymore now that every action redirects away on success. Each clone
 * forwards its click to the real button so there's exactly one
 * implementation per action. */
function mirrorActionRow(visibilityEl, targetContainer) {
  if (!visibilityEl || !targetContainer) return;
  const sourceRow = visibilityEl.matches && visibilityEl.matches('.triage-actions, .form-actions')
    ? visibilityEl
    : visibilityEl.querySelector('.triage-actions, .form-actions');
  if (!sourceRow) return;

  const rowHidden = !!visibilityEl.hidden;

  Array.from(sourceRow.children).forEach((child) => {
    const clone = child.cloneNode(true);
    if (clone.id) clone.removeAttribute('id');
    if (child.tagName === 'BUTTON' || child.tagName === 'A') {
      clone.hidden = rowHidden || child.hidden;
      clone.disabled = child.disabled;
      clone.addEventListener('click', (e) => {
        e.preventDefault();
        if (!rowHidden && !child.hidden && !child.disabled) child.click();
      });
    }
    targetContainer.appendChild(clone);
  });

  sourceRow.classList.add('action-row-relocated');
}
