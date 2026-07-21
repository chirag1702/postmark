export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Derives the outbound MIME html/text bodies + list preview text from a composer's plain-text
 * body, mirroring the paragraph-splitting the reading pane expects back (`shapeEmail`). */
export function buildOutboundBody(rawBody: string): {
  bodyHtml: string;
  bodyText: string;
  previewText: string;
} {
  const bodyText = rawBody.trim();
  const paragraphs = bodyText.split(/\n{2,}/).filter(Boolean);
  const bodyHtml = paragraphs
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br />")}</p>`)
    .join("\n");

  return { bodyHtml, bodyText, previewText: bodyText.slice(0, 120) };
}
