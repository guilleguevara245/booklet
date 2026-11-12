import { ApiStatus } from './ApiStatus';
import logoDark from './logo-dark.svg';
import logo from './logo.svg';

export function App() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-10 bg-white px-6 py-16 text-center font-sans text-ink dark:bg-night dark:text-white">
      <div className="flex flex-col items-center gap-5">
        <h1>
          <picture>
            <source srcSet={logoDark} media="(prefers-color-scheme: dark)" />
            <img
              src={logo}
              alt="Booklet"
              width={500}
              height={168}
              className="h-auto w-72 sm:w-96"
            />
          </picture>
        </h1>
        <p className="text-2xl font-medium text-muted dark:text-slate-300">
          Tu agenda, siempre al día.
        </p>
        <p className="max-w-md text-base text-muted dark:text-slate-300">
          Turnos online para cualquier negocio. En construcción.
        </p>
      </div>
      <ApiStatus />
    </main>
  );
}
