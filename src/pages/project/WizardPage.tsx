import { useEffect } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router';
import { useRepo } from '../../app/repoContext';
import { buildBackup } from '../../domain/backup';
import { runRuleCheck } from '../../domain/ruleCheck';
import { STEP_INDEX, WIZARD_STEPS, type WizardStepKey } from '../../domain/steps';
import { formatTime, nowIso } from '../../domain/time';
import { downloadFile } from '../../lib/download';
import type { SaveState } from '../../storage/autosave';
import { useProjectCtx } from './ProjectLayout';
import { useProjectEditor } from './useProjectEditor';
import { StepView } from './wizardSteps';

export function WizardRedirect() {
  const { project } = useProjectCtx();
  const step = WIZARD_STEPS[project.wizardStep] ?? WIZARD_STEPS[0];
  return <Navigate to={step.key} replace />;
}

export function WizardPage() {
  const { project } = useProjectCtx();
  // 以專案 ID 為 key：切換專案時重新初始化草稿；同專案保存後不覆蓋正在編輯的內容。
  return <WizardInner key={project.id} />;
}

function WizardInner() {
  const { project, briefs, exports } = useProjectCtx();
  const { stepKey } = useParams();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const repo = useRepo();
  const { draft, update, setLocal, saveState, flush, retry } = useProjectEditor(project);

  const index = stepKey && stepKey in STEP_INDEX ? STEP_INDEX[stepKey as WizardStepKey] : -1;

  // 記住目前步驟：直接保存，不算使用者修改、不影響 revision。
  useEffect(() => {
    if (index < 0 || draft.wizardStep === index) return;
    setLocal((p) => ({ ...p, wizardStep: index }));
    repo.setWizardStep(draft.id, index, nowIso()).catch(() => {
      // 步驟位置只是便利功能，保存失敗不影響內容。
    });
  }, [index, draft.wizardStep, draft.id, setLocal, repo]);

  // 由摘要頁「前往填寫」帶入的欄位定位。
  const focus = search.get('focus');
  useEffect(() => {
    if (!focus) return;
    const t = setTimeout(() => {
      const el = document.getElementById(focus);
      if (!el) return;
      el.scrollIntoView({ block: 'center' });
      const target = el.matches('input, textarea, select, button')
        ? el
        : (el.querySelector<HTMLElement>('input, textarea, select, button') ?? el);
      if (target === el && !el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
      target.focus();
    }, 50);
    return () => clearTimeout(t);
  }, [focus, index]);

  if (index < 0) return <Navigate to="../edit" replace />;

  const check = runRuleCheck(draft);
  const go = async (i: number) => {
    await flush();
    navigate(`../edit/${WIZARD_STEPS[i].key}`);
    window.scrollTo({ top: 0 });
  };
  const finish = async () => {
    await flush();
    navigate('../summary');
  };
  const step = WIZARD_STEPS[index];

  return (
    <div className="wizard">
      <nav className="steps-nav" aria-label="需求精靈步驟">
        <ol>
          {WIZARD_STEPS.map((s, i) => {
            const missing = check.issues.filter((x) => x.step === i && x.level === 'missing').length;
            return (
              <li key={s.key}>
                <Link to={`../edit/${s.key}`} aria-current={i === index ? 'step' : undefined} onClick={() => void flush()}>
                  <span className="step-num" aria-hidden="true">
                    {i + 1}
                  </span>
                  <span>
                    {s.title}
                    {missing > 0 && <span className="visually-hidden">（缺漏 {missing} 項）</span>}
                    {missing > 0 && (
                      <span className="badge badge-danger" style={{ marginLeft: 6 }} aria-hidden="true">
                        {missing}
                      </span>
                    )}
                    <p className="hint">{s.hint}</p>
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      </nav>

      <section aria-labelledby="step-title" className="card">
        <div className="row-between" style={{ marginBottom: 12 }}>
          <p className="small muted" style={{ margin: 0 }}>
            步驟 {index + 1} / {WIZARD_STEPS.length}
          </p>
          <SaveIndicator
            state={saveState}
            onRetry={retry}
            onDownload={() => {
              const json = JSON.stringify(buildBackup([{ project: draft, briefs, exports }], 'single', nowIso()), null, 2);
              downloadFile(`ai-guide-unsaved-${draft.id.slice(0, 8)}.json`, json, 'application/json');
            }}
          />
        </div>
        <h2 id="step-title">{step.title}</h2>
        <StepView stepKey={step.key} p={draft} update={update} />
        <div className="wizard-footer">
          <button type="button" className="btn" disabled={index === 0} onClick={() => go(index - 1)}>
            上一步
          </button>
          {index < WIZARD_STEPS.length - 1 ? (
            <button type="button" className="btn btn-primary" onClick={() => go(index + 1)}>
              下一步：{WIZARD_STEPS[index + 1].title}
            </button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={finish}>
              完成：查看摘要與缺漏
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

function SaveIndicator({ state, onRetry, onDownload }: { state: SaveState; onRetry: () => void; onDownload: () => void }) {
  if (state.status === 'error') {
    return (
      <div className="save-status error" role="alert" data-testid="save-status">
        <span>保存失敗：{state.error}（內容仍在畫面上，尚未寫入瀏覽器）</span>
        <button type="button" className="btn btn-sm" onClick={onRetry}>
          重試保存
        </button>
        <button type="button" className="btn btn-sm" onClick={onDownload}>
          下載目前內容（JSON）
        </button>
      </div>
    );
  }
  const text =
    state.status === 'pending'
      ? '有未保存的變更…'
      : state.status === 'saving'
        ? '保存中…'
        : state.status === 'saved'
          ? `草稿已保存（${formatTime(state.lastSavedAt)}）`
          : '草稿會在修改後自動保存';
  return (
    <span className={`save-status ${state.status === 'saved' ? 'saved' : ''}`} role="status" aria-live="polite" data-testid="save-status" data-state={state.status}>
      {text}
    </span>
  );
}
