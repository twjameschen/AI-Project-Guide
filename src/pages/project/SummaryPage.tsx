import { Link } from 'react-router';
import { useRepo } from '../../app/repoContext';
import { useToast } from '../../app/toast';
import { answerStatus } from '../../domain/answers';
import { ACCEPTANCE_KIND_LABEL, ANSWER_MODE_LABEL, PRODUCT_TYPE_LABEL, SCOPE_LABEL } from '../../domain/labels';
import type { Answer, Project } from '../../domain/model';
import { runRuleCheck, type IssueLevel, type RuleIssue } from '../../domain/ruleCheck';
import { WIZARD_STEPS } from '../../domain/steps';
import { nowIso } from '../../domain/time';
import { StaleExportNotice, useProjectCtx } from './ProjectLayout';

const LEVEL_META: Record<IssueLevel, { title: string; badge: string; desc: string }> = {
  missing: { title: '缺漏', badge: 'badge-danger', desc: '必要資訊還沒有填寫。' },
  undecided: { title: '待決定', badge: 'badge-warn', desc: '已標記為尚未決定或希望 AI 提案；可以保留並匯出，文件會列為需要釐清的問題。' },
  notice: { title: '提醒', badge: 'badge-info', desc: '建議補充，但不影響匯出。' },
};

function issueLink(i: RuleIssue) {
  return `../edit/${WIZARD_STEPS[i.step].key}?focus=${encodeURIComponent(i.fieldId)}`;
}

export function SummaryPage() {
  const { project: p, exports } = useProjectCtx();
  const repo = useRepo();
  const notify = useToast();
  const check = runRuleCheck(p);
  const pct = Math.round((check.requiredDone / check.requiredTotal) * 100);
  const confirmed = p.summaryConfirmedRevision;

  return (
    <div className="stack">
      <StaleExportNotice project={p} exports={exports} />

      <section className="card" aria-labelledby="check-title">
        <div className="row-between">
          <h2 id="check-title" style={{ margin: 0 }}>
            規則檢查
          </h2>
          <span className={`badge ${check.isDraft ? 'badge-warn' : 'badge-ok'}`} data-testid="spec-status">
            {check.isDraft ? '草稿' : '規則檢查未發現缺漏'}
          </span>
        </div>
        <p className="small muted">
          依固定規則檢查常見缺漏（例如缺目的、缺流程、功能沒有驗收條件、有角色但沒有權限說明）。這不是 AI 審查，也不保證需求完整。
        </p>
        <p style={{ marginBottom: 4 }}>
          必要項目 <strong data-testid="required-count">{check.requiredDone}/{check.requiredTotal}</strong>
        </p>
        <div className="progress" role="progressbar" aria-valuenow={check.requiredDone} aria-valuemin={0} aria-valuemax={check.requiredTotal} aria-label="必要項目完成數">
          <span style={{ width: `${pct}%` }} />
        </div>
        <ul className="small" style={{ marginTop: 8 }}>
          {check.required.map((r) => (
            <li key={r.key}>
              {r.done ? '✓' : '✗'} {r.label}
              <span className="visually-hidden">{r.done ? '（已完成）' : '（未完成）'}</span>
            </li>
          ))}
        </ul>
        {(['missing', 'undecided', 'notice'] as IssueLevel[]).map((level) => {
          const list = check.issues.filter((i) => i.level === level);
          if (list.length === 0) return null;
          const meta = LEVEL_META[level];
          return (
            <div key={level} style={{ marginTop: 16 }} data-testid={`issues-${level}`}>
              <h3>
                <span className={`badge ${meta.badge}`}>{meta.title}</span> {list.length} 項
              </h3>
              <p className="small muted">{meta.desc}</p>
              <ul className="issue-list">
                {list.map((i) => (
                  <li key={i.code} data-code={i.code}>
                    <div className="grow">
                      <strong>{i.title}</strong>
                      <div className="small muted">
                        {i.detail}（步驟 {i.step + 1}：{WIZARD_STEPS[i.step].title}）
                      </div>
                    </div>
                    <Link className="btn btn-sm" to={issueLink(i)}>
                      前往填寫
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        {check.issues.length === 0 && <p className="notice notice-ok">規則檢查沒有發現缺漏、待決定或提醒事項。</p>}
      </section>

      <section className="card" aria-labelledby="confirm-title">
        <h2 id="confirm-title">確認摘要</h2>
        <p className="small">
          看過下方摘要後按「確認摘要」，匯出的文件會標示你確認時的 revision。之後若再修改，文件會顯示「確認後已修改」。草稿與待決定事項仍可匯出。
        </p>
        <div className="row">
          {confirmed === p.revision ? (
            <span className="badge badge-ok">已確認此 revision（{p.revision}）的摘要</span>
          ) : confirmed !== null ? (
            <span className="badge badge-warn">
              曾於 revision {confirmed} 確認，之後已修改
            </span>
          ) : (
            <span className="badge">尚未確認</span>
          )}
          <button
            type="button"
            className="btn btn-primary"
            disabled={confirmed === p.revision}
            onClick={async () => {
              try {
                await repo.confirmSummary(p.id, nowIso());
                notify('success', `已記錄：你確認了 revision ${p.revision} 的摘要。`);
              } catch (e) {
                notify('error', `記錄失敗：${e instanceof Error ? e.message : String(e)}`);
              }
            }}
          >
            確認摘要
          </button>
          <Link className="btn" to="../docs">
            前往產生文件
          </Link>
        </div>
      </section>

      <ProjectSummary p={p} />
    </div>
  );
}

function AnswerView({ a }: { a: Answer }) {
  const s = answerStatus(a);
  if (s === 'filled') return <span className="break" style={{ whiteSpace: 'pre-wrap' }}>{a.text}</span>;
  if (s === 'empty') return <span className="muted">未填寫</span>;
  return (
    <span>
      <span className="badge badge-warn">{ANSWER_MODE_LABEL[a.mode]}</span> {a.text && <span className="muted">備註：{a.text}</span>}
    </span>
  );
}

function ProjectSummary({ p }: { p: Project }) {
  const v1 = p.features.filter((f) => f.scope === 'v1');
  return (
    <section className="card" aria-labelledby="summary-title" data-testid="project-summary">
      <h2 id="summary-title">需求摘要</h2>
      <dl className="kv">
        <dt>簡介</dt>
        <dd>{p.basics.summary || <span className="muted">未填寫</span>}</dd>
        <dt>類型</dt>
        <dd>
          {p.basics.kind === 'existing' ? '既有專案' : p.basics.kind === 'new' ? '全新專案' : '未選擇'}・{PRODUCT_TYPE_LABEL[p.basics.productType]}
        </dd>
        <dt>要解決的問題</dt>
        <dd>
          <AnswerView a={p.purpose.problem} />
        </dd>
        <dt>使用者</dt>
        <dd>
          <AnswerView a={p.purpose.users} />
        </dd>
        <dt>希望的結果</dt>
        <dd>
          <AnswerView a={p.purpose.desiredOutcome} />
        </dd>
        <dt>技術選擇</dt>
        <dd>
          <AnswerView a={p.tech.stack} />
        </dd>
        <dt>部署環境</dt>
        <dd>
          <AnswerView a={p.tech.deployment} />
        </dd>
      </dl>

      <h3 style={{ marginTop: 20 }}>核心流程（{p.flows.length}）</h3>
      {p.flows.length === 0 ? (
        <p className="muted">尚未填寫</p>
      ) : (
        <ul>
          {p.flows.map((f) => (
            <li key={f.id}>
              <span className="id-chip">{f.id}</span> {f.title || '（未命名）'}：{f.expected || <span className="muted">未填預期結果</span>}
            </li>
          ))}
        </ul>
      )}

      <h3>功能（第一版 {v1.length}／全部 {p.features.length}）</h3>
      {p.features.length === 0 ? (
        <p className="muted">尚未填寫</p>
      ) : (
        <div className="table-wrap">
          <table className="simple">
            <thead>
              <tr>
                <th scope="col">ID</th>
                <th scope="col">功能</th>
                <th scope="col">範圍</th>
                <th scope="col">驗收條件</th>
              </tr>
            </thead>
            <tbody>
              {p.features.map((f) => {
                const acs = p.acceptance.filter((a) => a.featureId === f.id);
                return (
                  <tr key={f.id}>
                    <td className="mono nowrap">{f.id}</td>
                    <td>{f.title || '（未命名）'}</td>
                    <td className="nowrap">{SCOPE_LABEL[f.scope]}</td>
                    <td>
                      {acs.length === 0
                        ? f.scope === 'v1'
                          ? <span className="badge badge-danger">無</span>
                          : <span className="muted">—</span>
                        : acs.map((a) => `${a.id}（${ACCEPTANCE_KIND_LABEL[a.kind]}）`).join('、')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <h3 style={{ marginTop: 20 }}>規則與角色</h3>
      <ul>
        {p.rules.businessRules.map((r) => (
          <li key={r.id}>
            <span className="id-chip">{r.id}</span> {r.text || '（未填）'} {r.status === 'undecided' && <span className="badge badge-warn">尚未決定</span>}
          </li>
        ))}
        {p.rules.roles.map((r) => (
          <li key={r.id}>
            角色 {r.name || '（未命名）'}：{r.permissions || <span className="muted">未說明權限</span>}
          </li>
        ))}
        {p.rules.businessRules.length === 0 && p.rules.roles.length === 0 && <li className="muted">尚未填寫</li>}
      </ul>
    </section>
  );
}
