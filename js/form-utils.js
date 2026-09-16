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
