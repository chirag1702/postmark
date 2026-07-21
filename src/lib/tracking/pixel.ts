// Standard 43-byte 1x1 transparent GIF89a, used as the tracking pixel response body.
export const TRANSPARENT_GIF_BASE64 =
  "R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

export function transparentGifBuffer(): Uint8Array<ArrayBuffer> {
  const decoded = Buffer.from(TRANSPARENT_GIF_BASE64, "base64");
  const bytes = new Uint8Array(decoded.length);
  bytes.set(decoded);
  return bytes;
}
