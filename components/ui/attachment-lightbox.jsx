"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";

function formatBytes(n) {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function getViewerType(contentType) {
  const ct = contentType || "";
  if (ct.startsWith("image/")) return "image";
  if (ct === "application/pdf") return "pdf";
  if (ct.startsWith("video/")) return "video";
  return "download";
}

export function AttachmentLightbox({ items, initialIndex, onClose }) {
  const [index, setIndex] = useState(initialIndex);
  // Track which index has errored so reset is implicit on navigation
  const [errorIndex, setErrorIndex] = useState(null);

  const item = items[index];
  const total = items.length;
  const viewerType = getViewerType(item?.contentType);
  const imgError = errorIndex === index;

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
      if (e.key === "ArrowRight") setIndex((i) => Math.min(total - 1, i + 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, total]);

  if (!item) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/85"
      onClick={onClose}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 bg-black/60 text-white flex-shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col">
          <span className="text-sm font-medium truncate max-w-[60vw]">
            {item.fileName}
          </span>
          <span className="text-xs text-white/60">
            {formatBytes(item.fileSize)}
            {total > 1 ? ` · ${index + 1} of ${total}` : ""}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-2 rounded hover:bg-white/10 transition-colors"
          aria-label="Close"
        >
          <Icon name="x" size={20} />
        </button>
      </div>

      {/* Body */}
      <div
        className="relative flex-1 flex items-center justify-center overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {total > 1 && index > 0 && (
          <button
            type="button"
            onClick={() => setIndex((i) => i - 1)}
            className="absolute left-3 z-10 p-2 rounded-full bg-black/40 text-white hover:bg-black/60 transition-colors"
            aria-label="Previous attachment"
          >
            <Icon name="chev-left" size={24} />
          </button>
        )}

        {viewerType === "image" && !imgError && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.downloadUrl}
            alt={item.fileName}
            className="max-h-[85vh] max-w-[90vw] object-contain rounded"
            onError={() => setErrorIndex(index)}
          />
        )}

        {(viewerType === "download" || (viewerType === "image" && imgError)) && (
          <div className="flex flex-col items-center gap-4 text-white">
            <Icon name="paperclip" size={48} className="opacity-40" />
            <p className="text-sm text-white/70">No preview available</p>
            <a
              href={item.downloadUrl}
              download={item.fileName}
              className="px-4 py-2 rounded bg-white/10 hover:bg-white/20 transition-colors text-sm font-medium flex items-center gap-2"
            >
              <Icon name="download" size={16} />
              Download {item.fileName}
            </a>
          </div>
        )}

        {viewerType === "pdf" && (
          <iframe
            src={item.downloadUrl}
            title={item.fileName}
            className="w-[90vw] h-[85vh] rounded border-0"
          />
        )}

        {viewerType === "video" && (
          <video
            src={item.downloadUrl}
            controls
            className="max-h-[85vh] max-w-[90vw] rounded"
          />
        )}

        {total > 1 && index < total - 1 && (
          <button
            type="button"
            onClick={() => setIndex((i) => i + 1)}
            className="absolute right-3 z-10 p-2 rounded-full bg-black/40 text-white hover:bg-black/60 transition-colors"
            aria-label="Next attachment"
          >
            <Icon name="chev-right" size={24} />
          </button>
        )}
      </div>
    </div>
  );
}
