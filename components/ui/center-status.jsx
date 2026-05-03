"use client";

import { Eyebrow } from "@/components/ui/eyebrow";

// Full-screen status surfaces (loader / error / "not configured" / "no
// projects") share a single centered card. The card uses the `luxe-card`
// chrome so these moments feel like part of the rest of the app rather
// than a stripped-down fallback.

export function CenterStatus({ children, narrow = false }) {
  return (
    <div className="grid place-items-center h-screen w-screen bg-surface-app p-6">
      <div
        className={`luxe-card text-[14px] leading-relaxed text-fg p-7 sm:p-8 ${
          narrow ? "max-w-md" : "max-w-lg"
        } w-full`}
      >
        {children}
      </div>
    </div>
  );
}

export function CenterLoader({ label = "Loading…" }) {
  return (
    <CenterStatus narrow>
      <div className="flex items-center gap-3">
        <span
          className="w-4 h-4 rounded-full border-2 border-border-soft border-t-accent animate-spin"
          aria-hidden="true"
        />
        <span className="text-fg-muted">{label}</span>
      </div>
    </CenterStatus>
  );
}

export function CenterError({ title, message }) {
  return (
    <CenterStatus>
      <Eyebrow tone="strong">Error</Eyebrow>
      <h2 className="font-display text-[20px] font-semibold tracking-[-0.018em] text-fg m-0 mt-2 mb-3">
        {title}
      </h2>
      <pre className="bg-surface-subtle border border-border-soft rounded-md px-3 py-2.5 text-[12.5px] font-mono text-pri-highest whitespace-pre-wrap m-0 overflow-auto">
        {message}
      </pre>
    </CenterStatus>
  );
}

export function CenterNotConfigured() {
  return (
    <CenterStatus>
      <Eyebrow tone="strong">Setup</Eyebrow>
      <h2 className="font-display text-[20px] font-semibold tracking-[-0.018em] text-fg m-0 mt-2 mb-3">
        Connect to OpenProject
      </h2>
      <p className="text-fg-muted m-0 mb-4 text-[13.5px]">
        Configure these env vars in <code className="px-1 py-0.5 rounded bg-surface-muted text-fg text-[12px] font-mono">.env.local</code> and restart the dev server:
      </p>
      <pre className="bg-surface-subtle border border-border-soft rounded-md px-3 py-3 text-[12.5px] font-mono text-fg overflow-auto m-0">
        {`OPENPROJECT_URL=https://your-instance
OPENPROJECT_OAUTH_CLIENT_ID=...
OPENPROJECT_OAUTH_CLIENT_SECRET=...
AUTH_SECRET=...`}
      </pre>
    </CenterStatus>
  );
}
