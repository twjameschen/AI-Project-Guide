# 交接紀錄

最後更新：2026-09-25。本檔記錄實際狀態；未驗證的內容明確標示。

## 目前狀態

v0.1.0 功能完整可本機執行（`npm install && npm run dev`）。規格要求的主要畫面、文件生成、Skills、Prompt、brief、備份還原皆已實作，並通過 typecheck、lint、51 項單元測試、build、15 項 E2E（詳見 docs/tasks.md）。

尚未發布、未建立遠端 repo。

## 程式結構

```
src/
  domain/        資料模型（zod）、規則檢查、revision、brief／備份解析、示範資料、標籤
  generators/    純函式：docs.ts（文件）、prompts.ts、workflows.ts（skills 單一來源）、md.ts（跳脫與標記）、zip.ts
  storage/       repo.ts（IndexedDB）、autosave.ts（延遲保存控制器）
  components/    表單欄位、對話框、複製按鈕、安全 Markdown 預覽
  pages/         總覽、資料與備份、說明；project/（精靈、摘要、文件、Prompt、brief）
  app/           App 外殼、repo context、toast
tests/unit/      Vitest（fake-indexeddb）
tests/e2e/       Playwright（對 production build）
```

## 修改時注意

- 改變資料格式：遞增 `SCHEMA_VERSION` 並提供遷移；`parseBackupText` 目前拒絕非 v1。
- 改變文件／Prompt 模板：遞增 `TEMPLATE_VERSION`（`src/domain/model.ts`），並更新 `tests/unit/docs.test.ts`、`prompts.test.ts` 中的預期內容。
- 規則檢查欄位的 `fieldId` 必須對應精靈中的 DOM id（`src/domain/ruleCheck.ts` ↔ `src/pages/project/wizardSteps.tsx`）。
- 不要引入對外連線；正式 build 的 CSP 為 `connect-src 'self'`，E2E 會檢查沒有外部請求。
- `react-hooks` v7 lint 規則禁止在 render 期間存取 ref；自動保存以 `useState` 初始化 `Autosaver`。

## 已知問題與未驗證項目

見 docs/tasks.md「未驗證／限制」。

## 建議下一步

1. 使用者親自驗收（見 README 或交付說明中的 5 個操作）。
2. 依回饋調整精靈文案與範例。
3. 視需要加入 Firefox／WebKit E2E 與多分頁衝突提示。
