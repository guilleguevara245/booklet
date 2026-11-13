import { useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';

// Piezas de formulario accesibles: cada campo tiene su etiqueta y su error asociado.

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
  hint?: string;
};

export function Field({ label, error, hint, ...input }: FieldProps) {
  const id = useId();
  const describedBy = [error && `${id}-error`, hint && `${id}-hint`].filter(Boolean).join(' ');
  return (
    <div className="flex flex-col gap-1.5 text-left">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-base text-ink outline-none focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/30 aria-invalid:border-red-600 dark:border-white/20 dark:bg-white/5 dark:text-white"
        {...input}
      />
      {hint && !error && (
        <p id={`${id}-hint`} className="text-sm text-muted dark:text-slate-300">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger';
};

const VARIANTS = {
  primary: 'bg-brand text-white hover:bg-brand-dark',
  secondary:
    'border border-slate-300 bg-white text-ink hover:bg-slate-50 dark:border-white/20 dark:bg-transparent dark:text-white dark:hover:bg-white/10',
  danger: 'bg-red-700 text-white hover:bg-red-800',
};

export function Button({ variant = 'primary', className = '', ...props }: ButtonProps) {
  return (
    <button
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-60 ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}

/** Aviso de error general de un formulario; los lectores de pantalla lo anuncian al aparecer. */
export function FormError({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <p
      role="alert"
      className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-300"
    >
      {children}
    </p>
  );
}
