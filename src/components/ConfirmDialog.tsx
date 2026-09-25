import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Modal } from './Modal';

interface ConfirmOptions {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
}

/** 回傳 confirm(options) → Promise<boolean> 與需渲染的對話框元素。 */
export function useConfirm(): [(o: ConfirmOptions) => Promise<boolean>, ReactNode] {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);
  const confirm = useCallback((o: ConfirmOptions) => {
    setOpts(o);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);
  const close = (v: boolean) => {
    resolver.current?.(v);
    resolver.current = null;
    setOpts(null);
  };
  const el = (
    <Modal
      open={!!opts}
      title={opts?.title ?? ''}
      onClose={() => close(false)}
      testId="confirm-dialog"
      actions={
        <>
          <button type="button" className="btn" onClick={() => close(false)} autoFocus>
            {opts?.cancelLabel ?? '取消'}
          </button>
          <button type="button" className={`btn ${opts?.danger ? 'btn-danger' : 'btn-primary'}`} onClick={() => close(true)}>
            {opts?.confirmLabel}
          </button>
        </>
      }
    >
      {opts?.body}
    </Modal>
  );
  return [confirm, el];
}
