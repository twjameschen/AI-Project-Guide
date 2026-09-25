import { useConfirm } from '../../components/ConfirmDialog';
import { AnswerField, ExampleBox, TextField } from '../../components/fields';
import { allocateId } from '../../domain/ids';
import {
  ACCEPTANCE_KIND_LABEL,
  DEVICE_LABEL,
  PRIORITY_LABEL,
  PRODUCT_TYPE_LABEL,
  SCOPE_LABEL,
  TOOL_PREF_LABEL,
} from '../../domain/labels';
import { isSafeHttpUrl } from '../../domain/links';
import type {
  AcceptanceKind,
  Device,
  FeaturePriority,
  FeatureScope,
  ProductType,
  Project,
  ToolPreference,
} from '../../domain/model';
import type { WizardStepKey } from '../../domain/steps';

type Update = (fn: (p: Project) => Project) => void;
interface StepProps {
  p: Project;
  update: Update;
}

export function StepView({ stepKey, p, update }: StepProps & { stepKey: WizardStepKey }) {
  switch (stepKey) {
    case 'basics':
      return <BasicsStep p={p} update={update} />;
    case 'purpose':
      return <PurposeStep p={p} update={update} />;
    case 'flows':
      return <FlowsStep p={p} update={update} />;
    case 'features':
      return <FeaturesStep p={p} update={update} />;
    case 'rules':
      return <RulesStep p={p} update={update} />;
    case 'tech':
      return <TechStep p={p} update={update} />;
    case 'acceptance':
      return <AcceptanceStep p={p} update={update} />;
    case 'ai':
      return <AiStep p={p} update={update} />;
  }
}

function move<T>(list: T[], index: number, delta: number): T[] {
  const j = index + delta;
  if (j < 0 || j >= list.length) return list;
  const copy = [...list];
  [copy[index], copy[j]] = [copy[j], copy[index]];
  return copy;
}

function MoveButtons({ index, length, onMove, label }: { index: number; length: number; onMove: (d: number) => void; label: string }) {
  return (
    <>
      <button type="button" className="btn btn-sm" disabled={index === 0} onClick={() => onMove(-1)} aria-label={`把 ${label} 上移`}>
        上移
      </button>
      <button type="button" className="btn btn-sm" disabled={index === length - 1} onClick={() => onMove(1)} aria-label={`把 ${label} 下移`}>
        下移
      </button>
    </>
  );
}

// ---------------- 1. 基本資訊 ----------------

function BasicsStep({ p, update }: StepProps) {
  const b = p.basics;
  const set = (patch: Partial<Project['basics']>) => update((x) => ({ ...x, basics: { ...x.basics, ...patch } }));
  const urlError = b.repoUrl.trim() && !isSafeHttpUrl(b.repoUrl) ? '只接受 http:// 或 https:// 開頭的網址。' : null;
  return (
    <>
      <TextField
        id="basics-name"
        label="專案叫什麼名字？"
        required
        why="用來辨識專案，也會出現在所有文件標題。"
        example="社區工具借用登記"
        value={b.name}
        onChange={(v) => set({ name: v })}
      />
      <TextField
        id="basics-summary"
        label="用一兩句話說明這個專案"
        why="讓第一次看到文件的人（或 AI）快速知道在做什麼。"
        example="讓住戶用手機登記借用與歸還工具，管理員看得到逾期狀況。"
        value={b.summary}
        onChange={(v) => set({ summary: v })}
        multiline
        rows={2}
      />
      <div className="field">
        <fieldset>
          <legend>
            這是全新專案，還是已經有程式碼的專案？<span className="opt">選填</span>
          </legend>
          <p className="why">既有專案需要先盤點現況，產生的 Prompt 會不同。</p>
          <div className="choice-row">
            {(
              [
                ['new', '全新專案'],
                ['existing', '既有專案'],
              ] as const
            ).map(([v, l]) => (
              <label key={v}>
                <input type="radio" name="basics-kind" checked={b.kind === v} onChange={() => set({ kind: v })} />
                {l}
              </label>
            ))}
          </div>
        </fieldset>
      </div>
      <div className="field">
        <fieldset>
          <legend>
            它比較像哪一種？<span className="opt">選填</span>
          </legend>
          <p className="why">影響文件中的限制條件與 AI 需要提案的架構問題。</p>
          <div className="choice-row">
            {(['website', 'internal_tool', 'api', 'automation', 'other'] as ProductType[]).map((v) => (
              <label key={v}>
                <input type="radio" name="basics-type" checked={b.productType === v} onChange={() => set({ productType: v })} />
                {PRODUCT_TYPE_LABEL[v]}
              </label>
            ))}
          </div>
        </fieldset>
        {b.productType === 'other' && (
          <TextField id="basics-typeOther" label="其他類型說明" value={b.productTypeOther} onChange={(v) => set({ productTypeOther: v })} example="Chrome 擴充功能" />
        )}
      </div>
      <TextField
        id="basics-repoUrl"
        label="Repo 網址"
        type="url"
        why="只記錄在文件中方便查找。本網站不會連線、讀取或同步這個 repo。"
        example="https://github.com/your-name/tool-lending"
        value={b.repoUrl}
        onChange={(v) => set({ repoUrl: v })}
        error={urlError}
      />
      <TextField
        id="basics-localPath"
        label="本機專案路徑（文字紀錄）"
        why="只是文字紀錄，方便你在 Prompt 中提到位置；本網站無法也不會存取你電腦中的檔案。"
        example="~/projects/tool-lending"
        value={b.localPath}
        onChange={(v) => set({ localPath: v })}
      />
      <TextField
        id="basics-currentState"
        label={b.kind === 'existing' ? '目前做到哪裡？有哪些已知狀況？' : '現在有什麼可以沿用的東西嗎？'}
        why="讓 AI 知道起點，避免重做或誤判進度。"
        example={b.kind === 'existing' ? '登入與列表已完成；匯出功能常出錯；沒有測試。' : '目前用紙本登記簿。'}
        value={b.currentState}
        onChange={(v) => set({ currentState: v })}
        multiline
      />
    </>
  );
}

// ---------------- 2. 目的與使用者 ----------------

function PurposeStep({ p, update }: StepProps) {
  const set = (key: keyof Project['purpose']) => (v: Project['purpose'][typeof key]) =>
    update((x) => ({ ...x, purpose: { ...x.purpose, [key]: v } }));
  return (
    <>
      <AnswerField
        id="purpose-problem"
        label="這個專案要解決什麼問題？"
        required
        why="目的決定哪些功能重要。沒有目的，AI 容易做出方向偏移的東西。"
        example="紙本登記常漏寫歸還日期，管理員不知道工具在誰手上。"
        value={p.purpose.problem}
        onChange={set('problem')}
        allowAI={false}
      />
      <AnswerField
        id="purpose-users"
        label="誰會使用？大約多少人？"
        required
        why="不同使用者的熟悉程度、裝置與權限都不同。"
        example="社區住戶約 120 戶，多數用手機；另有 2 位管理員。"
        value={p.purpose.users}
        onChange={set('users')}
        allowAI={false}
      />
      <AnswerField
        id="purpose-currentProcess"
        label="現在是怎麼處理的？"
        why="了解現況才知道新做法要比原本好在哪裡，也能發現容易漏掉的步驟。"
        example="住戶到管理室在紙本上寫姓名與日期，歸還時管理員打勾。"
        value={p.purpose.currentProcess}
        onChange={set('currentProcess')}
        allowAI={false}
      />
      <AnswerField
        id="purpose-desiredOutcome"
        label="做好之後，希望改善成什麼樣子？"
        why="用來判斷專案是否成功，也是驗收的方向。"
        example="住戶 1 分鐘內完成登記；管理員隨時看得到逾期清單。"
        value={p.purpose.desiredOutcome}
        onChange={set('desiredOutcome')}
        allowAI={false}
      />
    </>
  );
}

// ---------------- 3. 核心操作流程 ----------------

function FlowsStep({ p, update }: StepProps) {
  const [confirm, confirmEl] = useConfirm();
  const add = () =>
    update((x) => {
      const { id, counters } = allocateId(x.counters, 'flow');
      return { ...x, counters, flows: [...x.flows, { id, title: '', start: '', steps: '', expected: '' }] };
    });
  const setFlow = (id: string, patch: Partial<Project['flows'][number]>) =>
    update((x) => ({ ...x, flows: x.flows.map((f) => (f.id === id ? { ...f, ...patch } : f)) }));
  return (
    <>
      <p>描述使用者從開始到完成一件事的過程。每條流程一件事，寫得越像真實生活越好。</p>
      <ExampleBox title="生活化範例：訂便當">
        <p>
          <strong>起點：</strong>同事中午前打開訂餐頁
          <br />
          <strong>操作：</strong>1. 選今天的店家；2. 選便當和數量；3. 按「送出」
          <br />
          <strong>預期結果：</strong>看到「已訂購」，負責人的清單多一筆
        </p>
      </ExampleBox>
      {p.flows.length === 0 && <p className="muted">還沒有流程。至少需要一條核心流程。</p>}
      {p.flows.map((f, i) => (
        <div className="item-card" key={f.id}>
          <div className="item-head">
            <span className="id-chip">{f.id}</span>
            <div className="row">
              <MoveButtons index={i} length={p.flows.length} label={f.id} onMove={(d) => update((x) => ({ ...x, flows: move(x.flows, i, d) }))} />
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                style={{ color: 'var(--danger)' }}
                onClick={async () => {
                  const ok = await confirm({ title: `刪除流程 ${f.id}？`, body: <p>功能中對此流程的關聯也會一併移除。流程 ID 不會被重複使用。</p>, confirmLabel: '刪除流程', danger: true });
                  if (ok)
                    update((x) => ({
                      ...x,
                      flows: x.flows.filter((y) => y.id !== f.id),
                      features: x.features.map((ft) => ({ ...ft, flowIds: ft.flowIds.filter((fid) => fid !== f.id) })),
                    }));
                }}
              >
                刪除
              </button>
            </div>
          </div>
          <TextField id={`flow-${f.id}-title`} label="流程名稱" example="住戶借用工具" value={f.title} onChange={(v) => setFlow(f.id, { title: v })} />
          <TextField id={`flow-${f.id}-start`} label="起點：使用者在什麼情況下開始？" example="住戶在管理室拿起要借的工具" value={f.start} onChange={(v) => setFlow(f.id, { start: v })} />
          <TextField
            id={`flow-${f.id}-steps`}
            label="操作步驟（一行一個動作）"
            required
            why="依序列出使用者實際會做的動作，AI 會依此設計畫面與測試。"
            example={'掃描工具上的 QR code\n選擇門牌\n按「送出」'}
            value={f.steps}
            onChange={(v) => setFlow(f.id, { steps: v })}
            multiline
            rows={4}
          />
          <TextField
            id={`flow-${f.id}-expected`}
            label="預期結果：完成後應該看到什麼？"
            required
            example="畫面顯示登記成功，工具狀態變成「借出中」"
            value={f.expected}
            onChange={(v) => setFlow(f.id, { expected: v })}
          />
        </div>
      ))}
      <button type="button" className="btn" id="flows-add" onClick={add}>
        ＋ 新增流程
      </button>
      {confirmEl}
    </>
  );
}

// ---------------- 4. 功能與範圍 ----------------

function FeaturesStep({ p, update }: StepProps) {
  const [confirm, confirmEl] = useConfirm();
  const add = () =>
    update((x) => {
      const { id, counters } = allocateId(x.counters, 'feature');
      return {
        ...x,
        counters,
        features: [...x.features, { id, title: '', description: '', priority: 'medium' as FeaturePriority, scope: 'v1' as FeatureScope, flowIds: [] }],
      };
    });
  const setFeature = (id: string, patch: Partial<Project['features'][number]>) =>
    update((x) => ({ ...x, features: x.features.map((f) => (f.id === id ? { ...f, ...patch } : f)) }));
  return (
    <>
      <p>列出要做的功能，並區分「第一版必要」「之後再做」「不在範圍」。明確寫下不做的事，可以避免 AI 擅自加功能。</p>
      <ExampleBox>
        <p>
          第一版必要：借用登記、歸還登記。之後再做：LINE 通知。不在範圍：線上付款。
          <br />
          每項功能有固定編號（F-001…），調整順序不會改變編號，驗收條件會用編號對應。
        </p>
      </ExampleBox>
      {p.features.length === 0 && <p className="muted">還沒有功能。至少需要一項「第一版必要」功能。</p>}
      {p.features.map((f, i) => {
        const acCount = p.acceptance.filter((a) => a.featureId === f.id).length;
        return (
          <div className="item-card" key={f.id} data-testid={`feature-${f.id}`}>
            <div className="item-head">
              <span className="row">
                <span className="id-chip">{f.id}</span>
                <span className="small muted">{acCount} 個驗收條件</span>
              </span>
              <div className="row">
                <MoveButtons index={i} length={p.features.length} label={f.id} onMove={(d) => update((x) => ({ ...x, features: move(x.features, i, d) }))} />
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  style={{ color: 'var(--danger)' }}
                  onClick={async () => {
                    const ok = await confirm({
                      title: `刪除功能 ${f.id}？`,
                      body: <p>{acCount > 0 ? `此功能的 ${acCount} 個驗收條件也會一併刪除。` : ''}功能 ID 不會被重複使用。</p>,
                      confirmLabel: '刪除功能',
                      danger: true,
                    });
                    if (ok)
                      update((x) => ({
                        ...x,
                        features: x.features.filter((y) => y.id !== f.id),
                        acceptance: x.acceptance.filter((a) => a.featureId !== f.id),
                      }));
                  }}
                >
                  刪除
                </button>
              </div>
            </div>
            <TextField id={`feature-${f.id}-title`} label="功能名稱" required example="借用登記" value={f.title} onChange={(v) => setFeature(f.id, { title: v })} />
            <TextField
              id={`feature-${f.id}-description`}
              label="說明"
              example="掃描工具後選門牌與預計歸還日並送出。"
              value={f.description}
              onChange={(v) => setFeature(f.id, { description: v })}
              multiline
              rows={2}
            />
            <div className="grid-2">
              <div className="field">
                <fieldset>
                  <legend>範圍</legend>
                  <div className="choice-row">
                    {(['v1', 'later', 'out'] as FeatureScope[]).map((s) => (
                      <label key={s}>
                        <input type="radio" name={`feature-${f.id}-scope`} checked={f.scope === s} onChange={() => setFeature(f.id, { scope: s })} />
                        {SCOPE_LABEL[s]}
                      </label>
                    ))}
                  </div>
                </fieldset>
              </div>
              <div className="field">
                <label htmlFor={`feature-${f.id}-priority`}>優先級</label>
                <select id={`feature-${f.id}-priority`} value={f.priority} onChange={(e) => setFeature(f.id, { priority: e.target.value as FeaturePriority })}>
                  {(['high', 'medium', 'low'] as FeaturePriority[]).map((v) => (
                    <option key={v} value={v}>
                      {PRIORITY_LABEL[v]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {p.flows.length > 0 && (
              <div className="field">
                <fieldset>
                  <legend>
                    相關流程<span className="opt">選填</span>
                  </legend>
                  <div className="choice-row">
                    {p.flows.map((fl) => (
                      <label key={fl.id}>
                        <input
                          type="checkbox"
                          checked={f.flowIds.includes(fl.id)}
                          onChange={(e) =>
                            setFeature(f.id, {
                              flowIds: e.target.checked ? [...f.flowIds, fl.id] : f.flowIds.filter((x) => x !== fl.id),
                            })
                          }
                        />
                        {fl.id} {fl.title || '（未命名）'}
                      </label>
                    ))}
                  </div>
                </fieldset>
              </div>
            )}
          </div>
        );
      })}
      <button type="button" className="btn" id="features-add" onClick={add}>
        ＋ 新增功能
      </button>
      {confirmEl}
    </>
  );
}

// ---------------- 5. 規則與資料 ----------------

function RulesStep({ p, update }: StepProps) {
  const r = p.rules;
  const setRules = (patch: Partial<Project['rules']>) => update((x) => ({ ...x, rules: { ...x.rules, ...patch } }));
  const addRule = () =>
    update((x) => {
      const { id, counters } = allocateId(x.counters, 'rule');
      return { ...x, counters, rules: { ...x.rules, businessRules: [...x.rules.businessRules, { id, text: '', status: 'confirmed' as const }] } };
    });
  const addRole = () =>
    update((x) => {
      const { id, counters } = allocateId(x.counters, 'role');
      return { ...x, counters, rules: { ...x.rules, roles: [...x.rules.roles, { id, name: '', permissions: '' }] } };
    });
  return (
    <>
      <p>寫下必須遵守的規則、會用到的資料與誰能做什麼。不確定的可以標記「尚未決定」，不會被當成已確認的規則。</p>
      <h3>重要規則</h3>
      <p className="hint">例：每戶同時最多借 2 件工具；超過 7 天未還算逾期。</p>
      {r.businessRules.map((rule) => (
        <div className="item-card" key={rule.id}>
          <div className="item-head">
            <span className="id-chip">{rule.id}</span>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              style={{ color: 'var(--danger)' }}
              onClick={() => setRules({ businessRules: r.businessRules.filter((x) => x.id !== rule.id) })}
            >
              刪除
            </button>
          </div>
          <TextField
            id={`rule-${rule.id}-text`}
            label="規則內容"
            value={rule.text}
            onChange={(v) => setRules({ businessRules: r.businessRules.map((x) => (x.id === rule.id ? { ...x, text: v } : x)) })}
            multiline
            rows={2}
          />
          <div className="choice-row" role="radiogroup" aria-label={`${rule.id} 狀態`}>
            {(
              [
                ['confirmed', '已確認'],
                ['undecided', '尚未決定'],
              ] as const
            ).map(([v, l]) => (
              <label key={v}>
                <input
                  type="radio"
                  name={`rule-${rule.id}-status`}
                  checked={rule.status === v}
                  onChange={() => setRules({ businessRules: r.businessRules.map((x) => (x.id === rule.id ? { ...x, status: v } : x)) })}
                />
                {l}
              </label>
            ))}
          </div>
        </div>
      ))}
      <button type="button" className="btn" style={{ marginBottom: 24 }} onClick={addRule}>
        ＋ 新增規則
      </button>

      <AnswerField
        id="rules-dataConcepts"
        label="會記錄哪些主要資料？各有哪些欄位？"
        why="資料結構影響畫面、儲存方式與匯出。用日常語言描述即可，不需要技術術語。"
        example={'工具：名稱、編號、狀態\n借用紀錄：工具、門牌、借出日、預計歸還日'}
        value={r.dataConcepts}
        onChange={(v) => setRules({ dataConcepts: v })}
        rows={4}
      />

      <h3>使用角色與權限</h3>
      <p className="hint">如果不同的人能做的事不一樣，請列出角色並說明各自可以與不可以做什麼。只有一種使用者可以留空。</p>
      {r.roles.map((role) => (
        <div className="item-card" key={role.id}>
          <div className="item-head">
            <span className="id-chip">{role.id}</span>
            <button type="button" className="btn btn-sm btn-ghost" style={{ color: 'var(--danger)' }} onClick={() => setRules({ roles: r.roles.filter((x) => x.id !== role.id) })}>
              刪除
            </button>
          </div>
          <div className="grid-2">
            <TextField
              id={`role-${role.id}-name`}
              label="角色名稱"
              example="管理員"
              value={role.name}
              onChange={(v) => setRules({ roles: r.roles.map((x) => (x.id === role.id ? { ...x, name: v } : x)) })}
            />
            <TextField
              id={`role-${role.id}-permissions`}
              label="可以做什麼、不能做什麼"
              example="可看全部紀錄；不能刪除紀錄"
              value={role.permissions}
              onChange={(v) => setRules({ roles: r.roles.map((x) => (x.id === role.id ? { ...x, permissions: v } : x)) })}
              multiline
              rows={2}
            />
          </div>
        </div>
      ))}
      <button type="button" className="btn" style={{ marginBottom: 24 }} onClick={addRole}>
        ＋ 新增角色
      </button>

      <AnswerField
        id="rules-accessNotes"
        label="其他存取限制"
        why="例如資料能不能被外人看到、是否需要登入。"
        example="不需要登入，但只能在社區網路內使用。"
        value={r.accessNotes}
        onChange={(v) => setRules({ accessNotes: v })}
        rows={2}
      />
      <AnswerField
        id="rules-edgeCases"
        label="可能出錯或特殊的情況"
        why="錯誤與例外最容易被遺漏，寫下來 AI 才會處理與測試。"
        example={'同一工具已借出時不可再借\n網路斷線時要顯示「尚未送出」'}
        value={r.edgeCases}
        onChange={(v) => setRules({ edgeCases: v })}
        rows={4}
      />
    </>
  );
}

// ---------------- 6. UI 與技術限制 ----------------

function TechStep({ p, update }: StepProps) {
  const t = p.tech;
  const set = (patch: Partial<Project['tech']>) => update((x) => ({ ...x, tech: { ...x.tech, ...patch } }));
  const addRef = () =>
    update((x) => {
      const { id, counters } = allocateId(x.counters, 'reference');
      return { ...x, counters, tech: { ...x.tech, references: [...x.tech.references, { id, url: '', note: '' }] } };
    });
  return (
    <>
      <div className="field">
        <fieldset>
          <legend>
            主要在哪些裝置上使用？<span className="opt">選填</span>
          </legend>
          <p className="why">決定版面與操作方式的優先順序。</p>
          <div className="choice-row">
            {(['desktop', 'mobile', 'tablet'] as Device[]).map((d) => (
              <label key={d}>
                <input
                  type="checkbox"
                  checked={t.devices.includes(d)}
                  onChange={(e) => set({ devices: e.target.checked ? [...t.devices, d] : t.devices.filter((x) => x !== d) })}
                />
                {DEVICE_LABEL[d]}
              </label>
            ))}
          </div>
        </fieldset>
      </div>
      <TextField id="tech-language" label="介面語言" example="繁體中文" value={t.language} onChange={(v) => set({ language: v })} />
      <AnswerField
        id="tech-style"
        label="希望的介面風格"
        why="例如給長輩用需要大字，給工程師用可以資訊密集。"
        example="簡單、大字、按鈕清楚。"
        value={t.style}
        onChange={(v) => set({ style: v })}
        rows={2}
      />
      <h3>參考連結</h3>
      <p className="hint">喜歡的網站或設計參考。只接受 http:// 或 https:// 網址；本網站不會開啟或讀取這些連結的內容。</p>
      {t.references.map((ref) => {
        const err = ref.url.trim() && !isSafeHttpUrl(ref.url) ? '只接受 http:// 或 https:// 開頭的網址。' : null;
        return (
          <div className="item-card" key={ref.id}>
            <div className="item-head">
              <span className="id-chip">{ref.id}</span>
              <button type="button" className="btn btn-sm btn-ghost" style={{ color: 'var(--danger)' }} onClick={() => set({ references: t.references.filter((x) => x.id !== ref.id) })}>
                刪除
              </button>
            </div>
            <div className="grid-2">
              <TextField
                id={`ref-${ref.id}-url`}
                label="網址"
                type="url"
                value={ref.url}
                error={err}
                onChange={(v) => set({ references: t.references.map((x) => (x.id === ref.id ? { ...x, url: v } : x)) })}
              />
              <TextField
                id={`ref-${ref.id}-note`}
                label="參考什麼"
                example="按鈕大小與配色"
                value={ref.note}
                onChange={(v) => set({ references: t.references.map((x) => (x.id === ref.id ? { ...x, note: v } : x)) })}
              />
            </div>
          </div>
        );
      })}
      <button type="button" className="btn" style={{ marginBottom: 24 }} onClick={addRef}>
        ＋ 新增參考連結
      </button>

      <h3>技術與環境</h3>
      <p className="hint">不懂技術沒關係：選「希望 AI 提案」，文件會要求 AI 先提出選項，經你確認後才開始做，不會自行決定。</p>
      <AnswerField
        id="tech-stack"
        label="已經選定的技術"
        why="若已有指定（公司規定、既有專案），AI 必須沿用。"
        example="Python + FastAPI；前端用 React。"
        value={t.stack}
        onChange={(v) => set({ stack: v })}
        rows={2}
      />
      <AnswerField
        id="tech-deployment"
        label="要放在哪裡執行？"
        why="影響架構、費用與維護方式。"
        example="公司內部的 Windows 電腦；或免費的靜態網站空間。"
        value={t.deployment}
        onChange={(v) => set({ deployment: v })}
        rows={2}
      />
      <div className="grid-2">
        <AnswerField id="tech-budget" label="預算限制" example="每月不超過 300 元" value={t.budget} onChange={(v) => set({ budget: v })} rows={2} allowAI={false} />
        <AnswerField id="tech-deadline" label="期限" example="下個月底前可試用" value={t.deadline} onChange={(v) => set({ deadline: v })} rows={2} allowAI={false} />
      </div>
      <AnswerField
        id="tech-externalServices"
        label="外部服務限制"
        why="例如不能用需要信用卡的服務、資料不能離開公司。"
        example="不使用需要綁定信用卡的服務。"
        value={t.externalServices}
        onChange={(v) => set({ externalServices: v })}
        rows={2}
        allowAI={false}
      />
    </>
  );
}

// ---------------- 7. 驗收 ----------------

function AcceptanceStep({ p, update }: StepProps) {
  const add = (featureId: string, kind: AcceptanceKind) =>
    update((x) => {
      const { id, counters } = allocateId(x.counters, 'acceptance');
      return { ...x, counters, acceptance: [...x.acceptance, { id, featureId, kind, scenario: '', action: '', expected: '' }] };
    });
  const setAc = (id: string, patch: Partial<Project['acceptance'][number]>) =>
    update((x) => ({ ...x, acceptance: x.acceptance.map((a) => (a.id === id ? { ...a, ...patch } : a)) }));
  const remove = (id: string) => update((x) => ({ ...x, acceptance: x.acceptance.filter((a) => a.id !== id) }));
  const features = [...p.features.filter((f) => f.scope === 'v1'), ...p.features.filter((f) => f.scope === 'later')];
  const orphans = p.acceptance.filter((a) => !p.features.some((f) => f.id === a.featureId));
  const hasRoles = p.rules.roles.filter((r) => r.name.trim()).length >= 2;

  const acCard = (a: Project['acceptance'][number]) => (
    <div className="item-card" key={a.id} data-testid={`ac-${a.id}`}>
      <div className="item-head">
        <span className="row">
          <span className="id-chip">{a.id}</span>
          <label htmlFor={`ac-${a.id}-kind`} className="visually-hidden">
            案例類型
          </label>
          <select id={`ac-${a.id}-kind`} value={a.kind} onChange={(e) => setAc(a.id, { kind: e.target.value as AcceptanceKind })} style={{ width: 'auto' }}>
            {(['normal', 'failure', 'permission'] as AcceptanceKind[]).map((k) => (
              <option key={k} value={k}>
                {ACCEPTANCE_KIND_LABEL[k]}案例
              </option>
            ))}
          </select>
        </span>
        <button type="button" className="btn btn-sm btn-ghost" style={{ color: 'var(--danger)' }} onClick={() => remove(a.id)}>
          刪除
        </button>
      </div>
      <div className="grid-3">
        <TextField id={`ac-${a.id}-scenario`} label="情境（在什麼狀況下）" example="工具已被借出" value={a.scenario} onChange={(v) => setAc(a.id, { scenario: v })} multiline rows={2} />
        <TextField id={`ac-${a.id}-action`} label="操作（使用者做什麼）" example="嘗試再次借用" value={a.action} onChange={(v) => setAc(a.id, { action: v })} multiline rows={2} />
        <TextField id={`ac-${a.id}-expected`} label="預期結果（應該看到什麼）" example="顯示「此工具已借出」" value={a.expected} onChange={(v) => setAc(a.id, { expected: v })} multiline rows={2} />
      </div>
    </div>
  );

  return (
    <>
      <p>為每個功能寫下「情境、操作、預期結果」，這就是判斷完成與否的標準。建議每個功能至少有一個正常案例與一個失敗案例；有多種角色時再加權限案例。</p>
      <ExampleBox>
        <p>
          <strong>正常：</strong>工具可借用 → 送出登記 → 顯示成功
          <br />
          <strong>失敗：</strong>工具已借出 → 再次借用 → 顯示「此工具已借出」，不建立紀錄
          <br />
          <strong>權限：</strong>住戶身分 → 開啟逾期清單 → 顯示沒有權限
        </p>
      </ExampleBox>
      <div id="acceptance-section" tabIndex={-1}>
        {features.length === 0 && <p className="muted">請先在「功能與範圍」新增功能。</p>}
        {features.map((f) => {
          const acs = p.acceptance.filter((a) => a.featureId === f.id);
          return (
            <section key={f.id} id={`ac-feature-${f.id}`} tabIndex={-1} aria-labelledby={`ac-feature-${f.id}-title`} style={{ marginBottom: 24 }}>
              <h3 id={`ac-feature-${f.id}-title`}>
                <span className="id-chip">{f.id}</span> {f.title || '（未命名功能）'} <span className="badge">{SCOPE_LABEL[f.scope]}</span>
              </h3>
              {acs.length === 0 && f.scope === 'v1' && <p className="field-error">此功能還沒有驗收條件。</p>}
              {acs.map(acCard)}
              <div className="row">
                <button type="button" className="btn btn-sm" onClick={() => add(f.id, 'normal')}>
                  ＋ 正常案例
                </button>
                <button type="button" className="btn btn-sm" onClick={() => add(f.id, 'failure')}>
                  ＋ 失敗案例
                </button>
                {hasRoles && (
                  <button type="button" className="btn btn-sm" onClick={() => add(f.id, 'permission')}>
                    ＋ 權限案例
                  </button>
                )}
              </div>
            </section>
          );
        })}
      </div>
      {orphans.length > 0 && (
        <section style={{ marginBottom: 24 }}>
          <h3>對應功能已不存在的驗收條件</h3>
          {orphans.map((a) => (
            <div key={a.id}>
              <div className="field">
                <label htmlFor={`ac-${a.id}-feature`}>{a.id} 改為對應功能</label>
                <select id={`ac-${a.id}-feature`} value="" onChange={(e) => e.target.value && setAc(a.id, { featureId: e.target.value })}>
                  <option value="">選擇功能…</option>
                  {p.features.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.id} {f.title}
                    </option>
                  ))}
                </select>
              </div>
              {acCard(a)}
            </div>
          ))}
        </section>
      )}

      <h3>測試方式</h3>
      <AnswerField
        id="testing-commands"
        label="已知的測試命令"
        why="若不知道，選「尚未決定」，文件會要求開發工具先辨識或提出建立方式。"
        example="npm test；pytest"
        value={p.testing.commands}
        onChange={(v) => update((x) => ({ ...x, testing: { ...x.testing, commands: v } }))}
        rows={2}
        allowAI={false}
      />
      <div className="field">
        <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center', fontWeight: 400 }}>
          <input
            type="checkbox"
            checked={p.testing.usesLLM}
            onChange={(e) => update((x) => ({ ...x, testing: { ...x.testing, usesLLM: e.target.checked } }))}
            style={{ width: 'auto' }}
          />
          這個產品本身會呼叫 AI 模型（例如自動摘要、聊天回覆）
        </label>
      </div>
      {p.testing.usesLLM && (
        <TextField
          id="testing-llmQuality"
          label="如何判斷 AI 回答的品質？"
          why="AI 的輸出每次可能不同，需要事先定義用哪些範例檢查、怎樣算不合格。"
          example="準備 20 題常見問題，回答不得捏造價格；無法回答時要說不知道。"
          value={p.testing.llmQuality}
          onChange={(v) => update((x) => ({ ...x, testing: { ...x.testing, llmQuality: v } }))}
          multiline
          rows={3}
        />
      )}
    </>
  );
}

// ---------------- 8. AI 工作與人工決策 ----------------

function AiStep({ p, update }: StepProps) {
  const a = p.aiWork;
  const set = (patch: Partial<Project['aiWork']>) => update((x) => ({ ...x, aiWork: { ...x.aiWork, ...patch } }));
  return (
    <>
      <div className="field">
        <fieldset>
          <legend id="ai-preferredTool-label">
            主要使用哪個開發工具？<span className="opt">選填</span>
          </legend>
          <p className="why">決定文件包包含哪些入口檔，以及 Prompt 預設引用的檔案。模型名稱不在這裡設定。</p>
          <div className="choice-row" id="ai-preferredTool">
            {(['codex', 'claude_code', 'both'] as ToolPreference[]).map((v) => (
              <label key={v}>
                <input type="radio" name="ai-tool" checked={a.preferredTool === v} onChange={() => set({ preferredTool: v })} />
                {TOOL_PREF_LABEL[v]}
              </label>
            ))}
          </div>
        </fieldset>
      </div>
      <TextField
        id="ai-autonomy"
        label="哪些事情可以讓 AI 自己處理？"
        why="明確授權範圍，減少 AI 反覆詢問或越權。"
        example="畫面實作、測試撰寫、文字調整。"
        value={a.autonomy}
        onChange={(v) => set({ autonomy: v })}
        multiline
        rows={2}
      />
      <TextField
        id="ai-needsDecision"
        label="哪些事情一定要先問你？"
        why="這些事項 AI 需提出選項並等待你決定。"
        example="新增付費服務、改變資料格式、刪除資料。"
        value={a.needsDecision}
        onChange={(v) => set({ needsDecision: v })}
        multiline
        rows={2}
      />
      <TextField id="ai-currentStatus" label="目前狀況" example="需求整理中，尚未開始開發。" value={a.currentStatus} onChange={(v) => set({ currentStatus: v })} multiline rows={2} />
      <TextField id="ai-knownIssues" label="已知問題" example="手機上表格會超出畫面。" value={a.knownIssues} onChange={(v) => set({ knownIssues: v })} multiline rows={2} />
      <TextField id="ai-nextStep" label="你希望的下一步" example="請 AI 提出技術方案，確認後再開始實作 F-001。" value={a.nextStep} onChange={(v) => set({ nextStep: v })} multiline rows={2} />
    </>
  );
}
