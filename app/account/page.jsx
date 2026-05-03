"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { signOut } from "next-auth/react";
import { Avatar } from "@/components/ui/avatar";
import { CenterLoader } from "@/components/ui/center-status";
import { LoadingPill } from "@/components/ui/loading-pill";
import { Icon } from "@/components/icons";
import { fetchJson } from "@/lib/api-client";
import { useMe } from "@/lib/hooks/use-openproject-detail";
import { useQueriesSettled } from "@/lib/hooks/use-queries-settled";
import { ThemePicker } from "@/components/theme-switch";
import { WorkingHoursCard } from "@/components/working-hours-card";
import { DataSourceCard } from "@/components/data-source-card";
import { usePublicConfig } from "@/components/config-provider";

// All editable account fields (name, email, avatar, language, timezone,
// password) are managed in OpenProject — the v3 API exposes user records
// as read-mostly. We surface the current identity here, deep-link to OP's
// own settings page for edits, and let the user sign out without leaving
// the app.

const FIELD =
  "flex items-baseline gap-3 py-2.5 border-b border-border-soft last:border-b-0";
const FIELD_LABEL =
  "w-32 shrink-0 text-[12px] font-medium text-fg-muted uppercase tracking-wider";
const FIELD_VALUE = "flex-1 text-[13.5px] text-fg leading-relaxed min-w-0 break-words";

// Cache slices grouped by user-facing domain. Every TanStack Query in this
// app lives under ["op", <subkey>, ...], so invalidating by the second
// element scopes the refresh without touching unrelated data. `null` means
// "everything".
const REFRESH_TARGETS = [
  {
    id: "all",
    label: "Everything",
    description: "Mark all cached data stale and refetch what's currently on screen.",
    subkeys: null,
  },
  {
    id: "work",
    label: "Work packages & sprints",
    description: "Tasks, sprints, burndown, velocity, capacity, scope changes, carryover.",
    subkeys: [
      "tasks",
      "wp",
      "sprints",
      "burndown",
      "velocity",
      "capacity",
      "scope-changes",
      "carryover",
      "open-counts",
      "queries",
      "search",
    ],
  },
  {
    id: "projects",
    label: "Projects & portfolios",
    description: "Project list, portfolios, programs, categories, versions metadata.",
    subkeys: ["projects", "project", "portfolios", "portfolio", "programs", "program", "categories"],
  },
  {
    id: "people",
    label: "People & permissions",
    description: "Members, assignees, roles, working hours, time off, your profile.",
    subkeys: [
      "users",
      "user",
      "me",
      "members",
      "available-assignees",
      "roles",
      "working-hours",
      "non-working-times",
      "viewer-permissions",
    ],
  },
  {
    id: "notifications",
    label: "Notifications & reminders",
    description: "Inbox, reminders, time entries.",
    subkeys: ["notifications", "reminders", "time-entries", "time-entry-activities"],
  },
  {
    id: "metadata",
    label: "Types, statuses & schemas",
    description: "Work-package types, statuses, priorities, custom options, schemas, documents.",
    subkeys: [
      "types",
      "status",
      "statuses",
      "priorities",
      "custom-options",
      "schema",
      "documents",
      "document",
      "wiki-page",
    ],
  },
];

const REFRESH_TIMEOUT_MS = 30_000;
const JUST_DONE_PULSE_MS = 4000;

const TIME_FMT = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
});

export default function AccountPage() {
  const me = useMe();
  // Pull the richer OP user record (login, language, timezone, avatar URL,
  // status). Falls back gracefully when the user is unauthenticated or
  // OP isn't configured — we just show what we have from the session.
  const opMe = useQuery({
    queryKey: ["op", "users", "me"],
    queryFn: () => fetchJson("/api/openproject/users/me"),
    staleTime: 5 * 60_000,
    retry: false,
  });
  const qc = useQueryClient();
  const [refreshingId, setRefreshingId] = useState(null);
  // Last completed refresh — formatted at completion time so render stays pure.
  const [lastRefresh, setLastRefresh] = useState(null);
  // Auto-clears via setTimeout, so "Refreshed" pill doesn't depend on Date.now().
  const [justDoneId, setJustDoneId] = useState(null);

  const handleRefresh = async (target) => {
    if (refreshingId) return;
    setRefreshingId(target.id);
    // Hard-cap the spinner so a stuck request can't lock the UI forever.
    const deadline = new Promise((resolve) => setTimeout(resolve, REFRESH_TIMEOUT_MS));
    try {
      const work = target.subkeys === null
        ? qc.invalidateQueries({ queryKey: ["op"] })
        : Promise.all(
            target.subkeys.map((k) => qc.invalidateQueries({ queryKey: ["op", k] })),
          );
      await Promise.race([work, deadline]);
      setLastRefresh({ id: target.id, label: target.label, at: TIME_FMT.format(new Date()) });
      setJustDoneId(target.id);
      setTimeout(() => {
        setJustDoneId((current) => (current === target.id ? null : current));
      }, JUST_DONE_PULSE_MS);
    } finally {
      setRefreshingId(null);
    }
  };

  const sessionUser = me.data?.user || null;
  const opUser = opMe.data || null;

  const { openprojectUrl } = usePublicConfig();
  const opAccountHref = openprojectUrl ? `${openprojectUrl}/my/account` : null;

  const handleSignOut = async () => {
    qc.clear();
    await signOut({ callbackUrl: "/sign-in" });
  };

  // Wait for both the session probe and the OP profile fetch to settle so
  // login/language/timezone don't pop in after the rest of the card is
  // already on screen. opMe has retry: false, so an unauthenticated user
  // settles fast (errored) and the gate releases immediately.
  const { ready: pageReady } = useQueriesSettled(me, opMe);
  if (!pageReady) {
    return <CenterLoader label="Loading account…" />;
  }

  // Merge for display — session has the auth-time identity, opUser has
  // the richer profile fields. Either may be missing in degenerate states.
  const display = {
    ...(sessionUser || {}),
    ...(opUser || {}),
    name: opUser?.name || sessionUser?.name || "—",
    email: opUser?.email || sessionUser?.email || null,
    id: opUser?.id || sessionUser?.id || null,
  };

  return (
    <div className="min-h-screen bg-surface-app">
      {/* ── Slim header so the page doesn't feel orphaned. ─────────── */}
      <header className="bg-surface-elevated border-b border-border">
        <div className="max-w-3xl mx-auto flex items-center gap-3 px-3 sm:px-6 h-12">
          <Link
            href="/projects"
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-fg-muted hover:text-fg no-underline"
          >
            <Icon name="chev-down" size={13} className="rotate-90" aria-hidden="true" />
            Projects
          </Link>
          <span className="text-fg-faint">/</span>
          <span className="text-[13px] text-fg font-semibold">Account</span>
          <button
            type="button"
            onClick={handleSignOut}
            className="ml-auto inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-border bg-surface-elevated text-[12.5px] font-medium text-fg hover:bg-surface-subtle hover:border-border-strong"
          >
            <Icon name="x" size={12} aria-hidden="true" />
            Sign out
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-3 sm:px-6 py-6 sm:py-8">
        {/* ── Identity card ───────────────────────────────────────── */}
        <section className="bg-surface-elevated border border-border rounded-2xl p-6 mb-6 flex items-center gap-4">
          <div className="shrink-0">
            <Avatar user={display} size="xl" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-[22px] font-bold tracking-[-0.01em] text-fg m-0 truncate">
              {display.name}
            </h1>
            {display.email && (
              <div className="text-[13px] text-fg-subtle truncate">{display.email}</div>
            )}
            {opUser?.status && (
              <div className="inline-flex items-center gap-1.5 mt-2 px-2 h-5 rounded-full bg-status-todo-bg text-status-todo-fg text-[10px] font-bold uppercase tracking-wider">
                {opUser.status}
              </div>
            )}
          </div>
        </section>

        {/* ── Profile details ─────────────────────────────────────── */}
        <section className="bg-surface-elevated border border-border rounded-2xl p-6 mb-6">
          <header className="flex items-center justify-between mb-3">
            <h2 className="font-display text-[15px] font-bold text-fg m-0">Profile</h2>
            {opMe.isFetching && <LoadingPill label="loading" />}
          </header>
          <div>
            <div className={FIELD}>
              <span className={FIELD_LABEL}>Name</span>
              <span className={FIELD_VALUE}>{display.name}</span>
            </div>
            <div className={FIELD}>
              <span className={FIELD_LABEL}>Email</span>
              <span className={FIELD_VALUE}>{display.email || "—"}</span>
            </div>
            {opUser?.login && (
              <div className={FIELD}>
                <span className={FIELD_LABEL}>Login</span>
                <span className={`${FIELD_VALUE} font-mono text-[12.5px]`}>{opUser.login}</span>
              </div>
            )}
            {opUser?.language && (
              <div className={FIELD}>
                <span className={FIELD_LABEL}>Language</span>
                <span className={FIELD_VALUE}>{opUser.language}</span>
              </div>
            )}
            {opUser?.timezone && (
              <div className={FIELD}>
                <span className={FIELD_LABEL}>Timezone</span>
                <span className={FIELD_VALUE}>{opUser.timezone}</span>
              </div>
            )}
            {display.id && (
              <div className={FIELD}>
                <span className={FIELD_LABEL}>User ID</span>
                <span className={`${FIELD_VALUE} font-mono text-[12.5px]`}>{display.id}</span>
              </div>
            )}
          </div>
        </section>

        {/* ── Appearance ─────────────────────────────────────────── */}
        <section className="bg-surface-elevated border border-border rounded-2xl p-6 mb-6">
          <h2 className="font-display text-[15px] font-bold text-fg m-0 mb-1.5">
            Appearance
          </h2>
          <p className="text-[13px] text-fg-muted leading-relaxed m-0 mb-4">
            Pick a theme. High-contrast variants meet WCAG AAA contrast for body
            text. Your choice is saved to this device.
          </p>
          <ThemePicker />
        </section>

        {/* ── Working hours ───────────────────────────────────────── */}
        <section className="bg-surface-elevated border border-border rounded-2xl p-6">
          <h2 className="font-display text-[15px] font-bold text-fg m-0 mb-1.5">
            Working hours
          </h2>
          <p className="text-[13px] text-fg-muted leading-relaxed m-0 mb-4">
            Your weekly schedule and time off, as configured in OpenProject. PTO entries
            here can be used by sprint capacity calculations.
          </p>
          <WorkingHoursCard userId={sessionUser?.id || opMe.data?.id || null} />
        </section>

        <DataSourceCard />

        {/* ── Data refresh ────────────────────────────────────────── */}
        <section className="bg-surface-elevated border border-border rounded-2xl p-6 mb-6">
          <h2 className="font-display text-[15px] font-bold text-fg m-0 mb-1.5">
            Refresh data
          </h2>
          <p className="text-[13px] text-fg-muted leading-relaxed m-0 mb-4">
            Opira caches OpenProject responses so screens stay snappy. If something
            looks out of date, force a hard refresh — cached entries are marked stale
            and anything visible refetches immediately.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {REFRESH_TARGETS.map((target) => {
              const isBusy = refreshingId === target.id;
              const isPrimary = target.id === "all";
              const justDone = !isBusy && justDoneId === target.id;
              const base =
                "group inline-flex items-start gap-2.5 text-left rounded-lg border px-3 py-2.5 transition-colors disabled:opacity-60 disabled:cursor-not-allowed";
              const skin = isPrimary
                ? "bg-accent-50 border-accent-200 text-fg hover:bg-accent-100 hover:border-accent sm:col-span-2"
                : "bg-surface-subtle border-border text-fg hover:bg-surface-elevated hover:border-border-strong";
              return (
                <button
                  key={target.id}
                  type="button"
                  onClick={() => handleRefresh(target)}
                  disabled={Boolean(refreshingId) && !isBusy}
                  aria-busy={isBusy}
                  className={`${base} ${skin}`}
                >
                  <Icon
                    name="refresh"
                    size={14}
                    className={`mt-0.5 shrink-0 ${isBusy ? "animate-spin" : ""}`}
                    aria-hidden="true"
                  />
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-1.5 text-[13px] font-semibold leading-snug">
                      {target.label}
                      {justDone && (
                        <span className="text-[11px] font-medium text-status-done-fg">
                          Refreshed
                        </span>
                      )}
                      {isBusy && (
                        <span className="text-[11px] font-medium text-fg-muted">
                          Refreshing…
                        </span>
                      )}
                    </span>
                    <span className="block text-[12px] text-fg-muted leading-snug mt-0.5">
                      {target.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          {lastRefresh && (
            <p className="text-[12px] text-fg-muted mt-3 mb-0">
              Last refresh — <strong className="text-fg font-semibold">{lastRefresh.label}</strong>{" "}
              at {lastRefresh.at}.
            </p>
          )}
        </section>

        {/* ── Settings notice ─────────────────────────────────────── */}
        <section className="bg-surface-elevated border border-border rounded-2xl p-6">
          <h2 className="font-display text-[15px] font-bold text-fg m-0 mb-1.5">
            Manage account
          </h2>
          <p className="text-[13px] text-fg-muted leading-relaxed m-0 mb-4">
            Profile photo, name, password, language, timezone, and notification
            preferences are managed directly in OpenProject. Changes there sync
            back here automatically the next time the page loads.
          </p>
          {opAccountHref ? (
            <a
              href={opAccountHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md bg-accent text-on-accent text-[13px] font-semibold hover:bg-accent-600 no-underline"
            >
              Open account settings in OpenProject
              <Icon name="link" size={12} aria-hidden="true" />
            </a>
          ) : (
            <div className="rounded-lg border border-dashed border-border bg-surface-subtle px-4 py-3 text-[13px] text-fg-muted">
              <strong className="text-fg font-semibold">Not yet configured.</strong>{" "}
              Set <code className="font-mono text-[12px] px-1 py-px rounded bg-surface-elevated border border-border">OPENPROJECT_URL</code>{" "}
              in your environment to enable the deep link to OpenProject&apos;s account settings.
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
