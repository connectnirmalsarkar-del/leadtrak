// ---------------------------------------------------------------------------
// Centralized datetime parsing for backend ISO strings.
//
// Why this exists:
//   FastAPI + Motor returns datetimes as naive ISO strings WITHOUT a 'Z' or
//   timezone offset (e.g. "2026-06-04T09:31:43.781000") because BSON in
//   MongoDB drops tzinfo on the way back. Even though we always store with
//   `datetime.now(timezone.utc)`, the round-trip loses the UTC marker.
//
//   JavaScript's `new Date("2026-06-04T09:31:43.781000")` then interprets
//   that string as LOCAL time. An IST user (+5:30) sees timestamps that are
//   5h30m off — every recent event shows "5h ago" instead of "20m ago".
//
// Fix: always treat backend datetime strings as UTC. If the string is missing
// a trailing 'Z' or offset, append 'Z' before parsing.
// ---------------------------------------------------------------------------

export function parseBackendDate(input) {
  if (!input) return null;
  if (input instanceof Date) return input;
  const s = String(input);
  // Already has timezone info → trust it
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(s)) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  // Naive ISO → treat as UTC
  const d = new Date(s + 'Z');
  return Number.isNaN(d.getTime()) ? null : d;
}

export function timeAgo(input) {
  const d = parseBackendDate(input);
  if (!d) return '';
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 0) {
    // Future-dated (e.g. scheduled followups). Use absolute date.
    return d.toLocaleString();
  }
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatBackendDate(input, opts) {
  const d = parseBackendDate(input);
  if (!d) return '';
  return d.toLocaleString(undefined, opts);
}
