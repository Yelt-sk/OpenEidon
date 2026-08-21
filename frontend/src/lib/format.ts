/** Human-readable model weight, e.g. "2.5 GB". Empty when unknown. */
export function formatModelSize(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return '';
  const gb = bytes / 1e9;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  return `${Math.round(bytes / 1e6)} MB`;
}

/** "qwen3:4b · 2.5 GB" — the label used wherever a model is picked. */
export function modelLabelWithSize(
  id: string,
  bytes?: number | null,
): string {
  const size = formatModelSize(bytes);
  return size ? `${id} · ${size}` : id;
}
