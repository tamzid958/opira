import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, formatDistanceToNow, isValid, parseISO } from "date-fns";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// Tolerant ISO parser — sprints use "yyyy-MM-dd" or the literal "—" for
// missing dates, and many records have null timestamps. Rejects anything
// that doesn't yield a valid Date so downstream date-fns calls never see
// Invalid Date.
export function safeParseISO(s) {
  if (!s || typeof s !== "string" || s === "—") return null;
  try {
    const d = parseISO(s);
    return isValid(d) ? d : null;
  } catch {
    return null;
  }
}

export function formatAbsDate(iso, fallback = "") {
  const d = safeParseISO(iso);
  return d ? format(d, "MMM d, yyyy") : fallback;
}

export function formatRelDate(iso, fallback = "") {
  const d = safeParseISO(iso);
  return d ? formatDistanceToNow(d, { addSuffix: true }) : fallback;
}

// Look up a record in a list by id with stringified comparison. OpenProject
// returns ids as numeric on resources but href-derived ids end up as strings,
// so callers always need string-coerced equality.
export function findById(list, id) {
  if (id == null || !Array.isArray(list)) return null;
  for (const item of list) {
    if (String(item?.id) === String(id)) return item;
  }
  return null;
}
