"use client";

import { useEffect, useState } from "react";
import { formatAbsDate, formatRelDate } from "@/lib/utils";
import { FileText } from "lucide-react";
import { Icon } from "@/components/icons";
import { CommentHtml } from "@/components/ui/comment-html";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingPill } from "@/components/ui/loading-pill";
import {
  useDocument,
  useProjectDocuments,
} from "@/lib/hooks/use-openproject-detail";
import { useApiStatus } from "@/lib/hooks/use-openproject";
import { useUrlParams } from "@/lib/hooks/use-modal-url";
import { friendlyError } from "@/lib/api-client";

// Confluence-style reading surface for OpenProject "documents". The OP
// v3 API only supports GET on documents (PATCH is technically allowed
// but rarely permitted by server config — write affordances are gated
// behind `permissions.update` from the mapper). Layout is a sticky left
// rail (search + chronological list) and a wide reader pane on the
// right.

const SORTS = [
  { id: "recent", label: "Recent" },
  { id: "name", label: "A → Z" },
];

export function Documents({ projectId, projectName }) {
  const listQ = useProjectDocuments(projectId);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("recent");
  const status = useApiStatus();
  const { params, setParams } = useUrlParams();
  const selectedId = params.get("doc") || null;

  const docs = (() => {
    const list = listQ.data || [];
    const q = query.trim().toLowerCase();
    let out = list;
    if (q) {
      out = out.filter(
        (d) =>
          d.title?.toLowerCase().includes(q) ||
          d.description?.toLowerCase().includes(q),
      );
    }
    return [...out].sort((a, b) => {
      if (sort === "name") return (a.title || "").localeCompare(b.title || "");
      return (b.createdAt || "").localeCompare(a.createdAt || "");
    });
  })();

  // If the URL doc is missing or no longer in the visible set, fall back to
  // the first visible doc and replace the URL so the deep link stays valid.
  // Render uses `desiredId` immediately; the URL gets reconciled in an
  // effect (calling setParams during render schedules a state update on
  // Next's LinkComponent and React rightly flags that as setState-in-render).
  const desiredId = !docs.length
    ? null
    : selectedId && docs.find((d) => d.id === selectedId)
      ? selectedId
      : docs[0].id;
  useEffect(() => {
    if (desiredId !== selectedId) {
      setParams({ doc: desiredId });
    }
  }, [desiredId, selectedId, setParams]);

  const docQ = useDocument(desiredId, !!desiredId);
  const selected = docQ.data || docs.find((d) => d.id === desiredId) || null;

  const opLink = (() => {
    const base = status.data?.baseUrl;
    if (!base || !projectId) return null;
    return `${base}/projects/${encodeURIComponent(projectId)}/documents`;
  })();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] gap-0 h-full min-h-0 bg-surface-elevated border border-border rounded-xl overflow-hidden">
      {/* ── Left rail: doc list ───────────────────────────────── */}
      <aside className="border-b lg:border-b-0 lg:border-r border-border-soft bg-surface-sunken flex flex-col min-h-0 max-h-[32vh] lg:max-h-none">
        <div className="px-3 py-3 border-b border-border-soft shrink-0">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
              Documents
            </span>
            <span className="text-[10.5px] text-fg-faint font-mono">
              {docs.length}
            </span>
          </div>
          <div className="relative">
            <Icon
              name="search"
              size={12}
              className="absolute left-2.5 top-2 text-fg-faint pointer-events-none"
              aria-hidden="true"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search documents…"
              className="w-full h-7 pl-7 pr-2 rounded-md border border-border bg-surface-elevated text-[12px] text-fg outline-none transition-colors focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-100)]"
            />
          </div>
          <div className="inline-flex mt-2 rounded-md border border-border bg-surface-elevated p-0.5">
            {SORTS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setSort(opt.id)}
                className={`inline-flex items-center h-6 px-2 rounded text-[11px] font-medium cursor-pointer ${
                  sort === opt.id
                    ? "bg-accent-50 text-accent-700"
                    : "text-fg-muted hover:text-fg"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {listQ.isLoading ? (
            <div className="px-3 py-6 text-center">
              <LoadingPill label="loading documents" />
            </div>
          ) : listQ.error ? (
            <div className="px-3 py-4 text-[12px] text-pri-highest">
              {friendlyError(listQ.error, "Couldn't load documents.")}
            </div>
          ) : docs.length === 0 ? (
            <div className="px-3 py-6 text-[12.5px] text-fg-subtle text-center">
              {query ? "No matches." : "No documents in this project."}
            </div>
          ) : (
            <ul>
              {docs.map((d) => (
                <li key={d.id}>
                  <button
                    type="button"
                    onClick={() => setParams({ doc: d.id }, { replace: false })}
                    className={`w-full text-left px-3 py-2.5 border-b border-border-soft cursor-pointer transition-colors ${
                      desiredId === d.id
                        ? "bg-accent-50 border-l-[3px] border-l-accent"
                        : "hover:bg-surface-subtle border-l-[3px] border-l-transparent"
                    }`}
                  >
                    <div className="flex items-start gap-2 min-w-0">
                      <Icon
                        name="paperclip"
                        size={11}
                        className={
                          desiredId === d.id ? "text-accent-700 mt-1 shrink-0" : "text-fg-subtle mt-1 shrink-0"
                        }
                        aria-hidden="true"
                      />
                      <div className="min-w-0 flex-1">
                        <div
                          className={`text-[12.5px] truncate ${
                            desiredId === d.id
                              ? "font-semibold text-accent-700"
                              : "font-medium text-fg"
                          }`}
                        >
                          {d.title}
                        </div>
                        <div className="text-[10.5px] text-fg-faint mt-0.5 truncate">
                          {formatRelDate(d.createdAt)}
                        </div>
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      {/* ── Reader pane ─────────────────────────────────────── */}
      <main className="overflow-y-auto bg-surface-elevated">
        {!selected ? (
          <div className="grid place-items-center h-full p-10">
            <EmptyState
              icon={FileText}
              title="No documents yet"
              body={
                <>
                  Documents in <strong>{projectName || "this project"}</strong>{" "}
                  will appear here. The OpenProject API is read-only for
                  documents — create new ones in the OpenProject UI.
                </>
              }
              action={
                opLink
                  ? {
                      label: "Open in OpenProject",
                      onClick: () => window.open(opLink, "_blank", "noopener"),
                    }
                  : null
              }
            />
          </div>
        ) : (
          <article className="max-w-5xl mx-auto px-4 sm:px-6 md:px-8 py-6 sm:py-8">
            <header className="border-b border-border-soft pb-5 mb-6">
              <div className="flex items-center gap-2 text-[11.5px] text-fg-subtle mb-3">
                <Icon name="paperclip" size={12} aria-hidden="true" />
                <span>{projectName || selected.projectName || "Project"}</span>
                <span className="text-fg-faint">·</span>
                <span>{formatAbsDate(selected.createdAt)}</span>
                <span className="text-fg-faint">·</span>
                <span>{formatRelDate(selected.createdAt)}</span>
              </div>
              <h1 className="font-display text-[28px] font-bold tracking-[-0.01em] text-fg m-0 leading-tight break-words">
                {selected.title}
              </h1>
            </header>
            {docQ.isLoading && !selected.descriptionHtml ? (
              <div className="py-6 text-center">
                <LoadingPill label="loading document" />
              </div>
            ) : selected.descriptionHtml ? (
              <CommentHtml
                html={selected.descriptionHtml}
                className="op-html prose-doc text-[14.5px] text-fg leading-[1.7]"
              />
            ) : selected.description ? (
              <pre className="whitespace-pre-wrap text-[14px] text-fg leading-[1.7] font-sans m-0">
                {selected.description}
              </pre>
            ) : (
              <p className="text-[13px] text-fg-subtle italic">
                This document has no body yet.
              </p>
            )}
          </article>
        )}
      </main>
    </div>
  );
}
