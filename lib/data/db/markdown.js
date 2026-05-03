// Server-side Markdown → HTML for the DB row mappers.
//
// Two layers of defence so the DB-direct path doesn't lose the XSS
// protection that OP's Rails renderer + the client's DOMPurify pass give
// us in API mode:
//
//   1. `marked` runs with `html: false`, which strips raw HTML in the
//      markdown source. A WP description containing `<script>` is treated
//      as literal text, not parsed as a tag.
//   2. The rendered HTML still goes through `isomorphic-dompurify` before
//      we hand it back to the row mapper. Belt and braces — if a future
//      `marked` upgrade or option flip lets HTML through, DOMPurify is
//      the second wall.
//
// Together these match (and slightly exceed) the API-mode protection.

import { marked } from "marked";
import DOMPurify from "isomorphic-dompurify";

marked.setOptions({
  gfm: true,
  breaks: true,
  headerIds: false,
  mangle: false,
  // CRITICAL: do not let raw HTML in the markdown source pass through. A
  // WP description with `<img src=x onerror=...>` would otherwise reach
  // the DOM. With this off, marked HTML-escapes the source verbatim.
  html: false,
});

const PURIFY_CONFIG = {
  // Allow common formatting + links + tables + lists + code blocks. Block
  // anything that can execute (`script`, `iframe`, event handlers, JS
  // URLs). This is the same posture as the existing Tiptap render path.
  USE_PROFILES: { html: true },
  FORBID_TAGS: ["style", "script", "iframe", "object", "embed", "form"],
  FORBID_ATTR: ["style", "onload", "onerror", "onclick", "onmouseover"],
};

export function renderMarkdownToHtml(md) {
  if (md == null) return "";
  const s = String(md).trim();
  if (!s) return "";
  try {
    const rendered = marked.parse(s);
    return DOMPurify.sanitize(rendered, PURIFY_CONFIG);
  } catch {
    return "";
  }
}
