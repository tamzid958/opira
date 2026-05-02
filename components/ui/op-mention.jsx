"use client";

import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import Mention from "@tiptap/extension-mention";
import { ReactRenderer } from "@tiptap/react";

// OpenProject's `<mention>` markup looks like:
//
//   <mention class="mention" data-id="144" data-type="user"
//            data-text="@Jane Doe">@Jane Doe</mention>
//
// CommentHtml (read side) already understands this shape. We extend Tiptap's
// stock Mention extension so the *write* side emits exactly the same tag,
// which means OP can index the mention, send notifications, and render it on
// every other client (mobile, desktop) without any further round-tripping.
export const OpMention = Mention.extend({
  name: "mention",
  // OP's markup uses a custom <mention> element, not <span data-type="mention">.
  // Override parseHTML/renderHTML so our editor reads and writes the OP shape.
  parseHTML() {
    return [{ tag: "mention[data-id]" }];
  },
  renderHTML({ node }) {
    const label = node.attrs.label || node.attrs.id || "";
    const type = node.attrs.type || "user";
    return [
      "mention",
      {
        class: "mention",
        "data-id": node.attrs.id,
        "data-type": type,
        "data-text": `@${label}`,
      },
      `@${label}`,
    ];
  },
  addAttributes() {
    // We don't reuse the base attribute set — Tiptap's default Mention emits
    // `data-type="mention"` on a `<span>`, which collides with OP's
    // `data-type="user"` semantics. Defining attrs here gives us full
    // control over what lands in the HTML.
    return {
      id: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-id"),
        renderHTML: () => ({}),
      },
      label: {
        default: null,
        parseHTML: (el) => {
          const t = el.getAttribute("data-text") || el.textContent || "";
          return t.replace(/^@/, "");
        },
        renderHTML: () => ({}),
      },
      type: {
        default: "user",
        parseHTML: (el) => el.getAttribute("data-type") || "user",
        renderHTML: () => ({}),
      },
    };
  },
});

const MentionList = forwardRef(function MentionList({ items, command }, ref) {
  const [active, setActive] = useState(0);

  useEffect(() => setActive(0), [items]);

  const select = (i) => {
    const it = items?.[i];
    if (!it) return;
    command({ id: String(it.id), label: it.name || it.login || `User ${it.id}` });
  };

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (!items?.length) return false;
      if (event.key === "ArrowDown") {
        setActive((a) => (a + 1) % items.length);
        return true;
      }
      if (event.key === "ArrowUp") {
        setActive((a) => (a - 1 + items.length) % items.length);
        return true;
      }
      if (event.key === "Enter") {
        select(active);
        return true;
      }
      return false;
    },
  }));

  if (!items?.length) {
    return (
      <div className="rounded-md border border-border bg-surface-elevated shadow-md text-[12px] text-fg-muted px-3 py-1.5">
        No matching users
      </div>
    );
  }

  return (
    <ul
      className="rounded-md border border-border bg-surface-elevated shadow-lg overflow-hidden text-[13px] min-w-[220px] max-w-[320px]"
      role="listbox"
    >
      {items.map((u, i) => (
        <li
          key={u.id}
          role="option"
          aria-selected={i === active}
          onMouseDown={(e) => {
            e.preventDefault();
            select(i);
          }}
          onMouseEnter={() => setActive(i)}
          className={`flex items-center gap-2 px-2.5 py-1.5 cursor-pointer ${
            i === active ? "bg-accent-50 text-accent-700" : "text-fg"
          }`}
        >
          <span className="font-medium truncate">{u.name || u.login || `User ${u.id}`}</span>
          {u.login && u.login !== u.name && (
            <span className="text-fg-faint truncate text-[11.5px]">@{u.login}</span>
          )}
        </li>
      ))}
    </ul>
  );
});

// Suggestion config factory — `getUsers` is called every keystroke and must
// return the freshest list. Passing a getter (rather than a snapshot array)
// lets the editor stay alive across user-list refetches without needing to
// rebuild the extension chain.
export function buildMentionSuggestion(getUsers) {
  return {
    char: "@",
    // Stop matching once the user types a space — keeps "email me at foo@bar"
    // style writing from triggering a picker mid-sentence.
    allowSpaces: false,
    items: ({ query }) => {
      const list = getUsers() || [];
      const q = query.trim().toLowerCase();
      const filtered = q
        ? list.filter(
            (u) =>
              (u.name || "").toLowerCase().includes(q) ||
              (u.login || "").toLowerCase().includes(q) ||
              (u.email || "").toLowerCase().includes(q),
          )
        : list;
      return filtered.slice(0, 7);
    },
    render: () => {
      let component;
      let popup;

      const place = (props) => {
        if (!popup) return;
        const rect = props.clientRect?.();
        if (!rect) return;
        // Position below the caret. Keep within viewport on the right edge.
        const popupWidth = popup.offsetWidth || 240;
        const left = Math.min(rect.left, window.innerWidth - popupWidth - 8);
        popup.style.left = `${Math.max(8, left)}px`;
        popup.style.top = `${rect.bottom + 6}px`;
      };

      return {
        onStart: (props) => {
          component = new ReactRenderer(MentionList, {
            props,
            editor: props.editor,
          });
          popup = document.createElement("div");
          popup.style.position = "fixed";
          popup.style.zIndex = "9999";
          popup.appendChild(component.element);
          document.body.appendChild(popup);
          place(props);
        },
        onUpdate: (props) => {
          component?.updateProps(props);
          place(props);
        },
        onKeyDown: (props) => {
          if (props.event.key === "Escape") {
            popup?.remove();
            return true;
          }
          return component?.ref?.onKeyDown?.(props) ?? false;
        },
        onExit: () => {
          popup?.remove();
          component?.destroy();
          popup = null;
          component = null;
        },
      };
    },
  };
}
