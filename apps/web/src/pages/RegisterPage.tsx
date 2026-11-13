import { PASSWORD_MIN } from '@booklet/shared';
import { type FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button, Field, FormError } from '../components/ui';
import { useRegister } from '../lib/auth';
import { AuthLayout } from './AuthLayout';

export function RegisterPage() {
  const register = useRegister();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  function submit(e: FormEvent) {
    e.preventDefault();
    register.mutate(form, { onSuccess: () => navigate('/panel', { replace: true }) });
  }

  // Los errores por campo se muestran junto a cada campo; el general, arriba.
  const general =
    register.error && register.error.issues.length === 0 ? register.error.message : undefined;

  return (
    <AuthLayout title="Crear cuenta">
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <FormError>{general}</FormError>
        <Field
          label="Nombre"
          autoComplete="name"
          required
          value={form.name}
          onChange={set('name')}
          error={register.error?.field('name')}
        />
        <Field
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={form.email}
          onChange={set('email')}
          error={register.error?.field('email')}
        />
        <Field
          label="Contraseña"
          type="password"
          autoComplete="new-password"
          required
          minLength={PASSWORD_MIN}
          value={form.password}
          onChange={set('password')}
          hint={`Al menos ${PASSWORD_MIN} caracteres.`}
          error={register.error?.field('password')}
        />
        <Button type="submit" disabled={register.isPending}>
          {register.isPending ? 'Creando cuenta…' : 'Crear cuenta'}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted dark:text-slate-300">
        ¿Ya tenés cuenta?{' '}
        <Link to="/entrar" className="font-medium text-brand-dark underline dark:text-violet-300">
          Entrá
        </Link>
      </p>
    </AuthLayout>
  );
}
