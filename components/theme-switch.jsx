"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useTheme, THEME_PREFS } from "@/components/theme-provider";
import { Icon } from "@/components/icons";

const OPTION_META = {
  system: { label: "System", desc: "Follow OS" },
  light: { label: "Light", desc: "Default" },
  dark: { label: "Dark", desc: "Low glare" },
  sepia: { label: "Sepia", desc: "Warm paper" },
  "paper-ink": { label: "Paper Ink", desc: "Editorial" },
  "terminal-mono": { label: "Terminal Mono", desc: "Phosphor" },
  "hc-light": { label: "HC Light", desc: "AAA" },
  "hc-dark": { label: "HC Dark", desc: "AAA" },
};

const SWATCHES = {
  system: { bg: "#f3f4f6", fg: "#111827", accent: "#4b5563" },
  light: { bg: "#faf8f5", fg: "#15171c", accent: "#1f2229" },
  dark: { bg: "#0a0b0e", fg: "#ebeef2", accent: "#b8bdc6" },
  sepia: { bg: "#f2e9d8", fg: "#3b2414", accent: "#6a4328" },
  "paper-ink": { bg: "#f8f4ea", fg: "#0d0d0d", accent: "#2e2e2e" },
  "terminal-mono": { bg: "#050807", fg: "#c5ffe4", accent: "#73ffcd" },
  "hc-light": { bg: "#ffffff", fg: "#000000", accent: "#000000" },
  "hc-dark": { bg: "#000000", fg: "#ffffff", accent: "#ffffff" },
};

function ThemePreview({ value }) {
  const sw = SWATCHES[value];
  return (
    <span
      className="relative w-8 h-6 rounded-md border shrink-0 overflow-hidden"
      style={{ background: sw.bg, borderColor: "rgba(127,127,127,.45)" }}
      aria-hidden="true"
    >
      <span
        className="absolute left-1 top-1 h-1 w-3 rounded-sm opacity-95"
        style={{ background: sw.fg }}
      />
      <span
        className="absolute left-1 top-3 h-1 w-4 rounded-sm opacity-70"
        style={{ background: sw.fg }}
      />
      <span
        className="absolute right-1 bottom-1 h-2 w-2 rounded-[3px]"
        style={{ background: sw.accent }}
      />
    </span>
  );
}

const LABELS = {
  system: OPTION_META.system.label,
  light: OPTION_META.light.label,
  dark: OPTION_META.dark.label,
  sepia: OPTION_META.sepia.label,
  "paper-ink": OPTION_META["paper-ink"].label,
  "terminal-mono": OPTION_META["terminal-mono"].label,
  "hc-light": OPTION_META["hc-light"].label,
  "hc-dark": OPTION_META["hc-dark"].label,
};

const ICONS = {
  system: "monitor",
  light: "sun",
  dark: "moon",
  sepia: "palette",
  "paper-ink": "file-text",
  "terminal-mono": "terminal",
  "hc-light": "sun",
  "hc-dark": "moon",
};

// Compact dropdown trigger used in the topbar. Shows a sun/moon icon
// reflecting the *resolved* theme (so users see what's actually applied,
// not what's stored as preference) and a small disclosure menu for
// switching.
export function ThemeSwitch() {
  const { preference, resolved, setPreference } = useTheme();
  const [open, setOpen] = useState(false);

  // Pick which icon glyph to show on the trigger. We avoid the full
  // `monitor` glyph to keep the chrome lean — fall back to sun/moon
  // based on resolved theme.
  const triggerIcon =
    resolved === "dark" || resolved === "hc-dark" || resolved === "terminal-mono"
      ? "moon"
      : "sun";

  const canPortal = typeof document !== "undefined";

  return (
    <div className="relative">
      <button
        type="button"
        title={`Theme: ${LABELS[preference]}`}
        aria-label="Change theme"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center justify-center w-8 h-8 rounded-md border-0 bg-transparent text-fg-subtle cursor-pointer transition-colors hover:bg-surface-subtle hover:text-fg"
      >
        <Icon name={triggerIcon} size={16} aria-hidden="true" />
      </button>
      {open && canPortal && createPortal(
        <>
          <div
            className="fixed inset-0 z-40 scrim"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Choose theme"
              className="w-full max-w-lg max-h-[85vh] overflow-hidden bg-surface-elevated border border-border rounded-2xl shadow-xl animate-pop"
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-border-soft">
                <div>
                  <div className="eyebrow">Appearance</div>
                  <div className="mt-1 text-[14px] font-semibold text-fg">Choose Theme</div>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="inline-flex items-center justify-center w-8 h-8 rounded-md text-fg-subtle hover:text-fg hover:bg-surface-subtle"
                  aria-label="Close theme dialog"
                >
                  <Icon name="x" size={14} aria-hidden="true" />
                </button>
              </div>
              <div className="p-3 sm:p-4 overflow-y-auto max-h-[calc(85vh-72px)]">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {THEME_PREFS.map((p) => {
                    const active = preference === p;
                    return (
                      <button
                        key={p}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => {
                          setPreference(p);
                          setOpen(false);
                        }}
                        className={`relative overflow-hidden w-full flex items-start gap-2.5 px-3 py-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                          active
                            ? "luxe-card border-accent bg-accent-50 text-accent-700 shadow-sm"
                            : "luxe-card border-border-soft text-fg-muted hover:text-fg"
                        }`}
                      >
                    <span
                      className="absolute inset-x-0 top-0 h-px opacity-80"
                      style={{
                        background: `linear-gradient(90deg, transparent, ${SWATCHES[p].accent}, transparent)`,
                      }}
                      aria-hidden="true"
                    />
                    <ThemePreview value={p} />
                    <Icon name={ICONS[p]} size={13} aria-hidden="true" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[12.5px] leading-tight font-semibold truncate">
                            {OPTION_META[p].label}
                          </span>
                          <span className="block text-[11px] opacity-80 mt-1 leading-tight truncate">
                            {OPTION_META[p].desc}
                          </span>
                        </span>
                        {active && (
                          <Icon name="check" size={12} aria-hidden="true" className="mt-0.5" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </>,
        document.body,
      )}
    </div>
  );
}

// Full radio group for the account page. Bigger labels, descriptions,
// keyboard-navigable.
export function ThemePicker() {
  const { preference, setPreference } = useTheme();

  const options = THEME_PREFS.map((value) => ({
    value,
    label: OPTION_META[value].label,
    desc: OPTION_META[value].desc,
  }));

  return (
    <div role="radiogroup" aria-label="Theme" className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {options.map((opt) => {
        const active = preference === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setPreference(opt.value)}
            className={`relative overflow-hidden flex items-start gap-2.5 px-3 py-2.5 rounded-xl border text-left cursor-pointer transition-all ${
              active
                ? "border-accent bg-accent-50 shadow-sm"
                : "border-border bg-surface-elevated hover:border-border-strong hover:bg-surface"
            }`}
          >
            <span
              className="absolute inset-x-0 top-0 h-px opacity-70"
              style={{
                background: `linear-gradient(90deg, transparent, ${SWATCHES[opt.value].accent}, transparent)`,
              }}
              aria-hidden="true"
            />
            <span
              className={`mt-0.5 grid place-items-center w-4 h-4 rounded-full border-2 shrink-0 ${
                active ? "border-accent" : "border-border-strong"
              }`}
            >
              {active && (
                <span className="w-2 h-2 rounded-full bg-accent" aria-hidden="true" />
              )}
            </span>
            <span className="mt-0.5">
              <ThemePreview value={opt.value} />
            </span>
            <Icon name={ICONS[opt.value]} size={13} aria-hidden="true" className="mt-0.5 shrink-0" />
            <span className="min-w-0 flex-1">
              <span
                className={`block text-[12.5px] font-semibold leading-tight truncate ${
                  active ? "text-accent-700" : "text-fg"
                }`}
              >
                {opt.label}
              </span>
              <span className="block text-[11px] text-fg-muted mt-1 leading-tight truncate">
                {opt.desc}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
