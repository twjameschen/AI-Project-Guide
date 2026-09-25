import { answerStatus } from '../domain/answers';
import { isSafeHttpUrl } from '../domain/links';
import type { Answer } from '../domain/model';

/** 三種標記：使用者確認／待決定／模板建議。所有文件共用，確保一致。 */
export const TAG = {
  confirmed: '【使用者確認】',
  undecided: '【待決定】',
  aiPropose: '【待決定・希望 AI 提案】',
  template: '【模板建議】',
  empty: '（未填寫）',
} as const;

/**
 * 中和使用者文字中可能被當成 HTML 或破壞結構的片段：
 * - `<!` 改為 `<\!`：避免 HTML 註解，且使用者文字中不會出現完整的合併標記字串。
 * - `<` 後接字母、`/`、`?` 時加上反斜線，避免被渲染為原始 HTML。
 * - 行首的 `#` 跳脫，避免使用者文字變成文件標題。
 */
export function escapeText(s: string): string {
  return s
    .replace(/\r\n?/g, '\n')
    .replace(/<!/g, '<\\!')
    .replace(/<(?=[A-Za-z/?])/g, '\\<')
    .replace(/^(\s{0,3})#/gm, '$1\\#');
}

/** 單行：合併空白與換行，適合清單項目。 */
export function inline(s: string): string {
  return escapeText(s.replace(/\s+/g, ' ').trim());
}

export function splitLines(s: string): string[] {
  return s
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

/**
 * 使用者的多行文字：單行直接輸出；多行轉成清單，避免 Markdown 把換行合併成同一段。
 * indent 用於巢狀在清單項目下的情況。
 */
export function textLines(s: string, indent = ''): string {
  const lines = splitLines(s);
  if (lines.length <= 1) return `${indent}${inline(lines[0] ?? '')}`;
  return lines.map((l) => `${indent}- ${inline(l)}`).join('\n');
}

/** 使用者確認的文字（含標記）。 */
export function confirmedText(s: string, indent = ''): string {
  const lines = splitLines(s);
  if (lines.length <= 1) return `${TAG.confirmed}${inline(lines[0] ?? '')}`;
  return `${TAG.confirmed}\n${indent ? '' : '\n'}${textLines(s, indent)}`;
}

/** 依三態欄位輸出一行標記文字；不會把未決或空白內容寫成已確認。 */
export function answerLine(a: Answer): string {
  const st = answerStatus(a);
  const note = a.text.trim();
  switch (st) {
    case 'filled':
      return `${TAG.confirmed}${inline(note)}`;
    case 'undecided':
      return `${TAG.undecided}尚未決定。${note ? `使用者備註：${inline(note)}` : ''}`;
    case 'ai_propose':
      return `${TAG.aiPropose}請先提出 2–3 個選項與取捨，經使用者確認後才採用。${note ? `使用者備註：${inline(note)}` : ''}`;
    default:
      return TAG.empty;
  }
}

/** 多行版本：確認內容保留逐行結構。 */
export function answerBlock(a: Answer, indent = ''): string {
  if (answerStatus(a) === 'filled') return confirmedText(a.text, indent);
  return answerLine(a);
}

/** 只輸出安全協定連結；其餘以純文字標示並不產生連結。 */
export function safeLink(url: string, label?: string): string {
  const u = url.trim();
  if (!u) return TAG.empty;
  if (isSafeHttpUrl(u)) {
    const text = label ? inline(label) : u;
    return `[${text.replace(/[[\]]/g, '')}](<${u.replace(/[<>\s]/g, encodeURIComponent)}>)`;
  }
  return `\`${u.replace(/`/g, "'").slice(0, 200)}\`（非 http/https 連結，已停用連結）`;
}

/** 多行步驟：每行一個步驟，輸出為有序清單。 */
export function stepsList(s: string, indent = ''): string {
  const lines = s
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(\d+[.)、]|[-*•])\s*/, '').trim())
    .filter(Boolean);
  if (lines.length === 0) return `${indent}${TAG.empty}`;
  return lines.map((l, i) => `${indent}${i + 1}. ${inline(l)}`).join('\n');
}

export function bulletList(items: string[], empty = '（無）'): string {
  const list = items.map((i) => i.trim()).filter(Boolean);
  if (list.length === 0) return `- ${empty}`;
  return list.map((i) => `- ${inline(i)}`).join('\n');
}
