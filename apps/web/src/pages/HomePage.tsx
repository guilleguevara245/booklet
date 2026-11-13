import { Link } from 'react-router';
import { ApiStatus } from '../ApiStatus';
import { Logo } from '../components/Logo';
import { useMe } from '../lib/auth';

const linkClass =
  'inline-flex min-h-11 items-center rounded-lg px-5 font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand';

export function HomePage() {
  const { data: me } = useMe();
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-10 bg-white px-6 py-16 text-center font-sans text-ink dark:bg-night dark:text-white">
      <div className="flex flex-col items-center gap-5">
        <h1>
          <Logo className="h-auto w-72 sm:w-96" />
        </h1>
        <p className="text-2xl font-medium text-muted dark:text-slate-300">
          Tu agenda, siempre al día.
        </p>
        <p className="max-w-md text-base text-muted dark:text-slate-300">
          Turnos online para cualquier negocio.
        </p>
        <nav aria-label="Cuenta" className="flex flex-wrap justify-center gap-3">
          {me ? (
            <Link to="/panel" className={`${linkClass} bg-brand text-white hover:bg-brand-dark`}>
              Ir al panel
            </Link>
          ) : (
            <>
              <Link to="/entrar" className={`${linkClass} bg-brand text-white hover:bg-brand-dark`}>
                Entrar
              </Link>
              <Link
                to="/registro"
                className={`${linkClass} border border-slate-300 hover:bg-slate-50 dark:border-white/20 dark:hover:bg-white/10`}
              >
                Crear cuenta
              </Link>
            </>
          )}
        </nav>
      </div>
      <ApiStatus />
    </main>
  );
}
