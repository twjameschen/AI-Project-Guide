import { useMemo, useState } from 'react';
import { useRepo } from '../../app/repoContext';
import { useToast } from '../../app/toast';
import { CopyButton } from '../../components/CopyButton';
import { MarkdownPreview } from '../../components/MarkdownPreview';
import { newUuid } from '../../domain/ids';
import { SCHEMA_VERSION, TEMPLATE_VERSION, type ExportRecord } from '../../domain/model';
import { formatDateTime, nowIso } from '../../domain/time';
import { defaultSkillTargets, generateDocs, type GeneratedFile } from '../../generators/docs';
import { WORKFLOWS, type SkillTarget, type WorkflowKey } from '../../generators/workflows';
import { buildZip, zipFileName } from '../../generators/zip';
import { downloadFile } from '../../lib/download';
import { StaleExportNotice, useProjectCtx } from './ProjectLayout';

function singleFileName(path: string) {
  const parts = path.split('/');
  const base = parts[parts.length - 1];
  return base === 'SKILL.md' ? `${parts[parts.length - 2]}-SKILL.md` : base;
}

export function DocsPage() {
  const { project, briefs, exports } = useProjectCtx();
  const repo = useRepo();
  const notify = useToast();
  // 預覽用固定時間（開啟此頁的時間）；下載時使用實際下載時間重新產生。
  const [previewAt] = useState(() => nowIso());
  const [workflows, setWorkflows] = useState<WorkflowKey[]>(WORKFLOWS.map((w) => w.key));
  const [targets, setTargets] = useState<SkillTarget[]>(() => defaultSkillTargets(project));
  const [selected, setSelected] = useState('START_HERE.md');
  const [view, setView] = useState<'rendered' | 'raw'>('rendered');

  const options = { workflows, skillTargets: targets };
  const files = useMemo(
    () => generateDocs({ project, briefs, exportedAt: previewAt, workflows, skillTargets: targets }),
    [project, briefs, previewAt, workflows, targets],
  );
  const current = files.find((f) => f.path === selected) ?? files[0];

  const record = async (kind: ExportRecord['kind'], exportedAt: string, list: GeneratedFile[]) => {
    await repo.addExport({
      id: newUuid(),
      projectId: project.id,
      exportedAt,
      revision: project.revision,
      schemaVersion: SCHEMA_VERSION,
      templateVersion: TEMPLATE_VERSION,
      kind,
      files: list.map((f) => f.path),
      handoffBriefId: project.handoffBriefId,
    });
  };

  const downloadZip = async () => {
    try {
      const at = nowIso();
      const fresh = generateDocs({ project, briefs, exportedAt: at, ...options });
      const zip = buildZip(fresh, at);
      downloadFile(zipFileName(project.basics.name, project.id, project.revision), zip, 'application/zip');
      await record('zip', at, fresh);
      notify('success', `已下載文件包（${fresh.length} 個檔案，revision ${project.revision}）。`);
    } catch (e) {
      notify('error', `下載失敗：${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const downloadOne = async (path: string) => {
    try {
      const at = nowIso();
      const fresh = generateDocs({ project, briefs, exportedAt: at, ...options });
      const f = fresh.find((x) => x.path === path);
      if (!f) throw new Error('找不到檔案');
      downloadFile(singleFileName(f.path), f.content, f.path.endsWith('.json') ? 'application/json' : 'text/markdown;charset=utf-8');
      await record('file', at, [f]);
      notify('success', `已下載 ${f.path}。`);
    } catch (e) {
      notify('error', `下載失敗：${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const toggle = <T,>(list: T[], v: T, on: boolean) => (on ? [...list, v] : list.filter((x) => x !== v));

  return (
    <div className="stack">
      <StaleExportNotice project={project} exports={exports} />

      <section className="card">
        <div className="row-between">
          <div>
            <h2 style={{ marginBottom: 4 }}>文件包</h2>
            <p className="small muted" style={{ margin: 0 }}>
              依你填寫的資料以固定模板產生（templateVersion {TEMPLATE_VERSION}），沒有使用 AI。下載後請先看 START_HERE.md 的合併方式，不要直接覆蓋專案既有的 AGENTS.md／CLAUDE.md。
            </p>
          </div>
          <button type="button" className="btn btn-primary" onClick={downloadZip} data-testid="download-zip">
            下載文件包（ZIP）
          </button>
        </div>
        <details style={{ marginTop: 12 }}>
          <summary>Skills 選項（可選的入門工作流程）</summary>
          <p className="small">
            流程內容只放在 <code>docs/workflows/</code>，skills 入口只指向它。入口檔依官方文件格式產生，但是否被工具自動載入取決於你的工具版本，本網站無法保證。
          </p>
          <fieldset className="field">
            <legend>包含的流程</legend>
            <div className="choice-row">
              {WORKFLOWS.map((w) => (
                <label key={w.key}>
                  <input type="checkbox" checked={workflows.includes(w.key)} onChange={(e) => setWorkflows(toggle(workflows, w.key, e.target.checked))} />
                  {w.title}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="field">
            <legend>產生入口檔</legend>
            <div className="choice-row">
              <label>
                <input type="checkbox" checked={targets.includes('claude_code')} onChange={(e) => setTargets(toggle(targets, 'claude_code', e.target.checked))} />
                Claude Code（.claude/skills/）
              </label>
              <label>
                <input type="checkbox" checked={targets.includes('codex')} onChange={(e) => setTargets(toggle(targets, 'codex', e.target.checked))} />
                Codex（.agents/skills/）
              </label>
            </div>
          </fieldset>
        </details>
      </section>

      <div className="docs-layout">
        <section className="card" aria-labelledby="file-list-title">
          <h3 id="file-list-title">檔案清單（{files.length}）</h3>
          <ul className="file-list" data-testid="file-list">
            {files.map((f) => (
              <li key={f.path}>
                <button type="button" aria-current={f.path === current.path ? 'true' : undefined} onClick={() => setSelected(f.path)} title={f.description}>
                  {f.path}
                </button>
              </li>
            ))}
          </ul>
        </section>
        <section className="card" aria-labelledby="preview-title">
          <div className="row-between" style={{ marginBottom: 8 }}>
            <h3 id="preview-title" className="break" style={{ margin: 0 }}>
              {current.path}
            </h3>
            <div className="row">
              <div className="choice-row" role="radiogroup" aria-label="預覽方式" style={{ margin: 0 }}>
                <label>
                  <input type="radio" name="view" checked={view === 'rendered'} onChange={() => setView('rendered')} />
                  預覽
                </label>
                <label>
                  <input type="radio" name="view" checked={view === 'raw'} onChange={() => setView('raw')} />
                  原始文字
                </label>
              </div>
              <CopyButton text={current.content} label="複製內容" className="btn btn-sm" testId="copy-file" />
              <button type="button" className="btn btn-sm" onClick={() => downloadOne(current.path)}>
                下載此檔
              </button>
            </div>
          </div>
          <p className="small muted">{current.description}</p>
          <div className="preview" data-testid="doc-preview">
            {view === 'rendered' && current.path.endsWith('.md') ? (
              <MarkdownPreview source={current.content} />
            ) : (
              <pre className="raw" data-testid="doc-raw">
                {current.content}
              </pre>
            )}
          </div>
        </section>
      </div>

      <section className="card">
        <h3>匯出紀錄</h3>
        {exports.length === 0 ? (
          <p className="muted">尚未下載過。</p>
        ) : (
          <div className="table-wrap">
            <table className="simple">
              <thead>
                <tr>
                  <th scope="col">時間</th>
                  <th scope="col">類型</th>
                  <th scope="col">revision</th>
                  <th scope="col">schema / template</th>
                  <th scope="col">檔案</th>
                </tr>
              </thead>
              <tbody>
                {exports.slice(0, 10).map((x) => (
                  <tr key={x.id}>
                    <td className="nowrap">{formatDateTime(x.exportedAt)}</td>
                    <td>{x.kind === 'zip' ? 'ZIP 文件包' : '單一檔案'}</td>
                    <td>
                      {x.revision}
                      {x.revision !== project.revision && <span className="badge badge-warn" style={{ marginLeft: 6 }}>非最新</span>}
                    </td>
                    <td>
                      {x.schemaVersion} / {x.templateVersion}
                    </td>
                    <td className="small break">{x.kind === 'zip' ? `${x.files.length} 個` : x.files.join('、')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
