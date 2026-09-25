import { Link, NavLink, Outlet, useOutletContext, useParams } from 'react-router';
import { useRepoQuery } from '../../app/repoContext';
import type { ExportRecord, Project, StoredBrief } from '../../domain/model';
import { formatDateTime } from '../../domain/time';

export interface ProjectCtx {
  project: Project;
  briefs: StoredBrief[];
  exports: ExportRecord[];
}

export function useProjectCtx() {
  return useOutletContext<ProjectCtx>();
}

const TABS = [
  { to: 'edit', label: '需求精靈' },
  { to: 'summary', label: '摘要與檢查' },
  { to: 'docs', label: '文件與 Skills' },
  { to: 'prompts', label: 'Prompt' },
  { to: 'briefs', label: '執行紀錄' },
];

export function ProjectLayout() {
  const { projectId = '' } = useParams();
  const data = useRepoQuery(
    async (r) => {
      const [project, briefs, exports] = await Promise.all([r.getProject(projectId), r.listBriefs(projectId), r.listExports(projectId)]);
      return { project, briefs, exports };
    },
    [projectId],
  );

  if (data.status === 'loading') return <div className="page">載入中…</div>;
  if (data.status === 'error')
    return (
      <div className="page">
        <div className="notice notice-danger" role="alert">
          讀取專案失敗：{data.error}
        </div>
      </div>
    );
  const { project, briefs, exports } = data.data;
  if (!project) {
    return (
      <div className="page">
        <h1>找不到此專案</h1>
        <p>它可能已被刪除，或網址有誤。</p>
        <Link to="/">回到專案總覽</Link>
      </div>
    );
  }

  const ctx: ProjectCtx = { project, briefs, exports };
  return (
    <div className="page">
      <div className="page-head">
        <div className="grow">
          <p className="small muted" style={{ margin: 0 }}>
            <Link to="/">專案總覽</Link> /
          </p>
          <h1 className="break" data-testid="project-title">
            {project.basics.name || '未命名專案'}{' '}
            {project.isDemo && <span className="badge badge-demo">示範資料</span>}{' '}
            {project.archived && <span className="badge">已封存</span>}
          </h1>
          <p className="sub small">
            revision {project.revision}・最近更新 {formatDateTime(project.updatedAt)}
          </p>
        </div>
      </div>
      <nav className="project-tabs" aria-label="專案分頁">
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to}>
            {t.label}
          </NavLink>
        ))}
      </nav>
      <Outlet context={ctx} />
    </div>
  );
}

/** 既有匯出已不是最新資料的提示。 */
export function StaleExportNotice({ project, exports }: { project: Project; exports: ExportRecord[] }) {
  const last = exports[0];
  if (!last) {
    return (
      <div className="notice small" data-testid="export-status">
        此專案尚未下載過文件包。
      </div>
    );
  }
  if (last.revision === project.revision && last.handoffBriefId === project.handoffBriefId) {
    return (
      <div className="notice notice-ok small" data-testid="export-status">
        最近一次下載（{formatDateTime(last.exportedAt)}，revision {last.revision}）與目前資料一致。
      </div>
    );
  }
  return (
    <div className="notice notice-warn" role="status" data-testid="export-stale">
      <strong>已下載的文件不是最新資料。</strong>最近一次下載是 revision {last.revision}（{formatDateTime(last.exportedAt)}），目前為 revision{' '}
      {project.revision}。請重新下載文件包，並依 START_HERE.md 合併到專案。
    </div>
  );
}
