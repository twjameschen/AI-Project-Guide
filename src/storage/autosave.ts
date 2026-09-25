export type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

export interface SaveState {
  status: SaveStatus;
  lastSavedAt: string | null;
  error: string | null;
}

/**
 * 自動保存控制器：欄位變更後延遲保存；保存中又有新變更時，完成後再保存最新值。
 * 保存失敗時狀態為 error，並保留待保存的值，可重試；不會把失敗顯示成成功。
 */
export class Autosaver<T> {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pendingValue: T | null = null;
  private hasPending = false;
  private inflight: Promise<void> | null = null;
  private state: SaveState = { status: 'idle', lastSavedAt: null, error: null };
  private disposed = false;

  private readonly save: (value: T) => Promise<unknown>;
  private readonly onState: (s: SaveState) => void;
  private readonly delayMs: number;
  private readonly now: () => string;

  constructor(opts: {
    save: (value: T) => Promise<unknown>;
    onState: (s: SaveState) => void;
    delayMs?: number;
    now?: () => string;
  }) {
    this.save = opts.save;
    this.onState = opts.onState;
    this.delayMs = opts.delayMs ?? 600;
    this.now = opts.now ?? (() => new Date().toISOString());
  }

  getState(): SaveState {
    return this.state;
  }

  get dirty(): boolean {
    return this.hasPending || this.state.status === 'saving';
  }

  private set(s: Partial<SaveState>) {
    this.state = { ...this.state, ...s };
    if (!this.disposed) this.onState(this.state);
  }

  schedule(value: T) {
    this.pendingValue = value;
    this.hasPending = true;
    if (this.state.status !== 'saving') this.set({ status: 'pending' });
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, this.delayMs);
  }

  /** 立即保存目前待保存的值（切換頁面、離開前呼叫）。 */
  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.inflight) {
      await this.inflight;
      if (this.hasPending && this.state.status !== 'error') return this.flush();
      return;
    }
    if (!this.hasPending) return;
    const value = this.pendingValue as T;
    this.hasPending = false;
    this.set({ status: 'saving' });
    this.inflight = (async () => {
      try {
        await this.save(value);
        if (this.hasPending) {
          this.set({ status: 'pending', lastSavedAt: this.now(), error: null });
        } else {
          this.set({ status: 'saved', lastSavedAt: this.now(), error: null });
        }
      } catch (e) {
        // 保存失敗：保留值以便重試（若之後沒有更新的值）。
        if (!this.hasPending) {
          this.pendingValue = value;
          this.hasPending = true;
        }
        this.set({ status: 'error', error: e instanceof Error ? e.message : String(e) });
      } finally {
        this.inflight = null;
      }
    })();
    await this.inflight;
    if (this.hasPending && this.state.status === 'pending') {
      await this.flush();
    }
  }

  retry(): Promise<void> {
    return this.flush();
  }

  dispose() {
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
  }
}
