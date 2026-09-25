import { createContext, useContext, useEffect, useState, type DependencyList } from 'react';
import type { Repo } from '../storage/repo';

export const RepoContext = createContext<Repo | null>(null);

export function useRepo(): Repo {
  const r = useContext(RepoContext);
  if (!r) throw new Error('RepoContext 尚未初始化');
  return r;
}

export type Loadable<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'error'; error: string };

/** 讀取資料並在資料庫變更後自動重新讀取。 */
export function useRepoQuery<T>(load: (repo: Repo) => Promise<T>, deps: DependencyList): Loadable<T> {
  const repo = useRepo();
  const [state, setState] = useState<Loadable<T>>({ status: 'loading' });
  useEffect(() => {
    let alive = true;
    const run = () => {
      load(repo).then(
        (data) => alive && setState({ status: 'ready', data }),
        (e: unknown) => alive && setState({ status: 'error', error: e instanceof Error ? e.message : String(e) }),
      );
    };
    run();
    const unsub = repo.subscribe(run);
    return () => {
      alive = false;
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo, ...deps]);
  return state;
}
