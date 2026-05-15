"use client";

import { useState, useRef, useEffect } from "react";
import { Icon } from "@/components/icons";
import DOMPurify from "isomorphic-dompurify";

const PURIFY_CONFIG = {
  ALLOWED_TAGS: ["p", "ul", "ol", "li", "strong", "em", "br"],
  ALLOWED_ATTR: [],
  KEEP_CONTENT: true,
};

function safeHtml(html) {
  return DOMPurify.sanitize(html || "", PURIFY_CONFIG);
}

function toPlainText(suggestion, isArray) {
  if (isArray && Array.isArray(suggestion)) return suggestion.join("\n");
  if (typeof suggestion === "string") return suggestion.replace(/<\/p>/gi, "\n").replace(/<\/li>/gi, "\n").replace(/<[^>]*>/g, "").replace(/\n{3,}/g, "\n\n").trim();
  return "";
}

const BTN_GHOST =
  "inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border bg-surface-elevated text-fg text-[13px] font-medium hover:bg-surface-subtle hover:border-border-strong disabled:opacity-50";
const BTN_PRIMARY =
  "inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-accent text-on-accent text-[13px] font-semibold hover:bg-accent-600 disabled:opacity-50";
const BTN_TRIGGER =
  "inline-flex items-center gap-1.5 rounded px-2 py-1 text-[12px] font-medium text-fg-subtle hover:text-fg hover:bg-surface-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

/**
 * Generic AI suggestion button.
 *
 * `variant` controls the action shown in the preview card:
 *   "accept"  — Accept (calls onAccept) + Dismiss. Use when output replaces a field value.
 *   "append"  — Append (calls onAccept) + Dismiss. Use when output is added to existing content.
 *   "insert"  — No preview card. Result is immediately applied via onAccept. Use for short
 *               inline fields (title, sprint goal) where the value is visible and reversible.
 *   "copy"    — Copy to clipboard + Dismiss. Use for read-only display panels with no target field.
 *
 * `acceptLabel` — overrides the primary button label in "accept"/"append" variants.
 */
export function AiSuggestButton({
  mode = "description",
  label = "Suggest with AI",
  payload,
  onAccept,
  disabled = false,
  className = "",
  variant = "accept",
  acceptLabel,
}) {
  const [status, setStatus] = useState("idle"); // "idle"|"loading"|"preview"|"error"
  const [suggestion, setSuggestion] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [copied, setCopied] = useState(false);
  const abortRef = useRef(null);

  const isHtmlMode = ["description", "comment", "acceptance-criteria", "retro", "release-notes", "backlog-groom"].includes(mode);
  const isArrayMode = mode === "subtasks";

  const primaryLabel = acceptLabel || (variant === "append" ? "Append" : variant === "copy" ? "Copy" : "Accept");

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    if (status !== "preview" && status !== "error") return;
    const handler = (e) => { if (e.key === "Escape") setStatus("idle"); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [status]);

  async function handleSuggest() {
    if (disabled) return;
    abortRef.current = new AbortController();
    setStatus("loading");
    setSuggestion(null);
    setErrorMsg("");

    try {
      const res = await fetch("/api/ai/suggest-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ mode, ...payload }),
        signal: abortRef.current.signal,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");

      const result = data.suggestion ?? "";

      // "insert" variant: immediately apply without showing a preview card.
      if (variant === "insert") {
        const safe = isHtmlMode && typeof result === "string" ? safeHtml(result) : result;
        onAccept?.(safe);
        setStatus("idle");
        return;
      }

      setSuggestion(result);
      setStatus("preview");
    } catch (e) {
      if (e.name === "AbortError") return;
      setErrorMsg(e.message || "Something went wrong");
      setStatus("error");
    }
  }

  function handleAccept() {
    if (variant === "copy") {
      const text = toPlainText(suggestion, isArrayMode);
      navigator.clipboard?.writeText(text).catch(() => {});
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      return;
    }
    const safe = isHtmlMode && typeof suggestion === "string" ? safeHtml(suggestion) : suggestion;
    onAccept?.(safe);
    setStatus("idle");
    setSuggestion(null);
  }

  function handleDismiss() {
    abortRef.current?.abort();
    setStatus("idle");
    setSuggestion(null);
    setErrorMsg("");
    setCopied(false);
  }

  if (status === "loading") {
    return (
      <div className="flex items-center gap-1.5 mt-1.5 text-[12px] text-fg-subtle">
        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
        AI thinking…
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="mt-1.5 flex items-start gap-2 rounded-md border border-border bg-surface-subtle px-3 py-2 text-[12px]">
        <span className="text-pri-highest shrink-0 mt-px">⚠</span>
        <span className="flex-1 text-fg-subtle">{errorMsg}</span>
        <button type="button" className={BTN_GHOST} onClick={handleSuggest}>Retry</button>
        <button type="button" className={BTN_GHOST} onClick={handleDismiss} aria-label="Dismiss">
          <Icon name="x" size={11} aria-hidden="true" />
        </button>
      </div>
    );
  }

  if (status === "preview") {
    return (
      <div
        className="mt-2 rounded-lg border border-border bg-surface-subtle p-3"
        role="status"
        aria-label="AI suggestion preview"
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
            <Icon name="epic" size={12} aria-hidden="true" />
            AI suggestion
          </span>
          <button type="button" className={BTN_GHOST} onClick={handleDismiss} aria-label="Dismiss suggestion">
            <Icon name="x" size={11} aria-hidden="true" />
          </button>
        </div>

        <div className="max-h-52 overflow-y-auto mb-3">
          {isArrayMode && Array.isArray(suggestion) ? (
            <ul className="space-y-1">
              {suggestion.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-[13px] text-fg">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-accent shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          ) : isHtmlMode && suggestion ? (
            <div
              className="op-html prose-comment text-[13px] leading-relaxed text-fg"
              dangerouslySetInnerHTML={{ __html: safeHtml(suggestion) }}
            />
          ) : suggestion ? (
            <p className="text-[13px] leading-relaxed text-fg whitespace-pre-wrap">{suggestion}</p>
          ) : (
            <p className="text-[13px] text-fg-faint">No suggestion generated.</p>
          )}
        </div>

        <div className="flex justify-end gap-2">
          {/* Copy variant: no Dismiss, just Copy + close X in header */}
          {variant !== "copy" && (
            <button type="button" className={BTN_GHOST} onClick={handleDismiss}>Dismiss</button>
          )}
          <button type="button" className={BTN_PRIMARY} onClick={handleAccept}>
            {variant === "copy" && copied ? "Copied!" : primaryLabel}
          </button>
          {variant === "copy" && (
            <button type="button" className={BTN_GHOST} onClick={handleDismiss}>Done</button>
          )}
        </div>
      </div>
    );
  }

  // idle
  return (
    <button
      type="button"
      className={`${BTN_TRIGGER} ${className}`}
      onClick={handleSuggest}
      disabled={disabled}
      title={label}
    >
      <Icon name="epic" size={12} aria-hidden="true" />
      {label}
    </button>
  );
}
