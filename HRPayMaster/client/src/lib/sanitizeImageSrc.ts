export function sanitizeImageSrc(src?: string | null): string {
  if (!src) return "";
  const trimmed = src.trim();
  // Allow any valid data URL (not just images) or absolute HTTP(S) URLs.
  const isDataUrl = /^data:/i.test(trimmed);
  const isAbsoluteUrl = /^https?:\/\//i.test(trimmed);
  if (!isDataUrl && !isAbsoluteUrl) return "";
  return trimmed.replace(/"/g, "&quot;");
}

