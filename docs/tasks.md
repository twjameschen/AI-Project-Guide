# 任務清單

狀態只依實際執行結果更新。「完成」需有對應的自動化測試或實際操作證據。最後更新：2026-09-25。

## 里程碑

| ID | 任務 | 狀態 | 證據 |
| --- | --- | --- | --- |
| M1 | 骨架、資料模型、IndexedDB、總覽、草稿、示範專案 | 完成 | `tests/unit/storage.test.ts`、E2E 1、8 |
| M2 | 8 步精靈、三態欄位、自動保存、規則檢查與摘要 | 完成 | `tests/unit/ruleCheck.test.ts`、E2E 1、2、保存失敗 |
| M3 | 文件、Skills、Prompt、ZIP、匯出紀錄與過期提示 | 完成 | `tests/unit/docs.test.ts`、`prompts.test.ts`、`safety.test.ts`、E2E 3+4 |
| M4 | brief（手動／JSON）、時間軸、接手依據、備份還原與衝突 | 完成 | `tests/unit/brief.test.ts`、`backup.test.ts`、E2E 5+6、7、手動 brief |
| M5 | 整合測試、視覺檢查、文件 | 完成 | 見下方驗證紀錄 |

## 驗證紀錄（2026-09-25，Node 22.22.2，Linux 容器，Chromium 141 headless）

| 命令 | 結果 |
| --- | --- |
| `npm run typecheck` | passed |
| `npm run lint` | passed |
| `npm test` | passed：8 檔 52 項 |
| `npm run build` | passed（chunk > 500 kB 警告，見 decisions D-009） |
| `npm run e2e` | passed：16 項 |
| `npm audit` | 0 vulnerabilities |
| 手動截圖檢查 1366×900、390×844（總覽、精靈、摘要、文件、Prompt、執行紀錄、資料、說明） | 無水平溢位、無 console 錯誤 |
| 探索測試腳本（精靈 8 步全操作、排序／刪除 ID 不重用、7 種 Prompt × 2 工具、brief 增刪與接手切換、封存篩選、備份取代、示範專案移除與重新加入、404） | 全部通過；首輪 3 項失敗經確認為腳本斷言錯誤，修正後通過 |
| 系統 `unzip -t` 與 Python `zipfile` 讀取匯出 ZIP | 無錯誤，21 個檔案 |

## 測試中發現並修正的問題（2026-09-25）

- 啟動時加入示範專案若寫入失敗，不再阻擋整個 App（E2E：示範專案寫入失敗時不阻擋啟動）。
- 規則檢查新增提醒：Repo 網址或參考連結不是 http(s)（單元測試）。
- 摘要頁分開顯示「新舊專案」與「類型」，並帶出「其他」類型說明。
- 匯入檔案選擇後清空 input，可重選同一檔案（E2E 7 發現）。

## 未驗證／限制

- 使用者只在瀏覽器使用本網站；以 Chromium 驗證。未測 Firefox、Safari（含 Safari 私密瀏覽的 IndexedDB 行為）。
- 未在實體手機／平板裝置測試，只用 viewport 模擬。
- 未用螢幕閱讀器實測；只驗證 label、鍵盤 Tab、可見 focus、Esc 關閉對話框。
- 產生的 `.claude/skills`、`.agents/skills` 入口未在實際 Claude Code／Codex 中驗證會被載入（屬下載後在外部工具的行為，不在本網站的瀏覽器測試範圍）。
- Codex skills 位置只透過官方頁搜尋摘錄確認（該網域被此環境 proxy 封鎖）。
- 同一專案在多個分頁同時編輯：最後寫入為準，未做衝突提示。

## 候選下一步（未排程）

- 多分頁編輯偵測（BroadcastChannel）與衝突提示。
- Firefox／WebKit 專案納入 Playwright。
- 以 code splitting 降低首次載入大小。
- schema 遷移框架（有 v2 時才需要）。
