# 產品規格：AI Project Guide（v0.1.0）

## 定位

引導式專案規格與 AI 交接工具。使用者以繁體中文整理專案需求，產生 Codex／Claude Code 共用文件、工作規則與接手 Prompt，降低遺漏需求、方向偏移與工具切換時的資訊斷層。

## 核心流程

新增專案 → 逐步整理需求 → 確認摘要與缺漏 → 產生文件及 Prompt → 下載到本機專案 → 在 Codex／Claude Code 執行 → 將執行 brief 帶回 → 產生下一次接手或審查 Prompt。

## 範圍（v0.1.0 已實作）

| 區塊 | 內容 |
| --- | --- |
| 專案總覽 | 新增、搜尋、篩選（進行中／封存／全部）、封存、刪除（確認並列出將刪除的本機資料）、單專案備份；顯示目的、最近更新、必要項目完成數、缺漏／待決定數、最新 brief（或「尚未匯入 brief」）、下一步；不顯示開發完成百分比 |
| 精靈 | 8 步：基本資訊、目的與使用者、核心流程、功能與範圍、規則與資料、UI 與技術限制、驗收、AI 工作與人工決策；每欄有白話問題、為什麼需要、範例、必填／選填；三態欄位（填寫／尚未決定／希望 AI 提案）；延遲自動保存與保存狀態；保存失敗顯示錯誤、可重試與下載 JSON |
| 規則檢查 | 確定性規則：缺目的、缺使用者、缺核心流程、第一版功能無驗收、有角色但無權限、關鍵技術待決定等；每項可「前往填寫」 |
| 文件 | START_HERE、AGENTS、CLAUDE、docs/product、acceptance、architecture、tasks、decisions、ai-workflow、handoff、brief-template.json、ai-guide-export.json；預覽（禁用原始 HTML）、複製、單檔下載、ZIP |
| Skills | 接手專案、驗證並完成任務、審查變更；內容單一來源 `docs/workflows/`，入口 `.claude/skills/`、`.agents/skills/` |
| Prompt | 新專案啟動、既有專案盤點、實作指定功能、接手繼續開發、獨立審查、問題診斷、結束工作並輸出 brief；工具與模型分開 |
| 執行 brief | 手動表單、貼上／上傳 JSON（先預覽再確認）、時間軸、展開證據、設為接手依據、重複 recordId 不新增 |
| 資料與備份 | 單一／全部 JSON 備份、匯入預覽、ID 衝突（保留現有／取代／另存新專案）、schema 版本檢查、儲存用量與 persist 請求 |

## 不在範圍（v0.1.0）

後端、帳號、GitHub 授權或同步、模型 API、付費、雲端執行器、本機代理、即時日誌、分析追蹤、多分頁同時編輯的衝突合併、發布部署。

## 關鍵規則

- 未決資訊不得寫成已確認；文件以【使用者確認】【待決定】【模板建議】區分。
- 未選架構時 architecture.md 只列限制與待提案問題。
- tasks.md 只來自使用者列出的第一版功能（T-F-xxx 對應 F-xxx）。
- brief 標示來源（手動／匯入回報），平台不宣稱執行過測試；缺 commit 顯示「尚未綁定版本」；舊紀錄不代表目前版本；brief 不修改規格或決策。
- 匯入資料視為不可信：大小限制、zod 驗證、未來版本拒絕、不執行內容、連結僅 http(s)。
- 每次匯出記錄 schemaVersion、templateVersion、revision 與時間；專案修改後提示既有匯出不是最新。

## 資料模型摘要（schemaVersion 1）

- `Project`：basics、purpose、flows（FL-xxx）、features（F-xxx，scope v1/later/out）、rules（R-xxx、roles RO-xxx）、tech、acceptance（AC-xxx → featureId）、testing、aiWork、counters（穩定 ID，只增不減）、revision、summaryConfirmedRevision、handoffBriefId。
- `StoredBrief`：brief JSON（format `ai-project-guide/brief`、formatVersion 1）+ source、importedAt、projectRevisionAtImport。
- `ExportRecord`：exportedAt、revision、schemaVersion、templateVersion、kind、files、handoffBriefId。
- 定義與驗證：`src/domain/model.ts`。
