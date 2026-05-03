"use client";

import DOMPurify from "isomorphic-dompurify";
import parse, { attributesToProps, domToReact } from "html-react-parser";

// OP comments arrive as a fragment of CKEditor-flavoured HTML. We sanitise
// (DOMPurify) before parsing so any stray script/style/link/event-handler
// that snuck through the upstream API is dropped, then map a few tags to
// purpose-built React nodes — most importantly `<mention>` which OP marks
// up like `<mention class="mention" data-id="144" data-type="user"
// data-text="@Name">@Name</mention>`. We render that as a styled pill
// rather than letting it land as a no-op tag the browser doesn't know.

const PURIFY_CONFIG = {
  // Allow `<mention>` so we can transform it; everything else falls back
  // to DOMPurify's defaults (no scripts, no event handlers, no javascript:
  // hrefs, no <iframe>, etc.).
  ADD_TAGS: ["mention"],
  ADD_ATTR: ["data-id", "data-type", "data-text", "target", "rel"],
};

function Mention({ id, type, label }) {
  const t = type || "user";
  const text = label || "@mention";
  return (
    <span
      data-mention-id={id}
      data-mention-type={t}
      title={`${t}: ${text}`}
      className="inline-flex items-center px-1.5 py-0 rounded-md bg-accent-50 text-accent-700 font-medium text-[12.5px] leading-[1.6] mx-0.5"
    >
      {text}
    </span>
  );
}

// Rewrite any reference to OpenProject's internal attachment-content path
// (`/api/v3/attachments/<id>/content`, optionally with a host) to point at
// our authenticated proxy (`/api/openproject/attachments/<id>/content`).
// OP returns these URLs inside document/comment HTML for inline images;
// the raw v3 URL fails because it requires the OAuth bearer token, but
// our proxy injects credentials server-side and streams the bytes back.
function rewriteAttachmentUrl(url) {
  if (!url) return url;
  const m = url.match(/\/api\/v3\/attachments\/(\d+)(?:\/content)?(\?[^#]*)?/);
  if (!m) return url;
  return `/api/openproject/attachments/${m[1]}/content${m[2] || ""}`;
}

const replace = (node) => {
  if (node.type !== "tag") return undefined;
  if (node.name === "mention") {
    const id = node.attribs?.["data-id"];
    const type = node.attribs?.["data-type"];
    const text =
      node.attribs?.["data-text"] ||
      (node.children?.[0]?.type === "text" ? node.children[0].data : null);
    return <Mention id={id} type={type} label={text} />;
  }
  // Inline images served from OP's attachments collection. CKEditor
  // injects `<img src="/api/v3/attachments/9915/content">` for embedded
  // pictures; route those through our proxy so the bytes load.
  if (node.name === "img" && node.attribs?.src) {
    const src = rewriteAttachmentUrl(node.attribs.src);
    if (src !== node.attribs.src) {
      // attributesToProps converts HTML attribute names (`class`,
      // `for`, etc.) to their React equivalents so we can safely spread.
      const props = attributesToProps(node.attribs);
      return (
        // next/image isn't a fit here — comment HTML carries dynamic
        // OpenProject attachment URLs proxied through our API.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          {...props}
          src={src}
          alt={props.alt || ""}
          loading="lazy"
        />
      );
    }
  }
  // Wide tables would otherwise force cells to squish inside the reader's
  // bounded width (the .op-html rule sets width:100%). Wrap in a horizontal
  // scroll container so columns keep their natural width and overflow.
  if (node.name === "table") {
    const props = attributesToProps(node.attribs || {});
    return (
      <div className="op-table-scroll">
        <table {...props}>{domToReact(node.children, { replace })}</table>
      </div>
    );
  }
  // Anchor handling: rewrite attachment-download links the same way, then
  // open external (absolute http/https) links in a new tab so clicking a
  // URL inside a comment doesn't navigate away from the issue.
  if (node.name === "a" && node.attribs?.href) {
    const original = node.attribs.href;
    const rewritten = rewriteAttachmentUrl(original);
    const isAttachment = rewritten !== original;
    const isExternal = /^https?:\/\//i.test(rewritten);
    if (isAttachment || isExternal) {
      const props = attributesToProps(node.attribs);
      return (
        <a
          {...props}
          href={rewritten}
          target="_blank"
          rel="noopener noreferrer"
          download={isAttachment ? "" : undefined}
        >
          {domToReact(node.children, { replace })}
        </a>
      );
    }
  }
  return undefined;
};

export function CommentHtml({ html, className }) {
  if (!html) return null;
  const clean = DOMPurify.sanitize(html, PURIFY_CONFIG);
  const tree = parse(clean, { replace });
  return <div className={className}>{tree}</div>;
}
