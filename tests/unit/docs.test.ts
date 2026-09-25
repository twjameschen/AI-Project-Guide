import { describe, expect, it } from 'vitest';
import { toStoredBrief, exampleBrief } from '../../src/domain/brief';
import { TEMPLATE_VERSION } from '../../src/domain/model';
import { generateDocs, MERGE_END, MERGE_START } from '../../src/generators/docs';
import { buildZip, readZip } from '../../src/generators/zip';
import { filledProject, partialProject, T1 } from './fixtures';

const REQUIRED = [
  'START_HERE.md',
  'AGENTS.md',
  'CLAUDE.md',
  'docs/product.md',
  'docs/acceptance.md',
  'docs/architecture.md',
  'docs/tasks.md',
  'docs/decisions.md',
  'docs/ai-workflow.md',
  'docs/handoff.md',
];

const get = (files: ReturnType<typeof generateDocs>, path: string) => {
  const f = files.find((x) => x.path === path);
  if (!f) throw new Error(`missing ${path}`);
  return f.content;
};

describe('文件生成', () => {
  it('產生所有必要文件，內容來自使用者輸入', () => {
    const files = generateDocs({ project: filledProject(), briefs: [], exportedAt: T1 });
    for (const path of REQUIRED) expect(files.map((f) => f.path)).toContain(path);
    const product = get(files, 'docs/product.md');
    expect(product).toContain('【使用者確認】業務用 Excel 手動複製報價，常算錯總價。');
    expect(product).toContain('**F-001** 品項輸入與總價計算');
    expect(product).toMatch(/### FL-001 建立報價單[\s\S]*1\. 選客戶\n\s+2\. 加入品項/);
    expect(get(files, 'docs/acceptance.md')).toContain('**AC-002**【失敗／例外】');
  });

  it('每份文件標示匯出快照、schemaVersion、templateVersion、revision 與時間', () => {
    const p = filledProject();
    const files = generateDocs({ project: p, briefs: [], exportedAt: T1 });
    for (const path of REQUIRED.filter((x) => !['AGENTS.md', 'CLAUDE.md'].includes(x))) {
      const c = get(files, path);
      expect(c, path).toContain('匯出快照');
      expect(c, path).toContain(`revision ${p.revision}`);
      expect(c, path).toContain(`templateVersion ${TEMPLATE_VERSION}`);
      expect(c, path).toContain(T1);
    }
    const manifest = JSON.parse(get(files, 'ai-guide-export.json'));
    expect(manifest).toMatchObject({ snapshot: true, revision: p.revision, schemaVersion: 1, templateVersion: TEMPLATE_VERSION, exportedAt: T1 });
  });

  it('未選架構時不虛構架構，列出待提案問題', () => {
    const arch = get(generateDocs({ project: partialProject(), briefs: [], exportedAt: T1 }), 'docs/architecture.md');
    expect(arch).toContain('## 尚未選定架構');
    expect(arch).toContain('不包含任何架構決定');
    expect(arch).toContain('【待決定・希望 AI 提案】');
    // 不應出現任何具體技術名稱被寫成決定
    for (const tech of ['React', 'Vue', 'Django', 'FastAPI', 'Next.js', 'PostgreSQL', 'Firebase', 'Supabase']) {
      expect(arch).not.toContain(tech);
    }
  });

  it('未決資訊不會被寫成已確認決策', () => {
    const p = partialProject();
    p.tech.deployment = { mode: 'undecided', text: '也許用 AWS' };
    const files = generateDocs({ project: p, briefs: [], exportedAt: T1 });
    const decisions = get(files, 'docs/decisions.md');
    const confirmedSection = decisions.slice(decisions.indexOf('## 已確認決策'), decisions.indexOf('## 待決定事項'));
    expect(confirmedSection).not.toContain('AWS');
    expect(confirmedSection).not.toContain('部署環境');
    expect(decisions).toMatch(/## 待決定事項[\s\S]*部署環境（關鍵技術）：尚未決定/);
    expect(get(files, 'docs/architecture.md')).toContain('【待決定】尚未決定。使用者備註：也許用 AWS');
  });

  it('tasks.md 只來自已填的第一版功能，不自行加入付款、會員、聊天', () => {
    const tasks = get(generateDocs({ project: filledProject(), briefs: [], exportedAt: T1 }), 'docs/tasks.md');
    const taskHeadings = tasks.match(/^### T-.*$/gm) ?? [];
    expect(taskHeadings).toEqual(['### T-F-001 實作 F-001 品項輸入與總價計算', '### T-F-002 實作 F-002 匯出 PDF']);
    const taskSection = tasks.slice(tasks.indexOf('## 第一版任務'), tasks.indexOf('## 之後再做'));
    for (const word of ['付款', '會員', '聊天', '登入']) expect(taskSection).not.toContain(word);
    // 不在範圍的功能列為不得實作，而非任務
    expect(tasks).toMatch(/## 不在範圍（不得實作）\n\n- F-003 電子簽章/);
  });

  it('AGENTS.md 與 CLAUDE.md 是精簡入口：有合併標記、指向 docs/、CLAUDE.md 以 @AGENTS.md 匯入', () => {
    const files = generateDocs({ project: filledProject(), briefs: [], exportedAt: T1 });
    const agents = get(files, 'AGENTS.md');
    const claude = get(files, 'CLAUDE.md');
    for (const c of [agents, claude]) {
      expect(c.startsWith(MERGE_START)).toBe(true);
      expect(c.trim().endsWith(MERGE_END)).toBe(true);
      expect(c.split('\n').length).toBeLessThan(45);
    }
    expect(agents).toContain('docs/ai-workflow.md');
    expect(agents).toContain('不得以跳過測試、刪除或削弱斷言、吞掉錯誤');
    expect(claude).toMatch(/^@AGENTS\.md$/m);
    // CLAUDE.md 不複製 AGENTS.md 的規則
    expect(claude).not.toContain('不得以跳過測試');
  });

  it('ai-workflow.md 包含工作流程要求、測試誠信與 brief 格式', () => {
    const wf = get(generateDocs({ project: filledProject(), briefs: [], exportedAt: T1 }), 'docs/ai-workflow.md');
    for (const s of ['先讀現況', '小步實作', '依風險驗證', '提供證據', '更新交接', '標記「未驗證」', '"format": "ai-project-guide/brief"', '"projectId": "proj-1"']) {
      expect(wf).toContain(s);
    }
  });

  it('沒有 brief 時 handoff 要求先盤點，不編造進度；選定 brief 時引用並標示未綁定版本', () => {
    const p = filledProject();
    const none = get(generateDocs({ project: p, briefs: [], exportedAt: T1 }), 'docs/handoff.md');
    expect(none).toContain('尚未匯入任何執行 brief');
    expect(none).toContain('不可假設已有任何開發進度');

    const b = toStoredBrief({ ...exampleBrief(p.id), recordId: 'r-1' }, { id: 'b1', source: 'imported', importedAt: T1, projectRevision: p.revision });
    const withBrief = get(generateDocs({ project: { ...p, handoffBriefId: 'b1' }, briefs: [b], exportedAt: T1 }), 'docs/handoff.md');
    expect(withBrief).toContain('紀錄 ID：`r-1`');
    expect(withBrief).toContain('尚未綁定版本（沒有 commit）');
    expect(withBrief).toContain('不代表目前版本的測試結果');
    expect(withBrief).toContain('匯入回報（JSON）');
  });

  it('同一輸入與固定時間產生完全相同的輸出（含 ZIP 位元組）', () => {
    const a = generateDocs({ project: filledProject(), briefs: [], exportedAt: T1 });
    const b = generateDocs({ project: filledProject(), briefs: [], exportedAt: T1 });
    expect(a).toEqual(b);
    expect(Buffer.from(buildZip(a, T1)).equals(Buffer.from(buildZip(b, T1)))).toBe(true);
  });

  it('修改需求後文件隨之更新', () => {
    const p = filledProject();
    const before = get(generateDocs({ project: p, briefs: [], exportedAt: T1 }), 'docs/product.md');
    const edited = { ...p, revision: p.revision + 1, features: p.features.map((f) => (f.id === 'F-002' ? { ...f, title: '匯出 Excel' } : f)) };
    const after = get(generateDocs({ project: edited, briefs: [], exportedAt: T1 }), 'docs/product.md');
    expect(before).toContain('匯出 PDF');
    expect(after).toContain('**F-002** 匯出 Excel');
    expect(after).toContain(`revision ${p.revision + 1}`);
  });

  it('Skills：共用流程只在 docs/workflows，入口符合 Agent Skills frontmatter 規則', () => {
    const files = generateDocs({ project: filledProject(), briefs: [], exportedAt: T1 });
    const skillFiles = files.filter((f) => f.path.endsWith('/SKILL.md'));
    expect(skillFiles.map((f) => f.path)).toEqual([
      '.claude/skills/project-takeover/SKILL.md',
      '.claude/skills/verify-and-complete/SKILL.md',
      '.claude/skills/review-changes/SKILL.md',
      '.agents/skills/project-takeover/SKILL.md',
      '.agents/skills/verify-and-complete/SKILL.md',
      '.agents/skills/review-changes/SKILL.md',
    ]);
    for (const f of skillFiles) {
      const dir = f.path.split('/').at(-2)!;
      const fm = f.content.match(/^---\nname: (.+)\ndescription: (.+)\n---\n/);
      expect(fm, f.path).not.toBeNull();
      expect(fm![1]).toBe(dir);
      expect(fm![1]).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      const desc = JSON.parse(fm![2]) as string;
      expect(desc.length).toBeGreaterThan(0);
      expect(desc.length).toBeLessThanOrEqual(1024);
      expect(f.content).toContain(`docs/workflows/${dir}.md`);
    }
    const wf = get(files, 'docs/workflows/verify-and-complete.md');
    for (const h of ['## 用途', '## 觸發條件', '## 輸入', '## 步驟', '## 輸出', '## 失敗處理']) expect(wf).toContain(h);
  });

  it('只偏好 Codex 時只產生 .agents/skills 入口；可關閉 skills', () => {
    const p = { ...filledProject(), aiWork: { ...filledProject().aiWork, preferredTool: 'codex' as const } };
    const files = generateDocs({ project: p, briefs: [], exportedAt: T1 });
    expect(files.some((f) => f.path.startsWith('.claude/'))).toBe(false);
    expect(files.some((f) => f.path.startsWith('.agents/'))).toBe(true);
    const none = generateDocs({ project: p, briefs: [], exportedAt: T1, workflows: [] });
    expect(none.some((f) => f.path.includes('SKILL.md') || f.path.startsWith('docs/workflows/'))).toBe(false);
  });

  it('ZIP 內容：固定根資料夾，檔案與生成結果一致', () => {
    const files = generateDocs({ project: filledProject(), briefs: [], exportedAt: T1 });
    const unzipped = readZip(buildZip(files, T1));
    expect(Object.keys(unzipped).sort()).toEqual(files.map((f) => `ai-guide-export/${f.path}`).sort());
    expect(unzipped['ai-guide-export/docs/product.md']).toBe(get(files, 'docs/product.md'));
  });
});
