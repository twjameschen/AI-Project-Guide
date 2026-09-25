import { useEffect, useState } from 'react';
import { HashRouter, NavLink, Navigate, Route, Routes } from 'react-router';
import { DEMO_META_KEY, buildDemo } from '../domain/demo';
import { nowIso } from '../domain/time';
import { DataPage } from '../pages/DataPage';
import { HelpPage } from '../pages/HelpPage';
import { OverviewPage } from '../pages/OverviewPage';
import { BriefsPage } from '../pages/project/BriefsPage';
import { DocsPage } from '../pages/project/DocsPage';
import { ProjectLayout } from '../pages/project/ProjectLayout';
import { PromptsPage } from '../pages/project/PromptsPage';
import { SummaryPage } from '../pages/project/SummaryPage';
import { WizardPage, WizardRedirect } from '../pages/project/WizardPage';
import { openRepo, type Repo } from '../storage/repo';
import { RepoContext } from './repoContext';
import { ToastProvider } from './toast';

type Boot = { status: 'loading' } | { status: 'ready'; repo: Repo } | { status: 'error'; message: string };

export function App() {
  const [boot, setBoot] = useState<Boot>({ status: 'loading' });

  useEffect(() => {
    let repo: Repo | null = null;
    let alive = true;
    (async () => {
      try {
        repo = await openRepo();
        if (!alive) {
          repo.close();
          return;
        }
        // 第一次使用時加入示範專案；使用者移除後不再自動加入。
        const inited = await repo.getMeta<boolean>(DEMO_META_KEY);
        if (!inited) {
          const demo = buildDemo(nowIso());
          await repo.addDemo(demo.project, demo.briefs);
          await repo.setMeta(DEMO_META_KEY, true);
        }
        if (alive) setBoot({ status: 'ready', repo });
      } catch (e) {
        if (alive) setBoot({ status: 'error', message: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => {
      alive = false;
      repo?.close();
    };
  }, []);

  if (boot.status === 'loading') {
    return (
      <main className="page" aria-busy="true">
        <p>正在開啟瀏覽器資料庫…</p>
      </main>
    );
  }
  if (boot.status === 'error') return <StorageUnavailable message={boot.message} />;

  return (
    <RepoContext.Provider value={boot.repo}>
      <ToastProvider>
        <HashRouter>
          <a className="skip-link" href="#main">
            跳到主要內容
          </a>
          <header className="app-header">
            <div className="app-header-inner">
              <NavLink to="/" className="brand" end>
                AI Project Guide<small>引導式專案規格與 AI 交接</small>
              </NavLink>
              <nav className="main-nav" aria-label="主要導覽">
                <NavLink to="/" end>
                  專案總覽
                </NavLink>
                <NavLink to="/data">資料與備份</NavLink>
                <NavLink to="/help">使用說明</NavLink>
              </nav>
            </div>
          </header>
          <main id="main" tabIndex={-1}>
            <Routes>
              <Route path="/" element={<OverviewPage />} />
              <Route path="/projects/:projectId" element={<ProjectLayout />}>
                <Route index element={<Navigate to="summary" replace />} />
                <Route path="edit" element={<WizardRedirect />} />
                <Route path="edit/:stepKey" element={<WizardPage />} />
                <Route path="summary" element={<SummaryPage />} />
                <Route path="docs" element={<DocsPage />} />
                <Route path="prompts" element={<PromptsPage />} />
                <Route path="briefs" element={<BriefsPage />} />
              </Route>
              <Route path="/data" element={<DataPage />} />
              <Route path="/help" element={<HelpPage />} />
              <Route
                path="*"
                element={
                  <div className="page">
                    <h1>找不到頁面</h1>
                    <NavLink to="/">回到專案總覽</NavLink>
                  </div>
                }
              />
            </Routes>
          </main>
          <footer className="app-footer">
            資料只保存在此瀏覽器的此網站來源（IndexedDB），不會上傳或跨裝置同步；清除網站資料會遺失內容，請定期到「資料與備份」下載 JSON 備份。本網站不連線任何 AI 服務。
          </footer>
        </HashRouter>
      </ToastProvider>
    </RepoContext.Provider>
  );
}

function StorageUnavailable({ message }: { message: string }) {
  return (
    <main className="page page-narrow">
      <h1>無法使用瀏覽器儲存空間</h1>
      <div className="notice notice-danger" role="alert">
        <p>{message}</p>
      </div>
      <h2>可能原因與處理方式</h2>
      <ul>
        <li>瀏覽器處於無痕／隱私模式，或已封鎖此網站的網站資料：請改用一般視窗或允許網站資料。</li>
        <li>瀏覽器儲存空間已滿：請清理空間後重新整理。</li>
        <li>此網站在另一個分頁升級資料庫：請關閉其他分頁後重新整理。</li>
      </ul>
      <p>
        因為無法開啟資料庫，本頁無法讀取或保存專案。若你之前下載過 JSON 備份，問題排除後可在「資料與備份」匯入。
      </p>
      <button type="button" className="btn btn-primary" onClick={() => location.reload()}>
        重新整理
      </button>
    </main>
  );
}
