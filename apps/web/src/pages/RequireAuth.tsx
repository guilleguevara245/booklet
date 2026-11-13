import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useMe } from '../lib/auth';

/** Muestra el contenido solo con sesión; si no hay, lleva a /entrar y vuelve después. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { data: me, isPending } = useMe();
  const location = useLocation();
  if (isPending) {
    return (
      <p role="status" className="p-8 text-center font-sans text-muted">
        Cargando…
      </p>
    );
  }
  if (!me) return <Navigate to="/entrar" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}
