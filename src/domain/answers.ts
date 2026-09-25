import type { Answer } from './model';

export type AnswerStatus = 'filled' | 'empty' | 'undecided' | 'ai_propose';

export function answerStatus(a: Answer): AnswerStatus {
  if (a.mode === 'undecided') return 'undecided';
  if (a.mode === 'ai_propose') return 'ai_propose';
  return a.text.trim() ? 'filled' : 'empty';
}

export const isFilled = (a: Answer) => answerStatus(a) === 'filled';
export const isOpen = (a: Answer) => {
  const s = answerStatus(a);
  return s === 'undecided' || s === 'ai_propose';
};
export const hasText = (s: string | null | undefined) => !!s && s.trim().length > 0;
