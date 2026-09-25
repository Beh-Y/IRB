/* localStorage-backed persistence for IRB submissions and reference-number counters. */

const STORAGE_KEYS = {
  SUBMISSIONS: 'irb_submissions',
  REF_COUNTERS: 'irb_ref_counters',
};

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (err) {
    console.error(`Failed to read ${key} from localStorage`, err);
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.error(`Failed to write ${key} to localStorage`, err);
    throw new Error('Local storage is full. Try removing an uploaded file, then save again.');
  }
}

function generateId() {
  return `sub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/* Records saved before "To Create IPAF" got its own status were left as
 * 'approved' (distinguishable only by reviewOutcome/ipafRequired). Correct
 * them once, in place, so old data doesn't show as "Approved for Exemption". */
function migrateLegacyIpafStatus(records) {
  let changed = false;
  records.forEach((record) => {
    if (record.status === 'approved' && record.reviewOutcome === 'full_review' && record.ipafRequired) {
      record.status = 'to_create_ipaf';
      changed = true;
    }
  });
  return changed;
}

/* Self-contained duplicates of refnumber.js's period-key convention and
 * IPAF suffix table -- this file loads before refnumber.js on the pages
 * that have both, and isn't loaded at all on some others (dashboard,
 * report, admin), so the reference-number cleanup below can't call into
 * it. Named distinctly from refnumber.js's own declarations to avoid any
 * collision on pages where both are present. */
const IPAF_REF_SUFFIX_BY_CATEGORY = { 'Educational Research': 'PAER', 'Biomedical Research': 'PABM', Others: 'PAOTH' };

function parseRefSequence(refNumber, namespace) {
  const prefix = namespace === 'PCDF' ? 'PCDF' : 'IRB';
  const match = new RegExp(`^${prefix}-(\\d{2})-(\\d{4})-(\\d{3})`).exec(refNumber || '');
  if (!match) return null;
  const [, mm, yyyy, xxx] = match;
  return { mm, yyyy, seq: Number(xxx) };
}

/* The per-period counter (irb_ref_counters) is the source of truth for the
 * *next* number to hand out, but it can fall behind the highest number
 * actually present in the data -- e.g. after a manual data fix, an import,
 * or the duplicate-correction below itself. Bumping it up to match
 * whatever's highest in the current data first means a freshly-assigned
 * "next" number can never collide with one that's already in use. */
function reconcileRefCounters(records) {
  const counters = readJSON(STORAGE_KEYS.REF_COUNTERS, {});
  let changed = false;
  records.forEach((record) => {
    if (!['IRPF', 'IPAF', 'PCDF'].includes(record.formType)) return;
    const parsed = parseRefSequence(record.data && record.data.refNumber, record.formType);
    if (!parsed) return;
    const periodKey = `${record.formType}-${parsed.mm}-${parsed.yyyy}`;
    if ((counters[periodKey] || 0) < parsed.seq) {
      counters[periodKey] = parsed.seq;
      changed = true;
    }
  });
  if (changed) writeJSON(STORAGE_KEYS.REF_COUNTERS, counters);
  return changed;
}

function takeNextRefSequence(namespace, mm, yyyy) {
  const counters = readJSON(STORAGE_KEYS.REF_COUNTERS, {});
  const periodKey = `${namespace}-${mm}-${yyyy}`;
  const nextSeq = (counters[periodKey] || 0) + 1;
  counters[periodKey] = nextSeq;
  writeJSON(STORAGE_KEYS.REF_COUNTERS, counters);
  return String(nextSeq).padStart(3, '0');
}

function assignFreshReferenceNumber(record) {
  const date = record.createdAt ? new Date(record.createdAt) : new Date();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = String(date.getFullYear());

  if (record.formType === 'IRPF') {
    return `IRB-${mm}-${yyyy}-${takeNextRefSequence('IRPF', mm, yyyy)}`;
  }
  if (record.formType === 'IPAF') {
    const suffix = IPAF_REF_SUFFIX_BY_CATEGORY[record.data.categoryOfResearch] || 'PAOTH';
    return `IRB-${mm}-${yyyy}-${takeNextRefSequence('IPAF', mm, yyyy)}-${suffix}`;
  }
  if (record.formType === 'PCDF') {
    return `PCDF-${mm}-${yyyy}-${takeNextRefSequence('PCDF', mm, yyyy)}`;
  }
  return null;
}

/* Two records should never carry the same reference number -- but a race
 * between browser tabs both drawing from the same counter at once could
 * produce exactly that. Whenever a group of records shares one, the
 * earliest-created keeps it (it was rightfully first); every later one is
 * renumbered, processed oldest to newest, so a group's second-created
 * record is corrected before its third, and so on. */
function dedupeReferenceNumbers(records) {
  let changed = false;
  const byKey = new Map();
  records.forEach((record) => {
    const ref = record.data && record.data.refNumber;
    if (!ref) return;
    const key = `${record.formType}::${ref}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(record);
  });

  byKey.forEach((group) => {
    if (group.length < 2) return;
    const sorted = [...group].sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
    sorted.slice(1).forEach((record) => {
      const oldRef = record.data.refNumber;
      const newRef = assignFreshReferenceNumber(record);
      if (!newRef) return;
      record.data.refNumber = newRef;
      record.updatedAt = new Date().toISOString();
      record.history = record.history || [];
      record.history.push({
        action: 'refnumber_corrected',
        actor: 'system',
        status: record.status,
        timestamp: record.updatedAt,
        note: `Reference number corrected from a duplicate (${oldRef}) to ${newRef}.`,
      });
      changed = true;
    });
  });

  return changed;
}

function getAllSubmissions() {
  const records = readJSON(STORAGE_KEYS.SUBMISSIONS, []);
  let changed = migrateLegacyIpafStatus(records);
  reconcileRefCounters(records);
  if (dedupeReferenceNumbers(records)) changed = true;
  if (changed) {
    writeJSON(STORAGE_KEYS.SUBMISSIONS, records);
  }
  return records;
}

function getSubmission(id) {
  return getAllSubmissions().find((s) => s.id === id) || null;
}

function getSubmissionsByType(formType) {
  return getAllSubmissions().filter((s) => s.formType === formType);
}

/* Permanently removes a submission (INDT / System Admin only -- gated in
 * dashboard.js). Deleting an IRPF also removes any IPAF filed under it,
 * since an orphaned IPAF pointing at a parent that no longer exists has
 * nowhere sensible to be shown. */
function deleteSubmission(id) {
  const all = getAllSubmissions();
  const target = all.find((s) => s.id === id);
  if (!target) return;

  const idsToRemove = new Set([id]);
  if (target.formType === 'IRPF') {
    all.forEach((s) => {
      if (s.formType === 'IPAF' && s.parentIrpfId === id) idsToRemove.add(s.id);
    });
  }

  writeJSON(STORAGE_KEYS.SUBMISSIONS, all.filter((s) => !idsToRemove.has(s.id)));
}

/* Upserts a submission record and appends a history entry describing the change. */
function saveSubmission(record, historyEntry) {
  const all = getAllSubmissions();
  const index = all.findIndex((s) => s.id === record.id);

  record.updatedAt = new Date().toISOString();
  if (historyEntry) {
    record.history = record.history || [];
    record.history.push({ ...historyEntry, timestamp: record.updatedAt });
  }

  if (index === -1) {
    all.push(record);
  } else {
    all[index] = record;
  }

  writeJSON(STORAGE_KEYS.SUBMISSIONS, all);
  return record;
}
