import { useEffect, useState } from 'react';
import { useRepo, useRepoQuery } from '../app/repoContext';
import { useToast } from '../app/toast';
import { BACKUP_MAX_BYTES, buildBackup, parseBackupText, type ConflictChoice } from '../domain/backup';
import { DEMO_META_KEY, DEMO_PROJECT_ID, buildDemo } from '../domain/demo';
import type { Backup } from '../domain/model';
import { formatDateTime, nowIso } from '../domain/time';
import { downloadFile, readFileAsText } from '../lib/download';

export function DataPage() {
  const repo = useRepo();
  const notify = useToast();
  const projects = useRepoQuery((r) => r.listProjects(), []);
  const [estimate, setEstimate] = useState<{ usage?: number; quota?: number } | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);

  useEffect(() => {
    const s = navigator.storage;
    if (s?.estimate) s.estimate().then(setEstimate, () => setEstimate(null));
    if (s?.persisted) s.persisted().then(setPersisted, () => setPersisted(null));
  }, []);

  const exportAll = async () => {
    try {
      const entries = await repo.exportEntries();
      const json = JSON.stringify(buildBackup(entries, 'all', nowIso()), null, 2);
      const d = new Date();
      const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
      downloadFile(`ai-guide-backup-all-${stamp}.json`, json, 'application/json');
      notify('success', `已下載全部備份（${entries.length} 個專案）。`);
    } catch (e) {
      notify('error', `備份失敗：${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const hasDemo = projects.status === 'ready' && projects.data.some((p) => p.id === DEMO_PROJECT_ID);
  const mb = (n?: number) => (n === undefined ? '未知' : `${(n / 1024 / 1024).toFixed(1)} MB`);

  return (
    <div className="page page-narrow stack">
      <h1>資料與備份</h1>

      <section className="card" aria-labelledby="where-title">
        <h2 id="where-title">資料存在哪裡</h2>
        <ul>
          <li>所有專案、執行紀錄與匯出紀錄只保存在<strong>此瀏覽器、此網站來源</strong>的 IndexedDB 中。</li>
          <li>不會上傳到任何伺服器，也<strong>不會自動跨裝置或跨瀏覽器同步</strong>。</li>
          <li>清除瀏覽器的網站資料、使用無痕視窗、或瀏覽器自動清理空間，都可能讓資料遺失。</li>
          <li>請定期下載 JSON 備份；換電腦時用備份匯入。</li>
        </ul>
        <p className="small muted">
          目前用量：{estimate ? `${mb(estimate.usage)}／可用上限約 ${mb(estimate.quota)}` : '瀏覽器未提供'}。
          {persisted === true && ' 瀏覽器已同意盡量保留此網站資料。'}
        </p>
        {persisted === false && navigator.storage?.persist && (
          <button
            type="button"
            className="btn btn-sm"
            onClick={async () => {
              const ok = await navigator.storage.persist();
              setPersisted(ok);
              notify(ok ? 'success' : 'info', ok ? '瀏覽器已同意盡量保留此網站資料（仍建議定期備份）。' : '瀏覽器沒有同意；資料仍可能在空間不足時被清除，請定期備份。');
            }}
          >
            請瀏覽器盡量保留此網站資料
          </button>
        )}
      </section>

      <section className="card" aria-labelledby="export-title">
        <h2 id="export-title">下載備份</h2>
        <p className="small">備份包含專案需求、執行紀錄（brief）與匯出紀錄。單一專案備份可在專案總覽的卡片上下載。</p>
        <button type="button" className="btn btn-primary" onClick={exportAll} data-testid="export-all">
          下載全部專案備份（JSON）
        </button>
      </section>

      <ImportSection />

      <section className="card" aria-labelledby="demo-title">
        <h2 id="demo-title">示範專案</h2>
        {hasDemo ? (
          <p className="small">示範專案目前存在，可在專案總覽移除。</p>
        ) : (
          <>
            <p className="small">示範專案已移除。需要時可以重新加入（內容為虛構範例，會標示「示範資料」）。</p>
            <button
              type="button"
              className="btn"
              onClick={async () => {
                const d = buildDemo(nowIso());
                await repo.addDemo(d.project, d.briefs);
                await repo.setMeta(DEMO_META_KEY, true);
                notify('success', '已加入示範專案。');
              }}
            >
              重新加入示範專案
            </button>
          </>
        )}
      </section>
    </div>
  );
}

function ImportSection() {
  const repo = useRepo();
  const notify = useToast();
  const existing = useRepoQuery((r) => r.listProjects(), []);
  const [text, setText] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [backup, setBackup] = useState<Backup | null>(null);
  const [choices, setChoices] = useState<Record<string, ConflictChoice>>({});
  const [busy, setBusy] = useState(false);

  const check = (t: string) => {
    const r = parseBackupText(t);
    if (r.ok) {
      setErrors([]);
      setBackup(r.value);
      setChoices({});
    } else {
      setBackup(null);
      setErrors(r.errors);
    }
  };

  const existingMap = new Map(existing.status === 'ready' ? existing.data.map((p) => [p.id, p]) : []);

  const apply = async () => {
    if (!backup) return;
    setBusy(true);
    try {
      const s = await repo.applyImport(backup, choices);
      notify('success', `匯入完成：新增 ${s.added}、取代 ${s.replaced}、另存 ${s.copied}、保留現有 ${s.kept}。`);
      setBackup(null);
      setText('');
    } catch (e) {
      notify('error', `匯入失敗，資料未變更：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card" aria-labelledby="import-title" data-testid="backup-import">
      <h2 id="import-title">匯入備份</h2>
      <p className="small muted">
        匯入內容一律視為不可信資料：會檢查格式與版本（上限 {BACKUP_MAX_BYTES / 1024 / 1024} MB），不會執行任何內容。來自較新版本的備份會被拒絕。
      </p>
      <div className="field">
        <label htmlFor="backup-file">選擇備份檔（.json）</label>
        <input
          id="backup-file"
          type="file"
          accept="application/json,.json"
          onChange={async (e) => {
            const input = e.currentTarget;
            const f = input.files?.[0];
            // 清空選擇，讓使用者之後可以再次選擇同一個檔案。
            input.value = '';
            if (!f) return;
            try {
              const t = await readFileAsText(f, BACKUP_MAX_BYTES);
              setText(t);
              check(t);
            } catch (err) {
              setBackup(null);
              setErrors([err instanceof Error ? err.message : String(err)]);
            }
          }}
        />
      </div>
      <details>
        <summary>或貼上備份 JSON</summary>
        <label htmlFor="backup-text" className="visually-hidden">
          備份 JSON
        </label>
        <textarea id="backup-text" rows={6} value={text} onChange={(e) => setText(e.target.value)} className="mono" />
        <button type="button" className="btn btn-sm" style={{ marginTop: 8 }} disabled={!text.trim()} onClick={() => check(text)}>
          檢查並預覽
        </button>
      </details>

      {errors.length > 0 && (
        <div className="notice notice-danger" role="alert" style={{ marginTop: 12 }} data-testid="backup-errors">
          <strong>無法匯入：</strong>
          <ul style={{ margin: '4px 0 0' }}>
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {backup && (
        <div style={{ marginTop: 16 }} data-testid="backup-preview">
          <h3>預覽（備份時間 {formatDateTime(backup.exportedAt)}，{backup.projects.length} 個專案）</h3>
          <div className="table-wrap">
            <table className="simple">
              <thead>
                <tr>
                  <th scope="col">專案</th>
                  <th scope="col">內容</th>
                  <th scope="col">處理方式</th>
                </tr>
              </thead>
              <tbody>
                {backup.projects.map((e) => {
                  const cur = existingMap.get(e.project.id);
                  const choice = choices[e.project.id] ?? 'keep';
                  return (
                    <tr key={e.project.id} data-testid="backup-row">
                      <td>
                        <strong>{e.project.basics.name || '未命名專案'}</strong>
                        {e.project.isDemo && <span className="badge badge-demo" style={{ marginLeft: 6 }}>示範</span>}
                        <div className="small muted mono break">{e.project.id}</div>
                      </td>
                      <td className="small">
                        revision {e.project.revision}・brief {e.briefs.length}・匯出紀錄 {e.exports.length}
                        <br />
                        更新於 {formatDateTime(e.project.updatedAt)}
                      </td>
                      <td>
                        {cur ? (
                          <fieldset>
                            <legend className="small">
                              ID 衝突：此瀏覽器已有「{cur.basics.name}」（revision {cur.revision}，更新於 {formatDateTime(cur.updatedAt)}）
                            </legend>
                            <div className="choice-row" style={{ flexDirection: 'column', gap: 2 }}>
                              {(
                                [
                                  ['keep', '保留現有（略過備份中的這個專案）'],
                                  ['replace', '取代（刪除現有專案與其紀錄，改用備份內容）'],
                                  ['copy', '另存新專案（配發新 ID，保留兩者）'],
                                ] as const
                              ).map(([v, l]) => (
                                <label key={v}>
                                  <input
                                    type="radio"
                                    name={`conflict-${e.project.id}`}
                                    checked={choice === v}
                                    onChange={() => setChoices({ ...choices, [e.project.id]: v })}
                                  />
                                  {l}
                                </label>
                              ))}
                            </div>
                          </fieldset>
                        ) : (
                          <span className="badge badge-ok">新增</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <button type="button" className="btn btn-primary" onClick={apply} disabled={busy} data-testid="apply-import">
              確認匯入
            </button>
            <button type="button" className="btn" onClick={() => setBackup(null)}>
              取消
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
