import type { Project } from './model';

/**
 * 專案「內容」：排除只影響介面狀態或中繼資料的欄位。
 * 內容改變才遞增 revision；只切換精靈步驟、封存或確認摘要不算。
 */
export function projectContent(p: Project): unknown {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { revision, updatedAt, wizardStep, archived, summaryConfirmedRevision, ...content } = p;
  return content;
}

export function contentEquals(a: Project, b: Project): boolean {
  return JSON.stringify(projectContent(a)) === JSON.stringify(projectContent(b));
}

/** 依與上一版比較，決定下一版 revision 與 updatedAt。 */
export function nextVersion(prev: Project | undefined, next: Project, now: string): Project {
  if (!prev) return { ...next, updatedAt: now };
  if (contentEquals(prev, next)) {
    return { ...next, revision: prev.revision, updatedAt: prev.updatedAt };
  }
  return { ...next, revision: prev.revision + 1, updatedAt: now };
}
