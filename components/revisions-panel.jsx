"use client";

import { format, parseISO } from "date-fns";
import { Avatar } from "@/components/ui/avatar";
import { Icon } from "@/components/icons";
import { LoadingPill } from "@/components/ui/loading-pill";
import { useWpRevisions } from "@/lib/hooks/use-openproject-detail";
import { PEOPLE } from "@/lib/data";

// Truncate the commit message to its first line for the row preview;
// OP returns the full multi-paragraph message, but a Jira-style row reads
// best with a single line.
function firstLine(s) {
  if (!s) return "";
  const i = s.indexOf("\n");
  return i === -1 ? s : s.slice(0, i);
}

export function RevisionsPanel({ wpId }) {
  const q = useWpRevisions(wpId);

  if (q.isLoading) return <LoadingPill label="loading commits" />;
  const revs = q.data || [];
  if (revs.length === 0) {
    // wpId may arrive as "wp-1234" (prefixed) or just "1234" depending on
    // the caller — strip the prefix for the hint so the suggested commit
    // syntax matches what OP actually parses.
    const idForHint = String(wpId || "").replace(/^wp-/, "");
    return (
      <div className="text-[12px] text-fg-subtle py-1.5">
        No commits. Reference{" "}
        <code className="font-mono text-[11px] px-1 py-px rounded bg-surface-subtle">
          fixes #{idForHint}
        </code>{" "}
        in a commit to link it.
      </div>
    );
  }

  return (
    <ul className="grid gap-1.5">
      {revs.map((r) => {
        const author = r.authorId ? PEOPLE[r.authorId] : null;
        return (
          <li
            key={r.id}
            className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-start gap-2 px-2.5 py-2 rounded-md bg-surface-subtle border border-border-soft"
          >
            {author ? (
              <Avatar user={author} size="sm" />
            ) : (
              <Icon name="grip" size={14} className="text-fg-subtle mt-1" aria-hidden="true" />
            )}
            <div className="min-w-0">
              <div className="text-[12.5px] text-fg truncate" title={r.message}>
                {firstLine(r.message) || "(no message)"}
              </div>
              <div className="text-[11px] text-fg-subtle truncate">
                {r.shortId ? (
                  <code className="font-mono text-[11px] mr-1.5 text-fg-muted">
                    {r.shortId}
                  </code>
                ) : null}
                {r.authorName ? `${r.authorName} · ` : ""}
                {r.createdAt ? format(parseISO(r.createdAt), "MMM d, yyyy") : ""}
              </div>
            </div>
            {r.showHref ? (
              <a
                href={r.showHref}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="View commit in OpenProject"
                className="grid place-items-center w-7 h-7 rounded text-fg-subtle hover:bg-surface-elevated hover:text-fg cursor-pointer no-underline"
                title="View diff in OpenProject"
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
