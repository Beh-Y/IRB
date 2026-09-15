/*
 * IRPF reference number generation: format IRB-MM-YYYY-XXX.
 * XXX is a sequence that increments per MM-YYYY period and is assigned once,
 * on the first time a record is persisted (draft or submit) — it never changes
 * afterwards, even if the record's dates or content change later.
 */

function generateIRPFReferenceNumber(onDate) {
  const date = onDate instanceof Date ? onDate : new Date();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = String(date.getFullYear());
  const periodKey = `${mm}-${yyyy}`;

  const counters = readJSON(STORAGE_KEYS.REF_COUNTERS, {});
  const nextSeq = (counters[periodKey] || 0) + 1;
  counters[periodKey] = nextSeq;
  writeJSON(STORAGE_KEYS.REF_COUNTERS, counters);

  const xxx = String(nextSeq).padStart(3, '0');
  return `IRB-${mm}-${yyyy}-${xxx}`;
}
