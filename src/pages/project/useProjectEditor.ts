import { useCallback, useEffect, useRef, useState } from 'react';
import { useRepo } from '../../app/repoContext';
import type { Project } from '../../domain/model';
import { nowIso } from '../../domain/time';
import { Autosaver, type SaveState } from '../../storage/autosave';

/**
 * 精靈編輯狀態：本地草稿 + 延遲自動保存。
 * 保存成功後只同步 revision／updatedAt，不覆蓋使用者正在輸入的內容。
 */
export function useProjectEditor(initial: Project) {
  const repo = useRepo();
  const [draft, setDraft] = useState(initial);
  const draftRef = useRef(initial);
  const [saveState, setSaveState] = useState<SaveState>({ status: 'idle', lastSavedAt: null, error: null });
  const [saver] = useState(
    () =>
      new Autosaver<Project>({
        save: async (p) => {
          const saved = await repo.saveProject(p, nowIso());
          setDraft((d) => ({ ...d, revision: saved.revision, updatedAt: saved.updatedAt }));
        },
        onState: setSaveState,
      }),
  );

  // 讓 update() 以最新草稿為基礎（包含保存後同步的 revision）。
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (saver.dirty) {
        void saver.flush();
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      void saver.flush();
    };
  }, [saver]);

  const update = useCallback((fn: (p: Project) => Project) => {
    const next = fn(draftRef.current);
    draftRef.current = next;
    setDraft(next);
    saver.schedule(next);
  }, [saver]);

  /** 只更新本地草稿、不排程保存（用於已另外保存的介面狀態，例如目前步驟）。 */
  const setLocal = useCallback((fn: (p: Project) => Project) => {
    draftRef.current = fn(draftRef.current);
    setDraft(draftRef.current);
  }, []);

  const flush = useCallback(() => saver.flush(), [saver]);
  const retry = useCallback(() => saver.retry(), [saver]);

  return { draft, update, setLocal, saveState, flush, retry };
}
