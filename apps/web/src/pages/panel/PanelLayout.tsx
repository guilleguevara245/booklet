import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { Logo } from '../../components/Logo';
import { Button } from '../../components/ui';
import { useLogout, useMe } from '../../lib/auth';

/** Encabezado del panel: logo, persona con sesión y salir. */
export function PanelLayout({ children }: { children: ReactNode }) {
  const { data: me } = useMe();
  const logout = useLogout();
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-slate-50 font-sans text-ink dark:bg-night dark:text-white">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 dark:border-white/10 dark:bg-white/5">
        <Link to="/panel" className="rounded focus-visible:outline-2 focus-visible:outline-brand">
          <Logo className="h-auto w-28" />
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted dark:text-slate-300">{me?.user.name}</span>
          <Button
            variant="secondary"
            onClick={() => logout.mutate(undefined, { onSuccess: () => navigate('/') })}
          >
            Salir
          </Button>
        </div>
      </header>
      {children}
    </div>
  );
}
