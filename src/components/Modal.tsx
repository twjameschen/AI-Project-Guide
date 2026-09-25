import { useEffect, useRef, type ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  actions: ReactNode;
  testId?: string;
}

/** 以原生 <dialog> 實作：showModal 提供焦點限制、Esc 關閉與背景不可操作。 */
export function Modal({ open, title, onClose, children, actions, testId }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby={testId ? `${testId}-title` : undefined}
      data-testid={testId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      {open && (
        <>
          <div className="modal-body">
            <h2 id={testId ? `${testId}-title` : undefined}>{title}</h2>
            {children}
          </div>
          <div className="modal-actions">{actions}</div>
        </>
      )}
    </dialog>
  );
}
