import type {
  AcceptanceKind,
  AnswerMode,
  BriefSource,
  BriefTool,
  Device,
  FeaturePriority,
  FeatureScope,
  ProductType,
  TestResult,
  ToolPreference,
} from './model';

export const PRODUCT_TYPE_LABEL: Record<ProductType, string> = {
  '': '尚未選擇',
  website: '網站',
  internal_tool: '內部工具',
  api: 'API',
  automation: '自動化腳本',
  other: '其他',
};

export const SCOPE_LABEL: Record<FeatureScope, string> = {
  v1: '第一版必要',
  later: '之後再做',
  out: '不在範圍',
};

export const PRIORITY_LABEL: Record<FeaturePriority, string> = {
  high: '高',
  medium: '中',
  low: '低',
};

export const ACCEPTANCE_KIND_LABEL: Record<AcceptanceKind, string> = {
  normal: '正常',
  failure: '失敗／例外',
  permission: '權限',
};

export const ANSWER_MODE_LABEL: Record<AnswerMode, string> = {
  answer: '填寫',
  undecided: '尚未決定',
  ai_propose: '希望 AI 提案',
};

export const TOOL_PREF_LABEL: Record<ToolPreference, string> = {
  '': '尚未選擇',
  codex: 'Codex',
  claude_code: 'Claude Code',
  both: 'Codex 與 Claude Code',
};

export const BRIEF_TOOL_LABEL: Record<BriefTool, string> = {
  codex: 'Codex',
  claude_code: 'Claude Code',
  other: '其他工具',
};

export const BRIEF_SOURCE_LABEL: Record<BriefSource, string> = {
  manual: '手動填寫',
  imported: '匯入回報（JSON）',
};

export const TEST_RESULT_LABEL: Record<TestResult, string> = {
  passed: '通過（回報）',
  failed: '失敗（回報）',
  not_run: '未執行',
  blocked: '受阻',
  unknown: '未知',
};

export const DEVICE_LABEL: Record<Device, string> = {
  desktop: '桌面電腦',
  mobile: '手機',
  tablet: '平板',
};
