import type { ReactNode } from 'react';
import type { Answer, AnswerMode } from '../domain/model';

interface BaseProps {
  id: string;
  label: string;
  required?: boolean;
  why?: string;
  example?: string;
  error?: string | null;
}

function Req({ required }: { required?: boolean }) {
  return required ? <span className="req">必填</span> : <span className="opt">選填</span>;
}

function describedBy(id: string, p: BaseProps) {
  return [p.why ? `${id}-why` : '', p.example ? `${id}-ex` : '', p.error ? `${id}-err` : ''].filter(Boolean).join(' ') || undefined;
}

export function TextField(
  props: BaseProps & {
    value: string;
    onChange: (v: string) => void;
    multiline?: boolean;
    rows?: number;
    type?: 'text' | 'url';
    placeholder?: string;
    maxLength?: number;
  },
) {
  const { id, label, why, example, error, value, onChange, multiline, rows = 3, type = 'text', placeholder, maxLength } = props;
  const common = {
    id,
    value,
    placeholder,
    maxLength: maxLength ?? (multiline ? 20000 : 500),
    'aria-describedby': describedBy(id, props),
    'aria-invalid': error ? true : undefined,
    'aria-required': props.required || undefined,
  } as const;
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        <Req required={props.required} />
      </label>
      {why && (
        <p className="why" id={`${id}-why`}>
          為什麼需要：{why}
        </p>
      )}
      {multiline ? (
        <textarea {...common} rows={rows} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input {...common} type={type} onChange={(e) => onChange(e.target.value)} />
      )}
      {error && (
        <p className="field-error" id={`${id}-err`} role="alert">
          {error}
        </p>
      )}
      {example && (
        <p className="example" id={`${id}-ex`}>
          例：{example}
        </p>
      )}
    </div>
  );
}

const MODE_OPTIONS: { value: AnswerMode; label: string }[] = [
  { value: 'answer', label: '填寫' },
  { value: 'undecided', label: '尚未決定' },
  { value: 'ai_propose', label: '希望 AI 提案' },
];

/** 三態欄位：填寫／尚未決定／希望 AI 提案。未決時文字框改為備註，不會被當成已確認內容。 */
export function AnswerField(
  props: BaseProps & {
    value: Answer;
    onChange: (v: Answer) => void;
    rows?: number;
    allowAI?: boolean;
    allowUndecided?: boolean;
  },
) {
  const { id, label, why, example, value, onChange, rows = 3, allowAI = true, allowUndecided = true } = props;
  const options = MODE_OPTIONS.filter(
    (o) => o.value === 'answer' || (o.value === 'undecided' && allowUndecided) || (o.value === 'ai_propose' && allowAI),
  );
  const isOpen = value.mode !== 'answer';
  return (
    <div className="field" id={`${id}-wrap`}>
      <fieldset>
        <legend>
          {label}
          <Req required={props.required} />
        </legend>
        {why && (
          <p className="why" id={`${id}-why`}>
            為什麼需要：{why}
          </p>
        )}
        {options.length > 1 && (
          <div className="choice-row" role="radiogroup" aria-label={`${label}的填寫方式`}>
            {options.map((o) => (
              <label key={o.value}>
                <input
                  type="radio"
                  name={`${id}-mode`}
                  value={o.value}
                  checked={value.mode === o.value}
                  onChange={() => onChange({ ...value, mode: o.value })}
                />
                {o.label}
              </label>
            ))}
          </div>
        )}
        {isOpen && (
          <p className="mode-note">
            {value.mode === 'ai_propose'
              ? '將標示為「待決定・希望 AI 提案」：AI 需提出選項並經你確認，不會被當成已確認內容。'
              : '將標示為「待決定」，匯出時列為需要釐清的問題。'}
          </p>
        )}
        <label htmlFor={id} className={isOpen ? 'small' : 'visually-hidden'}>
          {isOpen ? '備註（選填，例如目前的考量）' : label}
        </label>
        <textarea
          id={id}
          rows={rows}
          value={value.text}
          maxLength={20000}
          aria-describedby={describedBy(id, props)}
          onChange={(e) => onChange({ ...value, text: e.target.value })}
        />
        {example && (
          <p className="example" id={`${id}-ex`}>
            例：{example}
          </p>
        )}
      </fieldset>
    </div>
  );
}

export function ExampleBox({ title = '範例', children }: { title?: string; children: ReactNode }) {
  return (
    <div className="example-box">
      <p>
        <strong>{title}</strong>
      </p>
      {children}
    </div>
  );
}
