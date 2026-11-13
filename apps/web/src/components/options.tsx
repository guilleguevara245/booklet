import type { ReactNode } from 'react';

/** Paso de un formulario: un grupo de opciones con su título. */
export function Step({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-3 text-lg font-bold">{title}</legend>
      {children}
    </fieldset>
  );
}

/** Opción grande, con un radio real adentro: se elige con teclado y la leen los lectores. */
export function OptionCard({
  name,
  value,
  checked,
  onChange,
  children,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label
      className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border bg-white p-4 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand dark:bg-white/5 ${checked ? 'border-brand ring-1 ring-brand' : 'border-slate-200 hover:border-slate-400 dark:border-white/15'}`}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={() => onChange(value)}
        className="mt-1 size-4 accent-brand"
      />
      <span className="flex-1">{children}</span>
    </label>
  );
}
