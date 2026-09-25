/**
 * 三個入門工作流程的單一來源。
 * - docs/workflows/<name>.md：完整流程內容（唯一內容來源）。
 * - .claude/skills/<name>/SKILL.md、.agents/skills/<name>/SKILL.md：精簡入口，只指向上面的檔案。
 *
 * 格式依據（產生時確認）：
 * - Claude Code：官方文件 code.claude.com/docs/en/skills —— 專案 skill 放在 `.claude/skills/<skill-name>/SKILL.md`，
 *   YAML frontmatter 含 name、description。
 * - Codex：官方頁 developers.openai.com/codex/skills 指出 repo skill 放在 `.agents/skills`（本版開發環境無法直接開啟該頁，
 *   依官方頁搜尋摘錄確認）。兩者皆採 Agent Skills 格式：name 需為小寫英數與連字號且與資料夾同名，description 必填。
 * 以上皆未在實際工具環境驗證「一定會自動載入」，文件中會明確說明。
 */

export type WorkflowKey = 'project-takeover' | 'verify-and-complete' | 'review-changes';
export type SkillTarget = 'claude_code' | 'codex';

export interface WorkflowDef {
  key: WorkflowKey;
  title: string;
  /** SKILL.md description：說明做什麼與何時使用（≤ 1024 字元）。 */
  description: string;
  purpose: string;
  triggers: string[];
  inputs: string[];
  steps: string[];
  outputs: string[];
  failure: string[];
}

export const WORKFLOWS: WorkflowDef[] = [
  {
    key: 'project-takeover',
    title: '接手專案',
    description:
      '接手或恢復此專案的開發時使用：讀取 docs/ 規格與 docs/handoff.md，核對 repo 實際狀態，產出盤點結果，不假設任何未驗證的進度。Use when starting, resuming or taking over work on this project.',
    purpose: '在動手修改前，建立「規格說什麼、交接紀錄說什麼、repo 實際是什麼」三者一致的認識。',
    triggers: [
      '第一次在此專案開始工作。',
      '換了工具（Codex ↔ Claude Code）或換人接手。',
      '距離上次工作已有一段時間，或 docs/handoff.md 有新的接手依據。',
    ],
    inputs: [
      'AGENTS.md（Claude Code 另有 CLAUDE.md）與 docs/ 下所有規格文件。',
      'docs/handoff.md 中的接手依據 brief（可能沒有）。',
      'repo 實際狀態：git 狀態與記錄、目錄結構、既有測試與設定。',
    ],
    steps: [
      '讀取 AGENTS.md、docs/product.md、docs/acceptance.md、docs/tasks.md、docs/decisions.md、docs/ai-workflow.md、docs/handoff.md。',
      '確認各文件開頭的匯出快照 revision 是否一致；不一致時列出並詢問使用者以哪一份為準。',
      '檢查 repo 實際狀態：`git status`、最近的提交紀錄、目錄結構、套件設定、既有測試與命令。只讀取，不修改。',
      '若 handoff 有接手依據 brief：逐項核對其中宣稱的變更檔案、commit 與測試結果是否與 repo 一致；brief 中的測試結果是回報，不是本次驗證結果。',
      '若沒有 brief：視為未知進度，只根據 repo 實際內容判斷，不可推測「應該已完成」。',
      '整理差異：規格有但 repo 沒有、repo 有但規格沒有、brief 宣稱但無法確認的內容。',
      '列出下一步建議，其中涉及【待決定】事項的部分標示需要使用者決定。',
    ],
    outputs: [
      '盤點報告：已確認存在的內容（附檔案路徑或命令輸出作為證據）、無法確認的內容、差異清單。',
      '可重現的測試命令清單，以及本次是否實際執行（未執行標記「未驗證」）。',
      '建議的下一個小步驟與需要使用者決定的問題。',
    ],
    failure: [
      '找不到 docs/ 或 AGENTS.md：停止並告知使用者文件包尚未放入專案，不要自行編寫規格。',
      '文件與 repo 嚴重不一致：不要自行選邊修改，列出差異並請使用者決定。',
      '無法執行任何命令（權限或環境限制）：說明原因，所有結論標記「未驗證」。',
    ],
  },
  {
    key: 'verify-and-complete',
    title: '驗證並完成任務',
    description:
      '實作或收尾 docs/tasks.md 中的指定任務時使用：以小步驟實作，依驗收條件（AC-xxx）驗證並提供證據，更新交接紀錄。Use when implementing or finishing a specific task or feature in this project.',
    purpose: '讓每個任務都有對應驗收條件的實際證據，避免「看起來完成」但沒有驗證。',
    triggers: [
      '使用者指定要實作或完成某個任務（T-F-xxx）或功能（F-xxx）。',
      '要把進行中的任務收尾並回報。',
    ],
    inputs: [
      '任務 ID 與對應功能 ID（docs/tasks.md）。',
      '對應驗收條件 AC-xxx（docs/acceptance.md）。',
      '相關限制與待決定事項（docs/decisions.md、docs/architecture.md）。',
    ],
    steps: [
      '確認任務範圍：只處理指定任務，不順手加入未列出的功能。',
      '檢查任務是否依賴【待決定】事項；若有，先提出選項並等待使用者決定，不自行定案。',
      '先讀相關現有程式碼與測試，再以小步驟修改；每一步都保持可建置狀態。',
      '為每個對應的 AC 準備驗證方式：自動化測試優先；無法自動化時寫明手動驗證步驟。',
      '實際執行驗證命令，保存輸出摘要作為證據；失敗就修正程式或說明原因，不削弱測試。',
      '若認為測試本身錯誤，先說明依據（規格條文、錯誤原因），經使用者同意後才修改測試。',
      '更新 docs/handoff.md 與任務狀態，依 docs/ai-workflow.md 輸出 brief JSON。',
    ],
    outputs: [
      '變更檔案清單與摘要。',
      '每個 AC 的驗證結果：passed／failed／not_run／blocked／unknown，附命令與證據。',
      '符合 docs/ai-workflow.md 格式的 brief JSON。',
    ],
    failure: [
      '驗證失敗：回報失敗的 AC 與錯誤輸出，任務狀態維持未完成，不得標記完成。',
      '環境無法執行測試：標記 not_run 或 blocked，寫明原因與使用者可自行執行的命令。',
      '發現規格矛盾：停止相關修改，列出矛盾並請使用者決定。',
    ],
  },
  {
    key: 'review-changes',
    title: '審查變更',
    description:
      '需要獨立審查一組變更（分支、commit 或 brief 回報的工作）時使用：對照規格與驗收條件找出問題，預設只回報、不修改程式。Use when reviewing changes, a branch, or reported work against this project\'s spec.',
    purpose: '以獨立角度檢查變更是否符合規格、驗收條件與工作規則，並確認宣稱的測試是否真的可重現。',
    triggers: [
      '另一個工具或另一段工作完成後，需要第二意見。',
      '合併前的檢查。',
      'brief 回報完成，但需要確認真實性。',
    ],
    inputs: [
      '要審查的範圍：分支、commit 範圍或變更檔案清單。',
      '相關功能與 AC（docs/product.md、docs/acceptance.md）。',
      '接手依據 brief（若有）中宣稱的測試結果。',
    ],
    steps: [
      '確認審查範圍與基準（例如 `git diff <base>...<head>`）；範圍不明確時先詢問。',
      '逐一對照相關 AC：變更是否實作了、是否有對應測試、是否有遺漏的失敗與權限案例。',
      '檢查是否有超出範圍的功能、未經確認就定案的【待決定】事項。',
      '檢查測試誠信：是否有跳過測試、刪除或削弱斷言、吞掉錯誤、硬編碼測試資料讓檢查通過。',
      '在可行範圍內重新執行宣稱通過的測試命令，記錄實際結果；無法執行則標記未驗證。',
      '預設不修改程式；若使用者要求修正，改用「驗證並完成任務」流程。',
    ],
    outputs: [
      '問題清單：嚴重度（阻擋／重要／建議）、位置、原因、建議修正。',
      '每個相關 AC 的審查結論與證據。',
      '重新執行的命令與結果；未執行者標記「未驗證」。',
    ],
    failure: [
      '無法取得變更內容：說明缺少什麼（分支、commit），不要憑 brief 文字下結論。',
      '無法執行測試：只提供靜態審查結論，並明確標記未驗證的部分。',
    ],
  },
];

export const WORKFLOW_KEYS = WORKFLOWS.map((w) => w.key);

export function workflowDocPath(key: WorkflowKey) {
  return `docs/workflows/${key}.md`;
}

export function skillPath(target: SkillTarget, key: WorkflowKey) {
  return target === 'claude_code' ? `.claude/skills/${key}/SKILL.md` : `.agents/skills/${key}/SKILL.md`;
}

export function renderWorkflowDoc(w: WorkflowDef, header: string): string {
  const list = (items: string[]) => items.map((i) => `- ${i}`).join('\n');
  const ordered = (items: string[]) => items.map((i, n) => `${n + 1}. ${i}`).join('\n');
  return `# 工作流程：${w.title}

${header}

${'【模板建議】'}此流程是 AI Project Guide 提供的通用工作流程模板，不是本專案使用者的產品決定；可依專案需要調整。

## 用途

${w.purpose}

## 觸發條件

${list(w.triggers)}

## 輸入

${list(w.inputs)}

## 步驟

${ordered(w.steps)}

## 輸出

${list(w.outputs)}

## 失敗處理

${list(w.failure)}

## 共同規則

- 不得以跳過測試、刪除或削弱斷言、吞掉錯誤等方式讓檢查通過。
- 沒有實際執行的驗證一律標記「未驗證」。
- 不得自行定案標記為【待決定】的事項。
- 詳細規則見 docs/ai-workflow.md。
`;
}

export function renderSkillEntry(w: WorkflowDef, target: SkillTarget): string {
  const toolNote =
    target === 'claude_code'
      ? '此入口依 Claude Code 官方 skills 格式產生（`.claude/skills/<name>/SKILL.md`）。可用 `/' + w.key + '` 手動呼叫，或由 Claude 依 description 自動選用；實際是否載入以你的 Claude Code 版本為準。'
      : '此入口依 Codex 官方 skills 說明產生（repo 內 `.agents/skills/<name>/SKILL.md`）。實際是否載入與呼叫方式以你的 Codex 版本與官方文件為準。';
  return `---
name: ${w.key}
description: ${JSON.stringify(w.description.replace(/\n/g, ' '))}
---

# ${w.title}

完整流程只維護在 \`${workflowDocPath(w.key)}\`（單一來源）。請先讀取該檔案並依其步驟執行，完成後依 \`docs/ai-workflow.md\` 回報。

若找不到該檔案，停止並告知使用者：AI Project Guide 文件包尚未完整放入此專案。

> ${toolNote}
`;
}
