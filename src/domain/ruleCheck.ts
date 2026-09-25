import { answerStatus, hasText, isFilled } from './answers';
import type { Answer, Project } from './model';
import { STEP_INDEX, type WizardStepKey } from './steps';

export type IssueLevel = 'missing' | 'undecided' | 'notice';

export interface RuleIssue {
  /** 穩定代碼，供測試與畫面定位。 */
  code: string;
  level: IssueLevel;
  title: string;
  detail: string;
  step: number;
  /** 精靈中對應欄位的 DOM id，用於「前往填寫」。 */
  fieldId: string;
}

export interface RequiredItem {
  key: string;
  label: string;
  done: boolean;
}

export interface RuleCheckResult {
  issues: RuleIssue[];
  required: RequiredItem[];
  requiredDone: number;
  requiredTotal: number;
  /** 所有「尚未決定／希望 AI 提案」項目，匯出時列為待釐清問題。 */
  openQuestions: RuleIssue[];
  isDraft: boolean;
}

interface AnswerField {
  label: string;
  step: WizardStepKey;
  fieldId: string;
  get: (p: Project) => Answer;
}

/** 可標記「尚未決定／希望 AI 提案」的欄位清單（單一來源，供規則檢查與文件共用）。 */
export const ANSWER_FIELDS: AnswerField[] = [
  { label: '要解決的問題', step: 'purpose', fieldId: 'purpose-problem', get: (p) => p.purpose.problem },
  { label: '使用者', step: 'purpose', fieldId: 'purpose-users', get: (p) => p.purpose.users },
  { label: '現在的處理方式', step: 'purpose', fieldId: 'purpose-currentProcess', get: (p) => p.purpose.currentProcess },
  { label: '希望改善的結果', step: 'purpose', fieldId: 'purpose-desiredOutcome', get: (p) => p.purpose.desiredOutcome },
  { label: '主要資料與欄位', step: 'rules', fieldId: 'rules-dataConcepts', get: (p) => p.rules.dataConcepts },
  { label: '存取限制', step: 'rules', fieldId: 'rules-accessNotes', get: (p) => p.rules.accessNotes },
  { label: '錯誤、例外與邊界情況', step: 'rules', fieldId: 'rules-edgeCases', get: (p) => p.rules.edgeCases },
  { label: '介面風格', step: 'tech', fieldId: 'tech-style', get: (p) => p.tech.style },
  { label: '技術選擇', step: 'tech', fieldId: 'tech-stack', get: (p) => p.tech.stack },
  { label: '部署環境', step: 'tech', fieldId: 'tech-deployment', get: (p) => p.tech.deployment },
  { label: '預算', step: 'tech', fieldId: 'tech-budget', get: (p) => p.tech.budget },
  { label: '期限', step: 'tech', fieldId: 'tech-deadline', get: (p) => p.tech.deadline },
  { label: '外部服務限制', step: 'tech', fieldId: 'tech-externalServices', get: (p) => p.tech.externalServices },
  { label: '測試命令', step: 'acceptance', fieldId: 'testing-commands', get: (p) => p.testing.commands },
];

const KEY_TECH_FIELDS = new Set(['tech-stack', 'tech-deployment']);

export function v1Features(p: Project) {
  return p.features.filter((f) => f.scope === 'v1');
}

export function acceptanceFor(p: Project, featureId: string) {
  return p.acceptance.filter((a) => a.featureId === featureId);
}

export function flowIsComplete(f: Project['flows'][number]) {
  return hasText(f.steps) && hasText(f.expected);
}

export function hasRoleDistinction(p: Project) {
  return p.rules.roles.filter((r) => hasText(r.name)).length >= 2;
}

export function runRuleCheck(p: Project): RuleCheckResult {
  const issues: RuleIssue[] = [];
  const add = (i: Omit<RuleIssue, 'step'> & { step: WizardStepKey }) =>
    issues.push({ ...i, step: STEP_INDEX[i.step] });

  if (!hasText(p.basics.name)) {
    add({ code: 'name-missing', level: 'missing', title: '缺少專案名稱', detail: '請為專案取一個好辨識的名稱。', step: 'basics', fieldId: 'basics-name' });
  }

  const problem = answerStatus(p.purpose.problem);
  if (problem === 'empty') {
    add({ code: 'purpose-missing', level: 'missing', title: '缺少產品目的', detail: '尚未說明這個專案要解決什麼問題。沒有目的，AI 容易做出方向偏移的功能。', step: 'purpose', fieldId: 'purpose-problem' });
  }
  if (answerStatus(p.purpose.users) === 'empty') {
    add({ code: 'users-missing', level: 'missing', title: '缺少使用者說明', detail: '尚未說明誰會使用這個專案。', step: 'purpose', fieldId: 'purpose-users' });
  }

  const completeFlows = p.flows.filter(flowIsComplete);
  if (completeFlows.length === 0) {
    add({ code: 'flow-missing', level: 'missing', title: '缺少核心流程', detail: '至少需要一條包含「操作步驟」與「預期結果」的流程。', step: 'flows', fieldId: 'flows-add' });
  }
  for (const f of p.flows) {
    if (!flowIsComplete(f)) {
      add({ code: `flow-incomplete:${f.id}`, level: 'notice', title: `流程 ${f.id} 尚未填完`, detail: `「${f.title || '未命名流程'}」缺少操作步驟或預期結果。`, step: 'flows', fieldId: `flow-${f.id}-steps` });
    }
  }

  const v1 = v1Features(p);
  if (v1.length === 0) {
    add({ code: 'feature-missing', level: 'missing', title: '尚未列出第一版必要功能', detail: '請至少列出一項「第一版必要」功能。', step: 'features', fieldId: 'features-add' });
  }
  for (const f of v1) {
    const acs = acceptanceFor(p, f.id);
    if (acs.length === 0) {
      add({ code: `feature-no-ac:${f.id}`, level: 'missing', title: `核心功能 ${f.id} 沒有驗收條件`, detail: `「${f.title || '未命名功能'}」沒有任何驗收條件，無法判斷何時算完成。`, step: 'acceptance', fieldId: `ac-feature-${f.id}` });
    } else if (!acs.some((a) => a.kind === 'failure')) {
      add({ code: `feature-no-failure-ac:${f.id}`, level: 'notice', title: `${f.id} 建議補失敗案例`, detail: `「${f.title || '未命名功能'}」只有正常情境，建議補一個輸入錯誤或操作失敗時的預期結果。`, step: 'acceptance', fieldId: `ac-feature-${f.id}` });
    }
  }
  for (const a of p.acceptance) {
    if (!p.features.some((f) => f.id === a.featureId)) {
      add({ code: `ac-orphan:${a.id}`, level: 'notice', title: `驗收 ${a.id} 對應的功能已不存在`, detail: `原本對應 ${a.featureId || '未指定功能'}，請改指定功能或刪除。`, step: 'acceptance', fieldId: `ac-${a.id}-feature` });
    }
  }

  const roleDistinction = hasRoleDistinction(p);
  if (roleDistinction) {
    const noPerm = p.rules.roles.filter((r) => hasText(r.name) && !hasText(r.permissions));
    if (noPerm.length > 0 && !isFilled(p.rules.accessNotes)) {
      add({ code: 'roles-no-permission', level: 'missing', title: '有角色區分但權限規則未說明', detail: `角色 ${noPerm.map((r) => `「${r.name}」`).join('、')} 尚未說明可以做什麼、不能做什麼。`, step: 'rules', fieldId: `role-${noPerm[0].id}-permissions` });
    }
    if (!p.acceptance.some((a) => a.kind === 'permission')) {
      add({ code: 'roles-no-permission-ac', level: 'notice', title: '建議補權限驗收案例', detail: '有多個角色時，建議至少一個「沒有權限的人嘗試操作」的驗收條件。', step: 'acceptance', fieldId: 'acceptance-section' });
    }
  }

  for (const f of ANSWER_FIELDS) {
    const s = answerStatus(f.get(p));
    if (s === 'undecided' || s === 'ai_propose') {
      const key = KEY_TECH_FIELDS.has(f.fieldId);
      add({
        code: `open:${f.fieldId}`,
        level: 'undecided',
        title: `${f.label}${key ? '（關鍵技術）' : ''}：${s === 'ai_propose' ? '希望 AI 提案' : '尚未決定'}`,
        detail: s === 'ai_propose' ? '執行 AI 需先提出選項與取捨，經你確認後才可採用。' : '保留為待決定事項，匯出文件會列為需要釐清的問題。',
        step: f.step,
        fieldId: f.fieldId,
      });
    }
  }
  if (answerStatus(p.tech.stack) === 'empty') {
    add({ code: 'stack-empty', level: 'notice', title: '尚未說明技術選擇', detail: '若不確定，可選「希望 AI 提案」，文件會要求 AI 先提出方案再實作。', step: 'tech', fieldId: 'tech-stack' });
  }
  for (const r of p.rules.businessRules) {
    if (r.status === 'undecided') {
      add({ code: `rule-undecided:${r.id}`, level: 'undecided', title: `規則 ${r.id} 尚未確認`, detail: r.text || '（未填內容）', step: 'rules', fieldId: `rule-${r.id}-text` });
    }
  }
  if (p.testing.usesLLM && !hasText(p.testing.llmQuality)) {
    add({ code: 'llm-quality-missing', level: 'notice', title: '產品會使用 LLM，但尚未說明品質評估方式', detail: '例如：用哪些範例輸入檢查回答、什麼樣的回答算不合格。', step: 'acceptance', fieldId: 'testing-llmQuality' });
  }
  if (p.aiWork.preferredTool === '') {
    add({ code: 'tool-missing', level: 'notice', title: '尚未選擇偏好的開發工具', detail: '選擇後，Prompt 會預設使用對應工具的入口文件。', step: 'ai', fieldId: 'ai-preferredTool' });
  }

  const required: RequiredItem[] = [
    { key: 'name', label: '專案名稱', done: hasText(p.basics.name) },
    { key: 'purpose', label: '產品目的', done: problem === 'filled' },
    { key: 'users', label: '使用者', done: answerStatus(p.purpose.users) === 'filled' },
    { key: 'flow', label: '至少一條完整核心流程', done: completeFlows.length > 0 },
    { key: 'feature', label: '至少一項第一版必要功能', done: v1.length > 0 },
    { key: 'acceptance', label: '每項第一版功能都有驗收條件', done: v1.length > 0 && v1.every((f) => acceptanceFor(p, f.id).length > 0) },
  ];
  if (roleDistinction) {
    required.push({
      key: 'permissions',
      label: '每個角色的權限說明',
      done: !issues.some((i) => i.code === 'roles-no-permission'),
    });
  }

  const openQuestions = issues.filter((i) => i.level === 'undecided');
  const requiredDone = required.filter((r) => r.done).length;
  return {
    issues,
    required,
    requiredDone,
    requiredTotal: required.length,
    openQuestions,
    isDraft: issues.some((i) => i.level === 'missing' || i.level === 'undecided'),
  };
}
