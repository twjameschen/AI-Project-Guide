import { z } from 'zod';

/** 專案資料結構版本。資料格式有不相容變更時才遞增，並需提供遷移。 */
export const SCHEMA_VERSION = 1;
/** 文件／Prompt 模板版本。模板內容變更時遞增，會寫入每次匯出紀錄。 */
export const TEMPLATE_VERSION = '1.0.0';
export const APP_VERSION = '0.1.0';

export const BRIEF_FORMAT = 'ai-project-guide/brief';
export const BRIEF_FORMAT_VERSION = 1;
export const BACKUP_FORMAT = 'ai-project-guide/backup';

const TEXT_MAX = 20_000;
const SHORT_MAX = 500;
const LIST_MAX = 500;

const text = () => z.string().max(TEXT_MAX);
const short = () => z.string().max(SHORT_MAX);

/** 「填寫／尚未決定／希望 AI 提案」三態欄位。 */
export const answerModeSchema = z.enum(['answer', 'undecided', 'ai_propose']);
export type AnswerMode = z.infer<typeof answerModeSchema>;
export const answerSchema = z.object({ text: text(), mode: answerModeSchema });
export type Answer = z.infer<typeof answerSchema>;
export const emptyAnswer = (): Answer => ({ text: '', mode: 'answer' });

export const projectKindSchema = z.enum(['', 'new', 'existing']);
export const productTypeSchema = z.enum(['', 'website', 'internal_tool', 'api', 'automation', 'other']);
export type ProductType = z.infer<typeof productTypeSchema>;

export const flowSchema = z.object({
  id: short(),
  title: short(),
  start: text(),
  steps: text(),
  expected: text(),
});
export type Flow = z.infer<typeof flowSchema>;

export const featureScopeSchema = z.enum(['v1', 'later', 'out']);
export type FeatureScope = z.infer<typeof featureScopeSchema>;
export const featurePrioritySchema = z.enum(['high', 'medium', 'low']);
export type FeaturePriority = z.infer<typeof featurePrioritySchema>;

export const featureSchema = z.object({
  id: short(),
  title: short(),
  description: text(),
  priority: featurePrioritySchema,
  scope: featureScopeSchema,
  flowIds: z.array(short()).max(LIST_MAX),
});
export type Feature = z.infer<typeof featureSchema>;

export const businessRuleSchema = z.object({
  id: short(),
  text: text(),
  status: z.enum(['confirmed', 'undecided']),
});
export type BusinessRule = z.infer<typeof businessRuleSchema>;

export const roleSchema = z.object({
  id: short(),
  name: short(),
  permissions: text(),
});
export type Role = z.infer<typeof roleSchema>;

export const referenceSchema = z.object({
  id: short(),
  url: z.string().max(2000),
  note: short(),
});
export type Reference = z.infer<typeof referenceSchema>;

export const acceptanceKindSchema = z.enum(['normal', 'failure', 'permission']);
export type AcceptanceKind = z.infer<typeof acceptanceKindSchema>;
export const acceptanceSchema = z.object({
  id: short(),
  featureId: short(),
  kind: acceptanceKindSchema,
  scenario: text(),
  action: text(),
  expected: text(),
});
export type AcceptanceCriterion = z.infer<typeof acceptanceSchema>;

export const toolPreferenceSchema = z.enum(['', 'codex', 'claude_code', 'both']);
export type ToolPreference = z.infer<typeof toolPreferenceSchema>;

export const deviceSchema = z.enum(['desktop', 'mobile', 'tablet']);
export type Device = z.infer<typeof deviceSchema>;

export const projectSchema = z.object({
  id: short(),
  schemaVersion: z.literal(SCHEMA_VERSION),
  revision: z.number().int().min(0),
  createdAt: short(),
  updatedAt: short(),
  archived: z.boolean(),
  isDemo: z.boolean(),
  wizardStep: z.number().int().min(0).max(20),
  basics: z.object({
    name: short(),
    summary: text(),
    kind: projectKindSchema,
    productType: productTypeSchema,
    productTypeOther: short(),
    repoUrl: z.string().max(2000),
    localPath: z.string().max(2000),
    currentState: text(),
  }),
  purpose: z.object({
    problem: answerSchema,
    users: answerSchema,
    currentProcess: answerSchema,
    desiredOutcome: answerSchema,
  }),
  flows: z.array(flowSchema).max(LIST_MAX),
  features: z.array(featureSchema).max(LIST_MAX),
  rules: z.object({
    businessRules: z.array(businessRuleSchema).max(LIST_MAX),
    dataConcepts: answerSchema,
    roles: z.array(roleSchema).max(LIST_MAX),
    accessNotes: answerSchema,
    edgeCases: answerSchema,
  }),
  tech: z.object({
    devices: z.array(deviceSchema).max(3),
    language: short(),
    style: answerSchema,
    references: z.array(referenceSchema).max(LIST_MAX),
    stack: answerSchema,
    deployment: answerSchema,
    budget: answerSchema,
    deadline: answerSchema,
    externalServices: answerSchema,
  }),
  acceptance: z.array(acceptanceSchema).max(LIST_MAX * 4),
  testing: z.object({
    commands: answerSchema,
    usesLLM: z.boolean(),
    llmQuality: text(),
  }),
  aiWork: z.object({
    preferredTool: toolPreferenceSchema,
    autonomy: text(),
    needsDecision: text(),
    knownIssues: text(),
    currentStatus: text(),
    nextStep: text(),
  }),
  counters: z.object({
    flow: z.number().int().min(0),
    feature: z.number().int().min(0),
    rule: z.number().int().min(0),
    role: z.number().int().min(0),
    acceptance: z.number().int().min(0),
    reference: z.number().int().min(0),
  }),
  summaryConfirmedRevision: z.number().int().min(0).nullable(),
  handoffBriefId: short().nullable(),
});
export type Project = z.infer<typeof projectSchema>;

// ---------- 執行 brief ----------

export const testResultSchema = z.enum(['passed', 'failed', 'not_run', 'blocked', 'unknown']);
export type TestResult = z.infer<typeof testResultSchema>;
export const briefToolSchema = z.enum(['codex', 'claude_code', 'other']);
export type BriefTool = z.infer<typeof briefToolSchema>;

const isoDate = z
  .string()
  .max(64)
  .refine((v) => !Number.isNaN(Date.parse(v)) && /^\d{4}-\d{2}-\d{2}T/.test(v), {
    message: '需為 ISO 8601 日期時間，例如 2026-01-31T09:30:00+08:00',
  });

export const briefTestSchema = z.object({
  command: z.string().max(2000),
  environment: z.string().max(2000),
  result: testResultSchema,
  evidence: z.string().max(TEXT_MAX),
});
export type BriefTest = z.infer<typeof briefTestSchema>;

const stringList = () => z.array(z.string().max(TEXT_MAX)).max(LIST_MAX);

/** 外部工具回傳的 brief JSON 格式（本平台只接受此格式）。 */
export const briefFileSchema = z.object({
  format: z.literal(BRIEF_FORMAT),
  formatVersion: z.literal(BRIEF_FORMAT_VERSION),
  projectId: short().min(1),
  recordId: z
    .string()
    .min(1)
    .max(120)
    .regex(/^[A-Za-z0-9._:-]+$/, '只能包含英數字與 . _ : -'),
  taskIds: z.array(z.string().max(120)).max(LIST_MAX),
  tool: briefToolSchema,
  model: z.string().max(200).nullable().optional(),
  occurredAt: isoDate,
  branch: z.string().max(300).nullable().optional(),
  commit: z.string().max(100).nullable().optional(),
  summary: z.string().min(1).max(TEXT_MAX),
  changedFiles: z.array(z.string().max(1000)).max(5000),
  tests: z.array(briefTestSchema).max(LIST_MAX),
  knownIssues: stringList(),
  unfinished: stringList(),
  decisionsNeeded: stringList(),
  nextSteps: stringList(),
});
export type BriefFile = z.infer<typeof briefFileSchema>;

export const briefSourceSchema = z.enum(['manual', 'imported']);
export type BriefSource = z.infer<typeof briefSourceSchema>;

/** 平台保存的 brief：外部內容 + 平台自己記錄的來源與匯入時間。 */
export const storedBriefSchema = briefFileSchema.extend({
  id: short().min(1),
  source: briefSourceSchema,
  importedAt: isoDate,
  projectRevisionAtImport: z.number().int().min(0),
  isDemo: z.boolean(),
});
export type StoredBrief = z.infer<typeof storedBriefSchema>;

// ---------- 匯出紀錄 ----------

export const exportRecordSchema = z.object({
  id: short(),
  projectId: short(),
  exportedAt: isoDate,
  revision: z.number().int().min(0),
  schemaVersion: z.number().int(),
  templateVersion: short(),
  kind: z.enum(['zip', 'file']),
  files: z.array(z.string().max(500)).max(500),
  handoffBriefId: short().nullable(),
});
export type ExportRecord = z.infer<typeof exportRecordSchema>;

// ---------- 備份 ----------

export const backupEntrySchema = z.object({
  project: projectSchema,
  briefs: z.array(storedBriefSchema).max(5000),
  exports: z.array(exportRecordSchema).max(5000),
});
export type BackupEntry = z.infer<typeof backupEntrySchema>;

export const backupSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  schemaVersion: z.literal(SCHEMA_VERSION),
  appVersion: short(),
  exportedAt: isoDate,
  scope: z.enum(['single', 'all']),
  projects: z.array(backupEntrySchema).max(1000),
});
export type Backup = z.infer<typeof backupSchema>;

// ---------- 建立空白專案 ----------

export function createEmptyProject(id: string, name: string, now: string): Project {
  return {
    id,
    schemaVersion: SCHEMA_VERSION,
    revision: 1,
    createdAt: now,
    updatedAt: now,
    archived: false,
    isDemo: false,
    wizardStep: 0,
    basics: {
      name,
      summary: '',
      kind: '',
      productType: '',
      productTypeOther: '',
      repoUrl: '',
      localPath: '',
      currentState: '',
    },
    purpose: {
      problem: emptyAnswer(),
      users: emptyAnswer(),
      currentProcess: emptyAnswer(),
      desiredOutcome: emptyAnswer(),
    },
    flows: [],
    features: [],
    rules: {
      businessRules: [],
      dataConcepts: emptyAnswer(),
      roles: [],
      accessNotes: emptyAnswer(),
      edgeCases: emptyAnswer(),
    },
    tech: {
      devices: [],
      language: '繁體中文',
      style: emptyAnswer(),
      references: [],
      stack: emptyAnswer(),
      deployment: emptyAnswer(),
      budget: emptyAnswer(),
      deadline: emptyAnswer(),
      externalServices: emptyAnswer(),
    },
    acceptance: [],
    testing: { commands: emptyAnswer(), usesLLM: false, llmQuality: '' },
    aiWork: {
      preferredTool: '',
      autonomy: '',
      needsDecision: '',
      knownIssues: '',
      currentStatus: '',
      nextStep: '',
    },
    counters: { flow: 0, feature: 0, rule: 0, role: 0, acceptance: 0, reference: 0 },
    summaryConfirmedRevision: null,
    handoffBriefId: null,
  };
}
