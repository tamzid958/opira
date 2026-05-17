"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon, TypeIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

const MIN_CHARS = 2;

// Async parent-WP picker with debounced search.
// Props:
//   triggerClassName  — CSS class(es) for the trigger element
//   value             — current parent id (string | null)
//   valueName         — display name for the current value
//   projectId         — scopes search to this project
//   excludeId         — WP id to exclude (the task itself)
//   disabled          — read-only mode
//   onChange(id, name)— called with (null, null) when cleared
//   children          — trigger content; receives { displayName, isEmpty }
export function ParentPicker({
  triggerClassName,
  value,
  valueName,
  projectId,
  excludeId,
  disabled,
  onChange,
  children,
  initialAnchorRect,
}) {
  const [open, setOpen] = useState(initialAnchorRect ?? null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);
  const inputRef = useRef(null);

  const search = useCallback(
    (q) => {
      clearTimeout(debounceRef.current);
      if (q.trim().length < MIN_CHARS) {
        setResults([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      debounceRef.current = setTimeout(async () => {
        try {
          const params = new URLSearchParams({ q: q.trim() });
          if (projectId) params.set("project", projectId);
          if (excludeId) params.set("exclude", String(excludeId));
          const res = await fetch(`/api/openproject/tasks/parent-search?${params}`);
          const data = await res.json();
          setResults(Array.isArray(data) ? data : []);
        } catch {
          setResults([]);
        } finally {
          setLoading(false);
        }
      }, 300);
    },
    [projectId, excludeId],
  );

  useEffect(() => () => clearTimeout(debounceRef.current), []);

  const displayName = valueName || (value ? `#${value}` : null);
  const isEmpty = !value;

  const openPicker = (anchorRect) => {
    setQuery("");
    setResults([]);
    setOpen(anchorRect);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  return (
    <>
      <div
        className={triggerClassName}
        onClick={(e) => {
          if (disabled) return;
          openPicker(e.currentTarget.getBoundingClientRect());
        }}
        title={disabled ? "You don't have permission to do that." : undefined}
        aria-disabled={disabled || undefined}
      >
        {children ? children({ displayName, isEmpty }) : (
          displayName
            ? <span className="truncate">{displayName}</span>
            : <span className="text-fg-faint">None</span>
        )}
      </div>

      {open && !disabled && typeof window !== "undefined" && (() => {
        const MARGIN = 8;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const width = 280;
        let left = open.left;
        if (left + width > vw - MARGIN) left = Math.max(MARGIN, vw - width - MARGIN);
        const below = vh - open.bottom - MARGIN;
        const above = open.top - MARGIN;
        const style = { position: "fixed", width, left, zIndex: 200 };
        if (below >= 200 || below >= above) {
          style.top = open.bottom + 4;
          style.maxHeight = Math.min(320, Math.max(160, below - 4));
        } else {
          style.bottom = vh - open.top + 4;
          style.maxHeight = Math.min(320, Math.max(160, above - 4));
        }
        return (
          <ParentPickerDropdown
            style={style}
            query={query}
            results={results}
            loading={loading}
            inputRef={inputRef}
            value={value}
            onQueryChange={(q) => { setQuery(q); search(q); }}
            onSelect={(id, name) => { onChange(id, name); setOpen(null); }}
            onClear={() => { onChange(null, null); setOpen(null); }}
            onClose={() => setOpen(null)}
          />
        );
      })()}
    </>
  );
}

function ParentPickerDropdown({
  style,
  query,
  results,
  loading,
  inputRef,
  value,
  onQueryChange,
  onSelect,
  onClear,
  onClose,
}) {
  const ref = useRef(null);

  useEffect(() => {
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    const t = setTimeout(() => document.addEventListener("mousedown", onDoc), 0);
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const trimmed = query.trim();

  return createPortal(
    <div
      ref={ref}
      style={style}
      className="bg-surface-elevated border border-border rounded-lg shadow-lg animate-pop flex flex-col overflow-hidden"
    >
      <div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-border-soft shrink-0">
        <Icon name="search" size={13} className="text-fg-subtle" aria-hidden="true" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search parent…"
          className="flex-1 bg-transparent border-0 outline-none text-[13px] text-fg placeholder:text-fg-faint min-w-0"
        />
        {loading && (
          <span className="w-3.5 h-3.5 rounded-full border-2 border-accent border-t-transparent animate-spin shrink-0" />
        )}
        {query && !loading && (
          <button
            type="button"
            onClick={() => onQueryChange("")}
            className="text-fg-subtle hover:text-fg shrink-0"
            aria-label="Clear"
          >
            <Icon name="x" size={12} aria-hidden="true" />
          </button>
        )}
      </div>
      <div className="p-1 overflow-y-auto flex-1">
        {value && (
          <div
            className="flex items-center gap-2 px-2.5 py-1.5 rounded text-[13px] cursor-pointer text-fg-subtle hover:bg-surface-subtle transition-colors"
            onClick={onClear}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <Icon name="x" size={12} aria-hidden="true" />
            <span>Remove parent</span>
          </div>
        )}
        {trimmed.length < MIN_CHARS && (
          <div className="px-2.5 py-3 text-[12px] text-fg-subtle text-center">
            {trimmed.length === 0
              ? `Type at least ${MIN_CHARS} characters to search`
              : `Type ${MIN_CHARS - trimmed.length} more character${MIN_CHARS - trimmed.length === 1 ? "" : "s"}…`}
          </div>
        )}
        {trimmed.length >= MIN_CHARS && !loading && results.length === 0 && (
          <div className="px-2.5 py-3 text-[12px] text-fg-subtle text-center">No matches</div>
        )}
        {results.map((r) => (
          <div
            key={r.id}
            className={cn(
              "flex items-center gap-2 px-2.5 py-1.5 rounded text-[13px] cursor-pointer transition-colors",
              String(r.id) === String(value)
                ? "bg-accent-50 text-accent-700"
                : "text-fg hover:bg-surface-subtle",
            )}
            onClick={() => onSelect(r.id, r.title)}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <TypeIcon name={r.typeName} color={null} size={13} />
            <span className="font-mono text-[11px] text-fg-subtle shrink-0">#{r.id}</span>
            <span className="flex-1 truncate">{r.title}</span>
            {String(r.id) === String(value) && (
              <Icon name="check" size={14} className="text-accent-700 shrink-0" aria-hidden="true" />
            )}
          </div>
        ))}
      </div>
    </div>,
    document.body,
  );
}
