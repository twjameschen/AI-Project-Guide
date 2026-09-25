import { answerStatus, hasText, isFilled } from '../domain/answers';
import { briefTemplate, sortBriefsNewestFirst, testCounts } from '../domain/brief';
import {
  ACCEPTANCE_KIND_LABEL,
  BRIEF_SOURCE_LABEL,
  BRIEF_TOOL_LABEL,
  DEVICE_LABEL,
  PRIORITY_LABEL,
  PRODUCT_TYPE_LABEL,
  SCOPE_LABEL,
  TEST_RESULT_LABEL,
  TOOL_PREF_LABEL,
} from '../domain/labels';
import {
  SCHEMA_VERSION,
  TEMPLATE_VERSION,
  type Feature,
  type Project,
  type StoredBrief,
} from '../domain/model';
import { acceptanceFor, runRuleCheck, type RuleCheckResult } from '../domain/ruleCheck';
import {
  TAG,
  answerBlock,
  answerLine,
  bulletList,
  inline,
  confirmedText,
  textLines,
  safeLink,
  stepsList,
} from './md';
import {
  WORKFLOWS,
  renderSkillEntry,
  renderWorkflowDoc,
  skillPath,
  workflowDocPath,
  type SkillTarget,
  type WorkflowKey,
} from './workflows';

/** ZIP 內的根資料夾名稱（固定，避免使用者輸入影響路徑）。 */
export const EXPORT_ROOT = 'ai-guide-export';
export const MERGE_START = '<!-- ai-project-guide:start -->';
export const MERGE_END = '<!-- ai-project-guide:end -->';

export interface GeneratedFile {
  path: string;
  description: string;
  content: string;
}

export interface DocsInput {
  project: Project;
  briefs: StoredBrief[];
  /** 匯出時間；由呼叫端傳入，確保同一輸入產生相同輸出。 */
  exportedAt: string;
  workflows?: WorkflowKey[];
  skillTargets?: SkillTarget[];
}

export function defaultSkillTargets(p: Project): SkillTarget[] {
  if (p.aiWork.preferredTool === 'codex') return ['codex'];
  if (p.aiWork.preferredTool === 'claude_code') return ['claude_code'];
  return ['claude_code', 'codex'];
}

export const taskIdFor = (f: Pick<Feature, 'id'>) => `T-${f.id}`;

interface Ctx {
  p: Project;
  check: RuleCheckResult;
  exportedAt: string;
  handoff: StoredBrief | null;
  briefs: StoredBrief[];
  workflows: WorkflowKey[];
  skillTargets: SkillTarget[];
}

function statusLine(ctx: Ctx): string {
  const missing = ctx.check.issues.filter((i) => i.level === 'missing').length;
  const undecided = ctx.check.issues.filter((i) => i.level === 'undecided').length;
  const spec = ctx.check.isDraft
    ? `草稿（規則檢查：缺漏 ${missing} 項、待決定 ${undecided} 項）`
    : '規則檢查未發現缺漏或待決定項目（規則檢查不等於完整審查）';
  const c = ctx.p.summaryConfirmedRevision;
  const confirm =
    c === null
      ? '使用者尚未確認摘要'
      : c === ctx.p.revision
        ? `使用者已確認此 revision 的摘要`
        : `使用者曾於 revision ${c} 確認摘要，之後內容已修改`;
  return `${spec}；${confirm}`;
}

function header(ctx: Ctx): string {
  return [
    '> **匯出快照**：本檔由 AI Project Guide 依專案資料產生，是匯出當下的快照，網站上之後的修改不會自動同步到此檔。',
    `> 專案 ID \`${ctx.p.id}\`・revision ${ctx.p.revision}・schemaVersion ${SCHEMA_VERSION}・templateVersion ${TEMPLATE_VERSION}・匯出時間 ${ctx.exportedAt}`,
    `> 規格狀態：${statusLine(ctx)}`,
  ].join('\n>\n');
}

const LEGEND = `標記說明：${TAG.confirmed}使用者在 AI Project Guide 填寫的內容；${TAG.undecided}使用者標記尚未決定或希望 AI 提案，必須經使用者確認才能定案；${TAG.template}AI Project Guide 模板提供的通用建議，不是使用者的決定。`;

function projectName(p: Project) {
  return inline(p.basics.name) || '未命名專案';
}

function featureLine(ctx: Ctx, f: Feature): string {
  const acs = acceptanceFor(ctx.p, f.id).map((a) => a.id);
  const flows = f.flowIds.filter((id) => ctx.p.flows.some((fl) => fl.id === id));
  const meta = [`優先級：${PRIORITY_LABEL[f.priority]}`];
  if (flows.length) meta.push(`相關流程：${flows.join('、')}`);
  if (f.scope === 'v1') meta.push(acs.length ? `驗收：${acs.join('、')}` : '驗收：⚠ 尚無驗收條件');
  const desc = hasText(f.description) ? `\n${textLines(f.description, '  ')}` : '';
  return `- **${f.id}** ${inline(f.title) || '（未命名功能）'}（${meta.join('；')}）${desc}`;
}

// ---------------- 各文件 ----------------

function startHere(ctx: Ctx, files: { path: string; description: string }[]): string {
  const { p, check } = ctx;
  const missing = check.issues.filter((i) => i.level === 'missing');
  const hasClaude = ctx.skillTargets.includes('claude_code') && ctx.workflows.length > 0;
  const hasCodex = ctx.skillTargets.includes('codex') && ctx.workflows.length > 0;
  return `# START HERE — ${projectName(p)}

${header(ctx)}

這是「${projectName(p)}」的規格與 AI 交接文件包，由 AI Project Guide 依你填寫的內容產生。AI Project Guide 沒有連線到任何 AI、沒有讀取你的 repo，也沒有執行任何測試；以下內容只來自你在網站上填寫的資料與固定模板。

${LEGEND}

## 檔案清單

${files.map((f) => `- \`${f.path}\`：${f.description}`).join('\n')}

## 放進專案的方法（避免覆蓋既有規則）

ZIP 內所有檔案都在 \`${EXPORT_ROOT}/\` 資料夾下。請先解壓到暫存位置，不要直接解壓到專案根目錄。

1. **全新專案**（目標資料夾沒有 AGENTS.md、CLAUDE.md、docs/）：把 \`${EXPORT_ROOT}/\` 內的所有檔案複製到專案根目錄即可。
2. **既有專案**：
   - 已有 \`AGENTS.md\`：不要覆蓋。把本包 AGENTS.md 中 \`${MERGE_START}\` 到 \`${MERGE_END}\` 之間（含標記）的內容附加到既有檔案末端；既有檔案若已有同樣標記區塊，只替換該區塊。
   - 已有 \`CLAUDE.md\`：同上。若既有 CLAUDE.md 已經有 \`@AGENTS.md\` 這一行，合併時不要重複加入。
   - \`docs/\` 下有同名檔案：先比對差異再決定合併方式，不要直接覆蓋。
   - \`.claude/skills/\`、\`.agents/skills/\` 已有同名資料夾：先比對內容再決定。
3. 也可以把解壓後的資料夾路徑交給 Codex 或 Claude Code，並貼上 AI Project Guide 產生的「既有專案盤點」Prompt，要求它依上述規則合併並列出差異；覆蓋任何既有內容前需要你確認。

## Skills（可選）

${
  ctx.workflows.length === 0
    ? '本次匯出未包含 skills 入口。'
    : `共用流程內容只放在 \`docs/workflows/\`，skills 入口檔只指向它們。${hasClaude ? '\n- Claude Code：`.claude/skills/<名稱>/SKILL.md`（依 Claude Code 官方 skills 文件格式）。' : ''}${hasCodex ? '\n- Codex：`.agents/skills/<名稱>/SKILL.md`（依 Codex 官方 skills 說明的 repo 位置；產生此模板時無法直接開啟官方頁面，係依官方頁摘錄確認）。' : ''}
- 這些入口是否會被工具自動載入，取決於你使用的工具版本與設定，AI Project Guide 無法保證，也沒有替你安裝。即使沒有載入，也可以直接要求 AI 閱讀 \`docs/workflows/\` 中的檔案。`
}

## 接下來怎麼做

1. 在 Codex 或 Claude Code 開啟專案資料夾。
2. 回到 AI Project Guide 的「Prompt」頁，選擇工具與情境（新專案啟動、既有專案盤點、實作指定功能…），複製 Prompt 貼給工具。
3. 每次結束工作時，使用「結束工作並輸出 brief」Prompt，讓工具依 \`docs/ai-workflow.md\` 輸出 brief JSON。
4. 把 brief JSON 匯入 AI Project Guide 的「執行紀錄」，選為接手依據，再產生下一次的接手或審查 Prompt。
5. 規格有修改時，重新下載文件包並依上面的方法合併。

## 規格狀態（規則檢查）

- 必要項目：${check.requiredDone}/${check.requiredTotal}
${missing.length ? missing.map((i) => `- 缺漏：${inline(i.title)}`).join('\n') : '- 規則檢查未發現缺漏'}
${check.openQuestions.length ? `- 待決定事項 ${check.openQuestions.length} 項，見 docs/decisions.md` : '- 沒有標記為待決定的事項'}
`;
}

function agentsMd(ctx: Ctx): string {
  const { p } = ctx;
  const wf = ctx.workflows.length
    ? `\n## 工作流程\n\n${ctx.workflows
        .map((k) => {
          const w = WORKFLOWS.find((x) => x.key === k)!;
          return `- ${w.title}：\`${workflowDocPath(k)}\``;
        })
        .join('\n')}\n`
    : '';
  return `${MERGE_START}
# ${projectName(p)} — AI 工作入口

> 匯出快照（專案 ID \`${p.id}\`，revision ${p.revision}，${ctx.exportedAt}）。完整規格在 docs/，本檔只放入口與必須遵守的規則。

## 先讀這些

1. \`docs/product.md\`：產品目的、流程（FL-xxx）、功能（F-xxx）、規則（R-xxx）
2. \`docs/acceptance.md\`：驗收條件（AC-xxx 對應 F-xxx）
3. \`docs/tasks.md\`：任務清單（T-F-xxx）
4. \`docs/decisions.md\`：已確認決策與待決定事項
5. \`docs/architecture.md\`：技術限制與架構狀態
6. \`docs/ai-workflow.md\`：工作流程、驗證與回報格式
7. \`docs/handoff.md\`：最新交接狀態

## 必須遵守

- 標記【待決定】的事項不得自行定案；先提出選項與取捨，等使用者確認。
- 不做「不在範圍」或文件未列出的功能；範圍有疑問先詢問。
- 不得以跳過測試、刪除或削弱斷言、吞掉錯誤等方式讓檢查通過；認為測試有誤時先說明依據。
- 沒有實際執行的驗證一律標記「未驗證」，不可寫成通過。
- 修改既有的 AGENTS.md 或 CLAUDE.md 前先讀取並合併，不直接覆蓋。
- 結束工作前依 \`docs/ai-workflow.md\` 輸出 brief JSON，並更新 \`docs/handoff.md\`。
${wf}${MERGE_END}
`;
}

function claudeMd(ctx: Ctx): string {
  const skills =
    ctx.skillTargets.includes('claude_code') && ctx.workflows.length
      ? `\n- 若已放入 \`.claude/skills/\`，可使用：${ctx.workflows.map((k) => `\`/${k}\``).join('、')}。流程內容在 \`docs/workflows/\`。`
      : '';
  return `${MERGE_START}
# ${projectName(ctx.p)} — Claude Code 入口

@AGENTS.md

> 共同規則與必讀文件在 AGENTS.md（上一行的 \`@AGENTS.md\` 會把它匯入）。本檔只補充 Claude Code 相關說明，避免重複維護規則。匯出快照 revision ${ctx.p.revision}。

- 若既有 CLAUDE.md 已匯入 AGENTS.md，合併時不要重複加入 \`@AGENTS.md\`。${skills}
${MERGE_END}
`;
}

function productMd(ctx: Ctx): string {
  const { p } = ctx;
  const b = p.basics;
  const kind = b.kind === 'new' ? '全新專案' : b.kind === 'existing' ? '既有專案' : TAG.empty;
  const type =
    b.productType === 'other'
      ? `其他${hasText(b.productTypeOther) ? `：${inline(b.productTypeOther)}` : ''}`
      : b.productType
        ? PRODUCT_TYPE_LABEL[b.productType]
        : TAG.empty;

  const flows = p.flows.length
    ? p.flows
        .map(
          (f) => `### ${f.id} ${inline(f.title) || '（未命名流程）'}

- 起點：${hasText(f.start) ? `${TAG.confirmed}${inline(f.start)}` : TAG.empty}
- 操作步驟：
${stepsList(f.steps, '  ')}
- 預期結果：${hasText(f.expected) ? `${TAG.confirmed}${inline(f.expected)}` : TAG.empty}`,
        )
        .join('\n\n')
    : `${TAG.empty}尚未描述任何核心流程。`;

  const byScope = (scope: Feature['scope']) => p.features.filter((f) => f.scope === scope);
  const scopeSection = (scope: Feature['scope']) => {
    const list = byScope(scope);
    return list.length ? list.map((f) => featureLine(ctx, f)).join('\n') : '- （無）';
  };

  const rules = p.rules.businessRules.length
    ? p.rules.businessRules
        .map((r) => `- **${r.id}** ${r.status === 'confirmed' ? TAG.confirmed : TAG.undecided}${inline(r.text) || '（未填內容）'}`)
        .join('\n')
    : `- ${TAG.empty}`;

  const roles = p.rules.roles.length
    ? p.rules.roles
        .map(
          (r) =>
            `- **${r.id} ${inline(r.name) || '（未命名角色）'}**：${hasText(r.permissions) ? `${TAG.confirmed}${inline(r.permissions)}` : `${TAG.empty}尚未說明權限`}`,
        )
        .join('\n')
    : '- 未列出角色（視為不區分角色；若實際有不同權限需求，請使用者補充）';

  const refs = p.tech.references.length
    ? p.tech.references.map((r) => `- ${safeLink(r.url, r.note || undefined)}${r.note ? `：${inline(r.note)}` : ''}`).join('\n')
    : '- （無）';

  return `# 產品規格 — ${projectName(p)}

${header(ctx)}

${LEGEND}

## 1. 基本資訊

- 名稱：${projectName(p)}
- 簡介：${hasText(b.summary) ? `${TAG.confirmed}${inline(b.summary)}` : TAG.empty}
- 專案狀態：${kind}
- 類型：${type}
- Repo URL：${hasText(b.repoUrl) ? `${safeLink(b.repoUrl)}（僅為紀錄，AI Project Guide 未讀取此 repo）` : TAG.empty}
- 本機路徑：${hasText(b.localPath) ? `\`${b.localPath.replace(/`/g, "'").trim()}\`（僅為文字紀錄，不代表已取得存取權限）` : TAG.empty}
- 現況說明：${hasText(b.currentState) ? confirmedText(b.currentState, '  ') : TAG.empty}

## 2. 目的與使用者

- 要解決的問題：${answerLine(p.purpose.problem)}
- 使用者：${answerLine(p.purpose.users)}
- 現在的處理方式：${answerLine(p.purpose.currentProcess)}
- 希望改善的結果：${answerLine(p.purpose.desiredOutcome)}

## 3. 核心操作流程

${flows}

## 4. 功能與範圍

功能 ID 為穩定 ID，排序改變不會改變 ID。

### 第一版必要

${scopeSection('v1')}

### 之後再做（本版不實作）

${scopeSection('later')}

### 不在範圍（不得實作）

${scopeSection('out')}

## 5. 規則與資料

### 商業規則

${rules}

### 主要資料與欄位

${answerBlock(p.rules.dataConcepts)}

### 角色與權限

${roles}

- 其他存取限制：${answerLine(p.rules.accessNotes)}

### 錯誤、例外與邊界情況

${answerBlock(p.rules.edgeCases)}

## 6. 介面與體驗

- 裝置：${p.tech.devices.length ? `${TAG.confirmed}${p.tech.devices.map((d) => DEVICE_LABEL[d]).join('、')}` : TAG.empty}
- 介面語言：${hasText(p.tech.language) ? `${TAG.confirmed}${inline(p.tech.language)}` : TAG.empty}
- 風格：${answerLine(p.tech.style)}
- 參考連結：
${refs
  .split('\n')
  .map((l) => `  ${l}`)
  .join('\n')}

技術、部署、預算與期限見 docs/architecture.md；待決定事項見 docs/decisions.md。
`;
}

function acceptanceMd(ctx: Ctx): string {
  const { p } = ctx;
  const section = (f: Feature) => {
    const acs = acceptanceFor(p, f.id);
    const body = acs.length
      ? acs
          .map(
            (a) => `- **${a.id}**【${ACCEPTANCE_KIND_LABEL[a.kind]}】${TAG.confirmed}
  - 情境：${inline(a.scenario) || TAG.empty}
  - 操作：${inline(a.action) || TAG.empty}
  - 預期結果：${inline(a.expected) || TAG.empty}`,
          )
          .join('\n')
      : f.scope === 'v1'
        ? '- ⚠ 尚無驗收條件（規則檢查缺漏）。實作前請先與使用者確認驗收方式，不可自行認定完成標準。'
        : '- （尚無驗收條件）';
    return `### ${f.id} ${inline(f.title) || '（未命名功能）'}（${SCOPE_LABEL[f.scope]}）\n\n${body}`;
  };
  const v1 = p.features.filter((f) => f.scope === 'v1');
  const later = p.features.filter((f) => f.scope === 'later');
  const orphan = p.acceptance.filter((a) => !p.features.some((f) => f.id === a.featureId));

  const cmd = p.testing.commands;
  const cmdText =
    answerStatus(cmd) === 'filled'
      ? `${TAG.confirmed}\n\n\`\`\`\n${cmd.text.trim().replace(/```/g, "'''")}\n\`\`\``
      : `${answerStatus(cmd) === 'empty' ? '使用者未提供測試命令。' : answerLine(cmd)}\n\n${TAG.template}執行工具應先辨識專案既有的測試工具與命令；若沒有，提出建立方式並經使用者確認後再建立。`;

  const llm = p.testing.usesLLM
    ? `\n## 產品內 LLM 品質評估\n\n此產品本身會使用 LLM。\n\n${hasText(p.testing.llmQuality) ? confirmedText(p.testing.llmQuality) : `${TAG.empty}尚未說明品質評估方式（規則檢查提醒）。`}\n`
    : '';

  return `# 驗收條件 — ${projectName(p)}

${header(ctx)}

${LEGEND}

每個驗收條件 AC-xxx 對應一個功能 F-xxx。驗證時請記錄實際執行的命令與結果；未執行的驗證標記「未驗證」。

## 第一版必要功能

${v1.length ? v1.map(section).join('\n\n') : '- （尚未列出第一版必要功能）'}

## 之後再做的功能

${later.length ? later.map(section).join('\n\n') : '- （無）'}
${orphan.length ? `\n## 對應功能已刪除的驗收條件\n\n${orphan.map((a) => `- **${a.id}**（原對應 ${a.featureId || '未指定'}）：${inline(a.scenario)}`).join('\n')}\n` : ''}
## 測試命令

${cmdText}
${llm}
## 驗證結果狀態

- \`passed\`：實際執行且通過，附證據。
- \`failed\`：實際執行且失敗。
- \`not_run\`：沒有執行（未驗證）。
- \`blocked\`：因環境或依賴無法執行（未驗證）。
- \`unknown\`：無法判斷（未驗證）。
`;
}

function architectureMd(ctx: Ctx): string {
  const { p } = ctx;
  const stackOpen = !isFilled(p.tech.stack);
  const constraints = [
    `- 產品類型：${p.basics.productType ? `${TAG.confirmed}${PRODUCT_TYPE_LABEL[p.basics.productType]}` : TAG.empty}`,
    `- 裝置：${p.tech.devices.length ? `${TAG.confirmed}${p.tech.devices.map((d) => DEVICE_LABEL[d]).join('、')}` : TAG.empty}`,
    `- 介面語言：${hasText(p.tech.language) ? `${TAG.confirmed}${inline(p.tech.language)}` : TAG.empty}`,
    `- 預算：${answerLine(p.tech.budget)}`,
    `- 期限：${answerLine(p.tech.deadline)}`,
    `- 外部服務限制：${answerLine(p.tech.externalServices)}`,
    `- 主要資料：${answerLine(p.rules.dataConcepts)}`,
    `- 角色數量：${p.rules.roles.filter((r) => hasText(r.name)).length}`,
  ].join('\n');

  const decided = `## 技術選擇

- 技術：${answerBlock(p.tech.stack, '  ')}
- 部署環境：${answerLine(p.tech.deployment)}`;

  const existing =
    p.basics.kind === 'existing'
      ? `\n## 既有專案\n\n${TAG.template}這是既有專案。執行工具需先盤點 repo 中實際使用的技術與結構，並把結果補充到本文件，不可假設。${hasText(p.basics.currentState) ? `\n\n使用者描述的現況：${inline(p.basics.currentState)}` : ''}\n`
      : '';

  const proposal = stackOpen
    ? `\n## 尚未選定架構

使用者尚未確定技術架構（見上方「技術選擇」）。本文件**不包含任何架構決定**，執行工具不得自行定案。

${TAG.template}請執行工具先提出方案，至少回答以下問題，每題列出 2–3 個選項與取捨，並提出建議，經使用者確認後再寫入本文件與 docs/decisions.md：

1. 前端或介面要用什麼技術？為什麼適合上述裝置與使用者？
2. 資料要存在哪裡？如何備份？是否需要多人共用？
3. 部署或執行在哪裡？（見上方「部署環境」）
4. ${p.rules.roles.filter((r) => hasText(r.name)).length >= 2 ? '多個角色的登入與權限要如何實作？' : '是否需要登入？若不需要，如何避免資料被他人存取？'}
5. 測試策略與測試命令是什麼？
6. 各方案對預算、期限與外部服務限制的影響？
`
    : '';

  return `# 架構 — ${projectName(p)}

${header(ctx)}

${LEGEND}

## 限制條件

${constraints}

${decided}
${existing}${proposal}
## 架構決策紀錄

新的架構決策請記錄在 docs/decisions.md，並註明由誰確認。
`;
}

function tasksMd(ctx: Ctx): string {
  const { p } = ctx;
  const v1 = p.features.filter((f) => f.scope === 'v1');
  const prep: string[] = [];
  if (p.basics.kind === 'existing') prep.push('盤點既有專案現況，對照本文件包列出差異（見 docs/workflows/project-takeover.md）。');
  if (!isFilled(p.tech.stack)) prep.push('提出技術架構方案並取得使用者確認（見 docs/architecture.md）。');
  if (ctx.check.openQuestions.length) prep.push(`與使用者釐清 ${ctx.check.openQuestions.length} 項待決定事項（見 docs/decisions.md）。`);
  const missingAc = v1.filter((f) => acceptanceFor(p, f.id).length === 0);
  if (missingAc.length) prep.push(`與使用者確認 ${missingAc.map((f) => f.id).join('、')} 的驗收條件。`);

  const tasks = v1.length
    ? v1
        .map((f) => {
          const acs = acceptanceFor(p, f.id).map((a) => a.id);
          return `### ${taskIdFor(f)} 實作 ${f.id} ${inline(f.title) || '（未命名功能）'}

- 來源功能：${f.id}（優先級：${PRIORITY_LABEL[f.priority]}）
- 驗收條件：${acs.length ? acs.join('、') : '⚠ 尚無（需先與使用者確認）'}
- 相關流程：${f.flowIds.length ? f.flowIds.join('、') : '（未指定）'}
- 狀態：未知（匯出時 AI Project Guide 不知道實際進度；以 repo 與 brief 的證據為準）`;
        })
        .join('\n\n')
    : '- （尚未列出第一版必要功能，因此沒有任務）';

  const later = p.features.filter((f) => f.scope === 'later');
  const out = p.features.filter((f) => f.scope === 'out');

  return `# 任務清單 — ${projectName(p)}

${header(ctx)}

任務只來自使用者列出的「第一版必要」功能，任務 ID 由功能 ID 衍生（T-F-xxx 對應 F-xxx）。不得自行新增未列出的功能（例如付款、會員、聊天）。

## 準備工作

${prep.length ? `${TAG.template}以下不是產品功能，是開始實作前需要完成的準備：\n\n${prep.map((x) => `- ${x}`).join('\n')}` : '- （無）'}

## 第一版任務

${tasks}

## 之後再做（本版不實作）

${later.length ? later.map((f) => `- ${f.id} ${inline(f.title)}`).join('\n') : '- （無）'}

## 不在範圍（不得實作）

${out.length ? out.map((f) => `- ${f.id} ${inline(f.title)}`).join('\n') : '- （無）'}

## 狀態更新規則

- 任務完成需附上對應 AC 的驗證證據；未驗證不得標記完成。
- 狀態以 repo 實際內容與 brief 為準，本檔是匯出快照，不會自動更新。
`;
}

function decisionsMd(ctx: Ctx): string {
  const { p, check } = ctx;
  const confirmed: string[] = [];
  const fieldDecision = (label: string, a: Project['tech']['stack']) => {
    if (isFilled(a)) confirmed.push(`- ${label}：${TAG.confirmed}${inline(a.text)}`);
  };
  fieldDecision('技術選擇', p.tech.stack);
  fieldDecision('部署環境', p.tech.deployment);
  fieldDecision('預算', p.tech.budget);
  fieldDecision('期限', p.tech.deadline);
  fieldDecision('外部服務限制', p.tech.externalServices);
  for (const r of p.rules.businessRules.filter((r) => r.status === 'confirmed' && hasText(r.text))) {
    confirmed.push(`- 規則 ${r.id}：${TAG.confirmed}${inline(r.text)}`);
  }
  const out = p.features.filter((f) => f.scope === 'out');
  if (out.length) confirmed.push(`- 範圍：${TAG.confirmed}以下功能不在範圍：${out.map((f) => `${f.id} ${inline(f.title)}`).join('、')}`);
  const later = p.features.filter((f) => f.scope === 'later');
  if (later.length) confirmed.push(`- 範圍：${TAG.confirmed}以下功能之後再做，本版不實作：${later.map((f) => `${f.id} ${inline(f.title)}`).join('、')}`);

  const questions = check.openQuestions.map((q, i) => `- **Q-${String(i + 1).padStart(3, '0')}** ${inline(q.title)}：${inline(q.detail)}`);

  return `# 決策與待決定事項 — ${projectName(p)}

${header(ctx)}

${LEGEND}

## 已確認決策

${confirmed.length ? confirmed.join('\n') : '- （尚無已確認的技術或規則決策）'}

## 待決定事項

${questions.length ? `以下事項尚未定案。執行工具需提出選項並等待使用者確認，不可自行決定：\n\n${questions.join('\n')}` : '- 目前沒有標記為待決定的事項。'}

## 新增決策的方式

${TAG.template}新的決策請依下列格式附加在本檔，並標註確認者：

\`\`\`
### D-YYYYMMDD-序號 決策標題
- 狀態：提議中／已確認（確認者：使用者）
- 背景：
- 選項與取捨：
- 決定：
- 影響：
\`\`\`

執行 brief 的內容不會自動改寫本檔的已確認決策；需要調整時請使用者在 AI Project Guide 或本檔中確認。
`;
}

function aiWorkflowMd(ctx: Ctx): string {
  const { p } = ctx;
  const a = p.aiWork;
  const exampleJson = JSON.stringify(
    briefTemplate(p.id, {
      tool: a.preferredTool === 'claude_code' ? 'claude_code' : 'codex',
      taskIds: [],
    }),
    null,
    2,
  );
  const userOr = (v: string, fallback: string) => (hasText(v) ? confirmedText(v) : `${TAG.empty}\n\n${TAG.template}${fallback}`);
  return `# AI 工作流程 — ${projectName(p)}

${header(ctx)}

${LEGEND}

## 工具

- 偏好工具：${a.preferredTool ? `${TAG.confirmed}${TOOL_PREF_LABEL[a.preferredTool]}` : TAG.empty}
- 工具與模型分開記錄；本文件不指定模型。

## 可以自主處理的事

${userOr(a.autonomy, '在已確認規格範圍內的程式實作、測試撰寫、重構與文件更新。')}

## 需要使用者決定的事

${userOr(a.needsDecision, '新增或更換主要依賴、變更資料格式、刪除資料、任何標記【待決定】的事項、偏離規格或擴大範圍。')}

## 標準工作流程

1. **先讀現況**：讀 AGENTS.md、docs/ 與 docs/handoff.md，再檢查 repo 實際狀態（git 狀態、既有測試）。不假設未驗證的進度。
2. **小步實作**：一次只處理一個任務或一小部分；每一步保持可建置。
3. **依風險驗證**：改動越核心、影響越大，驗證越完整（單元測試、整合測試、手動檢查）。
4. **提供證據**：回報實際執行的命令與輸出摘要；沒有執行的驗證標記「未驗證」。
5. **更新交接**：更新 docs/handoff.md，並輸出 brief JSON。

## 測試誠信

- 不得以跳過測試、刪除或削弱斷言、放寬比對、吞掉錯誤、硬編碼結果等方式讓檢查通過。
- 若認為測試本身錯誤，先說明依據（規格條文或錯誤原因），經使用者同意後才修改。
- 無法執行的驗證標記 \`not_run\` 或 \`blocked\`，並寫明原因。

## 既有文件

- 修改 AGENTS.md、CLAUDE.md 或 docs/ 既有檔案前先讀取並合併，不直接覆蓋。
- AI Project Guide 產生的內容以 \`${MERGE_START}\` / \`${MERGE_END}\` 標記包住，方便下次替換。

## 結束工作：輸出 brief JSON

結束工作時輸出一份 JSON，格式如下（欄位不可省略；清單沒有內容時用 \`[]\`；不知道的 branch、commit、model 用 \`null\`）。\`tests[].result\` 只能是 \`passed\`、\`failed\`、\`not_run\`、\`blocked\`、\`unknown\`。

\`\`\`json
${exampleJson}
\`\`\`

- \`projectId\` 必須是 \`${p.id}\`。
- \`recordId\` 需唯一；同一個 recordId 重複匯入會被 AI Project Guide 視為同一筆。
- \`summary\` 只寫實際完成且有證據的內容。
- 使用者會把這份 JSON 匯入 AI Project Guide。brief 不會自動修改產品規格或已確認決策。
`;
}

function handoffMd(ctx: Ctx): string {
  const { p, handoff } = ctx;
  const a = p.aiWork;
  const statusBlock = `## 使用者描述的目前狀況

- 目前狀況：${hasText(a.currentStatus) ? `${TAG.confirmed}${inline(a.currentStatus)}` : TAG.empty}
- 已知問題：${hasText(a.knownIssues) ? `${TAG.confirmed}${inline(a.knownIssues)}` : TAG.empty}
- 使用者規劃的下一步：${hasText(a.nextStep) ? `${TAG.confirmed}${inline(a.nextStep)}` : TAG.empty}`;

  let briefBlock: string;
  if (handoff) {
    const c = testCounts(handoff);
    const tests = handoff.tests.length
      ? handoff.tests
          .map(
            (t) =>
              `- \`${inline(t.command) || '（未提供命令）'}\` → ${t.result}（${TEST_RESULT_LABEL[t.result]}）；環境：${inline(t.environment) || '未提供'}；證據：${
                /^https?:\/\//i.test(t.evidence.trim()) ? safeLink(t.evidence) : inline(t.evidence) || '未提供'
              }`,
          )
          .join('\n')
      : '- （未回報任何測試）';
    const changedAfter =
      p.revision !== handoff.projectRevisionAtImport
        ? `\n> 注意：此紀錄匯入時規格為 revision ${handoff.projectRevisionAtImport}，目前為 revision ${p.revision}；紀錄中的內容可能未涵蓋之後的規格修改。\n`
        : '';
    briefBlock = `## 接手依據（執行 brief）

- 紀錄 ID：\`${handoff.recordId}\`
- 來源：${BRIEF_SOURCE_LABEL[handoff.source]}（AI Project Guide 未親自執行或驗證）
- 工具：${BRIEF_TOOL_LABEL[handoff.tool]}${handoff.model ? `；模型紀錄：${inline(handoff.model)}` : ''}
- 發生時間：${handoff.occurredAt}；匯入時間：${handoff.importedAt}
- 任務：${handoff.taskIds.length ? handoff.taskIds.map(inline).join('、') : '（未指定）'}
- 分支：${handoff.branch ? inline(handoff.branch) : '（未提供）'}
- 版本：${handoff.commit ? `commit \`${inline(handoff.commit)}\`` : '尚未綁定版本（沒有 commit）'}
${changedAfter}
### 完成摘要（回報）

${textLines(handoff.summary)}

### 變更檔案（回報）

${bulletList(handoff.changedFiles)}

### 測試（回報結果：passed ${c.passed}、failed ${c.failed}、not_run ${c.not_run}、blocked ${c.blocked}、unknown ${c.unknown}）

以下是當時回報的結果，屬於該次工作的版本，不代表目前版本的測試結果；接手時需重新驗證。

${tests}

### 已知問題

${bulletList(handoff.knownIssues)}

### 未完成項目

${bulletList(handoff.unfinished)}

### 待使用者決策

${bulletList(handoff.decisionsNeeded)}

### 建議下一步

${bulletList(handoff.nextSteps)}`;
  } else {
    briefBlock = `## 接手依據（執行 brief）

尚未選定接手依據：AI Project Guide 中${ctx.briefs.length ? '有執行紀錄，但使用者尚未選擇作為接手依據的那一筆' : '尚未匯入任何執行 brief'}。

接手者必須先盤點專案現況（見 docs/workflows/project-takeover.md），不可假設已有任何開發進度。`;
  }

  const history = sortBriefsNewestFirst(ctx.briefs).slice(0, 10);
  const historyBlock = history.length
    ? `\n## 最近的執行紀錄\n\n${history
        .map((b) => `- \`${b.recordId}\`｜${BRIEF_TOOL_LABEL[b.tool]}｜${b.occurredAt}｜${b.commit ? `commit ${inline(b.commit)}` : '尚未綁定版本'}${b.id === handoff?.id ? '｜目前接手依據' : ''}`)
        .join('\n')}\n`
    : '';

  return `# 交接 — ${projectName(p)}

${header(ctx)}

${LEGEND}

${statusBlock}

${briefBlock}
${historyBlock}
## 更新方式

工作結束時，執行工具依 docs/ai-workflow.md 輸出 brief JSON，使用者匯入 AI Project Guide 後重新下載文件包；或由執行工具直接更新本檔「最近的執行紀錄」一節。
`;
}

// ---------------- 對外介面 ----------------

export function generateDocs(input: DocsInput): GeneratedFile[] {
  const p = input.project;
  const handoff = p.handoffBriefId ? (input.briefs.find((b) => b.id === p.handoffBriefId) ?? null) : null;
  const ctx: Ctx = {
    p,
    check: runRuleCheck(p),
    exportedAt: input.exportedAt,
    handoff,
    briefs: input.briefs,
    workflows: input.workflows ?? WORKFLOWS.map((w) => w.key),
    skillTargets: input.skillTargets ?? defaultSkillTargets(p),
  };
  const hdr = header(ctx);

  const files: GeneratedFile[] = [
    { path: 'AGENTS.md', description: '共用 AI 工作入口（Codex 等工具讀取），指向 docs/', content: agentsMd(ctx) },
    { path: 'CLAUDE.md', description: 'Claude Code 入口，以 @AGENTS.md 匯入共用規則', content: claudeMd(ctx) },
    { path: 'docs/product.md', description: '產品目的、流程、功能範圍、規則與資料', content: productMd(ctx) },
    { path: 'docs/acceptance.md', description: '驗收條件（AC 對應功能 F）與測試命令', content: acceptanceMd(ctx) },
    { path: 'docs/architecture.md', description: '技術限制、架構狀態與待提案問題', content: architectureMd(ctx) },
    { path: 'docs/tasks.md', description: '由第一版功能衍生的任務清單', content: tasksMd(ctx) },
    { path: 'docs/decisions.md', description: '已確認決策與待決定事項', content: decisionsMd(ctx) },
    { path: 'docs/ai-workflow.md', description: '工作流程、測試誠信規則與 brief 格式', content: aiWorkflowMd(ctx) },
    { path: 'docs/handoff.md', description: '目前狀況與接手依據', content: handoffMd(ctx) },
  ];

  // 排序：共用流程 → Claude Code 入口 → Codex 入口（依流程固定順序）。
  const selectedWorkflows = WORKFLOWS.filter((w) => ctx.workflows.includes(w.key));
  for (const w of selectedWorkflows) {
    files.push({ path: workflowDocPath(w.key), description: `工作流程：${w.title}（skills 共用內容）`, content: renderWorkflowDoc(w, hdr) });
  }
  for (const t of (['claude_code', 'codex'] as SkillTarget[]).filter((x) => ctx.skillTargets.includes(x))) {
    for (const w of selectedWorkflows) {
      files.push({
        path: skillPath(t, w.key),
        description: `${t === 'claude_code' ? 'Claude Code' : 'Codex'} skill 入口：${w.title}`,
        content: renderSkillEntry(w, t),
      });
    }
  }

  const exampleBriefJson = JSON.stringify(briefTemplate(p.id, { tool: 'codex', taskIds: [] }), null, 2) + '\n';
  files.push({ path: 'docs/brief-template.json', description: '結束工作時輸出的 brief JSON 範本', content: exampleBriefJson });

  // START_HERE 放最前面，並列出其他檔案。
  const listed = [
    { path: 'START_HERE.md', description: '從這裡開始：用途、合併方式、下一步' },
    ...files.map((f) => ({ path: f.path, description: f.description })),
    { path: 'ai-guide-export.json', description: '匯出紀錄（版本、revision、時間、檔案清單）' },
  ];
  const start: GeneratedFile = { path: 'START_HERE.md', description: listed[0].description, content: startHere(ctx, listed) };

  const manifest: GeneratedFile = {
    path: 'ai-guide-export.json',
    description: listed[listed.length - 1].description,
    content:
      JSON.stringify(
        {
          generator: 'AI Project Guide',
          snapshot: true,
          note: '此為匯出快照；網站上之後的修改不會自動同步。',
          projectId: p.id,
          projectName: p.basics.name,
          revision: p.revision,
          schemaVersion: SCHEMA_VERSION,
          templateVersion: TEMPLATE_VERSION,
          exportedAt: input.exportedAt,
          handoffBriefRecordId: handoff?.recordId ?? null,
          specStatus: ctx.check.isDraft ? 'draft' : 'no_rule_issues',
          files: listed.map((f) => f.path),
        },
        null,
        2,
      ) + '\n',
  };

  return [start, ...files, manifest];
}

/** 依路徑取出生成檔案。 */
export function findFile(files: GeneratedFile[], path: string): GeneratedFile | undefined {
  return files.find((f) => f.path === path);
}
