import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Logo } from '../components/Logo';

/** Marco de las pantallas de inicio de sesión y registro. */
export function AuthLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 py-12 font-sans text-ink dark:bg-night dark:text-white">
      <Link to="/" className="mb-8 rounded focus-visible:outline-2 focus-visible:outline-brand">
        <Logo className="h-auto w-44" />
      </Link>
      <section className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/5">
        <h1 className="mb-6 text-2xl font-bold">{title}</h1>
        {children}
      </section>
    </main>
  );
}
