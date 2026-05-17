# Attachment Preview Tiles + Lightbox

**Date:** 2026-05-18  
**Status:** Approved

## Summary

Replace the generic amber placeholder tile in `AttachmentsGrid` with content-aware thumbnail rendering, and add an in-app lightbox modal so users can view attachments without leaving the page.

## Scope

- `components/attachments-grid.jsx` — tile thumbnail area + click handler
- `components/ui/attachment-lightbox.jsx` — new lightbox component
- No changes to: `Dropzone`, upload/delete mutations, `mapAttachment`, proxy route, or any API route

## Tile Rendering

A `getTileStyle(contentType)` helper returns `{ icon, bg }` based on MIME type. The thumbnail area of each card becomes:

| Content type | Rendering |
|---|---|
| `image/*` | `<img src={downloadUrl} loading="lazy" className="object-cover w-full h-full" />` with `onError` fallback to image icon |
| `application/pdf` | Red-tinted tile + `file-text` icon |
| `video/*` | Dark tile + `play` icon |
| `application/zip`, `application/x-tar`, `application/x-rar*`, `application/x-7z*` | Purple tile + `archive` icon |
| `text/*`, `application/json`, `application/xml` | Slate tile + `code` icon |
| `application/vnd.*`, `application/msword`, `application/ms-excel`, `application/ms-powerpoint` | Blue tile + `file` icon |
| Everything else | Amber tile + `paperclip` icon (current behavior) |

`getTileStyle` lives inside `attachments-grid.jsx` — it's not shared, so no separate file needed.

The tile `<a>` element is replaced with a `<button>` that calls `setLightboxIndex(index)` to open the lightbox.

## Lightbox Component

**File:** `components/ui/attachment-lightbox.jsx`

**Props:**
```js
{ items, initialIndex, onClose }
// items: mapAttachment[] — the full attachment list
// initialIndex: number
// onClose: () => void
```

**Internal state:** `index` (current item), initialized to `initialIndex`.

**Layout:** Fixed full-screen overlay (`inset-0 z-50 bg-black/80`), flex column.

**Header:** filename + formatted file size on the left; close button (`×`) on the right.

**Body (content area):**
- **Images**: `<img src={item.downloadUrl}>` centered, `max-h-[85vh] max-w-[90vw] object-contain`.
- **PDFs**: `<iframe src={item.downloadUrl} className="w-full h-[85vh]">`.
- **All others**: centered message "No preview available" + an `<a download href={item.downloadUrl}>` download button.

**Navigation:** Left/right arrow buttons shown when `items.length > 1`. Arrows are absolutely positioned over the body area.

**Keyboard:** `useEffect` on mount adds a `keydown` listener: `Escape` → `onClose`, `ArrowLeft` → prev, `ArrowRight` → next. Cleaned up on unmount.

**Image load error:** `onError` on the `<img>` sets local `imgError` state, falling back to the "No preview available" + download prompt.

## Integration in AttachmentsGrid

```js
const [lightboxIndex, setLightboxIndex] = useState(null);

// in JSX:
{lightboxIndex !== null && (
  <AttachmentLightbox
    items={items}
    initialIndex={lightboxIndex}
    onClose={() => setLightboxIndex(null)}
  />
)}
```

Each tile's click handler: `onClick={() => setLightboxIndex(index)}`.

## What Does Not Change

- `Dropzone` component and its props
- `useAttachments`, `useUploadAttachment`, `useDeleteAttachment` hooks
- `mapAttachment` mapper and the `attachments-grid` data-fetching logic
- `/api/openproject/attachments/[id]/content` proxy route
- Permission gating (delete button visibility)
- No new npm dependencies

## Success Criteria

- Image attachments show a real thumbnail in the tile
- Non-image attachments show a styled icon tile with a meaningful color/icon
- Clicking any tile opens the lightbox
- Lightbox shows the correct content type (image, PDF iframe, or download prompt)
- Prev/next works when multiple attachments exist
- Esc and arrow keys work
- Image load errors fall back gracefully
- Existing upload, delete, and permission behavior is unchanged
