import { useState } from 'react';
import { useRepo } from '../../app/repoContext';
import { useToast } from '../../app/toast';
import { CopyButton } from '../../components/CopyButton';
import { useConfirm } from '../../components/ConfirmDialog';
import { Modal } from '../../components/Modal';
import {
  BRIEF_MAX_BYTES,
  exampleBrief,
  formatIssues,
  parseBriefText,
  sortBriefsNewestFirst,
  testCounts,
  toBriefFile,
  toStoredBrief,
} from '../../domain/brief';
import { newUuid } from '../../domain/ids';
import { BRIEF_SOURCE_LABEL, BRIEF_TOOL_LABEL, TEST_RESULT_LABEL } from '../../domain/labels';
import { isSafeHttpUrl } from '../../domain/links';
import {
  BRIEF_FORMAT,
  BRIEF_FORMAT_VERSION,
  briefFileSchema,
  type BriefFile,
  type BriefTest,
  type BriefTool,
  type StoredBrief,
  type TestResult,
} from '../../domain/model';
import { formatDateTime, nowIso } from '../../domain/time';
import { taskIdFor } from '../../generators/docs';
import { downloadFile, readFileAsText } from '../../lib/download';
import { useProjectCtx } from './ProjectLayout';

export function BriefsPage() {
  const { project, briefs } = useProjectCtx();
  const repo = useRepo();
  const notify = useToast();
  const [confirm, confirmEl] = useConfirm();
  const [mode, setMode] = useState<'none' | 'import' | 'manual'>('none');
  const [showExample, setShowExample] = useState(false);
  const sorted = sortBriefsNewestFirst(briefs);
  const example = JSON.stringify(exampleBrief(project.id), null, 2);

  const save = async (file: BriefFile, source: StoredBrief['source'], setHandoff: boolean) => {
    const stored = toStoredBrief(file, { id: newUuid(), source, importedAt: nowIso(), projectRevision: project.revision });
    const r = await repo.addBrief(stored);
    if (r.status === 'duplicate') {
      notify('info', `紀錄 ID「${file.recordId}」已存在，沒有重複新增。`);
      return false;
    }
    if (setHandoff) await repo.setHandoffBrief(project.id, stored.id, nowIso());
    notify('success', `已新增紀錄「${file.recordId}」${setHandoff ? '，並設為接手依據' : ''}。`);
    setMode('none');
    return true;
  };

  return (
    <div className="stack">
      <section className="card">
        <div className="row-between">
          <div>
            <h2 style={{ marginBottom: 4 }}>執行紀錄（brief）</h2>
            <p className="small muted" style={{ margin: 0 }}>
              這裡的內容是外部工具回報或你手動填寫的，本網站沒有執行、也無法驗證任何測試。不是即時日誌，也不會修改產品規格或已確認的決策。
            </p>
          </div>
          <div className="row">
            <button type="button" className="btn btn-primary" onClick={() => setMode(mode === 'import' ? 'none' : 'import')} aria-expanded={mode === 'import'}>
              匯入 brief JSON
            </button>
            <button type="button" className="btn" onClick={() => setMode(mode === 'manual' ? 'none' : 'manual')} aria-expanded={mode === 'manual'}>
              手動填寫紀錄
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setShowExample(true)}>
              範例 JSON
            </button>
          </div>
        </div>
        <p className="small" style={{ marginTop: 8, marginBottom: 0 }}>
          取得 brief 的方式：在「Prompt」頁產生「結束工作並輸出 brief」，貼給 Codex／Claude Code，把它輸出的 JSON 貼回這裡。
        </p>
      </section>

      {mode === 'import' && <ImportPanel projectId={project.id} existing={briefs} onCancel={() => setMode('none')} onSave={(f, h) => save(f, 'imported', h)} />}
      {mode === 'manual' && <ManualForm projectId={project.id} taskOptions={project.features.filter((f) => f.scope === 'v1').map(taskIdFor)} onCancel={() => setMode('none')} onSave={(f, h) => save(f, 'manual', h)} />}

      <section className="card" aria-labelledby="timeline-title">
        <h2 id="timeline-title">時間軸</h2>
        {sorted.length === 0 ? (
          <p className="muted" data-testid="no-briefs">
            尚未匯入任何 brief。沒有紀錄時，接手 Prompt 會要求先盤點現況，不會假設已有進度。
          </p>
        ) : (
          <ol className="timeline" data-testid="brief-timeline">
            {sorted.map((b) => (
              <BriefItem
                key={b.id}
                b={b}
                isHandoff={b.id === project.handoffBriefId}
                currentRevision={project.revision}
                onHandoff={async () => {
                  const next = b.id === project.handoffBriefId ? null : b.id;
                  await repo.setHandoffBrief(project.id, next, nowIso());
                  notify('success', next ? `已將「${b.recordId}」設為接手依據。` : '已取消接手依據。');
                }}
                onDelete={async () => {
                  const ok = await confirm({
                    title: `刪除紀錄「${b.recordId}」？`,
                    body: <p>只會刪除此網站中的這筆紀錄。{b.id === project.handoffBriefId ? '它目前是接手依據，刪除後將沒有接手依據。' : ''}</p>,
                    confirmLabel: '刪除紀錄',
                    danger: true,
                  });
                  if (!ok) return;
                  await repo.deleteBrief(b.id, nowIso());
                  notify('success', '已刪除紀錄。');
                }}
              />
            ))}
          </ol>
        )}
      </section>

      <Modal
        open={showExample}
        title="brief JSON 範例"
        onClose={() => setShowExample(false)}
        testId="example-dialog"
        actions={
          <>
            <CopyButton text={example} label="複製範例" />
            <button type="button" className="btn" onClick={() => downloadFile('brief-example.json', example, 'application/json')}>
              下載範例
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setShowExample(false)}>
              關閉
            </button>
          </>
        }
      >
        <p className="small">
          format 必須為 <code>{BRIEF_FORMAT}</code>、formatVersion 為 {BRIEF_FORMAT_VERSION}、projectId 必須是此專案的 ID（<code>{project.id}</code>）。tests[].result 只能是
          passed、failed、not_run、blocked、unknown。
        </p>
        <pre className="raw" style={{ maxHeight: 360, overflow: 'auto' }}>
          {example}
        </pre>
      </Modal>
      {confirmEl}
    </div>
  );
}

function ImportPanel({
  projectId,
  existing,
  onCancel,
  onSave,
}: {
  projectId: string;
  existing: StoredBrief[];
  onCancel: () => void;
  onSave: (f: BriefFile, setHandoff: boolean) => Promise<boolean>;
}) {
  const [text, setText] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [preview, setPreview] = useState<BriefFile | null>(null);
  const [handoff, setHandoff] = useState(true);
  const dup = preview ? existing.find((b) => b.recordId === preview.recordId) : undefined;

  const check = (t: string) => {
    const r = parseBriefText(t, projectId);
    if (r.ok) {
      setErrors([]);
      setPreview(r.value);
    } else {
      setPreview(null);
      setErrors(r.errors);
    }
  };

  return (
    <section className="card" aria-labelledby="import-title" data-testid="brief-import">
      <h2 id="import-title">匯入 brief JSON</h2>
      <p className="small muted">只接受本平台格式（上限 {BRIEF_MAX_BYTES / 1024} KB）。匯入前會先顯示預覽，確認後才保存；內容不會被執行。</p>
      <div className="field">
        <label htmlFor="brief-file">上傳 .json 檔</label>
        <input
          id="brief-file"
          type="file"
          accept="application/json,.json"
          onChange={async (e) => {
            const input = e.currentTarget;
            const f = input.files?.[0];
            // 清空選擇，讓使用者之後可以再次選擇同一個檔案。
            input.value = '';
            if (!f) return;
            try {
              const t = await readFileAsText(f, BRIEF_MAX_BYTES);
              setText(t);
              check(t);
            } catch (err) {
              setPreview(null);
              setErrors([err instanceof Error ? err.message : String(err)]);
            }
          }}
        />
      </div>
      <div className="field">
        <label htmlFor="brief-text">或貼上 JSON</label>
        <textarea id="brief-text" rows={8} value={text} onChange={(e) => setText(e.target.value)} className="mono" />
      </div>
      <div className="row">
        <button type="button" className="btn btn-primary" onClick={() => check(text)} disabled={!text.trim()}>
          檢查並預覽
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          取消
        </button>
      </div>
      {errors.length > 0 && (
        <div className="notice notice-danger" role="alert" style={{ marginTop: 12 }} data-testid="import-errors">
          <strong>無法匯入：</strong>
          <ul style={{ margin: '4px 0 0' }}>
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      {preview && (
        <div style={{ marginTop: 16 }} data-testid="import-preview">
          <h3>預覽</h3>
          <BriefDetails b={preview} />
          {dup ? (
            <div className="notice notice-warn" role="status" style={{ marginTop: 12 }} data-testid="import-duplicate">
              紀錄 ID「{preview.recordId}」已存在（匯入於 {formatDateTime(dup.importedAt)}），不會重複新增。
            </div>
          ) : (
            <>
              <label style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <input type="checkbox" checked={handoff} onChange={(e) => setHandoff(e.target.checked)} style={{ width: 'auto' }} />
                設為接手依據（之後產生的接手 Prompt 與 handoff.md 會使用這筆紀錄）
              </label>
              <div className="row" style={{ marginTop: 12 }}>
                <button type="button" className="btn btn-primary" onClick={() => void onSave(preview, handoff)}>
                  確認匯入
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}

const RESULTS: TestResult[] = ['passed', 'failed', 'not_run', 'blocked', 'unknown'];
const lines = (s: string) =>
  s
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);
const toLocalInput = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

function ManualForm({
  projectId,
  taskOptions,
  onCancel,
  onSave,
}: {
  projectId: string;
  taskOptions: string[];
  onCancel: () => void;
  onSave: (f: BriefFile, setHandoff: boolean) => Promise<boolean>;
}) {
  const [now] = useState(() => new Date());
  const [recordId, setRecordId] = useState(() => `manual-${toLocalInput(now).replace(/[-:]/g, '').replace('T', '-')}`);
  const [taskIds, setTaskIds] = useState('');
  const [tool, setTool] = useState<BriefTool>('codex');
  const [model, setModel] = useState('');
  const [occurredAt, setOccurredAt] = useState(() => toLocalInput(now));
  const [branch, setBranch] = useState('');
  const [commit, setCommit] = useState('');
  const [summary, setSummary] = useState('');
  const [changedFiles, setChangedFiles] = useState('');
  const [tests, setTests] = useState<BriefTest[]>([]);
  const [knownIssues, setKnownIssues] = useState('');
  const [unfinished, setUnfinished] = useState('');
  const [decisions, setDecisions] = useState('');
  const [nextSteps, setNextSteps] = useState('');
  const [handoff, setHandoff] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);

  const submit = async () => {
    const date = new Date(occurredAt);
    const file = {
      format: BRIEF_FORMAT,
      formatVersion: BRIEF_FORMAT_VERSION,
      projectId,
      recordId: recordId.trim(),
      taskIds: taskIds
        .split(/[,，\s]+/)
        .map((x) => x.trim())
        .filter(Boolean),
      tool,
      model: model.trim() || null,
      occurredAt: Number.isNaN(date.getTime()) ? occurredAt : date.toISOString(),
      branch: branch.trim() || null,
      commit: commit.trim() || null,
      summary: summary.trim(),
      changedFiles: lines(changedFiles),
      tests,
      knownIssues: lines(knownIssues),
      unfinished: lines(unfinished),
      decisionsNeeded: lines(decisions),
      nextSteps: lines(nextSteps),
    };
    const r = briefFileSchema.safeParse(file);
    if (!r.success) {
      setErrors(formatIssues(r.error));
      return;
    }
    setErrors([]);
    await onSave(r.data, handoff);
  };

  const setTest = (i: number, patch: Partial<BriefTest>) => setTests(tests.map((t, j) => (j === i ? { ...t, ...patch } : t)));

  return (
    <section className="card" aria-labelledby="manual-title" data-testid="brief-manual">
      <h2 id="manual-title">手動填寫紀錄</h2>
      <p className="small muted">來源會標示為「手動填寫」。只填你確實知道的內容；沒有執行的測試請選「未執行」。</p>
      <div className="grid-2">
        <div className="field">
          <label htmlFor="m-recordId">
            紀錄 ID<span className="req">必填</span>
          </label>
          <input id="m-recordId" value={recordId} onChange={(e) => setRecordId(e.target.value)} />
          <p className="example">只能用英數字與 . _ : -；同一 ID 不會重複新增。</p>
        </div>
        <div className="field">
          <label htmlFor="m-occurredAt">
            發生時間<span className="req">必填</span>
          </label>
          <input id="m-occurredAt" type="datetime-local" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="m-tool">工具</label>
          <select id="m-tool" value={tool} onChange={(e) => setTool(e.target.value as BriefTool)}>
            {(['codex', 'claude_code', 'other'] as BriefTool[]).map((t) => (
              <option key={t} value={t}>
                {BRIEF_TOOL_LABEL[t]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="m-model">
            模型<span className="opt">選填紀錄</span>
          </label>
          <input id="m-model" value={model} onChange={(e) => setModel(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="m-tasks">
            任務 ID<span className="opt">選填，以逗號分隔</span>
          </label>
          <input id="m-tasks" value={taskIds} onChange={(e) => setTaskIds(e.target.value)} placeholder={taskOptions.slice(0, 3).join(', ')} />
        </div>
        <div className="field">
          <label htmlFor="m-branch">
            分支<span className="opt">選填</span>
          </label>
          <input id="m-branch" value={branch} onChange={(e) => setBranch(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="m-commit">
            commit<span className="opt">選填；未填會顯示「尚未綁定版本」</span>
          </label>
          <input id="m-commit" value={commit} onChange={(e) => setCommit(e.target.value)} className="mono" />
        </div>
      </div>
      <div className="field">
        <label htmlFor="m-summary">
          完成摘要<span className="req">必填</span>
        </label>
        <textarea id="m-summary" rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="m-files">
          變更檔案<span className="opt">一行一個</span>
        </label>
        <textarea id="m-files" rows={3} value={changedFiles} onChange={(e) => setChangedFiles(e.target.value)} className="mono" />
      </div>
      <h3>測試</h3>
      {tests.map((t, i) => (
        <div className="item-card" key={i}>
          <div className="item-head">
            <span className="small muted">測試 {i + 1}</span>
            <button type="button" className="btn btn-sm btn-ghost" style={{ color: 'var(--danger)' }} onClick={() => setTests(tests.filter((_, j) => j !== i))}>
              刪除
            </button>
          </div>
          <div className="grid-2">
            <div className="field">
              <label htmlFor={`m-t${i}-cmd`}>命令</label>
              <input id={`m-t${i}-cmd`} value={t.command} onChange={(e) => setTest(i, { command: e.target.value })} className="mono" />
            </div>
            <div className="field">
              <label htmlFor={`m-t${i}-env`}>環境</label>
              <input id={`m-t${i}-env`} value={t.environment} onChange={(e) => setTest(i, { environment: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor={`m-t${i}-result`}>結果</label>
              <select id={`m-t${i}-result`} value={t.result} onChange={(e) => setTest(i, { result: e.target.value as TestResult })}>
                {RESULTS.map((r) => (
                  <option key={r} value={r}>
                    {r}（{TEST_RESULT_LABEL[r]}）
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor={`m-t${i}-ev`}>證據（文字或 https 連結）</label>
              <input id={`m-t${i}-ev`} value={t.evidence} onChange={(e) => setTest(i, { evidence: e.target.value })} />
            </div>
          </div>
        </div>
      ))}
      <button type="button" className="btn btn-sm" style={{ marginBottom: 16 }} onClick={() => setTests([...tests, { command: '', environment: '', result: 'not_run', evidence: '' }])}>
        ＋ 新增測試
      </button>
      <div className="grid-2">
        {(
          [
            ['m-issues', '已知問題', knownIssues, setKnownIssues],
            ['m-unfinished', '未完成項目', unfinished, setUnfinished],
            ['m-decisions', '待你決策的事項', decisions, setDecisions],
            ['m-next', '建議下一步', nextSteps, setNextSteps],
          ] as const
        ).map(([id, label, value, set]) => (
          <div className="field" key={id}>
            <label htmlFor={id}>
              {label}
              <span className="opt">一行一項</span>
            </label>
            <textarea id={id} rows={3} value={value} onChange={(e) => set(e.target.value)} />
          </div>
        ))}
      </div>
      <label style={{ display: 'flex', gap: 8 }}>
        <input type="checkbox" checked={handoff} onChange={(e) => setHandoff(e.target.checked)} style={{ width: 'auto' }} />
        設為接手依據
      </label>
      {errors.length > 0 && (
        <div className="notice notice-danger" role="alert" style={{ marginTop: 12 }}>
          <ul style={{ margin: 0 }}>
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="row" style={{ marginTop: 12 }}>
        <button type="button" className="btn btn-primary" onClick={submit}>
          保存紀錄
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          取消
        </button>
      </div>
    </section>
  );
}

function Evidence({ text }: { text: string }) {
  const t = text.trim();
  if (!t) return <span className="muted">未提供</span>;
  if (isSafeHttpUrl(t))
    return (
      <a href={t} target="_blank" rel="noopener noreferrer nofollow" className="break">
        {t}
      </a>
    );
  return <span className="break" style={{ whiteSpace: 'pre-wrap' }}>{t}</span>;
}

function ListBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <>
      <dt>{title}</dt>
      <dd>
        {items.length === 0 ? (
          <span className="muted">（無）</span>
        ) : (
          <ul style={{ margin: 0, paddingLeft: '1.2em' }}>
            {items.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        )}
      </dd>
    </>
  );
}

function BriefDetails({ b }: { b: BriefFile }) {
  const c = testCounts(b);
  return (
    <dl className="kv small">
      <dt>紀錄 ID</dt>
      <dd className="mono">{b.recordId}</dd>
      <dt>工具／模型</dt>
      <dd>
        {BRIEF_TOOL_LABEL[b.tool]}
        {b.model ? `／${b.model}` : ''}
      </dd>
      <dt>發生時間</dt>
      <dd>{formatDateTime(b.occurredAt)}</dd>
      <dt>任務</dt>
      <dd>{b.taskIds.length ? b.taskIds.join('、') : <span className="muted">未指定</span>}</dd>
      <dt>分支／版本</dt>
      <dd>
        {b.branch || <span className="muted">未提供分支</span>}／
        {b.commit ? <span className="mono">{b.commit}</span> : <span className="badge badge-warn">尚未綁定版本</span>}
      </dd>
      <dt>完成摘要</dt>
      <dd style={{ whiteSpace: 'pre-wrap' }}>{b.summary}</dd>
      <dt>測試（回報）</dt>
      <dd>
        通過 {c.passed}・失敗 {c.failed}・未執行 {c.not_run}・受阻 {c.blocked}・未知 {c.unknown}
        {b.tests.length > 0 && (
          <div className="table-wrap" style={{ marginTop: 6 }}>
            <table className="simple">
              <thead>
                <tr>
                  <th scope="col">命令</th>
                  <th scope="col">環境</th>
                  <th scope="col">結果</th>
                  <th scope="col">證據</th>
                </tr>
              </thead>
              <tbody>
                {b.tests.map((t, i) => (
                  <tr key={i}>
                    <td className="mono break">{t.command || '—'}</td>
                    <td>{t.environment || '—'}</td>
                    <td className="nowrap">
                      <span className={`badge ${t.result === 'passed' ? 'badge-ok' : t.result === 'failed' ? 'badge-danger' : 'badge-warn'}`}>{t.result}</span>
                    </td>
                    <td>
                      <Evidence text={t.evidence} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </dd>
      <ListBlock title="變更檔案" items={b.changedFiles} />
      <ListBlock title="已知問題" items={b.knownIssues} />
      <ListBlock title="未完成項目" items={b.unfinished} />
      <ListBlock title="待你決策" items={b.decisionsNeeded} />
      <ListBlock title="建議下一步" items={b.nextSteps} />
    </dl>
  );
}

function BriefItem({
  b,
  isHandoff,
  currentRevision,
  onHandoff,
  onDelete,
}: {
  b: StoredBrief;
  isHandoff: boolean;
  currentRevision: number;
  onHandoff: () => void;
  onDelete: () => void;
}) {
  const c = testCounts(b);
  return (
    <li className={isHandoff ? 'is-handoff' : undefined} data-testid="brief-item" data-record-id={b.recordId}>
      <div className="row" style={{ marginBottom: 4 }}>
        <strong>{formatDateTime(b.occurredAt)}</strong>
        <span>{BRIEF_TOOL_LABEL[b.tool]}</span>
        <span className="badge">{BRIEF_SOURCE_LABEL[b.source]}</span>
        {b.isDemo && <span className="badge badge-demo">示範資料</span>}
        {isHandoff && <span className="badge badge-info">接手依據</span>}
        {b.commit ? <span className="mono small">commit {b.commit.slice(0, 12)}</span> : <span className="badge badge-warn">尚未綁定版本</span>}
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        <span className="mono">{b.recordId}</span>・匯入於 {formatDateTime(b.importedAt)}（當時規格 revision {b.projectRevisionAtImport}
        {b.projectRevisionAtImport !== currentRevision ? `，目前 ${currentRevision}` : ''}）
      </p>
      <p style={{ margin: '6px 0' }}>{b.summary}</p>
      <p className="small" style={{ margin: '0 0 6px' }}>
        回報測試：通過 {c.passed}・失敗 {c.failed}・未執行 {c.not_run}・受阻 {c.blocked}・未知 {c.unknown}
        <span className="muted">（當時回報，不代表目前版本）</span>
      </p>
      {b.nextSteps[0] && <p className="small" style={{ margin: '0 0 6px' }}>下一步（回報）：{b.nextSteps[0]}</p>}
      <details>
        <summary>展開證據與細節</summary>
        <BriefDetails b={toBriefFile(b)} />
      </details>
      <div className="row" style={{ marginTop: 8 }}>
        <button type="button" className="btn btn-sm" onClick={onHandoff}>
          {isHandoff ? '取消接手依據' : '設為接手依據'}
        </button>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => downloadFile(`brief-${b.recordId}.json`, JSON.stringify(toBriefFile(b), null, 2), 'application/json')}
        >
          下載 JSON
        </button>
        <button type="button" className="btn btn-sm btn-ghost" style={{ color: 'var(--danger)' }} onClick={onDelete}>
          刪除
        </button>
      </div>
    </li>
  );
}
