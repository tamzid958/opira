"use client";

import { format, parseISO } from "date-fns";
import { Icon } from "@/components/icons";
import { LoadingPill } from "@/components/ui/loading-pill";
import { useWpGithubPullRequests } from "@/lib/hooks/use-openproject-detail";

const STATE_STYLES = {
  open: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  draft: "bg-fg-subtle/10 text-fg-subtle border-border",
  merged: "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20",
  closed: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
};

const CHECKS_DOT = {
  success: "bg-emerald-500",
  failure: "bg-rose-500",
  pending: "bg-amber-400",
  neutral: "bg-fg-subtle",
};

const CHECKS_LABEL = {
  success: "Checks passed",
  failure: "Checks failed",
  pending: "Checks running",
  neutral: "Checks completed",
};

export function GithubPanel({ wpId }) {
  const q = useWpGithubPullRequests(wpId);

  if (q.isLoading) return <LoadingPill label="loading pull requests" />;

  const prs = q.data || [];
  if (prs.length === 0) {
    const idForHint = String(wpId || "").replace(/^wp-/, "");
    return (
      <div className="text-[12px] text-fg-subtle py-1.5">
        No pull requests. Reference{" "}
        <code className="font-mono text-[11px] px-1 py-px rounded bg-surface-subtle">
          OP#{idForHint}
        </code>{" "}
        in a PR to link it.
      </div>
    );
  }

  return (
    <ul className="grid gap-1.5">
      {prs.map((pr) => {
        const pillClass = STATE_STYLES[pr.displayState] || STATE_STYLES.closed;
        const checks = pr.checksStatus;
        return (
          <li
            key={pr.id}
            className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2 px-2.5 py-2 rounded-md bg-surface-subtle border border-border-soft"
          >
            <span
              className={`text-[10.5px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border ${pillClass}`}
              title={`PR is ${pr.displayState}`}
            >
              {pr.displayState}
            </span>
            <div className="min-w-0">
              <a
                href={pr.htmlUrl || undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-[12.5px] text-fg truncate hover:underline no-underline"
                title={pr.title}
              >
                {pr.title || "(no title)"}
              </a>
              <div className="text-[11px] text-fg-subtle truncate flex items-center gap-1.5">
                {pr.repositoryFullName ? (
                  <code className="font-mono text-[11px] text-fg-muted">
                    {pr.repositoryFullName}
                    {pr.number ? `#${pr.number}` : ""}
                  </code>
                ) : pr.number ? (
                  <code className="font-mono text-[11px] text-fg-muted">#{pr.number}</code>
                ) : null}
                {pr.authorLogin ? (
                  <span className="truncate">· {pr.authorLogin}</span>
                ) : null}
                {pr.githubUpdatedAt ? (
                  <span className="truncate">
                    · {format(parseISO(pr.githubUpdatedAt), "MMM d, yyyy")}
                  </span>
                ) : null}
                {checks ? (
                  <span
                    className="inline-flex items-center gap-1 ml-auto pl-1.5 shrink-0"
                    title={CHECKS_LABEL[checks] || "Checks"}
                  >
                    <span
                      aria-hidden="true"
                      className={`inline-block w-1.5 h-1.5 rounded-full ${CHECKS_DOT[checks]}`}
                    />
                  </span>
                ) : null}
              </div>
            </div>
            {pr.htmlUrl ? (
              <a
                href={pr.htmlUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Open pull request on GitHub"
                title="Open on GitHub"
                className="grid place-items-center w-7 h-7 rounded text-fg-subtle hover:bg-surface-elevated hover:text-fg cursor-pointer no-underline"
              >
                <Icon name="link" size={12} aria-hidden="true" />
              </a>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
