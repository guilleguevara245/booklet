import { type FormEvent, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import type { MeResponse } from '@booklet/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Field, FormError } from '../components/ui';
import { meKey, useLogin } from '../lib/auth';
import { AuthLayout } from './AuthLayout';

export function LoginPage() {
  const login = useLogin();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // Si llegó desde otra página, vuelve ahí. Si no: quien administra un negocio va al panel
  // y quien solo reserva, a sus turnos.
  const from = (location.state as { from?: string } | null)?.from;
  const queryClient = useQueryClient();

  function submit(e: FormEvent) {
    e.preventDefault();
    login.mutate(
      { email, password },
      {
        onSuccess: () => {
          const me = queryClient.getQueryData<MeResponse | null>(meKey);
          const fallback = me?.memberships.length ? '/panel' : '/mis-turnos';
          navigate(from ?? fallback, { replace: true });
        },
      },
    );
  }

  return (
    <AuthLayout title="Entrar">
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <FormError>{login.error?.message}</FormError>
        <Field
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={login.error?.field('email')}
        />
        <Field
          label="Contraseña"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Button type="submit" disabled={login.isPending}>
          {login.isPending ? 'Entrando…' : 'Entrar'}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted dark:text-slate-300">
        ¿No tenés cuenta?{' '}
        <Link to="/registro" className="font-medium text-brand-dark underline dark:text-violet-300">
          Creá una
        </Link>
      </p>
    </AuthLayout>
  );
}
