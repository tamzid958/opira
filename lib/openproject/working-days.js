// Shared working-days mask used by both the burndown route (server) and the
// Reports chart (client). Defaults to Mon..Fri when `raw` is empty/null.
//
// `raw` is the raw env value (`OPENPROJECT_WORKING_DAYS`) — server callers
// pass `process.env.OPENPROJECT_WORKING_DAYS`; client callers pass
// `usePublicConfig().workingDays`. Decoupling the parser from the env read
// is what lets the same module run in both environments at request time.
//
// Format: any whitespace/comma-separated list of three-letter prefixes,
// case-insensitive: "Mon,Tue,Wed,Thu,Fri" or "mon tue wed thu fri sat".

const DEFAULT = [1, 2, 3, 4, 5];
const PREFIX = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

export function workingDaySet(raw) {
  if (!raw) return new Set(DEFAULT);
  const out = new Set();
  for (const tok of String(raw).split(/[,\s]+/).filter(Boolean)) {
    const k = tok.slice(0, 3).toLowerCase();
    if (PREFIX[k] != null) out.add(PREFIX[k]);
  }
  return out.size > 0 ? out : new Set(DEFAULT);
}

export function isWorkingDay(date, raw) {
  return workingDaySet(raw).has(new Date(date).getUTCDay());
}

// Date → ISO day string (YYYY-MM-DD), shared between server routes that
// walk sprint windows. Inline elsewhere as `d.toISOString().slice(0, 10)`.
export function isoDayOf(d) {
  return d.toISOString().slice(0, 10);
}
