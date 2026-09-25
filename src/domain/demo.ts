import { exampleBrief, toStoredBrief } from './brief';
import { createEmptyProject, type Project, type StoredBrief } from './model';

export const DEMO_PROJECT_ID = 'demo-tool-lending';
export const DEMO_META_KEY = 'demoInitialized';

/** 示範專案：所有內容皆為虛構示範資料，isDemo 標記會顯示在介面上。 */
export function buildDemo(now: string): { project: Project; briefs: StoredBrief[] } {
  const base = createEmptyProject(DEMO_PROJECT_ID, '社區工具借用登記（示範）', now);
  const project: Project = {
    ...base,
    isDemo: true,
    basics: {
      ...base.basics,
      summary: '讓社區住戶用手機登記借用與歸還共享工具，管理員掌握借出與逾期狀況。',
      kind: 'new',
      productType: 'internal_tool',
      currentState: '目前用紙本登記簿，放在管理室。',
    },
    purpose: {
      problem: { mode: 'answer', text: '紙本登記常漏寫歸還日期，管理員不知道工具在誰手上，逾期也無法提醒。' },
      users: { mode: 'answer', text: '社區住戶（約 120 戶）與 2 位管理員。' },
      currentProcess: { mode: 'answer', text: '住戶到管理室在紙本上寫姓名、工具與日期；歸還時由管理員打勾。' },
      desiredOutcome: { mode: 'answer', text: '住戶用手機 1 分鐘內完成登記；管理員隨時看到借出中與逾期清單。' },
    },
    flows: [
      { id: 'FL-001', title: '住戶借用工具', start: '住戶在管理室拿起要借的工具', steps: '掃描工具上的 QR code\n選擇自己的門牌號碼\n確認預計歸還日期\n送出登記', expected: '畫面顯示登記成功，工具狀態變成「借出中」' },
      { id: 'FL-002', title: '住戶歸還工具', start: '住戶把工具放回管理室', steps: '掃描工具上的 QR code\n按下「歸還」', expected: '工具狀態變回「可借用」，借用紀錄記下歸還日期' },
      { id: 'FL-003', title: '管理員查看逾期', start: '管理員打開管理頁面', steps: '開啟逾期清單\n依門牌聯絡住戶', expected: '看到所有超過預計歸還日、尚未歸還的紀錄' },
    ],
    features: [
      { id: 'F-001', title: '借用登記', description: '掃描工具 QR code 後選門牌、預計歸還日並送出。', priority: 'high', scope: 'v1', flowIds: ['FL-001'] },
      { id: 'F-002', title: '歸還登記', description: '掃描後一鍵歸還。', priority: 'high', scope: 'v1', flowIds: ['FL-002'] },
      { id: 'F-003', title: '逾期清單', description: '管理員查看逾期中的借用紀錄。', priority: 'medium', scope: 'v1', flowIds: ['FL-003'] },
      { id: 'F-004', title: 'LINE 逾期通知', description: '逾期時自動通知住戶。', priority: 'low', scope: 'later', flowIds: [] },
      { id: 'F-005', title: '押金線上付款', description: '借用高價工具時收取押金。', priority: 'low', scope: 'out', flowIds: [] },
    ],
    rules: {
      businessRules: [
        { id: 'R-001', text: '每戶同時最多借 2 件工具。', status: 'confirmed' },
        { id: 'R-002', text: '逾期天數要以 7 天或 14 天計算。', status: 'undecided' },
      ],
      dataConcepts: { mode: 'answer', text: '工具：名稱、編號、狀態。\n借用紀錄：工具、門牌、借出日、預計歸還日、實際歸還日。' },
      roles: [
        { id: 'RO-001', name: '住戶', permissions: '只能登記借用與歸還，看不到其他住戶的借用紀錄。' },
        { id: 'RO-002', name: '管理員', permissions: '可查看全部紀錄與逾期清單，可新增或停用工具。' },
      ],
      accessNotes: { mode: 'answer', text: '' },
      edgeCases: { mode: 'answer', text: '同一工具已借出時不可再借。\n門牌輸入錯誤要提示。\n手機沒網路時要明確顯示「尚未送出」。' },
    },
    tech: {
      devices: ['mobile', 'desktop'],
      language: '繁體中文',
      style: { mode: 'answer', text: '簡單、大字、按鈕清楚，適合長輩使用。' },
      references: [],
      stack: { mode: 'ai_propose', text: '希望維護成本低，管理員不需要懂技術。' },
      deployment: { mode: 'undecided', text: '可能放在管理委員會的共用電腦。' },
      budget: { mode: 'answer', text: '每月不超過新台幣 300 元。' },
      deadline: { mode: 'answer', text: '下個月的住戶大會前可以試用。' },
      externalServices: { mode: 'answer', text: '不使用需要綁定信用卡的服務。' },
    },
    acceptance: [
      { id: 'AC-001', featureId: 'F-001', kind: 'normal', scenario: '工具可借用，住戶目前借用未達上限', action: '掃描工具並送出登記', expected: '顯示登記成功，工具狀態為「借出中」' },
      { id: 'AC-002', featureId: 'F-001', kind: 'failure', scenario: '該工具已被借出', action: '嘗試再次登記借用', expected: '顯示「此工具已借出」，不建立新紀錄' },
      { id: 'AC-003', featureId: 'F-001', kind: 'failure', scenario: '住戶已同時借用 2 件工具', action: '嘗試借第 3 件', expected: '顯示已達借用上限，不建立新紀錄' },
      { id: 'AC-004', featureId: 'F-002', kind: 'normal', scenario: '工具借出中', action: '掃描後按「歸還」', expected: '工具狀態變回「可借用」，紀錄寫入實際歸還日' },
      { id: 'AC-005', featureId: 'F-003', kind: 'normal', scenario: '有一筆紀錄超過預計歸還日且未歸還', action: '管理員開啟逾期清單', expected: '清單中出現該筆紀錄與門牌' },
      { id: 'AC-006', featureId: 'F-003', kind: 'permission', scenario: '以住戶身分使用', action: '嘗試開啟逾期清單', expected: '顯示沒有權限，看不到任何紀錄' },
    ],
    testing: { commands: { mode: 'undecided', text: '' }, usesLLM: false, llmQuality: '' },
    aiWork: {
      preferredTool: 'both',
      autonomy: '表單與清單畫面的實作、測試撰寫、介面文字調整。',
      needsDecision: '技術架構、部署位置、逾期天數規則、任何會產生費用的服務。',
      knownIssues: '',
      currentStatus: '需求整理中，尚未開始開發。',
      nextStep: '請 AI 提出技術方案，確認後再開始實作 F-001。',
    },
    counters: { flow: 3, feature: 5, rule: 2, role: 2, acceptance: 6, reference: 0 },
  };

  const brief = toStoredBrief(
    { ...exampleBrief(DEMO_PROJECT_ID), recordId: 'demo-2026-01-31-codex-01' },
    { id: 'demo-brief-1', source: 'imported', importedAt: now, projectRevision: project.revision, isDemo: true },
  );
  return { project, briefs: [brief] };
}
