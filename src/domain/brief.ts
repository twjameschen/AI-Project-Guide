import type { z } from 'zod';
import {
  BRIEF_FORMAT,
  BRIEF_FORMAT_VERSION,
  briefFileSchema,
  type BriefFile,
  type BriefSource,
  type BriefTool,
  type StoredBrief,
  type TestResult,
} from './model';

/** brief JSON 大小上限（位元組）。 */
export const BRIEF_MAX_BYTES = 256 * 1024;

export type ParseResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };

const ISSUE_MESSAGES: Record<string, string> = {
  invalid_type: '型別不正確或缺少此欄位',
  too_big: '內容過長或項目過多',
  too_small: '內容不可為空',
  invalid_value: '值不在允許範圍',
  invalid_format: '格式不正確',
  unrecognized_keys: '包含不支援的欄位',
};

/** 把 zod 錯誤轉成繁中訊息（最多 20 則）。 */
export function formatIssues(error: z.ZodError): string[] {
  return error.issues.slice(0, 20).map((i) => {
    const path = i.path.length ? i.path.join('.') : '（根層級）';
    const base = i.code === 'custom' ? i.message : (ISSUE_MESSAGES[i.code] ?? i.message);
    const extra =
      i.code === 'invalid_value' && 'values' in i && Array.isArray(i.values)
        ? `（允許：${i.values.map(String).join('、')}）`
        : '';
    const detail = i.code === 'invalid_format' ? `：${i.message}` : '';
    return `欄位 ${path}：${base}${extra}${detail}`;
  });
}

export function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

/**
 * 解析並驗證外部 brief JSON。只接受本平台格式；不嘗試解讀任意聊天紀錄。
 * 驗證順序：大小 → JSON → 格式標識 → 版本 → 欄位 → 專案 ID。
 */
export function parseBriefText(text: string, expectedProjectId: string): ParseResult<BriefFile> {
  if (byteLength(text) > BRIEF_MAX_BYTES) {
    return { ok: false, errors: [`檔案過大（上限 ${BRIEF_MAX_BYTES / 1024} KB）。`] };
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { ok: false, errors: [`不是有效的 JSON：${e instanceof Error ? e.message : String(e)}`] };
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return { ok: false, errors: ['JSON 最外層必須是物件（{ ... }）。'] };
  }
  const obj = data as Record<string, unknown>;
  if (obj.format !== BRIEF_FORMAT) {
    return {
      ok: false,
      errors: [`不是 AI Project Guide 的 brief 格式：format 必須是 "${BRIEF_FORMAT}"。本平台不解析任意聊天紀錄。`],
    };
  }
  if (obj.formatVersion !== BRIEF_FORMAT_VERSION) {
    const v = typeof obj.formatVersion === 'number' ? obj.formatVersion : String(obj.formatVersion);
    return {
      ok: false,
      errors: [`不支援的 brief 版本（formatVersion: ${v}）。本網站目前支援版本 ${BRIEF_FORMAT_VERSION}。`],
    };
  }
  const parsed = briefFileSchema.safeParse(data);
  if (!parsed.success) return { ok: false, errors: formatIssues(parsed.error) };
  if (parsed.data.projectId !== expectedProjectId) {
    return {
      ok: false,
      errors: [`此 brief 屬於其他專案（projectId: ${parsed.data.projectId}），目前專案 ID 為 ${expectedProjectId}。`],
    };
  }
  return { ok: true, value: parsed.data };
}

export function toStoredBrief(
  file: BriefFile,
  meta: { id: string; source: BriefSource; importedAt: string; projectRevision: number; isDemo?: boolean },
): StoredBrief {
  return {
    ...file,
    id: meta.id,
    source: meta.source,
    importedAt: meta.importedAt,
    projectRevisionAtImport: meta.projectRevision,
    isDemo: meta.isDemo ?? false,
  };
}

/** 把 StoredBrief 去掉平台欄位，還原成外部格式（供下載或顯示）。 */
export function toBriefFile(b: StoredBrief): BriefFile {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id, source, importedAt, projectRevisionAtImport, isDemo, ...file } = b;
  return file;
}

export function testCounts(b: Pick<BriefFile, 'tests'>): Record<TestResult, number> {
  const c: Record<TestResult, number> = { passed: 0, failed: 0, not_run: 0, blocked: 0, unknown: 0 };
  for (const t of b.tests) c[t.result] += 1;
  return c;
}

export function sortBriefsNewestFirst<T extends Pick<StoredBrief, 'occurredAt' | 'importedAt' | 'recordId'>>(list: T[]): T[] {
  return [...list].sort(
    (a, b) =>
      b.occurredAt.localeCompare(a.occurredAt) ||
      b.importedAt.localeCompare(a.importedAt) ||
      a.recordId.localeCompare(b.recordId),
  );
}

/** 給外部工具的 brief 範本：欄位齊全、值為說明文字，專案 ID 已填入。 */
export function briefTemplate(projectId: string, opts: { tool: BriefTool; taskIds: string[] }): BriefFile {
  return {
    format: BRIEF_FORMAT,
    formatVersion: BRIEF_FORMAT_VERSION,
    projectId,
    recordId: '<唯一紀錄 ID，例如 2026-01-31-codex-01>',
    taskIds: opts.taskIds.length ? opts.taskIds : ['<本次處理的任務或功能 ID，例如 T-F-001>'],
    tool: opts.tool,
    model: null,
    occurredAt: '<ISO 8601 完成時間，例如 2026-01-31T18:00:00+08:00>',
    branch: '<分支名稱；不知道填 null>',
    commit: '<commit SHA；尚未提交填 null>',
    summary: '<本次完成了什麼（只寫實際完成且有證據的內容）>',
    changedFiles: ['<變更的檔案路徑>'],
    tests: [
      {
        command: '<實際執行的命令，例如 npm test>',
        environment: '<執行環境，例如 Node 22 / macOS>',
        result: 'not_run',
        evidence: '<命令輸出摘要或連結；未執行寫明原因>',
      },
    ],
    knownIssues: ['<已知問題；沒有就用空陣列 []>'],
    unfinished: ['<未完成項目>'],
    decisionsNeeded: ['<需要使用者決定的事項>'],
    nextSteps: ['<建議下一步>'],
  };
}

/** 固定內容的範例 brief（網站說明與測試使用）。 */
export function exampleBrief(projectId: string): BriefFile {
  return {
    format: BRIEF_FORMAT,
    formatVersion: BRIEF_FORMAT_VERSION,
    projectId,
    recordId: '2026-01-31-codex-01',
    taskIds: ['T-F-001'],
    tool: 'codex',
    model: null,
    occurredAt: '2026-01-31T18:00:00+08:00',
    branch: 'feature/borrow-form',
    commit: null,
    summary: '完成借用登記表單的欄位與必填驗證；尚未串接儲存。',
    changedFiles: ['src/BorrowForm.tsx', 'src/BorrowForm.test.tsx'],
    tests: [
      {
        command: 'npm test -- BorrowForm',
        environment: 'Node 22 / macOS',
        result: 'passed',
        evidence: '3 passed（BorrowForm.test.tsx）',
      },
      {
        command: 'npm run e2e',
        environment: '—',
        result: 'not_run',
        evidence: '尚未建立 E2E 環境',
      },
    ],
    knownIssues: ['手機寬度下日期選擇器超出畫面'],
    unfinished: ['借用資料儲存（AC-001 的「工具狀態變為借出中」尚未完成）'],
    decisionsNeeded: ['逾期天數要以 7 天還是 14 天計算？'],
    nextSteps: ['實作借用資料儲存並補 AC-001、AC-002 測試'],
  };
}
