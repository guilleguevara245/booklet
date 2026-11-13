import type { ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { Logo } from '../../components/Logo';
import { useLogout, useMe } from '../../lib/auth';

const navLink =
  'inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-brand dark:hover:bg-white/10';

/** Marco de las páginas que ven los clientes: reservar y mis turnos. */
export function PublicLayout({ children }: { children: ReactNode }) {
  const { data: me } = useMe();
  const here = useLocation();
  const navigate = useNavigate();
  const logout = useLogout();
  return (
    <div className="flex min-h-screen flex-col bg-slate-50 font-sans text-ink dark:bg-night dark:text-white">
      <header className="border-b border-slate-200 bg-white dark:border-white/10 dark:bg-white/5">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-2">
          <Link to="/" className="rounded focus-visible:outline-2 focus-visible:outline-brand">
            <Logo className="h-auto w-24" />
          </Link>
          <nav aria-label="Cuenta" className="flex items-center gap-1">
            {me ? (
              <>
                <Link to="/mis-turnos" className={navLink}>
                  Mis turnos
                </Link>
                <button
                  type="button"
                  className={navLink}
                  onClick={() => logout.mutate(undefined, { onSuccess: () => navigate('/') })}
                >
                  Salir
                </button>
              </>
            ) : (
              // Después de entrar, vuelve a esta misma página (por ejemplo, a mitad de una reserva).
              <Link to="/entrar" state={{ from: here.pathname + here.search }} className={navLink}>
                Entrar
              </Link>
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:py-10">{children}</main>
      <footer className="py-6 text-center text-xs text-muted dark:text-slate-300">
        Reservas con{' '}
        <Link to="/" className="underline">
          Booklet
        </Link>{' '}
        · Tu agenda, siempre al día.
      </footer>
    </div>
  );
}
