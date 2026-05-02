"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Icon } from "@/components/icons";
import { TaskTypeIcon } from "@/components/ui/task-meta";
import { useSearch } from "@/lib/hooks/use-openproject-detail";
import { cn } from "@/lib/utils";

export function CommandPalette({ open, onClose, onOpenWp, onSwitchProject }) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [prevOpen, setPrevOpen] = useState(open);
  const search = useSearch(q, open);
  const inputRef = useRef(null);

  // Reset query/active when transitioning closed → open or open → closed.
  // Render-time setState is the React 19 idiom for resetting state on a
  // prop change without an extra commit.
  if (prevOpen !== open) {
    setPrevOpen(open);
    setQ("");
    setActive(0);
  }

  useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(id);
  }, [open]);

  const items = useMemo(() => {
    const d = search.data || {};
    const all = [];
    (d.projects || []).forEach((p) =>
      all.push({
        kind: "project",
        id: p.id,
        label: p.name,
        sub: `${p.key} · project`,
        project: p,
      }),
    );
    (d.workPackages || []).forEach((wp) =>
      all.push({
        kind: "wp",
        id: wp.id,
        label: wp.title,
        sub: `${wp.key} · ${wp.statusName || wp.status}`,
        wp,
      }),
    );
    (d.users || []).forEach((u) =>
      all.push({ kind: "user", id: u.id, label: u.name, sub: "person", user: u }),
    );
    return all;
  }, [search.data]);

  // Reset highlighted row whenever the query or result count changes.
  const [prevKey, setPrevKey] = useState(`${q}|${items.length}`);
  const key = `${q}|${items.length}`;
  if (prevKey !== key) {
    setPrevKey(key);
    setActive(0);
  }

  if (!open) return null;

  const handleSelect = (it) => {
    onClose();
    if (it.kind === "wp") onOpenWp?.(it.id);
    else if (it.kind === "project") onSwitchProject?.(it.project.id);
  };

  const handleKey = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(items.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const it = items[active];
      if (it) handleSelect(it);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  let lastSection = null;

  return (
    <div
      className="fixed inset-0 z-100 grid place-items-start justify-items-center pt-12 sm:pt-24 px-3 sm:px-4 scrim animate-fade-in"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="bg-surface-elevated rounded-xl shadow-xl w-full max-w-xl flex flex-col max-h-[80vh] sm:max-h-[60vh] animate-slide-up"
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border-soft">
          <Icon name="search" size={16} className="text-fg-subtle" aria-hidden="true" />
          <input
            ref={inputRef}
            placeholder="Search projects, work packages, people…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={handleKey}
            className="flex-1 bg-transparent border-0 outline-none text-[14px] text-fg placeholder:text-fg-faint"
          />
          <span className="px-1.5 py-0.5 rounded border border-border bg-surface-app text-[10px] font-mono text-fg-subtle">
            Esc
          </span>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {q.length < 2 && (
            <div className="text-center py-6 text-[13px] text-fg-subtle">
              Type at least 2 characters to search.
            </div>
          )}
          {q.length >= 2 && search.isLoading && (
            <div className="text-center py-6 text-[13px] text-fg-subtle">Searching…</div>
          )}
          {q.length >= 2 && !search.isLoading && items.length === 0 && (
            <div className="text-center py-6 text-[13px] text-fg-subtle">No matches.</div>
          )}
          {items.map((it, i) => {
            const showHeader = lastSection !== it.kind;
            lastSection = it.kind;
            return (
              <div key={`${it.kind}-${it.id}`}>
                {showHeader && (
                  <div className="px-2 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">
                    {it.kind === "project"
                      ? "Projects"
                      : it.kind === "wp"
                      ? "Work packages"
                      : "People"}
                  </div>
                )}
                <div
                  className={cn(
                    "flex items-center gap-2.5 px-3 py-2 rounded-md cursor-pointer transition-colors",
                    i === active ? "bg-accent-50" : "hover:bg-surface-subtle",
                  )}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => handleSelect(it)}
                >
                  {it.kind === "project" && (
                    <span
                      className="px-1.5 py-0.5 rounded text-white font-mono text-[10px] font-bold shrink-0"
                      style={{ background: it.project.color }}
                    >
                      {it.project.key}
                    </span>
                  )}
                  {it.kind === "wp" && <TaskTypeIcon task={it.wp} size={14} />}
                  {it.kind === "user" && <Avatar user={it.user} size="sm" />}
                  <span className="flex-1 min-w-0 truncate text-[13px] text-fg">{it.label}</span>
                  <span className="text-xs text-fg-subtle truncate max-w-44">{it.sub}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
