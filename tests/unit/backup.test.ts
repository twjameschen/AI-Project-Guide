import { describe, expect, it } from 'vitest';
import { buildBackup, parseBackupText } from '../../src/domain/backup';
import { exampleBrief, toStoredBrief } from '../../src/domain/brief';
import { newUuid } from '../../src/domain/ids';
import { openRepo, type Repo } from '../../src/storage/repo';
import { filledProject, T0, T1 } from './fixtures';

async function seeded(): Promise<Repo> {
  const repo = await openRepo(`test-backup-${newUuid()}`);
  const p = filledProject();
  await repo.createProject(p.basics.name, T0, p.id);
  await repo.saveProject(p, T1);
  const b = toStoredBrief(exampleBrief(p.id), { id: 'brief-1', source: 'imported', importedAt: T1, projectRevision: 2 });
  await repo.addBrief(b);
  await repo.setHandoffBrief(p.id, 'brief-1', T1);
  await repo.addExport({ id: 'exp-1', projectId: p.id, exportedAt: T1, revision: 3, schemaVersion: 1, templateVersion: '1.0.0', kind: 'zip', files: ['START_HERE.md'], handoffBriefId: 'brief-1' });
  return repo;
}

describe('備份', () => {
  it('往返還原：匯出後在乾淨資料庫匯入，資料完全一致', async () => {
    const src = await seeded();
    const entries = await src.exportEntries();
    const text = JSON.stringify(buildBackup(entries, 'all', T1));
    const parsed = parseBackupText(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const dst = await openRepo(`test-backup-${newUuid()}`);
    const s = await dst.applyImport(parsed.value, {});
    expect(s).toEqual({ added: 1, replaced: 0, kept: 0, copied: 0 });
    expect(await dst.exportEntries()).toEqual(entries);
    src.close();
    dst.close();
  });

  it('衝突：保留現有／取代', async () => {
    const repo = await seeded();
    const backup = buildBackup(await repo.exportEntries(), 'all', T1);
    const pid = backup.projects[0].project.id;
    // 本機再修改，使現有與備份不同
    const cur = (await repo.getProject(pid))!;
    await repo.saveProject({ ...cur, basics: { ...cur.basics, name: '本機新名稱' } }, T1);

    expect(await repo.applyImport(backup, { [pid]: 'keep' })).toMatchObject({ kept: 1 });
    expect((await repo.getProject(pid))!.basics.name).toBe('本機新名稱');

    expect(await repo.applyImport(backup, { [pid]: 'replace' })).toMatchObject({ replaced: 1 });
    expect((await repo.getProject(pid))!.basics.name).toBe('報價單產生器');
    expect(await repo.listBriefs(pid)).toHaveLength(1);
    repo.close();
  });

  it('衝突：另存新專案時正確更新所有關聯 ID', async () => {
    const repo = await seeded();
    const backup = buildBackup(await repo.exportEntries(), 'all', T1);
    const pid = backup.projects[0].project.id;
    expect(await repo.applyImport(backup, { [pid]: 'copy' })).toMatchObject({ copied: 1 });
    const all = await repo.listProjects();
    expect(all).toHaveLength(2);
    const copy = all.find((p) => p.id !== pid)!;
    expect(copy.basics.name).toBe('報價單產生器（匯入副本）');
    const briefs = await repo.listBriefs(copy.id);
    expect(briefs).toHaveLength(1);
    expect(briefs[0].projectId).toBe(copy.id);
    expect(briefs[0].id).not.toBe('brief-1');
    expect(copy.handoffBriefId).toBe(briefs[0].id);
    const exports = await repo.listExports(copy.id);
    expect(exports).toHaveLength(1);
    expect(exports[0].handoffBriefId).toBe(briefs[0].id);
    // 原專案不受影響
    expect(await repo.listBriefs(pid)).toHaveLength(1);
    expect((await repo.getProject(pid))!.handoffBriefId).toBe('brief-1');
    repo.close();
  });

  it('拒絕未來版本、錯誤格式與內部關聯錯誤', async () => {
    const repo = await seeded();
    const backup = buildBackup(await repo.exportEntries(), 'all', T1);
    const future = parseBackupText(JSON.stringify({ ...backup, schemaVersion: 99 }));
    expect(future.ok).toBe(false);
    if (!future.ok) expect(future.errors[0]).toContain('較新的版本');
    expect(parseBackupText('not json').ok).toBe(false);
    expect(parseBackupText(JSON.stringify({ format: 'x' })).ok).toBe(false);
    const broken = structuredClone(backup);
    broken.projects[0].briefs[0].projectId = 'someone-else';
    const r = parseBackupText(JSON.stringify(broken));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toContain('projectId 與專案不符');
    const badField = structuredClone(backup) as unknown as { projects: { project: { revision: unknown } }[] };
    badField.projects[0].project.revision = '<script>';
    expect(parseBackupText(JSON.stringify(badField)).ok).toBe(false);
    repo.close();
  });

  it('刪除專案一併刪除 brief 與匯出紀錄', async () => {
    const repo = await seeded();
    const pid = filledProject().id;
    expect(await repo.relatedCounts(pid)).toEqual({ briefs: 1, exports: 1 });
    await repo.deleteProject(pid);
    expect(await repo.getProject(pid)).toBeUndefined();
    expect(await repo.relatedCounts(pid)).toEqual({ briefs: 0, exports: 0 });
    repo.close();
  });
});
