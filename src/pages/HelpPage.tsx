import { Link } from 'react-router';

export function HelpPage() {
  return (
    <div className="page page-narrow stack">
      <h1>使用說明</h1>

      <section className="card">
        <h2>這個網站做什麼、不做什麼</h2>
        <ul>
          <li>引導你把專案需求整理清楚，產生 Codex 與 Claude Code 都能讀的共用文件、工作規則與接手 Prompt。</li>
          <li>所有文件與 Prompt 都是依你填寫的內容以固定模板產生；<strong>沒有連線任何 AI</strong>，沒有 AI 分析。</li>
          <li>不會讀取你的 repo 或電腦檔案、不會執行程式或測試、不會同步 GitHub。repo 網址與本機路徑只是文字紀錄。</li>
          <li>「規則檢查」是固定規則的缺漏檢查，不是完整審查。</li>
        </ul>
      </section>

      <section className="card">
        <h2>完整流程</h2>
        <ol>
          <li>在<Link to="/">專案總覽</Link>新增專案，依精靈逐步填寫。每次修改會自動保存草稿，可隨時離開再回來。</li>
          <li>不確定的欄位選「尚未決定」或「希望 AI 提案」，文件會標為待決定事項，AI 不可自行定案。</li>
          <li>到「摘要與檢查」看缺漏，點「前往填寫」回到對應欄位；看過摘要後按「確認摘要」。</li>
          <li>到「文件與 Skills」下載文件包（ZIP）。</li>
          <li>把文件放進目標專案（見下方），在 Codex 或 Claude Code 開啟專案。</li>
          <li>到「Prompt」選擇情境與工具，複製 Prompt 貼給工具執行。</li>
          <li>工作結束時，使用「結束工作並輸出 brief」Prompt，讓工具輸出 brief JSON。</li>
          <li>到「執行紀錄」匯入 JSON，設為接手依據，再產生下一次的「接手繼續開發」或「獨立審查」Prompt。</li>
        </ol>
      </section>

      <section className="card">
        <h2>把文件放進專案（避免覆蓋既有規則）</h2>
        <ol>
          <li>ZIP 內所有檔案都在 <code>ai-guide-export/</code> 資料夾下，先解壓到暫存位置。</li>
          <li>全新專案：把 <code>ai-guide-export/</code> 內的檔案全部複製到專案根目錄。</li>
          <li>
            既有專案：若已有 <code>AGENTS.md</code> 或 <code>CLAUDE.md</code>，不要覆蓋；把本包檔案中
            <code>&lt;!-- ai-project-guide:start --&gt;</code> 與 <code>&lt;!-- ai-project-guide:end --&gt;</code> 之間的內容附加到既有檔案，下次更新時只替換這個區塊。
          </li>
          <li>
            或使用「既有專案盤點」Prompt，請 AI 依 <code>START_HERE.md</code> 的規則合併並列出差異，覆蓋前需經你確認。
          </li>
        </ol>
      </section>

      <section className="card">
        <h2>Codex 與 Claude Code</h2>
        <ul>
          <li>
            <strong>Codex</strong> 讀取專案中的 <code>AGENTS.md</code>。可選的 skills 入口放在 <code>.agents/skills/</code>。
          </li>
          <li>
            <strong>Claude Code</strong> 讀取 <code>CLAUDE.md</code>；本網站產生的 CLAUDE.md 以 <code>@AGENTS.md</code> 匯入共用規則，避免兩份規則不同步。skills 入口放在{' '}
            <code>.claude/skills/</code>，可用 <code>/skill 名稱</code> 呼叫。
          </li>
          <li>skills 的流程內容只維護在 <code>docs/workflows/</code>。入口檔依官方文件格式產生，但是否自動載入取決於工具版本與設定。</li>
          <li>Prompt 只區分工具，不指定模型；模型可在 brief 中選填紀錄。</li>
        </ul>
      </section>

      <section className="card">
        <h2>執行 brief</h2>
        <ul>
          <li>brief 是外部工具回報或你手動填寫的工作紀錄，標示來源；本網站沒有親自執行測試。</li>
          <li>測試結果只能是 passed、failed、not_run、blocked、unknown。沒有 commit 時顯示「尚未綁定版本」。</li>
          <li>舊紀錄不代表目前版本的測試結果；接手 Prompt 會要求重新驗證。</li>
          <li>相同紀錄 ID 重複匯入不會新增；其他專案或不支援版本的 JSON 會被拒絕。</li>
          <li>brief 不會自動修改產品規格、架構或你已確認的決策。</li>
        </ul>
      </section>

      <section className="card">
        <h2>資料保存</h2>
        <p>資料只存在此瀏覽器（IndexedDB），不會跨裝置同步；清除網站資料會遺失內容。請到<Link to="/data">資料與備份</Link>定期下載 JSON 備份。</p>
      </section>
    </div>
  );
}
