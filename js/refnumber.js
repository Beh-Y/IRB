/*
 * Reference number generation for IRPF (IRB-MM-YYYY-XXX) and IPAF
 * (IRB-MM-YYYY-XXX-Suffix). XXX is a sequence that increments per MM-YYYY
 * period, is assigned once on first persistence, and never changes
 * afterwards. IRPF and IPAF each get their own counter namespace so
 * creating IPAFs doesn't skip numbers in the IRPF sequence (or vice versa).
 */

function nextSequenceInPeriod(namespace, mm, yyyy) {
  const counters = readJSON(STORAGE_KEYS.REF_COUNTERS, {});
  const periodKey = `${namespace}-${mm}-${yyyy}`;
  const nextSeq = (counters[periodKey] || 0) + 1;
  counters[periodKey] = nextSeq;
  writeJSON(STORAGE_KEYS.REF_COUNTERS, counters);
  return String(nextSeq).padStart(3, '0');
}

function generateIRPFReferenceNumber(onDate) {
  const date = onDate instanceof Date ? onDate : new Date();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = String(date.getFullYear());
  const xxx = nextSequenceInPeriod('IRPF', mm, yyyy);
  return `IRB-${mm}-${yyyy}-${xxx}`;
}

const IPAF_SUFFIX_BY_CATEGORY = {
  'Educational Research': 'PAER',
  'Biomedical Research': 'PABM',
  Others: 'PAOTH',
};

function generateIPAFReferenceNumber(onDate, category) {
  const date = onDate instanceof Date ? onDate : new Date();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = String(date.getFullYear());
  const xxx = nextSequenceInPeriod('IPAF', mm, yyyy);
  const suffix = IPAF_SUFFIX_BY_CATEGORY[category] || 'PAOTH';
  return `IRB-${mm}-${yyyy}-${xxx}-${suffix}`;
}

function generatePCDFReferenceNumber(onDate) {
  const date = onDate instanceof Date ? onDate : new Date();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = String(date.getFullYear());
  const xxx = nextSequenceInPeriod('PCDF', mm, yyyy);
  return `PCDF-${mm}-${yyyy}-${xxx}`;
}
