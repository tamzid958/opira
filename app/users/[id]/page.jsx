"use client";

import Link from "next/link";
import { use } from "react";
import { Avatar } from "@/components/ui/avatar";
import { CenterLoader, CenterError } from "@/components/ui/center-status";
import { Icon } from "@/components/icons";
import { useUser } from "@/lib/hooks/use-openproject";
import { friendlyError } from "@/lib/api-client";

// Profile page that `<mention>` links resolve to. OpenProject serialises
// mentions as `<a href="/users/<id>">@Name</a>` in stored comment HTML;
// without this route Next.js 404s on the relative URL. We render an
// in-app, read-only identity card — full profile editing stays in OP.

const FIELD =
  "flex items-baseline gap-3 py-2.5 border-b border-border-soft last:border-b-0";
const FIELD_LABEL =
  "w-32 shrink-0 text-[12px] font-medium text-fg-muted uppercase tracking-wider";
const FIELD_VALUE = "flex-1 text-[13.5px] text-fg leading-relaxed min-w-0 break-words";

export default function UserProfilePage({ params }) {
  const { id } = use(params);
  const userQ = useUser(id);

  if (userQ.isLoading) return <CenterLoader label="Loading user…" />;
  if (userQ.isError) {
    return (
      <CenterError
        title="Couldn't load this user"
        message={friendlyError(userQ.error, "OpenProject didn't return a user record.")}
      />
    );
  }
  const u = userQ.data;
  if (!u) {
    return (
      <CenterError
        title="User not found"
        message={`No user record exists for id ${id}.`}
      />
    );
  }

  const opUrl = process.env.NEXT_PUBLIC_OPENPROJECT_URL || "";
  const opProfileHref = opUrl ? `${opUrl}/users/${u.id}` : null;

  return (
    <div className="min-h-screen bg-surface-app">
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
          <span className="text-[13px] text-fg font-semibold truncate">{u.name}</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-3 sm:px-6 py-6 sm:py-8">
        <section className="bg-surface-elevated border border-border rounded-2xl p-6 mb-6 flex items-center gap-4">
          <div className="shrink-0">
            <Avatar user={u} size="xl" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-[22px] font-bold tracking-[-0.01em] text-fg m-0 truncate">
              {u.name}
            </h1>
            {u.email && (
              <div className="text-[13px] text-fg-subtle truncate">{u.email}</div>
            )}
            {u.status && (
              <div className="inline-flex items-center gap-1.5 mt-2 px-2 h-5 rounded-full bg-status-todo-bg text-status-todo-fg text-[10px] font-bold uppercase tracking-wider">
                {u.status}
              </div>
            )}
          </div>
        </section>

        <section className="bg-surface-elevated border border-border rounded-2xl p-6 mb-6">
          <header className="flex items-center justify-between mb-3">
            <h2 className="font-display text-[15px] font-bold text-fg m-0">Profile</h2>
            {opProfileHref && (
              <a
                href={opProfileHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-border bg-surface-elevated text-[12px] font-medium text-fg hover:bg-surface-subtle hover:border-border-strong"
              >
                Open in OpenProject
                <Icon name="link" size={11} aria-hidden="true" />
              </a>
            )}
          </header>
          <div>
            <div className={FIELD}>
              <span className={FIELD_LABEL}>Name</span>
              <span className={FIELD_VALUE}>{u.name}</span>
            </div>
            {u.login && (
              <div className={FIELD}>
                <span className={FIELD_LABEL}>Login</span>
                <span className={FIELD_VALUE}>{u.login}</span>
              </div>
            )}
            {u.email && (
              <div className={FIELD}>
                <span className={FIELD_LABEL}>Email</span>
                <span className={FIELD_VALUE}>
                  <a href={`mailto:${u.email}`} className="op-uc-link">
                    {u.email}
                  </a>
                </span>
              </div>
            )}
            {u.status && (
              <div className={FIELD}>
                <span className={FIELD_LABEL}>Status</span>
                <span className={FIELD_VALUE}>{u.status}</span>
              </div>
            )}
            {u.language && (
              <div className={FIELD}>
                <span className={FIELD_LABEL}>Language</span>
                <span className={FIELD_VALUE}>{u.language}</span>
              </div>
            )}
            {u.createdAt && (
              <div className={FIELD}>
                <span className={FIELD_LABEL}>Joined</span>
                <span className={FIELD_VALUE}>
                  {new Date(u.createdAt).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
