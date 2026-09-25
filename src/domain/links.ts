/** 只允許的連結協定。其他（javascript:、data:、file: 等）一律視為不安全。 */
const SAFE_PROTOCOLS = new Set(['http:', 'https:']);

export function isSafeHttpUrl(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  try {
    const u = new URL(v);
    return SAFE_PROTOCOLS.has(u.protocol) && !!u.hostname;
  } catch {
    return false;
  }
}

/** Markdown 預覽用：只讓 http(s) 與 mailto 成為可點擊連結。 */
export function safeMarkdownUrl(value: string): string | null {
  const v = value.trim();
  if (isSafeHttpUrl(v)) return v;
  if (/^mailto:[^\s<>"]+@[^\s<>"]+$/i.test(v)) return v;
  return null;
}
