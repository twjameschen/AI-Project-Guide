import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newUuid } from '../../src/domain/ids';
import { Autosaver, type SaveState } from '../../src/storage/autosave';
import { openRepo } from '../../src/storage/repo';
import { T0, T1 } from './fixtures';

describe('revision', () => {
  it('只有內容變更才遞增 revision；切換步驟、封存、確認摘要不遞增', async () => {
    const repo = await openRepo(`test-rev-${newUuid()}`);
    const p = await repo.createProject('A', T0);
    expect(p.revision).toBe(1);
    const same = await repo.saveProject({ ...p, wizardStep: 3 }, T1);
    expect(same.revision).toBe(1);
    expect(same.updatedAt).toBe(T0);
    const changed = await repo.saveProject({ ...same, basics: { ...same.basics, summary: 'x' } }, T1);
    expect(changed.revision).toBe(2);
    expect(changed.updatedAt).toBe(T1);
    expect((await repo.setArchived(p.id, true, T1)).revision).toBe(2);
    const confirmed = await repo.confirmSummary(p.id, T1);
    expect(confirmed.revision).toBe(2);
    expect(confirmed.summaryConfirmedRevision).toBe(2);
    repo.close();
  });
});

describe('自動保存', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('延遲後保存最新值，多次輸入只保存一次', async () => {
    const saved: number[] = [];
    const states: SaveState['status'][] = [];
    const a = new Autosaver<number>({ save: async (v) => void saved.push(v), onState: (s) => states.push(s.status), delayMs: 500 });
    a.schedule(1);
    a.schedule(2);
    a.schedule(3);
    expect(saved).toEqual([]);
    await vi.advanceTimersByTimeAsync(500);
    expect(saved).toEqual([3]);
    expect(states.at(-1)).toBe('saved');
  });

  it('保存失敗時顯示錯誤、不顯示成功，重試可恢復', async () => {
    let fail = true;
    const saved: number[] = [];
    let last: SaveState | null = null;
    const a = new Autosaver<number>({
      save: async (v) => {
        if (fail) throw new Error('QuotaExceededError');
        saved.push(v);
      },
      onState: (s) => (last = s),
      delayMs: 100,
    });
    a.schedule(7);
    await vi.advanceTimersByTimeAsync(100);
    expect(last!.status).toBe('error');
    expect(last!.error).toContain('QuotaExceededError');
    expect(a.dirty).toBe(true);
    fail = false;
    await a.retry();
    expect(saved).toEqual([7]);
    expect(last!.status).toBe('saved');
    expect(a.dirty).toBe(false);
  });

  it('保存中又有新輸入時，完成後再保存最新值', async () => {
    const saved: number[] = [];
    let release: () => void = () => {};
    const a = new Autosaver<number>({
      save: (v) =>
        new Promise<void>((res) => {
          saved.push(v);
          release = res;
        }),
      onState: () => {},
      delayMs: 10,
    });
    a.schedule(1);
    await vi.advanceTimersByTimeAsync(10);
    a.schedule(2);
    release();
    await vi.advanceTimersByTimeAsync(20);
    release();
    await a.flush();
    expect(saved).toEqual([1, 2]);
  });
});
