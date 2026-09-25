import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { remapEntryAsCopy, type ConflictChoice } from '../domain/backup';
import { newUuid } from '../domain/ids';
import {
  createEmptyProject,
  type Backup,
  type BackupEntry,
  type ExportRecord,
  type Project,
  type StoredBrief,
} from '../domain/model';
import { nextVersion } from '../domain/revision';

export const DB_NAME = 'ai-project-guide';
const DB_VERSION = 1;

interface GuideDB extends DBSchema {
  projects: { key: string; value: Project };
  briefs: {
    key: string;
    value: StoredBrief;
    indexes: { byProject: string; byProjectRecord: [string, string] };
  };
  exports: { key: string; value: ExportRecord; indexes: { byProject: string } };
  meta: { key: string; value: { key: string; value: unknown } };
}

export type StorageErrorKind = 'unavailable' | 'quota' | 'not_found' | 'unknown';

export class StorageError extends Error {
  readonly kind: StorageErrorKind;
  constructor(kind: StorageErrorKind, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.kind = kind;
    this.name = 'StorageError';
  }
}

function toStorageError(e: unknown): StorageError {
  if (e instanceof StorageError) return e;
  const name = e && typeof e === 'object' && 'name' in e ? String((e as { name: unknown }).name) : '';
  if (name === 'QuotaExceededError') {
    return new StorageError('quota', '瀏覽器儲存空間不足，資料沒有保存。請下載 JSON 備份後清理空間或刪除不需要的專案。', { cause: e });
  }
  const msg = e instanceof Error ? e.message : String(e);
  return new StorageError('unknown', `保存資料時發生錯誤：${msg}`, { cause: e });
}

export interface ImportSummary {
  added: number;
  replaced: number;
  kept: number;
  copied: number;
}

type Listener = () => void;

export class Repo {
  private listeners = new Set<Listener>();
  private readonly db: IDBPDatabase<GuideDB>;
  constructor(db: IDBPDatabase<GuideDB>) {
    this.db = db;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private emit() {
    for (const fn of this.listeners) fn();
  }

  private async run<T>(fn: () => Promise<T>, write = false): Promise<T> {
    try {
      const r = await fn();
      if (write) this.emit();
      return r;
    } catch (e) {
      throw toStorageError(e);
    }
  }

  close() {
    this.db.close();
  }

  // ---------- 專案 ----------

  listProjects(): Promise<Project[]> {
    return this.run(async () => {
      const all = await this.db.getAll('projects');
      return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
    });
  }

  getProject(id: string): Promise<Project | undefined> {
    return this.run(() => this.db.get('projects', id));
  }

  createProject(name: string, now: string, id = newUuid()): Promise<Project> {
    return this.run(async () => {
      const p = createEmptyProject(id, name.trim(), now);
      await this.db.add('projects', p);
      return p;
    }, true);
  }

  /** 保存專案：與資料庫中的上一版比較，只有內容變更才遞增 revision。 */
  saveProject(next: Project, now: string): Promise<Project> {
    return this.run(async () => {
      const tx = this.db.transaction('projects', 'readwrite');
      const prev = await tx.store.get(next.id);
      if (!prev) throw new StorageError('not_found', '找不到此專案，可能已在其他分頁被刪除。');
      const saved = nextVersion(prev, next, now);
      await tx.store.put(saved);
      await tx.done;
      return saved;
    }, true);
  }

  private patchProject(id: string, fn: (p: Project) => Project, now: string): Promise<Project> {
    return this.run(async () => {
      const tx = this.db.transaction('projects', 'readwrite');
      const prev = await tx.store.get(id);
      if (!prev) throw new StorageError('not_found', '找不到此專案。');
      const saved = nextVersion(prev, fn(prev), now);
      await tx.store.put(saved);
      await tx.done;
      return saved;
    }, true);
  }

  setArchived(id: string, archived: boolean, now: string) {
    return this.patchProject(id, (p) => ({ ...p, archived }), now);
  }

  /** 記住精靈目前步驟（不影響 revision 與最近更新時間）。 */
  setWizardStep(id: string, step: number, now: string) {
    return this.patchProject(id, (p) => ({ ...p, wizardStep: step }), now);
  }

  confirmSummary(id: string, now: string) {
    return this.patchProject(id, (p) => ({ ...p, summaryConfirmedRevision: p.revision }), now);
  }

  setHandoffBrief(id: string, briefId: string | null, now: string) {
    return this.patchProject(id, (p) => ({ ...p, handoffBriefId: briefId }), now);
  }

  async relatedCounts(id: string): Promise<{ briefs: number; exports: number }> {
    return this.run(async () => ({
      briefs: await this.db.countFromIndex('briefs', 'byProject', id),
      exports: await this.db.countFromIndex('exports', 'byProject', id),
    }));
  }

  /** 刪除專案與其 brief、匯出紀錄（同一交易）。 */
  deleteProject(id: string): Promise<void> {
    return this.run(async () => {
      const tx = this.db.transaction(['projects', 'briefs', 'exports'], 'readwrite');
      await tx.objectStore('projects').delete(id);
      for (const key of await tx.objectStore('briefs').index('byProject').getAllKeys(id)) {
        await tx.objectStore('briefs').delete(key);
      }
      for (const key of await tx.objectStore('exports').index('byProject').getAllKeys(id)) {
        await tx.objectStore('exports').delete(key);
      }
      await tx.done;
    }, true);
  }

  // ---------- brief ----------

  listBriefs(projectId: string): Promise<StoredBrief[]> {
    return this.run(() => this.db.getAllFromIndex('briefs', 'byProject', projectId));
  }

  async listAllBriefs(): Promise<StoredBrief[]> {
    return this.run(() => this.db.getAll('briefs'));
  }

  findBriefByRecord(projectId: string, recordId: string): Promise<StoredBrief | undefined> {
    return this.run(() => this.db.getFromIndex('briefs', 'byProjectRecord', [projectId, recordId]));
  }

  /** 新增 brief；同專案相同 recordId 已存在時不新增。 */
  addBrief(brief: StoredBrief): Promise<{ status: 'added' } | { status: 'duplicate'; existing: StoredBrief }> {
    return this.run(async () => {
      const tx = this.db.transaction(['briefs', 'projects'], 'readwrite');
      const project = await tx.objectStore('projects').get(brief.projectId);
      if (!project) throw new StorageError('not_found', '找不到此 brief 對應的專案。');
      const existing = await tx.objectStore('briefs').index('byProjectRecord').get([brief.projectId, brief.recordId]);
      if (existing) {
        await tx.done;
        return { status: 'duplicate' as const, existing };
      }
      await tx.objectStore('briefs').add(brief);
      await tx.done;
      return { status: 'added' as const };
    }, true);
  }

  deleteBrief(id: string, now: string): Promise<void> {
    return this.run(async () => {
      const tx = this.db.transaction(['briefs', 'projects'], 'readwrite');
      const b = await tx.objectStore('briefs').get(id);
      if (b) {
        await tx.objectStore('briefs').delete(id);
        const p = await tx.objectStore('projects').get(b.projectId);
        if (p && p.handoffBriefId === id) {
          await tx.objectStore('projects').put(nextVersion(p, { ...p, handoffBriefId: null }, now));
        }
      }
      await tx.done;
    }, true);
  }

  // ---------- 匯出紀錄 ----------

  async listExports(projectId: string): Promise<ExportRecord[]> {
    return this.run(async () => {
      const list = await this.db.getAllFromIndex('exports', 'byProject', projectId);
      return list.sort((a, b) => b.exportedAt.localeCompare(a.exportedAt));
    });
  }

  addExport(rec: ExportRecord): Promise<void> {
    return this.run(async () => {
      await this.db.add('exports', rec);
    }, true);
  }

  // ---------- meta ----------

  async getMeta<T>(key: string): Promise<T | undefined> {
    return this.run(async () => (await this.db.get('meta', key))?.value as T | undefined);
  }

  setMeta(key: string, value: unknown): Promise<void> {
    return this.run(async () => {
      await this.db.put('meta', { key, value });
    }, true);
  }

  // ---------- 備份 ----------

  async exportEntries(projectIds?: string[]): Promise<BackupEntry[]> {
    return this.run(async () => {
      const projects = projectIds
        ? (await Promise.all(projectIds.map((id) => this.db.get('projects', id)))).filter((p): p is Project => !!p)
        : await this.db.getAll('projects');
      projects.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
      const entries: BackupEntry[] = [];
      for (const project of projects) {
        const briefs = (await this.db.getAllFromIndex('briefs', 'byProject', project.id)).sort((a, b) =>
          a.recordId.localeCompare(b.recordId),
        );
        const exports = (await this.db.getAllFromIndex('exports', 'byProject', project.id)).sort((a, b) =>
          a.exportedAt.localeCompare(b.exportedAt) || a.id.localeCompare(b.id),
        );
        entries.push({ project, briefs, exports });
      }
      return entries;
    });
  }

  /**
   * 套用備份。choices 以備份中的專案 ID 為鍵；沒有衝突的專案直接新增。
   * - keep：保留現有，略過備份中的該專案
   * - replace：刪除現有專案（含 brief、匯出紀錄）後寫入備份內容
   * - copy：以新 ID 另存，並更新所有關聯 ID
   */
  applyImport(
    backup: Backup,
    choices: Record<string, ConflictChoice>,
    newId: () => string = newUuid,
  ): Promise<ImportSummary> {
    return this.run(async () => {
      const summary: ImportSummary = { added: 0, replaced: 0, kept: 0, copied: 0 };
      const tx = this.db.transaction(['projects', 'briefs', 'exports'], 'readwrite');
      const projects = tx.objectStore('projects');
      const briefs = tx.objectStore('briefs');
      const exports = tx.objectStore('exports');

      const writeEntry = async (e: BackupEntry) => {
        await projects.put(e.project);
        for (const b of e.briefs) await briefs.put(b);
        for (const x of e.exports) await exports.put(x);
      };

      for (const entry of backup.projects) {
        const existing = await projects.get(entry.project.id);
        if (!existing) {
          // 無衝突：仍需避免 brief／匯出紀錄的內部 ID 與其他專案相撞。
          const briefClash = await Promise.all(entry.briefs.map((b) => briefs.get(b.id)));
          const exportClash = await Promise.all(entry.exports.map((x) => exports.get(x.id)));
          if (briefClash.some(Boolean) || exportClash.some(Boolean)) {
            await writeEntry(remapEntryAsCopy(entry, newId, { nameSuffix: '' }));
          } else {
            await writeEntry(entry);
          }
          summary.added += 1;
          continue;
        }
        const choice = choices[entry.project.id] ?? 'keep';
        if (choice === 'keep') {
          summary.kept += 1;
        } else if (choice === 'replace') {
          for (const key of await briefs.index('byProject').getAllKeys(entry.project.id)) await briefs.delete(key);
          for (const key of await exports.index('byProject').getAllKeys(entry.project.id)) await exports.delete(key);
          await projects.delete(entry.project.id);
          await writeEntry(entry);
          summary.replaced += 1;
        } else {
          await writeEntry(remapEntryAsCopy(entry, newId));
          summary.copied += 1;
        }
      }
      await tx.done;
      return summary;
    }, true);
  }

  /** 加入示範專案（已存在則不動）。 */
  addDemo(project: Project, demoBriefs: StoredBrief[]): Promise<boolean> {
    return this.run(async () => {
      const tx = this.db.transaction(['projects', 'briefs'], 'readwrite');
      if (await tx.objectStore('projects').get(project.id)) {
        await tx.done;
        return false;
      }
      await tx.objectStore('projects').add(project);
      for (const b of demoBriefs) await tx.objectStore('briefs').put(b);
      await tx.done;
      return true;
    }, true);
  }

  /** 清除全部資料（測試與「清除全部」使用）。 */
  clearAll(): Promise<void> {
    return this.run(async () => {
      const tx = this.db.transaction(['projects', 'briefs', 'exports', 'meta'], 'readwrite');
      await Promise.all([
        tx.objectStore('projects').clear(),
        tx.objectStore('briefs').clear(),
        tx.objectStore('exports').clear(),
        tx.objectStore('meta').clear(),
      ]);
      await tx.done;
    }, true);
  }
}

export async function openRepo(name = DB_NAME): Promise<Repo> {
  if (typeof indexedDB === 'undefined') {
    throw new StorageError('unavailable', '此瀏覽器環境無法使用 IndexedDB（可能是隱私模式或網站資料被封鎖）。');
  }
  try {
    const db = await openDB<GuideDB>(name, DB_VERSION, {
      upgrade(db) {
        db.createObjectStore('projects', { keyPath: 'id' });
        const briefs = db.createObjectStore('briefs', { keyPath: 'id' });
        briefs.createIndex('byProject', 'projectId');
        briefs.createIndex('byProjectRecord', ['projectId', 'recordId'], { unique: true });
        const exports = db.createObjectStore('exports', { keyPath: 'id' });
        exports.createIndex('byProject', 'projectId');
        db.createObjectStore('meta', { keyPath: 'key' });
      },
      blocked() {
        // 其他分頁持有舊版本連線；由呼叫端顯示錯誤。
      },
    });
    return new Repo(db);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new StorageError('unavailable', `無法開啟瀏覽器資料庫（IndexedDB）：${msg}`, { cause: e });
  }
}
