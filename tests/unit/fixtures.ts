import { allocateId } from '../../src/domain/ids';
import { createEmptyProject, type Project } from '../../src/domain/model';

export const T0 = '2026-01-01T00:00:00.000Z';
export const T1 = '2026-02-01T08:30:00.000Z';

/** 建立只填部分欄位的專案（刻意留下未決事項）。 */
export function partialProject(): Project {
  const p = createEmptyProject('proj-1', '報價單產生器', T0);
  return {
    ...p,
    basics: { ...p.basics, summary: '業務輸入品項後產生 PDF 報價單。', kind: 'new', productType: 'internal_tool' },
    purpose: {
      ...p.purpose,
      problem: { mode: 'answer', text: '業務用 Excel 手動複製報價，常算錯總價。' },
      users: { mode: 'answer', text: '5 位業務' },
    },
    tech: {
      ...p.tech,
      stack: { mode: 'ai_propose', text: '希望免費' },
      deployment: { mode: 'undecided', text: '' },
    },
  };
}

/** 加上一個流程、兩個功能與驗收條件。 */
export function filledProject(): Project {
  let p = partialProject();
  let c = p.counters;
  const fl = allocateId(c, 'flow');
  c = fl.counters;
  const f1 = allocateId(c, 'feature');
  c = f1.counters;
  const f2 = allocateId(c, 'feature');
  c = f2.counters;
  const f3 = allocateId(c, 'feature');
  c = f3.counters;
  const ac1 = allocateId(c, 'acceptance');
  c = ac1.counters;
  const ac2 = allocateId(c, 'acceptance');
  c = ac2.counters;
  p = {
    ...p,
    counters: c,
    flows: [{ id: fl.id, title: '建立報價單', start: '業務接到詢價', steps: '選客戶\n加入品項\n按「產生 PDF」', expected: '下載 PDF，總價正確' }],
    features: [
      { id: f1.id, title: '品項輸入與總價計算', description: '輸入數量與單價，自動加總。', priority: 'high', scope: 'v1', flowIds: [fl.id] },
      { id: f2.id, title: '匯出 PDF', description: '', priority: 'medium', scope: 'v1', flowIds: [fl.id] },
      { id: f3.id, title: '電子簽章', description: '', priority: 'low', scope: 'out', flowIds: [] },
    ],
    acceptance: [
      { id: ac1.id, featureId: f1.id, kind: 'normal', scenario: '兩個品項', action: '輸入數量 2 與單價 100', expected: '總價顯示 400' },
      { id: ac2.id, featureId: f1.id, kind: 'failure', scenario: '數量為負數', action: '輸入 -1', expected: '顯示「數量需大於 0」' },
    ],
  };
  return p;
}
