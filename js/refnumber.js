/*
 * Reference number generation for IRPF (IRB-MM-YYYY-XXX) and PCDF
 * (PCDF-MM-YYYY-XXX). XXX is a sequence that increments per MM-YYYY period,
 * is assigned once on first persistence, and never changes afterwards.
 *
 * IPAF has no sequence of its own -- it mirrors its parent IRPF's reference
 * number verbatim and just appends a category-based suffix, so the child
 * is always visibly traceable back to the IRPF it came from.
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

function generateIPAFReferenceNumber(irpfReferenceNumber, category) {
  const suffix = IPAF_SUFFIX_BY_CATEGORY[category] || 'PAOTH';
  return `${irpfReferenceNumber}-${suffix}`;
}

function generatePCDFReferenceNumber(onDate) {
  const date = onDate instanceof Date ? onDate : new Date();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = String(date.getFullYear());
  const xxx = nextSequenceInPeriod('PCDF', mm, yyyy);
  return `PCDF-${mm}-${yyyy}-${xxx}`;
}
