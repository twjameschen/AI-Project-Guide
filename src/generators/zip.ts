import { strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import { EXPORT_ROOT, type GeneratedFile } from './docs';

/** 允許的路徑：由程式產生的固定相對路徑，禁止 ..、絕對路徑與特殊字元。 */
const SAFE_PATH = /^(?!\/)(?!.*\.\.)(?!.*\/\/)[A-Za-z0-9._\-/]+$/;

export function assertSafePath(path: string): void {
  if (!SAFE_PATH.test(path) || path.length > 200) {
    throw new Error(`不安全的檔案路徑：${path}`);
  }
}

/**
 * 產生 ZIP（所有檔案放在固定根資料夾下）。
 * mtime 固定為匯出時間，使相同輸入得到相同內容。
 */
export function buildZip(files: GeneratedFile[], exportedAt: string, root = EXPORT_ROOT): Uint8Array {
  assertSafePath(root);
  const mtime = new Date(exportedAt);
  const tree: Zippable = {};
  for (const f of files) {
    assertSafePath(f.path);
    const full = `${root}/${f.path}`;
    if (full in tree) throw new Error(`重複的檔案路徑：${full}`);
    tree[full] = [strToU8(f.content), { mtime: Number.isNaN(mtime.getTime()) ? new Date(0) : mtime }];
  }
  return zipSync(tree, { level: 6 });
}

/** 讀回 ZIP 內容（測試用）。 */
export function readZip(data: Uint8Array): Record<string, string> {
  const out: Record<string, string> = {};
  const files = unzipSync(data);
  const dec = new TextDecoder();
  for (const [k, v] of Object.entries(files)) out[k] = dec.decode(v);
  return out;
}

/** 下載用檔名：只保留安全字元，中文名稱改用專案 ID 前綴。 */
export function zipFileName(projectName: string, projectId: string, revision: number): string {
  const ascii = projectName
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 40);
  const base = ascii || `project-${projectId.slice(0, 8)}`;
  return `ai-guide-${base}-r${revision}.zip`;
}
