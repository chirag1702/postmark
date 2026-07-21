import sanitizeHtml from "sanitize-html";

/**
 * Sanitizes arbitrary inbound sender HTML before it's ever rendered -- the stored-XSS defense
 * this app requires. Called in `src/lib/mail/live-shape.ts` right before an email is handed to
 * the frontend; `EmailDetail.tsx` trusts the shaped `bodyHtml` and never re-sanitizes.
 */
export function sanitizeInboundHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      "a", "b", "strong", "i", "em", "u", "s", "strike", "p", "br", "hr", "div", "span",
      "ul", "ol", "li", "blockquote", "pre", "code",
      "h1", "h2", "h3", "h4", "h5", "h6",
      "table", "thead", "tbody", "tfoot", "tr", "td", "th",
      "img", "font", "center", "small", "sub", "sup",
    ],
    allowedAttributes: {
      a: ["href", "name", "target", "rel"],
      img: ["src", "alt", "width", "height", "style"],
      "*": [
        "style", "class", "align", "valign", "width", "height",
        "color", "bgcolor", "border", "cellpadding", "cellspacing",
      ],
    },
    // No `data:` (avoids data-URI XSS smuggling); no `cid:` (inline-attachment images are out
    // of scope for this module -- they'll render broken, an accepted limitation).
    allowedSchemes: ["http", "https", "mailto"],
    allowedStyles: {
      "*": {
        color: [/.*/],
        "background-color": [/.*/],
        "font-size": [/.*/],
        "font-weight": [/.*/],
        "text-align": [/^left$|^right$|^center$/],
        padding: [/.*/],
        margin: [/.*/],
      },
    },
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { target: "_blank", rel: "noopener noreferrer" }),
    },
  });
}
