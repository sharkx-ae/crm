'use client';

import { createContext, type ReactNode, useContext, useId } from 'react';

type FieldA11y = { id: string; describedBy: string | undefined; invalid: boolean };
const FieldContext = createContext<FieldA11y | null>(null);

type Own = {
  id?: string | undefined;
  'aria-describedby'?: string | undefined;
  'aria-invalid'?: boolean | 'true' | 'false' | 'grammar' | 'spelling' | undefined;
};

/**
 * What a control inside a <Field> gets for free: the id its label points at, aria-describedby for the hint and
 * the error, and aria-invalid. Props set on the control itself win. Outside a Field it passes the props through.
 */
export function useControlA11y(own: Own) {
  const field = useContext(FieldContext);
  const describedBy = [own['aria-describedby'], field?.describedBy].filter(Boolean).join(' ');
  return {
    id: own.id ?? field?.id,
    'aria-describedby': describedBy || undefined,
    'aria-invalid': own['aria-invalid'] ?? (field?.invalid ? true : undefined),
  };
}

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  /** Use when the control has its own id; otherwise the Field generates one. */
  htmlFor?: string;
  children: ReactNode;
}) {
  const generated = useId();
  const id = htmlFor ?? generated;
  const hintId = hint ? `${id}-hint` : null;
  const errorId = error ? `${id}-error` : null;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <FieldContext.Provider value={{ id, describedBy, invalid: Boolean(error) }}>
      <div className="flex min-w-0 flex-col gap-1.5">
        <label htmlFor={id} className="font-label text-label">
          {label}
        </label>
        {children}
        {hint ? (
          <p id={hintId ?? undefined} className="text-label text-sx-muted">
            {hint}
          </p>
        ) : null}
        {error ? (
          <p id={errorId ?? undefined} role="alert" className="font-heading text-label text-sx-bad">
            {error}
          </p>
        ) : null}
      </div>
    </FieldContext.Provider>
  );
}
