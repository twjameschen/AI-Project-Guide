import { useState } from 'react';
import { useToast } from '../app/toast';
import { copyText } from '../lib/clipboard';
import { Modal } from './Modal';

/** 複製按鈕：成功／失敗都有提示；API 不可用時開啟手動複製視窗並預先選取文字。 */
export function CopyButton({ text, label, className = 'btn', testId }: { text: string; label: string; className?: string; testId?: string }) {
  const notify = useToast();
  const [manual, setManual] = useState(false);
  return (
    <>
      <button
        type="button"
        className={className}
        data-testid={testId}
        onClick={async () => {
          const ok = await copyText(text);
          if (ok) notify('success', '已複製到剪貼簿。');
          else {
            notify('error', '無法自動複製（瀏覽器不允許），已開啟手動複製視窗。');
            setManual(true);
          }
        }}
      >
        {label}
      </button>
      <Modal
        open={manual}
        title="手動複製"
        onClose={() => setManual(false)}
        testId="manual-copy"
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setManual(false)}>
            完成
          </button>
        }
      >
        <p className="small">瀏覽器不允許自動複製。文字已全選，請按 Ctrl+C（Mac：⌘+C）複製。</p>
        <label className="visually-hidden" htmlFor="manual-copy-text">
          要複製的文字
        </label>
        <textarea
          id="manual-copy-text"
          readOnly
          value={text}
          rows={12}
          autoFocus
          onFocus={(e) => e.currentTarget.select()}
        />
      </Modal>
    </>
  );
}
