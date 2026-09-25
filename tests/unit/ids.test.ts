import { describe, expect, it } from 'vitest';
import { allocateId } from '../../src/domain/ids';
import { createEmptyProject } from '../../src/domain/model';
import { generateDocs } from '../../src/generators/docs';
import { filledProject, T0, T1 } from './fixtures';

describe('穩定 ID', () => {
  it('配發後刪除不重用，計數器只增不減', () => {
    const p = createEmptyProject('x', 'x', T0);
    const a = allocateId(p.counters, 'feature');
    const b = allocateId(a.counters, 'feature');
    expect([a.id, b.id]).toEqual(['F-001', 'F-002']);
    // 刪除 F-002 後再新增，仍是 F-003
    const c = allocateId(b.counters, 'feature');
    expect(c.id).toBe('F-003');
  });

  it('調整功能順序不改變 ID，文件中功能與驗收仍正確對應', () => {
    const p = filledProject();
    const reordered = { ...p, features: [...p.features].reverse() };
    expect(reordered.features.map((f) => f.id).sort()).toEqual(p.features.map((f) => f.id).sort());
    const acc = generateDocs({ project: reordered, briefs: [], exportedAt: T1 }).find((f) => f.path === 'docs/acceptance.md')!.content;
    const f1Section = acc.slice(acc.indexOf('### F-001'), acc.indexOf('###', acc.indexOf('### F-001') + 5));
    expect(f1Section).toContain('AC-001');
    expect(f1Section).toContain('AC-002');
    const tasks = generateDocs({ project: reordered, briefs: [], exportedAt: T1 }).find((f) => f.path === 'docs/tasks.md')!.content;
    expect(tasks).toMatch(/### T-F-001 實作 F-001[\s\S]*驗收條件：AC-001、AC-002/);
  });
});
