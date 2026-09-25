import { describe, expect, it } from 'vitest';
import { createEmptyProject } from '../../src/domain/model';
import { runRuleCheck } from '../../src/domain/ruleCheck';
import { filledProject, partialProject, T0 } from './fixtures';

const codes = (p: Parameters<typeof runRuleCheck>[0]) => runRuleCheck(p).issues.map((i) => i.code);

describe('規則檢查', () => {
  it('空白專案：缺目的、缺使用者、缺流程、缺功能', () => {
    const c = codes(createEmptyProject('x', '', T0));
    expect(c).toEqual(expect.arrayContaining(['name-missing', 'purpose-missing', 'users-missing', 'flow-missing', 'feature-missing']));
  });

  it('第一版功能沒有驗收條件時列為缺漏，並可返回驗收步驟', () => {
    const r = runRuleCheck(filledProject());
    const issue = r.issues.find((i) => i.code === 'feature-no-ac:F-002');
    expect(issue?.level).toBe('missing');
    expect(issue?.step).toBe(6);
    expect(issue?.fieldId).toBe('ac-feature-F-002');
    // 不在範圍的功能不要求驗收條件
    expect(r.issues.some((i) => i.code === 'feature-no-ac:F-003')).toBe(false);
  });

  it('目的標記為尚未決定：不是缺漏而是待決定，且不計入必要項目完成', () => {
    const p = partialProject();
    p.purpose.problem = { mode: 'undecided', text: '' };
    const r = runRuleCheck(p);
    expect(r.issues.some((i) => i.code === 'purpose-missing')).toBe(false);
    expect(r.openQuestions.map((i) => i.code)).toContain('open:purpose-problem');
    expect(r.required.find((x) => x.key === 'purpose')?.done).toBe(false);
  });

  it('有兩個以上角色且權限未說明時列為缺漏；補上存取限制後消失', () => {
    const p = filledProject();
    p.rules.roles = [
      { id: 'RO-001', name: '業務', permissions: '' },
      { id: 'RO-002', name: '主管', permissions: '可看全部' },
    ];
    expect(codes(p)).toContain('roles-no-permission');
    p.rules.accessNotes = { mode: 'answer', text: '業務只能看自己的報價單' };
    expect(codes(p)).not.toContain('roles-no-permission');
  });

  it('關鍵技術待決定時列為待決定項目', () => {
    const r = runRuleCheck(partialProject());
    expect(r.openQuestions.map((i) => i.code)).toEqual(expect.arrayContaining(['open:tech-stack', 'open:tech-deployment']));
    expect(r.isDraft).toBe(true);
  });

  it('不安全或格式錯誤的網址列為提醒，並指向對應欄位', () => {
    const p = filledProject();
    p.basics.repoUrl = 'javascript:alert(1)';
    p.tech.references = [
      { id: 'REF-001', url: 'data:text/html,x', note: '' },
      { id: 'REF-002', url: 'https://example.com', note: '' },
    ];
    const r = runRuleCheck(p);
    expect(r.issues.find((i) => i.code === 'invalid-url:repo')).toMatchObject({ level: 'notice', fieldId: 'basics-repoUrl' });
    expect(r.issues.find((i) => i.code === 'invalid-url:REF-001')).toMatchObject({ level: 'notice', fieldId: 'ref-REF-001-url' });
    expect(r.issues.some((i) => i.code === 'invalid-url:REF-002')).toBe(false);
  });
});
