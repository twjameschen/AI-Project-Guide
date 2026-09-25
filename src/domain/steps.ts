export const WIZARD_STEPS = [
  { key: 'basics', title: '基本資訊', hint: '名稱、類型與現況' },
  { key: 'purpose', title: '目的與使用者', hint: '解決什麼問題、誰會用' },
  { key: 'flows', title: '核心操作流程', hint: '使用者依序做什麼' },
  { key: 'features', title: '功能與範圍', hint: '第一版做什麼、不做什麼' },
  { key: 'rules', title: '規則與資料', hint: '規則、資料、角色、例外' },
  { key: 'tech', title: 'UI 與技術限制', hint: '裝置、風格、技術、預算' },
  { key: 'acceptance', title: '驗收', hint: '怎樣才算做好' },
  { key: 'ai', title: 'AI 工作與人工決策', hint: '工具與決策邊界' },
] as const;

export type WizardStepKey = (typeof WIZARD_STEPS)[number]['key'];
export const STEP_INDEX: Record<WizardStepKey, number> = Object.fromEntries(
  WIZARD_STEPS.map((s, i) => [s.key, i]),
) as Record<WizardStepKey, number>;
