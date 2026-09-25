import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useRepo, useRepoQuery } from '../app/repoContext';
import { useToast } from '../app/toast';
import { useConfirm } from '../components/ConfirmDialog';
import { Modal } from '../components/Modal';
import { answerStatus } from '../domain/answers';
import { buildBackup } from '../domain/backup';
import { sortBriefsNewestFirst, testCounts } from '../domain/brief';
import { DEMO_META_KEY, buildDemo } from '../domain/demo';
import { BRIEF_TOOL_LABEL } from '../domain/labels';
import type { Project, StoredBrief } from '../domain/model';
import { runRuleCheck } from '../domain/ruleCheck';
import { formatDateTime, nowIso } from '../domain/time';
import { downloadFile } from '../lib/download';

type Filter = 'active' | 'archived' | 'all';

export function OverviewPage() {
  const repo = useRepo();
  const notify = useToast();
  const navigate = useNavigate();
  const [confirm, confirmEl] = useConfirm();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('active');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);

  const data = useRepoQuery(async (r) => {
    const [projects, briefs] = await Promise.all([r.listProjects(), r.listAllBriefs()]);
    const byProject = new Map<string, StoredBrief[]>();
    for (const b of briefs) byProject.set(b.projectId, [...(byProject.get(b.projectId) ?? []), b]);
    return { projects, byProject };
  }, []);

  const visible = useMemo(() => {
    if (data.status !== 'ready') return [];
    const q = query.trim().toLowerCase();
    return data.data.projects.filter((p) => {
      if (filter === 'active' && p.archived) return false;
      if (filter === 'archived' && !p.archived) return false;
      if (!q) return true;
      return [p.basics.name, p.basics.summary, p.purpose.problem.text].some((t) => t.toLowerCase().includes(q));
    });
  }, [data, query, filter]);

  if (data.status === 'loading') return <div className="page">載入中…</div>;
  if (data.status === 'error')
    return (
      <div className="page">
        <div className="notice notice-danger" role="alert">
          讀取專案失敗：{data.error}
        </div>
      </div>
    );

  const { projects, byProject } = data.data;
  const demo = projects.find((p) => p.isDemo);

  const create = async () => {
    const name = newName.trim();
    if (!name) {
      setNameError('請輸入專案名稱。');
      return;
    }
    try {
      const p = await repo.createProject(name, nowIso());
      setCreating(false);
      setNewName('');
      navigate(`/projects/${p.id}/edit/basics`);
    } catch (e) {
      notify('error', `建立失敗：${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const remove = async (p: Project) => {
    const counts = await repo.relatedCounts(p.id);
    const ok = await confirm({
      title: `刪除「${p.basics.name || '未命名專案'}」？`,
      danger: true,
      confirmLabel: '確認刪除',
      body: (
        <>
          <p>將從此瀏覽器永久刪除以下本機資料，無法復原：</p>
          <ul>
            <li>專案需求資料（所有精靈欄位、功能、驗收條件）</li>
            <li>{counts.briefs} 筆執行紀錄（brief）</li>
            <li>{counts.exports} 筆匯出紀錄</li>
          </ul>
          <p className="small muted">已下載到電腦的文件包或備份檔不受影響。若之後可能還需要，請先按「取消」並下載此專案備份。</p>
        </>
      ),
    });
    if (!ok) return;
    try {
      await repo.deleteProject(p.id);
      notify('success', `已刪除「${p.basics.name}」。`);
    } catch (e) {
      notify('error', `刪除失敗：${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const backupOne = async (p: Project) => {
    try {
      const entries = await repo.exportEntries([p.id]);
      const json = JSON.stringify(buildBackup(entries, 'single', nowIso()), null, 2);
      downloadFile(`ai-guide-backup-${p.id.slice(0, 8)}.json`, json, 'application/json');
      notify('success', '已下載此專案的 JSON 備份。');
    } catch (e) {
      notify('error', `備份失敗：${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const toggleArchive = async (p: Project) => {
    try {
      await repo.setArchived(p.id, !p.archived, nowIso());
      notify('success', p.archived ? '已取消封存。' : '已封存；可在「已封存」篩選中找到。');
    } catch (e) {
      notify('error', `操作失敗：${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const addDemo = async () => {
    const d = buildDemo(nowIso());
    await repo.addDemo(d.project, d.briefs);
    await repo.setMeta(DEMO_META_KEY, true);
    notify('success', '已加入示範專案。');
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>專案總覽</h1>
          <p className="sub">整理需求、產生共用文件與接手 Prompt。資料只存在此瀏覽器。</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setCreating(true)} data-testid="new-project">
          新增專案
        </button>
      </div>

      {demo && (
        <div className="notice notice-demo row-between" style={{ marginBottom: 16 }}>
          <span>
            <span className="badge badge-demo">示範資料</span> 「{demo.basics.name}」是示範專案，內容為虛構範例，可隨時移除。
          </span>
          <button type="button" className="btn btn-sm" onClick={() => remove(demo)}>
            移除示範專案
          </button>
        </div>
      )}

      {projects.length > 0 && (
        <div className="row" style={{ marginBottom: 16 }}>
          <label htmlFor="project-search" className="visually-hidden">
            搜尋專案
          </label>
          <input
            id="project-search"
            type="search"
            placeholder="搜尋名稱、簡介或目的"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ maxWidth: 360 }}
          />
          <label htmlFor="project-filter" className="visually-hidden">
            篩選
          </label>
          <select id="project-filter" value={filter} onChange={(e) => setFilter(e.target.value as Filter)} style={{ width: 'auto' }}>
            <option value="active">進行中</option>
            <option value="archived">已封存</option>
            <option value="all">全部</option>
          </select>
          <span className="muted small">
            {visible.length} / {projects.length} 個專案
          </span>
        </div>
      )}

      {projects.length === 0 ? (
        <div className="card empty">
          <h2>還沒有專案</h2>
          <p>從「新增專案」開始，精靈會一步步引導你整理需求。也可以先看看示範專案。</p>
          <div className="row" style={{ justifyContent: 'center' }}>
            <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
              新增專案
            </button>
            <button type="button" className="btn" onClick={addDemo}>
              加入示範專案
            </button>
          </div>
        </div>
      ) : visible.length === 0 ? (
        <div className="card empty">沒有符合條件的專案。</div>
      ) : (
        <ul className="card-grid" style={{ listStyle: 'none', padding: 0, margin: 0 }} aria-label="專案清單">
          {visible.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              briefs={byProject.get(p.id) ?? []}
              onDelete={() => remove(p)}
              onArchive={() => toggleArchive(p)}
              onBackup={() => backupOne(p)}
            />
          ))}
        </ul>
      )}

      <Modal
        open={creating}
        title="新增專案"
        onClose={() => setCreating(false)}
        testId="new-project-dialog"
        actions={
          <>
            <button type="button" className="btn" onClick={() => setCreating(false)}>
              取消
            </button>
            <button type="button" className="btn btn-primary" onClick={create}>
              建立並開始整理需求
            </button>
          </>
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <div className="field">
            <label htmlFor="new-project-name">
              專案名稱<span className="req">必填</span>
            </label>
            <p className="why">之後可以修改。建立後會進入需求精靈，內容會自動保存為草稿。</p>
            <input
              id="new-project-name"
              value={newName}
              autoFocus
              maxLength={200}
              aria-invalid={nameError ? true : undefined}
              aria-describedby={nameError ? 'new-project-name-err' : undefined}
              onChange={(e) => {
                setNewName(e.target.value);
                setNameError(null);
              }}
            />
            {nameError && (
              <p className="field-error" id="new-project-name-err" role="alert">
                {nameError}
              </p>
            )}
            <p className="example">例：社區工具借用登記、報價單產生器</p>
          </div>
        </form>
      </Modal>
      {confirmEl}
    </div>
  );
}

function ProjectCard({
  project: p,
  briefs,
  onDelete,
  onArchive,
  onBackup,
}: {
  project: Project;
  briefs: StoredBrief[];
  onDelete: () => void;
  onArchive: () => void;
  onBackup: () => void;
}) {
  const check = runRuleCheck(p);
  const missing = check.issues.filter((i) => i.level === 'missing').length;
  const undecided = check.issues.filter((i) => i.level === 'undecided').length;
  const latest = sortBriefsNewestFirst(briefs)[0];
  const problem = p.purpose.problem;
  const ps = answerStatus(problem);
  const next = latest?.nextSteps[0]
    ? { source: `brief ${latest.recordId} 建議`, text: latest.nextSteps[0] }
    : p.aiWork.nextStep.trim()
      ? { source: '你填寫的下一步', text: p.aiWork.nextStep }
      : null;

  return (
    <li className="card" data-testid="project-card" aria-label={p.basics.name}>
      <div className="row-between" style={{ alignItems: 'flex-start' }}>
        <h2 style={{ fontSize: '1.1rem', margin: 0 }} className="break">
          <Link to={`/projects/${p.id}/summary`}>{p.basics.name || '未命名專案'}</Link>
        </h2>
        <div className="row">
          {p.isDemo && <span className="badge badge-demo">示範資料</span>}
          {p.archived && <span className="badge">已封存</span>}
        </div>
      </div>
      <p className="small break" style={{ marginTop: 8 }}>
        <strong>目的：</strong>
        {ps === 'filled' ? problem.text : ps === 'empty' ? <span className="muted">尚未填寫</span> : <span className="badge badge-warn">待決定</span>}
      </p>
      <dl className="kv small">
        <dt>最近更新</dt>
        <dd>{formatDateTime(p.updatedAt)}</dd>
        <dt>需求整理</dt>
        <dd>
          必要項目 {check.requiredDone}/{check.requiredTotal}
          {missing > 0 && <span className="badge badge-danger" style={{ marginLeft: 6 }}>缺漏 {missing}</span>}
          {undecided > 0 && <span className="badge badge-warn" style={{ marginLeft: 6 }}>待決定 {undecided}</span>}
          {missing === 0 && undecided === 0 && <span className="badge badge-ok" style={{ marginLeft: 6 }}>規則檢查無缺漏</span>}
        </dd>
        <dt>開發狀態</dt>
        <dd data-testid="dev-status">
          {latest ? (
            <>
              最新 brief：{formatDateTime(latest.occurredAt)}・{BRIEF_TOOL_LABEL[latest.tool]}
              <br />
              <span className="muted">
                測試回報 {summarizeTests(latest)}・{latest.commit ? `commit ${latest.commit.slice(0, 10)}` : '尚未綁定版本'}
                {latest.isDemo ? '・示範資料' : ''}
              </span>
            </>
          ) : (
            <span className="muted">尚未匯入 brief</span>
          )}
        </dd>
        <dt>下一步</dt>
        <dd>{next ? <>{next.text} <span className="muted">（{next.source}）</span></> : <span className="muted">—</span>}</dd>
      </dl>
      <div className="row" style={{ marginTop: 12 }}>
        <Link className="btn btn-sm btn-primary" to={`/projects/${p.id}/edit`}>
          繼續整理需求
        </Link>
        <Link className="btn btn-sm" to={`/projects/${p.id}/docs`}>
          文件與下載
        </Link>
        <button type="button" className="btn btn-sm" onClick={onArchive}>
          {p.archived ? '取消封存' : '封存'}
        </button>
        <button type="button" className="btn btn-sm" onClick={onBackup}>
          下載備份
        </button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={onDelete} style={{ color: 'var(--danger)' }}>
          刪除
        </button>
      </div>
    </li>
  );
}

function summarizeTests(b: StoredBrief): string {
  const c = testCounts(b);
  const parts = [
    c.passed && `通過 ${c.passed}`,
    c.failed && `失敗 ${c.failed}`,
    c.not_run && `未執行 ${c.not_run}`,
    c.blocked && `受阻 ${c.blocked}`,
    c.unknown && `未知 ${c.unknown}`,
  ].filter(Boolean);
  return parts.length ? parts.join('、') : '無測試紀錄';
}
