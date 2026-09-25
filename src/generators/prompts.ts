import { hasText, isFilled } from '../domain/answers';
import { briefTemplate, testCounts } from '../domain/brief';
import { ACCEPTANCE_KIND_LABEL, BRIEF_SOURCE_LABEL, BRIEF_TOOL_LABEL } from '../domain/labels';
import type { ExportRecord, Project, StoredBrief } from '../domain/model';
import { acceptanceFor, runRuleCheck } from '../domain/ruleCheck';
import { taskIdFor } from './docs';
import { inline } from './md';
import { workflowDocPath, type WorkflowKey } from './workflows';

export type PromptType = 'kickoff' | 'inventory' | 'implement' | 'continue' | 'review' | 'diagnose' | 'wrapup';
export type PromptTool = 'codex' | 'claude_code';

export interface PromptTypeDef {
  key: PromptType;
  title: string;
  description: string;
  features: 'required' | 'optional' | 'none';
  usesBrief: boolean;
  needsProblem: boolean;
}

export const PROMPT_TYPES: PromptTypeDef[] = [
  { key: 'kickoff', title: '新專案啟動', description: '全新專案第一次開工：放入文件、確認待決定事項、建立最小骨架。', features: 'none', usesBrief: false, needsProblem: false },
  { key: 'inventory', title: '既有專案盤點', description: '既有專案：只讀盤點現況，合併文件包，列出規格與 repo 的差異。', features: 'none', usesBrief: false, needsProblem: false },
  { key: 'implement', title: '實作指定功能', description: '選擇一到數個功能，依驗收條件小步實作並驗證。', features: 'required', usesBrief: false, needsProblem: false },
  { key: 'continue', title: '接手繼續開發', description: '依選定的執行 brief 接手；沒有 brief 時要求先盤點。', features: 'optional', usesBrief: true, needsProblem: false },
  { key: 'review', title: '獨立審查', description: '對照規格與驗收條件審查變更，預設只回報不修改。', features: 'optional', usesBrief: true, needsProblem: false },
  { key: 'diagnose', title: '問題診斷', description: '描述問題現象，要求先重現、找根因、再最小修正。', features: 'optional', usesBrief: true, needsProblem: true },
  { key: 'wrapup', title: '結束工作並輸出 brief', description: '要求工具輸出本平台格式的 brief JSON 並更新交接文件。', features: 'optional', usesBrief: false, needsProblem: false },
];

export const PROMPT_TOOL_LABEL: Record<PromptTool, string> = { codex: 'Codex', claude_code: 'Claude Code' };

export interface PromptInput {
  type: PromptType;
  tool: PromptTool;
  project: Project;
  featureIds: string[];
  brief: StoredBrief | null;
  problem?: string;
  /** 選填：使用者記錄的模型名稱，只放在 brief 範本的 model 欄位。 */
  model?: string;
  lastExport: ExportRecord | null;
}

export function validatePromptInput(input: PromptInput): string[] {
  const def = PROMPT_TYPES.find((t) => t.key === input.type)!;
  const errors: string[] = [];
  if (def.features === 'required' && input.featureIds.length === 0) errors.push('請至少選擇一個功能。');
  if (def.needsProblem && !hasText(input.problem)) errors.push('請描述要診斷的問題（現象、重現步驟、錯誤訊息）。');
  return errors;
}

function entryDocs(tool: PromptTool): string {
  return tool === 'codex'
    ? '- `AGENTS.md`（專案根目錄；共用工作規則與必讀清單）'
    : '- `CLAUDE.md`（透過 `@AGENTS.md` 匯入共用工作規則；若專案只有 AGENTS.md，請直接閱讀 AGENTS.md）';
}

function skillHint(tool: PromptTool, key: WorkflowKey): string {
  return tool === 'claude_code'
    ? `若專案已放入 \`.claude/skills/${key}/\`，可使用 \`/${key}\`；否則直接閱讀並遵循 \`${workflowDocPath(key)}\`。`
    : `若專案已放入 \`.agents/skills/${key}/\` 且你的 Codex 版本支援 skills，可使用該 skill；否則直接閱讀並遵循 \`${workflowDocPath(key)}\`。`;
}

function exportStatus(p: Project, last: ExportRecord | null): string {
  if (!last) {
    return `AI Project Guide 顯示此專案尚未下載過文件包。若專案內沒有 docs/ 與 AGENTS.md，請先停下並告知使用者下載文件包，不要自行編寫規格。`;
  }
  if (last.revision !== p.revision) {
    return `注意：網站上的規格為 revision ${p.revision}，但最近一次下載的文件包是 revision ${last.revision}。專案內文件可能不是最新；若文件內容與本 Prompt 衝突，先停下並詢問使用者，建議使用者重新下載文件包。`;
  }
  return `最近一次下載的文件包與目前規格同為 revision ${p.revision}。請確認 docs/ 各檔開頭的匯出快照 revision 也是 ${p.revision}；不一致時先告知使用者。`;
}

function constraints(p: Project): string[] {
  const out: string[] = [];
  const outScope = p.features.filter((f) => f.scope === 'out');
  if (outScope.length) out.push(`不在範圍，不得實作：${outScope.map((f) => `${f.id} ${inline(f.title)}`).join('、')}`);
  const later = p.features.filter((f) => f.scope === 'later');
  if (later.length) out.push(`之後再做，本次不實作：${later.map((f) => `${f.id} ${inline(f.title)}`).join('、')}`);
  for (const r of p.rules.businessRules.filter((r) => r.status === 'confirmed' && hasText(r.text))) {
    out.push(`規則 ${r.id}：${inline(r.text)}`);
  }
  if (isFilled(p.tech.stack)) out.push(`技術選擇（已確認）：${inline(p.tech.stack.text)}`);
  if (isFilled(p.tech.deployment)) out.push(`部署環境（已確認）：${inline(p.tech.deployment.text)}`);
  if (isFilled(p.tech.budget)) out.push(`預算：${inline(p.tech.budget.text)}`);
  if (isFilled(p.tech.deadline)) out.push(`期限：${inline(p.tech.deadline.text)}`);
  if (isFilled(p.tech.externalServices)) out.push(`外部服務限制：${inline(p.tech.externalServices.text)}`);
  out.push('不得以跳過測試、刪除或削弱斷言、吞掉錯誤等方式讓檢查通過；認為測試有誤時先說明依據。');
  out.push('沒有實際執行的驗證標記「未驗證」。');
  out.push('不直接覆蓋既有的 AGENTS.md、CLAUDE.md 或 docs/ 檔案，需先讀取並合併。');
  return out;
}

function acceptanceSection(p: Project, featureIds: string[]): string {
  const selected = featureIds.length
    ? p.features.filter((f) => featureIds.includes(f.id))
    : p.features.filter((f) => f.scope === 'v1');
  if (selected.length === 0) return '- 尚未列出第一版必要功能；請依 docs/acceptance.md，若沒有驗收條件先詢問使用者。';
  return selected
    .map((f) => {
      const acs = acceptanceFor(p, f.id);
      const lines = acs.length
        ? acs.map((a) => `  - ${a.id}【${ACCEPTANCE_KIND_LABEL[a.kind]}】${inline(a.scenario)}｜操作：${inline(a.action)}｜預期：${inline(a.expected)}`).join('\n')
        : '  - ⚠ 尚無驗收條件：實作前先與使用者確認完成標準，不可自行認定。';
      return `- ${f.id} ${inline(f.title)}（任務 ${taskIdFor(f)}）\n${lines}`;
    })
    .join('\n');
}

function briefSection(b: StoredBrief, p: Project): string {
  const c = testCounts(b);
  const tests = b.tests.length
    ? b.tests.map((t) => `  - \`${inline(t.command) || '（未提供命令）'}\` → ${t.result}；證據：${inline(t.evidence) || '未提供'}`).join('\n')
    : '  - （未回報任何測試）';
  const list = (label: string, items: string[]) => `- ${label}：${items.length ? items.map(inline).join('；') : '（無）'}`;
  const drift =
    b.projectRevisionAtImport !== p.revision
      ? `\n- 注意：此紀錄匯入時規格為 revision ${b.projectRevisionAtImport}，目前為 revision ${p.revision}，之後的規格修改可能未涵蓋。`
      : '';
  return `## 接手依據（使用者選定的執行 brief）

- 紀錄 ID：${b.recordId}（${BRIEF_SOURCE_LABEL[b.source]}；AI Project Guide 未執行或驗證其內容）
- 工具：${BRIEF_TOOL_LABEL[b.tool]}；發生時間：${b.occurredAt}
- 任務：${b.taskIds.length ? b.taskIds.map(inline).join('、') : '（未指定）'}
- 分支：${b.branch ? inline(b.branch) : '（未提供）'}；版本：${b.commit ? `commit ${inline(b.commit)}` : '尚未綁定版本（沒有 commit）'}${drift}
- 完成摘要（回報）：${inline(b.summary)}
- 回報的測試結果（passed ${c.passed}、failed ${c.failed}、not_run ${c.not_run}、blocked ${c.blocked}、unknown ${c.unknown}）：
${tests}
${list('已知問題', b.knownIssues)}
${list('未完成項目', b.unfinished)}
${list('待使用者決策', b.decisionsNeeded)}
${list('建議下一步', b.nextSteps)}

以上是回報內容，不是目前版本的驗證結果。請先核對 repo 實際狀態（${b.commit ? `commit ${inline(b.commit)} 是否存在、之後是否有其他變更` : '沒有 commit，需以檔案內容判斷'}），並重新執行相關測試。`;
}

function reportFormat(input: PromptInput): string {
  const p = input.project;
  const taskIds = p.features.filter((f) => input.featureIds.includes(f.id)).map(taskIdFor);
  const tpl = briefTemplate(p.id, { tool: input.tool, taskIds });
  if (hasText(input.model)) tpl.model = input.model!.trim();
  const json = JSON.stringify(tpl, null, 2);
  const pre = {
    kickoff: '先用條列回報：已讀文件、待決定事項的提案（等待確認）、已建立的內容、實際執行的驗證。',
    inventory: '先用條列回報盤點結果：已確認存在的內容（附路徑或命令輸出）、無法確認的內容、規格與 repo 的差異、文件合併方式（哪些檔案已合併、哪些需使用者決定）。',
    implement: '先用條列回報：變更檔案、每個驗收條件的驗證結果與證據、未完成項目。',
    continue: '先用條列回報：盤點與核對結果、本次完成內容、每個相關驗收條件的驗證結果與證據。',
    review: '先用條列回報問題清單（嚴重度：阻擋／重要／建議、位置、原因、建議修正），以及每個相關驗收條件的審查結論；重新執行的命令與結果，未執行者標記「未驗證」。',
    diagnose: '先用條列回報：重現步驟與結果、根因（附證據）、修正內容、驗證結果；無法重現時說明嘗試過的方式。',
    wrapup: '',
  }[input.type];
  return `## 完成後回報格式

${pre ? `${pre}\n\n最後` : ''}輸出一份 brief JSON（格式與規則見 docs/ai-workflow.md），並更新 docs/handoff.md。不知道的 branch、commit、model 填 null；清單沒有內容用 []；沒執行的測試 result 用 not_run 並寫明原因。

\`\`\`json
${json}
\`\`\``;
}

export function generatePrompt(input: PromptInput): string {
  const { project: p, tool } = input;
  const def = PROMPT_TYPES.find((t) => t.key === input.type)!;
  const check = runRuleCheck(p);
  const name = inline(p.basics.name) || '未命名專案';
  const selected = p.features.filter((f) => input.featureIds.includes(f.id));
  const selectedText = selected.length ? selected.map((f) => `${f.id} ${inline(f.title)}（任務 ${taskIdFor(f)}）`).join('、') : '';

  let purpose: string;
  let steps: string[];
  switch (input.type) {
    case 'kickoff':
      purpose = `啟動全新專案「${name}」的開發：確認文件包已放入專案、處理待決定事項、建立最小可驗證的專案骨架。本次不實作完整功能。`;
      steps = [
        '確認專案根目錄有 AGENTS.md（Claude Code 另有 CLAUDE.md）與 docs/；若解壓在其他資料夾，依 START_HERE.md 合併，不直接覆蓋既有檔案。',
        '閱讀下列必讀文件。',
        '若 docs/architecture.md 顯示尚未選定架構，先提出 2–3 個方案與取捨，停下等待使用者確認，不要自行定案。',
        '架構確認後，只建立最小骨架與可執行的測試命令，並實際執行一次。',
        `${skillHint(tool, 'verify-and-complete')}`,
      ];
      break;
    case 'inventory':
      purpose = `盤點既有專案「${name}」的現況，並把 AI Project Guide 文件包合併進專案。本次不修改產品程式碼。`;
      steps = [
        `${skillHint(tool, 'project-takeover')}`,
        '只讀檢查 repo：目錄結構、套件設定、git 狀態與記錄、既有測試與命令。',
        '文件包若在其他資料夾，依 START_HERE.md 合併：既有 AGENTS.md／CLAUDE.md 以標記區塊附加，docs/ 同名檔案先比對，覆蓋任何既有內容前先詢問使用者。',
        '對照 docs/product.md、docs/tasks.md 與 repo 實際內容，列出差異與無法確認的部分。',
        '在 docs/architecture.md 補上實際觀察到的技術與結構（標明是盤點結果）。',
      ];
      break;
    case 'implement':
      purpose = `實作以下功能：${selectedText || '（尚未選擇功能）'}。只處理這些功能，不擴大範圍。`;
      steps = [
        '閱讀必讀文件，確認這些功能沒有依賴未決定的事項；若有，先提出選項並等待確認。',
        '先讀相關的既有程式碼與測試，再以小步驟修改，每一步保持可建置。',
        '依下方驗收條件撰寫或更新測試，實際執行並保存輸出摘要作為證據。',
        '驗證失敗就修正程式或說明原因；不得削弱測試讓它通過。',
        `${skillHint(tool, 'verify-and-complete')}`,
      ];
      break;
    case 'continue':
      purpose = input.brief
        ? `依使用者選定的執行 brief（${input.brief.recordId}）接手「${name}」，先核對回報內容是否屬實，再繼續下一步${selectedText ? `，本次聚焦：${selectedText}` : ''}。`
        : `接手「${name}」。目前沒有選定的執行 brief，不可假設任何已完成的進度：先盤點現況並回報，等待使用者確認後才開始開發。`;
      steps = input.brief
        ? [
            `${skillHint(tool, 'project-takeover')}`,
            '核對 brief 中的 commit、變更檔案與 repo 實際狀態是否一致；不一致時列出差異。',
            '重新執行 brief 回報的測試命令，記錄實際結果；brief 中的結果不可直接沿用。',
            '處理 brief 的「未完成項目」與「建議下一步」；涉及「待使用者決策」的項目先詢問。',
            '以小步驟實作並驗證。',
          ]
        : [
            `${skillHint(tool, 'project-takeover')}`,
            '只讀盤點 repo 實際狀態與 docs/handoff.md，不修改程式碼。',
            '回報盤點結果（已確認的內容附證據、無法確認的內容），停下等待使用者確認下一步。',
          ];
      break;
    case 'review':
      purpose = `獨立審查「${name}」的變更${input.brief ? `（brief ${input.brief.recordId} 回報的工作${input.brief.commit ? `，commit ${inline(input.brief.commit)}` : ''}）` : ''}${selectedText ? `，範圍：${selectedText}` : ''}。預設只回報問題，不修改程式。`;
      steps = [
        `${skillHint(tool, 'review-changes')}`,
        input.brief
          ? '以 brief 的分支、commit 與變更檔案確認審查範圍；資訊不足時先詢問，不要只憑 brief 文字下結論。'
          : '先向使用者確認審查範圍（分支、commit 範圍或檔案清單）。',
        '逐一對照驗收條件，檢查遺漏的失敗與權限案例、超出範圍的功能、未經確認就定案的待決定事項。',
        '檢查測試誠信：跳過的測試、被削弱的斷言、被吞掉的錯誤。',
        '在可行範圍內重新執行測試並記錄實際結果。',
      ];
      break;
    case 'diagnose':
      purpose = `診斷「${name}」的問題：${inline(input.problem ?? '') || '（尚未描述問題）'}`;
      steps = [
        '先閱讀必讀文件與相關程式碼，不急著修改。',
        '依描述嘗試重現問題，記錄重現步驟與實際輸出。',
        '找出根因並附上證據（錯誤訊息、日誌、最小重現）。',
        '提出最小修正並先寫能重現問題的測試，修正後實際執行驗證；不得以跳過或削弱測試處理。',
        '若修正涉及待決定事項或規格變更，先停下詢問使用者。',
      ];
      break;
    case 'wrapup':
      purpose = `結束本次在「${name}」的工作：整理實際完成的內容與證據，輸出 AI Project Guide 格式的 brief JSON，並更新 docs/handoff.md。不要再做新的修改。`;
      steps = [
        '整理本次實際變更的檔案（可用 `git status`、`git diff --stat` 確認）。',
        '列出本次實際執行過的測試命令與結果；沒有執行的標記 not_run 並寫原因。',
        '整理已知問題、未完成項目、需要使用者決定的事項與建議下一步。',
        '若有 commit，填入 commit SHA；沒有提交則填 null。',
        '更新 docs/handoff.md，然後輸出下方格式的 brief JSON（只輸出一份，確保是有效 JSON）。',
      ];
      break;
  }

  const briefBlock =
    def.usesBrief && input.brief
      ? `\n${briefSection(input.brief, p)}\n`
      : def.usesBrief
        ? '\n## 接手依據\n\n目前沒有選定的執行 brief。不可假設任何已完成的進度；以 repo 實際狀態為準。\n'
        : '';

  const open = check.openQuestions.length
    ? check.openQuestions.map((q) => `- ${inline(q.title)}`).join('\n') + '\n\n以上事項不可自行定案；需要時提出選項並等待使用者確認。'
    : '- 規則檢查沒有標記為待決定的事項（規則檢查不等於完整審查，發現不清楚的地方仍需詢問）。';
  const missing = check.issues.filter((i) => i.level === 'missing');
  const missingBlock = missing.length
    ? `\n\n規格缺漏（規則檢查）：\n${missing.map((i) => `- ${inline(i.title)}`).join('\n')}`
    : '';

  return `# ${def.title}：${name}

（本 Prompt 由 AI Project Guide 依規格 revision ${p.revision} 產生，目標工具：${PROMPT_TOOL_LABEL[tool]}。AI Project Guide 沒有連線任何 AI，也沒有執行任何開發或測試。）

## 任務目的與範圍

${purpose}

步驟：
${steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}

## 必讀文件

${entryDocs(tool)}
- \`docs/product.md\`、\`docs/acceptance.md\`、\`docs/tasks.md\`、\`docs/decisions.md\`、\`docs/architecture.md\`、\`docs/ai-workflow.md\`、\`docs/handoff.md\`

${exportStatus(p, input.lastExport)}
${briefBlock}
## 已確認限制

${constraints(p).map((c) => `- ${c}`).join('\n')}

## 未決問題

${open}${missingBlock}

## 驗收方式

${acceptanceSection(p, input.featureIds)}

${reportFormat(input)}
`;
}
