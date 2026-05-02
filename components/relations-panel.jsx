"use client";

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { friendlyError } from "@/lib/api-client";
import { Icon } from "@/components/icons";
import { TaskStatusPill, TaskTypeIcon } from "@/components/ui/task-meta";
import { Menu } from "@/components/ui/menu";
import { LoadingPill } from "@/components/ui/loading-pill";
import { OUTGOING_RELATION_TYPES, RELATION_LABELS } from "@/lib/openproject/mappers";
import {
  useCreateRelation,
  useDeleteRelation,
  useRelations,
} from "@/lib/hooks/use-openproject-detail";

// Order verbs for stable sort. Outgoing first (the actions this WP performs),
// incoming after — within each side we keep the spec's natural ordering so
// "blocks" sits next to "blocked by", "precedes" next to "follows", etc.
const VERB_ORDER = [
  "blocks",
  "blocked",
  "precedes",
  "follows",
  "duplicates",
  "duplicated",
  "includes",
  "partof",
  "requires",
  "required",
  "relates",
];
const verbWeight = (v) => {
  const i = VERB_ORDER.indexOf(v);
  return i === -1 ? VERB_ORDER.length : i;
};

function VerbChip({ verb, label }) {
  // The verb is the relation's role — render as a flat lozenge so it reads
  // as metadata, not an action. Outgoing actions ("blocks", "precedes") get
  // a slightly stronger treatment than passive ones ("blocked by", "follows").
  const passive = verb?.endsWith("d") || verb === "follows" || verb === "partof";
  return (
    <span
      className={
        passive
          ? "inline-flex h-4.5 items-center px-1.5 rounded text-[11px] font-medium whitespace-nowrap bg-surface-muted text-fg-subtle"
          : "inline-flex h-4.5 items-center px-1.5 rounded text-[11px] font-medium whitespace-nowrap bg-accent-50 text-accent-700"
      }
    >
      {label}
    </span>
  );
}

export function RelationsPanel({
  wpId,
  selfTaskId,
  canEdit,
  allTasks = [],
  onTaskClick,
  onChange,
}) {
  const relationsQ = useRelations(wpId);
  const create = useCreateRelation(wpId);
  const remove = useDeleteRelation(wpId);

  const relations = useMemo(() => relationsQ.data || [], [relationsQ.data]);
  const sorted = useMemo(
    () =>
      [...relations].sort((a, b) => {
        const va = verbWeight(a.verb);
        const vb = verbWeight(b.verb);
        if (va !== vb) return va - vb;
        return String(a.otherTitle || "").localeCompare(String(b.otherTitle || ""));
      }),
    [relations],
  );

  // Inline add-row state. We never block the user behind a confirm button —
  // the WP pick *is* the commit, since nothing else is required.
  const [adding, setAdding] = useState(false);
  const [pendingType, setPendingType] = useState("relates");
  const typeBtnRef = useRef(null);
  const targetBtnRef = useRef(null);
  const [typeMenu, setTypeMenu] = useState(null);
  const [targetMenu, setTargetMenu] = useState(null);

  const relatedNativeIds = useMemo(
    () => new Set(relations.map((r) => String(r.otherId)).filter(Boolean)),
    [relations],
  );
  const targetItems = useMemo(() => {
    const list = (allTasks || []).filter(
      (t) =>
        t &&
        t.id !== selfTaskId &&
        t.nativeId != null &&
        !relatedNativeIds.has(String(t.nativeId)),
    );
    return list.map((t) => ({
      label: `${t.key} · ${t.title}`,
      value: String(t.nativeId),
    }));
  }, [allTasks, selfTaskId, relatedNativeIds]);

  const tasksByNative = useMemo(() => {
    const m = new Map();
    for (const t of allTasks || []) {
      if (t?.nativeId != null) m.set(String(t.nativeId), t);
    }
    return m;
  }, [allTasks]);

  const startAdd = () => {
    setAdding(true);
    setPendingType("relates");
    // Pop the WP picker straight away so the user lands directly on the
    // step that requires the most thought; type is pre-set to "relates"
    // (the safe, weakest relation) and is one click away if they want to
    // change it.
    setTimeout(() => {
      const r = targetBtnRef.current?.getBoundingClientRect();
      if (r) setTargetMenu(r);
    }, 0);
  };

  const cancelAdd = () => {
    setAdding(false);
    setTypeMenu(null);
    setTargetMenu(null);
  };

  const onPickTarget = async (toId) => {
    setTargetMenu(null);
    if (!toId) {
      cancelAdd();
      return;
    }
    try {
      await create.mutateAsync({ type: pendingType, toId });
      onChange?.("Relation added");
      cancelAdd();
    } catch (e) {
      toast.error(friendlyError(e, "Couldn't add the relation."));
    }
  };

  const onDelete = async (rel) => {
    try {
      await remove.mutateAsync(rel.id);
      onChange?.("Relation removed");
    } catch (e) {
      toast.error(friendlyError(e, "Couldn't remove the relation."));
    }
  };

  return (
    <section>
      <header className="flex items-center justify-between gap-2 mb-2">
        <span className="inline-flex items-center gap-2 text-[13px] font-semibold text-fg">
          <Icon name="link" size={14} aria-hidden="true" />
          Relations
          {relations.length > 0 && (
            <span className="text-fg-subtle font-medium text-xs">
              {relations.length}
            </span>
          )}
        </span>
        {canEdit && !adding && (
          <button
            type="button"
            onClick={startAdd}
            aria-label="Add relation"
            className="inline-flex items-center gap-1.5 h-6.5 px-2.5 rounded-md text-xs font-medium text-fg-muted hover:bg-surface-subtle hover:text-fg cursor-pointer"
          >
            <Icon name="plus" size={12} aria-hidden="true" /> Add link
          </button>
        )}
      </header>

      <div className="flex flex-col gap-px">
        {relationsQ.isLoading ? (
          <LoadingPill label="loading relations" />
        ) : sorted.length === 0 && !adding ? (
          <div className="text-[13px] text-fg-subtle py-2">
            No linked work packages.
          </div>
        ) : (
          sorted.map((r) => {
            const local = r.otherId ? tasksByNative.get(String(r.otherId)) : null;
            const titleText = local?.title || r.otherTitle;
            const keyText = local?.key || (r.otherId ? `#${r.otherId}` : "—");
            const clickable = !!(local && onTaskClick);
            return (
              <div
                key={r.id}
                className="flex items-center gap-2 -mx-2 px-2 py-1 rounded-md hover:bg-surface-subtle transition-colors"
              >
                <span className="w-22 shrink-0">
                  <VerbChip verb={r.verb} label={r.label} />
                </span>
                <span className="grid place-items-center text-fg-subtle shrink-0">
                  <TaskTypeIcon task={local} size={12} />
                </span>
                <button
                  type="button"
                  className="bg-transparent border-0 p-0 text-[12px] font-mono text-fg-subtle cursor-pointer hover:text-accent hover:underline disabled:cursor-default disabled:hover:no-underline disabled:hover:text-fg-subtle shrink-0"
                  disabled={!clickable}
                  onClick={() => clickable && onTaskClick(local.id)}
                >
                  {keyText}
                </button>
                <button
                  type="button"
                  className="flex-1 min-w-0 text-left bg-transparent border-0 p-0 text-[13px] text-fg truncate cursor-pointer hover:text-accent hover:underline disabled:cursor-default disabled:hover:no-underline disabled:hover:text-fg"
                  disabled={!clickable}
                  onClick={() => clickable && onTaskClick(local.id)}
                  title={titleText}
                >
                  {titleText}
                </button>
                {local && (
                  <span className="shrink-0">
                    <TaskStatusPill task={local} />
                  </span>
                )}
                {r.permissions?.delete ? (
                  <button
                    type="button"
                    onClick={() => onDelete(r)}
                    aria-label="Remove relation"
                    title="Remove relation"
                    className="grid place-items-center w-6 h-6 rounded-md text-fg-subtle hover:bg-surface-muted hover:text-fg cursor-pointer shrink-0"
                  >
                    <Icon name="x" size={12} aria-hidden="true" />
                  </button>
                ) : (
                  <span className="w-6 shrink-0" />
                )}
              </div>
            );
          })
        )}

        {adding && (
          <div className="flex items-center gap-2 -mx-2 px-2 py-1 rounded-md bg-surface-subtle">
            <button
              ref={typeBtnRef}
              type="button"
              onClick={() => {
                const r = typeBtnRef.current?.getBoundingClientRect();
                if (r) setTypeMenu(r);
              }}
              className="inline-flex items-center gap-1 h-6 px-2 rounded text-[11px] font-medium whitespace-nowrap bg-accent-50 text-accent-700 hover:bg-accent-100 cursor-pointer w-22 justify-between"
            >
              <span className="truncate">{RELATION_LABELS[pendingType] || pendingType}</span>
              <Icon name="chev-down" size={11} aria-hidden="true" />
            </button>

            <button
              ref={targetBtnRef}
              type="button"
              onClick={() => {
                const r = targetBtnRef.current?.getBoundingClientRect();
                if (r) setTargetMenu(r);
              }}
              className="flex-1 min-w-0 inline-flex items-center justify-between gap-2 h-6 px-2 rounded border border-border bg-surface-elevated text-[13px] text-fg-faint hover:border-border-strong cursor-pointer"
              disabled={create.isPending}
            >
              <span className="truncate">
                {create.isPending ? "Adding…" : "Search work packages…"}
              </span>
              <Icon name="search" size={12} aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={cancelAdd}
              aria-label="Cancel"
              className="grid place-items-center w-6 h-6 rounded-md text-fg-subtle hover:bg-surface-muted hover:text-fg cursor-pointer shrink-0"
            >
              <Icon name="x" size={12} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      {typeMenu && (
        <Menu
          anchorRect={typeMenu}
          onClose={() => setTypeMenu(null)}
          onSelect={(it) => setPendingType(it.value)}
          width={180}
          maxHeight={280}
          items={OUTGOING_RELATION_TYPES.map((t) => ({
            label: RELATION_LABELS[t] || t,
            value: t,
            active: t === pendingType,
          }))}
        />
      )}

      {targetMenu && (
        <Menu
          anchorRect={targetMenu}
          onClose={() => setTargetMenu(null)}
          onSelect={(it) => onPickTarget(it.value)}
          width={360}
          maxHeight={300}
          searchable
          searchPlaceholder="Search work packages…"
          items={
            targetItems.length > 0
              ? targetItems
              : [{ label: "No matching work packages", value: null, disabled: true }]
          }
        />
      )}
    </section>
  );
}
