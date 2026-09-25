import type { Project } from './model';

type CounterKey = keyof Project['counters'];

const PREFIX: Record<CounterKey, string> = {
  flow: 'FL',
  feature: 'F',
  rule: 'R',
  role: 'RO',
  acceptance: 'AC',
  reference: 'REF',
};

/**
 * 配發穩定 ID：計數器只增不減，刪除或排序都不會重用或改變既有 ID。
 * 回傳新的 counters 與 ID，不修改傳入物件。
 */
export function allocateId(
  counters: Project['counters'],
  key: CounterKey,
): { id: string; counters: Project['counters'] } {
  const next = counters[key] + 1;
  return {
    id: `${PREFIX[key]}-${String(next).padStart(3, '0')}`,
    counters: { ...counters, [key]: next },
  };
}

/** 產生隨機 UUID；非安全環境（無 randomUUID）時以 getRandomValues 退回。 */
export function newUuid(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  const bytes = new Uint8Array(16);
  c.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
