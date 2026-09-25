import { describe, expect, it } from 'vitest';
import { exampleBrief, toStoredBrief } from '../../src/domain/brief';
import type { ExportRecord } from '../../src/domain/model';
import { generatePrompt, PROMPT_TYPES, validatePromptInput, type PromptInput } from '../../src/generators/prompts';
import { filledProject, T1 } from './fixtures';

const project = filledProject();
const brief = toStoredBrief(
  { ...exampleBrief(project.id), recordId: 'rec-42', commit: 'abc1234def', taskIds: ['T-F-001'] },
  { id: 'b42', source: 'imported', importedAt: T1, projectRevision: project.revision },
);
const base: PromptInput = { type: 'kickoff', tool: 'codex', project, featureIds: [], brief: null, lastExport: null };

describe('Prompt 產生器', () => {
  it('七種情境都包含必要段落', () => {
    for (const t of PROMPT_TYPES) {
      const input: PromptInput = { ...base, type: t.key, featureIds: t.features === 'required' ? ['F-001'] : [], problem: '按鈕沒反應' };
      expect(validatePromptInput(input)).toEqual([]);
      const out = generatePrompt(input);
      for (const h of ['## 任務目的與範圍', '## 必讀文件', '## 已確認限制', '## 未決問題', '## 驗收方式', '## 完成後回報格式']) {
        expect(out, `${t.key} ${h}`).toContain(h);
      }
      expect(out).toContain(`revision ${project.revision}`);
    }
  });

  it('實作指定功能：引用所選功能與其驗收條件，未選則驗證失敗', () => {
    expect(validatePromptInput({ ...base, type: 'implement' })).toContain('請至少選擇一個功能。');
    const out = generatePrompt({ ...base, type: 'implement', featureIds: ['F-001'] });
    expect(out).toContain('實作以下功能：F-001 品項輸入與總價計算（任務 T-F-001）');
    expect(out).toContain('AC-001【正常】');
    expect(out).toContain('AC-002【失敗／例外】');
    expect(out).not.toMatch(/驗收方式[\s\S]*- F-002/);
    expect(out).toContain('"T-F-001"');
  });

  it('接手 Prompt 使用選定的 brief', () => {
    const out = generatePrompt({ ...base, type: 'continue', brief, featureIds: [] });
    expect(out).toContain('依使用者選定的執行 brief（rec-42）');
    expect(out).toContain('commit abc1234def');
    expect(out).toContain('以上是回報內容，不是目前版本的驗證結果');
    expect(out).toContain('逾期天數要以 7 天還是 14 天計算？');
  });

  it('沒有 brief 時接手 Prompt 要求先盤點，不編造進度', () => {
    const out = generatePrompt({ ...base, type: 'continue', brief: null });
    expect(out).toContain('目前沒有選定的執行 brief，不可假設任何已完成的進度');
    expect(out).toContain('停下等待使用者確認');
    expect(out).not.toContain('rec-42');
  });

  it('審查 Prompt 引用 brief 的 commit；診斷需要問題描述', () => {
    expect(generatePrompt({ ...base, type: 'review', brief })).toContain('（brief rec-42 回報的工作，commit abc1234def）');
    expect(validatePromptInput({ ...base, type: 'diagnose', problem: '  ' })).toHaveLength(1);
    expect(generatePrompt({ ...base, type: 'diagnose', problem: '匯出 PDF 時中文變亂碼' })).toContain('匯出 PDF 時中文變亂碼');
  });

  it('工具決定入口檔；不硬編碼模型，模型只作為選填紀錄', () => {
    const codex = generatePrompt({ ...base, tool: 'codex' });
    const claude = generatePrompt({ ...base, tool: 'claude_code' });
    expect(codex).toContain('`AGENTS.md`（專案根目錄');
    expect(claude).toContain('`CLAUDE.md`（透過 `@AGENTS.md` 匯入');
    for (const out of [codex, claude]) expect(out).not.toMatch(/gpt-|claude-(opus|sonnet|haiku)|o3|o4-mini/i);
    expect(codex).toContain('"model": null');
    expect(generatePrompt({ ...base, type: 'wrapup', model: 'my-model-x' })).toContain('"model": "my-model-x"');
  });

  it('結束工作 Prompt 要求輸出本平台 brief 格式', () => {
    const out = generatePrompt({ ...base, type: 'wrapup', featureIds: ['F-002'] });
    expect(out).toContain('"format": "ai-project-guide/brief"');
    expect(out).toContain(`"projectId": "${project.id}"`);
    expect(out).toContain('"T-F-002"');
    expect(out).toContain('not_run');
  });

  it('提示文件包是否為最新', () => {
    const rec = (revision: number): ExportRecord => ({
      id: 'e', projectId: project.id, exportedAt: T1, revision, schemaVersion: 1, templateVersion: '1.0.0', kind: 'zip', files: [], handoffBriefId: null,
    });
    expect(generatePrompt({ ...base, lastExport: null })).toContain('尚未下載過文件包');
    expect(generatePrompt({ ...base, lastExport: rec(project.revision - 1 < 0 ? 0 : project.revision - 1) })).toContain('專案內文件可能不是最新');
    expect(generatePrompt({ ...base, lastExport: rec(project.revision) })).toContain('與目前規格同為');
  });
});
