"use client";

import { useEffect, useMemo, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Icon } from "@/components/icons";
import { OpMention, buildMentionSuggestion } from "@/components/ui/op-mention";

// Tiptap's StarterKit v3 bundles a Link extension out of the box; we
// configure it inline below instead of importing `@tiptap/extension-link`
// separately (registering both produces a "Duplicate extension names"
// warning at runtime).

// Tiptap-based rich text editor. Output is sanitised HTML stored on the
// `valueHtml` prop; we deliberately don't expose JSON so callers can
// just push HTML into OP's `description: { raw, format: "markdown" }`
// shape via the existing API mappers — OP renders HTML in the
// description field too. Toolbar covers the everyday subset (bold,
// italic, strike, lists, headings, link, code) which is what shows up
// in 90 % of comments and document bodies.

const TOOL_BTN =
  "inline-grid place-items-center w-7 h-7 rounded text-fg-muted hover:bg-surface-subtle hover:text-fg cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
const TOOL_BTN_ACTIVE = "bg-accent-50 text-accent-700 hover:bg-accent-50";

function ToolbarButton({ icon, onClick, disabled, active, title, children }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`${TOOL_BTN} ${active ? TOOL_BTN_ACTIVE : ""}`}
    >
      {icon ? <Icon name={icon} size={13} aria-hidden="true" /> : children}
    </button>
  );
}

function ToolbarDivider() {
  return <span className="inline-block w-px h-4 bg-border self-center mx-0.5" aria-hidden="true" />;
}

export function RichTextEditor({
  value = "",
  onChange,
  placeholder = "Write something…",
  minHeight = 120,
  autoFocus = false,
  onSubmit,
  disabled = false,
  className = "",
  // When `mentionUsers` is supplied (typically from useUsers().data), typing
  // `@` opens a picker that inserts an OP-format <mention> tag. Off by default
  // so non-comment editors (e.g. the description field on a fresh task) don't
  // surprise users with a popup.
  mentionUsers,
}) {
  // The suggestion plugin needs the latest users list on every keystroke,
  // but rebuilding the Tiptap extension chain on each list refetch would
  // recreate the editor and drop the caret/draft. Stash the list on a ref
  // that's only read inside the suggestion's items callback (event-time, not
  // render-time). The lint rule about refs-during-render fires on the
  // *passing* of the getter, not on its execution — disable just that line.
  const usersRef = useRef(mentionUsers || []);
  useEffect(() => {
    usersRef.current = mentionUsers || [];
  }, [mentionUsers]);

  // Mention is opt-in: only added when the caller passes `mentionUsers`.
  const mentionsEnabled = mentionUsers !== undefined;
  const extensions = useMemo(() => {
    const base = [
      StarterKit.configure({
        // We render headings 1-3 only — h4+ rarely fit in narrow comment
        // panels and tend to look identical to bold paragraph text.
        heading: { levels: [1, 2, 3] },
        codeBlock: { HTMLAttributes: { class: "op-uc-code-block" } },
        code: { HTMLAttributes: { class: "op-uc-code" } },
        bulletList: { HTMLAttributes: { class: "op-uc-list" } },
        orderedList: { HTMLAttributes: { class: "op-uc-list op-uc-list--ordered" } },
        blockquote: { HTMLAttributes: { class: "op-uc-blockquote" } },
        link: {
          openOnClick: false,
          autolink: true,
          HTMLAttributes: {
            class: "op-uc-link",
            rel: "noopener noreferrer",
            target: "_blank",
          },
        },
      }),
    ];
    if (mentionsEnabled) {
      base.push(
        OpMention.configure({
          // eslint-disable-next-line react-hooks/refs
          suggestion: buildMentionSuggestion(() => usersRef.current),
        }),
      );
    }
    return base;
  }, [mentionsEnabled]);

  const editor = useEditor({
    immediatelyRender: false,
    extensions,
    content: value || "",
    editable: !disabled,
    editorProps: {
      attributes: {
        class:
          "op-html prose-comment outline-none px-3 py-2.5 text-[13px] text-fg leading-relaxed",
      },
      handleKeyDown: (_view, event) => {
        // Cmd/Ctrl + Enter submits when an onSubmit is wired (comment box).
        if (onSubmit && (event.metaKey || event.ctrlKey) && event.key === "Enter") {
          event.preventDefault();
          onSubmit();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: ed }) => {
      // Tiptap returns "<p></p>" for an empty doc. Normalise that to an
      // empty string so downstream "is the body empty?" checks behave.
      const html = ed.isEmpty ? "" : ed.getHTML();
      onChange?.(html);
    },
  });

  // Keep editor content in sync when the parent resets `value` (e.g. the
  // comment textarea clears after submit). Skip when the parent is just
  // echoing what we emitted to avoid a re-render loop.
  useEffect(() => {
    if (!editor) return;
    const cur = editor.getHTML();
    if (value !== cur && !(editor.isEmpty && (value === "" || value == null))) {
      editor.commands.setContent(value || "", { emitUpdate: false });
    }
  }, [value, editor]);

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [disabled, editor]);

  useEffect(() => {
    if (autoFocus && editor) editor.commands.focus("end");
  }, [autoFocus, editor]);

  if (!editor) {
    // SSR / first paint placeholder — preserves layout so the surrounding
    // form doesn't reflow when the editor mounts.
    return (
      <div
        className={`rounded-md border border-border bg-surface-elevated ${className}`}
        style={{ minHeight: minHeight + 36 }}
      />
    );
  }

  return (
    <div
      className={`rounded-md border border-border bg-surface-elevated focus-within:border-accent focus-within:shadow-[0_0_0_3px_var(--accent-100)] transition-colors ${
        disabled ? "opacity-60" : ""
      } ${className}`}
    >
      {/* ── Toolbar ──────────────────────────────────────────── */}
      <div
        className="flex items-center gap-0.5 px-1.5 py-1 border-b border-border-soft bg-surface-sunken rounded-t-md flex-wrap"
        role="toolbar"
        aria-label="Text formatting"
      >
        <ToolbarButton
          icon="arrow-up"
          title="Heading 1"
          active={editor.isActive("heading", { level: 1 })}
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 1 }).run()
          }
          disabled={disabled}
        >
          <span className="text-[10px] font-bold">H1</span>
        </ToolbarButton>
        <ToolbarButton
          title="Heading 2"
          active={editor.isActive("heading", { level: 2 })}
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 2 }).run()
          }
          disabled={disabled}
        >
          <span className="text-[10px] font-bold">H2</span>
        </ToolbarButton>
        <ToolbarButton
          title="Heading 3"
          active={editor.isActive("heading", { level: 3 })}
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 3 }).run()
          }
          disabled={disabled}
        >
          <span className="text-[10px] font-bold">H3</span>
        </ToolbarButton>
        <ToolbarDivider />
        <ToolbarButton
          title="Bold (Cmd/Ctrl+B)"
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
          disabled={disabled}
        >
          <span className="text-[12px] font-bold">B</span>
        </ToolbarButton>
        <ToolbarButton
          title="Italic (Cmd/Ctrl+I)"
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          disabled={disabled}
        >
          <span className="text-[12px] italic">I</span>
        </ToolbarButton>
        <ToolbarButton
          title="Strikethrough"
          active={editor.isActive("strike")}
          onClick={() => editor.chain().focus().toggleStrike().run()}
          disabled={disabled}
        >
          <span className="text-[12px] line-through">S</span>
        </ToolbarButton>
        <ToolbarButton
          title="Inline code"
          active={editor.isActive("code")}
          onClick={() => editor.chain().focus().toggleCode().run()}
          disabled={disabled}
        >
          <span className="font-mono text-[10px]">{"<>"}</span>
        </ToolbarButton>
        <ToolbarDivider />
        <ToolbarButton
          icon="list"
          title="Bullet list"
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          disabled={disabled}
        />
        <ToolbarButton
          title="Numbered list"
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          disabled={disabled}
        >
          <span className="text-[10px] font-mono">1.</span>
        </ToolbarButton>
        <ToolbarButton
          title="Quote"
          active={editor.isActive("blockquote")}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          disabled={disabled}
        >
          <span className="text-[12px]">&ldquo;</span>
        </ToolbarButton>
        <ToolbarButton
          title="Code block"
          active={editor.isActive("codeBlock")}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          disabled={disabled}
        >
          <span className="font-mono text-[10px]">{"{ }"}</span>
        </ToolbarButton>
        <ToolbarDivider />
        <ToolbarButton
          icon="link"
          title="Add link"
          active={editor.isActive("link")}
          disabled={disabled}
          onClick={() => {
            const prev = editor.getAttributes("link")?.href || "";
            const url = window.prompt("URL", prev);
            if (url === null) return;
            if (url === "") {
              editor.chain().focus().extendMarkRange("link").unsetLink().run();
              return;
            }
            const safe = /^https?:\/\//i.test(url) ? url : `https://${url}`;
            editor
              .chain()
              .focus()
              .extendMarkRange("link")
              .setLink({ href: safe })
              .run();
          }}
        />
        <div className="ml-auto flex items-center gap-0.5">
          <ToolbarButton
            title="Undo"
            disabled={!editor.can().undo()}
            onClick={() => editor.chain().focus().undo().run()}
          >
            <span className="text-[12px]">↶</span>
          </ToolbarButton>
          <ToolbarButton
            title="Redo"
            disabled={!editor.can().redo()}
            onClick={() => editor.chain().focus().redo().run()}
          >
            <span className="text-[12px]">↷</span>
          </ToolbarButton>
        </div>
      </div>

      <div
        className="relative"
        style={{ minHeight }}
        data-placeholder={placeholder}
      >
        <EditorContent editor={editor} />
        {editor.isEmpty && (
          <span
            className="pointer-events-none absolute top-2.5 left-3 text-[13px] text-fg-faint"
            aria-hidden="true"
          >
            {placeholder}
          </span>
        )}
      </div>
    </div>
  );
}

// Boolean helper for "is this HTML body actually empty?" — covers
// `<p></p>`, single whitespace, and the literal empty string.
export function isHtmlEmpty(html) {
  if (!html) return true;
  return (
    html
      .replace(/<p>(\s|&nbsp;)*<\/p>/g, "")
      .replace(/<[^>]*>/g, "")
      .trim().length === 0
  );
}
