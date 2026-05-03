"use client";

import { createContext, useContext, useEffect, useState } from "react";

// Theme system. The four modes map to `data-theme` values on `<html>`:
//   - "system" (preference, not a value) → resolves to "light" or "dark"
//     based on the user's OS preference, and tracks live changes.
//   - "light" / "dark"           → standard themes
//   - "hc-light" / "hc-dark"     → WCAG AAA high-contrast variants
//
// Persistence: `localStorage["opira:theme"]` stores the *preference*
// ("system" | "light" | "dark" | "hc-light" | "hc-dark"). The applied
// `data-theme` attribute is the resolved value; an inline FOUC-guard
// script in `app/layout.jsx` sets it before React hydrates.

export const THEME_PREFS = ["system", "light", "dark", "hc-light", "hc-dark"];
export const STORAGE_KEY = "opira:theme";

const ThemeContext = createContext({
  preference: "system",
  resolved: "light",
  setPreference: () => {},
});

function resolveTheme(pref) {
  if (pref === "system") {
    if (typeof window === "undefined") return "light";
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return pref;
}

function applyTheme(value) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", value);
}

function readStoredPreference() {
  if (typeof window === "undefined") return "system";
  let stored = null;
  try {
    stored = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // storage may be blocked (privacy mode) — silently fall back.
  }
  return THEME_PREFS.includes(stored) ? stored : "system";
}

export function ThemeProvider({ children }) {
  // The inline FOUC-guard script in `app/layout.jsx` already sets the
  // `data-theme` attribute synchronously before React hydrates, so we can
  // safely read the same source here as a lazy initializer without flashing
  // a wrong theme. SSR returns "system" / "light"; the client picks up the
  // stored preference on first render.
  const [preference, setPreferenceState] = useState(readStoredPreference);
  const [resolved, setResolved] = useState(() => resolveTheme(readStoredPreference()));

  useEffect(() => {
    applyTheme(resolved);
  }, [resolved]);

  // Track OS preference changes when the user picked "system".
  useEffect(() => {
    if (preference !== "system" || typeof window === "undefined") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const next = mql.matches ? "dark" : "light";
      setResolved(next);
      applyTheme(next);
    };
    mql.addEventListener?.("change", onChange);
    return () => mql.removeEventListener?.("change", onChange);
  }, [preference]);

  const setPreference = (next) => {
    if (!THEME_PREFS.includes(next)) return;
    setPreferenceState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore quota errors
    }
    const r = resolveTheme(next);
    setResolved(r);
    applyTheme(r);
  };

  return (
    <ThemeContext.Provider value={{ preference, resolved, setPreference }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

// Inline script content — embedded in `app/layout.jsx` `<head>` to set
// the `data-theme` attribute synchronously, before React hydrates. This
// prevents a flash of light theme when the user prefers dark.
export const FOUC_GUARD_SCRIPT = `
(function () {
  try {
    var pref = localStorage.getItem('${STORAGE_KEY}') || 'system';
    var theme = pref;
    if (pref === 'system') {
      theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
    }
    document.documentElement.setAttribute('data-theme', theme);
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();
`.trim();
