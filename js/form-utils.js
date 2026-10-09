/*
 * Generic helpers shared by every schema-driven form controller (IRPF, IPAF, ...):
 * flattening a section-based schema, word counting, date formatting, and
 * reading an uploaded file's content as a data URL (there's no server to
 * upload to, so the file's content lives inside the record itself).
 */

function flattenFields(schema) {
  return schema.flatMap((section) => section.fields);
}

/* Grows a record's permanent "ever assigned" IRB Member roster -- unlike
 * assignedMembers itself, which every re-routing call (routeToMembersFor-
 * Review/FromUnderReview/FromCollate, in irpf-form.js and ipaf-form.js)
 * replaces outright with just that round's roster, this union only ever
 * grows. A member dropped from a later routing round keeps their place in
 * it, so the Submissions-list filter (dashboard.js) that uses this for
 * visibility doesn't lose them entirely -- assignedMembers alone still
 * governs who can actually vote right now, unchanged.
 *
 * Must be called BEFORE record.assignedMembers is overwritten with the new
 * roster -- it folds in the outgoing current roster (about to be replaced)
 * as well as the incoming one, so the member(s) being dropped this round
 * are captured too, not just whoever happens to already be in
 * everAssignedMembers from an earlier call. */
function recordEverAssignedMembers(record, assigned) {
  record.everAssignedMembers = Array.from(
    new Set([...(record.everAssignedMembers || []), ...(record.assignedMembers || []), ...assigned])
  );
}

// Pair (pair.gov.sg) assistants pre-loaded with guidance for filling out the
// IRPF/IPAF, split by research category since the two assistants are tuned
// to different sections/requirements. Shared by irpf-form.js (where the PI
// picks the category) and ipaf-form.js (which just inherits it from the
// parent IRPF).
const CATEGORY_PAIR_ASSISTANT_LINKS = {
  'Educational Research': 'https://pair.gov.sg/chat?assistant=assistant_7824ec8f-159b-45a1-9db0-14729744daef',
  'Biomedical Research': 'https://pair.gov.sg/chat?assistant=assistant_9ed66f9f-fa41-42fb-b18b-c8c4cd670de9',
  Others: 'https://pair.gov.sg/chat?assistant=assistant_9ed66f9f-fa41-42fb-b18b-c8c4cd670de9',
};

// PCDF has no Category of Research field to key off, so it gets one flat
// assistant link rather than the IRPF/IPAF's per-category split. Reuses the
// same assistant as the "Others" category above as a placeholder -- swap in
// a PCDF-specific assistant ID here once one exists.
const PCDF_PAIR_ASSISTANT_LINK = 'https://pair.gov.sg/chat?assistant=assistant_9ed66f9f-fa41-42fb-b18b-c8c4cd670de9';

// Picks the right Pair assistant link for a record's form type -- IRPF/IPAF
// key off their (shared) Category of Research, PCDF always gets its one
// flat link. Shared by the in-form drafting guidance box (built per-form in
// each form.js) and the top-of-page renderPiCategoryGuidancePanel below.
function pairAssistantUrlFor(record) {
  if (record.formType === 'PCDF') return PCDF_PAIR_ASSISTANT_LINK;
  return CATEGORY_PAIR_ASSISTANT_LINKS[record.data.categoryOfResearch];
}

/* Pair opens as a cold chat with no idea which record, category, or stage
 * the PI is asking about -- there's no confirmed way to pre-seed its first
 * message via URL, so instead this builds a short plain-text summary the PI
 * can paste in themselves as their opening message. Deliberately uses the
 * same blinded status label the PI already sees on their own badge
 * (getStatusForViewer), not the raw internal status, and scrubs any staff
 * identity out of the reviewer's comment (scrubStaffIdentities) -- this
 * text leaves the app's own visibility rules behind once it's pasted
 * somewhere else, so it needs to already be safe to paste. */
function buildPairContextText(record, role) {
  const lines = [`Form: ${record.formType}`, `Reference Number: ${(record.data && record.data.refNumber) || 'Not yet assigned'}`];

  if (record.data && record.data.categoryOfResearch) {
    lines.push(`Category of Research: ${record.data.categoryOfResearch}`);
  }
  if (record.data && record.data.projectTitle) {
    lines.push(`Project Title: ${record.data.projectTitle}`);
  }
  lines.push(`Current Stage: ${getStatusLabel(getStatusForViewer(record, role), record.formType)}`);

  if (record.status === 'for_revision') {
    const lastReturn = [...(record.history || [])].reverse().find((h) => h.action === 'returned_for_amendments' && h.comment);
    if (lastReturn) {
      lines.push(`Reviewer's Comment to Address: ${scrubStaffIdentities(lastReturn.comment)}`);
    }
  }

  lines.push('', "I'm working on this SP IRB submission and would like guidance.");
  return lines.join('\n');
}

// The guidance description + link, shared verbatim across all three forms
// so they never drift. Kept category-agnostic in its wording -- IRPF/IPAF
// tailor the actual link by Category of Research (see
// CATEGORY_PAIR_ASSISTANT_LINKS above), but PCDF has no such field, so the
// copy itself just says "this page" rather than promising category-specific
// tailoring that wouldn't be true there.
function buildCategoryGuidanceBox() {
  const guidance = document.createElement('div');
  guidance.className = 'category-guidance';
  guidance.hidden = true;

  const desc = document.createElement('p');
  desc.className = 'triage-hint';
  desc.textContent =
    'Get step-by-step guidance filling out this page from the SP IRB Pair Assistant — trained on relevant IRB ' +
    'knowledge, fine-tuned from past cases, and cleared to handle data classified up to Restricted.';
  guidance.appendChild(desc);

  const actions = document.createElement('div');
  actions.className = 'triage-actions';
  guidance.appendChild(actions);

  // One button, two things happening on the same click: opens Pair in a new
  // tab AND copies the context summary to the clipboard, so the only manual
  // step left for the PI is pasting it as their opening message. There's no
  // way to go further than that and have Pair's own input field fill itself
  // in -- once that tab is open it's a different origin, and no script on
  // this page can reach into another site's page to type into it; that's a
  // browser security boundary, not something specific to Pair.
  const openBtn = document.createElement('button');
  openBtn.type = 'button';
  openBtn.className = 'btn btn-secondary';
  openBtn.textContent = 'Get Guidance from Pair Assistant';
  actions.appendChild(openBtn);

  const copyStatus = document.createElement('div');
  copyStatus.className = 'field-hint';
  copyStatus.hidden = true;
  guidance.appendChild(copyStatus);

  // Fallback for when the Clipboard API is unavailable or denied (e.g. a
  // non-secure context, or a browser permission block) -- the PI can select
  // and copy the same text manually instead. The tab still opens either way.
  const fallbackText = document.createElement('textarea');
  fallbackText.rows = 4;
  fallbackText.readOnly = true;
  fallbackText.hidden = true;
  guidance.appendChild(fallbackText);

  let source = null;
  let url = null;

  openBtn.addEventListener('click', () => {
    if (!url) return;
    // Opened synchronously, before any await -- a window.open() called
    // after an awaited clipboard call is liable to get blocked as an
    // unrequested popup, since by then the browser no longer considers it
    // part of the same user gesture. This still runs first in direct
    // response to the click, so it's always allowed.
    window.open(url, '_blank', 'noopener');

    if (!source) return;
    const text = buildPairContextText(source.record, source.role);
    navigator.clipboard
      .writeText(text)
      .then(() => {
        copyStatus.textContent = 'Opened Pair in a new tab, and copied your context -- paste it as your first message there.';
        fallbackText.hidden = true;
      })
      .catch(() => {
        copyStatus.textContent =
          "Opened Pair in a new tab. Couldn't copy your context automatically -- select the text below and paste it there.";
        fallbackText.value = text;
        fallbackText.hidden = false;
        fallbackText.select();
      })
      .finally(() => {
        copyStatus.hidden = false;
      });
  });

  return {
    guidance,
    // Called alongside setSource wherever this box is used, so the button
    // always opens whatever assistant link currently applies (it can change
    // -- e.g. IRPF's link depends on whichever Category of Research the PI
    // has selected) without needing a live <a href> to read it from.
    setUrl: (u) => {
      url = u;
    },
    // Called alongside setUrl, so the copied context always reflects
    // whatever record/role it's currently showing for -- computed fresh at
    // click time rather than baked in at render time, so it stays accurate
    // even as the PI keeps editing fields.
    setSource: (record, role) => {
      source = { record, role };
    },
  };
}

// Shown just below the "Reviewer Feedback" panel once the PI gets a form
// back for amendments -- the in-form guidance box (next to Category of
// Research on the IRPF, in Project Details on the IPAF) only appears while
// first drafting, so this is where the PI sees it while actually responding
// to feedback, without needing to scroll into the form to find it again.
function renderPiCategoryGuidancePanel(record, role) {
  const container = document.getElementById('pi-category-guidance-panel');
  if (!container) return;
  container.innerHTML = '';

  const url = role === 'pi' && record.status === 'for_revision' ? pairAssistantUrlFor(record) : null;
  if (!url) {
    container.hidden = true;
    return;
  }

  const { guidance, setUrl, setSource } = buildCategoryGuidanceBox();
  setUrl(url);
  setSource(record, role);
  guidance.hidden = false;
  container.appendChild(guidance);
  container.hidden = false;
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
/* Async so the redirect can wait on any EmailJS sends still in flight (see
 * pendingEmailSends in email-notify.js) -- otherwise the browser cancels
 * them mid-request the instant window.location changes. */
async function goToDashboardWithMessage(message, type) {
  setFlashMessage(message, type || 'success');
  if (typeof pendingEmailSends !== 'undefined') await Promise.allSettled(pendingEmailSends);
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
