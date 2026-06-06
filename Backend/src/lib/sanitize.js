const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Returns a clean string or null. Rejects non-strings, trims whitespace,
// strips null bytes, and enforces a maximum byte length.
export function str(value, { max = 500, required = false } = {}) {
  if (value === undefined || value === null) {
    return required ? undefined : null;
  }
  if (typeof value !== "string") return undefined;

  const cleaned = value.replace(/\0/g, "").trim();

  if (required && cleaned.length === 0) return undefined;
  if (cleaned.length > max) return undefined;

  return cleaned || null;
}

// Validates a UUID v4 path param. Returns the value or null.
export function uuid(value) {
  if (typeof value !== "string") return null;
  return UUID_RE.test(value) ? value : null;
}

// Validates an integer. Returns undefined if out of range or not an integer.
export function int(value, { min = 1, max = 99999 } = {}) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) return undefined;
  return n;
}

// Parses an ISO 8601 date string into a Date object.
// Returns null if the value is explicitly null (clears a nullable field).
// Returns undefined if the value is missing or invalid.
export function isoDate(value) {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const d = new Date(value);
  return isNaN(d.getTime()) ? undefined : d;
}
