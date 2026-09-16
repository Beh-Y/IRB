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

function getAllSubmissions() {
  return readJSON(STORAGE_KEYS.SUBMISSIONS, []);
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
