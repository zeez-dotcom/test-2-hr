export function sanitizeImageSrc(src?: string | null): string {
  if (!src) return "";
  const trimmed = src.trim();
  // Allow any image mime type encoded as base64 data URL.
  const dataUrlPattern = /^data:image\/[^;]+;base64,/;
  const isDataUrl = dataUrlPattern.test(trimmed);
  const isAbsoluteUrl = /^https?:\/\//i.test(trimmed);
  if (!isDataUrl && !isAbsoluteUrl) return "";
  return trimmed.replace(/"/g, "&quot;");
}

