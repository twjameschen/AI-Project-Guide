import { useState } from 'react';
import { Link } from 'react-router';
import { CopyButton } from '../../components/CopyButton';
import { sortBriefsNewestFirst } from '../../domain/brief';
import { BRIEF_TOOL_LABEL, SCOPE_LABEL } from '../../domain/labels';
import { formatDateTime } from '../../domain/time';
import { PROMPT_TOOL_LABEL, PROMPT_TYPES, generatePrompt, validatePromptInput, type PromptTool, type PromptType } from '../../generators/prompts';
import { downloadFile } from '../../lib/download';
import { StaleExportNotice, useProjectCtx } from './ProjectLayout';

const NO_BRIEF = '__none__';

export function PromptsPage() {
  const { project, briefs, exports } = useProjectCtx();
  const [type, setType] = useState<PromptType>(project.basics.kind === 'existing' ? 'inventory' : 'kickoff');
  const [tool, setTool] = useState<PromptTool>(project.aiWork.preferredTool === 'claude_code' ? 'claude_code' : 'codex');
  const [featureIds, setFeatureIds] = useState<string[]>([]);
  const [briefChoice, setBriefChoice] = useState<string | null>(null);
  const [problem, setProblem] = useState('');
  const [model, setModel] = useState('');

  const def = PROMPT_TYPES.find((t) => t.key === type)!;
  const sorted = sortBriefsNewestFirst(briefs);
  // 預設使用「接手依據」；使用者可改選其他紀錄或不使用。
  const briefId = briefChoice ?? project.handoffBriefId ?? NO_BRIEF;
  const brief = def.usesBrief ? (briefs.find((b) => b.id === briefId) ?? null) : null;
  const features = project.features.filter((f) => f.scope !== 'out');
  const validFeatureIds = featureIds.filter((id) => project.features.some((f) => f.id === id));

  const input = {
    type,
    tool,
    project,
    featureIds: def.features === 'none' ? [] : validFeatureIds,
    brief,
    problem,
    model,
    lastExport: exports[0] ?? null,
  };
  const errors = validatePromptInput(input);
  const prompt = errors.length === 0 ? generatePrompt(input) : '';

  return (
    <div className="stack">
      <StaleExportNotice project={project} exports={exports} />
      <div className="docs-layout">
        <section className="card" aria-labelledby="prompt-options">
          <h2 id="prompt-options">產生 Prompt</h2>
          <p className="small muted">依專案資料以固定模板產生文字，複製後貼到 Codex 或 Claude Code。本網站不會執行任何開發工作。</p>
          <div className="field">
            <label htmlFor="prompt-type">情境</label>
            <select id="prompt-type" value={type} onChange={(e) => setType(e.target.value as PromptType)}>
              {PROMPT_TYPES.map((t, i) => (
                <option key={t.key} value={t.key}>
                  {i + 1}. {t.title}
                </option>
              ))}
            </select>
            <p className="hint" style={{ marginTop: 6 }}>
              {def.description}
            </p>
          </div>
          <fieldset className="field">
            <legend>目標工具</legend>
            <div className="choice-row">
              {(['codex', 'claude_code'] as PromptTool[]).map((t) => (
                <label key={t}>
                  <input type="radio" name="prompt-tool" checked={tool === t} onChange={() => setTool(t)} />
                  {PROMPT_TOOL_LABEL[t]}
                </label>
              ))}
            </div>
            <p className="hint">工具決定 Prompt 引用的入口檔（Codex：AGENTS.md；Claude Code：CLAUDE.md）。不指定模型。</p>
          </fieldset>

          {def.features !== 'none' && (
            <fieldset className="field">
              <legend>
                功能{def.features === 'required' ? <span className="req">至少選一項</span> : <span className="opt">選填，不選則以全部第一版功能為驗收範圍</span>}
              </legend>
              {features.length === 0 ? (
                <p className="muted small">尚未列出功能。</p>
              ) : (
                <div className="stack" style={{ gap: 4 }}>
                  {features.map((f) => (
                    <label key={f.id} style={{ display: 'flex', gap: 8, fontWeight: 400 }}>
                      <input
                        type="checkbox"
                        style={{ width: 'auto' }}
                        checked={validFeatureIds.includes(f.id)}
                        onChange={(e) => setFeatureIds(e.target.checked ? [...validFeatureIds, f.id] : validFeatureIds.filter((x) => x !== f.id))}
                      />
                      <span>
                        <span className="id-chip">{f.id}</span> {f.title || '（未命名）'} <span className="muted small">{SCOPE_LABEL[f.scope]}</span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </fieldset>
          )}

          {def.usesBrief && (
            <div className="field">
              <label htmlFor="prompt-brief">依據的執行 brief</label>
              <select id="prompt-brief" value={briefs.some((b) => b.id === briefId) ? briefId : NO_BRIEF} onChange={(e) => setBriefChoice(e.target.value)}>
                <option value={NO_BRIEF}>不使用 brief（要求先盤點現況）</option>
                {sorted.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.recordId}・{BRIEF_TOOL_LABEL[b.tool]}・{formatDateTime(b.occurredAt)}
                    {b.id === project.handoffBriefId ? '（接手依據）' : ''}
                    {b.isDemo ? '（示範）' : ''}
                  </option>
                ))}
              </select>
              {briefs.length === 0 ? (
                <p className="hint" style={{ marginTop: 6 }}>
                  尚未匯入任何 brief，Prompt 會要求先盤點，不會假設已有進度。<Link to="../briefs">匯入 brief</Link>
                </p>
              ) : (
                !brief && <p className="hint" style={{ marginTop: 6 }}>未選擇 brief：Prompt 會要求先盤點現況。</p>
              )}
            </div>
          )}

          {def.needsProblem && (
            <div className="field">
              <label htmlFor="prompt-problem">
                問題描述<span className="req">必填</span>
              </label>
              <p className="why">現象、重現步驟、錯誤訊息。越具體越容易診斷。</p>
              <textarea id="prompt-problem" rows={4} value={problem} onChange={(e) => setProblem(e.target.value)} maxLength={5000} />
              <p className="example">例：手機上按「送出」沒有反應，桌機正常；主控台顯示 TypeError。</p>
            </div>
          )}

          <div className="field">
            <label htmlFor="prompt-model">
              模型紀錄<span className="opt">選填</span>
            </label>
            <p className="why">只寫入 brief 範本的 model 欄位，方便日後追溯；不影響 Prompt 內容。</p>
            <input id="prompt-model" value={model} onChange={(e) => setModel(e.target.value)} maxLength={200} />
          </div>
        </section>

        <section className="card" aria-labelledby="prompt-output-title">
          <div className="row-between" style={{ marginBottom: 8 }}>
            <h2 id="prompt-output-title" style={{ margin: 0 }}>
              {def.title}（{PROMPT_TOOL_LABEL[tool]}）
            </h2>
            {prompt && (
              <div className="row">
                <CopyButton text={prompt} label={type === 'continue' ? '複製接手指令' : '複製 Prompt'} className="btn btn-primary" testId="copy-prompt" />
                <button type="button" className="btn" onClick={() => downloadFile(`prompt-${type}-${tool}.md`, prompt, 'text/markdown;charset=utf-8')}>
                  下載 .md
                </button>
              </div>
            )}
          </div>
          {errors.length > 0 ? (
            <div className="notice notice-warn" role="alert">
              <ul style={{ margin: 0 }}>
                {errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          ) : (
            <>
              <label htmlFor="prompt-output" className="visually-hidden">
                產生的 Prompt
              </label>
              <textarea id="prompt-output" className="prompt-output" readOnly value={prompt} data-testid="prompt-output" />
            </>
          )}
        </section>
      </div>
    </div>
  );
}
