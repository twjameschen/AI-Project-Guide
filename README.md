# AI Project Guide

引導式專案規格與 AI 交接工具（本機瀏覽器版）。把專案需求逐步整理清楚，產生 Codex 與 Claude Code 共用的規格文件、工作規則、skills 模板與接手 Prompt，並把外部工具回傳的執行 brief 帶回來，產生下一次接手或審查 Prompt。

- 純前端：React 19 + TypeScript + Vite，資料存在瀏覽器 IndexedDB。
- 沒有後端、帳號、GitHub 串接或模型 API；不連線任何 AI，不讀取 repo，不執行測試。
- 所有文件與 Prompt 都由可測試的模板函式依使用者輸入產生（`src/generators/`）。

## 需求

- Node.js 22.12 以上（開發時使用 22.22）
- npm 10

## 指令

```bash
npm install          # 安裝（依 package-lock.json）
npm run dev          # 開發伺服器 http://localhost:5173
npm run typecheck    # TypeScript 檢查
npm run lint         # ESLint
npm test             # Vitest 單元／資料邏輯測試
npm run build        # 產出 dist/（含 CSP）
npm run preview      # 以 production build 啟動 http://localhost:4173
npm run e2e          # Playwright E2E（會自動 build + preview）
npm run check        # typecheck + lint + test + build
```

E2E 使用 `@playwright/test` 1.56.1（對應 Chromium 1194）。若本機沒有瀏覽器，先執行 `npx playwright install chromium`。

## 使用流程

1. 專案總覽 →「新增專案」→ 依 8 步精靈填寫（自動保存草稿，可隨時離開再回來）。
2. 不確定的欄位選「尚未決定」或「希望 AI 提案」，文件會標為【待決定】。
3. 「摘要與檢查」查看規則檢查結果，「前往填寫」回到欄位，按「確認摘要」。
4. 「文件與 Skills」預覽、複製、單檔下載或「下載文件包（ZIP）」。
5. 依 ZIP 內 `START_HERE.md` 放入目標專案（不覆蓋既有 AGENTS.md／CLAUDE.md，以標記區塊合併）。
6. 「Prompt」選情境與工具（Codex／Claude Code）→ 複製貼給工具。
7. 工作結束用「結束工作並輸出 brief」Prompt，把工具輸出的 JSON 匯入「執行紀錄」，設為接手依據。
8. 再產生「接手繼續開發」或「獨立審查」Prompt。

第一次開啟會自動加入可移除的示範專案「社區工具借用登記（示範）」，含一筆示範 brief。

## 資料保存

資料只存在此瀏覽器、此網站來源的 IndexedDB，不會跨裝置同步；清除網站資料會遺失內容。請在「資料與備份」定期下載 JSON 備份。

## 專案文件

- [docs/product.md](docs/product.md)：本平台產品規格與範圍
- [docs/decisions.md](docs/decisions.md)：架構與技術決策
- [docs/tasks.md](docs/tasks.md)：任務清單與驗證狀態
- [docs/handoff.md](docs/handoff.md)：最新交接狀態
- [AGENTS.md](AGENTS.md)／[CLAUDE.md](CLAUDE.md)：給 AI 開發工具的入口
