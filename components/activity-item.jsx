"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Avatar } from "@/components/ui/avatar";
import { CommentHtml } from "@/components/ui/comment-html";
import {
  RichTextEditor,
  isHtmlEmpty,
} from "@/components/ui/rich-text-editor";
import { Icon } from "@/components/icons";
import { PEOPLE } from "@/lib/data";
import { friendlyError } from "@/lib/api-client";
import { formatRelDate } from "@/lib/utils";

export function ActivityItem({ activity, onEdit, mentionUsers }) {
  const author = activity.author ? PEOPLE[activity.author] : null;
  const isComment = activity.kind === "comment";
  // Author-or-permitted users get an inline edit affordance; OP exposes
  // `_links.update` per-activity, surfaced via activity.permissions.update.
  const canEdit = isComment && !!activity.permissions?.update && !!onEdit;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(
    // Prefer the HTML body when present so the editor can re-hydrate the
    // exact formatting; fall back to plain text for activities that only
    // expose a markdown `comment`.
    activity.commentHtml || activity.comment || "",
  );
  const [saving, setSaving] = useState(false);

  const startEdit = () => {
    setDraft(activity.commentHtml || activity.comment || "");
    setEditing(true);
  };
  const cancelEdit = () => {
    setEditing(false);
    setDraft(activity.commentHtml || activity.comment || "");
  };
  const saveEdit = async () => {
    const original = activity.commentHtml || activity.comment || "";
    if (isHtmlEmpty(draft) || draft === original) {
      cancelEdit();
      return;
    }
    setSaving(true);
    try {
      await onEdit(activity.id, draft);
      setEditing(false);
    } catch (e) {
      toast.error(friendlyError(e, "Couldn't update the comment — please try again."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`flex gap-2.5 py-2 ${isComment ? "" : "py-1.5"}`}>
      <Avatar
        user={
          author ||
          (activity.authorName
            ? {
                initials: activity.authorName.slice(0, 2).toUpperCase(),
                name: activity.authorName,
                color: "#6b7384",
              }
            : null)
        }
        size="sm"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 mb-1">
          <span className="font-semibold text-[13px] text-fg">
            {author?.name || activity.authorName || "Someone"}
          </span>
          <span className="text-[11px] text-fg-subtle">
            {activity.createdAt ? formatRelDate(activity.createdAt, "—") : ""}
          </span>
          {canEdit && !editing && (
            <button
              type="button"
              onClick={startEdit}
              className="ml-auto inline-flex items-center gap-1 text-[11px] text-fg-subtle hover:text-fg cursor-pointer"
              title="Edit comment"
            >
              <Icon name="edit" size={11} aria-hidden="true" />
              Edit
            </button>
          )}
        </div>
        {isComment ? (
          editing ? (
            <div>
              <RichTextEditor
                value={draft}
                onChange={setDraft}
                placeholder="Edit your comment…"
                minHeight={80}
                autoFocus
                disabled={saving}
                onSubmit={saveEdit}
                mentionUsers={mentionUsers}
              />
              <div className="flex items-center gap-2 justify-end mt-2">
                <button
                  type="button"
                  onClick={cancelEdit}
                  disabled={saving}
                  className="inline-flex items-center h-7 px-2.5 rounded-md border border-border bg-surface-elevated text-fg text-xs font-medium hover:bg-surface-subtle hover:border-border-strong disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveEdit}
                  disabled={
                    saving ||
                    isHtmlEmpty(draft) ||
                    draft === (activity.commentHtml || activity.comment || "")
                  }
                  className="inline-flex items-center h-7 px-2.5 rounded-md bg-accent text-on-accent text-xs font-semibold hover:bg-accent-600 disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          ) : activity.commentHtml ? (
            <CommentHtml
              html={activity.commentHtml}
              className="op-html text-[13px] text-fg leading-relaxed bg-surface-app border border-border-soft rounded-lg px-3 py-2.5"
            />
          ) : (
            <div className="text-[13px] text-fg leading-relaxed bg-surface-app border border-border-soft rounded-lg px-3 py-2.5 whitespace-pre-wrap wrap-break-word">
              {activity.comment}
            </div>
          )
        ) : (
          <div className="text-[13px] text-fg-muted leading-relaxed">
            {activity.details.length > 0
              ? activity.details.map((d, i) => (
                  <CommentHtml key={i} html={d} className="op-html" />
                ))
              : "made a change"}
          </div>
        )}
      </div>
    </div>
  );
}
