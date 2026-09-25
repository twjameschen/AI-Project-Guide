import { formatIssues, byteLength, type ParseResult } from './brief';
import {
  APP_VERSION,
  BACKUP_FORMAT,
  SCHEMA_VERSION,
  backupSchema,
  type Backup,
  type BackupEntry,
} from './model';

export const BACKUP_MAX_BYTES = 20 * 1024 * 1024;

export function buildBackup(entries: BackupEntry[], scope: 'single' | 'all', exportedAt: string): Backup {
  return {
    format: BACKUP_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    appVersion: APP_VERSION,
    exportedAt,
    scope,
    projects: entries,
  };
}

/** 驗證備份檔：大小、JSON、格式、schema 版本（未來版本安全拒絕）、欄位與內部關聯。 */
export function parseBackupText(text: string): ParseResult<Backup> {
  if (byteLength(text) > BACKUP_MAX_BYTES) {
    return { ok: false, errors: [`檔案過大（上限 ${BACKUP_MAX_BYTES / 1024 / 1024} MB）。`] };
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { ok: false, errors: [`不是有效的 JSON：${e instanceof Error ? e.message : String(e)}`] };
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return { ok: false, errors: ['JSON 最外層必須是物件。'] };
  }
  const obj = data as Record<string, unknown>;
  if (obj.format !== BACKUP_FORMAT) {
    return { ok: false, errors: [`不是 AI Project Guide 備份檔：format 必須是 "${BACKUP_FORMAT}"。`] };
  }
  if (typeof obj.schemaVersion !== 'number') {
    return { ok: false, errors: ['缺少 schemaVersion。'] };
  }
  if (obj.schemaVersion > SCHEMA_VERSION) {
    return {
      ok: false,
      errors: [`此備份來自較新的版本（schemaVersion ${obj.schemaVersion}），目前網站只支援到 ${SCHEMA_VERSION}。為避免資料損壞，已拒絕匯入。`],
    };
  }
  if (obj.schemaVersion < SCHEMA_VERSION) {
    return { ok: false, errors: [`不支援的舊版 schemaVersion ${obj.schemaVersion}。`] };
  }
  const parsed = backupSchema.safeParse(data);
  if (!parsed.success) return { ok: false, errors: formatIssues(parsed.error) };

  const errors: string[] = [];
  const seen = new Set<string>();
  for (const [i, e] of parsed.data.projects.entries()) {
    if (seen.has(e.project.id)) errors.push(`projects.${i}：專案 ID 重複（${e.project.id}）。`);
    seen.add(e.project.id);
    const recordIds = new Set<string>();
    for (const b of e.briefs) {
      if (b.projectId !== e.project.id) errors.push(`projects.${i}：brief ${b.recordId} 的 projectId 與專案不符。`);
      if (recordIds.has(b.recordId)) errors.push(`projects.${i}：brief 紀錄 ID 重複（${b.recordId}）。`);
      recordIds.add(b.recordId);
    }
    for (const x of e.exports) {
      if (x.projectId !== e.project.id) errors.push(`projects.${i}：匯出紀錄的 projectId 與專案不符。`);
    }
  }
  if (errors.length) return { ok: false, errors: errors.slice(0, 20) };
  return { ok: true, value: parsed.data };
}

export type ConflictChoice = 'keep' | 'replace' | 'copy';

/**
 * 另存新專案：配發新專案 ID，並同步更新 brief、匯出紀錄與接手依據的關聯。
 * brief 內 projectId 也一併改為新 ID，確保之後匯入同專案 brief 時可正確比對。
 */
export function remapEntryAsCopy(
  entry: BackupEntry,
  newId: () => string,
  opts: { nameSuffix?: string } = {},
): BackupEntry {
  const projectId = newId();
  const briefIdMap = new Map<string, string>();
  const briefs = entry.briefs.map((b) => {
    const id = newId();
    briefIdMap.set(b.id, id);
    return { ...b, id, projectId };
  });
  const exports = entry.exports.map((x) => ({
    ...x,
    id: newId(),
    projectId,
    handoffBriefId: x.handoffBriefId ? (briefIdMap.get(x.handoffBriefId) ?? null) : null,
  }));
  const handoff = entry.project.handoffBriefId ? (briefIdMap.get(entry.project.handoffBriefId) ?? null) : null;
  return {
    project: {
      ...entry.project,
      id: projectId,
      basics: { ...entry.project.basics, name: `${entry.project.basics.name}${opts.nameSuffix ?? '（匯入副本）'}` },
      handoffBriefId: handoff,
    },
    briefs,
    exports,
  };
}
