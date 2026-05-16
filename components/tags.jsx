"use client";

import { useState } from "react";
import { Tag as TagLucide } from "lucide-react";
import { TagPill } from "@/components/ui/tag-pill";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingPill } from "@/components/ui/loading-pill";
import { Icon } from "@/components/icons";
import { useApiStatus } from "@/lib/hooks/use-openproject";
import {
  useAvailableAssignees,
  useCategories,
} from "@/lib/hooks/use-openproject-detail";
import { friendlyError } from "@/lib/api-client";
import { findById } from "@/lib/utils";

const SORTS = [
  { id: "usage", label: "Most used" },
  { id: "name", label: "A→Z" },
  { id: "unused", label: "Unused" },
];

// Per-tag bar collapses to two segments — open vs closed — driven entirely
// by `task.statusIsClosed`. No keyword classification of intermediate states.
function statusCounts(tasks) {
  let open = 0;
  let closed = 0;
  for (const t of tasks) {
    if (t.statusIsClosed) closed += 1;
    else open += 1;
  }
  return { open, closed };
}

function StatusBar({ counts, total }) {
  if (total === 0) {
    return (
      <div className="h-1 rounded-full bg-surface-muted" />
    );
  }
  const openPct = (counts.open / total) * 100;
  const closedPct = (counts.closed / total) * 100;
  return (
    <div className="flex h-1 rounded-full overflow-hidden bg-surface-muted">
      {counts.open > 0 && (
        <span
          title={`Open: ${counts.open}`}
          className="h-full bg-status-todo-bg"
          style={{ width: `${openPct}%` }}
        />
      )}
      {counts.closed > 0 && (
        <span
          title={`Closed: ${counts.closed}`}
          className="h-full bg-status-done"
          style={{ width: `${closedPct}%` }}
        />
      )}
    </div>
  );
}

function TagCard({ tag, assignee, onFilter }) {
  const interactive = tag.count > 0 && !!onFilter;
  const Wrapper = interactive ? "button" : "div";
  const wrapperProps = interactive
    ? {
        type: "button",
        onClick: () => onFilter(tag.name),
        title: `Filter Backlog by ${tag.name}`,
      }
    : {};
  const doneCount = tag.counts.closed || 0;
  const donePct = tag.count > 0 ? Math.round((doneCount / tag.count) * 100) : 0;
  return (
    <Wrapper
      {...wrapperProps}
      className={`group relative flex flex-col text-left rounded-lg border border-border bg-surface-elevated p-3 transition-all ${
        interactive
          ? "cursor-pointer hover:border-accent-300 hover:shadow-sm hover:-translate-y-px"
          : ""
      }`}
    >
      {/* Header — pill + count */}
      <div className="flex items-start justify-between gap-2 min-w-0">
        <div className="min-w-0 flex-1">
          <TagPill name={tag.name} />
        </div>
        <div className="text-right shrink-0">
          <div className="font-display text-lg font-semibold text-fg leading-none tabular-nums">
            {tag.count}
          </div>
          <div className="text-[10px] text-fg-faint mt-0.5 uppercase tracking-wider">
            {tag.count === 1 ? "issue" : "issues"}
          </div>
        </div>
      </div>

      {/* Status bar + done % */}
      <div className="mt-3">
        <StatusBar counts={tag.counts} total={tag.count} />
        <div className="mt-1.5 flex items-center justify-between text-[10.5px] text-fg-subtle">
          {tag.count > 0 ? (
            <>
              <span className="tabular-nums">
                {doneCount}/{tag.count} done
              </span>
              <span className="tabular-nums text-fg-faint">{donePct}%</span>
            </>
          ) : (
            <span className="text-fg-faint">No issues</span>
          )}
        </div>
      </div>

      {/* Footer — assignee + filter affordance */}
      {(assignee || interactive) && (
        <div className="mt-2.5 pt-2.5 border-t border-border-soft flex items-center justify-between gap-2 min-w-0">
          {assignee ? (
            <span
              className="inline-flex items-center gap-1.5 text-[11px] text-fg-subtle min-w-0"
              title={`Default assignee: ${assignee.name}`}
            >
              <Avatar user={assignee} size="sm" />
              <span className="truncate">{assignee.name}</span>
            </span>
          ) : (
            <span className="text-[11px] text-fg-faint">No default assignee</span>
          )}
          {interactive && (
            <span className="shrink-0 inline-flex items-center gap-1 text-[11px] font-medium text-fg-faint group-hover:text-accent transition-colors">
              <Icon name="filter" size={11} aria-hidden="true" />
              Filter
            </span>
          )}
        </div>
      )}
    </Wrapper>
  );
}

export function Tags({ projectId, projectName, tasks, onFilter }) {
  const categoriesQ = useCategories(projectId);
  const assigneesQ = useAvailableAssignees(projectId);
  const status = useApiStatus();

  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("usage");

  const tagsWithCounts = (() => {
    const cats = categoriesQ.data || [];
    const enriched = cats.map((c) => {
      const used = tasks.filter((t) => (t.labels || []).includes(c.name));
      return { ...c, count: used.length, tasks: used, counts: statusCounts(used) };
    });
    const filtered = query.trim()
      ? enriched.filter((c) =>
          c.name.toLowerCase().includes(query.trim().toLowerCase()),
        )
      : enriched;
    return filtered.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "unused") {
        if (a.count !== b.count) return a.count - b.count;
        return a.name.localeCompare(b.name);
      }
      return b.count - a.count || a.name.localeCompare(b.name);
    });
  })();

  const totalUsage = tagsWithCounts.reduce((s, t) => s + t.count, 0);
  const unusedCount = tagsWithCounts.filter((t) => t.count === 0).length;

  const opLink = (() => {
    const base = status.data?.baseUrl;
    if (!base || !projectId) return null;
    return `${base}/projects/${encodeURIComponent(projectId)}/settings/categories`;
  })();

  const lookupAssignee = (cat) => {
    if (!cat.defaultAssignee) return null;
    return (
      findById(assigneesQ.data, cat.defaultAssignee) ||
      (cat.defaultAssigneeName
        ? { id: cat.defaultAssignee, name: cat.defaultAssigneeName }
        : null)
    );
  };

  return (
    <div className="max-w-6xl mx-auto">
      {/* Toolbar */}
      <div className="touch-toolbar flex items-center gap-2 mb-3">
        <div className="relative">
          <Icon
            name="search"
            size={12}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-faint pointer-events-none"
            aria-hidden="true"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tags…"
            className="w-[min(16rem,56vw)] sm:w-64 h-8 pl-7 pr-2 rounded-md border border-border bg-surface-elevated text-[12.5px] text-fg outline-none transition-colors focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-100)]"
          />
        </div>
        <div className="inline-flex rounded-md border border-border bg-surface-elevated p-0.5">
          {SORTS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setSort(opt.id)}
              className={`inline-flex items-center h-7 px-2.5 rounded text-[11.5px] font-medium cursor-pointer transition-colors ${
                sort === opt.id
                  ? "bg-accent-50 text-accent-700"
                  : "text-fg-muted hover:text-fg"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="hidden sm:flex items-center gap-2 text-[11.5px] text-fg-subtle">
          <span>
            <span className="font-mono tabular-nums">{tagsWithCounts.length}</span>{" "}
            {tagsWithCounts.length === 1 ? "tag" : "tags"}
          </span>
          {totalUsage > 0 && (
            <>
              <span className="text-border-strong">·</span>
              <span>
                <span className="font-mono tabular-nums">{totalUsage}</span> usage
                {totalUsage === 1 ? "" : "s"}
              </span>
            </>
          )}
          {unusedCount > 0 && (
            <>
              <span className="text-border-strong">·</span>
              <span className="text-fg-faint">
                <span className="font-mono tabular-nums">{unusedCount}</span> unused
              </span>
            </>
          )}
          {projectName && (
            <>
              <span className="text-border-strong">·</span>
              <span className="text-fg-faint truncate max-w-48">{projectName}</span>
            </>
          )}
        </div>
        {opLink && (
          <a
            href={opLink}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto shrink-0 inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-border bg-surface-elevated text-[11.5px] font-medium text-fg-muted hover:bg-surface-subtle hover:text-fg hover:border-border-strong"
            title="Manage categories in OpenProject"
          >
            <Icon name="settings" size={12} aria-hidden="true" />
            Manage
          </a>
        )}
      </div>

      {/* Body */}
      {categoriesQ.isLoading ? (
        <div className="grid place-items-center py-16">
          <LoadingPill label="loading tags" />
        </div>
      ) : categoriesQ.error ? (
        <div className="rounded-lg border border-border bg-surface-elevated px-4 py-5 text-[13px] text-pri-highest">
          {friendlyError(categoriesQ.error, "Couldn't load tags.")}
        </div>
      ) : tagsWithCounts.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface-elevated px-4 py-10">
          <EmptyState
            icon={TagLucide}
            title={query ? "No tags match your search" : "No tags yet"}
            body={
              query
                ? "Try a different search term."
                : "Create categories in OpenProject's project settings — they'll show up here automatically."
            }
            action={
              !query && opLink
                ? {
                    label: "Open in OpenProject",
                    onClick: () => window.open(opLink, "_blank", "noopener"),
                  }
                : null
            }
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
          {tagsWithCounts.map((tag) => (
            <TagCard
              key={tag.id}
              tag={tag}
              assignee={lookupAssignee(tag)}
              onFilter={onFilter}
            />
          ))}
        </div>
      )}
    </div>
  );
}
