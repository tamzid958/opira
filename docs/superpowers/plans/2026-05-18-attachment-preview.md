# Attachment Preview Tiles + Lightbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the generic amber placeholder tile in `AttachmentsGrid` with content-aware thumbnails and add an in-app lightbox that previews images, PDFs, and videos inline.

**Architecture:** A `getTileStyle(contentType)` pure helper derives icon + background color from a MIME type string. A new `AttachmentLightbox` component receives the full attachment list and an initial index, renders the correct viewer per type, and handles keyboard navigation. `AttachmentsGrid` wires the two together with a single `lightboxIndex` state value.

**Tech Stack:** React 19, Tailwind CSS v4, lucide-react (already installed), Vitest for pure-logic unit tests.

---

### Task 1: Register missing icons in `icons.jsx`

The lightbox and tile helper need `archive`, `code`, and `file` icons. They exist in lucide-react but aren't registered yet.

**Files:**
- Modify: `components/icons.jsx`

- [ ] **Step 1: Add lucide imports**

In `components/icons.jsx`, add `Archive`, `Code`, `File` to the existing lucide import block:

```js
import {
  // … existing imports …
  Archive,
  Code,
  File,
} from "lucide-react";
```

- [ ] **Step 2: Register names in NAME_TO_ICON**

Add to the `NAME_TO_ICON` object (after `"file-text": FileText`):

```js
archive: Archive,
code: Code,
file: File,
```

- [ ] **Step 3: Verify icons render**

Run the dev server (`npm run dev`) and open any work package detail that has attachments. The change is additive — nothing should break. Stop the dev server.

- [ ] **Step 4: Commit**

```bash
git add components/icons.jsx
git commit -m "feat(icons): register archive, code, file icons"
```

---

### Task 2: Write and test `getTileStyle`

A pure function that maps a MIME content type string to `{ icon, bg }`. `icon` is a name registered in `icons.jsx`; `bg` is a Tailwind class string for the tile background.

**Files:**
- Modify: `components/attachments-grid.jsx` (add helper at the top of the file)
- Test: `components/attachments-grid.test.js` (new file)

- [ ] **Step 1: Write the failing tests**

Create `components/attachments-grid.test.js`:

```js
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { getTileStyle } from "./attachments-grid.js";

describe("getTileStyle", () => {
  it("returns image style for image/png", () => {
    expect(getTileStyle("image/png")).toEqual({ icon: "image", bg: null });
  });

  it("returns image style for image/jpeg", () => {
    expect(getTileStyle("image/jpeg")).toEqual({ icon: "image", bg: null });
  });

  it("returns pdf style for application/pdf", () => {
    expect(getTileStyle("application/pdf")).toEqual({
      icon: "file-text",
      bg: "bg-red-100 text-red-600",
    });
  });

  it("returns video style for video/mp4", () => {
    expect(getTileStyle("video/mp4")).toEqual({
      icon: "play",
      bg: "bg-slate-800 text-white",
    });
  });

  it("returns video style for video/webm", () => {
    expect(getTileStyle("video/webm")).toEqual({
      icon: "play",
      bg: "bg-slate-800 text-white",
    });
  });

  it("returns archive style for application/zip", () => {
    expect(getTileStyle("application/zip")).toEqual({
      icon: "archive",
      bg: "bg-purple-100 text-purple-700",
    });
  });

  it("returns archive style for application/x-tar", () => {
    expect(getTileStyle("application/x-tar")).toEqual({
      icon: "archive",
      bg: "bg-purple-100 text-purple-700",
    });
  });

  it("returns code style for text/plain", () => {
    expect(getTileStyle("text/plain")).toEqual({
      icon: "code",
      bg: "bg-slate-100 text-slate-700",
    });
  });

  it("returns code style for application/json", () => {
    expect(getTileStyle("application/json")).toEqual({
      icon: "code",
      bg: "bg-slate-100 text-slate-700",
    });
  });

  it("returns doc style for application/vnd.openxmlformats-officedocument.wordprocessingml.document", () => {
    expect(
      getTileStyle(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      )
    ).toEqual({ icon: "file", bg: "bg-blue-100 text-blue-700" });
  });

  it("returns doc style for application/msword", () => {
    expect(getTileStyle("application/msword")).toEqual({
      icon: "file",
      bg: "bg-blue-100 text-blue-700",
    });
  });

  it("returns fallback amber style for unknown types", () => {
    expect(getTileStyle("application/octet-stream")).toEqual({
      icon: "paperclip",
      bg: "bg-amber-100 text-amber-700",
    });
  });

  it("returns fallback for null/undefined", () => {
    expect(getTileStyle(null)).toEqual({
      icon: "paperclip",
      bg: "bg-amber-100 text-amber-700",
    });
    expect(getTileStyle(undefined)).toEqual({
      icon: "paperclip",
      bg: "bg-amber-100 text-amber-700",
    });
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /path/to/project && npm run test:run -- components/attachments-grid.test.js
```

Expected: all tests fail with `getTileStyle is not a function` or similar import error.

- [ ] **Step 3: Add `getTileStyle` to `attachments-grid.jsx`**

Add this export near the top of `components/attachments-grid.jsx`, after the imports and before `formatBytes`:

```js
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
  if (ct.startsWith("application/vnd.") || ct === "application/msword" || ct === "application/ms-excel" || ct === "application/ms-powerpoint")
    return { icon: "file", bg: "bg-blue-100 text-blue-700" };
  return { icon: "paperclip", bg: "bg-amber-100 text-amber-700" };
}
```

Note: the test imports from `./attachments-grid.js` — Vitest resolves `.js` to `.jsx` automatically with the project's config.

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm run test:run -- components/attachments-grid.test.js
```

Expected: all 13 tests pass.

- [ ] **Step 5: Commit**

```bash
git add components/attachments-grid.jsx components/attachments-grid.test.js
git commit -m "feat(attachments): add getTileStyle MIME-to-icon helper"
```

---

### Task 3: Build `AttachmentLightbox` component

**Files:**
- Create: `components/ui/attachment-lightbox.jsx`

- [ ] **Step 1: Create the component**

Create `components/ui/attachment-lightbox.jsx`:

```jsx
"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { formatBytes } from "@/lib/utils";

function getViewerType(contentType) {
  const ct = contentType || "";
  if (ct.startsWith("image/")) return "image";
  if (ct === "application/pdf") return "pdf";
  if (ct.startsWith("video/")) return "video";
  return "download";
}

export function AttachmentLightbox({ items, initialIndex, onClose }) {
  const [index, setIndex] = useState(initialIndex);
  const [imgError, setImgError] = useState(false);

  const item = items[index];
  const total = items.length;
  const viewerType = getViewerType(item?.contentType);

  // Reset image error state when navigating
  useEffect(() => {
    setImgError(false);
  }, [index]);

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
        {/* Prev arrow */}
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

        {/* Content */}
        {viewerType === "image" && !imgError && (
          <img
            src={item.downloadUrl}
            alt={item.fileName}
            className="max-h-[85vh] max-w-[90vw] object-contain rounded"
            onError={() => setImgError(true)}
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
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video
            src={item.downloadUrl}
            controls
            className="max-h-[85vh] max-w-[90vw] rounded"
          />
        )}

        {/* Next arrow */}
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
```

- [ ] **Step 2: Check that `formatBytes` is exported from `lib/utils`**

```bash
grep -n "export.*formatBytes\|formatBytes" /path/to/project/lib/utils.js | head -5
```

If `formatBytes` is NOT exported from `lib/utils`, it's defined locally in `attachments-grid.jsx`. In that case, move `formatBytes` out of `attachments-grid.jsx` and into a shared location, OR duplicate it in the lightbox:

```js
function formatBytes(n) {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
```

Replace the import line in `attachment-lightbox.jsx` with the local function if needed.

- [ ] **Step 3: Commit**

```bash
git add components/ui/attachment-lightbox.jsx
git commit -m "feat(attachments): add AttachmentLightbox component"
```

---

### Task 4: Update `AttachmentsGrid` tiles and wire the lightbox

Replace the amber placeholder tile thumbnail with content-aware rendering, swap the `<a>` for a `<button>`, and mount `AttachmentLightbox`.

**Files:**
- Modify: `components/attachments-grid.jsx`

- [ ] **Step 1: Update imports and state**

At the top of `components/attachments-grid.jsx`, add:

```js
import { AttachmentLightbox } from "@/components/ui/attachment-lightbox";
```

Inside `AttachmentsGrid`, add state (after the existing `confirmId` state):

```js
const [lightboxIndex, setLightboxIndex] = useState(null);
```

- [ ] **Step 2: Replace the tile thumbnail area**

Find the existing tile thumbnail `<a>` element (lines ~63–74 in the current file):

```jsx
<a
  href={a.downloadUrl}
  target="_blank"
  rel="noreferrer"
  className="grid place-items-center h-17 rounded text-white bg-linear-to-br from-[#fbbf24] to-[#f59e0b] no-underline"
>
  <Icon
    name={a.contentType?.startsWith("image/") ? "image" : "paperclip"}
    size={20}
    aria-hidden="true"
  />
</a>
```

Replace it with:

```jsx
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
```

Note: the `.map` callback needs to expose the index. Change the map signature from `items.map((a) => (` to `items.map((a, idx) => (`.

- [ ] **Step 3: Mount the lightbox**

At the end of the `AttachmentsGrid` JSX, just before the closing `</section>`, add:

```jsx
{lightboxIndex !== null && (
  <AttachmentLightbox
    items={items}
    initialIndex={lightboxIndex}
    onClose={() => setLightboxIndex(null)}
  />
)}
```

- [ ] **Step 4: Run the dev server and verify manually**

```bash
npm run dev
```

Open a work package with image attachments:
- Image tiles should show real thumbnails.
- Non-image tiles should show colored icon tiles.
- Clicking any tile should open the lightbox.
- Images should render inline; PDFs in an iframe; videos with controls.
- Esc closes the lightbox; arrow keys navigate.
- Clicking outside the content area (on the dark overlay) closes it.
- Upload, delete, and permissions still work.

- [ ] **Step 5: Run lint**

```bash
npm run lint
```

Fix any warnings before committing.

- [ ] **Step 6: Commit**

```bash
git add components/attachments-grid.jsx
git commit -m "feat(attachments): content-aware tiles and lightbox preview"
```

---

## Self-Review

**Spec coverage:**

| Spec requirement | Task |
|---|---|
| Image tiles show `<img>` thumbnail | Task 4 step 2 |
| PDF tile — red icon | Task 2 step 3 (`getTileStyle`) |
| Video tile — dark + play icon | Task 2 step 3 |
| Archive tile — purple + archive icon | Task 2 step 3 |
| Code/text tile — slate + code icon | Task 2 step 3 |
| Office doc tile — blue + file icon | Task 2 step 3 |
| Fallback amber tile | Task 2 step 3 |
| Lightbox: images inline | Task 3 step 1 |
| Lightbox: PDFs in iframe | Task 3 step 1 |
| Lightbox: videos with controls | Task 3 step 1 |
| Lightbox: download prompt for others | Task 3 step 1 |
| Prev/next navigation | Task 3 step 1 |
| Keyboard: Esc, ArrowLeft, ArrowRight | Task 3 step 1 |
| Image onError fallback | Task 3 step 1 + Task 4 step 2 |
| Click overlay to close | Task 3 step 1 |
| No new dependencies | No `npm install` steps |
| Upload/delete/permissions unchanged | Task 4 only touches tile + state wiring |

**Placeholder scan:** No TBDs, all code is complete, commands are exact.

**Type consistency:** `getTileStyle` returns `{ icon, bg }` — used as `{ icon, bg }` in Task 4. `AttachmentLightbox` props `{ items, initialIndex, onClose }` — used identically in Task 4. `getViewerType` returns `"image" | "pdf" | "video" | "download"` — all four handled in the viewer block. Consistent.
