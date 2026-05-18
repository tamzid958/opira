"use client";

import { useState } from "react";
import { toast } from "sonner";
import { friendlyError } from "@/lib/api-client";
import { formatRelDate } from "@/lib/utils";
import { Icon } from "@/components/icons";
import { Dropzone } from "@/components/ui/dropzone";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { LoadingPill } from "@/components/ui/loading-pill";
import { AttachmentLightbox } from "@/components/ui/attachment-lightbox";
import {
  useAttachments,
  useDeleteAttachment,
  useUploadAttachment,
  useDocumentAttachments,
  useDeleteDocumentAttachment,
  useUploadDocumentAttachment,
} from "@/lib/hooks/use-openproject-detail";

const ARCHIVE_TYPES = new Set([
  "application/zip",
  "application/x-zip-compressed",
  "application/x-tar",
  "application/x-rar-compressed",
  "application/x-7z-compressed",
  "application/gzip",
]);

const CODE_TYPES = new Set([
  "application/json",
  "application/xml",
  "application/javascript",
]);

export function getTileStyle(contentType) {
  const ct = contentType || "";
  if (ct.startsWith("image/")) return { icon: "image", bg: null };
  if (ct === "application/pdf") return { icon: "file-text", bg: "bg-red-100 text-red-600" };
  if (ct.startsWith("video/")) return { icon: "play", bg: "bg-slate-800 text-white" };
  if (ARCHIVE_TYPES.has(ct)) return { icon: "archive", bg: "bg-purple-100 text-purple-700" };
  if (ct.startsWith("text/") || CODE_TYPES.has(ct))
    return { icon: "code", bg: "bg-slate-100 text-slate-700" };
  if (ct.startsWith("application/vnd.") || ct === "application/msword")
    return { icon: "file", bg: "bg-blue-100 text-blue-700" };
  return { icon: "paperclip", bg: "bg-amber-100 text-amber-700" };
}

function formatBytes(n) {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function AttachmentsGrid({ wpId, docId, canAdd = true }) {
  const attWp = useAttachments(wpId, !!wpId);
  const uploadWp = useUploadAttachment(wpId);
  const delWp = useDeleteAttachment(wpId);
  const attDoc = useDocumentAttachments(docId, !!docId);
  const uploadDoc = useUploadDocumentAttachment(docId);
  const delDoc = useDeleteDocumentAttachment(docId);

  const att = docId ? attDoc : attWp;
  const upload = docId ? uploadDoc : uploadWp;
  const del = docId ? delDoc : delWp;
  const [confirmId, setConfirmId] = useState(null);
  const [lightboxIndex, setLightboxIndex] = useState(null);

  const handleFiles = async (files) => {
    for (const file of files) {
      try {
        await upload.mutateAsync({ file });
        toast.success(`Uploaded ${file.name}`);
      } catch (e) {
        toast.error(friendlyError(e, `Couldn't upload ${file.name} — please try again.`));
      }
    }
  };

  const items = att.data || [];

  return (
    <section>
      <header className="flex items-center justify-between gap-2 mb-2">
        <span className="text-[13px] font-semibold text-fg">
          Attachments{" "}
          <span className="text-fg-subtle font-medium text-xs ml-0.5">
            {att.isLoading ? "" : items.length}
          </span>
        </span>
      </header>

      {att.isLoading && <LoadingPill label="loading attachments" />}

      {!att.isLoading && items.length > 0 && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2">
          {items.map((a, idx) => (
            <div
              key={a.id}
              className="border border-border rounded-md p-2 bg-surface-elevated text-xs flex flex-col gap-1"
            >
              {(() => {
                const { icon, bg } = getTileStyle(a.contentType);
                return (
                  <button
                    type="button"
                    onClick={() => setLightboxIndex(idx)}
                    aria-label={`Preview ${a.fileName}`}
                    className={[
                      "grid place-items-center h-17 rounded w-full overflow-hidden cursor-pointer border-0 p-0",
                      bg ?? "bg-linear-to-br from-[#fbbf24] to-[#f59e0b]",
                    ].join(" ")}
                  >
                    {icon === "image" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={a.downloadUrl}
                        alt={a.fileName}
                        loading="lazy"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                          e.currentTarget.nextSibling.style.display = "grid";
                        }}
                      />
                    ) : null}
                    <span
                      className={[
                        "grid place-items-center w-full h-full text-current",
                        icon === "image" ? "hidden" : "",
                      ].join(" ")}
                      aria-hidden="true"
                    >
                      <Icon name={icon} size={20} />
                    </span>
                  </button>
                );
              })()}
              <div className="font-medium text-fg truncate" title={a.fileName}>
                {a.fileName}
              </div>
              <div className="text-fg-subtle text-[11px]">
                {formatBytes(a.fileSize)}
                {a.createdAt ? ` · ${formatRelDate(a.createdAt)}` : ""}
              </div>
              {a.permissions?.delete !== false ? (
                <button
                  type="button"
                  onClick={() => setConfirmId(a.id)}
                  aria-label={`Delete ${a.fileName}`}
                  className="inline-flex items-center gap-1 h-6.5 mt-1 px-2 rounded text-xs text-fg-muted hover:bg-surface-subtle hover:text-fg cursor-pointer self-start"
                >
                  <Icon name="trash" size={12} aria-hidden="true" /> Delete
                </button>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {canAdd ? (
        <div className="mt-3">
          <Dropzone onFiles={handleFiles} busy={upload.isPending} hint="Up to 100 MB per file" />
        </div>
      ) : items.length === 0 ? (
        <div className="mt-3 px-4 py-4 text-center text-fg-subtle text-[13px]">
          No attachments yet.
        </div>
      ) : null}

      {confirmId && (
        <ConfirmModal
          title="Delete attachment?"
          description="This removes the file from OpenProject. You can't undo it."
          confirmLabel="Delete"
          destructive
          busy={del.isPending}
          onClose={() => setConfirmId(null)}
          onConfirm={async () => {
            try {
              await del.mutateAsync(confirmId);
              toast.success("Attachment deleted");
            } catch (e) {
              toast.error(friendlyError(e, "Couldn't delete attachment — please try again."));
            }
            setConfirmId(null);
          }}
        />
      )}

      {lightboxIndex !== null && (
        <AttachmentLightbox
          items={items}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </section>
  );
}
