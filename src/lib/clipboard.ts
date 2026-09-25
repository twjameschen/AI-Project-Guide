/** 嘗試使用 Clipboard API 複製；不可用或被拒絕時回傳 false，由介面提供手動複製方式。 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 權限被拒或非安全環境：改用手動複製
  }
  return false;
}
