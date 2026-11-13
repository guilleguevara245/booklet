import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { Button, FormError } from '../components/ui';
import { useAcceptInvitation, useInvitation, useLogout, useMe } from '../lib/auth';
import { AuthLayout } from './AuthLayout';

const ROLE_LABEL = { owner: 'dueño', staff: 'profesional' } as const;
const linkClass = 'font-medium text-brand-dark underline dark:text-violet-300';

/** Destino del link del mail de invitación al equipo: `/invitacion/:token`. */
export function InvitationPage() {
  const { token = '' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const invitation = useInvitation(token);
  const me = useMe();
  const accept = useAcceptInvitation(token);
  const logout = useLogout();
  // Al entrar o crear la cuenta, vuelve a esta misma página.
  const back = { from: location.pathname };

  if (invitation.isPending || me.isPending) {
    return (
      <AuthLayout title="Invitación">
        <p role="status">Cargando…</p>
      </AuthLayout>
    );
  }

  if (invitation.isError) {
    return (
      <AuthLayout title="Invitación">
        <p role="alert">
          {invitation.error.status === 404
            ? 'No encontramos esta invitación. Puede que la hayan cancelado: pedí una nueva.'
            : invitation.error.message}
        </p>
      </AuthLayout>
    );
  }

  const inv = invitation.data;
  const user = me.data?.user;
  const title = `Sumate a ${inv.businessName}`;

  if (inv.status === 'expired') {
    return (
      <AuthLayout title={title}>
        <p role="alert">Esta invitación venció. Pedile a {inv.businessName} que te mande otra.</p>
      </AuthLayout>
    );
  }

  if (inv.status === 'accepted') {
    return (
      <AuthLayout title={title}>
        <p role="status">Esta invitación ya se usó.</p>
        {user && (
          <Link to="/panel" className={linkClass}>
            Ir al panel
          </Link>
        )}
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title={title}>
      <div className="flex flex-col gap-4">
        <p>
          Te invitaron a sumarte al equipo de <strong>{inv.businessName}</strong> como{' '}
          {ROLE_LABEL[inv.role]}. La invitación es para <strong>{inv.email}</strong>.
        </p>

        {!user ? (
          <>
            <p>Para aceptarla, entrá o creá tu cuenta con ese email.</p>
            <div className="flex flex-wrap gap-3">
              <Link
                to="/registro"
                state={back}
                className="inline-flex min-h-11 items-center justify-center rounded-lg bg-brand px-4 font-medium text-white hover:bg-brand-dark"
              >
                Crear cuenta
              </Link>
              <Link to="/entrar" state={back} className={`${linkClass} self-center`}>
                Ya tengo cuenta
              </Link>
            </div>
          </>
        ) : user.email !== inv.email ? (
          <>
            <p role="alert">
              Entraste como {user.email}. Para aceptar, entrá con la cuenta de {inv.email}.
            </p>
            <Button
              variant="secondary"
              disabled={logout.isPending}
              onClick={() =>
                logout.mutate(undefined, {
                  onSuccess: () => navigate('/entrar', { state: back }),
                })
              }
            >
              Entrar con otra cuenta
            </Button>
          </>
        ) : (
          <>
            <FormError>{accept.error?.message}</FormError>
            <Button
              disabled={accept.isPending}
              onClick={() =>
                accept.mutate(undefined, {
                  onSuccess: (m) => navigate(`/panel/${m.businessId}`, { replace: true }),
                })
              }
            >
              {accept.isPending ? 'Aceptando…' : 'Aceptar invitación'}
            </Button>
          </>
        )}
      </div>
    </AuthLayout>
  );
}
