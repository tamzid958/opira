"use client";

import { useSyncExternalStore } from "react";
import { Icon } from "@/components/icons";
import { useUpdateCheck } from "@/lib/hooks/use-update-check";

const DISMISS_KEY = "opira:dismissed-update";
const DISMISS_EVENT = "opira:update-dismissed";

// Read the dismissed-version marker via useSyncExternalStore so the
// component stays SSR-safe (server snapshot returns null) and updates
// in the same tab when the user clicks Dismiss (custom event) as well
// as cross-tab (native `storage` event).
const subscribeDismiss = (cb) => {
  const onStorage = (e) => {
    if (e.key === DISMISS_KEY) cb();
  };
  const onLocal = () => cb();
  window.addEventListener("storage", onStorage);
  window.addEventListener(DISMISS_EVENT, onLocal);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(DISMISS_EVENT, onLocal);
  };
};

const getDismissSnap = () => {
  try {
    return window.localStorage.getItem(DISMISS_KEY);
  } catch {
    // localStorage may be blocked (Safari private mode, strict cookie
    // policy). Fall back to "never dismissed" — the banner reappears
    // each session, which is acceptable for an OSS upgrade nudge.
    return null;
  }
};

const getDismissServerSnap = () => null;

// Top-of-page strip surfacing a newer Opira release. Polls
// /api/updates/check (server caches the upstream GitHub call for 6h).
// Dismissal is keyed by *version* — hiding 0.2.0 silences this banner
// for that release only; 0.3.0 shows up fresh when it lands.
export function VersionBanner() {
  const { data } = useUpdateCheck();
  const dismissedVersion = useSyncExternalStore(
    subscribeDismiss,
    getDismissSnap,
    getDismissServerSnap,
  );

  if (!data?.hasUpdate || !data.latest) return null;
  if (dismissedVersion === data.latest) return null;

  const handleDismiss = () => {
    try {
      window.localStorage.setItem(DISMISS_KEY, data.latest);
      window.dispatchEvent(new Event(DISMISS_EVENT));
    } catch {
      /* ignore — see getDismissSnap note */
    }
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="relative z-40 flex items-center justify-center gap-3 px-4 py-2 bg-accent text-on-accent text-[12.5px] font-medium"
    >
      <Icon name="download" size={14} aria-hidden="true" />
      <span className="truncate">
        Opira {data.latest} is available
        {data.current ? (
          <span className="opacity-80"> (you’re on {data.current})</span>
        ) : null}
        .
      </span>
      {data.releaseUrl ? (
        <a
          href={data.releaseUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 underline underline-offset-2 hover:no-underline"
        >
          View release
          <Icon name="link" size={11} aria-hidden="true" />
        </a>
      ) : null}
      <button
        type="button"
        onClick={handleDismiss}
        aria-label={`Dismiss update notice for ${data.latest}`}
        className="ml-1 inline-flex items-center justify-center w-6 h-6 rounded-md border-0 bg-transparent text-on-accent/80 cursor-pointer transition-colors hover:bg-black/10 hover:text-on-accent"
      >
        <Icon name="x" size={13} aria-hidden="true" />
      </button>
    </div>
  );
}
