import { describe, expect, it } from 'vitest';
import { BRIEF_MAX_BYTES, exampleBrief, parseBriefText, toStoredBrief } from '../../src/domain/brief';
import { newUuid } from '../../src/domain/ids';
import { openRepo } from '../../src/storage/repo';
import { T0, T1 } from './fixtures';

const PID = 'proj-1';
const valid = () => ({ ...exampleBrief(PID) });

describe('brief 驗證', () => {
  it('接受正確格式', () => {
    const r = parseBriefText(JSON.stringify(valid()), PID);
    expect(r.ok).toBe(true);
  });

  it('拒絕錯誤 JSON', () => {
    const r = parseBriefText('{ "format": ', PID);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toContain('不是有效的 JSON');
  });

  it('拒絕非本平台格式（例如聊天紀錄）', () => {
    const r = parseBriefText(JSON.stringify({ messages: [{ role: 'assistant', content: '完成了' }] }), PID);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toContain('不是 AI Project Guide 的 brief 格式');
  });

  it('拒絕不支援的版本', () => {
    const r = parseBriefText(JSON.stringify({ ...valid(), formatVersion: 2 }), PID);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toContain('不支援的 brief 版本');
  });

  it('拒絕錯誤專案', () => {
    const r = parseBriefText(JSON.stringify({ ...valid(), projectId: 'other' }), PID);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toContain('此 brief 屬於其他專案');
  });

  it('拒絕不允許的測試結果與缺少欄位，並指出欄位', () => {
    const bad = valid() as Record<string, unknown>;
    bad.tests = [{ command: 'npm test', environment: '', result: 'success', evidence: '' }];
    delete bad.summary;
    const r = parseBriefText(JSON.stringify(bad), PID);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.join('\n')).toContain('tests.0.result');
      expect(r.errors.join('\n')).toContain('summary');
    }
  });

  it('拒絕過大的檔案', () => {
    const r = parseBriefText(JSON.stringify({ ...valid(), summary: 'x'.repeat(BRIEF_MAX_BYTES) }), PID);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toContain('檔案過大');
  });

  it('相同紀錄 ID 重複匯入不重複新增', async () => {
    const repo = await openRepo(`test-brief-${newUuid()}`);
    await repo.createProject('p', T0, PID);
    const file = valid();
    const mk = () => toStoredBrief(file, { id: newUuid(), source: 'imported', importedAt: T1, projectRevision: 1 });
    expect((await repo.addBrief(mk())).status).toBe('added');
    expect((await repo.addBrief(mk())).status).toBe('duplicate');
    expect(await repo.listBriefs(PID)).toHaveLength(1);
    repo.close();
  });

  it('匯入 brief 不修改產品規格；刪除接手依據的 brief 會清除接手依據', async () => {
    const repo = await openRepo(`test-brief-${newUuid()}`);
    const p = await repo.createProject('p', T0, PID);
    const b = toStoredBrief(valid(), { id: 'b1', source: 'imported', importedAt: T1, projectRevision: 1 });
    await repo.addBrief(b);
    const after = await repo.getProject(PID);
    expect(after).toEqual(p);
    await repo.setHandoffBrief(PID, 'b1', T1);
    expect((await repo.getProject(PID))?.handoffBriefId).toBe('b1');
    await repo.deleteBrief('b1', T1);
    expect((await repo.getProject(PID))?.handoffBriefId).toBeNull();
    repo.close();
  });
});
