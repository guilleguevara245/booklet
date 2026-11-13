import { useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useVerifyEmail } from '../lib/auth';
import { AuthLayout } from './AuthLayout';

/** Destino del link del mail de verificación. */
export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const verify = useVerifyEmail();
  const started = useRef(false);

  useEffect(() => {
    // Una sola vez, aunque React monte el efecto dos veces en desarrollo.
    if (token && !started.current) {
      started.current = true;
      verify.mutate(token);
    }
  }, [token, verify]);

  return (
    <AuthLayout title="Confirmar email">
      {!token || verify.isError ? (
        <p role="alert">
          {verify.error?.message ?? 'Al link le falta una parte. Abrilo de nuevo desde el mail.'}
        </p>
      ) : verify.isSuccess ? (
        <div role="status" className="flex flex-col gap-4">
          <p>¡Listo! Confirmamos tu email {verify.data.user.email}.</p>
          <Link to="/" className="font-medium text-brand-dark underline dark:text-violet-300">
            Ir a Booklet
          </Link>
        </div>
      ) : (
        <p role="status">Confirmando…</p>
      )}
    </AuthLayout>
  );
}
