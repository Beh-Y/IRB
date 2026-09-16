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

function getAllSubmissions() {
  const records = readJSON(STORAGE_KEYS.SUBMISSIONS, []);
  if (migrateLegacyIpafStatus(records)) {
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
