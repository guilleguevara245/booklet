import { useMe, useResendVerification } from '../lib/auth';

/** Aviso para las cuentas con contraseña que todavía no confirmaron su email. */
export function VerifyEmailBanner() {
  const { data: me } = useMe();
  const resend = useResendVerification();
  if (!me || me.user.emailVerified || !me.user.hasPassword) return null;
  return (
    <div
      role="region"
      aria-label="Confirmá tu email"
      className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-100"
    >
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2">
        <p>
          Confirmá tu email: te mandamos un link a <strong>{me.user.email}</strong>.
        </p>
        {resend.isSuccess ? (
          <p role="status">Listo, te lo mandamos de nuevo.</p>
        ) : (
          <button
            type="button"
            onClick={() => resend.mutate()}
            disabled={resend.isPending}
            className="min-h-11 rounded-lg px-3 font-medium underline focus-visible:outline-2 focus-visible:outline-brand"
          >
            {resend.isPending ? 'Mandando…' : 'Mandarlo de nuevo'}
          </button>
        )}
        {resend.error && <p role="alert">{resend.error.message}</p>}
      </div>
    </div>
  );
}
